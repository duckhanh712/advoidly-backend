import {
  EventTypes,
  IncidentStatus,
  IncidentStatusChangedPayload,
  IncidentType,
} from '@app/contracts';
import { PrismaService } from '@app/database';
import { createEvent, EventConsumer } from '@app/kafka';
import { DuplicateDetector } from '../moderation/duplicate-detector';
import { ModerationEventsHandler } from './moderation-events.handler';

const INCIDENT_ID = '2f1c6e0a-8f0e-4a8e-9a55-0d4d1b2c3e4f';

function decisionEvent(
  type: typeof EventTypes.INCIDENT_VERIFIED | typeof EventTypes.INCIDENT_REJECTED,
  reason?: string,
) {
  const payload: IncidentStatusChangedPayload = {
    incidentId: INCIDENT_ID,
    reporterId: 'reporter',
    type: IncidentType.FLOODING,
    title: 'Ngập sâu phố Hàng Bài',
    description: null,
    status:
      type === EventTypes.INCIDENT_VERIFIED ? IncidentStatus.VERIFIED : IncidentStatus.REJECTED,
    previousStatus: IncidentStatus.PENDING,
    actorId: 'admin-1',
    reason,
    location: { latitude: 21.0245, longitude: 105.853 },
    occurredAt: '2026-11-04T08:00:00.000Z',
  };
  return createEvent(type, payload as never, {
    correlationId: 'corr-1',
    producer: 'incident-service',
  });
}

interface SetupOptions {
  alreadyProcessed?: boolean;
  existingCase?: { id: string } | null;
  closed?: number;
}

function setup({
  alreadyProcessed = false,
  existingCase = { id: 'case-1' },
  closed = 1,
}: SetupOptions = {}) {
  const tx = {
    moderationProcessedEvent: {
      createMany: jest.fn().mockResolvedValue({ count: alreadyProcessed ? 0 : 1 }),
    },
    moderationCase: {
      findUnique: jest.fn().mockResolvedValue(existingCase),
      updateMany: jest.fn().mockResolvedValue({ count: closed }),
      create: jest.fn().mockResolvedValue({ id: 'case-new' }),
    },
    moderationAction: { create: jest.fn() },
  };
  const prisma = { $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)) };
  const consumer = { on: jest.fn() };
  const handler = new ModerationEventsHandler(
    consumer as unknown as EventConsumer,
    prisma as unknown as PrismaService,
    {} as DuplicateDetector,
  );
  return { handler, tx, consumer };
}

const APPROVE = { status: 'APPROVED', action: 'APPROVE' } as const;
const REJECT = { status: 'REJECTED', action: 'REJECT' } as const;

describe('ModerationEventsHandler: syncing decisions made outside moderation', () => {
  it('subscribes to incident.created, incident.verified and incident.rejected', () => {
    const { handler, consumer } = setup();
    handler.onModuleInit();
    expect(consumer.on.mock.calls.map((c) => c[0])).toEqual([
      'incident.created',
      'incident.verified',
      'incident.rejected',
    ]);
  });

  it('closes an open case as APPROVED and records the admin as the deciding actor', async () => {
    const { handler, tx } = setup();
    const event = decisionEvent(EventTypes.INCIDENT_VERIFIED);

    await expect(handler.onIncidentDecided(event, APPROVE)).resolves.toBe('closed');

    expect(tx.moderationCase.updateMany).toHaveBeenCalledWith({
      where: { id: 'case-1', status: { in: ['OPEN', 'INFO_REQUESTED'] } },
      data: { status: 'APPROVED' },
    });
    expect(tx.moderationAction.create).toHaveBeenCalledWith({
      data: {
        caseId: 'case-1',
        moderatorId: 'admin-1',
        action: 'APPROVE',
        reason: null,
        metadata: { source: 'incident-service', eventId: event.eventId, correlationId: 'corr-1' },
      },
    });
  });

  it('closes an open case as REJECTED with the reason', async () => {
    const { handler, tx } = setup();
    await expect(
      handler.onIncidentDecided(
        decisionEvent(EventTypes.INCIDENT_REJECTED, 'Báo sai địa điểm'),
        REJECT,
      ),
    ).resolves.toBe('closed');
    expect(tx.moderationCase.updateMany.mock.calls[0][0].data).toEqual({ status: 'REJECTED' });
    expect(tx.moderationAction.create.mock.calls[0][0].data).toMatchObject({
      action: 'REJECT',
      reason: 'Báo sai địa điểm',
    });
  });

  it('leaves a case that a moderator already decided untouched (no second action)', async () => {
    const { handler, tx } = setup({ closed: 0 });
    await expect(
      handler.onIncidentDecided(decisionEvent(EventTypes.INCIDENT_VERIFIED), APPROVE),
    ).resolves.toBe('already-decided');
    expect(tx.moderationAction.create).not.toHaveBeenCalled();
  });

  it('creates the case already decided when the decision arrives before incident.created', async () => {
    const { handler, tx } = setup({ existingCase: null });

    await expect(
      handler.onIncidentDecided(decisionEvent(EventTypes.INCIDENT_VERIFIED), APPROVE),
    ).resolves.toBe('created-decided');

    expect(tx.moderationCase.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        incidentId: INCIDENT_ID,
        reporterId: 'reporter',
        incidentType: 'FLOODING',
        status: 'APPROVED',
        actions: { create: expect.objectContaining({ moderatorId: 'admin-1', action: 'APPROVE' }) },
      }),
    });
    expect(tx.moderationCase.updateMany).not.toHaveBeenCalled();
  });

  it('ignores a redelivered event', async () => {
    const { handler, tx } = setup({ alreadyProcessed: true });
    await expect(
      handler.onIncidentDecided(decisionEvent(EventTypes.INCIDENT_VERIFIED), APPROVE),
    ).resolves.toBe('duplicate-event');
    expect(tx.moderationCase.findUnique).not.toHaveBeenCalled();
  });
});
