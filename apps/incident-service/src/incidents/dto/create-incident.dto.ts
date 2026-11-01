import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDate,
  IsEnum,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { IncidentType } from '@app/contracts';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const MAX_MEDIA_PER_INCIDENT = 5;

export class CreateIncidentMediaDto {
  @ApiProperty({ description: 'HTTPS URL of an already-uploaded file' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  url: string;

  @ApiProperty({ enum: ['IMAGE', 'VIDEO'] })
  @IsIn(['IMAGE', 'VIDEO'])
  type: 'IMAGE' | 'VIDEO';
}

export class CreateIncidentDto {
  @ApiProperty({ enum: IncidentType })
  @IsEnum(IncidentType)
  type: IncidentType;

  @ApiProperty({ minLength: 5, maxLength: 150, example: 'Va chạm giữa xe máy và ô tô' })
  @Transform(trim)
  @IsString()
  @Length(5, 150)
  title: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: 21.0285 })
  @IsLatitude()
  latitude: number;

  @ApiProperty({ example: 105.8542 })
  @IsLongitude()
  longitude: number;

  @ApiPropertyOptional({
    description: 'When it happened (ISO 8601). Defaults to now; max 7 days ago.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  occurredAt?: Date;

  @ApiPropertyOptional({ type: [CreateIncidentMediaDto], maxItems: MAX_MEDIA_PER_INCIDENT })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MEDIA_PER_INCIDENT)
  @ValidateNested({ each: true })
  @Type(() => CreateIncidentMediaDto)
  media?: CreateIncidentMediaDto[];
}
