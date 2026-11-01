import type { EachMessagePayload, Kafka } from 'kafkajs';
import { buildAppConfig } from '@app/config';
import { EventTypes } from '@app/contracts';
import { NonRetryableEventError } from './errors';
import { EventConsumer } from './event-consumer.service';
import { createEvent } from './event-envelope';
import { KafkaHeaders } from './kafka.constants';

jest.mock('./retry', () => ({
  ...jest.requireActual('./retry'),
  sleep: jest.fn().mockResolvedValue(undefined),
}));

const config = buildAppConfig('notification-service', {
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  INTERNAL_API_KEY: 'internal-key-123456',
  DATABASE_URL: 'postgresql://unused',
  KAFKA_CONSUMER_MAX_RETRIES: '2',
});

function setup() {
  const dltSend = jest.fn().mockResolvedValue(undefined);
  const consumer = new EventConsumer({} as Kafka, config);
  // Inject the DLT producer that start() would normally create.
  (consumer as unknown as { dltProducer: { send: jest.Mock } }).dltProducer = { send: dltSend };
  return { consumer, dltSend };
}

function message(value: string | null): EachMessagePayload {
  return {
    topic: EventTypes.NOTIFICATION_REQUESTED,
    partition: 0,
    message: {
      key: Buffer.from('k'),
      value: value === null ? null : Buffer.from(value),
      offset: '42',
      headers: {},
    },
  } as unknown as EachMessagePayload;
}

const validEvent = JSON.stringify(
  createEvent(
    EventTypes.NOTIFICATION_REQUESTED,
    { userId: 'u1', type: 'SYSTEM' as never, title: 't', body: 'b' },
    { correlationId: 'c1', producer: 'test' },
  ),
);

describe('EventConsumer message handling', () => {
  it('delivers a valid event to its handler once', async () => {
    const { consumer, dltSend } = setup();
    const handler = jest.fn().mockResolvedValue(undefined);
    consumer.on(EventTypes.NOTIFICATION_REQUESTED, handler);

    await consumer.handleMessage(message(validEvent));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({
      eventType: 'notification.requested',
      correlationId: 'c1',
    });
    expect(dltSend).not.toHaveBeenCalled();
  });

  it('retries transient failures and succeeds', async () => {
    const { consumer, dltSend } = setup();
    const handler = jest
      .fn()
      .mockRejectedValueOnce(new Error('db timeout'))
      .mockResolvedValueOnce(undefined);
    consumer.on(EventTypes.NOTIFICATION_REQUESTED, handler);

    await consumer.handleMessage(message(validEvent));

    expect(handler).toHaveBeenCalledTimes(2);
    expect(dltSend).not.toHaveBeenCalled();
  });

  it('dead-letters after exhausting retries, with diagnostic headers', async () => {
    const { consumer, dltSend } = setup();
    const handler = jest.fn().mockRejectedValue(new Error('still failing'));
    consumer.on(EventTypes.NOTIFICATION_REQUESTED, handler);

    await consumer.handleMessage(message(validEvent));

    expect(handler).toHaveBeenCalledTimes(3); // 1 attempt + KAFKA_CONSUMER_MAX_RETRIES (2)
    expect(dltSend).toHaveBeenCalledTimes(1);
    const sent = dltSend.mock.calls[0][0];
    expect(sent.topic).toBe('notification.requested.dlt');
    expect(sent.messages[0].value.toString()).toBe(validEvent);
    expect(sent.messages[0].headers).toMatchObject({
      [KafkaHeaders.DLT_ORIGINAL_TOPIC]: 'notification.requested',
      [KafkaHeaders.DLT_ORIGINAL_OFFSET]: '42',
      [KafkaHeaders.DLT_CONSUMER_GROUP]: 'notification-service',
      [KafkaHeaders.DLT_ERROR]: 'still failing',
      [KafkaHeaders.DLT_ATTEMPTS]: '3',
    });
  });

  it('dead-letters non-retryable errors without retrying', async () => {
    const { consumer, dltSend } = setup();
    const handler = jest.fn().mockRejectedValue(new NonRetryableEventError('unknown user'));
    consumer.on(EventTypes.NOTIFICATION_REQUESTED, handler);

    await consumer.handleMessage(message(validEvent));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(dltSend).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['invalid JSON', '{not json'],
    ['a non-envelope payload', JSON.stringify({ hello: 'world' })],
    ['an empty value', null],
  ])('dead-letters %s without calling the handler', async (_label, value) => {
    const { consumer, dltSend } = setup();
    const handler = jest.fn();
    consumer.on(EventTypes.NOTIFICATION_REQUESTED, handler);

    await consumer.handleMessage(message(value));

    expect(handler).not.toHaveBeenCalled();
    expect(dltSend).toHaveBeenCalledTimes(1);
  });

  it('propagates a DLT publish failure so the offset is not committed', async () => {
    const { consumer, dltSend } = setup();
    dltSend.mockRejectedValue(new Error('broker down'));
    consumer.on(
      EventTypes.NOTIFICATION_REQUESTED,
      jest.fn().mockRejectedValue(new NonRetryableEventError('x')),
    );

    await expect(consumer.handleMessage(message(validEvent))).rejects.toThrow('broker down');
  });

  it('refuses duplicate handler registration for a topic', () => {
    const { consumer } = setup();
    consumer.on(EventTypes.NOTIFICATION_REQUESTED, jest.fn());
    expect(() => consumer.on(EventTypes.NOTIFICATION_REQUESTED, jest.fn())).toThrow(
      /already registered/,
    );
  });
});
