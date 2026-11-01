import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsLatitude, IsLongitude, IsString, Length, Max, Min } from 'class-validator';

export const MIN_AREA_RADIUS_METERS = 50;
export const MAX_AREA_RADIUS_METERS = 50_000;
export const MAX_SAVED_AREAS_PER_USER = 10;

export class CreateSavedAreaDto {
  @ApiProperty({ example: 'Nhà' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  name: string;

  @ApiProperty({ example: 21.0285 })
  @IsLatitude()
  latitude: number;

  @ApiProperty({ example: 105.8542 })
  @IsLongitude()
  longitude: number;

  @ApiProperty({ minimum: MIN_AREA_RADIUS_METERS, maximum: MAX_AREA_RADIUS_METERS, example: 1000 })
  @IsInt()
  @Min(MIN_AREA_RADIUS_METERS)
  @Max(MAX_AREA_RADIUS_METERS)
  radiusMeters: number;
}

export class SavedAreaDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() latitude: number;
  @ApiProperty() longitude: number;
  @ApiProperty() radiusMeters: number;
  @ApiProperty() createdAt: Date;
}
