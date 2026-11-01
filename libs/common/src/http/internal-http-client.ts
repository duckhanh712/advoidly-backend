import { Logger } from '@nestjs/common';
import { ApiSuccessResponse } from '@app/contracts';
import { CORRELATION_ID_HEADER, INTERNAL_API_KEY_HEADER } from '../constants';
import { AppException, DownstreamServiceException } from '../exceptions';

export interface InternalRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  correlationId: string;
}

/**
 * Minimal client for synchronous service-to-service REST calls on `/internal/*` routes.
 * Authenticates with the shared internal API key and propagates the correlation id.
 * Errors returned by the callee in the standard envelope are re-thrown with the same
 * status and code; transport failures become `DOWNSTREAM_SERVICE_ERROR` (502).
 */
export class InternalHttpClient {
  private readonly logger = new Logger(InternalHttpClient.name);

  constructor(
    private readonly serviceName: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs = 5000,
  ) {}

  async request<T>(path: string, options: InternalRequestOptions): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: {
          'content-type': 'application/json',
          [INTERNAL_API_KEY_HEADER]: this.apiKey,
          [CORRELATION_ID_HEADER]: options.correlationId,
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      this.logger.error(
        { err: error, service: this.serviceName, path, correlationId: options.correlationId },
        'Internal request failed',
      );
      throw new DownstreamServiceException(this.serviceName);
    }

    const body = (await response.json().catch(() => undefined)) as
      | ApiSuccessResponse<T>
      | { error?: { code: string; message: string; details?: unknown } }
      | undefined;

    if (!response.ok) {
      const error = body && 'error' in body ? body.error : undefined;
      if (error && response.status < 500) {
        throw new AppException(error.code, error.message, response.status, error.details);
      }
      throw new DownstreamServiceException(this.serviceName, { status: response.status });
    }
    return (body as ApiSuccessResponse<T>).data;
  }
}
