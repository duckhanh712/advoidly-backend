import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppConfig, InjectAppConfig } from '@app/config';
import { geographyPoint } from '@app/database';

export interface DuplicateCandidateQuery {
  incidentId: string;
  incidentType: string;
  latitude: number;
  longitude: number;
  occurredAt: Date;
}

export interface DuplicateRule {
  radiusMeters: number;
  windowMinutes: number;
}

/**
 * Rule-based duplicate hinting (no ML): an earlier, non-rejected case is a potential duplicate
 * when it has the same incident type, lies within `DUPLICATE_RADIUS_METERS`, and occurred within
 * `DUPLICATE_WINDOW_MINUTES` of the new report. Results are hints for moderators only; nothing
 * is merged or rejected automatically.
 */
@Injectable()
export class DuplicateDetector {
  readonly rule: DuplicateRule;

  constructor(@InjectAppConfig() config: AppConfig) {
    this.rule = {
      radiusMeters: config.moderation.duplicateRadiusMeters,
      windowMinutes: config.moderation.duplicateWindowMinutes,
    };
  }

  async findCandidates(
    tx: Prisma.TransactionClient,
    query: DuplicateCandidateQuery,
  ): Promise<string[]> {
    const windowMs = this.rule.windowMinutes * 60_000;
    const from = new Date(query.occurredAt.getTime() - windowMs);
    const to = new Date(query.occurredAt.getTime() + windowMs);
    const rows = await tx.$queryRaw<{ incidentId: string }[]>`
      SELECT c.incident_id AS "incidentId"
      FROM moderation.cases c
      WHERE c.incident_type = ${query.incidentType}
        AND c.incident_id <> ${query.incidentId}::uuid
        AND c.status <> 'REJECTED'::moderation."ModerationCaseStatus"
        AND c.occurred_at BETWEEN ${from} AND ${to}
        AND ST_DWithin(c.location, ${geographyPoint(query.latitude, query.longitude)}, ${this.rule.radiusMeters})
      ORDER BY c.occurred_at DESC
      LIMIT 20`;
    return rows.map((r) => r.incidentId);
  }
}
