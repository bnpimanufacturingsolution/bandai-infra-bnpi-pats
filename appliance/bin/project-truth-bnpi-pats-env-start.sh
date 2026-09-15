#!/usr/bin/env bash
set -euo pipefail

cd /opt/project-truth/appliance

if [ "${PROJECT_TRUTH_QUIET_STARTUP:-false}" = "true" ]; then
  mkdir -p /var/log
  exec >>/var/log/project-truth-bnpi-pats-startup.log 2>&1
fi

observability_started=false

ensure_observability_network() {
  if ! docker network inspect bnpi-pats-observability >/dev/null 2>&1; then
    docker network create bnpi-pats-observability >/dev/null
  fi
}

start_observability() {
  ensure_observability_network

  if [ "${PROJECT_TRUTH_OBSERVABILITY_ENABLED:-true}" = "false" ]; then
    echo "Observability startup disabled by PROJECT_TRUTH_OBSERVABILITY_ENABLED=false"
    observability_started=true
    return 0
  fi

  if [ "$observability_started" = "true" ]; then
    return 0
  fi

  if command -v project-truth-bnpi-pats-observability-start >/dev/null 2>&1; then
    if ! project-truth-bnpi-pats-observability-start; then
      echo "Observability startup failed; continuing with BNPI PATS app startup" >&2
    fi
  elif [ -f /opt/project-truth/appliance/bin/project-truth-bnpi-pats-observability-start.sh ]; then
    if ! bash /opt/project-truth/appliance/bin/project-truth-bnpi-pats-observability-start.sh; then
      echo "Observability startup failed; continuing with BNPI PATS app startup" >&2
    fi
  else
    echo "Observability starter not installed; continuing with BNPI PATS app startup" >&2
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
  container_running "bnpi-pats-postgres-${env_name}" &&
    container_running "bnpi-pats-api-${env_name}" &&
    container_running "bnpi-pats-app-${env_name}"
}

run_firstboot_seed() {
  if [ "${PROJECT_TRUTH_FIRSTBOOT_SEED:-false}" != "true" ]; then
    return 0
  fi

  local marker_dir="/var/lib/project-truth"
  local marker="${marker_dir}/bnpi-pats-env-seed.done"
  mkdir -p "$marker_dir"
  if [ -f "$marker" ]; then
    echo "First boot BNPI PATS seed already completed: $marker"
    return 0
  fi

  echo "Running first boot BNPI PATS database init/seed for prod/dev/uat"
  project-truth-bnpi-pats-env-seed all
  date -u '+%Y-%m-%dT%H:%M:%SZ' > "$marker"
}

start_env() {
  case "$1" in
    prod)
      start_observability
      ensure_observability_network
      project-truth-bnpi-pats-start
      ;;
    dev|uat)
      start_observability
      ensure_observability_network
      if ! compose_env up -d "bnpi-pats-postgres-$1"; then
        if ! container_running "bnpi-pats-postgres-$1"; then
          return 1
        fi
        echo "Compose returned nonzero, but bnpi-pats-postgres-$1 is running; continuing" >&2
      fi
      if ! compose_env up -d --no-deps "bnpi-pats-api-$1"; then
        if ! container_running "bnpi-pats-api-$1"; then
          return 1
        fi
        echo "Compose returned nonzero, but bnpi-pats-api-$1 is running; continuing" >&2
      fi
      if ! compose_env up -d --no-deps "bnpi-pats-app-$1"; then
        if ! container_running "bnpi-pats-app-$1"; then
          return 1
        fi
        echo "Compose returned nonzero, but bnpi-pats-app-$1 is running; continuing" >&2
      fi
      ;;
    all)
      start_env prod
      start_env dev
      start_env uat
      ;;
    *)
      echo "Usage: project-truth-bnpi-pats-env-start dev|uat|prod|all" >&2
      exit 2
      ;;
  esac
}

run_firstboot_seed
start_env "${1:-prod}"
