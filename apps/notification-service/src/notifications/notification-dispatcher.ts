import { Inject, Injectable, Logger } from '@nestjs/common';
import { Notification, NotificationStatus, NotificationType } from '@prisma/client';
import { BaseEvent } from '@app/contracts';
import { PrismaService } from '@app/database';
import { PUSH_PROVIDER, PushProvider } from '../push/push-provider';

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
  dedupeKey?: string;
  /** Store the notification but do not push it (e.g. quiet hours). */
  suppressPush?: boolean;
}

/**
 * Records notifications exactly once per event and delivers pushes for new records.
 *
 * Idempotency (at-least-once Kafka delivery):
 *  - `processed_events` row keyed by `eventId`, inserted in the same transaction;
 *  - unique (userId, dedupeKey) so the same cause never notifies a user twice.
 * Push delivery happens after commit. If the process dies in between, records stay PENDING
 * (a retry sweeper is future work; see docs/events/event-catalog.md).
 */
@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcher.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
  ) {}

  async recordAndSend(event: BaseEvent<unknown>, inputs: NotificationInput[]): Promise<number> {
    const created = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.notificationProcessedEvent.createMany({
        data: [{ eventId: event.eventId, eventType: event.eventType }],
        skipDuplicates: true,
      });
      if (count === 0 || inputs.length === 0) return [];
      return tx.notification.createManyAndReturn({
        data: inputs.map((input) => ({
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          data: input.data,
          dedupeKey: input.dedupeKey,
          status: input.suppressPush ? NotificationStatus.SKIPPED : NotificationStatus.PENDING,
        })),
        skipDuplicates: true,
      });
    });

    for (const notification of created) {
      // TODO(temporary): console output for manual flow testing; remove once logs are shipped to files.
      console.log(
        `[notification] ${event.eventType} → user=${notification.userId} type=${notification.type}\n` +
          `  title: ${notification.title}\n  body:  ${notification.body}\n  status: ${notification.status}`,
      );
      if (notification.status === NotificationStatus.PENDING) await this.deliver(notification);
    }
    if (created.length > 0) {
      this.logger.log(
        {
          eventId: event.eventId,
          eventType: event.eventType,
          count: created.length,
          provider: this.push.name,
        },
        'Notifications created',
      );
    }
    return created.length;
  }

  private async deliver(notification: Notification): Promise<void> {
    const devices = await this.prisma.deviceToken.findMany({
      where: { userId: notification.userId },
    });
    if (devices.length === 0) {
      await this.setStatus(notification.id, NotificationStatus.SKIPPED);
      return;
    }

    let delivered = false;
    for (const device of devices) {
      const result = await this.push.send({
        token: device.token,
        title: notification.title,
        body: notification.body,
        data: {
          notificationId: notification.id,
          type: notification.type,
          ...(notification.data as Record<string, string> | null),
        },
      });
      delivered ||= result.success;
      if (result.invalidToken)
        await this.prisma.deviceToken.delete({ where: { id: device.id } }).catch(() => undefined);
      if (!result.success) {
        this.logger.warn(
          { notificationId: notification.id, error: result.error },
          'Push delivery failed',
        );
      }
    }
    await this.setStatus(
      notification.id,
      delivered ? NotificationStatus.SENT : NotificationStatus.FAILED,
    );
  }

  private setStatus(id: string, status: NotificationStatus) {
    return this.prisma.notification.update({
      where: { id },
      data: { status, sentAt: status === NotificationStatus.SENT ? new Date() : undefined },
    });
  }
}
