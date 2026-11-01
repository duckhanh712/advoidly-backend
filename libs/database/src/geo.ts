import { Prisma } from '@prisma/client';

/**
 * Helpers for PostGIS queries issued through `$queryRaw`.
 *
 * Coordinates are always WGS84 (SRID 4326). Spatial columns are `geography(Point, 4326)`,
 * so distances and radii are in metres. Values are passed as bound parameters, never
 * interpolated into SQL text.
 */
export const MAX_RADIUS_METERS = 50_000;

/** `geography` point expression for a latitude/longitude pair. */
export function geographyPoint(latitude: number, longitude: number): Prisma.Sql {
  return Prisma.sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography`;
}

/** `geometry` envelope (lng/lat order) for bounding-box queries. */
export function envelope(
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number,
): Prisma.Sql {
  return Prisma.sql`ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326)`;
}
