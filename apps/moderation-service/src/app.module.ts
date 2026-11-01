import { Module } from '@nestjs/common';
import { SecurityModule } from '@app/common';
import { AppConfigModule } from '@app/config';
import { DatabaseModule, PrismaHealthIndicator } from '@app/database';
import { KafkaModule } from '@app/kafka';
import { HealthModule, ObservabilityModule } from '@app/observability';
import { IncidentClient } from './clients/incident.client';
import { ModerationEventsHandler } from './events/moderation-events.handler';
import { DuplicateDetector } from './moderation/duplicate-detector';
import { ModerationController } from './moderation/moderation.controller';
import { ModerationService } from './moderation/moderation.service';

@Module({
  imports: [
    AppConfigModule.forService('moderation-service'),
    ObservabilityModule,
    SecurityModule,
    DatabaseModule,
    KafkaModule,
    HealthModule.forRoot([PrismaHealthIndicator]),
  ],
  controllers: [ModerationController],
  providers: [ModerationService, DuplicateDetector, IncidentClient, ModerationEventsHandler],
})
export class AppModule {}
