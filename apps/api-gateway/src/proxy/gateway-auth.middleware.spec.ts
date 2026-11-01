import type { NextFunction, Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { createGatewayAuthMiddleware } from './gateway-auth.middleware';

const jwt = new JwtService({ secret: 'gateway-test-secret-0123456789abcdef' });
const middleware = createGatewayAuthMiddleware(jwt);

function run(method: string, path: string, authorization?: string) {
  const req = {
    method,
    path,
    originalUrl: path,
    headers: authorization ? { authorization } : {},
  } as Request;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return middleware(req, res, next).then(() => ({ res, next }));
}

describe('gateway auth middleware', () => {
  const token = jwt.sign({ sub: 'u1', email: 'a@b.c', role: 'USER' });

  it('forwards guests on public routes', async () => {
    const { next, res } = await run('GET', '/api/v1/incidents/nearby');
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('blocks guests on protected routes with 401', async () => {
    const { next, res } = await run('POST', '/api/v1/incidents');
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect((res.json as jest.Mock).mock.calls[0][0].error.code).toBe('UNAUTHORIZED');
  });

  it('forwards requests with a valid token', async () => {
    const { next } = await run('POST', '/api/v1/incidents', `Bearer ${token}`);
    expect(next).toHaveBeenCalled();
  });

  it('rejects an invalid token even on public routes', async () => {
    const { next, res } = await run('GET', '/api/v1/incidents', 'Bearer forged.token.value');
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('ignores non-proxied paths (handled by the gateway itself)', async () => {
    const { next } = await run('GET', '/health');
    expect(next).toHaveBeenCalled();
  });
});
