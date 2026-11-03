import { PaginatedResult } from '@app/common';
import { UserRole } from '@app/contracts';
import { bearer, createTestApp, TestApp } from '../../../../test/utils/test-app';
import { IncidentReportsController } from './incident-reports.controller';
import { IncidentReportsService } from './incident-reports.service';

const INCIDENT_ID = '2f1c6e0a-8f0e-4a8e-9a55-0d4d1b2c3e4f';
const USER_ID = '11111111-2222-4333-8444-555555555555';
const url = `/api/v1/incidents/${INCIDENT_ID}/reports`;

describe('/incidents/{id}/reports (HTTP)', () => {
  let t: TestApp;
  const reports = {
    create: jest.fn().mockResolvedValue({ id: 'report-1', status: 'ACCEPTED' }),
    list: jest
      .fn()
      .mockResolvedValue(new PaginatedResult([], { page: 1, limit: 20, total: 0, totalPages: 0 })),
  };

  beforeAll(async () => {
    t = await createTestApp('incident-service', {
      controllers: [IncidentReportsController],
      providers: [{ provide: IncidentReportsService, useValue: reports }],
    });
  });
  afterAll(() => t.close());
  beforeEach(() => jest.clearAllMocks());

  const post = (payload: object, headers = bearer(t.jwt, UserRole.USER, USER_ID), path = url) =>
    t.request({ method: 'POST', url: path, payload, headers });

  it('requires a signed-in user', async () => {
    const res = await t.request({ method: 'POST', url, payload: {} });
    expect(res.statusCode).toBe(401);
    expect(reports.create).not.toHaveBeenCalled();
  });

  it('creates a report for the caller and returns 201', async () => {
    const res = await post({ description: '  Vẫn còn ngập 40cm  ' });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toEqual({ id: 'report-1', status: 'ACCEPTED' });
    expect(reports.create).toHaveBeenCalledWith(
      INCIDENT_ID,
      expect.objectContaining({ id: USER_ID, role: UserRole.USER }),
      { description: 'Vẫn còn ngập 40cm' },
    );
  });

  it('accepts an empty body as a plain confirmation', async () => {
    const res = await post({});
    expect(res.statusCode).toBe(201);
    expect(reports.create.mock.calls[0][2].description).toBeUndefined();
  });

  it('treats a blank description as no description', async () => {
    await post({ description: '    ' });
    expect(reports.create.mock.calls[0][2].description).toBeUndefined();
  });

  it.each([
    ['a description over 2000 characters', { description: 'x'.repeat(2001) }, 'description'],
    ['a non-text description', { description: 42 }, 'description'],
    ['an unknown field', { status: 'ACCEPTED' }, 'status'],
  ])('rejects %s', async (_label, payload, field) => {
    const res = await post(payload);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.details.map((d: { field: string }) => d.field)).toEqual([field]);
    expect(reports.create).not.toHaveBeenCalled();
  });

  it('rejects an incident id that is not a UUID', async () => {
    const res = await post(
      {},
      bearer(t.jwt, UserRole.USER),
      '/api/v1/incidents/not-a-uuid/reports',
    );
    expect(res.statusCode).toBe(400);
  });

  describe('GET', () => {
    it('is public: guests can read confirmations', async () => {
      const res = await t.request({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      expect(reports.list).toHaveBeenCalledWith(
        INCIDENT_ID,
        expect.objectContaining({ page: 1, limit: 20 }),
        undefined,
      );
      expect(res.json().meta.pagination).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 });
    });

    it('passes the signed-in user so the service can set isMine', async () => {
      await t.request({
        method: 'GET',
        url: `${url}?page=2&limit=5`,
        headers: bearer(t.jwt, UserRole.USER, USER_ID),
      });
      expect(reports.list).toHaveBeenCalledWith(
        INCIDENT_ID,
        expect.objectContaining({ page: 2, limit: 5 }),
        expect.objectContaining({ id: USER_ID }),
      );
    });

    it.each([
      ['limit above 100', '?limit=101', 'limit'],
      ['page 0', '?page=0', 'page'],
    ])('rejects %s', async (_label, qs, field) => {
      const res = await t.request({ method: 'GET', url: `${url}${qs}` });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.details.map((d: { field: string }) => d.field)).toEqual([field]);
    });
  });
});
