import { HttpStatus, ValidationError, ValidationPipe } from '@nestjs/common';
import { ErrorCodes } from '../constants';
import { AppException } from '../exceptions';

export interface FieldError {
  field: string;
  errors: string[];
}

export function flattenValidationErrors(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints ? [{ field, errors: Object.values(error.constraints) }] : [];
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}

/** Global validation: strips unknown fields, rejects unexpected ones, transforms DTOs. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new AppException(
        ErrorCodes.VALIDATION_FAILED,
        'Request validation failed',
        HttpStatus.BAD_REQUEST,
        flattenValidationErrors(errors),
      ),
  });
}
