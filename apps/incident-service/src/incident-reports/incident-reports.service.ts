import { Injectable } from '@nestjs/common';
import { IncidentReportStatus, Prisma } from '@prisma/client';
import {
  ConflictException,
  PaginatedResult,
  PaginationQueryDto,
  ResourceNotFoundException,
} from '@app/common';
import { AuthenticatedUser, IncidentStatus } from '@app/contracts';
import { PrismaService } from '@app/database';
import { CacheService } from '@app/redis';
import { incidentCacheKey } from '../incidents/incident-cache';
import { canView, isModerator } from '../incidents/incident-policy';
import { confirmationsWhere } from './confirmations';
import {
  CreateIncidentReportDto,
  IncidentConfirmationDto,
  IncidentReportDto,
} from './dto/incident-report.dto';

/** Incidents people can still confirm: approved and not yet over. */
export const CONFIRMABLE_STATUSES: readonly IncidentStatus[] = [
  IncidentStatus.VERIFIED,
  IncidentStatus.ACTIVE,
];

const SELECT = {
  id: true,
  incidentId: true,
  reporterId: true,
  description: true,
  status: true,
  createdAt: true,
} as const;

@Injectable()
export class IncidentReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Records that `user` confirms an incident (optionally with an update).
   * Each user has at most one report per incident, enforced by a unique index; the original
   * reporter already has one, so they cannot confirm their own incident.
   * Confirmations of an already verified incident are accepted without moderation.
   */
  async create(
    incidentId: string,
    user: AuthenticatedUser,
    dto: CreateIncidentReportDto,
  ): Promise<IncidentReportDto> {
    const incident = await this.findVisibleIncident(incidentId, user);
    if (!CONFIRMABLE_STATUSES.includes(incident.status)) {
      throw new ConflictException(
        `Only VERIFIED or ACTIVE incidents can be confirmed (current status: ${incident.status})`,
        { status: incident.status },
      );
    }

    let report: IncidentReportDto;
    try {
      report = await this.prisma.incidentReport.create({
        data: {
          incidentId,
          reporterId: user.id,
          description: dto.description,
          status: IncidentReportStatus.ACCEPTED,
        },
        select: SELECT,
      });
    } catch (error) {
      // Unique (incident_id, reporter_id) also covers two concurrent requests from the same user.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('You have already reported this incident');
      }
      throw error;
    }
    // The cached incident detail carries confirmationCount.
    await this.cache.delete(incidentCacheKey(incidentId));
    return report;
  }

  /**
   * Confirmations of an incident, newest first. Visible to whoever can see the incident.
   * The confirmer's id is shown to moderators only; everyone else gets `isMine`.
   */
  async list(
    incidentId: string,
    query: PaginationQueryDto,
    user?: AuthenticatedUser,
  ): Promise<PaginatedResult<IncidentConfirmationDto>> {
    const incident = await this.findVisibleIncident(incidentId, user);
    const where = confirmationsWhere(incidentId, incident.reporterId);
    const [rows, total] = await Promise.all([
      this.prisma.incidentReport.findMany({
        where,
        select: { id: true, reporterId: true, description: true, createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.incidentReport.count({ where }),
    ]);

    const showReporter = isModerator(user);
    const items = rows.map((row): IncidentConfirmationDto => ({
      id: row.id,
      description: row.description,
      createdAt: row.createdAt,
      isMine: row.reporterId === user?.id,
      ...(showReporter ? { reporterId: row.reporterId } : {}),
    }));
    return PaginatedResult.of(items, query, total);
  }

  /** Hidden incidents are reported as missing, like GET /incidents/{id}. */
  private async findVisibleIncident(incidentId: string, user?: AuthenticatedUser) {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      select: { status: true, reporterId: true },
    });
    const status = incident?.status as IncidentStatus | undefined;
    if (!incident || !status || !canView({ status, reporterId: incident.reporterId }, user)) {
      throw new ResourceNotFoundException('Incident', incidentId);
    }
    return { status, reporterId: incident.reporterId };
  }
}
