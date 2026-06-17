#!/usr/bin/env bash
set -euo pipefail

cd /opt/project-truth/appliance

if ! docker image inspect hris-api-local:develop >/dev/null 2>&1 || ! docker image inspect hris-api-db-init:develop >/dev/null 2>&1 || ! docker image inspect hris-app-local:develop >/dev/null 2>&1; then
  if command -v docker compose >/dev/null 2>&1; then
    docker compose build
  else
    docker-compose build
  fi
fi

if command -v docker compose >/dev/null 2>&1; then
  docker compose up -d postgres
  docker compose up -d --no-deps hris-api
  docker compose up -d --no-deps hris-app
else
  docker-compose up -d postgres
  docker-compose up -d --no-deps hris-api
  docker-compose up -d --no-deps hris-app
fi
