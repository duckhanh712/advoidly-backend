import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@app/contracts';
import { ROLES_KEY } from '../constants';
import { ForbiddenException, UnauthorizedException } from '../exceptions';
import type { AppRequest } from '../http';

/** Global guard enforcing `@Roles(...)`. Runs after `JwtAuthGuard`. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const user = context.switchToHttp().getRequest<AppRequest>().user;
    if (!user) throw new UnauthorizedException();
    if (!roles.includes(user.role)) throw new ForbiddenException();
    return true;
  }
}
