#!/usr/bin/env bash
set -euo pipefail

if [ "${EXPERIMENTAL_TRY_CLOUDFLARE:-false}" != "true" ]; then
  echo "TryCloudflare startup skipped because EXPERIMENTAL_TRY_CLOUDFLARE is not true"
  exit 0
fi

if [ "$(id -u)" -ne 0 ]; then
  exec sudo "$0" "$@"
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed; skipping experimental TryCloudflare tunnels" >&2
  exit 0
fi

state_dir="/run/project-truth"
log_dir="/var/log/project-truth-trycloudflare"
summary_file="${state_dir}/trycloudflare-public-urls.txt"
pid_file="${state_dir}/trycloudflare-pids.txt"
gateway_pid_file="${state_dir}/trycloudflare-gateway.pid"
gateway_port="${PROJECT_TRUTH_GATEWAY_PORT:-38080}"
mkdir -p "$state_dir" "$log_dir"
old_pid_file="$(mktemp)"
if [ -s "$pid_file" ]; then
  cp "$pid_file" "$old_pid_file"
fi
: > "$summary_file"
: > "$pid_file"

tunnel_host="$(ip route get 1.1.1.1 2>/dev/null | awk '{ for (i=1; i<=NF; i++) if ($i=="src") { print $(i+1); exit } }')"
if [ -z "$tunnel_host" ]; then
  tunnel_host="$(ip -4 -o addr show scope global up 2>/dev/null | awk '!/ docker| br-| veth| cni| flannel/ { split($4, a, "/"); print a[1]; exit }')"
fi
if [ -z "$tunnel_host" ]; then
  tunnel_host="127.0.0.1"
fi

targets="
prod-app|http://${tunnel_host}:${gateway_port}/prod/auth/login|/prod/auth/login
prod-api|http://${tunnel_host}:${gateway_port}/prod-api/health|/prod-api/health
dev-app|http://${tunnel_host}:${gateway_port}/dev/auth/login|/dev/auth/login
dev-api|http://${tunnel_host}:${gateway_port}/dev-api/health|/dev-api/health
uat-app|http://${tunnel_host}:${gateway_port}/uat/auth/login|/uat/auth/login
uat-api|http://${tunnel_host}:${gateway_port}/uat-api/health|/uat-api/health
grafana|http://${tunnel_host}:${gateway_port}/grafana/api/health|/grafana/api/health
prometheus|http://${tunnel_host}:${gateway_port}/prometheus/-/ready|/prometheus/-/ready
loki|http://${tunnel_host}:${gateway_port}/loki/ready|/loki/ready
prod-db|hris-postgres|15432|postgresql://postgres:REDACTED@127.0.0.1:15432/hris
dev-db|hris-postgres-dev|15433|postgresql://postgres:REDACTED@127.0.0.1:15433/hris
uat-db|hris-postgres-uat|15434|postgresql://postgres:REDACTED@127.0.0.1:15434/hris
"

wait_for_url() {
  local url="$1"
  local attempt
  for attempt in $(seq 1 60); do
    if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 5
  done
  return 1
}

extract_public_url() {
  local log_file="$1"
  local attempt
  for attempt in $(seq 1 30); do
    if grep -Eo 'https://[-a-zA-Z0-9]+\.trycloudflare\.com' "$log_file" 2>/dev/null | tail -n 1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

stop_existing_tunnels() {
  if [ ! -s "$old_pid_file" ]; then
    rm -f "$old_pid_file"
    return 0
  fi

  while read -r _ pid; do
    case "${pid:-}" in
      ''|*[!0-9]*) continue ;;
    esac
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done < "$old_pid_file"

  rm -f "$old_pid_file"

  if [ -s "$gateway_pid_file" ]; then
    read -r gateway_pid < "$gateway_pid_file" || true
    case "${gateway_pid:-}" in
      ''|*[!0-9]*) ;;
      *)
        if kill -0 "$gateway_pid" >/dev/null 2>&1; then
          kill "$gateway_pid" >/dev/null 2>&1 || true
        fi
        ;;
    esac
    rm -f "$gateway_pid_file"
  fi
}

start_gateway() {
  local log_file="${log_dir}/gateway.log"

  if ! command -v project-truth-tunnel-gateway >/dev/null 2>&1; then
    echo "project-truth-tunnel-gateway is not installed" >&2
    return 1
  fi

  nohup env \
    PROJECT_TRUTH_GATEWAY_HOST="0.0.0.0" \
    PROJECT_TRUTH_GATEWAY_PORT="${gateway_port}" \
    PROJECT_TRUTH_TUNNEL_TARGET_HOST="${tunnel_host}" \
    project-truth-tunnel-gateway >"$log_file" 2>&1 &
  gateway_pid="$!"
  echo "$gateway_pid" > "$gateway_pid_file"
  echo "gateway ${gateway_pid}" >> "$pid_file"

  if wait_for_url "http://${tunnel_host}:${gateway_port}/healthz"; then
    return 0
  fi

  echo "gateway failed health check; see ${log_file}" >&2
  return 1
}

{
  echo "| Target | Local check | Public check | Public URL | State | Detail |"
  echo "|---|---|---|---|---|---|"
} >> "$summary_file"

stop_existing_tunnels
if ! start_gateway; then
  echo "| gateway | http://${tunnel_host}:${gateway_port}/healthz | n/a | n/a | failed | gateway not healthy |" >> "$summary_file"
  cat "$summary_file"
  exit 0
fi

gateway_base_url="http://${tunnel_host}:${gateway_port}"
gateway_log_file="${log_dir}/gateway-tunnel.log"
nohup cloudflared tunnel --no-autoupdate --url "$gateway_base_url" >"$gateway_log_file" 2>&1 &
gateway_tunnel_pid="$!"
echo "gateway-tunnel ${gateway_tunnel_pid}" >> "$pid_file"
public_url="$(extract_public_url "$gateway_log_file" || true)"

if [ -n "$public_url" ]; then
  echo "| gateway | ${gateway_base_url}/healthz | ${public_url}/healthz | ${public_url} | running | pid ${gateway_tunnel_pid}; gateway port ${gateway_port} |" >> "$summary_file"
else
  echo "| gateway | ${gateway_base_url}/healthz | n/a | n/a | failed | no public URL found; see ${gateway_log_file} |" >> "$summary_file"
fi

echo "$targets" | while IFS='|' read -r name local_check public_path redacted_url; do
  [ -n "${name:-}" ] || continue

  if [ "${redacted_url:-}" != "" ]; then
    echo "| ${name} | ${local_check} | ${public_path} | ${redacted_url} | db-info | raw database public tunnels disabled |" >> "$summary_file"
    continue
  fi

  if ! wait_for_url "$local_check"; then
    echo "| ${name} | ${local_check} | n/a | ${public_url:-n/a} | skipped | local target not healthy through gateway |" >> "$summary_file"
    continue
  fi

  if [ -n "$public_url" ]; then
    echo "| ${name} | ${local_check} | ${public_url}${public_path} | ${public_url} | via-gateway | single tunnel gateway |" >> "$summary_file"
  else
    echo "| ${name} | ${local_check} | n/a | n/a | failed | gateway public URL unavailable |" >> "$summary_file"
  fi
done

cat "$summary_file"
