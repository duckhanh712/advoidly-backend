import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModerationActionType, ModerationCaseStatus, Prisma } from '@prisma/client';
import {
  BaseEvent,
  EventTypes,
  IncidentCreatedPayload,
  IncidentStatusChangedPayload,
} from '@app/contracts';
import { PrismaService } from '@app/database';
import { EventConsumer } from '@app/kafka';
import { DuplicateDetector } from '../moderation/duplicate-detector';
import { UNDECIDED_STATUSES } from '../moderation/moderation.service';

/** What a decision event did to the review queue. */
export type DecisionSyncResult =
  'closed' | 'created-decided' | 'already-decided' | 'duplicate-event';

interface Decision {
  status: ModerationCaseStatus;
  action: ModerationActionType;
}

const APPROVED: Decision = {
  status: ModerationCaseStatus.APPROVED,
  action: ModerationActionType.APPROVE,
};
const REJECTED: Decision = {
  status: ModerationCaseStatus.REJECTED,
  action: ModerationActionType.REJECT,
};

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
    this.consumer.on(EventTypes.INCIDENT_VERIFIED, (event) =>
      this.onIncidentDecided(event, APPROVED).then(() => undefined),
    );
    this.consumer.on(EventTypes.INCIDENT_REJECTED, (event) =>
      this.onIncidentDecided(event, REJECTED).then(() => undefined),
    );
  }

  /** Opens a review case for each new incident. Idempotent on `eventId` and `incidentId`. */
  async onIncidentCreated(event: BaseEvent<IncidentCreatedPayload>): Promise<void> {
    const incident = event.payload;
    const caseId = await this.prisma.$transaction(async (tx) => {
      if (!(await this.markProcessed(tx, event))) return undefined;

      const occurredAt = new Date(incident.occurredAt);
      const possibleDuplicateIds = await this.duplicates.findCandidates(tx, {
        incidentId: incident.incidentId,
        incidentType: incident.type,
        latitude: incident.location.latitude,
        longitude: incident.location.longitude,
        occurredAt,
      });
      // `update: {}`: a case already created by a decision event stays decided.
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

  /**
   * Keeps the review queue in sync when an incident is approved or rejected outside the
   * moderation endpoints, e.g. an admin's `PATCH /incidents/{id}`. The open case is closed and
   * the decision is recorded as a moderation action by the event's actor, so the audit trail
   * stays complete.
   *
   * Decisions made through moderation-service have already closed the case; their events
   * are no-ops here. `incident.created` and the decision travel on different topics, so the
   * decision can arrive first: then the case is created already decided.
   */
  async onIncidentDecided(
    event: BaseEvent<IncidentStatusChangedPayload>,
    decision: Decision,
  ): Promise<DecisionSyncResult> {
    const incident = event.payload;
    const action = {
      moderatorId: incident.actorId,
      action: decision.action,
      reason: incident.reason ?? null,
      metadata: {
        source: 'incident-service',
        eventId: event.eventId,
        correlationId: event.correlationId,
      } satisfies Prisma.InputJsonObject,
    };

    const result = await this.prisma.$transaction(async (tx): Promise<DecisionSyncResult> => {
      if (!(await this.markProcessed(tx, event))) return 'duplicate-event';

      const existing = await tx.moderationCase.findUnique({
        where: { incidentId: incident.incidentId },
        select: { id: true },
      });
      if (!existing) {
        await tx.moderationCase.create({
          data: {
            incidentId: incident.incidentId,
            reporterId: incident.reporterId,
            incidentType: incident.type,
            title: incident.title,
            description: incident.description,
            latitude: incident.location.latitude,
            longitude: incident.location.longitude,
            occurredAt: new Date(incident.occurredAt),
            status: decision.status,
            actions: { create: action },
          },
        });
        return 'created-decided';
      }

      // Compare-and-set: only an undecided case is closed, so a moderator's own decision wins.
      const { count } = await tx.moderationCase.updateMany({
        where: { id: existing.id, status: { in: UNDECIDED_STATUSES } },
        data: { status: decision.status },
      });
      if (count === 0) return 'already-decided';
      await tx.moderationAction.create({ data: { caseId: existing.id, ...action } });
      return 'closed';
    });

    if (result === 'closed' || result === 'created-decided') {
      this.logger.log(
        {
          incidentId: incident.incidentId,
          status: decision.status,
          actorId: incident.actorId,
          result,
          eventId: event.eventId,
          correlationId: event.correlationId,
        },
        'Moderation case closed by an incident decision made outside moderation',
      );
    }
    return result;
  }

  /** Idempotency: records the event id; false when it was already processed. */
  private async markProcessed(
    tx: Prisma.TransactionClient,
    event: BaseEvent<unknown>,
  ): Promise<boolean> {
    const { count } = await tx.moderationProcessedEvent.createMany({
      data: [{ eventId: event.eventId, eventType: event.eventType }],
      skipDuplicates: true,
    });
    return count > 0;
  }
}
