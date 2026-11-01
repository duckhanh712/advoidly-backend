import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenClaims } from '@app/contracts';
import { IS_PUBLIC_KEY } from '../constants';
import { UnauthorizedException } from '../exceptions';
import type { AppRequest } from '../http';

export function extractBearerToken(req: AppRequest): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

/**
 * Global guard: verifies the access token and populates `request.user`.
 * Public routes skip the requirement but still get `request.user` when a valid token is sent,
 * so handlers can tailor responses for signed-in users.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<AppRequest>();
    const token = extractBearerToken(request);

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException();
    }

    try {
      const claims = await this.jwtService.verifyAsync<AccessTokenClaims>(token);
      request.user = { id: claims.sub, email: claims.email, role: claims.role };
      return true;
    } catch {
      if (isPublic) return true;
      throw new UnauthorizedException('Access token is invalid or expired');
    }
  }
}
