#!/usr/bin/env bash
set -euo pipefail

lan_ip="$(ip route get 1.1.1.1 2>/dev/null | awk '{ for (i=1; i<=NF; i++) if ($i=="src") { print $(i+1); exit } }')"
if [ -z "$lan_ip" ]; then
  while read -r _ interface _ cidr _; do
    case "$interface" in
      docker*|br-*|veth*|cni*|flannel*) continue ;;
    esac
    lan_ip="${cidr%%/*}"
    break
  done < <(ip -4 -o addr show scope global up)
fi

check_url() {
  local label="$1"
  local url="$2"
  if curl -fsS "$url"; then
    echo
  else
    echo "DOWN ${label}: ${url}"
  fi
}

check_head() {
  local label="$1"
  local url="$2"
  if ! curl -fsSI "$url" | head -n 1; then
    echo "DOWN ${label}: ${url}"
  fi
}

docker_cmd() {
  if docker ps >/dev/null 2>&1; then
    docker "$@"
  elif command -v sudo >/dev/null 2>&1 && sudo -n docker ps >/dev/null 2>&1; then
    sudo docker "$@"
  else
    echo "Docker is not readable by $(id -un). Try: sudo project-truth-hris-status" >&2
    return 1
  fi
}

echo "Project Truth HRIS appliance status"
hostname
ip -br addr

if [ -n "$lan_ip" ]; then
  echo "LAN IP: ${lan_ip}"
  echo "PROD login: http://${lan_ip}:3000/auth/login"
  echo "PROD API:   http://${lan_ip}:3001/health"
  echo "DEV login:  http://${lan_ip}:3100/auth/login"
  echo "DEV API:    http://${lan_ip}:3101/health"
  echo "UAT login:  http://${lan_ip}:3200/auth/login"
  echo "UAT API:    http://${lan_ip}:3201/health"
  echo "PROD DB:    postgresql://postgres:postgres@${lan_ip}:15432/hris"
  echo "DEV DB:     postgresql://postgres:postgres@${lan_ip}:15433/hris"
  echo "UAT DB:     postgresql://postgres:postgres@${lan_ip}:15434/hris"
  echo "ZKTeco PROD webhook: http://${lan_ip}:3001/api/zkteco/events"
  echo "ZKTeco DEV webhook:  http://${lan_ip}:3101/api/zkteco/events"
  echo "ZKTeco UAT webhook:  http://${lan_ip}:3201/api/zkteco/events"
  echo "ZKTeco saved events: http://${lan_ip}:3000/admin/devices/events?view=saved&source=ZKTECO_EVENT"
  echo "Grafana:    http://${lan_ip}:53000"
  echo "Prometheus: http://${lan_ip}:9091"
  echo "Loki:       http://${lan_ip}:3110"
  echo "Gateway:    http://${lan_ip}:38080"
else
  echo "LAN IP: NOT DETECTED"
  echo "Reason: no active non-loopback IPv4 address found"
  echo "Next check: verify VM adapter is bridged/external and DHCP is enabled"
  echo "Repair command: project-truth-lan-dhcp"
fi

echo "Local App URL: http://127.0.0.1:3000"
echo "Local API Health URL: http://127.0.0.1:3001/health"
echo "Local Grafana URL: http://127.0.0.1:53000"
echo "Local Prometheus URL: http://127.0.0.1:9091"
echo "Local Loki URL: http://127.0.0.1:3110"
echo "Local Gateway URL: http://127.0.0.1:38080"
echo "Startup URL log: /var/log/project-truth-network-summary.log"

echo "Docker services:"
docker_cmd ps --filter "name=hris-" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" || true
docker_cmd ps --filter "name=hris-grafana" --filter "name=hris-prometheus" --filter "name=hris-loki" --filter "name=hris-tempo" --filter "name=hris-otel-collector" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" || true

echo "Postgres:"
if docker_cmd ps --format '{{.Names}}' | grep -qx 'hris-postgres'; then
  docker_cmd exec hris-postgres pg_isready -U postgres -d hris
  echo "Host Postgres bridge: 127.0.0.1:15432 -> hris-postgres:5432/hris"
  [ -n "$lan_ip" ] && echo "LAN Postgres URL: postgresql://postgres:postgres@${lan_ip}:15432/hris"
else
  echo "hris-postgres is not running"
fi
if command -v project-truth-db-access >/dev/null 2>&1; then
  project-truth-db-access || true
fi

if docker_cmd ps --format '{{.Names}}' | grep -Eiq '(^|[-_])health($|[-_])'; then
  echo "Standalone health container: PRESENT"
else
  echo "Standalone health container: absent"
fi

echo "API:"
check_url "local prod api" "http://127.0.0.1:3001/health"
if [ -n "$lan_ip" ]; then
  check_url "lan prod api" "http://${lan_ip}:3001/health"
fi
echo "ZKTeco:"
echo "VM webhook contract: HRIS API accepts POST /api/zkteco/events and stores ZKTECO_EVENT device_events."
if [ -n "$lan_ip" ]; then
  if curl -fsS "http://${lan_ip}:3001/health" >/dev/null 2>&1; then
    echo "VM ZKTeco contract status: READY (API is reachable at ${lan_ip}:3001)"
  else
    echo "VM ZKTeco contract status: DOWN (API health did not respond at ${lan_ip}:3001)"
  fi
fi
echo "Bridge runtime: ZKTeco Linux PyZK bridge at vendor/zkteco-linux."
if [ -n "${ZKTECO_BRIDGE_STATUS_URL:-}" ]; then
  echo "Bridge status: ${ZKTECO_BRIDGE_STATUS_URL}"
  if curl -fsS "$ZKTECO_BRIDGE_STATUS_URL" >/tmp/project-truth-zkteco-status.json 2>/dev/null; then
    node -e "const fs=require('fs'); const s=JSON.parse(fs.readFileSync('/tmp/project-truth-zkteco-status.json','utf8')); console.log(JSON.stringify({status:s.status,configuredDevices:s.configuredDevices,connectedDevices:s.connectedDevices,lastEventAt:s.lastEventAt,webhookUrl:s.webhookUrl}, null, 2));" 2>/dev/null || cat /tmp/project-truth-zkteco-status.json
  else
    echo "Bridge status endpoint: DOWN"
  fi
else
  echo "Bridge status endpoint: not configured. Set ZKTECO_BRIDGE_STATUS_URL to the Windows SDK sidecar /status URL."
fi

echo "APP:"
check_head "local prod app" "http://127.0.0.1:3000/"
if [ -n "$lan_ip" ]; then
  check_head "lan prod app" "http://${lan_ip}:3000/"
fi

echo "Observability:"
check_url "local grafana" "http://127.0.0.1:53000/api/health"
check_url "local prometheus" "http://127.0.0.1:9091/-/ready"
check_url "local loki" "http://127.0.0.1:3110/ready"
check_url "local gateway" "http://127.0.0.1:38080/healthz"
if [ -n "$lan_ip" ]; then
  check_url "lan grafana" "http://${lan_ip}:53000/api/health"
  check_url "lan prometheus" "http://${lan_ip}:9091/-/ready"
  check_url "lan loki" "http://${lan_ip}:3110/ready"
  check_url "lan gateway" "http://${lan_ip}:38080/healthz"
fi

if [ -n "$lan_ip" ]; then
  echo "CORS:"
  curl -fsSI -X OPTIONS -H "Origin: http://${lan_ip}:3000" -H "Access-Control-Request-Method: GET" "http://${lan_ip}:3001/health" | grep -i '^access-control-allow-origin:' || true
fi
