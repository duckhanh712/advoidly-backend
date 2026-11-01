import { Injectable } from '@nestjs/common';
import { AppConfig, InjectAppConfig } from '@app/config';
import { DownstreamService as ServiceKey } from '../proxy/routes';

const TIMEOUT_MS = 2_000;

@Injectable()
export class DownstreamService {
  constructor(@InjectAppConfig() private readonly config: AppConfig) {}

  url(service: ServiceKey): string {
    return this.config.services[service];
  }

  async fetchJson(service: ServiceKey, path: string): Promise<{ status: number; body: unknown }> {
    const response = await fetch(new URL(path, this.url(service)), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { status: response.status, body: await response.json().catch(() => undefined) };
  }
}
