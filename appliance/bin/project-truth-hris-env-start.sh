#!/usr/bin/env bash
set -euo pipefail

cd /opt/project-truth/appliance

compose() {
  if command -v docker compose >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

compose_env() {
  if command -v docker compose >/dev/null 2>&1; then
    docker compose -f docker-compose.environments.yml "$@"
  else
    docker-compose -f docker-compose.environments.yml "$@"
  fi
}

start_env() {
  case "$1" in
    prod)
      project-truth-hris-start
      ;;
    dev|uat)
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
