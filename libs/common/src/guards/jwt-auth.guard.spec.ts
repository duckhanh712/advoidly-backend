import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@app/contracts';
import { IS_PUBLIC_KEY } from '../constants';
import { UnauthorizedException } from '../exceptions';
import type { AppRequest } from '../http';
import { JwtAuthGuard } from './jwt-auth.guard';

const SECRET = 'unit-test-secret-0123456789abcdef0123';
const OPTIONS = { issuer: 'urban-alert-auth', audience: 'urban-alert-api' };

const jwt = new JwtService({
  secret: SECRET,
  signOptions: { ...OPTIONS, expiresIn: 60 },
  verifyOptions: { ...OPTIONS, algorithms: ['HS256'] },
});
const claims = {
  sub: '7d3a2f0e-1111-4222-8333-944455556666',
  email: 'a@example.com',
  role: UserRole.USER,
};

function contextFor(req: Partial<AppRequest>, isPublic = false): ExecutionContext {
  const handler = () => undefined;
  if (isPublic) Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
  return {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

const withToken = (token: string) =>
  ({ headers: { authorization: `Bearer ${token}` } }) as AppRequest;

describe('JwtAuthGuard', () => {
  const guard = new JwtAuthGuard(jwt, new Reflector());

  it('authenticates a valid token and exposes the user', async () => {
    const req = withToken(jwt.sign(claims));
    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
    expect(req.user).toEqual({ id: claims.sub, email: claims.email, role: UserRole.USER });
  });

  it('rejects requests without a token on protected routes', async () => {
    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects non-bearer authorization schemes', async () => {
    const req = { headers: { authorization: `Basic ${jwt.sign(claims)}` } } as AppRequest;
    await expect(guard.canActivate(contextFor(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([
    [
      'signed with another secret',
      new JwtService({ secret: 'x'.repeat(40) }).sign(claims, OPTIONS),
    ],
    ['for another audience', jwt.sign(claims, { audience: 'someone-else' })],
    ['from another issuer', jwt.sign(claims, { issuer: 'evil' })],
    [
      'expired',
      new JwtService({ secret: SECRET, signOptions: OPTIONS }).sign({
        ...claims,
        exp: Math.floor(Date.now() / 1000) - 10,
      }),
    ],
    ['malformed', 'not.a.jwt'],
  ])('rejects a token %s', async (_label, token) => {
    await expect(guard.canActivate(contextFor(withToken(token)))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects the "none" algorithm', async () => {
    const encode = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ ...claims, ...OPTIONS })}.`;
    await expect(guard.canActivate(contextFor(withToken(unsigned)))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('lets guests through on public routes', async () => {
    const req = { headers: {} } as AppRequest;
    await expect(guard.canActivate(contextFor(req, true))).resolves.toBe(true);
    expect(req.user).toBeUndefined();
  });

  it('treats an invalid token on a public route as a guest', async () => {
    const req = withToken('not.a.jwt');
    await expect(guard.canActivate(contextFor(req, true))).resolves.toBe(true);
    expect(req.user).toBeUndefined();
  });
});
