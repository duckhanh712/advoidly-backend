import { Global, Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { Kafka, logLevel } from 'kafkajs';
import { APP_CONFIG, AppConfig } from '@app/config';
import { EventConsumer } from './event-consumer.service';
import { EventPublisher } from './event-publisher.service';
import { KAFKA_CLIENT } from './kafka.constants';
import { kafkaLogCreator } from './kafka-logger';
import { KafkaHealthIndicator } from './kafka.health';

@Global()
@Module({
  imports: [TerminusModule],
  providers: [
    {
      provide: KAFKA_CLIENT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new Kafka({
          clientId: config.kafka.clientId,
          brokers: config.kafka.brokers,
          logLevel: logLevel.WARN,
          logCreator: kafkaLogCreator,
          retry: { initialRetryTime: 300, retries: 8 },
        }),
    },
    EventPublisher,
    EventConsumer,
    KafkaHealthIndicator,
  ],
  exports: [EventPublisher, EventConsumer, KafkaHealthIndicator],
})
export class KafkaModule {}
