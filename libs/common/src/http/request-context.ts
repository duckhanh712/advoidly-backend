import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { AuthenticatedUser } from '@app/contracts';
import { CORRELATION_ID_HEADER } from '../constants';

/** Express request as seen by our guards and decorators. */
export type AppRequest = IncomingMessage & {
  id?: string | number | object;
  user?: AuthenticatedUser;
  originalUrl?: string;
  url?: string;
};

const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Returns the request's correlation id, generating one if the client did not send a
 * well-formed value. Untrusted header values are never echoed back unvalidated.
 */
export function resolveCorrelationId(req: IncomingMessage): string {
  const header = req.headers[CORRELATION_ID_HEADER];
  const value = Array.isArray(header) ? header[0] : header;
  return value && SAFE_CORRELATION_ID.test(value) ? value : randomUUID();
}

export function getCorrelationId(req: AppRequest): string {
  if (typeof req.id === 'string') return req.id;
  const header = req.headers[CORRELATION_ID_HEADER];
  return typeof header === 'string' ? header : 'unknown';
}
