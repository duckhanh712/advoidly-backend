# Development Guide

## Local setup

```bash
nvm use                 # Node 22 (.nvmrc)
yarn install
cp .env.example .env
docker compose up -d && yarn infra:verify
yarn prisma:generate && yarn prisma:migrate && yarn prisma:seed
yarn dev                # all services, watch mode
```

Run `yarn prisma:generate` again after every change to `prisma/schema.prisma`.

## Running individual services

```bash
yarn dev:incident-service          # nest start incident-service --watch
yarn build:incident-service        # dist/apps/incident-service/main.js
APP=incident-service yarn start:prod
```

A service needs its own dependencies running (Postgres, plus Kafka and Redis where it uses them)
and, for internal calls, the services it calls: moderation → incident, notification → user. A
service still starts when Kafka or the database is down. Its readiness endpoint (`/health`)
reports the problem, and the Kafka consumer keeps retrying.

## Repository conventions

- **Apps** (`apps/<service>/src`): `main.ts` calls `bootstrapService()`, and `app.module.ts`
  composes the shared modules. Code is organized by feature folder (`incidents/`, `saved-areas/`,
  …) with `*.controller.ts`, `*.service.ts`, and `dto/`. Service-to-service routes go in
  `internal/`, Kafka handlers in `events/`, and outbound clients in `clients/`.
- **Libraries** (`libs/*`): technical building blocks and shared contracts only. Business rules
  stay in the owning service. Import them through aliases (`@app/common`, `@app/contracts`, …),
  never through relative paths across projects.
- **Never** import another service's code, and never query another service's schema. The database
  role forbids it anyway.
- **Errors:** throw the exceptions from `@app/common` (`ResourceNotFoundException`,
  `ConflictException`, `ForbiddenException`, `InvalidStateTransitionException`,
  `AppException(code, …)`). Do not build error responses by hand.
- **Responses:** return plain objects. The envelope is added for you. Return
  `PaginatedResult.of(items, query, total)` for paginated lists.
- **Auth:** every route requires a token by default. Use `@Public()`, `@Authenticated()` (Swagger
  documentation only), `@Roles(...)`, `@CurrentUser()`, `@CorrelationId()`, `@InternalApi()`.
- **Config:** inject `@InjectAppConfig() config: AppConfig`. Add new variables to
  `EnvironmentVariables` (validated) and `AppConfig`, and document them in `.env.example`.
- **Logging:** use `new Logger(Class.name)` with structured objects first:
  `logger.log({ incidentId, correlationId }, 'message')`. Never log secrets or tokens.
- **Style:** TypeScript strict, Prettier (single quotes, 100 columns), ESLint. Run `yarn lint`,
  `yarn format:check`, and `yarn typecheck` before pushing.

## Adding an endpoint

1. Write a DTO with `class-validator` and `@nestjs/swagger` decorators. Validation is global, and
   unknown fields are rejected.
2. Add the controller method. Mark it `@Public()` if guests may call it, or add `@Roles()` if it is
   role-restricted.
3. Put the logic in the service. Use `@CorrelationId()` when the method publishes events or calls
   other services.
4. If guests must reach it through the gateway, add a pattern to `PUBLIC_ROUTES` in
   `apps/api-gateway/src/proxy/routes.ts`.
5. Add tests: DTO validation, authorization, and the business rule.

## Adding a new service

1. `nest-cli.json`: add a project (`apps/<name>`, `entryFile: "main"`, and its `tsConfigPath`).
2. Create `apps/<name>/tsconfig.app.json` (copy an existing one, change `outDir`), plus
   `src/main.ts` and `src/app.module.ts` (`AppConfigModule.forService('<name>')`,
   `ObservabilityModule`, `SecurityModule`, and the modules you need such as `DatabaseModule`,
   `KafkaModule`, `RedisModule`, `HealthModule.forRoot([...])`).
3. `libs/config/src/service-name.ts`: add the name to `SERVICE_NAMES`, `SERVICE_ENV_PREFIX`, and
   `DEFAULT_PORTS`. If other services call it, add a URL to `EnvironmentVariables` /
   `AppConfig.services`.
4. If it owns data: add a schema to `datasource.schemas` in `schema.prisma`, add a `role:schema`
   entry in `infrastructure/postgres/init/20-roles-and-schemas.sh` (then re-apply the script), and
   add `<PREFIX>_DATABASE_URL` to `.env.example`.
5. If it is public: add a route to `PROXY_ROUTES` (and `PUBLIC_ROUTES` if needed) in the gateway.
6. Add `build:`, `dev:`, and the `yarn dev` entries in `package.json`.
7. Document it in `docs/architecture/system-overview.md` and `docs/api/api-overview.md`.

## Creating migrations

```bash
# 1. edit prisma/schema.prisma (@@schema + @@map with snake_case names)
yarn prisma migrate dev --create-only --name add_incident_confirmations
# 2. review / hand-edit prisma/migrations/<timestamp>_add_incident_confirmations/migration.sql
yarn prisma:migrate
```

Rules:

- No foreign keys across schemas.
- Spatial data follows the `latitude`/`longitude` + trigger-maintained `geography(Point,4326)`
  `location` + GiST pattern. Write the trigger and CHECK constraints in the SQL by hand (never a
  GENERATED column; see ADR-003).
- Use `timestamptz(3)` with UTC, and UUID ids.
- Never edit a migration that has already been applied anywhere. Add a new one.

See [Database design](../database/database-design.md#migrations).

## Adding Kafka events

1. **Contract** (`libs/contracts/src/events/`):
   - add the name to `EventTypes` in `event-types.ts`;
   - add the payload interface in `payloads.ts`;
   - map it in `EventPayloadMap` and set its version in `EVENT_VERSIONS` (`event-map.ts`).
2. **Topic:** add the name to `infrastructure/kafka/topics.txt`. A unit test fails if
   `EventTypes` and `topics.txt` diverge. Then run `docker compose run --rm kafka-init` to create
   the topic and its `.dlt`.
3. **Publish:** inject `EventPublisher` and call
   `publish(EventTypes.X, payload, { correlationId, key })`. Choose a key that preserves the
   ordering you need (usually the aggregate id). Publish **after** the database commit, and log
   failures (see ADR-007).
4. **Consume:** in an `@Injectable()` handler implementing `OnModuleInit`, call
   `consumer.on(EventTypes.X, (event) => this.handle(event))`. Handlers must be **idempotent**:
   insert into the schema's `processed_events` table inside the same transaction and return early
   when the insert count is 0. Throw `NonRetryableEventError` for failures that retrying cannot fix.
5. Update [docs/events/event-catalog.md](../events/event-catalog.md).

For a breaking payload change, bump `EVENT_VERSIONS` and keep consumers able to read the previous
version until all producers are upgraded.

## Testing

| Kind | Location / pattern | Needs infrastructure | Command |
|---|---|---|---|
| Unit | `*.spec.ts` next to the code | no | `yarn test` |
| In-process HTTP | `*.spec.ts` using helpers in `test/` | no | `yarn test` |
| Integration | `*.int-spec.ts` (config `test/jest-integration.json`) | yes: `docker compose up -d` + migrated DB | `yarn test:integration` |

- HTTP-level tests boot a real Nest application (global pipe, filter, envelope, guards) and send
  requests in-process with [`light-my-request`](https://github.com/fastify/light-my-request)
  against the Express handler, so no port is opened. External collaborators (Prisma, Kafka, HTTP
  clients) are replaced with Jest mocks.
- Guards are tested against the **real controller metadata** (`@Roles`, `@Public`), so a missing
  decorator fails a test.
- Integration tests exercise the real PostGIS queries and the per-service database roles. They
  require the infrastructure, and they do not run in `yarn test`.
- Write tests that pin behavior: validation rules, authorization, state transitions, idempotency.
  Do not write tests that only assert that something is defined.

The `@app/*` aliases are mapped in `jest.config.js` (`moduleNameMapper`).

## Debugging tips

- Follow one request across services by filtering logs on its `correlationId`. It also appears in
  Kafka event envelopes and headers.
- Kafka UI (http://localhost:8080) shows topics, consumer group lag, and DLT messages.
- `yarn prisma:studio` browses the database as the owner role.
- `LOG_LEVEL=debug` turns on debug logs. The kafkajs client itself is fixed at WARN in
  `libs/kafka/src/kafka.module.ts`.
