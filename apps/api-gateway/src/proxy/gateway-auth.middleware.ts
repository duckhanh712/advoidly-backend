import type { NextFunction, Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { buildErrorResponse, ErrorCodes, extractBearerToken } from '@app/common';
import { isPublicRoute, matchRoute } from './routes';

/**
 * Rejects unauthenticated or invalid-token requests before they reach a service.
 * - Protected route without a token → 401.
 * - Any route with an invalid/expired token → 401 (a bad token is never silently ignored).
 * - Public route without a token → forwarded as a guest request.
 */
export function createGatewayAuthMiddleware(jwt: JwtService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!matchRoute(req.path)) return next();

    const token = extractBearerToken(req);
    if (!token) {
      if (isPublicRoute(req.method, req.path)) return next();
      return unauthorized(req, res, 'Authentication is required');
    }
    try {
      await jwt.verifyAsync(token);
      next();
    } catch {
      unauthorized(req, res, 'Access token is invalid or expired');
    }
  };
}

function unauthorized(req: Request, res: Response, message: string): void {
  res.status(401).json(buildErrorResponse(req, { code: ErrorCodes.UNAUTHORIZED, message }));
}
