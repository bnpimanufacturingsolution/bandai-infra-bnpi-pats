#!/usr/bin/env bash
set -euo pipefail

cd /opt/project-truth/appliance

compose_env() {
  if command -v docker compose >/dev/null 2>&1; then
    docker compose -f docker-compose.environments.yml "$@"
  else
    docker-compose -f docker-compose.environments.yml "$@"
  fi
}

case "${1:-prod}" in
  prod)
    project-truth-hris-seed
    ;;
  dev|uat)
    env_name="$1"
    compose_env up -d "hris-postgres-${env_name}"
    compose_env rm -f "hris-api-db-init-${env_name}" >/dev/null 2>&1 || true
    compose_env up --build --abort-on-container-exit --exit-code-from "hris-api-db-init-${env_name}" "hris-api-db-init-${env_name}"
    compose_env up -d --no-deps "hris-api-${env_name}" "hris-app-${env_name}"
    ;;
  all)
    project-truth-hris-env-seed prod
    project-truth-hris-env-seed dev
    project-truth-hris-env-seed uat
    ;;
  *)
    echo "Usage: project-truth-hris-env-seed dev|uat|prod|all" >&2
    exit 2
    ;;
esac
