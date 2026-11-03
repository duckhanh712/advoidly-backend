import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { PaginationQueryDto } from '@app/common';
import { NotificationType } from '@app/contracts';

export class ListNotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  unreadOnly?: boolean;
}

export const DEVICE_PLATFORMS = ['ANDROID', 'IOS', 'WEB'] as const;

export class RegisterDeviceDto {
  @ApiProperty({ description: 'FCM registration token' })
  @IsString()
  @Length(10, 512)
  token: string;

  @ApiProperty({ enum: DEVICE_PLATFORMS })
  @IsIn(DEVICE_PLATFORMS)
  platform: (typeof DEVICE_PLATFORMS)[number];
}

export class NotificationDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: NotificationType }) type: string;
  @ApiProperty() title: string;
  @ApiProperty() body: string;
  @ApiPropertyOptional({ type: Object, nullable: true }) data: unknown;
  @ApiPropertyOptional({ nullable: true, type: Date }) readAt: Date | null;
  @ApiProperty() createdAt: Date;
}

export class ReadAllResultDto {
  @ApiProperty() updated: number;
}
