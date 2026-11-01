export const KAFKA_CLIENT = Symbol('KAFKA_CLIENT');

export const KafkaHeaders = {
  EVENT_ID: 'event-id',
  EVENT_TYPE: 'event-type',
  CORRELATION_ID: 'correlation-id',
  DLT_ORIGINAL_TOPIC: 'dlt-original-topic',
  DLT_ORIGINAL_PARTITION: 'dlt-original-partition',
  DLT_ORIGINAL_OFFSET: 'dlt-original-offset',
  DLT_CONSUMER_GROUP: 'dlt-consumer-group',
  DLT_ERROR: 'dlt-error',
  DLT_ATTEMPTS: 'dlt-attempts',
  DLT_FAILED_AT: 'dlt-failed-at',
} as const;
