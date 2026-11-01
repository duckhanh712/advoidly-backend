import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { IncidentType } from '@app/contracts';

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @ApiPropertyOptional({
    enum: IncidentType,
    isArray: true,
    description: 'Empty array = all types',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(IncidentType, { each: true })
  incidentTypes?: IncidentType[];

  @ApiPropertyOptional({
    nullable: true,
    minimum: 0,
    maximum: 23,
    description: 'Hour in Asia/Ho_Chi_Minh',
  })
  @ValidateIf(
    (o: UpdateNotificationPreferencesDto) =>
      o.quietHoursStart !== null && o.quietHoursStart !== undefined,
  )
  @IsInt()
  @Min(0)
  @Max(23)
  quietHoursStart?: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0, maximum: 23 })
  @ValidateIf(
    (o: UpdateNotificationPreferencesDto) =>
      o.quietHoursEnd !== null && o.quietHoursEnd !== undefined,
  )
  @IsInt()
  @Min(0)
  @Max(23)
  quietHoursEnd?: number | null;
}

export class NotificationPreferencesDto {
  @ApiProperty() pushEnabled: boolean;
  @ApiProperty({ enum: IncidentType, isArray: true }) incidentTypes: string[];
  @ApiPropertyOptional({ nullable: true, type: Number }) quietHoursStart: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) quietHoursEnd: number | null;
  @ApiProperty() updatedAt: Date;
}
