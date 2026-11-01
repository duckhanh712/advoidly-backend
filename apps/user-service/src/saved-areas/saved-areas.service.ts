import { Injectable } from '@nestjs/common';
import { ConflictException, ResourceNotFoundException } from '@app/common';
import { AuthenticatedUser } from '@app/contracts';
import { PrismaService } from '@app/database';
import { ProfilesService } from '../profiles/profiles.service';
import { CreateSavedAreaDto, MAX_SAVED_AREAS_PER_USER, SavedAreaDto } from './saved-area.dto';

const SELECT = {
  id: true,
  name: true,
  latitude: true,
  longitude: true,
  radiusMeters: true,
  createdAt: true,
} as const;

@Injectable()
export class SavedAreasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: ProfilesService,
  ) {}

  list(userId: string): Promise<SavedAreaDto[]> {
    return this.prisma.savedArea.findMany({
      where: { userId },
      select: SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(user: AuthenticatedUser, dto: CreateSavedAreaDto): Promise<SavedAreaDto> {
    await this.profiles.getOrCreate(user);
    const count = await this.prisma.savedArea.count({ where: { userId: user.id } });
    if (count >= MAX_SAVED_AREAS_PER_USER) {
      throw new ConflictException(`A user can save at most ${MAX_SAVED_AREAS_PER_USER} areas`);
    }
    // `location` is set from latitude/longitude by a database trigger.
    return this.prisma.savedArea.create({ data: { ...dto, userId: user.id }, select: SELECT });
  }

  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.savedArea.deleteMany({ where: { id, userId } });
    if (count === 0) throw new ResourceNotFoundException('Saved area', id);
  }
}
