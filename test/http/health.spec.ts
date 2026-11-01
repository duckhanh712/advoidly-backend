import { Global, Injectable, Module } from '@nestjs/common';
import { HealthIndicatorService, TerminusModule } from '@nestjs/terminus';
import { HealthModule } from '@app/observability';
import { createTestApp, TestApp } from '../utils/test-app';

@Injectable()
class FakeDatabaseIndicator {
  static up = true;
  constructor(private readonly health: HealthIndicatorService) {}
  check() {
    const indicator = this.health.check('database');
    return FakeDatabaseIndicator.up
      ? indicator.up()
      : indicator.down({ message: 'connection refused' });
  }
}

/** Mirrors how DatabaseModule exposes PrismaHealthIndicator globally in real services. */
@Global()
@Module({
  imports: [TerminusModule],
  providers: [FakeDatabaseIndicator],
  exports: [FakeDatabaseIndicator],
})
class FakeDatabaseModule {}

describe('Health endpoints', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp('incident-service', {
      imports: [FakeDatabaseModule, HealthModule.forRoot([FakeDatabaseIndicator])],
    });
  });
  afterAll(() => t.close());
  beforeEach(() => (FakeDatabaseIndicator.up = true));

  it('liveness is public, unprefixed and checks no dependencies', async () => {
    FakeDatabaseIndicator.up = false;
    const res = await t.request({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });

  it('readiness reports dependencies (not wrapped in the API envelope)', async () => {
    const res = await t.request({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', info: { database: { status: 'up' } } });
  });

  it('readiness returns 503 when a dependency is down', async () => {
    FakeDatabaseIndicator.up = false;
    const res = await t.request({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
  });
});
