import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorResponse } from '@app/contracts';
import { ErrorCodes } from '../constants';
import { AppException } from '../exceptions';
import { AppRequest, getCorrelationId } from '../http';

interface NormalizedError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

const STATUS_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: ErrorCodes.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ErrorCodes.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCodes.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCodes.RESOURCE_NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCodes.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCodes.RATE_LIMITED,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCodes.SERVICE_UNAVAILABLE,
};

/** Builds the standard error body; also used by Express middleware outside Nest's filters. */
export function buildErrorResponse(
  request: AppRequest,
  error: { code: string; message: string; details?: unknown },
): ApiErrorResponse {
  return {
    success: false,
    error: { code: error.code, message: error.message, details: error.details },
    meta: {
      correlationId: getCorrelationId(request),
      timestamp: new Date().toISOString(),
      path: request.originalUrl ?? request.url ?? '',
    },
  };
}

/** Converts every thrown error into the standard `ApiErrorResponse` shape. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<AppRequest>();
    const response = ctx.getResponse<Response>();
    const error = this.normalize(exception);

    if (error.status >= 500) {
      this.logger.error({ err: exception, path: request.originalUrl }, error.message);
    }

    response.status(error.status).json(buildErrorResponse(request, error));
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'object' && response !== null && 'message' in response
          ? response.message
          : exception.message;
      return {
        status,
        code: STATUS_CODES[status] ?? (status >= 500 ? ErrorCodes.INTERNAL_ERROR : 'HTTP_ERROR'),
        message: Array.isArray(message) ? 'Request validation failed' : String(message),
        details: Array.isArray(message) ? message : undefined,
      };
    }

    const prismaError = this.fromPrismaError(exception);
    if (prismaError) return prismaError;

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCodes.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
    };
  }

  /** Maps common Prisma errors without coupling this library to the generated client. */
  private fromPrismaError(exception: unknown): NormalizedError | undefined {
    if (
      typeof exception !== 'object' ||
      exception === null ||
      (exception as { name?: string }).name !== 'PrismaClientKnownRequestError'
    ) {
      return undefined;
    }
    const code = (exception as { code?: string }).code;
    if (code === 'P2002') {
      return {
        status: HttpStatus.CONFLICT,
        code: ErrorCodes.CONFLICT,
        message: 'Resource already exists',
      };
    }
    if (code === 'P2025') {
      return {
        status: HttpStatus.NOT_FOUND,
        code: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Resource was not found',
      };
    }
    return undefined;
  }
}
