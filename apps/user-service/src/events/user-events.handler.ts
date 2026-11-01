import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BaseEvent, EventTypes, UserRegisteredPayload } from '@app/contracts';
import { PrismaService } from '@app/database';
import { EventConsumer } from '@app/kafka';

@Injectable()
export class UserEventsHandler implements OnModuleInit {
  private readonly logger = new Logger(UserEventsHandler.name);

  constructor(
    private readonly consumer: EventConsumer,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.consumer.on(EventTypes.USER_REGISTERED, (event) => this.onUserRegistered(event));
  }

  /** Creates the profile and default preferences. Idempotent on `eventId`. */
  async onUserRegistered(event: BaseEvent<UserRegisteredPayload>): Promise<void> {
    const { userId, email, displayName } = event.payload;
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.userProcessedEvent.createMany({
        data: [{ eventId: event.eventId, eventType: event.eventType }],
        skipDuplicates: true,
      });
      if (count === 0) return;

      // The profile may already exist if the user called GET /users/me first (lazy creation).
      await tx.userProfile.upsert({
        where: { id: userId },
        create: { id: userId, email, displayName, notificationPreference: { create: {} } },
        update: {},
      });
      // Replace only the lazily generated placeholder name, never a name the user has edited.
      await tx.userProfile.updateMany({
        where: { id: userId, displayName: email.split('@')[0] },
        data: { displayName },
      });
    });
    this.logger.log(
      { userId, eventId: event.eventId, correlationId: event.correlationId },
      'Profile provisioned',
    );
  }
}
