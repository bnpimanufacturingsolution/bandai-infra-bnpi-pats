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
prod-app|http://${tunnel_host}:3000|/auth/login
prod-api|http://${tunnel_host}:3001|/health
dev-app|http://${tunnel_host}:3100|/auth/login
dev-api|http://${tunnel_host}:3101|/health
uat-app|http://${tunnel_host}:3200|/auth/login
uat-api|http://${tunnel_host}:3201|/health
grafana|http://${tunnel_host}:53000|/api/health
prometheus|http://${tunnel_host}:9091|/-/ready
loki|http://${tunnel_host}:3110|/ready
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
}

{
  echo "| Target | Local check | Public check | Public URL | State | Detail |"
  echo "|---|---|---|---|---|---|"
} >> "$summary_file"

stop_existing_tunnels

echo "$targets" | while IFS='|' read -r name base_url check_path redacted_url; do
  [ -n "${name:-}" ] || continue

  if [ "${redacted_url:-}" != "" ]; then
    echo "| ${name} | ${base_url} | ${check_path} | ${redacted_url} | db-info | raw database public tunnels disabled |" >> "$summary_file"
    continue
  fi

  check_url="${base_url}${check_path}"
  log_file="${log_dir}/${name}.log"

  if ! wait_for_url "$check_url"; then
    echo "| ${name} | ${check_url} | n/a | n/a | skipped | local target not healthy |" >> "$summary_file"
    continue
  fi

  nohup cloudflared tunnel --no-autoupdate --url "$base_url" >"$log_file" 2>&1 &
  pid="$!"
  echo "${name} ${pid}" >> "$pid_file"

  public_url="$(extract_public_url "$log_file" || true)"
  if [ -n "$public_url" ]; then
    echo "| ${name} | ${check_url} | ${public_url}${check_path} | ${public_url} | running | pid ${pid} |" >> "$summary_file"
  else
    echo "| ${name} | ${check_url} | n/a | n/a | failed | no public URL found; see ${log_file} |" >> "$summary_file"
  fi
done

cat "$summary_file"
