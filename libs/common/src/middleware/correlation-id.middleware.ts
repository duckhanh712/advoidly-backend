import type { NextFunction, Request, Response } from 'express';
import { CORRELATION_ID_HEADER } from '../constants';
import { resolveCorrelationId } from '../http';

/**
 * Ensures every request carries a correlation id: reuses a well-formed inbound
 * `x-correlation-id`, otherwise generates one. The id is written back to the request
 * headers (so it is forwarded by the gateway proxy) and to the response.
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId = resolveCorrelationId(req);
  req.headers[CORRELATION_ID_HEADER] = correlationId;
  res.setHeader(CORRELATION_ID_HEADER, correlationId);
  next();
}
