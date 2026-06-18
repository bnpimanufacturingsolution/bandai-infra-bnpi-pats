#!/usr/bin/env bash
set -euo pipefail

interval=3
watch_mode=0

usage() {
  cat <<'EOF'
Usage:
  project-truth-progress
  project-truth-progress --watch

Shows boot/startup progress for Project Truth HRIS without requiring Docker or
systemd knowledge. Use --watch while the appliance is starting.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --watch|-w)
      watch_mode=1
      ;;
    --interval)
      shift
      interval="${1:-3}"
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
  shift
done

lan_ip() {
  ip -4 -o addr show scope global up 2>/dev/null |
    awk '!/ docker| br-| veth| cni| flannel/ { split($4, a, "/"); print a[1]; exit }'
}

http_status() {
  local url="$1"
  local code
  code="$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 4 "$url" 2>/dev/null || true)"
  if [ "$code" = "200" ]; then
    printf '200'
  else
    printf 'DOWN'
  fi
}

container_state() {
  local name="$1"
  if ! command -v docker >/dev/null 2>&1; then
    printf 'waiting'
    return
  fi
  if ! docker inspect "$name" >/dev/null 2>&1; then
    printf 'waiting'
    return
  fi
  docker inspect -f '{{.State.Status}}{{if .State.Health}}/{{.State.Health.Status}}{{end}}' "$name" 2>/dev/null || printf 'waiting'
}

is_ready_state() {
  case "$1" in
    running|running/healthy|exited/healthy)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

bar() {
  local done="$1"
  local total="$2"
  local width=24
  local filled=$((done * width / total))
  local empty=$((width - filled))
  printf '['
  printf '%*s' "$filled" '' | tr ' ' '#'
  printf '%*s' "$empty" '' | tr ' ' '-'
  printf '] %3d%%' $((done * 100 / total))
}

stage_line() {
  local ok="$1"
  local label="$2"
  local detail="$3"
  if [ "$ok" -eq 1 ]; then
    printf '  [ok]      %-20s %s\n' "$label" "$detail"
  else
    printf '  [waiting] %-20s %s\n' "$label" "$detail"
  fi
}

service_state() {
  local name="$1"
  if ! command -v systemctl >/dev/null 2>&1; then
    printf 'unknown'
    return
  fi
  systemctl is-active "$name" 2>/dev/null || true
}

render_once() {
  local ip_addr docker_state hris_state done total
  local prod_db prod_api prod_app dev_db dev_api dev_app uat_db uat_api uat_app
  local prod_http prod_api_http dev_http dev_api_http uat_http uat_api_http

  ip_addr="$(lan_ip || true)"
  docker_state="$(service_state docker.service)"
  hris_state="$(service_state project-truth-hris.service)"

  prod_db="$(container_state hris-postgres)"
  prod_api="$(container_state hris-api)"
  prod_app="$(container_state hris-app)"
  dev_db="$(container_state hris-postgres-dev)"
  dev_api="$(container_state hris-api-dev)"
  dev_app="$(container_state hris-app-dev)"
  uat_db="$(container_state hris-postgres-uat)"
  uat_api="$(container_state hris-api-uat)"
  uat_app="$(container_state hris-app-uat)"

  prod_http="$(http_status http://127.0.0.1:3000/auth/login)"
  prod_api_http="$(http_status http://127.0.0.1:3001/health)"
  dev_http="$(http_status http://127.0.0.1:3100/auth/login)"
  dev_api_http="$(http_status http://127.0.0.1:3101/health)"
  uat_http="$(http_status http://127.0.0.1:3200/auth/login)"
  uat_api_http="$(http_status http://127.0.0.1:3201/health)"

  done=0
  total=18
  [ -n "$ip_addr" ] && done=$((done + 1))
  [ "$docker_state" = "active" ] && done=$((done + 1))
  [ "$hris_state" = "active" ] && done=$((done + 1))
  for state in "$prod_db" "$prod_api" "$prod_app" "$dev_db" "$dev_api" "$dev_app" "$uat_db" "$uat_api" "$uat_app"; do
    if is_ready_state "$state"; then
      done=$((done + 1))
    fi
  done
  for code in "$prod_http" "$prod_api_http" "$dev_http" "$dev_api_http" "$uat_http" "$uat_api_http"; do
    if [ "$code" = "200" ]; then
      done=$((done + 1))
    fi
  done

  echo "Project Truth startup progress"
  echo "=============================="
  echo "Time: $(date '+%Y-%m-%d %H:%M:%S %Z')"
  printf 'Progress: '
  bar "$done" "$total"
  echo
  echo

  stage_line "$([ -n "$ip_addr" ] && echo 1 || echo 0)" "Network" "${ip_addr:-waiting for LAN IP}"
  stage_line "$([ "$docker_state" = "active" ] && echo 1 || echo 0)" "Docker" "$docker_state"
  stage_line "$([ "$hris_state" = "active" ] && echo 1 || echo 0)" "HRIS autostart" "$hris_state"
  echo

  printf '  %-4s %-18s %-18s %-18s %-11s %-11s\n' "ENV" "DATABASE" "API" "APP" "LOGIN" "API"
  printf '  %-4s %-18s %-18s %-18s %-11s %-11s\n' "PROD" "$prod_db" "$prod_api" "$prod_app" "$prod_http" "$prod_api_http"
  printf '  %-4s %-18s %-18s %-18s %-11s %-11s\n' "DEV" "$dev_db" "$dev_api" "$dev_app" "$dev_http" "$dev_api_http"
  printf '  %-4s %-18s %-18s %-18s %-11s %-11s\n' "UAT" "$uat_db" "$uat_api" "$uat_app" "$uat_http" "$uat_api_http"
  echo

  if [ -n "$ip_addr" ]; then
    echo "Open these from your browser:"
    echo "  PROD: http://${ip_addr}:3000/auth/login"
    echo "  DEV:  http://${ip_addr}:3100/auth/login"
    echo "  UAT:  http://${ip_addr}:3200/auth/login"
  else
    echo "Waiting for a bridged LAN address. If it stays here, run:"
    echo "  project-truth-lan-dhcp"
  fi
  echo
  echo "Helpful commands:"
  echo "  project-truth-progress --watch"
  echo "  project-truth-status"
  echo "  project-truth-hris-status"
}

if [ "$watch_mode" -eq 1 ]; then
  while true; do
    clear || true
    render_once
    sleep "$interval"
  done
fi

render_once
