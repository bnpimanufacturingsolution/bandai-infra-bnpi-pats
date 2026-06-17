#!/usr/bin/env bash
set -euo pipefail

cd /opt/project-truth/appliance

if ! docker image inspect hris-api-local:develop >/dev/null 2>&1 || ! docker image inspect hris-app-local:develop >/dev/null 2>&1; then
  if command -v docker compose >/dev/null 2>&1; then
    docker compose build
  else
    docker-compose build
  fi
fi

if command -v docker compose >/dev/null 2>&1; then
  docker compose up -d
else
  docker-compose up -d
fi
