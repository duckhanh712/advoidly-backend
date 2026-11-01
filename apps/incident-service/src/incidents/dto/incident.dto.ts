import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IncidentStatus, IncidentType } from '@app/contracts';

export class GeoPointDto {
  @ApiProperty({ example: 21.0285 }) latitude: number;
  @ApiProperty({ example: 105.8542 }) longitude: number;
}

export class IncidentMediaDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() mediaUrl: string;
  @ApiProperty({ enum: ['IMAGE', 'VIDEO'] }) mediaType: string;
}

export class IncidentDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) reporterId: string;
  @ApiProperty({ enum: IncidentType }) type: IncidentType;
  @ApiProperty() title: string;
  @ApiPropertyOptional({ nullable: true, type: String }) description: string | null;
  @ApiProperty({ enum: IncidentStatus }) status: IncidentStatus;
  @ApiProperty({ type: GeoPointDto }) location: GeoPointDto;
  @ApiProperty() occurredAt: Date;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiPropertyOptional({ type: [IncidentMediaDto] }) media?: IncidentMediaDto[];
  @ApiPropertyOptional({ description: 'Distance from the query point (nearby search only)' })
  distanceMeters?: number;
}

export class IncidentHistoryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) actorId: string;
  @ApiProperty({ enum: ['CREATED', 'UPDATED', 'STATUS_CHANGED'] }) action: string;
  @ApiPropertyOptional({ enum: IncidentStatus, nullable: true })
  previousStatus: IncidentStatus | null;
  @ApiPropertyOptional({ enum: IncidentStatus, nullable: true }) newStatus: IncidentStatus | null;
  @ApiPropertyOptional({ type: Object, nullable: true }) metadata: unknown;
  @ApiProperty() createdAt: Date;
}
