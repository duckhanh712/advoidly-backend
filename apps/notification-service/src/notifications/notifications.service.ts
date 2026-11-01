import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginatedResult, ResourceNotFoundException } from '@app/common';
import { PrismaService } from '@app/database';
import {
  ListNotificationsQueryDto,
  NotificationDto,
  ReadAllResultDto,
  RegisterDeviceDto,
} from './dto/notification.dto';

const SELECT = {
  id: true,
  type: true,
  title: true,
  body: true,
  data: true,
  readAt: true,
  createdAt: true,
} as const;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    query: ListNotificationsQueryDto,
  ): Promise<PaginatedResult<NotificationDto>> {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.unreadOnly ? { readAt: null } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        select: SELECT,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return PaginatedResult.of(items, query, total);
  }

  async markRead(userId: string, id: string): Promise<NotificationDto> {
    // Scoped by userId: users can only touch their own notifications.
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
      select: SELECT,
    });
    if (!notification) throw new ResourceNotFoundException('Notification', id);
    return notification;
  }

  async markAllRead(userId: string): Promise<ReadAllResultDto> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }

  async registerDevice(userId: string, dto: RegisterDeviceDto): Promise<void> {
    // A token belongs to one device; if it moves to another account, reassign it.
    await this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      create: { userId, token: dto.token, platform: dto.platform },
      update: { userId, platform: dto.platform, lastSeenAt: new Date() },
    });
  }
}
