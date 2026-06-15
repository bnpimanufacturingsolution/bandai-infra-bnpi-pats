#!/usr/bin/env bash
set -euo pipefail

echo "Container list:"
docker ps --filter "name=node-health"

echo "Health state:"
docker inspect --format='{{json .State.Health}}' node-health

echo "Local health endpoint:"
curl -fsS http://localhost:3000/health
echo

echo "Self-healing test:"
docker kill node-health >/dev/null
sleep 10
docker ps --filter "name=node-health"
curl -fsS http://localhost:3000/health
echo
