import { Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Authenticated, CorrelationId, CurrentUser } from '@app/common';
import type { AuthenticatedUser } from '@app/contracts';
import { EndReportResultDto } from './dto/end-report.dto';
import { IncidentEndReportsService } from './incident-end-reports.service';

@ApiTags('incidents')
@Authenticated()
@Controller('incidents/:id/end-reports')
export class IncidentEndReportsController {
  constructor(private readonly endReports: IncidentEndReportsService) {}

  @Post()
  @ApiOperation({
    summary: 'Report that an incident has ended',
    description:
      'Only VERIFIED or ACTIVE incidents, one report per user. The incident is RESOLVED at once ' +
      'when the reporter, a moderator or an admin reports it, or when ' +
      'INCIDENT_END_REPORTS_TO_RESOLVE distinct users have (ADR-014).',
  })
  @ApiCreatedResponse({ type: EndReportResultDto })
  @ApiNotFoundResponse({ description: 'Incident does not exist or is hidden from the caller' })
  @ApiConflictResponse({
    description: 'Incident is not VERIFIED/ACTIVE, or the caller already reported it as ended',
  })
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CorrelationId() correlationId: string,
  ): Promise<EndReportResultDto> {
    return this.endReports.create(id, user, correlationId);
  }
}
