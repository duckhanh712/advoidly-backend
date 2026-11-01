#!/usr/bin/env bash
# Checks that the local infrastructure started by docker-compose.yml is healthy and
# correctly provisioned. Usage: yarn infra:verify
set -uo pipefail

cd "$(dirname "$0")/../.."
failures=0

check() {
  local name="$1"; shift
  if output=$("$@" 2>&1); then
    printf '  \033[32m✔\033[0m %s\n' "$name"
  else
    printf '  \033[31m✘\033[0m %s\n%s\n' "$name" "$output" | sed 's/^/      /'
    failures=$((failures + 1))
  fi
}

psql_exec() {
  docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -tA -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$0"' "$1"
}

echo "Container health"
for svc in postgres redis kafka; do
  check "$svc is healthy" bash -c "docker compose ps --format '{{.Health}}' $svc | grep -q healthy"
done

echo "PostgreSQL"
check "PostGIS extension installed" psql_exec "SELECT postgis_full_version();"
for role in auth_service user_service incident_service moderation_service notification_service; do
  check "role $role exists" bash -c "[ \"\$(docker compose exec -T postgres sh -c 'psql -tA -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"SELECT 1 FROM pg_roles WHERE rolname='\''$role'\''\"')\" = 1 ]"
done

echo "Redis"
check "PING" bash -c "docker compose exec -T redis redis-cli ping | grep -q PONG"

echo "Kafka"
topics=$(docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:29092 --list 2>/dev/null)
while read -r topic; do
  check "topic $topic (+ .dlt)" bash -c "grep -qx '$topic' <<<\"$topics\" && grep -qx '$topic.dlt' <<<\"$topics\""
done < <(grep -vE '^\s*(#|$)' infrastructure/kafka/topics.txt)

if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo "All infrastructure checks passed"
