import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BaseEvent, EventTypes, IncidentCreatedPayload } from '@app/contracts';
import { PrismaService } from '@app/database';
import { EventConsumer } from '@app/kafka';
import { DuplicateDetector } from '../moderation/duplicate-detector';

@Injectable()
export class ModerationEventsHandler implements OnModuleInit {
  private readonly logger = new Logger(ModerationEventsHandler.name);

  constructor(
    private readonly consumer: EventConsumer,
    private readonly prisma: PrismaService,
    private readonly duplicates: DuplicateDetector,
  ) {}

  onModuleInit(): void {
    this.consumer.on(EventTypes.INCIDENT_CREATED, (event) => this.onIncidentCreated(event));
  }

  /** Opens a review case for each new incident. Idempotent on `eventId` and `incidentId`. */
  async onIncidentCreated(event: BaseEvent<IncidentCreatedPayload>): Promise<void> {
    const incident = event.payload;
    const caseId = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.moderationProcessedEvent.createMany({
        data: [{ eventId: event.eventId, eventType: event.eventType }],
        skipDuplicates: true,
      });
      if (count === 0) return undefined;

      const occurredAt = new Date(incident.occurredAt);
      const possibleDuplicateIds = await this.duplicates.findCandidates(tx, {
        incidentId: incident.incidentId,
        incidentType: incident.type,
        latitude: incident.location.latitude,
        longitude: incident.location.longitude,
        occurredAt,
      });
      const created = await tx.moderationCase.upsert({
        where: { incidentId: incident.incidentId },
        update: {},
        create: {
          incidentId: incident.incidentId,
          reporterId: incident.reporterId,
          incidentType: incident.type,
          title: incident.title,
          description: incident.description,
          latitude: incident.location.latitude,
          longitude: incident.location.longitude,
          occurredAt,
          possibleDuplicateIds,
        },
      });
      return created.id;
    });

    if (caseId) {
      this.logger.log(
        {
          caseId,
          incidentId: incident.incidentId,
          eventId: event.eventId,
          correlationId: event.correlationId,
        },
        'Moderation case opened',
      );
    }
  }
}
