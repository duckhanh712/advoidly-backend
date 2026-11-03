/**
 * Requires: `docker compose up -d`, migrations applied (`yarn prisma:migrate`) and a `.env`.
 * Run with `yarn test:integration`. Skipped when the database variables are not set.
 */
import { ModerationCaseStatus, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { buildAppConfig } from '@app/config';
import { EventTypes, IncidentStatus, IncidentType } from '@app/contracts';
import { PrismaService } from '@app/database';
import { createEvent, EventConsumer, EventPublisher } from '@app/kafka';
// Integration tests may reach into a service to exercise its real SQL.
/* eslint-disable no-restricted-imports */
import { IncidentClient } from '../../apps/moderation-service/src/clients/incident.client';
import { ModerationEventsHandler } from '../../apps/moderation-service/src/events/moderation-events.handler';
import { DuplicateDetector } from '../../apps/moderation-service/src/moderation/duplicate-detector';
import { ListCasesQueryDto } from '../../apps/moderation-service/src/moderation/dto/moderation.dto';
import { ModerationService } from '../../apps/moderation-service/src/moderation/moderation.service';
/* eslint-enable no-restricted-imports */

const ownerUrl = process.env.MIGRATION_DATABASE_URL;
const moderationUrl = process.env.MODERATION_SERVICE_DATABASE_URL;
const describeIfDb = ownerUrl && moderationUrl ? describe : describe.skip;

describeIfDb('Moderation queue stays in sync with incident decisions (TODO 1.6)', () => {
  const owner = new PrismaClient({ datasourceUrl: ownerUrl });
  const config = buildAppConfig('moderation-service', {
    JWT_ACCESS_SECRET: 'x'.repeat(32),
    INTERNAL_API_KEY: 'internal-key-123456',
    // Placeholder keeps the (skipped) suite loadable when no database is configured.
    DATABASE_URL: moderationUrl ?? 'postgresql://not-configured',
  });
  // Connects as the least-privileged moderation_service role, like the real service.
  const db = new PrismaService(config);
  const handler = new ModerationEventsHandler(
    { on: () => undefined } as unknown as EventConsumer,
    db,
    new DuplicateDetector(config),
  );
  // Only list() is used, which needs neither incident-service nor Kafka.
  const moderation = new ModerationService(db, {} as IncidentClient, {} as EventPublisher);
  const incidentIds: string[] = [];

  const snapshot = (incidentId: string) => ({
    incidentId,
    reporterId: randomUUID(),
    type: IncidentType.ROAD_CLOSURE,
    title: 'Integration test incident',
    description: null,
    location: { latitude: 16.0544, longitude: 108.2022 },
    occurredAt: new Date().toISOString(),
  });
  const ctx = { correlationId: 'it-sync', producer: 'incident-service' };
  const created = (id: string) =>
    createEvent(
      EventTypes.INCIDENT_CREATED,
      { ...snapshot(id), status: IncidentStatus.PENDING },
      ctx,
    );
  const verified = (id: string, actorId: string) =>
    createEvent(
      EventTypes.INCIDENT_VERIFIED,
      {
        ...snapshot(id),
        status: IncidentStatus.VERIFIED,
        previousStatus: IncidentStatus.PENDING,
        actorId,
      },
      ctx,
    );

  async function openQueueIds(): Promise<string[]> {
    const query = Object.assign(new ListCasesQueryDto(), {
      limit: 100,
      status: ModerationCaseStatus.OPEN,
    });
    return (await moderation.list(query)).items.map((c) => c.incidentId);
  }

  afterAll(async () => {
    await owner.moderationCase.deleteMany({ where: { incidentId: { in: incidentIds } } });
    await Promise.all([owner.$disconnect(), db.$disconnect()]);
  });

  it('an admin decision removes the case from the review queue and records the admin', async () => {
    const id = randomUUID();
    incidentIds.push(id);
    const adminId = randomUUID();

    await handler.onIncidentCreated(created(id));
    expect(await openQueueIds()).toContain(id);

    await expect(
      handler.onIncidentDecided(verified(id, adminId), { status: 'APPROVED', action: 'APPROVE' }),
    ).resolves.toBe('closed');

    expect(await openQueueIds()).not.toContain(id);
    const stored = await owner.moderationCase.findUniqueOrThrow({
      where: { incidentId: id },
      include: { actions: true },
    });
    expect(stored.status).toBe('APPROVED');
    expect(stored.actions).toEqual([
      expect.objectContaining({ action: 'APPROVE', moderatorId: adminId }),
    ]);
  });

  it('a decision that arrives before incident.created is not reopened by it', async () => {
    const id = randomUUID();
    incidentIds.push(id);

    await handler.onIncidentDecided(verified(id, randomUUID()), {
      status: 'APPROVED',
      action: 'APPROVE',
    });
    await handler.onIncidentCreated(created(id));

    expect(
      (await owner.moderationCase.findUniqueOrThrow({ where: { incidentId: id } })).status,
    ).toBe('APPROVED');
    expect(await openQueueIds()).not.toContain(id);
  });

  it('a redelivered decision event adds no second action', async () => {
    const id = randomUUID();
    incidentIds.push(id);
    const event = verified(id, randomUUID());

    await handler.onIncidentCreated(created(id));
    await handler.onIncidentDecided(event, { status: 'APPROVED', action: 'APPROVE' });
    await expect(
      handler.onIncidentDecided(event, { status: 'APPROVED', action: 'APPROVE' }),
    ).resolves.toBe('duplicate-event');
    expect(await owner.moderationAction.count({ where: { case: { incidentId: id } } })).toBe(1);
  });
});
