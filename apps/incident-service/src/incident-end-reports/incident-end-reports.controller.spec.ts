import { UserRole } from '@app/contracts';
import { bearer, createTestApp, TestApp } from '../../../../test/utils/test-app';
import { IncidentEndReportsController } from './incident-end-reports.controller';
import { IncidentEndReportsService } from './incident-end-reports.service';

const INCIDENT_ID = '2f1c6e0a-8f0e-4a8e-9a55-0d4d1b2c3e4f';
const USER_ID = '11111111-2222-4333-8444-555555555555';
const url = `/api/v1/incidents/${INCIDENT_ID}/end-reports`;

describe('POST /incidents/{id}/end-reports (HTTP)', () => {
  let t: TestApp;
  const endReports = {
    create: jest.fn().mockResolvedValue({
      endReportCount: 1,
      endReportsToResolve: 3,
      status: 'ACTIVE',
      resolvedBy: null,
    }),
  };

  beforeAll(async () => {
    t = await createTestApp('incident-service', {
      controllers: [IncidentEndReportsController],
      providers: [{ provide: IncidentEndReportsService, useValue: endReports }],
    });
  });
  afterAll(() => t.close());
  beforeEach(() => jest.clearAllMocks());

  it('requires a signed-in user', async () => {
    const res = await t.request({ method: 'POST', url });
    expect(res.statusCode).toBe(401);
    expect(endReports.create).not.toHaveBeenCalled();
  });

  it('records the report for the caller and returns 201 with the tally', async () => {
    const res = await t.request({
      method: 'POST',
      url,
      headers: { ...bearer(t.jwt, UserRole.USER, USER_ID), 'x-correlation-id': 'end-trace-1' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toEqual({
      endReportCount: 1,
      endReportsToResolve: 3,
      status: 'ACTIVE',
      resolvedBy: null,
    });
    expect(endReports.create).toHaveBeenCalledWith(
      INCIDENT_ID,
      expect.objectContaining({ id: USER_ID, role: UserRole.USER }),
      'end-trace-1',
    );
  });

  it('rejects an incident id that is not a UUID', async () => {
    const res = await t.request({
      method: 'POST',
      url: '/api/v1/incidents/not-a-uuid/end-reports',
      headers: bearer(t.jwt, UserRole.USER),
    });
    expect(res.statusCode).toBe(400);
  });
});
