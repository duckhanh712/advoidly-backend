import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { AppConfig, InjectAppConfig } from '@app/config';
import { INTERNAL_API_KEY_HEADER } from '../constants';
import { UnauthorizedException } from '../exceptions';
import type { AppRequest } from '../http';

/** Protects `/internal/*` routes used for service-to-service calls. */
@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor(@InjectAppConfig() config: AppConfig) {
    this.expected = Buffer.from(config.internalApiKey);
  }

  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<AppRequest>().headers[INTERNAL_API_KEY_HEADER];
    const provided = Buffer.from(typeof header === 'string' ? header : '');
    if (provided.length !== this.expected.length || !timingSafeEqual(provided, this.expected)) {
      throw new UnauthorizedException('Invalid internal API key');
    }
    return true;
  }
}
