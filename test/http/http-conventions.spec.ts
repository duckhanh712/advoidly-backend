import { Body, Controller, Get, NotFoundException, Post, Query } from '@nestjs/common';
import { IsInt, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CORRELATION_ID_HEADER, PaginatedResult, PaginationQueryDto, Public } from '@app/common';
import { createTestApp, TestApp } from '../utils/test-app';

class EchoDto {
  @IsString() name: string;
  @Type(() => Number) @IsInt() @Min(1) count: number;
}

@Public()
@Controller('conventions')
class ConventionsController {
  @Post('echo')
  echo(@Body() dto: EchoDto) {
    return dto;
  }

  @Get('page')
  page(@Query() query: PaginationQueryDto) {
    return PaginatedResult.of(['a', 'b'], query, 42);
  }

  @Get('boom')
  boom(): never {
    throw new Error('database password leaked in message');
  }

  @Get('missing')
  missing(): never {
    throw new NotFoundException();
  }
}

describe('HTTP conventions (prefix, envelope, errors, correlation id)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('incident-service', { controllers: [ConventionsController] });
  });
  afterAll(() => t.close());

  it('serves routes under /api/v1 and wraps results in the success envelope', async () => {
    const res = await t.request({
      method: 'POST',
      url: '/api/v1/conventions/echo',
      payload: { name: 'a', count: 2 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      success: true,
      data: { name: 'a', count: 2 },
      meta: { correlationId: expect.any(String), timestamp: expect.any(String) },
    });
  });

  it('is not reachable without the /api/v1 prefix', async () => {
    const res = await t.request({
      method: 'POST',
      url: '/conventions/echo',
      payload: { name: 'a', count: 2 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns VALIDATION_FAILED with per-field details', async () => {
    const res = await t.request({
      method: 'POST',
      url: '/api/v1/conventions/echo',
      payload: { name: 5, count: 0 },
    });
    const body = res.json();
    expect(res.statusCode).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details.map((d: { field: string }) => d.field).sort()).toEqual([
      'count',
      'name',
    ]);
    expect(body.meta.path).toBe('/api/v1/conventions/echo');
  });

  it('rejects unknown body fields', async () => {
    const res = await t.request({
      method: 'POST',
      url: '/api/v1/conventions/echo',
      payload: { name: 'a', count: 1, isAdmin: true },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.details).toEqual([
      { field: 'isAdmin', errors: ['property isAdmin should not exist'] },
    ]);
  });

  it('puts pagination metadata in meta.pagination', async () => {
    const res = await t.request({ method: 'GET', url: '/api/v1/conventions/page?page=2&limit=10' });
    expect(res.json()).toMatchObject({
      data: ['a', 'b'],
      meta: { pagination: { page: 2, limit: 10, total: 42, totalPages: 5 } },
    });
  });

  it('hides internal error messages behind INTERNAL_ERROR', async () => {
    const res = await t.request({ method: 'GET', url: '/api/v1/conventions/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  });

  it('maps HttpExceptions to stable codes', async () => {
    const res = await t.request({ method: 'GET', url: '/api/v1/conventions/missing' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('propagates a well-formed inbound correlation id', async () => {
    const res = await t.request({
      method: 'GET',
      url: '/api/v1/conventions/page',
      headers: { [CORRELATION_ID_HEADER]: 'client-trace-123' },
    });
    expect(res.headers[CORRELATION_ID_HEADER]).toBe('client-trace-123');
    expect(res.json().meta.correlationId).toBe('client-trace-123');
  });

  it('replaces a malformed correlation id instead of echoing it', async () => {
    const res = await t.request({
      method: 'GET',
      url: '/api/v1/conventions/page',
      headers: { [CORRELATION_ID_HEADER]: '<script>alert(1)</script>' },
    });
    expect(res.headers[CORRELATION_ID_HEADER]).toMatch(/^[0-9a-f-]{36}$/);
  });
});
