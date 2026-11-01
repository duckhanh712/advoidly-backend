import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Authenticated, CorrelationId, CurrentUser, PaginatedResult } from '@app/common';
import type { AuthenticatedUser } from '@app/contracts';
import { UserClient } from '../clients/user.client';
import {
  ListNotificationsQueryDto,
  NotificationDto,
  NotificationPreferencesDto,
  ReadAllResultDto,
  RegisterDeviceDto,
} from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@Authenticated()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly users: UserClient,
  ) {}

  @Get()
  @ApiOkResponse({ type: [NotificationDto] })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<PaginatedResult<NotificationDto>> {
    return this.notifications.list(user.id, query);
  }

  @Patch('read-all')
  @ApiOkResponse({ type: ReadAllResultDto })
  readAll(@CurrentUser() user: AuthenticatedUser): Promise<ReadAllResultDto> {
    return this.notifications.markAllRead(user.id);
  }

  @Patch(':id/read')
  @ApiOkResponse({ type: NotificationDto })
  read(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NotificationDto> {
    return this.notifications.markRead(user.id, id);
  }

  /** Preferences are owned by user-service; this is a read-through convenience endpoint. */
  @Get('preferences')
  @ApiOkResponse({ type: NotificationPreferencesDto })
  preferences(
    @CurrentUser() user: AuthenticatedUser,
    @CorrelationId() correlationId: string,
  ): Promise<NotificationPreferencesDto> {
    return this.users.getPreferences(user.id, correlationId);
  }

  @Post('devices')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Device token registered for push notifications' })
  registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterDeviceDto,
  ): Promise<void> {
    return this.notifications.registerDevice(user.id, dto);
  }
}
