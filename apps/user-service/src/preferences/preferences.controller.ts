import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Authenticated, CurrentUser } from '@app/common';
import type { AuthenticatedUser } from '@app/contracts';
import { NotificationPreferencesDto, UpdateNotificationPreferencesDto } from './preferences.dto';
import { PreferencesService } from './preferences.service';

@ApiTags('users')
@Authenticated()
@Controller('users/me/notification-preferences')
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get()
  @ApiOkResponse({ type: NotificationPreferencesDto })
  get(@CurrentUser() user: AuthenticatedUser): Promise<NotificationPreferencesDto> {
    return this.preferences.get(user);
  }

  @Patch()
  @ApiOkResponse({ type: NotificationPreferencesDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesDto> {
    return this.preferences.update(user, dto);
  }
}
