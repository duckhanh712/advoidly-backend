import { Module } from '@nestjs/common';
import { SecurityModule } from '@app/common';
import { APP_CONFIG, AppConfig, AppConfigModule } from '@app/config';
import { DatabaseModule, PrismaHealthIndicator } from '@app/database';
import { KafkaHealthIndicator, KafkaModule } from '@app/kafka';
import { HealthModule, ObservabilityModule } from '@app/observability';
import { UserClient } from './clients/user.client';
import { NotificationEventsHandler } from './events/notification-events.handler';
import { NotificationDispatcher } from './notifications/notification-dispatcher';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';
import { FcmPushProvider } from './push/fcm-push.provider';
import { MockPushProvider } from './push/mock-push.provider';
import { PUSH_PROVIDER } from './push/push-provider';

@Module({
  imports: [
    AppConfigModule.forService('notification-service'),
    ObservabilityModule,
    SecurityModule,
    DatabaseModule,
    KafkaModule,
    // This service is driven by Kafka, so a stopped consumer makes it unready.
    HealthModule.forRoot([PrismaHealthIndicator, KafkaHealthIndicator]),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationDispatcher,
    NotificationEventsHandler,
    UserClient,
    {
      provide: PUSH_PROVIDER,
      inject: [APP_CONFIG],
      // Real FCM only when credentials are configured; local development uses the mock.
      useFactory: (config: AppConfig) =>
        config.fcm ? new FcmPushProvider(config.fcm) : new MockPushProvider(),
    },
  ],
})
export class AppModule {}
