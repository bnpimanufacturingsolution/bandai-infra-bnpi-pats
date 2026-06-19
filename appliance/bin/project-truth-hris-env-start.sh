#!/usr/bin/env bash
set -euo pipefail

cd /opt/project-truth/appliance

if [ "${PROJECT_TRUTH_QUIET_STARTUP:-false}" = "true" ]; then
  mkdir -p /var/log
  exec >>/var/log/project-truth-hris-startup.log 2>&1
fi

observability_started=false

start_observability() {
  if [ "${PROJECT_TRUTH_OBSERVABILITY_ENABLED:-true}" = "false" ]; then
    echo "Observability startup disabled by PROJECT_TRUTH_OBSERVABILITY_ENABLED=false"
    observability_started=true
    return 0
  fi

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

container_running() {
  docker ps --filter "name=^/${1}$" --filter "status=running" --format '{{.Names}}' | grep -qx "$1"
}

env_running() {
  local env_name="$1"
  container_running "hris-postgres-${env_name}" &&
    container_running "hris-api-${env_name}" &&
    container_running "hris-app-${env_name}"
}

start_env() {
  case "$1" in
    prod)
      start_observability
      project-truth-hris-start
      ;;
    dev|uat)
      start_observability
      if ! compose_env up -d "hris-postgres-$1"; then
        if ! container_running "hris-postgres-$1"; then
          return 1
        fi
        echo "Compose returned nonzero, but hris-postgres-$1 is running; continuing" >&2
      fi
      if ! compose_env up -d --no-deps "hris-api-$1"; then
        if ! container_running "hris-api-$1"; then
          return 1
        fi
        echo "Compose returned nonzero, but hris-api-$1 is running; continuing" >&2
      fi
      if ! compose_env up -d --no-deps "hris-app-$1"; then
        if ! container_running "hris-app-$1"; then
          return 1
        fi
        echo "Compose returned nonzero, but hris-app-$1 is running; continuing" >&2
      fi
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
