import type { NextFunction, Request, Response } from 'express';
import type { ServerResponse } from 'node:http';
import { Logger } from '@nestjs/common';
import { createProxyMiddleware, RequestHandler } from 'http-proxy-middleware';
import { buildErrorResponse, ErrorCodes } from '@app/common';
import type { AppConfig } from '@app/config';
import { matchRoute, PROXY_ROUTES } from './routes';

const UPSTREAM_TIMEOUT_MS = 30_000;

/** One reverse proxy per downstream service; paths are forwarded unchanged. */
export function createProxies(config: AppConfig): RequestHandler<Request, ServerResponse>[] {
  const logger = new Logger('GatewayProxy');
  return PROXY_ROUTES.map((route) =>
    createProxyMiddleware<Request, ServerResponse>({
      target: config.services[route.service],
      changeOrigin: true,
      xfwd: true,
      proxyTimeout: UPSTREAM_TIMEOUT_MS,
      timeout: UPSTREAM_TIMEOUT_MS,
      pathFilter: (path) => path === route.prefix || path.startsWith(`${route.prefix}/`),
      on: {
        error: (error, req, res) => {
          logger.error(
            { err: error, service: route.service, path: req.originalUrl },
            'Upstream request failed',
          );
          if (!('writeHead' in res) || res.headersSent) return;
          res.writeHead(502, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify(
              buildErrorResponse(req, {
                code: ErrorCodes.DOWNSTREAM_SERVICE_ERROR,
                message: `Service '${route.service}' is unavailable`,
              }),
            ),
          );
        },
      },
    }),
  );
}

/**
 * Errors thrown synchronously while starting a proxied request (e.g. the socket cannot be
 * opened) are passed to `next(err)` instead of the proxy `error` event. Render them as 502
 * too, rather than letting them surface as a generic 500.
 */
export function proxyErrorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const route = matchRoute(req.path);
  if (!route || res.headersSent) return next(error);
  new Logger('GatewayProxy').error(
    { err: error, service: route.service, path: req.originalUrl },
    'Upstream request failed',
  );
  res.status(502).json(
    buildErrorResponse(req, {
      code: ErrorCodes.DOWNSTREAM_SERVICE_ERROR,
      message: `Service '${route.service}' is unavailable`,
    }),
  );
}
