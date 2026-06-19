#!/usr/bin/env bash
set -euo pipefail

cd /opt/project-truth/appliance

observability_started=false

start_observability() {
  if [ "$observability_started" = "true" ]; then
    return 0
  fi

  if command -v project-truth-hris-observability-start >/dev/null 2>&1; then
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

  observability_started=true
}

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

compose_env() {
  if docker compose version >/dev/null 2>&1; then
    docker compose -f docker-compose.environments.yml "$@"
  else
    docker-compose -f docker-compose.environments.yml "$@"
  fi
}

start_env() {
  case "$1" in
    prod)
      start_observability
      project-truth-hris-start
      ;;
    dev|uat)
      start_observability
      compose_env up -d "hris-postgres-$1"
      compose_env up -d --no-deps "hris-api-$1"
      compose_env up -d --no-deps "hris-app-$1"
      ;;
    all)
      start_env prod
      start_env dev
      start_env uat
      ;;
    *)
      echo "Usage: project-truth-hris-env-start dev|uat|prod|all" >&2
      exit 2
      ;;
  esac
}

start_env "${1:-prod}"
