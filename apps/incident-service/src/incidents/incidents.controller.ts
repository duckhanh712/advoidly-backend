import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authenticated, CorrelationId, CurrentUser, PaginatedResult, Public } from '@app/common';
import type { AuthenticatedUser } from '@app/contracts';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { IncidentDto, IncidentHistoryDto } from './dto/incident.dto';
import { ListIncidentsQueryDto, NearbyIncidentsQueryDto } from './dto/query-incidents.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { IncidentsService } from './incidents.service';

@ApiTags('incidents')
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Authenticated()
  @Post()
  @ApiOperation({ summary: 'Report a new incident (starts as PENDING until moderated)' })
  @ApiCreatedResponse({ type: IncidentDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateIncidentDto,
    @CorrelationId() correlationId: string,
  ): Promise<IncidentDto> {
    return this.incidents.create(user, dto, correlationId);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'List incidents (paginated), optionally within a bounding box' })
  @ApiOkResponse({ type: [IncidentDto] })
  list(
    @Query() query: ListIncidentsQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<PaginatedResult<IncidentDto>> {
    return this.incidents.list(query, user);
  }

  // Declared before ':id' so that "nearby" is not parsed as an id.
  @Public()
  @Get('nearby')
  @ApiOperation({ summary: 'Incidents within a radius of a point, closest first' })
  @ApiOkResponse({ type: [IncidentDto] })
  nearby(
    @Query() query: NearbyIncidentsQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<IncidentDto[]> {
    return this.incidents.findNearby(query, user);
  }

  @Public()
  @Get(':id')
  @ApiOkResponse({ type: IncidentDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<IncidentDto> {
    return this.incidents.findOne(id, user);
  }

  @Authenticated()
  @Patch(':id')
  @ApiOperation({
    summary: 'Edit a pending report (reporter) or update content/status (moderator, admin)',
  })
  @ApiOkResponse({ type: IncidentDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentDto,
    @CurrentUser() user: AuthenticatedUser,
    @CorrelationId() correlationId: string,
  ): Promise<IncidentDto> {
    return this.incidents.update(id, dto, user, correlationId);
  }

  @Authenticated()
  @Get(':id/history')
  @ApiOperation({ summary: 'Audit trail of an incident (reporter, moderator, admin)' })
  @ApiOkResponse({ type: [IncidentHistoryDto] })
  history(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IncidentHistoryDto[]> {
    return this.incidents.history(id, user);
  }
}
