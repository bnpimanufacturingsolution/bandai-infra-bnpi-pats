#!/usr/bin/env bash
set -euo pipefail

lan_ip="$(hostname -I | awk '{print $1}')"

echo "Project Truth HRIS appliance status"
hostname
ip -br addr
docker ps --filter "name=hris-api" --filter "name=hris-app"

echo "API:"
curl -fsS "http://127.0.0.1:3001/health"
echo
if [ -n "$lan_ip" ]; then
  curl -fsS "http://${lan_ip}:3001/health"
  echo
fi

echo "APP:"
curl -fsSI "http://127.0.0.1:3000/" | head -n 1
if [ -n "$lan_ip" ]; then
  curl -fsSI "http://${lan_ip}:3000/" | head -n 1
fi

if [ -n "$lan_ip" ]; then
  echo "CORS:"
  curl -fsSI -H "Origin: http://${lan_ip}:3000" "http://${lan_ip}:3001/health" | grep -i '^access-control-allow-origin:' || true
fi
