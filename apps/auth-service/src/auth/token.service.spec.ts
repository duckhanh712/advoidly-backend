import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@app/common';
import { buildAppConfig } from '@app/config';
import { UserRole } from '@app/contracts';
import { PrismaService } from '@app/database';
import { hashToken, TokenService } from './token.service';

interface StoredToken {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById?: string | null;
}

/** In-memory stand-in for the refresh_tokens table, supporting the calls TokenService makes. */
function fakePrisma(user: { id: string; email: string; role: UserRole }) {
  const rows: StoredToken[] = [];
  const matches = (row: StoredToken, where: Partial<StoredToken>) =>
    Object.entries(where).every(([k, v]) => row[k as keyof StoredToken] === v);
  const refreshToken = {
    create: jest.fn(async ({ data }: { data: StoredToken }) => {
      rows.push({ ...data, revokedAt: data.revokedAt ?? null });
    }),
    findUnique: jest.fn(async ({ where }: { where: { tokenHash: string } }) => {
      const row = rows.find((r) => r.tokenHash === where.tokenHash);
      return row ? { ...row, user } : null;
    }),
    updateMany: jest.fn(
      async ({ where, data }: { where: Partial<StoredToken>; data: Partial<StoredToken> }) => {
        const hit = rows.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
    ),
  };
  const prisma = {
    refreshToken,
    $transaction: (fn: (tx: unknown) => unknown) => fn({ refreshToken }),
  };
  return { prisma: prisma as unknown as PrismaService, rows };
}

describe('TokenService refresh-token rotation', () => {
  const config = buildAppConfig('auth-service', {
    JWT_ACCESS_SECRET: 'token-test-secret-0123456789abcdef',
    INTERNAL_API_KEY: 'internal-key-123456',
    DATABASE_URL: 'postgresql://unused',
  });
  const jwt = new JwtService({ secret: config.jwt.accessSecret, signOptions: { expiresIn: 900 } });
  const user = { id: 'user-1', email: 'a@example.com', role: UserRole.USER };

  it('stores only a SHA-256 hash of the refresh token', async () => {
    const { prisma, rows } = fakePrisma(user);
    const pair = await new TokenService(prisma, jwt, config).issue(user);
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(hashToken(pair.refreshToken));
    expect(JSON.stringify(rows)).not.toContain(pair.refreshToken);
  });

  it('issues a signed access token with the user claims', async () => {
    const { prisma } = fakePrisma(user);
    const pair = await new TokenService(prisma, jwt, config).issue(user);
    expect(jwt.verify(pair.accessToken)).toMatchObject({
      sub: user.id,
      email: user.email,
      role: UserRole.USER,
    });
    expect(pair.expiresIn).toBe(900);
  });

  it('rotates: the old token is revoked and a new one in the same family is issued', async () => {
    const { prisma, rows } = fakePrisma(user);
    const service = new TokenService(prisma, jwt, config);
    const first = await service.issue(user);
    const second = await service.rotate(first.refreshToken);

    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(rows).toHaveLength(2);
    expect(rows[0].revokedAt).toBeInstanceOf(Date);
    expect(rows[0].replacedById).toBe(rows[1].id);
    expect(rows[1].familyId).toBe(rows[0].familyId);
    expect(rows[1].revokedAt).toBeNull();
  });

  it('detects reuse of a rotated token and revokes the whole family', async () => {
    const { prisma, rows } = fakePrisma(user);
    const service = new TokenService(prisma, jwt, config);
    const first = await service.issue(user);
    await service.rotate(first.refreshToken);

    await expect(service.rotate(first.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });

  it('rejects unknown and expired tokens', async () => {
    const { prisma, rows } = fakePrisma(user);
    const service = new TokenService(prisma, jwt, config);
    await expect(service.rotate('unknown')).rejects.toBeInstanceOf(UnauthorizedException);

    const pair = await service.issue(user);
    rows[0].expiresAt = new Date(Date.now() - 1000);
    await expect(service.rotate(pair.refreshToken)).rejects.toThrow('Refresh token has expired');
  });

  it('logout revokes only the caller’s own token', async () => {
    const { prisma, rows } = fakePrisma(user);
    const service = new TokenService(prisma, jwt, config);
    const pair = await service.issue(user);

    await service.revoke(pair.refreshToken, 'someone-else');
    expect(rows[0].revokedAt).toBeNull();
    await service.revoke(pair.refreshToken, user.id);
    expect(rows[0].revokedAt).toBeInstanceOf(Date);
  });
});
