import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Authenticated, CurrentUser } from '@app/common';
import type { AuthenticatedUser } from '@app/contracts';
import { CreateSavedAreaDto, SavedAreaDto } from './saved-area.dto';
import { SavedAreasService } from './saved-areas.service';

@ApiTags('users')
@Authenticated()
@Controller('users/me/saved-areas')
export class SavedAreasController {
  constructor(private readonly savedAreas: SavedAreasService) {}

  @Get()
  @ApiOkResponse({ type: [SavedAreaDto] })
  list(@CurrentUser() user: AuthenticatedUser): Promise<SavedAreaDto[]> {
    return this.savedAreas.list(user.id);
  }

  @Post()
  @ApiCreatedResponse({ type: SavedAreaDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSavedAreaDto,
  ): Promise<SavedAreaDto> {
    return this.savedAreas.create(user, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.savedAreas.remove(user.id, id);
  }
}
