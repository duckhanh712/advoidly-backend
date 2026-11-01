#!/usr/bin/env bash
# Creates one PostgreSQL schema and one least-privileged login role per service.
#
# Runs automatically on the FIRST start of the postgres container (empty volume).
# It is idempotent, so it can be re-applied to an existing database with:
#   docker compose exec -T postgres bash /docker-entrypoint-initdb.d/20-roles-and-schemas.sh
#
# Ownership model:
#   - $POSTGRES_USER owns every schema and runs migrations (Prisma CLI).
#   - <service>_service roles get DML on their own schema only; they cannot create or
#     alter tables, and cannot read any other service's schema.
set -euo pipefail

: "${POSTGRES_USER:?}" "${POSTGRES_DB:?}" "${SERVICE_DB_PASSWORD:?SERVICE_DB_PASSWORD is required}"

# role:schema
SERVICES=(
  "auth_service:auth"
  "user_service:users"
  "incident_service:incidents"
  "moderation_service:moderation"
  "notification_service:notifications"
)

run_sql() {
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -v owner="$POSTGRES_USER" -v svc_password="$SERVICE_DB_PASSWORD" "$@"
}

run_sql <<'EOSQL'
CREATE EXTENSION IF NOT EXISTS postgis;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
EOSQL

for entry in "${SERVICES[@]}"; do
  role="${entry%%:*}"
  schema="${entry##*:}"
  echo "Configuring role '${role}' for schema '${schema}'"
  run_sql -v role="$role" -v schema="$schema" <<'EOSQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'svc_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role') \gexec
ALTER ROLE :"role" WITH LOGIN PASSWORD :'svc_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER ROLE :"role" SET search_path = :"schema", public;

CREATE SCHEMA IF NOT EXISTS :"schema" AUTHORIZATION :"owner";
GRANT CONNECT ON DATABASE :"DBNAME" TO :"role";
GRANT USAGE ON SCHEMA :"schema" TO :"role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA :"schema" TO :"role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA :"schema" TO :"role";

-- Tables created later by migrations (run as the owner) inherit these grants.
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA :"schema"
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA :"schema"
  GRANT USAGE, SELECT ON SEQUENCES TO :"role";
EOSQL
done

echo "Service roles and schemas configured."
