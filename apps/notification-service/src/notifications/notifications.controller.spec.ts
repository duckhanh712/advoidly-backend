import { PaginatedResult } from '@app/common';
import { UserRole } from '@app/contracts';
import { bearer, createTestApp, TestApp } from '../../../../test/utils/test-app';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

describe('NotificationsController (HTTP)', () => {
  let t: TestApp;
  const notifications = {
    list: jest
      .fn()
      .mockResolvedValue(new PaginatedResult([], { page: 1, limit: 20, total: 0, totalPages: 0 })),
  };

  beforeAll(async () => {
    t = await createTestApp('notification-service', {
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: notifications }],
    });
  });
  afterAll(() => t.close());

  it('serves the notification inbox', async () => {
    const res = await t.request({
      method: 'GET',
      url: '/api/v1/notifications',
      headers: bearer(t.jwt, UserRole.USER),
    });
    expect(res.statusCode).toBe(200);
  });

  it('no longer has GET /notifications/preferences (use /users/me/notification-preferences)', async () => {
    const res = await t.request({
      method: 'GET',
      url: '/api/v1/notifications/preferences',
      headers: bearer(t.jwt, UserRole.USER),
    });
    expect(res.statusCode).toBe(404);
  });
});
