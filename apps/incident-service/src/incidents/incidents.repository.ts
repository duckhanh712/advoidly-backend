import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IncidentStatus, IncidentType } from '@app/contracts';
import { envelope, geographyPoint, PrismaService } from '@app/database';
import { IncidentDto } from './dto/incident.dto';

export interface BoundingBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export interface IncidentListFilter {
  statuses: IncidentStatus[];
  types?: IncidentType[];
  reporterId?: string;
  bbox?: BoundingBox;
  skip: number;
  take: number;
}

export interface NearbyFilter {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  statuses: IncidentStatus[];
  types?: IncidentType[];
  limit: number;
}

interface IncidentRow {
  id: string;
  reporterId: string;
  type: IncidentType;
  title: string;
  description: string | null;
  status: IncidentStatus;
  latitude: number;
  longitude: number;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
  distanceMeters?: number;
}

const COLUMNS = Prisma.sql`
  i.id, i.reporter_id AS "reporterId", i.type, i.title, i.description, i.status,
  i.latitude, i.longitude, i.occurred_at AS "occurredAt", i.created_at AS "createdAt",
  i.updated_at AS "updatedAt"`;

/**
 * Spatial queries run in PostgreSQL/PostGIS (never in application memory) against the
 * GiST-indexed `location geography(Point,4326)` column.
 */
@Injectable()
export class IncidentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: IncidentListFilter): Promise<{ items: IncidentDto[]; total: number }> {
    const where = this.listConditions(filter);
    const [rows, [{ total }]] = await Promise.all([
      this.prisma.$queryRaw<IncidentRow[]>`
        SELECT ${COLUMNS} FROM incidents.incidents i
        WHERE ${where}
        ORDER BY i.occurred_at DESC, i.id
        LIMIT ${filter.take} OFFSET ${filter.skip}`,
      this.prisma.$queryRaw<[{ total: number }]>`
        SELECT count(*)::int AS total FROM incidents.incidents i WHERE ${where}`,
    ]);
    return { items: rows.map(toIncidentDto), total };
  }

  /** Incidents within `radiusMeters` of a point, closest first. */
  async findNearby(filter: NearbyFilter): Promise<IncidentDto[]> {
    const point = geographyPoint(filter.latitude, filter.longitude);
    const conditions = [
      Prisma.sql`ST_DWithin(i.location, ${point}, ${filter.radiusMeters})`,
      Prisma.sql`i.status = ANY(${filter.statuses}::incidents."IncidentStatus"[])`,
    ];
    if (filter.types?.length) {
      conditions.push(Prisma.sql`i.type = ANY(${filter.types}::incidents."IncidentType"[])`);
    }
    const rows = await this.prisma.$queryRaw<IncidentRow[]>`
      SELECT ${COLUMNS}, ST_Distance(i.location, ${point}) AS "distanceMeters"
      FROM incidents.incidents i
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY "distanceMeters", i.occurred_at DESC
      LIMIT ${filter.limit}`;
    return rows.map(toIncidentDto);
  }

  private listConditions(filter: IncidentListFilter): Prisma.Sql {
    const conditions = [
      Prisma.sql`i.status = ANY(${filter.statuses}::incidents."IncidentStatus"[])`,
    ];
    if (filter.types?.length) {
      conditions.push(Prisma.sql`i.type = ANY(${filter.types}::incidents."IncidentType"[])`);
    }
    if (filter.reporterId) conditions.push(Prisma.sql`i.reporter_id = ${filter.reporterId}::uuid`);
    if (filter.bbox) {
      const { minLat, minLng, maxLat, maxLng } = filter.bbox;
      // `&&` (bounding-box overlap) is answered by the GiST index.
      conditions.push(
        Prisma.sql`i.location && ${envelope(minLat, minLng, maxLat, maxLng)}::geography`,
      );
    }
    return Prisma.join(conditions, ' AND ');
  }
}

export function toIncidentDto(row: IncidentRow & { media?: IncidentDto['media'] }): IncidentDto {
  return {
    id: row.id,
    reporterId: row.reporterId,
    type: row.type,
    title: row.title,
    description: row.description,
    status: row.status,
    location: { latitude: row.latitude, longitude: row.longitude },
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.media ? { media: row.media } : {}),
    ...(row.distanceMeters !== undefined ? { distanceMeters: Math.round(row.distanceMeters) } : {}),
  };
}
