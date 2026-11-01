import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, ErrorCodes } from '../constants';

/** Base exception carrying a stable error code. Rendered by `AllExceptionsFilter`. */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

export class ResourceNotFoundException extends AppException {
  constructor(resource: string, id?: string) {
    super(
      ErrorCodes.RESOURCE_NOT_FOUND,
      id ? `${resource} '${id}' was not found` : `${resource} was not found`,
      HttpStatus.NOT_FOUND,
    );
  }
}

export class ConflictException extends AppException {
  constructor(message: string, details?: unknown) {
    super(ErrorCodes.CONFLICT, message, HttpStatus.CONFLICT, details);
  }
}

export class UnauthorizedException extends AppException {
  constructor(message = 'Authentication is required') {
    super(ErrorCodes.UNAUTHORIZED, message, HttpStatus.UNAUTHORIZED);
  }
}

export class ForbiddenException extends AppException {
  constructor(message = 'You do not have permission to perform this action') {
    super(ErrorCodes.FORBIDDEN, message, HttpStatus.FORBIDDEN);
  }
}

export class InvalidStateTransitionException extends AppException {
  constructor(entity: string, from: string, to: string) {
    super(
      ErrorCodes.INVALID_STATE_TRANSITION,
      `${entity} cannot transition from ${from} to ${to}`,
      HttpStatus.CONFLICT,
      { from, to },
    );
  }
}

export class DownstreamServiceException extends AppException {
  constructor(service: string, details?: unknown) {
    super(
      ErrorCodes.DOWNSTREAM_SERVICE_ERROR,
      `Upstream service '${service}' failed to handle the request`,
      HttpStatus.BAD_GATEWAY,
      details,
    );
  }
}
