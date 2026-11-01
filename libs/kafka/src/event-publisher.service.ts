import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Kafka, Partitioners, Producer } from 'kafkajs';
import { EventPayloadMap, EventType, topicFor } from '@app/contracts';
import { AppConfig, InjectAppConfig } from '@app/config';
import { createEvent, EventOf } from './event-envelope';
import { KAFKA_CLIENT, KafkaHeaders } from './kafka.constants';

export interface PublishOptions {
  correlationId: string;
  /** Partition key; events with the same key keep their relative order. */
  key: string;
}

/**
 * Publishes typed events. The producer is idempotent (no duplicates from producer retries)
 * and waits for all in-sync replicas. Delivery to consumers is at-least-once.
 */
@Injectable()
export class EventPublisher implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(EventPublisher.name);
  private readonly producer: Producer;
  private connected = false;

  constructor(
    @Inject(KAFKA_CLIENT) kafka: Kafka,
    @InjectAppConfig() private readonly config: AppConfig,
  ) {
    this.producer = kafka.producer({
      idempotent: true,
      maxInFlightRequests: 1,
      allowAutoTopicCreation: false,
      createPartitioner: Partitioners.DefaultPartitioner,
    });
    this.producer.on(this.producer.events.CONNECT, () => (this.connected = true));
    this.producer.on(this.producer.events.DISCONNECT, () => (this.connected = false));
  }

  get isConnected(): boolean {
    return this.connected;
  }

  async onModuleInit(): Promise<void> {
    // Non-blocking: the service starts even if Kafka is not reachable yet.
    this.producer
      .connect()
      .catch((error: unknown) =>
        this.logger.error(
          { err: error },
          'Kafka producer failed to connect; will retry on publish',
        ),
      );
  }

  async publish<K extends EventType>(
    eventType: K,
    payload: EventPayloadMap[K],
    options: PublishOptions,
  ): Promise<EventOf<K>> {
    const event = createEvent(eventType, payload, {
      correlationId: options.correlationId,
      producer: this.config.serviceName,
    });
    if (!this.connected) await this.producer.connect();
    await this.producer.send({
      topic: topicFor(eventType),
      acks: -1,
      messages: [
        {
          key: options.key,
          value: JSON.stringify(event),
          headers: {
            [KafkaHeaders.EVENT_ID]: event.eventId,
            [KafkaHeaders.EVENT_TYPE]: event.eventType,
            [KafkaHeaders.CORRELATION_ID]: event.correlationId,
          },
        },
      ],
    });
    this.logger.log(
      { eventId: event.eventId, eventType, correlationId: event.correlationId },
      'Event published',
    );
    return event;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.producer.disconnect();
  }
}
