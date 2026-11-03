import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IncidentStatus } from '@app/contracts';

/** Why an incident was resolved by an end report. */
export enum EndReportResolution {
  /** The original reporter said it has ended. */
  REPORTER = 'REPORTER',
  /** A moderator or admin said it has ended. */
  STAFF = 'STAFF',
  /** Enough distinct users said it has ended. */
  COMMUNITY = 'COMMUNITY',
}

export class EndReportResultDto {
  @ApiProperty({
    description: 'People who have reported this incident as ended, including the caller',
  })
  endReportCount: number;

  @ApiProperty({ description: 'Reports needed to resolve the incident automatically' })
  endReportsToResolve: number;

  @ApiProperty({ enum: IncidentStatus, description: 'Incident status after this report' })
  status: IncidentStatus;

  @ApiPropertyOptional({
    enum: EndReportResolution,
    nullable: true,
    description: 'Set when this report resolved the incident',
  })
  resolvedBy: EndReportResolution | null;
}
