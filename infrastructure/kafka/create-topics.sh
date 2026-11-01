#!/usr/bin/env bash
# Creates application topics and their dead-letter topics. Idempotent.
# Runs as the one-shot `kafka-init` service in docker-compose.yml.
set -euo pipefail

BOOTSTRAP="${KAFKA_BOOTSTRAP:-kafka:29092}"
PARTITIONS="${TOPIC_PARTITIONS:-3}"
REPLICATION="${TOPIC_REPLICATION_FACTOR:-1}"
DLT_RETENTION_MS="${DLT_RETENTION_MS:-1209600000}" # 14 days
TOPICS_FILE="${TOPICS_FILE:-/scripts/topics.txt}"
# The official apache/kafka image keeps its CLI tools in /opt/kafka/bin (not on PATH).
KAFKA_TOPICS="${KAFKA_TOPICS:-/opt/kafka/bin/kafka-topics.sh}"

# The broker can report healthy slightly before it accepts admin requests; wait for it.
for attempt in $(seq 1 30); do
  if "$KAFKA_TOPICS" --bootstrap-server "$BOOTSTRAP" --list > /dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "Kafka at $BOOTSTRAP is not reachable; giving up" >&2
    exit 1
  fi
  echo "Waiting for Kafka at $BOOTSTRAP ($attempt/30)..."
  sleep 2
done

create_topic() {
  "$KAFKA_TOPICS" --bootstrap-server "$BOOTSTRAP" --create --if-not-exists \
    --topic "$1" --partitions "$2" --replication-factor "$REPLICATION" "${@:3}"
}

grep -vE '^\s*(#|$)' "$TOPICS_FILE" | while read -r topic; do
  create_topic "$topic" "$PARTITIONS"
  create_topic "${topic}.dlt" 1 --config "retention.ms=${DLT_RETENTION_MS}"
done

"$KAFKA_TOPICS" --bootstrap-server "$BOOTSTRAP" --list
