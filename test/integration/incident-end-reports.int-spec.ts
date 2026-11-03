/**
 * Requires: `docker compose up -d`, migrations applied (`yarn prisma:migrate`) and a `.env`.
 * Run with `yarn test:integration`. Skipped when the database variables are not set.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ConflictException } from '@app/common';
import { buildAppConfig } from '@app/config';
import { AuthenticatedUser, IncidentStatus, IncidentType, UserRole } from '@app/contracts';
import { PrismaService } from '@app/database';
import type { EventPublisher } from '@app/kafka';
import type { CacheService } from '@app/redis';
// Integration tests may reach into a service to exercise its real SQL.
/* eslint-disable no-restricted-imports */
import { IncidentEndReportsService } from '../../apps/incident-service/src/incident-end-reports/incident-end-reports.service';
import { IncidentsRepository } from '../../apps/incident-service/src/incidents/incidents.repository';
import { IncidentsService } from '../../apps/incident-service/src/incidents/incidents.service';
/* eslint-enable no-restricted-imports */

const ownerUrl = process.env.MIGRATION_DATABASE_URL;
const incidentUrl = process.env.INCIDENT_SERVICE_DATABASE_URL;
const describeIfDb = ownerUrl && incidentUrl ? describe : describe.skip;

const user = (role = UserRole.USER): AuthenticatedUser => ({
  id: randomUUID(),
  email: 'it@example.com',
  role,
});

describeIfDb('Ending incidents against PostgreSQL (ADR-014)', () => {
  const owner = new PrismaClient({ datasourceUrl: ownerUrl });
  const config = buildAppConfig('incident-service', {
    JWT_ACCESS_SECRET: 'x'.repeat(32),
    INTERNAL_API_KEY: 'internal-key-123456',
    // Placeholder keeps the (skipped) suite loadable when no database is configured.
    DATABASE_URL: incidentUrl ?? 'postgresql://not-configured',
    INCIDENT_END_REPORTS_TO_RESOLVE: '3',
  });
  // Connects as the least-privileged incident_service role, like the real service.
  const db = new PrismaService(config);
  // Redis and Kafka are not under test here.
  const cache = {
    delete: async () => undefined,
    getJson: async () => undefined,
    setJson: async () => undefined,
  } as unknown as CacheService;
  const events = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as EventPublisher;
  const incidents = new IncidentsService(db, new IncidentsRepository(db), cache, events, config);
  const service = new IncidentEndReportsService(db, incidents, cache, config);
  const reporter = user();
  const created: string[] = [];

  async function newIncident(status: IncidentStatus): Promise<string> {
    const id = randomUUID();
    created.push(id);
    await owner.incident.create({
      data: {
        id,
        reporterId: reporter.id,
        type: IncidentType.TRAFFIC_JAM,
        title: 'Integration test incident',
        latitude: 21.0031,
        longitude: 105.8201,
        status,
        occurredAt: new Date(),
      },
    });
    return id;
  }

  afterAll(async () => {
    await owner.incident.deleteMany({ where: { id: { in: created } } });
    await Promise.all([owner.$disconnect(), db.$disconnect()]);
  });

  it('three different users resolve an ACTIVE incident; the first two only count', async () => {
    const id = await newIncident(IncidentStatus.ACTIVE);

    await expect(service.create(id, user(), 'c')).resolves.toMatchObject({
      endReportCount: 1,
      resolvedBy: null,
    });
    await expect(service.create(id, user(), 'c')).resolves.toMatchObject({
      endReportCount: 2,
      resolvedBy: null,
    });
    await expect(service.create(id, user(), 'c')).resolves.toMatchObject({
      endReportCount: 3,
      status: IncidentStatus.RESOLVED,
      resolvedBy: 'COMMUNITY',
    });

    const stored = await owner.incident.findUniqueOrThrow({
      where: { id },
      include: { history: true },
    });
    expect(stored.status).toBe(IncidentStatus.RESOLVED);
    expect(stored.history[0]).toMatchObject({
      action: 'STATUS_CHANGED',
      previousStatus: 'ACTIVE',
      newStatus: 'RESOLVED',
      metadata: { reason: '3 users reported the incident as ended' },
    });
  });

  it('the original reporter resolves a VERIFIED incident directly', async () => {
    const id = await newIncident(IncidentStatus.VERIFIED);
    await expect(service.create(id, reporter, 'c')).resolves.toMatchObject({
      resolvedBy: 'REPORTER',
    });
    expect((await owner.incident.findUniqueOrThrow({ where: { id } })).status).toBe(
      IncidentStatus.RESOLVED,
    );
  });

  it('an admin resolves at once', async () => {
    const id = await newIncident(IncidentStatus.ACTIVE);
    await expect(service.create(id, user(UserRole.ADMIN), 'c')).resolves.toMatchObject({
      resolvedBy: 'STAFF',
    });
  });

  it('refuses a second report from the same user, and reports on a resolved incident', async () => {
    const id = await newIncident(IncidentStatus.ACTIVE);
    const neighbour = user();
    await service.create(id, neighbour, 'c');
    await expect(service.create(id, neighbour, 'c')).rejects.toBeInstanceOf(ConflictException);

    await service.create(id, reporter, 'c'); // resolves
    await expect(service.create(id, user(), 'c')).rejects.toBeInstanceOf(ConflictException);
  });
});
