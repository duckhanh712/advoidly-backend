/**
 * Event type names. Each event type is published to a Kafka topic with the same name
 * (see `topicFor`). Dead-lettered messages go to `<topic>.dlt`.
 */
export const EventTypes = {
  INCIDENT_CREATED: 'incident.created',
  INCIDENT_VERIFIED: 'incident.verified',
  INCIDENT_UPDATED: 'incident.updated',
  INCIDENT_RESOLVED: 'incident.resolved',
  INCIDENT_REJECTED: 'incident.rejected',
  NOTIFICATION_REQUESTED: 'notification.requested',
  USER_REGISTERED: 'user.registered',
  USER_UPDATED: 'user.updated',
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

export const ALL_EVENT_TYPES: readonly EventType[] = Object.values(EventTypes);

export const DEAD_LETTER_SUFFIX = '.dlt';

export const topicFor = (eventType: EventType): string => eventType;

export const deadLetterTopicFor = (topic: string): string => `${topic}${DEAD_LETTER_SUFFIX}`;
