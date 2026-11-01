import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@app/common';
import { AppConfig, InjectAppConfig } from '@app/config';
import { AccessTokenClaims, UserRole } from '@app/contracts';
import { PrismaService } from '@app/database';
import { TokenPairDto } from './dto/auth.dto';

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/**
 * Access tokens: short-lived HS256 JWTs verified by every service.
 * Refresh tokens: 384-bit random opaque strings; only the SHA-256 hash is stored.
 * Each refresh rotates the token. Presenting an already-rotated (revoked) token is treated
 * as theft and revokes the whole token family, forcing the user to sign in again.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @InjectAppConfig() private readonly config: AppConfig,
  ) {}

  async issue(
    user: Pick<User, 'id' | 'email' | 'role'>,
    familyId: string = randomUUID(),
  ): Promise<TokenPairDto> {
    const { raw, record } = this.newRefreshToken(user.id, familyId);
    await this.prisma.refreshToken.create({ data: record });
    return this.toPair(user, raw, record.expiresAt);
  }

  async rotate(rawRefreshToken: string): Promise<TokenPairDto> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawRefreshToken) },
      include: { user: true },
    });
    if (!existing) throw new UnauthorizedException('Refresh token is invalid');

    if (existing.revokedAt) {
      await this.revokeFamily(existing.familyId);
      this.logger.warn(
        { userId: existing.userId, familyId: existing.familyId },
        'Refresh token reuse detected',
      );
      throw new UnauthorizedException('Refresh token is invalid');
    }
    if (existing.expiresAt <= new Date())
      throw new UnauthorizedException('Refresh token has expired');

    const { raw, record } = this.newRefreshToken(existing.userId, existing.familyId);
    await this.prisma.$transaction(async (tx) => {
      // Conditional update guards against two concurrent refreshes with the same token.
      const revoked = await tx.refreshToken.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: record.id },
      });
      if (revoked.count === 0) throw new UnauthorizedException('Refresh token is invalid');
      await tx.refreshToken.create({ data: record });
    });

    return this.toPair(existing.user, raw, record.expiresAt);
  }

  /** Revokes a refresh token owned by `userId`. Unknown tokens are ignored (idempotent logout). */
  async revoke(rawRefreshToken: string, userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawRefreshToken), userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private newRefreshToken(userId: string, familyId: string) {
    const raw = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000);
    return {
      raw,
      record: { id: randomUUID(), userId, familyId, tokenHash: hashToken(raw), expiresAt },
    };
  }

  private async toPair(
    user: Pick<User, 'id' | 'email' | 'role'>,
    refreshToken: string,
    refreshTokenExpiresAt: Date,
  ): Promise<TokenPairDto> {
    const claims: AccessTokenClaims = {
      sub: user.id,
      email: user.email,
      role: user.role as UserRole,
    };
    return {
      accessToken: await this.jwt.signAsync(claims),
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.jwt.accessTtlSeconds,
      refreshTokenExpiresAt,
    };
  }
}
