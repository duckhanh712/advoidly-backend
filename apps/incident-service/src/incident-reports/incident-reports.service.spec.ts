import { Prisma } from '@prisma/client';
import { ConflictException, PaginationQueryDto, ResourceNotFoundException } from '@app/common';
import { AuthenticatedUser, IncidentStatus, UserRole } from '@app/contracts';
import { PrismaService } from '@app/database';
import { CacheService } from '@app/redis';
import { IncidentReportsService } from './incident-reports.service';

const INCIDENT_ID = '2f1c6e0a-8f0e-4a8e-9a55-0d4d1b2c3e4f';
const reporter: AuthenticatedUser = { id: 'reporter', email: 'r@example.com', role: UserRole.USER };
const neighbour: AuthenticatedUser = {
  id: 'neighbour',
  email: 'n@example.com',
  role: UserRole.USER,
};
const moderator: AuthenticatedUser = {
  id: 'mod',
  email: 'm@example.com',
  role: UserRole.MODERATOR,
};

const confirmationRows = [
  {
    id: 'c2',
    reporterId: 'neighbour',
    description: 'Nước lên 60cm',
    createdAt: new Date('2026-11-03T09:40:00Z'),
  },
  {
    id: 'c1',
    reporterId: 'someone',
    description: null,
    createdAt: new Date('2026-11-03T09:10:00Z'),
  },
];

function setup(status: IncidentStatus | null) {
  const prisma = {
    incident: {
      findUnique: jest.fn().mockResolvedValue(status ? { status, reporterId: reporter.id } : null),
    },
    incidentReport: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'report-1', createdAt: new Date(), ...data }),
      ),
      findMany: jest.fn().mockResolvedValue(confirmationRows),
      count: jest.fn().mockResolvedValue(2),
    },
  };
  const cache = { delete: jest.fn() };
  const service = new IncidentReportsService(
    prisma as unknown as PrismaService,
    cache as unknown as CacheService,
  );
  return { prisma, cache, service };
}

const page = (p = 1, limit = 20) => Object.assign(new PaginationQueryDto(), { page: p, limit });

describe('IncidentReportsService.create', () => {
  it.each([IncidentStatus.VERIFIED, IncidentStatus.ACTIVE])(
    'stores an ACCEPTED confirmation for a %s incident',
    async (status) => {
      const { service, prisma } = setup(status);

      const report = await service.create(INCIDENT_ID, neighbour, { description: 'Vẫn còn ngập' });

      expect(prisma.incidentReport.create).toHaveBeenCalledWith({
        data: {
          incidentId: INCIDENT_ID,
          reporterId: 'neighbour',
          description: 'Vẫn còn ngập',
          status: 'ACCEPTED',
        },
        select: expect.any(Object),
      });
      expect(report).toMatchObject({
        incidentId: INCIDENT_ID,
        reporterId: 'neighbour',
        status: 'ACCEPTED',
      });
    },
  );

  it('clears the cached incident detail so confirmationCount is fresh', async () => {
    const { service, cache } = setup(IncidentStatus.ACTIVE);
    await service.create(INCIDENT_ID, neighbour, {});
    expect(cache.delete).toHaveBeenCalledWith(`incident:${INCIDENT_ID}`);
  });

  it('accepts a confirmation without a description', async () => {
    const { service, prisma } = setup(IncidentStatus.ACTIVE);
    await service.create(INCIDENT_ID, neighbour, {});
    expect(prisma.incidentReport.create.mock.calls[0][0].data.description).toBeUndefined();
  });

  it.each([IncidentStatus.RESOLVED, IncidentStatus.REJECTED, IncidentStatus.PENDING])(
    'refuses confirmations of a %s incident with 409',
    async (status) => {
      const { service, prisma, cache } = setup(status);
      // A moderator can see every status, so the status rule (not visibility) is what rejects it.
      await expect(service.create(INCIDENT_ID, moderator, {})).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.incidentReport.create).not.toHaveBeenCalled();
      expect(cache.delete).not.toHaveBeenCalled();
    },
  );

  it('returns 404 for a pending incident the caller cannot see', async () => {
    const { service } = setup(IncidentStatus.PENDING);
    await expect(service.create(INCIDENT_ID, neighbour, {})).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });

  it('returns 404 for an unknown incident', async () => {
    const { service } = setup(null);
    await expect(service.create(INCIDENT_ID, neighbour, {})).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });

  it('turns the unique-index violation into a clear 409 (second report, or the original reporter)', async () => {
    const { service, prisma } = setup(IncidentStatus.VERIFIED);
    prisma.incidentReport.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );

    await expect(service.create(INCIDENT_ID, reporter, {})).rejects.toThrow(
      new ConflictException('You have already reported this incident'),
    );
  });

  it('does not hide unexpected database errors', async () => {
    const { service, prisma } = setup(IncidentStatus.VERIFIED);
    prisma.incidentReport.create.mockRejectedValueOnce(new Error('connection lost'));
    await expect(service.create(INCIDENT_ID, neighbour, {})).rejects.toThrow('connection lost');
  });
});

describe('IncidentReportsService.list', () => {
  it('lists accepted confirmations, excluding the original report, newest first', async () => {
    const { service, prisma } = setup(IncidentStatus.ACTIVE);

    await service.list(INCIDENT_ID, page(2, 10));

    const expectedWhere = {
      incidentId: INCIDENT_ID,
      status: 'ACCEPTED',
      reporterId: { not: reporter.id },
    };
    expect(prisma.incidentReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expectedWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: 10,
        take: 10,
      }),
    );
    expect(prisma.incidentReport.count).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it('hides who confirmed from guests and regular users, and marks the caller’s own one', async () => {
    const { service } = setup(IncidentStatus.ACTIVE);

    const asGuest = await service.list(INCIDENT_ID, page());
    const asNeighbour = await service.list(INCIDENT_ID, page(), neighbour);

    expect(asGuest.items.every((c) => !('reporterId' in c))).toBe(true);
    expect(asGuest.items.map((c) => c.isMine)).toEqual([false, false]);
    expect(asNeighbour.items.map((c) => c.isMine)).toEqual([true, false]);
    expect(asNeighbour.items[0]).toEqual({
      id: 'c2',
      description: 'Nước lên 60cm',
      createdAt: confirmationRows[0].createdAt,
      isMine: true,
    });
  });

  it('shows who confirmed to moderators', async () => {
    const { service } = setup(IncidentStatus.ACTIVE);
    const result = await service.list(INCIDENT_ID, page(), moderator);
    expect(result.items.map((c) => c.reporterId)).toEqual(['neighbour', 'someone']);
  });

  it('returns pagination metadata from the total count', async () => {
    const { service } = setup(IncidentStatus.VERIFIED);
    const result = await service.list(INCIDENT_ID, page(1, 1));
    expect(result.pagination).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
  });

  it('returns 404 when the incident is hidden from the caller', async () => {
    const { service, prisma } = setup(IncidentStatus.PENDING);
    await expect(service.list(INCIDENT_ID, page())).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
    expect(prisma.incidentReport.findMany).not.toHaveBeenCalled();
  });
});
