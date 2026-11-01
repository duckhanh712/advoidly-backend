import { Module } from '@nestjs/common';
import { SecurityModule } from '@app/common';
import { AppConfigModule } from '@app/config';
import { DatabaseModule, PrismaHealthIndicator } from '@app/database';
import { KafkaModule } from '@app/kafka';
import { HealthModule, ObservabilityModule } from '@app/observability';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    AppConfigModule.forService('auth-service'),
    ObservabilityModule,
    SecurityModule,
    DatabaseModule,
    KafkaModule,
    HealthModule.forRoot([PrismaHealthIndicator]),
    AuthModule,
  ],
})
export class AppModule {}
