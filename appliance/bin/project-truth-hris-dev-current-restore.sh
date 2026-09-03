#!/usr/bin/env bash
set -euo pipefail

cd /opt/project-truth/appliance

if ! docker network inspect hris-observability >/dev/null 2>&1; then
  docker network create hris-observability >/dev/null
fi

dump_path="${PROJECT_TRUTH_DEV_CURRENT_DUMP:-/opt/project-truth/appliance/seeds/dev-current/dev-current.dump}"

compose_env() {
  if command -v docker compose >/dev/null 2>&1; then
    docker compose -f docker-compose.environments.yml "$@"
  else
    docker-compose -f docker-compose.environments.yml "$@"
  fi
}

if [ ! -s "$dump_path" ]; then
  echo "DEV current-data dump not found: $dump_path" >&2
  exit 1
fi

echo "Starting DEV Postgres..."
compose_env up -d hris-postgres-dev

echo "Waiting for DEV Postgres..."
for _ in $(seq 1 60); do
  if docker exec hris-postgres-dev pg_isready -U postgres -d hris >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

docker exec hris-postgres-dev pg_isready -U postgres -d hris >/dev/null

echo "Resetting DEV public schema..."
docker exec hris-postgres-dev psql -U postgres -d hris -v ON_ERROR_STOP=1 \
  -c "drop schema if exists public cascade; create schema public; grant all on schema public to postgres; grant all on schema public to public;"

echo "Restoring DEV current-data snapshot..."
docker cp "$dump_path" hris-postgres-dev:/tmp/project-truth-dev-current.dump
docker exec hris-postgres-dev pg_restore -U postgres -d hris --no-owner --no-acl /tmp/project-truth-dev-current.dump
docker exec hris-postgres-dev rm -f /tmp/project-truth-dev-current.dump

echo "Restarting DEV API and app..."
compose_env up -d --no-deps hris-api-dev hris-app-dev

echo "DEV current-data restore complete."
