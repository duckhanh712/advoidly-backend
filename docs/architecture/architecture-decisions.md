# Architecture Decision Records

Each record is short: context, decision, consequences. Status is *Accepted* unless noted.

---

## ADR-001: NestJS 11 monorepo, Node 22, Yarn

**Context.** There are six services and several shared libraries, maintained by a small team
(initially one developer). NestJS 12 was released days before this foundation was created and is
ESM-only.

**Decision.** One repository using NestJS's native monorepo mode (`nest-cli.json` projects, webpack
build per app, `@app/*` path aliases). NestJS 11.2 (CommonJS), Node 22 LTS, Yarn 1.22 classic (pinned through
`packageManager`, flat `node_modules`), TypeScript strict mode.

**Consequences.**
- One `package.json` and one lockfile; dependency versions are identical across services.
- Each app builds to its own bundle (`dist/apps/<app>/main.js`) and can be deployed on its own.
- Shared code changes affect every service at once. This is convenient now; later it may need
  library versioning or CI that builds only affected apps.
- Upgrading to NestJS 12 means moving to ESM. Plan it as its own task.

## ADR-002: One PostgreSQL instance, schema per service, role per service

**Context.** The specification requires each service to own its data. Separate database servers
per service are too expensive to operate for an MVP.

**Decision.**
- One PostgreSQL + PostGIS instance with five schemas: `auth`, `users`, `incidents`,
  `moderation`, `notifications`.
- One login role per service, with DML grants on its own schema only. Default privileges make new
  tables follow the same rule (`infrastructure/postgres/init/20-roles-and-schemas.sh`).
- One `prisma/schema.prisma` and **one migration history**, applied by the owner role.
- **No foreign keys across schemas.** Services reference each other by UUID.

**Consequences.**
- Isolation is enforced by PostgreSQL, not just by convention. A cross-schema query fails with
  `permission denied` even though every service uses the same generated Prisma client.
- One migration pipeline is easy for a single developer, but schema changes for all services ship
  together. Splitting into per-service Prisma schemas and migration folders later is mechanical,
  because no cross-schema relations exist.
- One instance is a shared failure and capacity domain. That is acceptable for the MVP. Moving a
  schema to its own server requires no application changes beyond its connection URL.

## ADR-003: PostGIS geography columns maintained by triggers, accessed with raw SQL

**Context.** Prisma has no PostGIS types. Spatial filtering must happen in the database, never in
application memory.

**Decision.**
- Store `latitude` / `longitude` as `double precision`, which Prisma reads and writes.
- `location geography(Point,4326)` is a plain nullable column set from those values by a
  `BEFORE INSERT OR UPDATE OF latitude, longitude` trigger, declared in Prisma as
  `Unsupported("geography(Point,4326)")?`. Prisma never writes it.
- GiST indexes on every `location`.
- Spatial queries use `$queryRaw` with bound parameters (`ST_DWithin`, `&&` with
  `ST_MakeEnvelope`, `ST_Distance`). Helpers live in `libs/database/src/geo.ts`.

**Consequences.** Normal Prisma `create` and `update` calls keep the point consistent. The
triggers and CHECK constraints live only in the hand-edited migration SQL; Prisma does not diff
them, but every new migration has to be reviewed with that in mind.

**Rejected: stored GENERATED columns.** They were the first implementation. Prisma 6 reads a
generation expression as a column DEFAULT, so `prisma migrate dev` kept producing an
`ALTER COLUMN "location" DROP DEFAULT` migration that fails on a generated column (P3018).
Spatial reads are raw SQL, so their result types are declared by hand.

## ADR-004: Thin gateway; JWT verified at the gateway and in every service

**Context.** The gateway must authenticate, rate-limit, and route, but must not hold business logic.

**Decision.** The gateway is a path-preserving reverse proxy (`http-proxy-middleware`) with no body
parsing. It rejects missing or invalid tokens on non-public routes. Services verify the same HS256
access token again with a global `JwtAuthGuard` and enforce roles with `RolesGuard`. The access
token TTL defaults to 15 minutes.

**Consequences.**
- The gateway stays generic. Adding a route means adding one line to `PROXY_ROUTES` (plus
  `PUBLIC_ROUTES` if it needs no token).
- Services remain safe if they are reached without the gateway (defense in depth).
- Every service holds the signing secret. Moving to RS256 with a JWKS endpoint in auth-service
  would limit signing to auth-service. That is a planned improvement.
- Body validation errors come from the services, so they carry each service's DTO messages.

## ADR-005: Synchronous internal REST with a shared API key

**Context.** Some interactions need an immediate answer: applying a moderation decision, and
finding alert recipients.

**Decision.** `/internal/*` routes outside the public prefix, excluded from Swagger, protected by
`x-internal-api-key` (compared in constant time), and called through `InternalHttpClient` with a
timeout and correlation-id propagation.

**Consequences.** It is simple and observable. A shared key is coarse: every service can call every
internal route. A future step is mTLS or per-service credentials with network policies. Synchronous
calls couple availability, so callers handle failures. Kafka consumers retry, and moderation rolls
back its own transaction.

## ADR-006: Kafka topic per event, kafkajs, at-least-once delivery

**Context.** Events must be strongly typed, retryable, and safe to process more than once.

**Decision.**
- Topic name = event type (`incident.created`, …). The dead-letter topic is `<topic>.dlt`. Topics
  are created explicitly by `kafka-init`, and broker auto-creation is off.
- The `BaseEvent<T>` envelope (`eventId`, `eventType`, `eventVersion`, `occurredAt`,
  `correlationId`, `producer`, `payload`). The payload type of each event comes from
  `EventPayloadMap`.
- The idempotent kafkajs producer with `acks=-1`.
- One consumer group per service (`groupId = service name`). Offsets are committed after the
  handler succeeds or the message is dead-lettered. In-process retries use exponential backoff
  with jitter (`KAFKA_CONSUMER_MAX_RETRIES`). Malformed or `NonRetryableEventError` messages go
  straight to the DLT.
- Consumers are idempotent: a `processed_events` table per schema, written in the handler's
  transaction, plus business dedupe keys.

**Consequences.** **At-least-once** delivery, not exactly-once, and none is claimed. In-process
retries block the partition while they back off, which is acceptable at MVP volume. Retry topics
can be added later. kafkajs is in maintenance mode; `@confluentinc/kafka-javascript` is the likely
migration target, and it is isolated behind `libs/kafka`.

## ADR-007: Dual-write gap and a transactional outbox (deferred)

**Context.** Services commit to PostgreSQL and then publish to Kafka. A crash or a Kafka outage
between the two loses the event.

**Decision (now).** Publish after commit. A failed publish is **logged, not rethrown**, so the API
reflects the stored state. Consumers tolerate missing upstream events where possible; for example,
user-service lazily creates a profile on `GET /users/me`.

**Next step.** A transactional outbox: write the event to an `outbox` table in the same transaction,
and relay it to Kafka with a poller or CDC. The publish calls are centralized
(`publishSafely`/`EventPublisher`), so the change stays local.

## ADR-008: incident-service is the only writer of incident state

**Context.** Moderation decides; the incident lifecycle belongs to incident-service.

**Decision.** Moderation applies approve/reject by calling
`POST /internal/incidents/:id/transitions` **inside** its own database transaction. If
incident-service refuses (invalid transition, conflict), the case update and the action record roll
back. Incident-service validates the transition with its state machine and a compare-and-set update,
records history, and publishes `incident.verified` / `incident.rejected`. If a previous attempt
changed the incident but failed to commit locally, a retry that gets `INVALID_STATE_TRANSITION` with
`from == target` is treated as success.

**Consequences.** There is one source of truth and one producer for `incident.*`. The moderation
transaction stays open during an HTTP call (5 s client timeout, 15 s transaction timeout), which is
acceptable at moderation volumes.

## ADR-009: Argon2id passwords; opaque, hashed, rotating refresh tokens

**Decision.**
- Argon2id (19 MiB, t=2, p=1; OWASP baseline). Hashes are upgraded on login when the parameters
  change.
- Login runs a dummy verification for unknown emails to reduce user enumeration by timing.
- Refresh tokens are 384-bit random strings. Only their SHA-256 hash is stored. Every refresh
  rotates the token inside a `familyId`. Presenting a revoked token revokes the whole family
  (reuse detection), and a concurrent refresh with the same token is rejected by a conditional
  update.

**Consequences.** A stolen database dump cannot be replayed as tokens. Access tokens cannot be
revoked before they expire (15 minutes by default). Registration returns 409 for existing emails,
which is a deliberate trade-off for usability.

## ADR-010: FCM over the HTTP v1 API without `firebase-admin`

**Context.** Push must go through an adapter and work locally without credentials. `firebase-admin`
pulls in a large dependency tree (google-auth-library, gRPC, and others) just to send a message.

**Decision.** `PushProvider` interface with `FcmPushProvider` (HTTP v1; service-account OAuth JWT
signed with `node:crypto`; cached access token; deletes unregistered tokens) and
`MockPushProvider`. The provider is chosen at startup based on whether `FCM_*` is configured.

**Consequences.** There is no extra runtime dependency. Topics, multicast, and APNs-specific
options are not implemented yet and would be added to the adapter.

## ADR-011: Prisma 6, not Prisma 7

**Context.** Prisma 7 requires driver adapters, `prisma.config.ts`, and the new generator, with
ESM-first output.

**Decision.** Prisma 6.19 with `prisma-client-js`. Multi-schema support is GA, so no preview flag
is needed. The CLI settings stay in `package.json#prisma` (seed command), which Prisma 6 marks
deprecated with a warning.

**Consequences.** It is stable with NestJS 11 CJS. Migrating to Prisma 7 (with `prisma.config.ts`
and `dotenv` loading) should be planned together with the NestJS 12/ESM move.

## ADR-012: Redis for caching and fail-open rate limiting

**Decision.**
- Incident detail is cached (`INCIDENT_CACHE_TTL_SECONDS`, 60 s by default) and invalidated on
  every change. Cache errors count as misses.
- The gateway uses a per-IP fixed-window counter (`INCR` + `EXPIRE NX`), shared across gateway
  instances. If Redis is down, requests are allowed and a warning is logged.

**Consequences.** Redis is never a hard dependency for reads, so incident-service readiness
ignores it. A fixed window allows bursts at window edges. Per-user limits for authenticated
traffic and stricter limits on `/auth/login` are possible refinements.

## ADR-013: User entity split between auth and users (deviation from the initial spec)

**Context.** The initial spec listed a single `User` with `displayName`. Credentials and profile
data have different owners and change at different rates.

**Decision.** `auth.users` holds identity only (`email`, `passwordHash`, `role`). `users.profiles`
(id = auth user id) holds `displayName`, `avatarUrl`, `locale`, and is created from
`user.registered` (or lazily from token claims). `displayName` is collected at registration and
carried in the event.

**Consequences.** Auth-service never stores profile data, and user-service never sees password
hashes. A profile is eventually consistent with registration, which the lazy creation covers.
