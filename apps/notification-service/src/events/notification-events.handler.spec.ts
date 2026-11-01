import { EventTypes, IncidentStatus, IncidentType } from '@app/contracts';
import { createEvent, EventConsumer } from '@app/kafka';
import { UserClient } from '../clients/user.client';
import {
  NotificationDispatcher,
  NotificationInput,
} from '../notifications/notification-dispatcher';
import { NotificationEventsHandler } from './notification-events.handler';

describe('NotificationEventsHandler', () => {
  const dispatcher = { recordAndSend: jest.fn().mockResolvedValue(0) };
  const users = { findAlertRecipients: jest.fn() };
  const handler = new NotificationEventsHandler(
    { on: jest.fn() } as unknown as EventConsumer,
    dispatcher as unknown as NotificationDispatcher,
    users as unknown as UserClient,
  );
  const verified = createEvent(
    EventTypes.INCIDENT_VERIFIED,
    {
      incidentId: 'inc-1',
      reporterId: 'reporter',
      type: IncidentType.FLOODING,
      title: 'Ngập sâu 40cm',
      description: null,
      status: IncidentStatus.VERIFIED,
      previousStatus: IncidentStatus.PENDING,
      actorId: 'mod',
      location: { latitude: 10.78, longitude: 106.7 },
      occurredAt: '2026-10-31T08:00:00Z',
    },
    { correlationId: 'corr-1', producer: 'incident-service' },
  );
  const recipient = (userId: string, quiet: [number, number] | null = null) => ({
    userId,
    savedAreaId: `area-${userId}`,
    savedAreaName: 'Nhà',
    distanceMeters: 120,
    quietHoursStart: quiet?.[0] ?? null,
    quietHoursEnd: quiet?.[1] ?? null,
  });

  beforeEach(() => jest.clearAllMocks());

  it('alerts nearby users and the reporter, without alerting the reporter twice', async () => {
    users.findAlertRecipients.mockResolvedValue([recipient('alice'), recipient('reporter')]);

    await handler.onIncidentVerified(verified);

    expect(users.findAlertRecipients).toHaveBeenCalledWith(
      { latitude: 10.78, longitude: 106.7, incidentType: IncidentType.FLOODING },
      'corr-1',
    );
    const inputs: NotificationInput[] = dispatcher.recordAndSend.mock.calls[0][1];
    expect(inputs.map((i) => [i.userId, i.type])).toEqual([
      ['alice', 'INCIDENT_NEARBY'],
      ['reporter', 'REPORT_VERIFIED'],
    ]);
    expect(inputs[0]).toMatchObject({
      title: 'Ngập lụt gần "Nhà"',
      dedupeKey: 'incident:inc-1:nearby',
    });
  });

  it('stores but does not push alerts during the recipient’s quiet hours', async () => {
    users.findAlertRecipients.mockResolvedValue([
      recipient('night-owl', [0, 24 - 1]),
      recipient('bob'),
    ]);
    jest.useFakeTimers().setSystemTime(new Date('2026-10-31T05:00:00Z')); // 12:00 in Vietnam

    await handler.onIncidentVerified(verified);
    jest.useRealTimers();

    const inputs: NotificationInput[] = dispatcher.recordAndSend.mock.calls[0][1];
    expect(inputs.find((i) => i.userId === 'night-owl')?.suppressPush).toBe(true);
    expect(inputs.find((i) => i.userId === 'bob')?.suppressPush).toBe(false);
  });

  it('propagates recipient lookup failures so the event is retried', async () => {
    users.findAlertRecipients.mockRejectedValue(new Error('user-service down'));
    await expect(handler.onIncidentVerified(verified)).rejects.toThrow('user-service down');
    expect(dispatcher.recordAndSend).not.toHaveBeenCalled();
  });
});
