import { Injectable } from '@nestjs/common';
import { InternalHttpClient } from '@app/common';
import { AppConfig, InjectAppConfig } from '@app/config';
import { IncidentStatus } from '@app/contracts';

export interface IncidentTransitionResult {
  id: string;
  status: IncidentStatus;
}

/** Synchronous calls to incident-service, which owns incident state. */
@Injectable()
export class IncidentClient {
  private readonly http: InternalHttpClient;

  constructor(@InjectAppConfig() config: AppConfig) {
    this.http = new InternalHttpClient(
      'incident-service',
      config.services.incident,
      config.internalApiKey,
    );
  }

  transition(
    incidentId: string,
    body: { status: IncidentStatus; actorId: string; reason?: string },
    correlationId: string,
  ): Promise<IncidentTransitionResult> {
    return this.http.request(`/internal/incidents/${incidentId}/transitions`, {
      method: 'POST',
      body,
      correlationId,
    });
  }
}
