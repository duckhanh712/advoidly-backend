import { Controller, Get, Param, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  DownstreamServiceException,
  Public,
  ResourceNotFoundException,
  SkipEnvelope,
} from '@app/common';
import { DownstreamService } from '../health/downstream.service';
import { PROXY_ROUTES } from '../proxy/routes';

/**
 * Serves each service's OpenAPI document through the gateway, so the gateway's Swagger UI
 * can browse every service. Service paths already include `/api/v1`, so "Try it out"
 * requests go through the gateway.
 */
@ApiExcludeController()
@Public()
@SkipEnvelope()
@Controller({ path: 'openapi', version: VERSION_NEUTRAL })
export class DocsController {
  constructor(private readonly downstream: DownstreamService) {}

  @Get(':service')
  async document(@Param('service') service: string): Promise<unknown> {
    const route = PROXY_ROUTES.find((r) => r.service === service);
    if (!route) throw new ResourceNotFoundException('OpenAPI document', service);
    try {
      const { status, body } = await this.downstream.fetchJson(route.service, '/docs-json');
      if (status !== 200) throw new Error(`status ${status}`);
      return { ...(body as object), servers: [{ url: '/' }] };
    } catch {
      throw new DownstreamServiceException(route.service);
    }
  }
}
