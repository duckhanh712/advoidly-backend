import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Trims text; a blank value is treated as "no description". */
const trimToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export class CreateIncidentReportDto {
  @ApiPropertyOptional({
    maxLength: 2000,
    example: 'Vẫn còn ngập, nước đã lên khoảng 40cm',
    description: 'Optional update. Omit it to simply confirm the incident is still there.',
  })
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class IncidentReportDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) incidentId: string;
  @ApiProperty({ format: 'uuid' }) reporterId: string;
  @ApiPropertyOptional({ nullable: true, type: String }) description: string | null;
  @ApiProperty({ enum: ['PENDING', 'ACCEPTED', 'REJECTED'] }) status: string;
  @ApiProperty() createdAt: Date;
}

/** One confirmation as shown under an incident. The confirmer's id is visible to moderators only. */
export class IncidentConfirmationDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiPropertyOptional({ nullable: true, type: String }) description: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ description: 'True when the signed-in caller wrote this confirmation' })
  isMine: boolean;
  @ApiPropertyOptional({ format: 'uuid', description: 'Moderators and admins only' })
  reporterId?: string;
}
