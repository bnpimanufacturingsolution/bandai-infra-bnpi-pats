#!/usr/bin/env bash
set -euo pipefail

if [ "${EXPERIMENTAL_TRY_CLOUDFLARE:-false}" != "true" ]; then
  echo "TryCloudflare startup skipped because EXPERIMENTAL_TRY_CLOUDFLARE is not true"
  exit 0
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
: > "$summary_file"
: > "$pid_file"

targets="
prod-app http://127.0.0.1:3000 /auth/login
prod-api http://127.0.0.1:3001 /health
dev-app http://127.0.0.1:3100 /auth/login
dev-api http://127.0.0.1:3101 /health
uat-app http://127.0.0.1:3200 /auth/login
uat-api http://127.0.0.1:3201 /health
grafana http://127.0.0.1:53000 /api/health
prometheus http://127.0.0.1:9091 /-/ready
loki http://127.0.0.1:3110 /ready
"

wait_for_url() {
  local url="$1"
  local attempt
  for attempt in $(seq 1 60); do
    if curl -fsS --max-time 5 "$url" >/dev/null; then
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

{
  echo "Experimental TryCloudflare public URLs"
  echo "Generated: $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "Temporary: true"
  echo "Flag: EXPERIMENTAL_TRY_CLOUDFLARE=true"
  echo
} >> "$summary_file"

echo "$targets" | while read -r name base_url check_path; do
  [ -n "${name:-}" ] || continue
  check_url="${base_url}${check_path}"
  log_file="${log_dir}/${name}.log"

  if ! wait_for_url "$check_url"; then
    echo "${name}: SKIPPED local target not healthy at ${check_url}" >> "$summary_file"
    continue
  fi

  nohup cloudflared tunnel --no-autoupdate --url "$base_url" >"$log_file" 2>&1 &
  pid="$!"
  echo "${name} ${pid}" >> "$pid_file"

  public_url="$(extract_public_url "$log_file" || true)"
  if [ -n "$public_url" ]; then
    echo "${name}: ${public_url}${check_path}" >> "$summary_file"
  else
    echo "${name}: FAILED no trycloudflare URL found; see ${log_file}" >> "$summary_file"
  fi
done

cat "$summary_file"
