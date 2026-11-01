import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser, EventTypes } from '@app/contracts';
import { PrismaService } from '@app/database';
import { EventPublisher } from '@app/kafka';
import { ProfileDto, UpdateProfileDto } from './profile.dto';

@Injectable()
export class ProfilesService {
  private readonly logger = new Logger(ProfilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventPublisher,
  ) {}

  /**
   * Profiles are normally created from `user.registered`. If that event has not been
   * processed yet (or was lost), create a minimal profile from the token claims.
   */
  async getOrCreate(user: AuthenticatedUser): Promise<ProfileDto> {
    return this.prisma.userProfile.upsert({
      where: { id: user.id },
      update: {},
      create: {
        id: user.id,
        email: user.email,
        displayName: user.email.split('@')[0],
        notificationPreference: { create: {} },
      },
    });
  }

  async update(
    user: AuthenticatedUser,
    dto: UpdateProfileDto,
    correlationId: string,
  ): Promise<ProfileDto> {
    await this.getOrCreate(user);
    const data: Prisma.UserProfileUpdateInput = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;
    if (dto.locale !== undefined) data.locale = dto.locale;

    const profile = await this.prisma.userProfile.update({ where: { id: user.id }, data });
    const changedFields = Object.keys(data);
    if (changedFields.length > 0) {
      await this.events
        .publish(
          EventTypes.USER_UPDATED,
          { userId: user.id, changedFields, displayName: dto.displayName },
          { correlationId, key: user.id },
        )
        .catch((error: unknown) =>
          this.logger.error({ err: error, correlationId }, 'Failed to publish user.updated'),
        );
    }
    return profile;
  }
}
