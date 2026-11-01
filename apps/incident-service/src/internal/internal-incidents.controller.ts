import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { CorrelationId, InternalApi } from '@app/common';
import { IncidentDto } from '../incidents/dto/incident.dto';
import { TransitionIncidentDto } from '../incidents/dto/update-incident.dto';
import { IncidentsService } from '../incidents/incidents.service';

/** Service-to-service API (internal API key). Used by moderation-service. */
@InternalApi()
@Controller({ path: 'internal/incidents', version: VERSION_NEUTRAL })
export class InternalIncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Post(':id/transitions')
  @HttpCode(HttpStatus.OK)
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionIncidentDto,
    @CorrelationId() correlationId: string,
  ): Promise<IncidentDto> {
    return this.incidents.transition({
      incidentId: id,
      to: dto.status,
      actorId: dto.actorId,
      reason: dto.reason,
      correlationId,
    });
  }
}
