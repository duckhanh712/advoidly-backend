import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException, ErrorCodes } from '@app/common';
import { AuthenticatedUser } from '@app/contracts';
import { PrismaService } from '@app/database';
import { ProfilesService } from '../profiles/profiles.service';
import { NotificationPreferencesDto, UpdateNotificationPreferencesDto } from './preferences.dto';

const SELECT = {
  pushEnabled: true,
  incidentTypes: true,
  quietHoursStart: true,
  quietHoursEnd: true,
  updatedAt: true,
} as const;

@Injectable()
export class PreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: ProfilesService,
  ) {}

  async get(user: AuthenticatedUser): Promise<NotificationPreferencesDto> {
    await this.profiles.getOrCreate(user);
    return this.findOrDefault(user.id);
  }

  /** Used by internal callers that only know the user id. */
  async findOrDefault(userId: string): Promise<NotificationPreferencesDto> {
    const prefs = await this.prisma.notificationPreference.findUnique({
      where: { userId },
      select: SELECT,
    });
    return (
      prefs ?? {
        pushEnabled: true,
        incidentTypes: [],
        quietHoursStart: null,
        quietHoursEnd: null,
        updatedAt: new Date(0),
      }
    );
  }

  async update(
    user: AuthenticatedUser,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesDto> {
    await this.profiles.getOrCreate(user);
    const current = await this.findOrDefault(user.id);
    const quietStart =
      dto.quietHoursStart !== undefined ? dto.quietHoursStart : current.quietHoursStart;
    const quietEnd = dto.quietHoursEnd !== undefined ? dto.quietHoursEnd : current.quietHoursEnd;
    if ((quietStart === null) !== (quietEnd === null)) {
      throw new AppException(
        ErrorCodes.VALIDATION_FAILED,
        'quietHoursStart and quietHoursEnd must both be set or both be null',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...dto },
      update: dto,
      select: SELECT,
    });
  }
}
