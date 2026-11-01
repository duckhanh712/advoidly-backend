/**
 * Envelope shared by every event published to Kafka.
 * `eventId` is globally unique and is the idempotency key for consumers.
 */
export interface BaseEvent<T> {
  eventId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: string;
  correlationId: string;
  /** Logical service that produced the event, e.g. `incident-service`. */
  producer: string;
  payload: T;
}
