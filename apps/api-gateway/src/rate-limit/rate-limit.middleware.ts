import type { NextFunction, Request, Response } from 'express';
import { Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { buildErrorResponse, ErrorCodes } from '@app/common';

export interface RateLimitOptions {
  windowSeconds: number;
  maxRequests: number;
}

/**
 * Fixed-window rate limit per client IP, shared across gateway instances through Redis.
 * Fails open: if Redis is unavailable, requests are allowed and a warning is logged.
 */
export function createRateLimitMiddleware(redis: Redis, options: RateLimitOptions) {
  const logger = new Logger('RateLimit');
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.path.startsWith('/api/')) return next();

    const window = Math.floor(Date.now() / 1000 / options.windowSeconds);
    const key = `ratelimit:${req.ip ?? 'unknown'}:${window}`;
    let count: number;
    try {
      const results = await redis.multi().incr(key).expire(key, options.windowSeconds, 'NX').exec();
      count = Number(results?.[0]?.[1] ?? 0);
    } catch (error) {
      logger.warn(`Rate limiter unavailable, allowing request: ${(error as Error).message}`);
      return next();
    }

    const resetSeconds = (window + 1) * options.windowSeconds - Math.floor(Date.now() / 1000);
    res.setHeader('RateLimit-Limit', options.maxRequests);
    res.setHeader('RateLimit-Remaining', Math.max(0, options.maxRequests - count));
    res.setHeader('RateLimit-Reset', resetSeconds);

    if (count > options.maxRequests) {
      res.setHeader('Retry-After', resetSeconds);
      res.status(429).json(
        buildErrorResponse(req, {
          code: ErrorCodes.RATE_LIMITED,
          message: 'Too many requests, please slow down',
        }),
      );
      return;
    }
    next();
  };
}
