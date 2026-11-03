import { Prisma } from '@prisma/client';
import { ConflictException, ResourceNotFoundException } from '@app/common';
import { buildAppConfig } from '@app/config';
import { AuthenticatedUser, IncidentStatus, UserRole } from '@app/contracts';
import { PrismaService } from '@app/database';
import { CacheService } from '@app/redis';
import { IncidentsService } from '../incidents/incidents.service';
import { IncidentEndReportsService } from './incident-end-reports.service';

const INCIDENT_ID = '2f1c6e0a-8f0e-4a8e-9a55-0d4d1b2c3e4f';
const as = (id: string, role = UserRole.USER): AuthenticatedUser => ({
  id,
  email: `${id}@example.com`,
  role,
});
const reporter = as('reporter');

interface SetupOptions {
  status?: IncidentStatus | null;
  countAfterInsert?: number;
  threshold?: string;
}

function setup({
  status = IncidentStatus.ACTIVE,
  countAfterInsert = 1,
  threshold = '3',
}: SetupOptions = {}) {
  const prisma = {
    incident: {
      findUnique: jest.fn().mockResolvedValue(status ? { status, reporterId: reporter.id } : null),
    },
    incidentEndReport: {
      create: jest.fn().mockResolvedValue({ id: 'end-1' }),
      count: jest.fn().mockResolvedValue(countAfterInsert),
    },
  };
  const incidents = {
    transition: jest.fn().mockResolvedValue({ status: IncidentStatus.RESOLVED }),
  };
  const cache = { delete: jest.fn() };
  const config = buildAppConfig('incident-service', {
    JWT_ACCESS_SECRET: 'x'.repeat(32),
    INTERNAL_API_KEY: 'internal-key-123456',
    DATABASE_URL: 'postgresql://unused',
    INCIDENT_END_REPORTS_TO_RESOLVE: threshold,
  });
  const service = new IncidentEndReportsService(
    prisma as unknown as PrismaService,
    incidents as unknown as IncidentsService,
    cache as unknown as CacheService,
    config,
  );
  return { service, prisma, incidents, cache };
}

describe('IncidentEndReportsService: who resolves an incident', () => {
  it.each([IncidentStatus.VERIFIED, IncidentStatus.ACTIVE])(
    'the original reporter resolves a %s incident at once',
    async (status) => {
      const { service, incidents } = setup({ status });

      const result = await service.create(INCIDENT_ID, reporter, 'corr-1');

      expect(result).toEqual({
        endReportCount: 1,
        endReportsToResolve: 3,
        status: IncidentStatus.RESOLVED,
        resolvedBy: 'REPORTER',
      });
      expect(incidents.transition).toHaveBeenCalledWith({
        incidentId: INCIDENT_ID,
        to: IncidentStatus.RESOLVED,
        actorId: 'reporter',
        reason: 'The reporter marked the incident as ended',
        correlationId: 'corr-1',
      });
    },
  );

  it.each([UserRole.MODERATOR, UserRole.ADMIN])('a %s resolves at once', async (role) => {
    const { service, incidents } = setup();
    const result = await service.create(INCIDENT_ID, as('staff', role), 'c');
    expect(result.resolvedBy).toBe('STAFF');
    expect(incidents.transition).toHaveBeenCalledTimes(1);
  });

  it.each([1, 2])(
    '%i user report(s) out of 3 only count, and refresh the cached detail',
    async (count) => {
      const { service, incidents, cache } = setup({ countAfterInsert: count });

      const result = await service.create(INCIDENT_ID, as('neighbour'), 'c');

      expect(result).toEqual({
        endReportCount: count,
        endReportsToResolve: 3,
        status: IncidentStatus.ACTIVE,
        resolvedBy: null,
      });
      expect(incidents.transition).not.toHaveBeenCalled();
      expect(cache.delete).toHaveBeenCalledWith(`incident:${INCIDENT_ID}`);
    },
  );

  it('the third user report resolves the incident', async () => {
    const { service, incidents } = setup({ countAfterInsert: 3 });

    const result = await service.create(INCIDENT_ID, as('third'), 'c');

    expect(result.resolvedBy).toBe('COMMUNITY');
    expect(incidents.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'third',
        reason: '3 users reported the incident as ended',
      }),
    );
  });

  it('uses the configured threshold', async () => {
    const { service } = setup({ countAfterInsert: 2, threshold: '2' });
    await expect(service.create(INCIDENT_ID, as('second'), 'c')).resolves.toMatchObject({
      resolvedBy: 'COMMUNITY',
      endReportsToResolve: 2,
    });
  });
});

describe('IncidentEndReportsService: what is refused', () => {
  it.each([IncidentStatus.RESOLVED, IncidentStatus.REJECTED, IncidentStatus.PENDING])(
    'refuses a %s incident with 409 and stores nothing',
    async (status) => {
      const { service, prisma } = setup({ status });
      await expect(
        service.create(INCIDENT_ID, as('mod', UserRole.MODERATOR), 'c'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.incidentEndReport.create).not.toHaveBeenCalled();
    },
  );

  it('returns 404 for an unknown incident or one hidden from the caller', async () => {
    await expect(
      setup({ status: null }).service.create(INCIDENT_ID, as('u'), 'c'),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
    await expect(
      setup({ status: IncidentStatus.PENDING }).service.create(INCIDENT_ID, as('u'), 'c'),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('refuses a second report from the same user', async () => {
    const { service, prisma, incidents } = setup();
    prisma.incidentEndReport.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );
    await expect(service.create(INCIDENT_ID, as('neighbour'), 'c')).rejects.toThrow(
      new ConflictException('You have already reported this incident as ended'),
    );
    expect(incidents.transition).not.toHaveBeenCalled();
  });
});

describe('IncidentEndReportsService: concurrent resolution', () => {
  it('accepts losing the race when another report already resolved the incident', async () => {
    const { service, prisma, incidents } = setup({ countAfterInsert: 4 });
    incidents.transition.mockRejectedValueOnce(new ConflictException('modified concurrently'));
    prisma.incident.findUnique
      .mockResolvedValueOnce({ status: IncidentStatus.ACTIVE, reporterId: reporter.id })
      .mockResolvedValueOnce({ status: IncidentStatus.RESOLVED });

    await expect(service.create(INCIDENT_ID, as('fourth'), 'c')).resolves.toMatchObject({
      status: IncidentStatus.RESOLVED,
      resolvedBy: 'COMMUNITY',
    });
  });

  it('rethrows when the transition failed and the incident is still open', async () => {
    const { service, prisma, incidents } = setup({ countAfterInsert: 3 });
    incidents.transition.mockRejectedValueOnce(new Error('database down'));
    prisma.incident.findUnique
      .mockResolvedValueOnce({ status: IncidentStatus.ACTIVE, reporterId: reporter.id })
      .mockResolvedValueOnce({ status: IncidentStatus.ACTIVE });

    await expect(service.create(INCIDENT_ID, as('third'), 'c')).rejects.toThrow('database down');
  });
});
