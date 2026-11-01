import { Injectable } from '@nestjs/common';
import { InternalHttpClient } from '@app/common';
import { AppConfig, InjectAppConfig } from '@app/config';
import { IncidentType } from '@app/contracts';

export interface AlertRecipient {
  userId: string;
  savedAreaId: string;
  savedAreaName: string;
  distanceMeters: number;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
}

export interface NotificationPreferences {
  pushEnabled: boolean;
  incidentTypes: IncidentType[];
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
}

/** Synchronous calls to user-service, which owns saved areas and preferences. */
@Injectable()
export class UserClient {
  private readonly http: InternalHttpClient;

  constructor(@InjectAppConfig() config: AppConfig) {
    this.http = new InternalHttpClient('user-service', config.services.user, config.internalApiKey);
  }

  findAlertRecipients(
    query: { latitude: number; longitude: number; incidentType: IncidentType },
    correlationId: string,
  ): Promise<AlertRecipient[]> {
    return this.http.request('/internal/alert-recipients', { query, correlationId });
  }

  getPreferences(userId: string, correlationId: string): Promise<NotificationPreferences> {
    return this.http.request(`/internal/users/${userId}/notification-preferences`, {
      correlationId,
    });
  }
}
