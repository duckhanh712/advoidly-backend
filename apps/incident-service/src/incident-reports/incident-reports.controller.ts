import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  Authenticated,
  CurrentUser,
  PaginatedResult,
  PaginationQueryDto,
  Public,
} from '@app/common';
import type { AuthenticatedUser } from '@app/contracts';
import {
  CreateIncidentReportDto,
  IncidentConfirmationDto,
  IncidentReportDto,
} from './dto/incident-report.dto';
import { IncidentReportsService } from './incident-reports.service';

@ApiTags('incidents')
@Controller('incidents/:id/reports')
export class IncidentReportsController {
  constructor(private readonly reports: IncidentReportsService) {}

  @Authenticated()
  @Post()
  @ApiOperation({
    summary: 'Confirm an incident someone else reported, optionally with an update',
    description: 'Only VERIFIED or ACTIVE incidents. One report per user per incident.',
  })
  @ApiCreatedResponse({ type: IncidentReportDto })
  @ApiNotFoundResponse({ description: 'Incident does not exist or is hidden from the caller' })
  @ApiConflictResponse({
    description: 'Incident is not VERIFIED/ACTIVE, or the caller already reported it',
  })
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateIncidentReportDto,
  ): Promise<IncidentReportDto> {
    return this.reports.create(id, user, dto);
  }

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Confirmations of an incident, newest first',
    description:
      'Visible to whoever can see the incident. Excludes the original report. ' +
      '`reporterId` is returned to moderators and admins only.',
  })
  @ApiOkResponse({ type: [IncidentConfirmationDto] })
  @ApiNotFoundResponse({ description: 'Incident does not exist or is hidden from the caller' })
  list(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<PaginatedResult<IncidentConfirmationDto>> {
    return this.reports.list(id, query, user);
  }
}
