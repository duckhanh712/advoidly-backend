import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, Observable } from 'rxjs';
import type { ApiSuccessResponse } from '@app/contracts';
import { SKIP_ENVELOPE_KEY } from '../constants';
import { AppRequest, getCorrelationId } from '../http';
import { PaginatedResult } from '../utils';

/** Wraps successful handler results in the standard `ApiSuccessResponse` envelope. */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ENVELOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip || context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<AppRequest>();
    return next.handle().pipe(
      map((result): ApiSuccessResponse<unknown> => {
        const meta = {
          correlationId: getCorrelationId(request),
          timestamp: new Date().toISOString(),
        };
        if (result instanceof PaginatedResult) {
          return {
            success: true,
            data: result.items,
            meta: { ...meta, pagination: result.pagination },
          };
        }
        return { success: true, data: result ?? null, meta };
      }),
    );
  }
}
