import { Module } from '@nestjs/common';
import { SecurityModule } from '@app/common';
import { AppConfigModule } from '@app/config';
import { HealthModule, ObservabilityModule } from '@app/observability';
import { RedisHealthIndicator, RedisModule } from '@app/redis';
import { DocsController } from './docs/docs.controller';
import { DownstreamService } from './health/downstream.service';
import { ServicesHealthController } from './health/services-health.controller';

@Module({
  imports: [
    AppConfigModule.forService('api-gateway'),
    ObservabilityModule,
    SecurityModule,
    RedisModule,
    HealthModule.forRoot([RedisHealthIndicator]),
  ],
  controllers: [DocsController, ServicesHealthController],
  providers: [DownstreamService],
})
export class AppModule {}
