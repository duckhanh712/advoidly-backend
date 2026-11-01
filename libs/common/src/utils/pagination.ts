import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type { PaginationMeta } from '@app/contracts';

export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

/** Return this from a handler to get `meta.pagination` in the response envelope. */
export class PaginatedResult<T> {
  constructor(
    readonly items: T[],
    readonly pagination: PaginationMeta,
  ) {}

  static of<T>(
    items: T[],
    query: { page: number; limit: number },
    total: number,
  ): PaginatedResult<T> {
    return new PaginatedResult(items, {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    });
  }
}
