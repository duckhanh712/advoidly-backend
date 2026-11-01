import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, SkipEnvelope } from '@app/common';
import { PROXY_ROUTES } from '../proxy/routes';
import { DownstreamService } from './downstream.service';

type ServiceState = 'up' | 'down';

/** Readiness of downstream services, for operators. Does not affect gateway readiness. */
@ApiTags('health')
@Public()
@SkipEnvelope()
@Controller({ path: 'health/services', version: VERSION_NEUTRAL })
export class ServicesHealthController {
  constructor(private readonly downstream: DownstreamService) {}

  @Get()
  @ApiOperation({ summary: 'Readiness of every downstream service' })
  async check(): Promise<{ status: 'ok' | 'degraded'; services: Record<string, ServiceState> }> {
    const entries = await Promise.all(
      PROXY_ROUTES.map(async ({ service }): Promise<[string, ServiceState]> => {
        try {
          const { status } = await this.downstream.fetchJson(service, '/health');
          return [service, status === 200 ? 'up' : 'down'];
        } catch {
          return [service, 'down'];
        }
      }),
    );
    const services = Object.fromEntries(entries);
    return { status: entries.every(([, s]) => s === 'up') ? 'ok' : 'degraded', services };
  }
}
