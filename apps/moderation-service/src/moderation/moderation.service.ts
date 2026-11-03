import { Injectable, Logger } from '@nestjs/common';
import { ModerationActionType, ModerationCaseStatus, Prisma } from '@prisma/client';
import {
  AppException,
  ConflictException,
  ErrorCodes,
  PaginatedResult,
  ResourceNotFoundException,
} from '@app/common';
import { AuthenticatedUser, EventTypes, IncidentStatus, NotificationType } from '@app/contracts';
import { PrismaService } from '@app/database';
import { EventPublisher } from '@app/kafka';
import { IncidentClient } from '../clients/incident.client';
import {
  ApproveReportDto,
  ListCasesQueryDto,
  ModerationCaseDto,
  RejectReportDto,
  RequestInfoDto,
} from './dto/moderation.dto';

/** Cases that still await a decision (the review queue). */
export const UNDECIDED_STATUSES: ModerationCaseStatus[] = [
  ModerationCaseStatus.OPEN,
  ModerationCaseStatus.INFO_REQUESTED,
];

interface Decision {
  action: ModerationActionType;
  caseStatus: ModerationCaseStatus;
  incidentStatus: IncidentStatus;
  reason?: string;
}

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly incidents: IncidentClient,
    private readonly events: EventPublisher,
  ) {}

  async list(query: ListCasesQueryDto): Promise<PaginatedResult<ModerationCaseDto>> {
    const where: Prisma.ModerationCaseWhereInput = {
      status: query.status ?? ModerationCaseStatus.OPEN,
    };
    const [items, total] = await Promise.all([
      this.prisma.moderationCase.findMany({
        where,
        orderBy: { createdAt: 'asc' }, // oldest first: work the queue in order
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.moderationCase.count({ where }),
    ]);
    return PaginatedResult.of(items, query, total);
  }

  async get(id: string): Promise<ModerationCaseDto> {
    const found = await this.prisma.moderationCase.findUnique({
      where: { id },
      include: {
        actions: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, moderatorId: true, action: true, reason: true, createdAt: true },
        },
      },
    });
    if (!found) throw new ResourceNotFoundException('Moderation report', id);
    return found;
  }

  approve(id: string, moderator: AuthenticatedUser, dto: ApproveReportDto, correlationId: string) {
    return this.decide(
      id,
      moderator,
      {
        action: ModerationActionType.APPROVE,
        caseStatus: ModerationCaseStatus.APPROVED,
        incidentStatus: IncidentStatus.VERIFIED,
        reason: dto.note,
      },
      correlationId,
    );
  }

  reject(id: string, moderator: AuthenticatedUser, dto: RejectReportDto, correlationId: string) {
    return this.decide(
      id,
      moderator,
      {
        action: ModerationActionType.REJECT,
        caseStatus: ModerationCaseStatus.REJECTED,
        incidentStatus: IncidentStatus.REJECTED,
        reason: dto.reason,
      },
      correlationId,
    );
  }

  async requestInfo(
    id: string,
    moderator: AuthenticatedUser,
    dto: RequestInfoDto,
    correlationId: string,
  ): Promise<ModerationCaseDto> {
    const { moderationCase, action } = await this.prisma.$transaction(async (tx) => {
      const moderationCase = await this.claimUndecided(tx, id, ModerationCaseStatus.INFO_REQUESTED);
      const action = await tx.moderationAction.create({
        data: {
          caseId: id,
          moderatorId: moderator.id,
          action: ModerationActionType.REQUEST_INFO,
          reason: dto.message,
        },
      });
      return { moderationCase, action };
    });

    await this.events
      .publish(
        EventTypes.NOTIFICATION_REQUESTED,
        {
          userId: moderationCase.reporterId,
          type: NotificationType.MODERATION_INFO_REQUESTED,
          title: 'Cần bổ sung thông tin cho báo cáo',
          body: dto.message,
          data: { incidentId: moderationCase.incidentId, caseId: id },
          dedupeKey: `moderation-action:${action.id}`,
        },
        { correlationId, key: moderationCase.reporterId },
      )
      .catch((error: unknown) =>
        this.logger.error(
          { err: error, caseId: id, correlationId },
          'Failed to publish notification.requested',
        ),
      );
    return this.get(id);
  }

  /**
   * Records the decision and applies it to the incident in one database transaction:
   * if incident-service rejects the transition, the case update and action are rolled back.
   * incident-service then publishes `incident.verified` / `incident.rejected`.
   */
  private async decide(
    id: string,
    moderator: AuthenticatedUser,
    decision: Decision,
    correlationId: string,
  ): Promise<ModerationCaseDto> {
    await this.prisma.$transaction(
      async (tx) => {
        const moderationCase = await this.claimUndecided(tx, id, decision.caseStatus);
        await tx.moderationAction.create({
          data: {
            caseId: id,
            moderatorId: moderator.id,
            action: decision.action,
            reason: decision.reason,
          },
        });
        await this.applyToIncident(
          moderationCase.incidentId,
          decision,
          moderator.id,
          correlationId,
        );
      },
      { timeout: 15_000 },
    );
    this.logger.log(
      { caseId: id, decision: decision.action, moderatorId: moderator.id, correlationId },
      'Report moderated',
    );
    return this.get(id);
  }

  /** Moves an undecided case to `next`; compare-and-set prevents double decisions. */
  private async claimUndecided(
    tx: Prisma.TransactionClient,
    id: string,
    next: ModerationCaseStatus,
  ) {
    const { count } = await tx.moderationCase.updateMany({
      where: { id, status: { in: UNDECIDED_STATUSES } },
      data: { status: next },
    });
    if (count === 0) {
      const exists = await tx.moderationCase.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!exists) throw new ResourceNotFoundException('Moderation report', id);
      throw new ConflictException(`Report has already been ${exists.status.toLowerCase()}`);
    }
    return tx.moderationCase.findUniqueOrThrow({ where: { id } });
  }

  private async applyToIncident(
    incidentId: string,
    decision: Decision,
    actorId: string,
    correlationId: string,
  ): Promise<void> {
    try {
      await this.incidents.transition(
        incidentId,
        { status: decision.incidentStatus, actorId, reason: decision.reason },
        correlationId,
      );
    } catch (error) {
      // Idempotency: a previous attempt may have updated the incident and then failed to
      // commit locally. If the incident is already in the target status, accept it.
      const details =
        error instanceof AppException
          ? (error.details as { from?: string } | undefined)
          : undefined;
      if (
        error instanceof AppException &&
        error.code === ErrorCodes.INVALID_STATE_TRANSITION &&
        details?.from === decision.incidentStatus
      ) {
        return;
      }
      throw error;
    }
  }
}
