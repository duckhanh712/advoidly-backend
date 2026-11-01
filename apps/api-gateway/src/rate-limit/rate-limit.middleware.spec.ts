import type { NextFunction, Request, Response } from 'express';
import type Redis from 'ioredis';
import { createRateLimitMiddleware } from './rate-limit.middleware';

/** Minimal in-memory stand-in for the MULTI INCR/EXPIRE used by the limiter. */
function fakeRedis(fail = false) {
  const counts = new Map<string, number>();
  return {
    multi() {
      let key = '';
      const chain = {
        incr(k: string) {
          key = k;
          return chain;
        },
        expire() {
          return chain;
        },
        async exec() {
          if (fail) throw new Error('ECONNREFUSED');
          counts.set(key, (counts.get(key) ?? 0) + 1);
          return [[null, counts.get(key)]];
        },
      };
      return chain;
    },
  } as unknown as Redis;
}

function call(
  middleware: ReturnType<typeof createRateLimitMiddleware>,
  ip = '10.0.0.1',
  path = '/api/v1/incidents',
) {
  const headers: Record<string, unknown> = {};
  const req = { ip, path, originalUrl: path, headers: {} } as unknown as Request;
  const res = {
    setHeader: (k: string, v: unknown) => (headers[k] = v),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return middleware(req, res, next).then(() => ({ res, next, headers }));
}

describe('rate limit middleware', () => {
  it('allows up to the limit then responds 429 with Retry-After', async () => {
    const middleware = createRateLimitMiddleware(fakeRedis(), {
      windowSeconds: 60,
      maxRequests: 2,
    });
    expect((await call(middleware)).next).toHaveBeenCalled();
    const second = await call(middleware);
    expect(second.next).toHaveBeenCalled();
    expect(second.headers['RateLimit-Remaining']).toBe(0);

    const third = await call(middleware);
    expect(third.next).not.toHaveBeenCalled();
    expect(third.res.status).toHaveBeenCalledWith(429);
    expect(third.headers['Retry-After']).toEqual(expect.any(Number));
  });

  it('counts clients separately', async () => {
    const middleware = createRateLimitMiddleware(fakeRedis(), {
      windowSeconds: 60,
      maxRequests: 1,
    });
    await call(middleware, '10.0.0.1');
    expect((await call(middleware, '10.0.0.2')).next).toHaveBeenCalled();
  });

  it('fails open when Redis is unavailable', async () => {
    const middleware = createRateLimitMiddleware(fakeRedis(true), {
      windowSeconds: 60,
      maxRequests: 1,
    });
    expect((await call(middleware)).next).toHaveBeenCalled();
  });

  it('does not limit non-API paths', async () => {
    const middleware = createRateLimitMiddleware(fakeRedis(true), {
      windowSeconds: 60,
      maxRequests: 0,
    });
    expect((await call(middleware, '10.0.0.1', '/health')).next).toHaveBeenCalled();
  });
});
