import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { ModerationCaseStatus } from '@prisma/client';
import { PaginationQueryDto } from '@app/common';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ListCasesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ModerationCaseStatus, description: 'Defaults to OPEN' })
  @IsOptional()
  @IsEnum(ModerationCaseStatus)
  status?: ModerationCaseStatus;
}

export class ApproveReportDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 500)
  note?: string;
}

export class RejectReportDto {
  @ApiProperty({ minLength: 5, maxLength: 500, example: 'Không đủ thông tin xác minh' })
  @Transform(trim)
  @IsString()
  @Length(5, 500)
  reason: string;
}

export class RequestInfoDto {
  @ApiProperty({ minLength: 5, maxLength: 500, example: 'Vui lòng bổ sung ảnh hiện trường' })
  @Transform(trim)
  @IsString()
  @Length(5, 500)
  message: string;
}

export class ModerationActionDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) moderatorId: string;
  @ApiProperty({ enum: ['APPROVE', 'REJECT', 'REQUEST_INFO'] }) action: string;
  @ApiPropertyOptional({ nullable: true, type: String }) reason: string | null;
  @ApiProperty() createdAt: Date;
}

export class ModerationCaseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) incidentId: string;
  @ApiProperty({ format: 'uuid' }) reporterId: string;
  @ApiProperty() incidentType: string;
  @ApiProperty() title: string;
  @ApiPropertyOptional({ nullable: true, type: String }) description: string | null;
  @ApiProperty() latitude: number;
  @ApiProperty() longitude: number;
  @ApiProperty({ enum: ModerationCaseStatus }) status: string;
  @ApiProperty({ type: [String], description: 'Incident ids of potential duplicates' })
  possibleDuplicateIds: string[];
  @ApiProperty() occurredAt: Date;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiPropertyOptional({ type: [ModerationActionDto] }) actions?: ModerationActionDto[];
}
