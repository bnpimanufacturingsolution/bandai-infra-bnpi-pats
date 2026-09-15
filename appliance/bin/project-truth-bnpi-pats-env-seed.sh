#!/usr/bin/env bash
set -euo pipefail

cd /opt/project-truth/appliance

if ! docker network inspect bnpi-pats-observability >/dev/null 2>&1; then
  docker network create bnpi-pats-observability >/dev/null
fi

compose_env() {
  if command -v docker compose >/dev/null 2>&1; then
    docker compose -f docker-compose.environments.yml "$@"
  else
    docker-compose -f docker-compose.environments.yml "$@"
  fi
}

case "${1:-prod}" in
  prod)
    project-truth-bnpi-pats-seed
    ;;
  dev)
    if [ -s /opt/project-truth/appliance/seeds/dev-current/dev-current.dump ]; then
      project-truth-bnpi-pats-dev-current-restore
    else
      env_name="$1"
      compose_env up -d "bnpi-pats-postgres-${env_name}"
      compose_env rm -f "bnpi-pats-api-db-init-${env_name}" >/dev/null 2>&1 || true
      compose_env up --build --abort-on-container-exit --exit-code-from "bnpi-pats-api-db-init-${env_name}" "bnpi-pats-api-db-init-${env_name}"
      compose_env up -d --no-deps "bnpi-pats-api-${env_name}" "bnpi-pats-app-${env_name}"
    fi
    ;;
  uat)
    env_name="$1"
    compose_env up -d "bnpi-pats-postgres-${env_name}"
    compose_env rm -f "bnpi-pats-api-db-init-${env_name}" >/dev/null 2>&1 || true
    compose_env up --build --abort-on-container-exit --exit-code-from "bnpi-pats-api-db-init-${env_name}" "bnpi-pats-api-db-init-${env_name}"
    compose_env up -d --no-deps "bnpi-pats-api-${env_name}" "bnpi-pats-app-${env_name}"
    ;;
  all)
    project-truth-bnpi-pats-env-seed prod
    project-truth-bnpi-pats-env-seed dev
    project-truth-bnpi-pats-env-seed uat
    ;;
  *)
    echo "Usage: project-truth-bnpi-pats-env-seed dev|uat|prod|all" >&2
    exit 2
    ;;
esac
