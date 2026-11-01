# API Overview

## Conventions

- **Base URL:** `http://localhost:3000/api/v1` through the gateway. Clients only talk to the gateway.
- **Versioning:** URI versioning. Every service uses the global prefix `api` and default version `1`,
  so paths are identical at the gateway and at the service, and the gateway forwards them unchanged.
- **Format:** JSON request and response bodies, `camelCase` fields, ISO 8601 UTC timestamps, UUID ids.
- **Validation:** DTOs with `class-validator`. Unknown body or query fields are **rejected**
  (`forbidNonWhitelisted`). Strings are trimmed where it matters, and emails are lower-cased.
- **Coordinates:** WGS84 `latitude` / `longitude` in decimal degrees. Distances and radii are in metres.

## Authentication

1. `POST /auth/register` or `POST /auth/login` returns `{ user, tokens }`, where
   `tokens = { accessToken, refreshToken, tokenType: "Bearer", expiresIn, refreshTokenExpiresAt }`.
2. Send `Authorization: Bearer <accessToken>`. Access tokens are HS256 JWTs that last 15 minutes by
   default, with the claims `sub`, `email`, `role`, `iss`, and `aud`.
3. When the access token expires, call `POST /auth/refresh` with `{ refreshToken }`. The response
   contains a **new** pair, and the old refresh token is revoked. Reusing a revoked refresh token
   revokes all sessions derived from the same login.
4. `POST /auth/logout` with `{ refreshToken }` (authenticated) revokes it and returns 204.

Roles: `USER`, `MODERATOR`, `ADMIN`. Guests have no token.

**Public routes.** These work without a token; everything else under `/api/v1` requires one at the
gateway:

| Method | Path |
|---|---|
| POST | `/api/v1/auth/register`, `/api/v1/auth/login`, `/api/v1/auth/refresh` |
| GET | `/api/v1/incidents`, `/api/v1/incidents/nearby`, `/api/v1/incidents/:id` |
| OPTIONS | any (CORS preflight) |

A token that is sent but invalid or expired is **always** rejected with 401, even on public routes.

## Response envelope

Success:

```json
{
  "success": true,
  "data": { "id": "…" },
  "meta": { "correlationId": "4f1c…", "timestamp": "2026-10-31T10:00:00.000Z" }
}
```

Paginated success adds `meta.pagination`:

```json
{
  "success": true,
  "data": [ { "id": "…" } ],
  "meta": {
    "correlationId": "…",
    "timestamp": "…",
    "pagination": { "page": 1, "limit": 20, "total": 57, "totalPages": 3 }
  }
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed",
    "details": [{ "field": "latitude", "errors": ["latitude must be a latitude string or number"] }]
  },
  "meta": { "correlationId": "…", "timestamp": "…", "path": "/api/v1/incidents" }
}
```

`204 No Content` responses have no body. Health endpoints and `/openapi/*` return raw (un-enveloped) JSON.

### Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 400 | DTO or query validation failed. `details` lists the fields. |
| `UNAUTHORIZED` | 401 | Missing, invalid, or expired token, or bad credentials |
| `FORBIDDEN` | 403 | Authenticated but not allowed (role or ownership) |
| `RESOURCE_NOT_FOUND` | 404 | Unknown id. Also used for incidents the caller may not see. |
| `CONFLICT` | 409 | Duplicate (for example an email), concurrent modification, or an already-decided case |
| `INVALID_STATE_TRANSITION` | 409 | Incident lifecycle violation. `details: { from, to }` |
| `RATE_LIMITED` | 429 | Gateway rate limit exceeded |
| `DOWNSTREAM_SERVICE_ERROR` | 502 | An upstream service is unreachable or failed |
| `SERVICE_UNAVAILABLE` | 503 | Dependency unavailable |
| `INTERNAL_ERROR` | 500 | Unexpected error (details are logged, not returned) |

Codes are stable. Clients should branch on `error.code`, not on `message`.

## Pagination

List endpoints accept `page` (≥ 1, default 1) and `limit` (1–100, default 20) and return
`meta.pagination`. `GET /incidents/nearby` is not paginated. It returns the closest `limit`
results (1–200, default 50).

## Headers

| Header | Direction | Purpose |
|---|---|---|
| `Authorization: Bearer …` | request | Access token |
| `x-correlation-id` | both | Accepted if it matches `[A-Za-z0-9._:-]{1,128}`, otherwise generated. Echoed in responses, logs, errors, and events. |
| `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` | response (gateway) | Fixed-window rate limit per client IP: `RATE_LIMIT_MAX_REQUESTS` per `RATE_LIMIT_WINDOW_SECONDS` (120/60 s by default) |
| `Retry-After` | response (429) | Seconds until the window resets |

## Endpoints

### Auth: `auth-service`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | public | `{ email, password (8–128, a letter and a digit), displayName }` → 201 `{ user, tokens }` |
| POST | `/auth/login` | public | `{ email, password }` → `{ user, tokens }` |
| POST | `/auth/refresh` | public | `{ refreshToken }` → new token pair (rotation) |
| POST | `/auth/logout` | user | `{ refreshToken }` → 204 |
| GET | `/auth/me` | user | Account `{ id, email, role, createdAt }` |

### Users: `user-service`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users/me` | user | Profile (created lazily if missing) |
| PATCH | `/users/me` | user | `{ displayName?, avatarUrl? (https), locale? (vi\|en) }` |
| GET | `/users/me/saved-areas` | user | List saved areas |
| POST | `/users/me/saved-areas` | user | `{ name, latitude, longitude, radiusMeters (50–50000) }`, max 10 per user |
| DELETE | `/users/me/saved-areas/:id` | user | 204 |
| GET | `/users/me/notification-preferences` | user | `{ pushEnabled, incidentTypes[], quietHoursStart, quietHoursEnd }` |
| PATCH | `/users/me/notification-preferences` | user | Partial update. Quiet hours (0–23, Vietnam time) must both be set or both be null. |

### Incidents: `incident-service`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/incidents` | user | `{ type, title (5–150), description?, latitude, longitude, occurredAt? (≤ 7 days ago, not in the future), media?: [{ url (https), type: IMAGE\|VIDEO }] (max 5) }` → 201, status `PENDING` |
| GET | `/incidents` | public | Paginated. Filters: `statuses`, `types` (comma-separated or repeated), `mine=true` (own reports, any status; needs auth), bounding box `minLat,minLng,maxLat,maxLng` (all four or none, each side ≤ 5°). Guests and users see only `VERIFIED`, `ACTIVE`, `RESOLVED`; moderators can filter any status. |
| GET | `/incidents/nearby` | public | `latitude, longitude, radiusMeters (≤ 50000, default 2000), types?, limit?`. Closest first, with `distanceMeters`. Shows `VERIFIED`/`ACTIVE` (plus `PENDING` for moderators). |
| GET | `/incidents/:id` | public | Detail with media. Non-public incidents return 404 unless the caller is the reporter or a moderator. Cached in Redis. |
| PATCH | `/incidents/:id` | user | The reporter can edit `type`, `title`, `description` while `PENDING`. Moderators and admins can edit content and change `status` (with `reason`, which is required for `REJECTED`). |
| GET | `/incidents/:id/history` | reporter / moderator | Audit trail |

Incident lifecycle: `PENDING → VERIFIED → ACTIVE → RESOLVED`, and `PENDING → REJECTED`. Any other
transition returns `409 INVALID_STATE_TRANSITION`.

### Moderation: `moderation-service` (MODERATOR or ADMIN only)

| Method | Path | Description |
|---|---|---|
| GET | `/moderation/reports` | Queue, oldest first. `status` filter (default `OPEN`), paginated |
| GET | `/moderation/reports/:id` | Case with `possibleDuplicateIds` and its action log |
| POST | `/moderation/reports/:id/approve` | `{ note? }`: incident → `VERIFIED`, which publishes `incident.verified` |
| POST | `/moderation/reports/:id/reject` | `{ reason (5–500) }` (**required**): incident → `REJECTED` |
| POST | `/moderation/reports/:id/request-info` | `{ message }`: case → `INFO_REQUESTED`, and the reporter is notified |

`:id` is the moderation **case** id. A case that has already been decided returns 409.

### Notifications: `notification-service`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/notifications` | user | Paginated, newest first. `unreadOnly=true` filter |
| PATCH | `/notifications/read-all` | user | `{ updated }` |
| PATCH | `/notifications/:id/read` | user | Marks one notification read |
| GET | `/notifications/preferences` | user | Read-through to user-service (the owner) |
| POST | `/notifications/devices` | user | `{ token, platform: ANDROID\|IOS\|WEB }` registers an FCM token → 204 |

### Internal endpoints (not exposed by the gateway)

Require `x-internal-api-key`. They are outside `/api/v1` and excluded from Swagger.

| Service | Method | Path | Used by |
|---|---|---|---|
| incident | POST | `/internal/incidents/:id/transitions` `{ status, actorId, reason? }` | moderation-service |
| user | GET | `/internal/alert-recipients?latitude&longitude&incidentType` | notification-service |
| user | GET | `/internal/users/:id/notification-preferences` | notification-service |

## Health

Every service and the gateway expose these. They are outside `/api/v1` and need no auth.

| Path | Meaning |
|---|---|
| `GET /health/live` | Liveness: the process serves HTTP |
| `GET /health` | Readiness: the database (all domain services), Redis (gateway), Kafka (notification-service). Returns 503 when a dependency is down. |
| `GET /health/services` | Gateway only. `up`/`down` for each downstream service; always 200 |

## Swagger / OpenAPI

- Each service: `http://localhost:<port>/docs` (UI) and `/docs-json`. Disable with `SWAGGER_ENABLED=false`.
- The gateway (http://localhost:3000/docs) has a selector listing the gateway's own document and
  every service document, which the gateway proxies through `/openapi/<service>`. Because service
  paths already include `/api/v1`, "Try it out" sends requests through the gateway.
- Use **Authorize** with the `accessToken` from login.
