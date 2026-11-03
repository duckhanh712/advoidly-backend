#!/bin/sh
# Creates the incident media bucket and makes its objects publicly readable. Idempotent.
# Runs as the one-shot `minio-init` service in docker-compose.yml.
#
# Read access is anonymous because object names are random UUIDs (ADR-015, decided in TODO 1.4).
# Writes are never anonymous: clients upload with a short-lived presigned PUT URL from
# incident-service.
set -eu

: "${MINIO_ENDPOINT:?}" "${MINIO_ROOT_USER:?}" "${MINIO_ROOT_PASSWORD:?}" "${MEDIA_BUCKET:?}"

# The server can report healthy a moment before it accepts admin requests; retry the alias.
attempt=1
until mc alias set local "$MINIO_ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" > /dev/null 2>&1; do
  if [ "$attempt" -ge 30 ]; then
    echo "MinIO at $MINIO_ENDPOINT is not reachable; giving up" >&2
    exit 1
  fi
  echo "Waiting for MinIO at $MINIO_ENDPOINT ($attempt/30)..."
  attempt=$((attempt + 1))
  sleep 2
done

mc mb --ignore-existing "local/$MEDIA_BUCKET"
mc anonymous set download "local/$MEDIA_BUCKET"
echo "Bucket '$MEDIA_BUCKET' is ready (public read, presigned writes only)."
