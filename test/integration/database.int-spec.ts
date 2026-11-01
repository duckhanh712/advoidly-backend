/**
 * Requires: `docker compose up -d`, `yarn prisma:migrate` (or migrate:deploy) and a `.env`.
 * Run with `yarn test:integration`. Skipped when the database variables are not set.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '@app/config';
import { IncidentStatus, IncidentType } from '@app/contracts';
import { PrismaService } from '@app/database';
// Integration tests may reach into a service to exercise its real SQL against PostGIS.
// eslint-disable-next-line no-restricted-imports
import { IncidentsRepository } from '../../apps/incident-service/src/incidents/incidents.repository';

const ownerUrl = process.env.MIGRATION_DATABASE_URL;
const incidentUrl = process.env.INCIDENT_SERVICE_DATABASE_URL;
const describeIfDb = ownerUrl && incidentUrl ? describe : describe.skip;

describeIfDb('PostgreSQL + PostGIS foundation', () => {
  const owner = new PrismaClient({ datasourceUrl: ownerUrl });
  const incidentDb = new PrismaService({ databaseUrl: incidentUrl } as AppConfig);
  const repository = new IncidentsRepository(incidentDb);
  const reporterId = randomUUID();

  // Hoàn Kiếm Lake (Hà Nội) and two points ~1.1 km and ~1,150 km away (HCMC).
  const CENTER = { latitude: 21.0285, longitude: 105.8542 };
  const fixtures = [
    { id: randomUUID(), title: 'Near: ~0 m', latitude: 21.0286, longitude: 105.8543 },
    { id: randomUUID(), title: 'Near: ~1.1 km', latitude: 21.0385, longitude: 105.8542 },
    { id: randomUUID(), title: 'Far: Ho Chi Minh City', latitude: 10.7769, longitude: 106.7009 },
  ];

  beforeAll(async () => {
    await owner.incident.createMany({
      data: fixtures.map((f) => ({
        ...f,
        reporterId,
        type: IncidentType.TRAFFIC_JAM,
        status: IncidentStatus.ACTIVE,
        occurredAt: new Date(),
      })),
    });
  });

  afterAll(async () => {
    await owner.incident.deleteMany({ where: { reporterId } });
    await Promise.all([owner.$disconnect(), incidentDb.$disconnect()]);
  });

  it('has PostGIS installed', async () => {
    const [row] = await owner.$queryRaw<
      { version: string }[]
    >`SELECT postgis_lib_version() AS version`;
    expect(row.version).toMatch(/^3\./);
  });

  it('derives the geography column from latitude/longitude', async () => {
    const [row] = await owner.$queryRaw<{ wkt: string; srid: number }[]>`
      SELECT ST_AsText(location) AS wkt, ST_SRID(location) AS srid
      FROM incidents.incidents WHERE id = ${fixtures[0].id}::uuid`;
    expect(row).toEqual({ wkt: 'POINT(105.8543 21.0286)', srid: 4326 });
  });

  it('finds incidents within a radius, closest first, in metres', async () => {
    const results = await repository.findNearby({
      ...CENTER,
      radiusMeters: 2_000,
      statuses: [IncidentStatus.ACTIVE],
      limit: 50,
    });
    const ours = results.filter((r) => r.reporterId === reporterId);
    expect(ours.map((r) => r.title)).toEqual(['Near: ~0 m', 'Near: ~1.1 km']);
    expect(ours[1].distanceMeters).toBeGreaterThan(1_000);
    expect(ours[1].distanceMeters).toBeLessThan(1_200);
  });

  it('filters by bounding box', async () => {
    const { items } = await repository.list({
      statuses: [IncidentStatus.ACTIVE],
      reporterId,
      bbox: { minLat: 20.9, minLng: 105.7, maxLat: 21.1, maxLng: 105.95 },
      skip: 0,
      take: 50,
    });
    expect(items.map((i) => i.title).sort()).toEqual(['Near: ~0 m', 'Near: ~1.1 km']);
  });

  it('uses the GiST index for radius queries', async () => {
    await owner.$executeRawUnsafe('SET enable_seqscan = off');
    const plan = await owner.$queryRaw<{ 'QUERY PLAN': string }[]>`
      EXPLAIN SELECT id FROM incidents.incidents
      WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(105.8542, 21.0285), 4326)::geography, 2000)`;
    await owner.$executeRawUnsafe('RESET enable_seqscan');
    expect(plan.map((p) => p['QUERY PLAN']).join('\n')).toContain('incidents_location_idx');
  });

  it('isolates service schemas at the database level', async () => {
    await expect(
      incidentDb.$queryRaw`SELECT 1 FROM incidents.incidents LIMIT 1`,
    ).resolves.toBeDefined();
    await expect(incidentDb.$queryRaw`SELECT 1 FROM auth.users LIMIT 1`).rejects.toThrow(
      /permission denied/i,
    );
    await expect(incidentDb.$queryRaw`SELECT 1 FROM users.saved_areas LIMIT 1`).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('prevents service roles from changing the schema', async () => {
    await expect(
      incidentDb.$executeRawUnsafe('CREATE TABLE incidents.hack (id int)'),
    ).rejects.toThrow(/permission denied/i);
  });
});
