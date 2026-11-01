import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUrl, Length, MaxLength } from 'class-validator';

export const SUPPORTED_LOCALES = ['vi', 'en'] as const;

export class UpdateProfileDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 100 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 100)
  displayName?: string;

  @ApiPropertyOptional({ description: 'HTTPS URL of the avatar image' })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  avatarUrl?: string;

  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: (typeof SUPPORTED_LOCALES)[number];
}

export class ProfileDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() email: string;
  @ApiProperty() displayName: string;
  @ApiPropertyOptional({ nullable: true, type: String }) avatarUrl: string | null;
  @ApiProperty() locale: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
