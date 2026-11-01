import type { NextFunction, Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import pinoHttp from 'pino-http';
import type Redis from 'ioredis';
import { AppConfig } from '@app/config';
import { buildHttpLoggerOptions } from '@app/observability';
import { REDIS_CLIENT } from '@app/redis';
import { createGatewayAuthMiddleware } from './proxy/gateway-auth.middleware';
import { createProxies, proxyErrorHandler } from './proxy/proxy';
import { createRateLimitMiddleware } from './rate-limit/rate-limit.middleware';

/**
 * Express middleware chain for proxied traffic (runs before Nest's own routes):
 * correlation id (from bootstrap) → access log → rate limit → auth → proxy.
 */
export function configureGateway(app: NestExpressApplication, config: AppConfig): void {
  // Honour X-Forwarded-For from one trusted hop (load balancer) for per-client rate limiting.
  app.set('trust proxy', 1);

  // Nest's request logger only sees Nest routes; proxied requests are logged here.
  const httpLogger = pinoHttp(buildHttpLoggerOptions(config));
  app.use((req: Request, res: Response, next: NextFunction) =>
    req.path.startsWith('/api/') ? httpLogger(req, res, next) : next(),
  );
  app.use(createRateLimitMiddleware(app.get<Redis>(REDIS_CLIENT), config.rateLimit));
  app.use(createGatewayAuthMiddleware(app.get(JwtService)));
  for (const proxy of createProxies(config)) app.use(proxy);
  app.use(proxyErrorHandler);
}
