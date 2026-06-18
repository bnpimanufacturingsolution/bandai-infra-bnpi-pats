#!/usr/bin/env bash
set -euo pipefail

compose_file="/opt/project-truth/appliance/docker-compose.yml"
env_compose_file="/opt/project-truth/appliance/docker-compose.environments.yml"

lan_ip() {
  ip -4 -o addr show scope global up 2>/dev/null |
    awk '!/ docker| br-| veth| cni| flannel/ { split($4, a, "/"); print a[1]; exit }'
}

http_status() {
  local url="$1"
  curl -fsS -o /dev/null -w '%{http_code}' --max-time 8 "$url" 2>/dev/null || printf 'DOWN'
}

container_state() {
  local name="$1"
  if ! docker inspect "$name" >/dev/null 2>&1; then
    printf 'missing'
    return
  fi
  docker inspect -f '{{.State.Status}}{{if .State.Health}}/{{.State.Health.Status}}{{end}}' "$name" 2>/dev/null
}

print_container_row() {
  local name="$1"
  local label="$2"
  local ports
  ports="$(docker port "$name" 2>/dev/null | paste -sd ', ' - || true)"
  printf '  %-12s %-18s %s\n' "$label" "$(container_state "$name")" "${ports:-no published ports}"
}

print_env_row() {
  local env_name="$1"
  local app_port="$2"
  local api_port="$3"
  local db_port="$4"
  local app_container="$5"
  local api_container="$6"
  local db_container="$7"
  local app_state api_state db_state app_status api_status app_url api_url

  app_state="$(container_state "$app_container")"
  api_state="$(container_state "$api_container")"
  db_state="$(container_state "$db_container")"
  app_status="$(http_status "http://127.0.0.1:${app_port}/")"
  api_status="$(http_status "http://127.0.0.1:${api_port}/health")"

  if [ -n "$ip_addr" ]; then
    app_url="http://${ip_addr}:${app_port}/auth/login"
    api_url="http://${ip_addr}:${api_port}/health"
  else
    app_url="http://<lan-ip>:${app_port}/auth/login"
    api_url="http://<lan-ip>:${api_port}/health"
  fi

  printf '  %-4s app:%-5s api:%-5s db:%-6s  %-17s %-17s %-17s\n' \
    "$env_name" "$app_port" "$api_port" "$db_port" "$app_state" "$api_state" "$db_state"
  printf '       checks app=%-7s api=%-7s login=%s api=%s\n' "$app_status" "$api_status" "$app_url" "$api_url"
}

ip_addr="$(lan_ip || true)"
api_local="http://127.0.0.1:3001"
app_local="http://127.0.0.1:3000"

echo "Project Truth appliance status"
echo "=============================="
echo "Host: $(hostname)"
echo "Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo

echo "Network"
if [ -n "$ip_addr" ]; then
  echo "  LAN IP: $ip_addr"
  echo "  HRIS app: http://${ip_addr}:3000/"
  echo "  HRIS login: http://${ip_addr}:3000/auth/login"
  echo "  HRIS API health: http://${ip_addr}:3001/health"
else
  echo "  LAN IP: not detected"
  echo "  Repair: project-truth-lan-dhcp"
fi
echo

echo "HTTP checks"
printf '  %-18s %s\n' "app local" "$(http_status "${app_local}/")"
printf '  %-18s %s\n' "app login" "$(http_status "${app_local}/auth/login")"
printf '  %-18s %s\n' "api health" "$(http_status "${api_local}/health")"
if [ -n "$ip_addr" ]; then
  printf '  %-18s %s\n' "LAN app" "$(http_status "http://${ip_addr}:3000/")"
  printf '  %-18s %s\n' "LAN API" "$(http_status "http://${ip_addr}:3001/health")"
fi
echo

echo "Docker services"
print_container_row hris-postgres postgres
print_container_row hris-api api
print_container_row hris-app app
echo

echo "Environment matrix"
print_env_row prod 3000 3001 15432 hris-app hris-api hris-postgres
print_env_row dev  3100 3101 15433 hris-app-dev hris-api-dev hris-postgres-dev
print_env_row uat  3200 3201 15434 hris-app-uat hris-api-uat hris-postgres-uat
echo

echo "Database"
if timeout 8 docker exec hris-postgres pg_isready -U postgres -d hris >/dev/null 2>&1; then
  echo "  postgres: accepting connections"
else
  echo "  postgres: not ready"
fi
if timeout 8 docker exec hris-api printenv PG_DATABASE_URL >/dev/null 2>&1; then
  echo "  api env: PG_DATABASE_URL present"
else
  echo "  api env: PG_DATABASE_URL missing"
fi
echo

echo "Kubernetes"
if command -v kubectl >/dev/null 2>&1; then
  kubectl get nodes --no-headers 2>/dev/null | sed 's/^/  node: /' || echo "  nodes: unavailable"
  kubectl get pods -n argocd --no-headers 2>/dev/null | sed 's/^/  argocd: /' || echo "  argocd: unavailable"
else
  echo "  kubectl: unavailable"
fi
echo

echo "Demo accounts"
echo "  hr-manager@seed.local / Password123!"
echo "  hr-user@seed.local / Password123!"
echo "  employee@seed.local / Password123!"
echo

echo "Useful commands"
echo "  project-truth-progress --watch"
echo "  project-truth-monitor"
echo "  project-truth-hris-status"
echo "  project-truth-hris-env-start dev|uat|prod|all"
echo "  project-truth-hris-env-seed dev|uat|prod|all"
echo "  project-truth-lan-dhcp"
echo "  docker compose -f ${compose_file} ps"
echo "  docker compose -f ${env_compose_file} ps"

if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^node-health-'; then
  echo
  echo "Legacy node-health containers still present"
  docker ps --filter 'name=node-health' --format '  {{.Names}} {{.Status}} {{.Ports}}'
fi
