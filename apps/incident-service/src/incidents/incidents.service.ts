import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Incident, IncidentHistoryAction, Prisma } from '@prisma/client';
import {
  AppException,
  ConflictException,
  ErrorCodes,
  ForbiddenException,
  PaginatedResult,
  ResourceNotFoundException,
} from '@app/common';
import { AppConfig, InjectAppConfig } from '@app/config';
import {
  AuthenticatedUser,
  EventPayloadMap,
  EventTypes,
  IncidentSnapshot,
  IncidentStatus,
  IncidentType,
} from '@app/contracts';
import { PrismaService } from '@app/database';
import { EventPublisher } from '@app/kafka';
import { CacheService } from '@app/redis';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { IncidentDto, IncidentHistoryDto } from './dto/incident.dto';
import { ListIncidentsQueryDto, NearbyIncidentsQueryDto } from './dto/query-incidents.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import {
  assertBoundingBox,
  assertOccurredAt,
  canView,
  isModerator,
  resolveListStatuses,
} from './incident-policy';
import { assertTransition } from './incident-status.machine';
import { IncidentsRepository, toIncidentDto } from './incidents.repository';

const cacheKey = (id: string) => `incident:${id}`;
const CONTENT_FIELDS = ['type', 'title', 'description'] as const;

type IncidentEventType =
  | typeof EventTypes.INCIDENT_CREATED
  | typeof EventTypes.INCIDENT_VERIFIED
  | typeof EventTypes.INCIDENT_UPDATED
  | typeof EventTypes.INCIDENT_RESOLVED
  | typeof EventTypes.INCIDENT_REJECTED;

export interface TransitionCommand {
  incidentId: string;
  to: IncidentStatus;
  actorId: string;
  reason?: string;
  correlationId: string;
}

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: IncidentsRepository,
    private readonly cache: CacheService,
    private readonly events: EventPublisher,
    @InjectAppConfig() private readonly config: AppConfig,
  ) {}

  async create(
    user: AuthenticatedUser,
    dto: CreateIncidentDto,
    correlationId: string,
  ): Promise<IncidentDto> {
    const occurredAt = dto.occurredAt ?? new Date();
    assertOccurredAt(occurredAt);

    const incident = await this.prisma.incident.create({
      data: {
        reporterId: user.id,
        type: dto.type,
        title: dto.title,
        description: dto.description,
        latitude: dto.latitude,
        longitude: dto.longitude,
        occurredAt,
        reports: { create: { reporterId: user.id, description: dto.description } },
        media: { create: (dto.media ?? []).map((m) => ({ mediaUrl: m.url, mediaType: m.type })) },
        history: {
          create: {
            actorId: user.id,
            action: IncidentHistoryAction.CREATED,
            newStatus: IncidentStatus.PENDING,
          },
        },
      },
      include: { media: { select: { id: true, mediaUrl: true, mediaType: true } } },
    });

    console.log('Incident created----------:', incident.id, 'by user:', user.id, 'correlationId:', correlationId);

    await this.publishSafely(EventTypes.INCIDENT_CREATED, snapshot(incident), correlationId);
    return toIncidentDto({
      ...incident,
      status: incident.status as IncidentStatus,
      type: incident.type as IncidentType,
    });
  }

  async list(
    query: ListIncidentsQueryDto,
    user?: AuthenticatedUser,
  ): Promise<PaginatedResult<IncidentDto>> {
    if (query.mine && !user) throw new ForbiddenException('Sign in to list your own reports');
    const bbox =
      query.minLat !== undefined
        ? {
            minLat: query.minLat,
            minLng: query.minLng!,
            maxLat: query.maxLat!,
            maxLng: query.maxLng!,
          }
        : undefined;
    if (bbox) assertBoundingBox(bbox);

    const { items, total } = await this.repository.list({
      statuses: resolveListStatuses(query.statuses, user, query.mine ?? false),
      types: query.types,
      reporterId: query.mine ? user!.id : undefined,
      bbox,
      skip: query.skip,
      take: query.limit,
    });
    return PaginatedResult.of(items, query, total);
  }

  findNearby(query: NearbyIncidentsQueryDto, user?: AuthenticatedUser): Promise<IncidentDto[]> {
    return this.repository.findNearby({
      latitude: query.latitude,
      longitude: query.longitude,
      radiusMeters: query.radiusMeters,
      // Nearby shows what is happening now; moderators also see reports awaiting review.
      statuses: isModerator(user)
        ? [IncidentStatus.PENDING, IncidentStatus.VERIFIED, IncidentStatus.ACTIVE]
        : [IncidentStatus.VERIFIED, IncidentStatus.ACTIVE],
      types: query.types,
      limit: query.limit,
    });
  }

  async findOne(id: string, user?: AuthenticatedUser): Promise<IncidentDto> {
    let incident = await this.cache.getJson<IncidentDto>(cacheKey(id));
    if (!incident) {
      const row = await this.prisma.incident.findUnique({
        where: { id },
        include: { media: { select: { id: true, mediaUrl: true, mediaType: true } } },
      });
      if (!row) throw new ResourceNotFoundException('Incident', id);
      incident = toIncidentDto({
        ...row,
        status: row.status as IncidentStatus,
        type: row.type as IncidentType,
      });
      await this.cache.setJson(cacheKey(id), incident, this.config.incident.cacheTtlSeconds);
    }
    // Hidden incidents are reported as missing rather than forbidden, to avoid leaking ids.
    if (!canView(incident, user)) throw new ResourceNotFoundException('Incident', id);
    return incident;
  }

  async history(id: string, user: AuthenticatedUser): Promise<IncidentHistoryDto[]> {
    const incident = await this.prisma.incident.findUnique({
      where: { id },
      select: { reporterId: true },
    });
    if (!incident) throw new ResourceNotFoundException('Incident', id);
    if (incident.reporterId !== user.id && !isModerator(user)) {
      throw new ForbiddenException('Only the reporter or moderators can view incident history');
    }
    return this.prisma.incidentHistory.findMany({
      where: { incidentId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        actorId: true,
        action: true,
        previousStatus: true,
        newStatus: true,
        metadata: true,
        createdAt: true,
      },
    }) as Promise<IncidentHistoryDto[]>;
  }

  async update(
    id: string,
    dto: UpdateIncidentDto,
    user: AuthenticatedUser,
    correlationId: string,
  ): Promise<IncidentDto> {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    const currentStatus = incident?.status as IncidentStatus | undefined;
    if (
      !incident ||
      !currentStatus ||
      !canView({ reporterId: incident.reporterId, status: currentStatus }, user)
    ) {
      throw new ResourceNotFoundException('Incident', id);
    }

    const changes: Prisma.IncidentUpdateInput = {};
    for (const field of CONTENT_FIELDS) {
      if (dto[field] !== undefined && dto[field] !== incident[field]) changes[field] = dto[field];
    }
    const changedFields = Object.keys(changes);

    if (dto.status !== undefined && !isModerator(user)) {
      throw new ForbiddenException('Only moderators can change incident status');
    }
    if (changedFields.length > 0) {
      const isReporterEditingPending =
        incident.reporterId === user.id && currentStatus === IncidentStatus.PENDING;
      if (!isReporterEditingPending && !isModerator(user)) {
        throw new ForbiddenException('Reports can only be edited by their reporter while pending');
      }
      const updated = await this.prisma.incident.update({
        where: { id },
        data: {
          ...changes,
          history: {
            create: {
              actorId: user.id,
              action: IncidentHistoryAction.UPDATED,
              metadata: { changedFields },
            },
          },
        },
      });
      await this.cache.delete(cacheKey(id));
      await this.publishSafely(
        EventTypes.INCIDENT_UPDATED,
        { ...snapshot(updated), actorId: user.id, changedFields },
        correlationId,
      );
    }

    if (dto.status !== undefined && dto.status !== currentStatus) {
      return this.transition({
        incidentId: id,
        to: dto.status,
        actorId: user.id,
        reason: dto.reason,
        correlationId,
      });
    }
    return this.findOne(id, user);
  }

  /**
   * Applies a lifecycle transition, records history and publishes the matching event.
   * Used by PATCH (moderators) and by moderation-service through the internal API.
   */
  async transition(command: TransitionCommand): Promise<IncidentDto> {
    const { incidentId, to, actorId, reason, correlationId } = command;
    const incident = await this.prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) throw new ResourceNotFoundException('Incident', incidentId);

    const from = incident.status as IncidentStatus;
    assertTransition(from, to);
    if (to === IncidentStatus.REJECTED && !reason) {
      throw new AppException(
        ErrorCodes.VALIDATION_FAILED,
        'A reason is required to reject an incident',
        HttpStatus.BAD_REQUEST,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Compare-and-set on the previous status prevents lost updates from concurrent moderators.
      const { count } = await tx.incident.updateMany({
        where: { id: incidentId, status: from },
        data: { status: to },
      });
      if (count === 0)
        throw new ConflictException('Incident was modified concurrently; reload and retry');

      await tx.incidentHistory.create({
        data: {
          incidentId,
          actorId,
          action: IncidentHistoryAction.STATUS_CHANGED,
          previousStatus: from,
          newStatus: to,
          metadata: reason ? { reason } : undefined,
        },
      });
      if (to === IncidentStatus.VERIFIED || to === IncidentStatus.REJECTED) {
        await tx.incidentReport.updateMany({
          where: { incidentId, status: 'PENDING' },
          data: { status: to === IncidentStatus.VERIFIED ? 'ACCEPTED' : 'REJECTED' },
        });
      }
      return tx.incident.findUniqueOrThrow({ where: { id: incidentId } });
    });

    await this.cache.delete(cacheKey(incidentId));
    const base = { ...snapshot(updated), previousStatus: from, actorId };
    switch (to) {
      case IncidentStatus.VERIFIED:
        await this.publishSafely(EventTypes.INCIDENT_VERIFIED, { ...base, reason }, correlationId);
        break;
      case IncidentStatus.RESOLVED:
        await this.publishSafely(EventTypes.INCIDENT_RESOLVED, { ...base, reason }, correlationId);
        break;
      case IncidentStatus.REJECTED:
        await this.publishSafely(
          EventTypes.INCIDENT_REJECTED,
          { ...base, reason: reason! },
          correlationId,
        );
        break;
      default:
        await this.publishSafely(
          EventTypes.INCIDENT_UPDATED,
          { ...base, changedFields: ['status'] },
          correlationId,
        );
    }

    this.logger.log({ incidentId, from, to, actorId, correlationId }, 'Incident status changed');
    return toIncidentDto({ ...updated, status: to, type: updated.type as IncidentType });
  }

  /**
   * The database change is already committed; a failed publish is logged, not rethrown,
   * so the API reflects the stored state. Closing this gap needs a transactional outbox
   * (ADR-007).
   */
  private async publishSafely<K extends IncidentEventType>(
    eventType: K,
    payload: EventPayloadMap[K],
    correlationId: string,
  ): Promise<void> {
    try {
      await this.events.publish(eventType, payload, { correlationId, key: payload.incidentId });
    } catch (error) {
      this.logger.error(
        { err: error, eventType, incidentId: payload.incidentId, correlationId },
        'Failed to publish incident event',
      );
    }
  }
}

function snapshot(incident: Incident): IncidentSnapshot {
  return {
    incidentId: incident.id,
    reporterId: incident.reporterId,
    type: incident.type as IncidentType,
    title: incident.title,
    description: incident.description,
    status: incident.status as IncidentStatus,
    location: { latitude: incident.latitude, longitude: incident.longitude },
    occurredAt: incident.occurredAt.toISOString(),
  };
}
