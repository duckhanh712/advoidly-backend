/**
 * Requires: `docker compose up -d`, migrations applied (`yarn prisma:migrate`) and a `.env`.
 * Run with `yarn test:integration`. Skipped when the database variables are not set.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ConflictException, ResourceNotFoundException } from '@app/common';
import type { AppConfig } from '@app/config';
import { AuthenticatedUser, IncidentStatus, IncidentType, UserRole } from '@app/contracts';
import { PaginationQueryDto } from '@app/common';
import { PrismaService } from '@app/database';
import type { CacheService } from '@app/redis';
// Integration tests may reach into a service to exercise its real SQL.
// eslint-disable-next-line no-restricted-imports
import { IncidentReportsService } from '../../apps/incident-service/src/incident-reports/incident-reports.service';

const ownerUrl = process.env.MIGRATION_DATABASE_URL;
const incidentUrl = process.env.INCIDENT_SERVICE_DATABASE_URL;
const describeIfDb = ownerUrl && incidentUrl ? describe : describe.skip;

const user = (role = UserRole.USER): AuthenticatedUser => ({
  id: randomUUID(),
  email: 'it@example.com',
  role,
});

describeIfDb('Incident confirmations against PostgreSQL', () => {
  const owner = new PrismaClient({ datasourceUrl: ownerUrl });
  // Connects as the least-privileged incident_service role, like the real service.
  const incidentDb = new PrismaService({ databaseUrl: incidentUrl } as AppConfig);
  // Redis is not under test here; cache invalidation is covered by unit tests.
  const noCache = { delete: async () => undefined } as unknown as CacheService;
  const service = new IncidentReportsService(incidentDb, noCache);
  const reporter = user();
  const verifiedId = randomUUID();
  const pendingId = randomUUID();

  beforeAll(async () => {
    for (const [id, status] of [
      [verifiedId, IncidentStatus.VERIFIED],
      [pendingId, IncidentStatus.PENDING],
    ] as const) {
      await owner.incident.create({
        data: {
          id,
          reporterId: reporter.id,
          type: IncidentType.FLOODING,
          title: 'Integration test incident',
          latitude: 21.0245,
          longitude: 105.853,
          status,
          occurredAt: new Date(),
          reports: { create: { reporterId: reporter.id, status: 'ACCEPTED' } },
        },
      });
    }
  });

  afterAll(async () => {
    await owner.incident.deleteMany({ where: { id: { in: [verifiedId, pendingId] } } });
    await Promise.all([owner.$disconnect(), incidentDb.$disconnect()]);
  });

  it('stores a confirmation as ACCEPTED, next to the original report', async () => {
    const neighbour = user();
    const report = await service.create(verifiedId, neighbour, { description: 'Vẫn còn ngập' });

    expect(report).toMatchObject({
      incidentId: verifiedId,
      reporterId: neighbour.id,
      status: 'ACCEPTED',
    });
    expect(await owner.incidentReport.count({ where: { incidentId: verifiedId } })).toBe(2);
  });

  it('refuses a second report from the same user', async () => {
    const neighbour = user();
    await service.create(verifiedId, neighbour, {});
    await expect(service.create(verifiedId, neighbour, {})).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('refuses the original reporter confirming their own incident', async () => {
    await expect(service.create(verifiedId, reporter, {})).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('refuses confirmations of a pending incident', async () => {
    await expect(service.create(pendingId, user(UserRole.MODERATOR), {})).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(service.create(pendingId, user(), {})).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });

  it('enforces one report per user in the database itself', async () => {
    await expect(
      owner.incidentReport.create({ data: { incidentId: verifiedId, reporterId: reporter.id } }),
    ).rejects.toMatchObject({
      code: 'P2002',
    } satisfies Partial<Prisma.PrismaClientKnownRequestError>);
  });

  it('lists confirmations without the original report, and counts them the same way', async () => {
    const { items, pagination } = await service.list(verifiedId, new PaginationQueryDto(), user());
    const confirmations = await owner.incidentReport.count({
      where: { incidentId: verifiedId, reporterId: { not: reporter.id } },
    });

    expect(pagination.total).toBe(confirmations);
    expect(items.length).toBe(confirmations);
    expect(items.every((c) => c.isMine === false && !('reporterId' in c))).toBe(true);
    const times = items.map((c) => new Date(c.createdAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times); // newest first
  });
});
