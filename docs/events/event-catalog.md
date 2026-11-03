# Event Catalog

Sources of truth:

- types: `libs/contracts/src/events/` (`event-types.ts`, `payloads.ts`, `event-map.ts`)
- topics: `infrastructure/kafka/topics.txt`

A unit test keeps the topic list in sync with `EventTypes`.

## Envelope

Every message value is JSON of `BaseEvent<T>`:

```ts
interface BaseEvent<T> {
  eventId: string;        // UUID, globally unique; the consumer idempotency key
  eventType: string;      // e.g. "incident.verified"
  eventVersion: number;   // EVENT_VERSIONS[eventType]; bump on breaking payload changes
  occurredAt: string;     // ISO 8601 UTC
  correlationId: string;  // propagated from the originating HTTP request
  producer: string;       // service name, e.g. "incident-service"
  payload: T;
}
```

Message headers: `event-id`, `event-type`, `correlation-id`. The message key is the partition key
(see the table).

## Events

| Event / topic | Producer | Consumers (group) | Key | Payload |
|---|---|---|---|---|
| `incident.created` | incident-service | moderation-service | incidentId | `IncidentSnapshot` |
| `incident.verified` | incident-service | notification-service, moderation-service | incidentId | `IncidentSnapshot` + `previousStatus`, `actorId`, `reason?` |
| `incident.updated` | incident-service | none yet | incidentId | `IncidentSnapshot` + `actorId`, `changedFields[]`, `previousStatus?` |
| `incident.resolved` | incident-service | notification-service | incidentId | as `incident.verified` |
| `incident.rejected` | incident-service | notification-service, moderation-service | incidentId | as `incident.verified`, with `reason` required |
| `notification.requested` | moderation-service (request-info) | notification-service | userId | `NotificationRequestedPayload` |
| `user.registered` | auth-service | user-service | userId | `UserRegisteredPayload` |
| `user.updated` | user-service | none yet | userId | `UserUpdatedPayload` |

`incident.updated` is published for content edits (`changedFields` lists them) and for the
VERIFIED → ACTIVE transition (`changedFields: ["status"]`).

### Payload types

```ts
interface IncidentSnapshot {
  incidentId: string; reporterId: string;
  type: IncidentType; title: string; description: string | null;
  status: IncidentStatus;
  location: { latitude: number; longitude: number };
  occurredAt: string;
}

interface NotificationRequestedPayload {
  userId: string; type: NotificationType; title: string; body: string;
  data?: Record<string, string>;
  dedupeKey?: string;          // dedupes per (userId, dedupeKey)
}

interface UserRegisteredPayload { userId: string; email: string; displayName: string; role: UserRole }
interface UserUpdatedPayload   { userId: string; changedFields: string[]; displayName?: string }
```

### What consumers do

| Consumer | Event | Effect |
|---|---|---|
| user-service | `user.registered` | Upserts the profile and default notification preferences |
| moderation-service | `incident.created` | Finds duplicate candidates (PostGIS) and opens a moderation case |
| notification-service | `incident.verified` | Calls user-service for alert recipients. Stores `INCIDENT_NEARBY` for each matching user (except the reporter), with push suppressed during quiet hours, plus `REPORT_VERIFIED` for the reporter. Then sends pushes. |
| notification-service | `incident.rejected` | `REPORT_REJECTED` to the reporter, with the reason |
| moderation-service | `incident.verified`, `incident.rejected` | Closes the review case when the decision was made outside the moderation endpoints (e.g. an admin's `PATCH /incidents/:id`): sets it `APPROVED`/`REJECTED` and records the action with the event's `actorId` and `metadata.source = "incident-service"`. A case a moderator already decided is left as is. If the decision arrives before `incident.created`, the case is created already decided. |
| notification-service | `incident.resolved` | `REPORT_RESOLVED` to the reporter (also when the incident was resolved by end reports, ADR-014) |
| notification-service | `notification.requested` | Stores the notification and pushes it |

## Topics and consumer groups

- Topic = event type. Each topic gets `<topic>.dlt` (1 partition, 14-day retention).
- Created by the one-shot `kafka-init` container (`infrastructure/kafka/create-topics.sh`) with
  `KAFKA_TOPIC_PARTITIONS` partitions (3 by default). Broker auto-creation is **disabled**, and the
  clients use `allowAutoTopicCreation: false`.
- Consumer group = service name (`user-service`, `moderation-service`, `notification-service`).
  Each service runs one consumer subscribed to every topic it has handlers for.
- **Ordering:** guaranteed per key only. All events for one incident share a partition (key =
  incidentId); user events are keyed by userId.

## Delivery semantics

**At-least-once.** Nothing in the system claims exactly-once.

Producer (`EventPublisher`):

- kafkajs idempotent producer (`idempotent: true`, `maxInFlightRequests: 1`, `acks: -1`). This
  removes duplicates caused by producer retries only.
- Events are published **after** the database commit. A failed publish is logged and not retried
  (the dual-write gap). See ADR-007; a transactional outbox is the planned fix.

Consumer (`EventConsumer`), for each message:

1. Parse and validate the envelope. If it is malformed, dead-letter it immediately.
2. Run the handler. On error, retry in-process with exponential backoff and full jitter: base
   500 ms, cap 10 s, up to `KAFKA_CONSUMER_MAX_RETRIES` retries (3 by default, so 4 attempts in
   total).
3. A `NonRetryableEventError` skips the remaining retries.
4. After the last failure, publish the original key, value, and headers to `<topic>.dlt` and move on.
5. The offset is committed only after success or a successful dead-letter publish. If the DLT
   publish itself fails, the offset is not committed and the message is redelivered.

If Kafka is unavailable at startup, the consumer retries every 5 s and the service keeps serving
HTTP. notification-service reports *not ready* until its consumer is running.

### DLT headers

| Header | Meaning |
|---|---|
| `dlt-original-topic`, `dlt-original-partition`, `dlt-original-offset` | Where the message came from |
| `dlt-consumer-group` | Which consumer gave up |
| `dlt-error` | Last error message |
| `dlt-attempts` | Attempts made (0 = parse failure) |
| `dlt-failed-at` | ISO timestamp |

The original `event-id`, `event-type`, and `correlation-id` headers are preserved.

### Idempotency

Handlers must be safe to run more than once:

- **`processed_events`**: each consuming schema has a table keyed by `event_id`. The row is
  inserted with `createMany({ skipDuplicates: true })` **in the same transaction** as the handler's
  writes. A count of 0 means the event was already processed, so the handler returns.
- **Business keys** as a second line of defense:
  - `moderation.cases.incident_id` is unique (upsert);
  - `users.profiles` is upserted by id;
  - `notifications` has unique `(user_id, dedupe_key)`, using keys such as
    `incident:<id>:nearby`, `incident:<id>:verified`, and `moderation-action:<actionId>`.
- Side effects that happen after commit (push delivery) can be lost on a crash, but they are never
  duplicated. Records stay `PENDING`, and a retry sweeper is future work.

### Graceful shutdown

On SIGTERM, Nest shutdown hooks call `consumer.disconnect()`. kafkajs waits for in-flight
`eachMessage` handlers, commits, and leaves the group. Then the DLT producer, the event producer,
Redis, and Prisma close.

## Replaying dead letters

There is no tooling yet. To replay manually:

1. Inspect the message in Kafka UI (http://localhost:8080) under `<topic>.dlt`.
2. Fix the cause (data, a code bug, a downstream outage).
3. Re-publish the message value unchanged (same `eventId`) to the original topic, for example from
   Kafka UI's "Produce message". Idempotency makes replays safe.

A `yarn dlt:replay` script with filters by topic and offset is planned.

## Adding an event

See [Development guide → Adding Kafka events](../development/development-guide.md#adding-kafka-events).

## Known gaps

- Dual-write gap between the DB commit and the publish (ADR-007).
- No consumers yet for `incident.updated` or `user.updated`.
- No schema registry. Compatibility relies on the shared TypeScript types and `eventVersion`.
- In-process retries block the partition while they back off. Retry topics with delays are a
  future option.
