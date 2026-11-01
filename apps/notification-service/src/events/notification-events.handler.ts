import { Injectable, OnModuleInit } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import {
  BaseEvent,
  EventTypes,
  IncidentRejectedPayload,
  IncidentResolvedPayload,
  IncidentType,
  IncidentVerifiedPayload,
  NotificationRequestedPayload,
} from '@app/contracts';
import { EventConsumer } from '@app/kafka';
import { UserClient } from '../clients/user.client';
import {
  NotificationDispatcher,
  NotificationInput,
} from '../notifications/notification-dispatcher';
import { isInQuietHours } from '../notifications/quiet-hours';

const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  [IncidentType.ACCIDENT]: 'Tai nạn',
  [IncidentType.TRAFFIC_JAM]: 'Ùn tắc giao thông',
  [IncidentType.FLOODING]: 'Ngập lụt',
  [IncidentType.ROAD_CLOSURE]: 'Đường bị chặn',
  [IncidentType.CONSTRUCTION]: 'Công trình thi công',
  [IncidentType.OTHER]: 'Sự cố',
};

/** Turns domain events into user notifications. */
@Injectable()
export class NotificationEventsHandler implements OnModuleInit {
  constructor(
    private readonly consumer: EventConsumer,
    private readonly dispatcher: NotificationDispatcher,
    private readonly users: UserClient,
  ) {}

  onModuleInit(): void {
    this.consumer.on(EventTypes.INCIDENT_VERIFIED, (e) => this.onIncidentVerified(e));
    this.consumer.on(EventTypes.INCIDENT_REJECTED, (e) => this.onIncidentRejected(e));
    this.consumer.on(EventTypes.INCIDENT_RESOLVED, (e) => this.onIncidentResolved(e));
    this.consumer.on(EventTypes.NOTIFICATION_REQUESTED, (e) => this.onNotificationRequested(e));
  }

  /** Alerts users whose saved areas contain the incident, and tells the reporter. */
  async onIncidentVerified(event: BaseEvent<IncidentVerifiedPayload>): Promise<void> {
    const incident = event.payload;
    // A failure here throws, so the consumer retries and eventually dead-letters the event.
    const recipients = await this.users.findAlertRecipients(
      {
        latitude: incident.location.latitude,
        longitude: incident.location.longitude,
        incidentType: incident.type,
      },
      event.correlationId,
    );
    const now = new Date();
    const data = { incidentId: incident.incidentId };

    const inputs: NotificationInput[] = recipients
      .filter((r) => r.userId !== incident.reporterId)
      .map((r) => ({
        userId: r.userId,
        type: NotificationType.INCIDENT_NEARBY,
        title: `${INCIDENT_TYPE_LABELS[incident.type]} gần "${r.savedAreaName}"`,
        body: incident.title,
        data,
        dedupeKey: `incident:${incident.incidentId}:nearby`,
        suppressPush: isInQuietHours(r.quietHoursStart, r.quietHoursEnd, now),
      }));
    inputs.push({
      userId: incident.reporterId,
      type: NotificationType.REPORT_VERIFIED,
      title: 'Báo cáo của bạn đã được xác minh',
      body: incident.title,
      data,
      dedupeKey: `incident:${incident.incidentId}:verified`,
    });
    await this.dispatcher.recordAndSend(event, inputs);
  }

  async onIncidentRejected(event: BaseEvent<IncidentRejectedPayload>): Promise<void> {
    const incident = event.payload;
    await this.dispatcher.recordAndSend(event, [
      {
        userId: incident.reporterId,
        type: NotificationType.REPORT_REJECTED,
        title: 'Báo cáo của bạn chưa được chấp nhận',
        body: incident.reason,
        data: { incidentId: incident.incidentId },
        dedupeKey: `incident:${incident.incidentId}:rejected`,
      },
    ]);
  }

  async onIncidentResolved(event: BaseEvent<IncidentResolvedPayload>): Promise<void> {
    const incident = event.payload;
    await this.dispatcher.recordAndSend(event, [
      {
        userId: incident.reporterId,
        type: NotificationType.REPORT_RESOLVED,
        title: 'Sự cố bạn báo cáo đã được xử lý',
        body: incident.title,
        data: { incidentId: incident.incidentId },
        dedupeKey: `incident:${incident.incidentId}:resolved`,
      },
    ]);
  }

  async onNotificationRequested(event: BaseEvent<NotificationRequestedPayload>): Promise<void> {
    const request = event.payload;
    await this.dispatcher.recordAndSend(event, [
      {
        userId: request.userId,
        type: request.type,
        title: request.title,
        body: request.body,
        data: request.data,
        dedupeKey: request.dedupeKey,
      },
    ]);
  }
}
