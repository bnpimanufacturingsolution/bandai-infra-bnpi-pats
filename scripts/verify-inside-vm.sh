#!/usr/bin/env bash
set -euo pipefail

echo "Container list:"
docker ps --filter "name=bnpi-pats-api" --filter "name=bnpi-pats-app"

echo "Health state:"
docker inspect --format='{{.Name}} {{json .State.Health}}' bnpi-pats-api bnpi-pats-app

echo "Local API health endpoint:"
curl -fsS http://localhost:3001/health
echo

echo "Local app endpoint:"
curl -fsSI http://localhost:3000/ | head -n 1
echo

echo "Self-healing test:"
docker kill bnpi-pats-api bnpi-pats-app >/dev/null
sleep 10
docker ps --filter "name=bnpi-pats-api" --filter "name=bnpi-pats-app"
curl -fsS http://localhost:3001/health
curl -fsSI http://localhost:3000/ | head -n 1
echo
