import { ConflictException, InvalidStateTransitionException } from '@app/common';
import { buildAppConfig } from '@app/config';
import { EventTypes, IncidentStatus, IncidentType } from '@app/contracts';
import { PrismaService } from '@app/database';
import { EventPublisher } from '@app/kafka';
import { CacheService } from '@app/redis';
import { IncidentsRepository } from './incidents.repository';
import { IncidentsService } from './incidents.service';

const config = buildAppConfig('incident-service', {
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  INTERNAL_API_KEY: 'internal-key-123456',
  DATABASE_URL: 'postgresql://unused',
});

function incident(status: IncidentStatus) {
  return {
    id: 'inc-1',
    reporterId: 'reporter-1',
    type: IncidentType.ACCIDENT,
    title: 'Va chạm',
    description: null,
    latitude: 21.03,
    longitude: 105.85,
    status,
    occurredAt: new Date('2026-10-31T08:00:00Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function setup(current: IncidentStatus, casUpdates = 1) {
  const tx = {
    incident: {
      updateMany: jest.fn().mockResolvedValue({ count: casUpdates }),
      findUniqueOrThrow: jest.fn(),
    },
    incidentHistory: { create: jest.fn() },
    incidentReport: { updateMany: jest.fn() },
  };
  tx.incident.findUniqueOrThrow.mockImplementation(() =>
    Promise.resolve(incident(tx.incident.updateMany.mock.calls[0]?.[0].data.status)),
  );
  const prisma = {
    incident: { findUnique: jest.fn().mockResolvedValue(incident(current)) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const events = { publish: jest.fn().mockResolvedValue(undefined) };
  const cache = { delete: jest.fn(), getJson: jest.fn(), setJson: jest.fn() };
  const service = new IncidentsService(
    prisma as unknown as PrismaService,
    {} as IncidentsRepository,
    cache as unknown as CacheService,
    events as unknown as EventPublisher,
    config,
  );
  return { service, prisma, tx, events, cache };
}

const command = (to: IncidentStatus, reason?: string) => ({
  incidentId: 'inc-1',
  to,
  actorId: 'moderator-1',
  reason,
  correlationId: 'corr-1',
});

describe('IncidentsService.transition', () => {
  it.each([
    [IncidentStatus.PENDING, IncidentStatus.VERIFIED, EventTypes.INCIDENT_VERIFIED],
    [IncidentStatus.VERIFIED, IncidentStatus.ACTIVE, EventTypes.INCIDENT_UPDATED],
    [IncidentStatus.ACTIVE, IncidentStatus.RESOLVED, EventTypes.INCIDENT_RESOLVED],
  ])('%s → %s records history, clears cache and publishes %s', async (from, to, eventType) => {
    const { service, tx, events, cache } = setup(from);

    const result = await service.transition(command(to));

    expect(result.status).toBe(to);
    expect(tx.incident.updateMany).toHaveBeenCalledWith({
      where: { id: 'inc-1', status: from },
      data: { status: to },
    });
    expect(tx.incidentHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'STATUS_CHANGED',
        previousStatus: from,
        newStatus: to,
        actorId: 'moderator-1',
      }),
    });
    expect(cache.delete).toHaveBeenCalledWith('incident:inc-1');
    expect(events.publish).toHaveBeenCalledWith(
      eventType,
      expect.objectContaining({
        incidentId: 'inc-1',
        status: to,
        previousStatus: from,
        actorId: 'moderator-1',
      }),
      { correlationId: 'corr-1', key: 'inc-1' },
    );
  });

  it('PENDING → REJECTED requires a reason and publishes it', async () => {
    const withoutReason = setup(IncidentStatus.PENDING);
    await expect(
      withoutReason.service.transition(command(IncidentStatus.REJECTED)),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(withoutReason.prisma.$transaction).not.toHaveBeenCalled();

    const withReason = setup(IncidentStatus.PENDING);
    await withReason.service.transition(command(IncidentStatus.REJECTED, 'Trùng lặp'));
    expect(withReason.events.publish).toHaveBeenCalledWith(
      EventTypes.INCIDENT_REJECTED,
      expect.objectContaining({ reason: 'Trùng lặp' }),
      expect.anything(),
    );
  });

  it('marks pending reports as accepted on verification', async () => {
    const { service, tx } = setup(IncidentStatus.PENDING);
    await service.transition(command(IncidentStatus.VERIFIED));
    expect(tx.incidentReport.updateMany).toHaveBeenCalledWith({
      where: { incidentId: 'inc-1', status: 'PENDING' },
      data: { status: 'ACCEPTED' },
    });
  });

  it('rejects transitions outside the lifecycle without writing anything', async () => {
    const { service, prisma, events } = setup(IncidentStatus.RESOLVED);
    await expect(service.transition(command(IncidentStatus.ACTIVE))).rejects.toBeInstanceOf(
      InvalidStateTransitionException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('detects a concurrent status change (compare-and-set miss)', async () => {
    const { service, events } = setup(IncidentStatus.PENDING, 0);
    await expect(service.transition(command(IncidentStatus.VERIFIED))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('keeps the committed change when publishing fails', async () => {
    const { service, events } = setup(IncidentStatus.PENDING);
    events.publish.mockRejectedValueOnce(new Error('kafka down'));
    await expect(service.transition(command(IncidentStatus.VERIFIED))).resolves.toMatchObject({
      status: IncidentStatus.VERIFIED,
    });
  });
});
