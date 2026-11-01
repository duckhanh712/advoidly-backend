import { UserRole } from '@app/contracts';
import { bearer, createTestApp, TestApp } from '../../../../test/utils/test-app';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';

const CASE_ID = '0b9f3c1e-5d2a-4c8e-9f10-2a3b4c5d6e7f';

describe('ModerationController authorization (HTTP)', () => {
  let t: TestApp;
  const moderation = {
    list: jest.fn().mockResolvedValue([]),
    get: jest.fn().mockResolvedValue({ id: CASE_ID }),
    approve: jest.fn().mockResolvedValue({ id: CASE_ID, status: 'APPROVED' }),
    reject: jest.fn().mockResolvedValue({ id: CASE_ID, status: 'REJECTED' }),
    requestInfo: jest.fn().mockResolvedValue({ id: CASE_ID, status: 'INFO_REQUESTED' }),
  };

  beforeAll(async () => {
    t = await createTestApp('moderation-service', {
      controllers: [ModerationController],
      providers: [{ provide: ModerationService, useValue: moderation }],
    });
  });
  afterAll(() => t.close());
  beforeEach(() => jest.clearAllMocks());

  const actions = [
    ['GET', '/api/v1/moderation/reports', undefined],
    ['GET', `/api/v1/moderation/reports/${CASE_ID}`, undefined],
    ['POST', `/api/v1/moderation/reports/${CASE_ID}/approve`, {}],
    ['POST', `/api/v1/moderation/reports/${CASE_ID}/reject`, { reason: 'Không xác minh được' }],
    [
      'POST',
      `/api/v1/moderation/reports/${CASE_ID}/request-info`,
      { message: 'Vui lòng bổ sung ảnh' },
    ],
  ] as const;

  it.each(actions)('%s %s → 401 without a token', async (method, url, payload) => {
    const res = await t.request({ method, url, payload });
    expect(res.statusCode).toBe(401);
  });

  it.each(actions)('%s %s → 403 for a regular user', async (method, url, payload) => {
    const res = await t.request({ method, url, payload, headers: bearer(t.jwt, UserRole.USER) });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
    expect(Object.values(moderation).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  });

  it.each([UserRole.MODERATOR, UserRole.ADMIN])('allows %s to moderate', async (role) => {
    for (const [method, url, payload] of actions) {
      const res = await t.request({ method, url, payload, headers: bearer(t.jwt, role) });
      expect(res.statusCode).toBe(200);
    }
  });

  it('passes the authenticated moderator and correlation id to the service', async () => {
    const moderatorId = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
    await t.request({
      method: 'POST',
      url: `/api/v1/moderation/reports/${CASE_ID}/approve`,
      payload: { note: 'ok' },
      headers: {
        ...bearer(t.jwt, UserRole.MODERATOR, moderatorId),
        'x-correlation-id': 'mod-trace-1',
      },
    });
    expect(moderation.approve).toHaveBeenCalledWith(
      CASE_ID,
      expect.objectContaining({ id: moderatorId, role: UserRole.MODERATOR }),
      { note: 'ok' },
      'mod-trace-1',
    );
  });

  it.each([
    ['missing', {}],
    ['too short', { reason: 'no' }],
    ['blank', { reason: '      ' }],
  ])('requires a rejection reason (%s)', async (_label, payload) => {
    const res = await t.request({
      method: 'POST',
      url: `/api/v1/moderation/reports/${CASE_ID}/reject`,
      payload,
      headers: bearer(t.jwt, UserRole.MODERATOR),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.details[0].field).toBe('reason');
    expect(moderation.reject).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID report id', async () => {
    const res = await t.request({
      method: 'GET',
      url: '/api/v1/moderation/reports/not-a-uuid',
      headers: bearer(t.jwt, UserRole.MODERATOR),
    });
    expect(res.statusCode).toBe(400);
  });
});
