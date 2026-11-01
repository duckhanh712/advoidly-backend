import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Options } from 'pino-http';
import type { AppConfig } from '@app/config';
import { CORRELATION_ID_HEADER } from '@app/common/constants';
import { resolveCorrelationId } from '@app/common/http';

/** Fields that must never reach the logs. */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-internal-api-key"]',
  '*.password',
  '*.passwordHash',
  '*.refreshToken',
  '*.accessToken',
  '*.privateKey',
];

/**
 * pino-http options shared by all services. The request id *is* the correlation id, so
 * every log line written while handling a request carries `req.id` / `correlationId`.
 */
export function buildHttpLoggerOptions(config: AppConfig): Options {
  return {
    level: config.log.level,
    transport: config.log.pretty
      ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:standard' } }
      : undefined,
    base: { service: config.serviceName, env: config.env },
    redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const id = resolveCorrelationId(req);
      res.setHeader(CORRELATION_ID_HEADER, id);
      return id;
    },
    customProps: (req: IncomingMessage) => ({ correlationId: (req as { id?: unknown }).id }),
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
  };
}
