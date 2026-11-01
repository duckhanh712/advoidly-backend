import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeController,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedUser, UserRole } from '@app/contracts';
import { IS_PUBLIC_KEY, ROLES_KEY, SKIP_ENVELOPE_KEY } from '../constants';
import { InternalApiKeyGuard } from '../guards/internal-api-key.guard';
import { AppRequest, getCorrelationId } from '../http';

/** Marks a route as accessible without an access token. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a route to the given roles (requires authentication). */
export const Roles = (...roles: UserRole[]) =>
  applyDecorators(
    SetMetadata(ROLES_KEY, roles),
    ApiBearerAuth(),
    ApiForbiddenResponse({ description: 'Insufficient role' }),
  );

/** Documents a route as requiring a bearer token. Enforcement is done by the global guard. */
export const Authenticated = () =>
  applyDecorators(
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Missing or invalid token' }),
  );

/**
 * Service-to-service controller: excluded from Swagger, bypasses user JWT auth and
 * requires the shared internal API key instead. Never exposed by the gateway.
 */
export const InternalApi = () =>
  applyDecorators(Public(), UseGuards(InternalApiKeyGuard), ApiExcludeController());

/** Returns the handler result as-is instead of wrapping it in the response envelope. */
export const SkipEnvelope = () => SetMetadata(SKIP_ENVELOPE_KEY, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined =>
    ctx.switchToHttp().getRequest<AppRequest>().user,
);

export const CorrelationId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string =>
  getCorrelationId(ctx.switchToHttp().getRequest<AppRequest>()),
);
