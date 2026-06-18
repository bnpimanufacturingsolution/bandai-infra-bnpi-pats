#!/usr/bin/env bash
set -euo pipefail

lan_ip="$(ip -4 -o addr show scope global up | awk '!/ docker| br-| veth/ { split($4, a, "/"); print a[1]; exit }')"

echo "Project Truth HRIS appliance status"
hostname
ip -br addr

if [ -n "$lan_ip" ]; then
  echo "LAN IP: ${lan_ip}"
  echo "HRIS App URL: http://${lan_ip}:3000"
  echo "HRIS API Health URL: http://${lan_ip}:3001/health"
else
  echo "LAN IP: NOT DETECTED"
  echo "Reason: no active non-loopback IPv4 address found"
  echo "Next check: verify VM adapter is bridged/external and DHCP is enabled"
  echo "Repair command: project-truth-lan-dhcp"
fi

echo "Local App URL: http://127.0.0.1:3000"
echo "Local API Health URL: http://127.0.0.1:3001/health"
echo "Local Grafana URL: http://127.0.0.1:53000"

echo "Docker services:"
docker ps --filter "name=hris-" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
docker ps --filter "name=hris-grafana" --filter "name=hris-prometheus" --filter "name=hris-loki" --filter "name=hris-tempo" --filter "name=hris-otel-collector" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"

echo "Postgres:"
if docker ps --format '{{.Names}}' | grep -qx 'hris-postgres'; then
  docker exec hris-postgres pg_isready -U postgres -d hris
  echo "Host Postgres bridge: 127.0.0.1:15432 -> hris-postgres:5432/hris"
else
  echo "hris-postgres is not running"
fi

if docker ps --format '{{.Names}}' | grep -Eiq '(^|[-_])health($|[-_])'; then
  echo "Standalone health container: PRESENT"
else
  echo "Standalone health container: absent"
fi

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

echo "Observability:"
curl -fsS "http://127.0.0.1:53000/api/health"
echo
curl -fsS "http://127.0.0.1:9091/-/ready"
curl -fsS "http://127.0.0.1:3110/ready"
echo
curl -fsS "http://127.0.0.1:3200/ready"
echo

if [ -n "$lan_ip" ]; then
  echo "CORS:"
  curl -fsSI -X OPTIONS \
    -H "Origin: http://${lan_ip}:3000" \
    -H "Access-Control-Request-Method: GET" \
    "http://${lan_ip}:3001/health" | grep -i '^access-control-allow-origin:' || true
fi
