#!/usr/bin/env bash
set -euo pipefail

cd /opt/project-truth/appliance

if [ "${PROJECT_TRUTH_QUIET_STARTUP:-false}" = "true" ]; then
  mkdir -p /var/log
  exec >>/var/log/project-truth-hris-startup.log 2>&1
fi

if ! docker network inspect hris-observability >/dev/null 2>&1; then
  docker network create hris-observability >/dev/null
fi

if [ "${PROJECT_TRUTH_OBSERVABILITY_ENABLED:-true}" = "false" ]; then
  echo "Observability startup disabled by PROJECT_TRUTH_OBSERVABILITY_ENABLED=false"
elif command -v project-truth-hris-observability-start >/dev/null 2>&1; then
  if ! project-truth-hris-observability-start; then
    echo "Observability startup failed; continuing with HRIS app startup" >&2
  fi
elif [ -f /opt/project-truth/appliance/bin/project-truth-hris-observability-start.sh ]; then
  if ! bash /opt/project-truth/appliance/bin/project-truth-hris-observability-start.sh; then
    echo "Observability startup failed; continuing with HRIS app startup" >&2
  fi
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
