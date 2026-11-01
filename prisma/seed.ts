/**
 * Development seed data. Idempotent: safe to run repeatedly (`yarn prisma:seed`).
 * Runs with MIGRATION_DATABASE_URL (schema owner), so it can write every service's schema.
 *
 * DEV ONLY accounts (password `Password123`):
 *   admin@urbanalert.local, moderator@urbanalert.local, user@urbanalert.local
 */
import {
  IncidentHistoryAction,
  IncidentStatus,
  IncidentType,
  NotificationStatus,
  NotificationType,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
const DEV_PASSWORD = 'Password123';
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

const USERS = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'admin@urbanalert.local',
    role: UserRole.ADMIN,
    displayName: 'Quản trị viên',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    email: 'moderator@urbanalert.local',
    role: UserRole.MODERATOR,
    displayName: 'Kiểm duyệt viên',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    email: 'user@urbanalert.local',
    role: UserRole.USER,
    displayName: 'Nguyễn Văn A',
  },
] as const;
const [ADMIN, MODERATOR, CITIZEN] = USERS;

interface SeedIncident {
  id: string;
  type: IncidentType;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  status: IncidentStatus;
  occurredAt: Date;
  /** Status path after creation, applied as history entries by the moderator. */
  path: IncidentStatus[];
}

const INCIDENTS: SeedIncident[] = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    type: IncidentType.TRAFFIC_JAM,
    title: 'Ùn tắc kéo dài tại ngã tư Sở',
    description: 'Xe đứng yên khoảng 1km theo hướng Nguyễn Trãi.',
    latitude: 21.0031,
    longitude: 105.8201,
    status: IncidentStatus.ACTIVE,
    occurredAt: hoursAgo(1),
    path: [IncidentStatus.VERIFIED, IncidentStatus.ACTIVE],
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    type: IncidentType.FLOODING,
    title: 'Ngập sâu đường Nguyễn Hữu Cảnh',
    description: 'Nước ngập khoảng 40cm sau mưa lớn, xe máy chết máy nhiều.',
    latitude: 10.788,
    longitude: 106.718,
    status: IncidentStatus.VERIFIED,
    occurredAt: hoursAgo(2),
    path: [IncidentStatus.VERIFIED],
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    type: IncidentType.ACCIDENT,
    title: 'Va chạm giữa xe máy và ô tô tại Cầu Giấy',
    description: 'Hai phương tiện va chạm, một làn đường bị chiếm dụng.',
    latitude: 21.0362,
    longitude: 105.7906,
    status: IncidentStatus.PENDING,
    occurredAt: hoursAgo(0.5),
    path: [],
  },
  {
    id: '10000000-0000-4000-8000-000000000004',
    type: IncidentType.CONSTRUCTION,
    title: 'Thi công nâng cấp đường Bạch Đằng',
    description: 'Đã hoàn tất thi công, thông xe trở lại.',
    latitude: 16.0544,
    longitude: 108.2022,
    status: IncidentStatus.RESOLVED,
    occurredAt: hoursAgo(48),
    path: [IncidentStatus.VERIFIED, IncidentStatus.ACTIVE, IncidentStatus.RESOLVED],
  },
];

async function seedUsers(): Promise<void> {
  const passwordHash = await argon2.hash(DEV_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  for (const user of USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { role: user.role },
      create: { id: user.id, email: user.email, role: user.role, passwordHash },
    });
    await prisma.userProfile.upsert({
      where: { id: user.id },
      update: {},
      create: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        notificationPreference: { create: {} },
      },
    });
  }

  const hasArea = await prisma.savedArea.count({ where: { userId: CITIZEN.id } });
  if (hasArea === 0) {
    await prisma.savedArea.createMany({
      data: [
        {
          userId: CITIZEN.id,
          name: 'Nhà – Hoàn Kiếm',
          latitude: 21.0285,
          longitude: 105.8542,
          radiusMeters: 3000,
        },
        {
          userId: CITIZEN.id,
          name: 'Công ty – Cầu Giấy',
          latitude: 21.0333,
          longitude: 105.7945,
          radiusMeters: 1500,
        },
      ],
    });
  }
}

async function seedIncidents(): Promise<void> {
  for (const incident of INCIDENTS) {
    const exists = await prisma.incident.findUnique({
      where: { id: incident.id },
      select: { id: true },
    });
    if (exists) continue;

    let previous: IncidentStatus = IncidentStatus.PENDING;
    const transitions = incident.path.map((next) => {
      const entry = {
        actorId: MODERATOR.id,
        action: IncidentHistoryAction.STATUS_CHANGED,
        previousStatus: previous,
        newStatus: next,
      };
      previous = next;
      return entry;
    });

    await prisma.incident.create({
      data: {
        id: incident.id,
        reporterId: CITIZEN.id,
        type: incident.type,
        title: incident.title,
        description: incident.description,
        latitude: incident.latitude,
        longitude: incident.longitude,
        status: incident.status,
        occurredAt: incident.occurredAt,
        reports: {
          create: {
            reporterId: CITIZEN.id,
            description: incident.description,
            status: incident.status === IncidentStatus.PENDING ? 'PENDING' : 'ACCEPTED',
          },
        },
        history: {
          create: [
            {
              actorId: CITIZEN.id,
              action: IncidentHistoryAction.CREATED,
              newStatus: IncidentStatus.PENDING,
            },
            ...transitions,
          ],
        },
      },
    });

    // Moderation keeps its own copy of each reviewed incident (normally built from incident.created).
    await prisma.moderationCase.create({
      data: {
        incidentId: incident.id,
        reporterId: CITIZEN.id,
        incidentType: incident.type,
        title: incident.title,
        description: incident.description,
        latitude: incident.latitude,
        longitude: incident.longitude,
        occurredAt: incident.occurredAt,
        status: incident.status === IncidentStatus.PENDING ? 'OPEN' : 'APPROVED',
        actions:
          incident.status === IncidentStatus.PENDING
            ? undefined
            : { create: { moderatorId: MODERATOR.id, action: 'APPROVE', reason: 'Seed data' } },
      },
    });
  }
}

async function seedNotifications(): Promise<void> {
  await prisma.notification.createMany({
    skipDuplicates: true,
    data: [
      {
        userId: CITIZEN.id,
        type: NotificationType.INCIDENT_NEARBY,
        title: 'Ùn tắc giao thông gần "Nhà – Hoàn Kiếm"',
        body: INCIDENTS[0].title,
        data: { incidentId: INCIDENTS[0].id },
        status: NotificationStatus.SKIPPED,
        dedupeKey: `incident:${INCIDENTS[0].id}:nearby`,
      },
      {
        userId: ADMIN.id,
        type: NotificationType.SYSTEM,
        title: 'Chào mừng đến với Urban Alert',
        body: 'Môi trường phát triển đã sẵn sàng.',
        status: NotificationStatus.SKIPPED,
        dedupeKey: 'seed:welcome',
      },
    ],
  });
}

async function main(): Promise<void> {
  await seedUsers();
  await seedIncidents();
  await seedNotifications();
  console.log(
    `Seeded ${USERS.length} users and ${INCIDENTS.length} incidents (dev password: ${DEV_PASSWORD}).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
