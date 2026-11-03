import { Module } from '@nestjs/common';
import { SecurityModule } from '@app/common';
import { AppConfigModule } from '@app/config';
import { DatabaseModule, PrismaHealthIndicator } from '@app/database';
import { KafkaModule } from '@app/kafka';
import { HealthModule, ObservabilityModule } from '@app/observability';
import { RedisModule } from '@app/redis';
import { IncidentEndReportsController } from './incident-end-reports/incident-end-reports.controller';
import { IncidentEndReportsService } from './incident-end-reports/incident-end-reports.service';
import { IncidentReportsController } from './incident-reports/incident-reports.controller';
import { IncidentReportsService } from './incident-reports/incident-reports.service';
import { IncidentsController } from './incidents/incidents.controller';
import { IncidentsRepository } from './incidents/incidents.repository';
import { IncidentsService } from './incidents/incidents.service';
import { InternalIncidentsController } from './internal/internal-incidents.controller';

@Module({
  imports: [
    AppConfigModule.forService('incident-service'),
    ObservabilityModule,
    SecurityModule,
    DatabaseModule,
    RedisModule,
    KafkaModule,
    // Redis is a cache only, so it does not gate readiness.
    HealthModule.forRoot([PrismaHealthIndicator]),
  ],
  controllers: [
    IncidentsController,
    IncidentReportsController,
    IncidentEndReportsController,
    InternalIncidentsController,
  ],
  providers: [
    IncidentsService,
    IncidentsRepository,
    IncidentReportsService,
    IncidentEndReportsService,
  ],
})
export class AppModule {}
