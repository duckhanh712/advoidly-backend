import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Authenticated, CorrelationId, CurrentUser } from '@app/common';
import type { AuthenticatedUser } from '@app/contracts';
import { ProfileDto, UpdateProfileDto } from './profile.dto';
import { ProfilesService } from './profiles.service';

@ApiTags('users')
@Authenticated()
@Controller('users/me')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  @ApiOkResponse({ type: ProfileDto })
  get(@CurrentUser() user: AuthenticatedUser): Promise<ProfileDto> {
    return this.profiles.getOrCreate(user);
  }

  @Patch()
  @ApiOkResponse({ type: ProfileDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
    @CorrelationId() correlationId: string,
  ): Promise<ProfileDto> {
    return this.profiles.update(user, dto, correlationId);
  }
}
