import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '@app/common';
import { IncidentStatus, IncidentType } from '@app/contracts';
import { MAX_RADIUS_METERS } from '@app/database';
import { IsGreaterThan, toBoolean, toStringArray } from './validators';

export const DEFAULT_NEARBY_RADIUS_METERS = 2_000;
export const MAX_NEARBY_RESULTS = 200;
/** Largest accepted bounding box side, in degrees (~550 km), to keep queries bounded. */
export const MAX_BBOX_SPAN_DEGREES = 5;

const BBOX_FIELDS = ['minLat', 'minLng', 'maxLat', 'maxLng'] as const;
const hasBbox = (o: Record<string, unknown>) => BBOX_FIELDS.some((f) => o[f] !== undefined);

export class ListIncidentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: IncidentStatus,
    isArray: true,
    description: 'Non-public statuses require moderator role (or `mine=true`)',
  })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayUnique()
  @IsEnum(IncidentStatus, { each: true })
  statuses?: IncidentStatus[];

  @ApiPropertyOptional({ enum: IncidentType, isArray: true })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayUnique()
  @IsEnum(IncidentType, { each: true })
  types?: IncidentType[];

  @ApiPropertyOptional({
    description: 'Only incidents reported by the current user (requires auth)',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  mine?: boolean;

  @ApiPropertyOptional({
    description: 'Bounding box: all four of minLat/minLng/maxLat/maxLng or none',
  })
  @ValidateIf(hasBbox)
  @Type(() => Number)
  @IsLatitude()
  minLat?: number;

  @ApiPropertyOptional()
  @ValidateIf(hasBbox)
  @Type(() => Number)
  @IsLongitude()
  minLng?: number;

  @ApiPropertyOptional()
  @ValidateIf(hasBbox)
  @Type(() => Number)
  @IsLatitude()
  @IsGreaterThan('minLat')
  maxLat?: number;

  @ApiPropertyOptional()
  @ValidateIf(hasBbox)
  @Type(() => Number)
  @IsLongitude()
  @IsGreaterThan('minLng')
  maxLng?: number;
}

export class NearbyIncidentsQueryDto {
  @ApiProperty({ example: 21.0285 })
  @Type(() => Number)
  @IsLatitude()
  latitude: number;

  @ApiProperty({ example: 105.8542 })
  @Type(() => Number)
  @IsLongitude()
  longitude: number;

  @ApiPropertyOptional({
    default: DEFAULT_NEARBY_RADIUS_METERS,
    minimum: 1,
    maximum: MAX_RADIUS_METERS,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_RADIUS_METERS)
  radiusMeters: number = DEFAULT_NEARBY_RADIUS_METERS;

  @ApiPropertyOptional({ enum: IncidentType, isArray: true })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayUnique()
  @IsEnum(IncidentType, { each: true })
  types?: IncidentType[];

  @ApiPropertyOptional({ default: 50, maximum: MAX_NEARBY_RESULTS })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_NEARBY_RESULTS)
  limit: number = 50;
}
