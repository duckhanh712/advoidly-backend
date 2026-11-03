import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConflictException, ResourceNotFoundException } from '@app/common';
import { AppConfig, InjectAppConfig } from '@app/config';
import { AuthenticatedUser, IncidentStatus, UserRole } from '@app/contracts';
import { PrismaService } from '@app/database';
import { CacheService } from '@app/redis';
import { incidentCacheKey } from '../incidents/incident-cache';
import { canView } from '../incidents/incident-policy';
import { IncidentsService } from '../incidents/incidents.service';
import { EndReportResolution, EndReportResultDto } from './dto/end-report.dto';

/** Incidents that can still be reported as ended. */
export const ENDABLE_STATUSES: readonly IncidentStatus[] = [
  IncidentStatus.VERIFIED,
  IncidentStatus.ACTIVE,
];

/** Roles whose single "ended" report resolves an incident (ADR-014). */
export const IMMEDIATE_RESOLVE_ROLES: readonly UserRole[] = [UserRole.MODERATOR, UserRole.ADMIN];

const REASONS: Record<EndReportResolution, (count: number) => string> = {
  [EndReportResolution.REPORTER]: () => 'The reporter marked the incident as ended',
  [EndReportResolution.STAFF]: () => 'A moderator or admin marked the incident as ended',
  [EndReportResolution.COMMUNITY]: (count) => `${count} users reported the incident as ended`,
};

/**
 * "This incident has ended" reports (ADR-014). An incident is resolved immediately when the
 * report comes from its original reporter or from a moderator/admin, or when the number of
 * distinct users reporting it reaches INCIDENT_END_REPORTS_TO_RESOLVE.
 */
@Injectable()
export class IncidentEndReportsService {
  private readonly logger = new Logger(IncidentEndReportsService.name);
  private readonly threshold: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly incidents: IncidentsService,
    private readonly cache: CacheService,
    @InjectAppConfig() config: AppConfig,
  ) {
    this.threshold = config.incident.endReportsToResolve;
  }

  async create(
    incidentId: string,
    user: AuthenticatedUser,
    correlationId: string,
  ): Promise<EndReportResultDto> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      select: { status: true, reporterId: true },
    });
    const status = incident?.status as IncidentStatus | undefined;
    if (!incident || !status || !canView({ status, reporterId: incident.reporterId }, user)) {
      throw new ResourceNotFoundException('Incident', incidentId);
    }
    if (!ENDABLE_STATUSES.includes(status)) {
      throw new ConflictException(
        `Only VERIFIED or ACTIVE incidents can be reported as ended (current status: ${status})`,
        { status },
      );
    }

    try {
      await this.prisma.incidentEndReport.create({ data: { incidentId, reporterId: user.id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('You have already reported this incident as ended');
      }
      throw error;
    }

    const endReportCount = await this.prisma.incidentEndReport.count({ where: { incidentId } });
    const resolvedBy = this.resolutionFor(user, incident.reporterId, endReportCount);
    if (!resolvedBy) {
      // The cached incident detail carries endReportCount.
      await this.cache.delete(incidentCacheKey(incidentId));
      return { endReportCount, endReportsToResolve: this.threshold, status, resolvedBy: null };
    }

    await this.resolve(incidentId, user.id, REASONS[resolvedBy](endReportCount), correlationId);
    this.logger.log(
      { incidentId, resolvedBy, endReportCount, correlationId },
      'Incident resolved by end report',
    );
    return {
      endReportCount,
      endReportsToResolve: this.threshold,
      status: IncidentStatus.RESOLVED,
      resolvedBy,
    };
  }

  /** Which rule, if any, resolves the incident after this report. */
  resolutionFor(
    user: AuthenticatedUser,
    originalReporterId: string,
    endReportCount: number,
  ): EndReportResolution | null {
    if (user.id === originalReporterId) return EndReportResolution.REPORTER;
    if (IMMEDIATE_RESOLVE_ROLES.includes(user.role)) return EndReportResolution.STAFF;
    if (endReportCount >= this.threshold) return EndReportResolution.COMMUNITY;
    return null;
  }

  /**
   * Goes through the normal lifecycle transition (history, `incident.resolved`, cache).
   * Two reports arriving together can both try to resolve; the loser finds it already
   * RESOLVED, which is the outcome both wanted, so that is not an error.
   */
  private async resolve(
    incidentId: string,
    actorId: string,
    reason: string,
    correlationId: string,
  ): Promise<void> {
    try {
      await this.incidents.transition({
        incidentId,
        to: IncidentStatus.RESOLVED,
        actorId,
        reason,
        correlationId,
      });
    } catch (error) {
      const current = await this.prisma.incident.findUnique({
        where: { id: incidentId },
        select: { status: true },
      });
      if (current?.status !== IncidentStatus.RESOLVED) throw error;
    }
  }
}
