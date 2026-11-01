import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { IncidentStatus, IncidentType } from '@app/contracts';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Content fields can be edited by the reporter while the incident is PENDING, or by
 * moderators/admins. `status` can only be changed by moderators/admins and must follow
 * the incident lifecycle.
 */
export class UpdateIncidentDto {
  @ApiPropertyOptional({ enum: IncidentType })
  @IsOptional()
  @IsEnum(IncidentType)
  type?: IncidentType;

  @ApiPropertyOptional({ minLength: 5, maxLength: 150 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(5, 150)
  title?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: IncidentStatus })
  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;

  @ApiPropertyOptional({ description: 'Required when rejecting', maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(3, 500)
  reason?: string;
}

export class TransitionIncidentDto {
  @IsEnum(IncidentStatus)
  status: IncidentStatus;

  @IsUUID()
  actorId: string;

  @IsOptional()
  @IsString()
  @Length(3, 500)
  reason?: string;
}
