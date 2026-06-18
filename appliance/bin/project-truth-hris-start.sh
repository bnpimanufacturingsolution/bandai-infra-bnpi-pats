#!/usr/bin/env bash
set -euo pipefail

cd /opt/project-truth/appliance

if command -v project-truth-hris-observability-start >/dev/null 2>&1; then
  project-truth-hris-observability-start
elif [ -f /opt/project-truth/appliance/bin/project-truth-hris-observability-start.sh ]; then
  bash /opt/project-truth/appliance/bin/project-truth-hris-observability-start.sh
else
  echo "Observability starter not installed; continuing with HRIS app startup" >&2
fi

if ! docker image inspect hris-api-local:develop >/dev/null 2>&1 || ! docker image inspect hris-api-db-init:develop >/dev/null 2>&1 || ! docker image inspect hris-app-local:develop >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    docker compose build
  else
    docker-compose build
  fi
fi

if docker compose version >/dev/null 2>&1; then
  docker compose up -d postgres
  docker compose up -d --no-deps hris-api
  docker compose up -d --no-deps hris-app
else
  docker-compose up -d postgres
  docker-compose up -d --no-deps hris-api
  docker-compose up -d --no-deps hris-app
fi
