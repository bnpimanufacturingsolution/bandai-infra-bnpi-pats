#!/usr/bin/env bash
set -euo pipefail

if [ "${PROJECT_TRUTH_OBSERVABILITY_ENABLED:-true}" = "false" ]; then
  echo "HRIS observability startup skipped because PROJECT_TRUTH_OBSERVABILITY_ENABLED=false"
  exit 0
fi

project_root="${PROJECT_TRUTH_ROOT:-/opt/project-truth}"
observability_dir="${project_root}/hris-api/infrastructure/onprem/observability"
data_root="${OBSERVABILITY_DATA_ROOT:-/srv/hris/observability}"

if [ ! -d "$observability_dir" ]; then
  echo "Observability directory not found: $observability_dir" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required before starting observability" >&2
  exit 1
fi

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    echo "Docker Compose is required before starting observability" >&2
    exit 1
  fi
}

mkdir -p \
  "${data_root}/grafana" \
  "${data_root}/prometheus" \
  "${data_root}/loki" \
  "${data_root}/tempo" \
  "${data_root}/alertmanager" \
  "${data_root}/collector" \
  "${data_root}/backups"

cd "$observability_dir"

if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  echo "Created observability .env from .env.example; set GRAFANA_ADMIN_PASSWORD before production use"
fi

if [ ! -f backup/.env ] && [ -f backup/.env.example ]; then
  cp backup/.env.example backup/.env
fi

compose up -d
