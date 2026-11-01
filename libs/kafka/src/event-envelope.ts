import { randomUUID } from 'node:crypto';
import { BaseEvent, EVENT_VERSIONS, EventPayloadMap, EventType } from '@app/contracts';

export type EventOf<K extends EventType> = BaseEvent<EventPayloadMap[K]> & { eventType: K };

export function createEvent<K extends EventType>(
  eventType: K,
  payload: EventPayloadMap[K],
  context: { correlationId: string; producer: string },
): EventOf<K> {
  return {
    eventId: randomUUID(),
    eventType,
    eventVersion: EVENT_VERSIONS[eventType],
    occurredAt: new Date().toISOString(),
    correlationId: context.correlationId,
    producer: context.producer,
    payload,
  };
}

/** Parses and minimally validates a raw message value. Throws on malformed envelopes. */
export function parseEvent(raw: Buffer | null): BaseEvent<unknown> {
  if (!raw) throw new Error('Message has no value');
  const event = JSON.parse(raw.toString('utf8')) as Partial<BaseEvent<unknown>>;
  if (
    typeof event.eventId !== 'string' ||
    typeof event.eventType !== 'string' ||
    typeof event.eventVersion !== 'number' ||
    event.payload === undefined
  ) {
    throw new Error('Message is not a valid event envelope');
  }
  return event as BaseEvent<unknown>;
}
