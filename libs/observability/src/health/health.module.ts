import {
  Controller,
  DynamicModule,
  Get,
  Inject,
  Module,
  Type,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorFunction,
  HealthIndicatorResult,
  TerminusModule,
} from '@nestjs/terminus';
import { Public, SkipEnvelope } from '@app/common/decorators';

export interface HealthIndicatorLike {
  check(): HealthIndicatorResult | Promise<HealthIndicatorResult>;
}

export const READINESS_INDICATORS = Symbol('READINESS_INDICATORS');

/**
 * - `GET /health/live`  liveness: the process is up and serving HTTP (no dependency checks).
 * - `GET /health`       readiness: every critical dependency of this service is reachable.
 */
@ApiTags('health')
@Public()
@SkipEnvelope()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    @Inject(READINESS_INDICATORS) private readonly indicators: HealthIndicatorFunction[],
  ) {}

  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  @Get()
  @HealthCheck()
  ready() {
    return this.health.check(this.indicators);
  }
}

@Module({})
export class HealthModule {
  /** @param indicators injectable indicators whose `check()` gates readiness */
  static forRoot(indicators: Type<HealthIndicatorLike>[]): DynamicModule {
    return {
      module: HealthModule,
      imports: [TerminusModule.forRoot({ errorLogStyle: 'pretty', gracefulShutdownTimeoutMs: 0 })],
      controllers: [HealthController],
      providers: [
        {
          provide: READINESS_INDICATORS,
          inject: indicators,
          useFactory: (...instances: HealthIndicatorLike[]): HealthIndicatorFunction[] =>
            instances.map((indicator) => () => indicator.check()),
        },
      ],
    };
  }
}
