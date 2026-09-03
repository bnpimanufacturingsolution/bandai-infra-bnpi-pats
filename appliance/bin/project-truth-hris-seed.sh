#!/usr/bin/env bash
set -euo pipefail

cd /opt/project-truth/appliance

if ! docker network inspect hris-observability >/dev/null 2>&1; then
  docker network create hris-observability >/dev/null
fi

compose() {
  if command -v docker compose >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

echo "Starting Project Truth Postgres..."
compose up -d postgres

echo "Removing previous seed job container, if present..."
compose rm -f hris-api-db-init >/dev/null 2>&1 || true

echo "Running Prisma db push and seed..."
compose up --build --abort-on-container-exit --exit-code-from hris-api-db-init hris-api-db-init

echo "Seed completed. Restarting API so it sees the latest data..."
compose up -d hris-api hris-app
