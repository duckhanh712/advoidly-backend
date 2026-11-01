import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Consumer, EachMessagePayload, Kafka, Producer } from 'kafkajs';
import {
  BaseEvent,
  deadLetterTopicFor,
  EventPayloadMap,
  EventType,
  topicFor,
} from '@app/contracts';
import { AppConfig, InjectAppConfig } from '@app/config';
import { parseEvent } from './event-envelope';
import { NonRetryableEventError } from './errors';
import { KAFKA_CLIENT, KafkaHeaders } from './kafka.constants';
import { backoffDelay, DEFAULT_RETRY_POLICY, RetryPolicy, sleep } from './retry';

export type EventHandler<K extends EventType> = (
  event: BaseEvent<EventPayloadMap[K]>,
) => Promise<void>;

const RECONNECT_DELAY_MS = 5_000;

/**
 * One consumer per service (consumer group = service name) subscribed to every topic a
 * handler was registered for. Processing semantics:
 *
 * - at-least-once: offsets are committed only after the handler succeeds or the message
 *   has been dead-lettered, so handlers must be idempotent (dedupe on `eventId`);
 * - transient failures are retried in-process with exponential backoff;
 * - after the last retry, or on a malformed / non-retryable message, the original message
 *   is published to `<topic>.dlt` with diagnostic headers and the offset moves on.
 */
@Injectable()
export class EventConsumer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(EventConsumer.name);
  private readonly handlers = new Map<string, EventHandler<EventType>>();
  private readonly retryPolicy: RetryPolicy;
  private readonly groupId: string;
  private consumer?: Consumer;
  private dltProducer?: Producer;
  private running = false;
  private shuttingDown = false;

  constructor(
    @Inject(KAFKA_CLIENT) private readonly kafka: Kafka,
    @InjectAppConfig() config: AppConfig,
  ) {
    this.groupId = config.serviceName;
    this.retryPolicy = { ...DEFAULT_RETRY_POLICY, maxRetries: config.kafka.consumerMaxRetries };
  }

  get isRunning(): boolean {
    return this.running;
  }

  get hasHandlers(): boolean {
    return this.handlers.size > 0;
  }

  /** Register a handler. Must be called before application bootstrap (e.g. in onModuleInit). */
  on<K extends EventType>(eventType: K, handler: EventHandler<K>): void {
    const topic = topicFor(eventType);
    if (this.handlers.has(topic)) throw new Error(`Handler already registered for ${topic}`);
    this.handlers.set(topic, handler as EventHandler<EventType>);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.handlers.size === 0) return;
    void this.start();
  }

  private async start(): Promise<void> {
    while (!this.shuttingDown) {
      try {
        this.consumer = this.kafka.consumer({
          groupId: this.groupId,
          allowAutoTopicCreation: false,
        });
        this.dltProducer = this.kafka.producer({ allowAutoTopicCreation: false });
        this.consumer.on(this.consumer.events.CRASH, ({ payload }) => {
          this.running = false;
          this.logger.error(
            { err: payload.error, restart: payload.restart },
            'Kafka consumer crashed',
          );
        });
        await this.dltProducer.connect();
        await this.consumer.connect();
        await this.consumer.subscribe({ topics: [...this.handlers.keys()], fromBeginning: false });
        await this.consumer.run({ eachMessage: (payload) => this.handleMessage(payload) });
        this.running = true;
        this.logger.log(
          `Consumer group '${this.groupId}' subscribed to ${[...this.handlers.keys()].join(', ')}`,
        );
        return;
      } catch (error) {
        this.logger.error(
          { err: error },
          `Kafka consumer failed to start; retrying in ${RECONNECT_DELAY_MS}ms`,
        );
        await this.consumer?.disconnect().catch(() => undefined);
        await this.dltProducer?.disconnect().catch(() => undefined);
        await sleep(RECONNECT_DELAY_MS);
      }
    }
  }

  /** Exposed for unit tests. */
  async handleMessage({ topic, partition, message }: EachMessagePayload): Promise<void> {
    const handler = this.handlers.get(topic);
    if (!handler) return;

    let event: BaseEvent<unknown>;
    try {
      event = parseEvent(message.value);
    } catch (error) {
      await this.deadLetter(topic, partition, message, error, 0);
      return;
    }

    const context = {
      eventId: event.eventId,
      eventType: event.eventType,
      correlationId: event.correlationId,
    };
    for (let attempt = 0; attempt <= this.retryPolicy.maxRetries; attempt++) {
      try {
        await handler(event as BaseEvent<EventPayloadMap[EventType]>);
        return;
      } catch (error) {
        const isLast =
          attempt === this.retryPolicy.maxRetries || error instanceof NonRetryableEventError;
        this.logger.warn(
          { ...context, err: error, attempt: attempt + 1 },
          isLast ? 'Event handler failed; dead-lettering' : 'Event handler failed; retrying',
        );
        if (isLast) {
          await this.deadLetter(topic, partition, message, error, attempt + 1);
          return;
        }
        await sleep(backoffDelay(attempt, this.retryPolicy));
      }
    }
  }

  private async deadLetter(
    topic: string,
    partition: number,
    message: EachMessagePayload['message'],
    error: unknown,
    attempts: number,
  ): Promise<void> {
    const dltTopic = deadLetterTopicFor(topic);
    // If this throws, the offset is not committed and kafkajs redelivers the message.
    await this.dltProducer!.send({
      topic: dltTopic,
      messages: [
        {
          key: message.key,
          value: message.value,
          headers: {
            ...message.headers,
            [KafkaHeaders.DLT_ORIGINAL_TOPIC]: topic,
            [KafkaHeaders.DLT_ORIGINAL_PARTITION]: String(partition),
            [KafkaHeaders.DLT_ORIGINAL_OFFSET]: message.offset,
            [KafkaHeaders.DLT_CONSUMER_GROUP]: this.groupId,
            [KafkaHeaders.DLT_ERROR]: error instanceof Error ? error.message : String(error),
            [KafkaHeaders.DLT_ATTEMPTS]: String(attempts),
            [KafkaHeaders.DLT_FAILED_AT]: new Date().toISOString(),
          },
        },
      ],
    });
    this.logger.error(
      { topic, partition, offset: message.offset, dltTopic, attempts },
      'Message sent to dead-letter topic',
    );
  }

  async onApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    // disconnect() waits for in-flight eachMessage handlers before leaving the group.
    await this.consumer?.disconnect().catch(() => undefined);
    await this.dltProducer?.disconnect().catch(() => undefined);
    this.running = false;
  }
}
