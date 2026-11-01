import {
  AppException,
  ConflictException,
  ErrorCodes,
  ResourceNotFoundException,
} from '@app/common';
import { EventTypes, IncidentStatus, UserRole } from '@app/contracts';
import { PrismaService } from '@app/database';
import { EventPublisher } from '@app/kafka';
import { HttpStatus } from '@nestjs/common';
import { IncidentClient } from '../clients/incident.client';
import { ModerationService } from './moderation.service';

const moderator = { id: 'mod-1', email: 'm@example.com', role: UserRole.MODERATOR };
const storedCase = { id: 'case-1', incidentId: 'inc-1', reporterId: 'reporter-1', status: 'OPEN' };

function setup({ claimed = 1, existingStatus = 'APPROVED' } = {}) {
  const tx = {
    moderationCase: {
      updateMany: jest.fn().mockResolvedValue({ count: claimed }),
      findUnique: jest.fn().mockResolvedValue(existingStatus ? { status: existingStatus } : null),
      findUniqueOrThrow: jest.fn().mockResolvedValue(storedCase),
    },
    moderationAction: { create: jest.fn().mockResolvedValue({ id: 'action-1' }) },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    moderationCase: { findUnique: jest.fn().mockResolvedValue({ ...storedCase, actions: [] }) },
  };
  const incidents = { transition: jest.fn().mockResolvedValue({ id: 'inc-1' }) };
  const events = { publish: jest.fn().mockResolvedValue(undefined) };
  const service = new ModerationService(
    prisma as unknown as PrismaService,
    incidents as unknown as IncidentClient,
    events as unknown as EventPublisher,
  );
  return { service, tx, incidents, events };
}

describe('ModerationService', () => {
  it('approval records the action and verifies the incident with the moderator as actor', async () => {
    const { service, tx, incidents } = setup();
    await service.approve('case-1', moderator, { note: 'Đã xác minh' }, 'corr-1');

    expect(tx.moderationCase.updateMany).toHaveBeenCalledWith({
      where: { id: 'case-1', status: { in: ['OPEN', 'INFO_REQUESTED'] } },
      data: { status: 'APPROVED' },
    });
    expect(tx.moderationAction.create).toHaveBeenCalledWith({
      data: { caseId: 'case-1', moderatorId: 'mod-1', action: 'APPROVE', reason: 'Đã xác minh' },
    });
    expect(incidents.transition).toHaveBeenCalledWith(
      'inc-1',
      { status: IncidentStatus.VERIFIED, actorId: 'mod-1', reason: 'Đã xác minh' },
      'corr-1',
    );
  });

  it('rejection forwards the reason to incident-service', async () => {
    const { service, incidents } = setup();
    await service.reject('case-1', moderator, { reason: 'Thông tin sai' }, 'corr-1');
    expect(incidents.transition).toHaveBeenCalledWith(
      'inc-1',
      { status: IncidentStatus.REJECTED, actorId: 'mod-1', reason: 'Thông tin sai' },
      'corr-1',
    );
  });

  it('refuses to decide a case twice', async () => {
    const { service, incidents } = setup({ claimed: 0, existingStatus: 'APPROVED' });
    await expect(service.approve('case-1', moderator, {}, 'c')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(incidents.transition).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown case', async () => {
    const { service } = setup({ claimed: 0, existingStatus: '' });
    await expect(service.approve('nope', moderator, {}, 'c')).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });

  it('rolls back (rethrows) when incident-service refuses the transition', async () => {
    const { service, incidents } = setup();
    incidents.transition.mockRejectedValue(
      new AppException(ErrorCodes.INVALID_STATE_TRANSITION, 'no', HttpStatus.CONFLICT, {
        from: 'RESOLVED',
        to: 'VERIFIED',
      }),
    );
    await expect(service.approve('case-1', moderator, {}, 'c')).rejects.toMatchObject({
      code: ErrorCodes.INVALID_STATE_TRANSITION,
    });
  });

  it('treats an incident already in the target status as success (safe retry)', async () => {
    const { service, incidents } = setup();
    incidents.transition.mockRejectedValue(
      new AppException(ErrorCodes.INVALID_STATE_TRANSITION, 'no', HttpStatus.CONFLICT, {
        from: 'VERIFIED',
        to: 'VERIFIED',
      }),
    );
    await expect(service.approve('case-1', moderator, {}, 'c')).resolves.toBeDefined();
  });

  it('request-info notifies the reporter after recording the action', async () => {
    const { service, events, incidents } = setup();
    await service.requestInfo('case-1', moderator, { message: 'Cần thêm ảnh' }, 'corr-9');

    expect(incidents.transition).not.toHaveBeenCalled();
    expect(events.publish).toHaveBeenCalledWith(
      EventTypes.NOTIFICATION_REQUESTED,
      expect.objectContaining({
        userId: 'reporter-1',
        type: 'MODERATION_INFO_REQUESTED',
        body: 'Cần thêm ảnh',
        dedupeKey: 'moderation-action:action-1',
      }),
      { correlationId: 'corr-9', key: 'reporter-1' },
    );
  });
});
