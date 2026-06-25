#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  exec sudo "$0" "$@"
fi

state_dir="/run/project-truth"
sync_state_file="/var/lib/project-truth/os-sync-state"
log_file="/var/log/project-truth-network-summary.log"
issue_file="/etc/issue"
motd_file="/etc/motd"
summary_file="${state_dir}/network-summary.txt"
quiet=false
screen=false
screen_page="overview"

for arg in "$@"; do
  case "$arg" in
    --quiet)
      quiet=true
      ;;
    --screen)
      screen=true
      screen_page="overview"
      ;;
    --screen-overview)
      screen=true
      screen_page="overview"
      ;;
    --screen-tunnels)
      screen=true
      screen_page="tunnels"
      ;;
    --screen-db)
      screen=true
      screen_page="db"
      ;;
  esac
done

lan_ip() {
  local route_ip
  route_ip="$(ip route get 1.1.1.1 2>/dev/null | awk '{ for (i=1; i<=NF; i++) if ($i=="src") { print $(i+1); exit } }')"
  if [ -n "$route_ip" ]; then
    printf '%s\n' "$route_ip"
    return
  fi
  ip -4 -o addr show scope global up 2>/dev/null |
    awk '!/ docker| br-| veth| cni| flannel/ { split($4, a, "/"); print a[1]; exit }'
}

emit_os_sync_summary() {
  echo "OS/Git sync"
  if [ -r "$sync_state_file" ]; then
    awk -F= '
      $1 == "branch" { branch=$2 }
      $1 == "commit" { commit=$2 }
      $1 == "synced_at" { synced_at=$2 }
      END {
        if (commit != "") {
          printf "  %s@%s\n", branch, substr(commit, 1, 12)
          printf "  synced: %s\n", synced_at
        } else {
          print "  state file present but commit missing"
        }
      }
    ' "$sync_state_file"
  else
    echo "  waiting for first project-truth-os-sync run"
  fi
  if command -v systemctl >/dev/null 2>&1 &&
    systemctl list-timers project-truth-os-sync.timer --no-pager >/dev/null 2>&1; then
    systemctl list-timers project-truth-os-sync.timer --no-pager 2>/dev/null |
      awk 'NR == 2 && $1 != "-" { printf "  next: %s %s %s\n", $1, $2, $3 }'
  fi
  echo "  sync now: sudo project-truth-os-sync"
  echo "  status: project-truth-os-sync --status"
}

write_summary() {
  local ip_addr="$1"
  local generated_at
  generated_at="$(date '+%Y-%m-%d %H:%M:%S %Z')"

  mkdir -p "$state_dir"

  {
    echo "Project Truth HRIS appliance"
    echo "Host: $(hostname)"
    echo "Generated: ${generated_at}"
    echo
    if [ -n "$ip_addr" ]; then
      echo "LAN IP"
      echo "  ${ip_addr}"
      echo
      echo "Open these from your host browser"
      echo "PROD login: http://${ip_addr}:3000/auth/login"
      echo "PROD API:   http://${ip_addr}:3001/health"
      echo "DEV login:  http://${ip_addr}:3100/auth/login"
      echo "DEV API:    http://${ip_addr}:3101/health"
      echo "UAT login:  http://${ip_addr}:3200/auth/login"
      echo "UAT API:    http://${ip_addr}:3201/health"
      echo
      echo "ZKTeco bridge targets"
      echo "PROD webhook: http://${ip_addr}:3001/api/zkteco/events"
      echo "DEV webhook:  http://${ip_addr}:3101/api/zkteco/events"
      echo "UAT webhook:  http://${ip_addr}:3201/api/zkteco/events"
      echo "Saved events: http://${ip_addr}:3000/admin/devices/events?view=saved&source=ZKTECO_EVENT"
      echo "Bridge note: run the Windows ZKTeco SDK bridge on a Windows host/device LAN."
      echo "Set ZKTECO_WEBHOOK_URL to one of the webhook URLs above."
      echo
      echo "Observability"
      echo "Grafana:    http://${ip_addr}:53000"
      echo "Prometheus: http://${ip_addr}:9091"
      echo "Loki:       http://${ip_addr}:3110"
      echo
      emit_os_sync_summary
      if [ -s "${state_dir}/trycloudflare-public-urls.txt" ]; then
        echo
        echo "Experimental TryCloudflare public URLs"
        echo "Temporary quick-tunnel URLs; rotate on every tunnel restart."
        sed 's/^/  /' "${state_dir}/trycloudflare-public-urls.txt"
      else
        echo
        echo "Experimental TryCloudflare"
        echo "  Enabled by Project Truth when cloudflared is installed."
        echo "  Quick tunnel URLs are temporary and rotate."
      fi
    else
      echo "LAN IP: NOT DETECTED"
      echo
      echo "The VM has no active non-loopback IPv4 address yet."
      echo "Check that the VM network adapter is bridged/external and cable-connected."
      echo "Repair command after login: project-truth-lan-dhcp"
    fi
    echo
    echo "Useful commands"
    echo "  project-truth-progress --watch"
    echo "  project-truth-hris-status"
    echo "  project-truth-lan-dhcp"
    echo "  sudo project-truth-os-sync"
    echo "  project-truth-os-sync --status"
  } > "$summary_file"
}

emit_trycloudflare_screen() {
  local file="${state_dir}/trycloudflare-public-urls.txt"
  local rows=0
  local host_ip

  host_ip="$(lan_ip || true)"

  if [ ! -s "$file" ]; then
    echo "TryCloudflare: disabled"
    echo "  Service is enabled by Project Truth when cloudflared is installed."
    echo "  Quick tunnel URLs are temporary and rotate."
    return
  fi

  echo "TryCloudflare demo URLs"
  echo "  Temporary quick tunnels. Not production DNS."
  while IFS='|' read -r _ target local_check public_check public_url _rest; do
    target="$(printf '%s' "$target" | xargs 2>/dev/null || true)"
    local_check="$(printf '%s' "$local_check" | xargs 2>/dev/null || true)"
    public_check="$(printf '%s' "$public_check" | xargs 2>/dev/null || true)"
    public_url="$(printf '%s' "$public_url" | xargs 2>/dev/null || true)"
    local_path="$local_check"
    if [ -n "$host_ip" ]; then
      local_path="${local_check#http://${host_ip}:}"
      if [ "$local_path" = "$local_check" ]; then
        local_path="${local_check#https://${host_ip}:}"
      fi
      if [ "$local_path" != "$local_check" ]; then
        local_path=":${local_path}"
      fi
    fi

    case "$target" in
      ""|"Target"|---*|prod-db|dev-db|uat-db) continue ;;
    esac
    case "$public_url" in
      https://*.trycloudflare.com*)
        rows=$((rows + 1))
        printf '%s\n' "$target"
        printf '  local  %s\n' "$local_path"
        printf '  public %s\n' "$public_check"
        ;;
    esac
  done < "$file"

  if [ "$rows" -eq 0 ]; then
    echo "  No public URL rows found in ${file}."
  fi
}

emit_database_screen() {
  local file="${state_dir}/trycloudflare-public-urls.txt"
  local rows=0

  echo "Database facts"
  echo "  Raw DB tunnels: disabled by default."
  if [ ! -s "$file" ]; then
    echo "  DB topology file: not present."
    return
  fi

  while IFS='|' read -r _ name internal_service host_port url_shape _rest; do
    name="$(printf '%s' "$name" | xargs 2>/dev/null || true)"
    internal_service="$(printf '%s' "$internal_service" | xargs 2>/dev/null || true)"
    host_port="$(printf '%s' "$host_port" | xargs 2>/dev/null || true)"
    url_shape="$(printf '%s' "$url_shape" | xargs 2>/dev/null || true)"

    case "$name" in
      ""|"Name"|---*) continue ;;
    esac
    case "$url_shape" in
      postgresql://*)
        rows=$((rows + 1))
        printf '%s\n' "$name"
        printf '  host %s\n' "$host_port"
        printf '  svc  %s\n' "$internal_service"
        printf '  url  %s\n' "$url_shape"
        ;;
    esac
  done < "$file"

  if [ "$rows" -eq 0 ]; then
    echo "  No redacted DB rows found in ${file}."
  fi
}

emit_screen_summary() {
  local ip_addr="$1"
  local page="${2:-overview}"
  local generated_at
  generated_at="$(date '+%Y-%m-%d %H:%M:%S %Z')"

  if [ "${PROJECT_TRUTH_SCREEN_NO_CLEAR:-}" != "1" ]; then
    printf '\033c\033[3J\033[H\033[2J'
  fi
  echo "PROJECT TRUTH CLIENT SUMMARY"
  echo "Generated: ${generated_at}"
  echo "Host: $(hostname)"

  if [ -z "$ip_addr" ]; then
    echo "LAN IP: NOT DETECTED"
    echo "Repair: project-truth-lan-dhcp"
    return
  fi

  echo "LAN IP: ${ip_addr}"
  echo

  if [ "$page" = "overview" ]; then
    echo "Console login"
    echo "  username: infra"
    echo "  password: infra (hidden while typing)"
    echo "  type username only when the prompt ends with login:"
    echo "  if the prompt ends with $, you are already logged in"
    echo
  fi

  if [ "$page" = "tunnels" ]; then
    emit_trycloudflare_screen
    echo
    echo "Next: project-truth-lan-summary --screen-db"
    return
  fi

  if [ "$page" = "db" ]; then
    emit_database_screen
    echo
    echo "Raw DB public tunnels are intentionally not shown."
    return
  fi

  echo "HRIS"
  printf '  %-5s login  http://%s:%s/auth/login\n' "PROD" "$ip_addr" "3000"
  printf '  %-5s api    http://%s:%s/health\n' "PROD" "$ip_addr" "3001"
  printf '  %-5s login  http://%s:%s/auth/login\n' "DEV" "$ip_addr" "3100"
  printf '  %-5s api    http://%s:%s/health\n' "DEV" "$ip_addr" "3101"
  printf '  %-5s login  http://%s:%s/auth/login\n' "UAT" "$ip_addr" "3200"
  printf '  %-5s api    http://%s:%s/health\n' "UAT" "$ip_addr" "3201"
  echo
  echo "Observability"
  printf '  %-10s http://%s:%s\n' "Grafana" "$ip_addr" "53000"
  printf '  %-10s http://%s:%s\n' "Prometheus" "$ip_addr" "9091"
  printf '  %-10s http://%s:%s\n' "Loki" "$ip_addr" "3110"
  echo
  emit_os_sync_summary
  echo
  echo "TryCloudflare: project-truth-lan-summary --screen-tunnels"
  echo "Database facts: project-truth-lan-summary --screen-db"
  echo
  echo "Useful: progress --watch | hris-status | sudo os-sync"
}

ip_addr="$(lan_ip || true)"
write_summary "$ip_addr"

if [ "$screen" = "true" ]; then
  printf '\033c\033[3J\033[H\033[2J'
  PROJECT_TRUTH_SCREEN_NO_CLEAR=1 emit_screen_summary "$ip_addr" "$screen_page" |
    sed 's/^/  /'
  exit 0
fi

{
  echo "Project Truth HRIS appliance"
  if [ -n "$ip_addr" ]; then
    echo "LAN IP: ${ip_addr}"
    echo "Open: http://${ip_addr}:3000/auth/login"
    echo "Client summary: project-truth-lan-summary --screen"
    if [ -r "$sync_state_file" ]; then
      commit="$(awk -F= '$1 == "commit" { print substr($2, 1, 12) }' "$sync_state_file")"
      branch="$(awk -F= '$1 == "branch" { print $2 }' "$sync_state_file")"
      if [ -n "$commit" ]; then
        echo "OS sync: ${branch}@${commit}"
      fi
    fi
  else
    echo "LAN IP: NOT DETECTED"
  fi
  echo "Run after login: project-truth-lan-summary"
  echo "OS pull: sudo project-truth-os-sync"
} > "$motd_file"

{
  echo "Project Truth HRIS appliance"
  if [ -n "$ip_addr" ]; then
    echo "LAN IP: ${ip_addr}"
  else
    echo "LAN IP: NOT DETECTED"
  fi
  echo
  echo "Console login:"
  echo "  username: infra"
  echo "  password: infra (hidden while typing)"
  echo "Only type infra when the line ends with login:"
  echo "If the prompt ends with $, you are already logged in."
  echo "After login run:"
  echo "  project-truth-lan-summary --screen-overview"
  echo "  project-truth-lan-summary --screen-tunnels"
  echo "  sudo project-truth-os-sync"
  echo
} > "$issue_file"

{
  echo "----- $(date '+%Y-%m-%d %H:%M:%S %Z') -----"
  cat "$summary_file"
  echo
} >> "$log_file"

if [ "$quiet" != "true" ]; then
  cat "$summary_file"
fi

if [ "${PROJECT_TRUTH_SKIP_TTY1_WRITE:-}" != "1" ] && [ -w /dev/tty1 ]; then
  tty_user="$(who 2>/dev/null | awk '$2 == "tty1" { print $1; exit }')"
  {
    printf '\033c'
    if [ -n "$tty_user" ]; then
      echo "Project Truth HRIS appliance"
      echo "LAN IP: ${ip_addr:-NOT DETECTED}"
      echo
      echo "Console is already logged in as ${tty_user}."
      echo "Do not type infra at this shell prompt."
      echo
      echo "Run:"
      echo "  project-truth-lan-summary --screen-overview"
      echo "  project-truth-lan-summary --screen-tunnels"
      echo "  sudo project-truth-os-sync"
      echo
      printf '%s@%s:~$ ' "$tty_user" "$(hostname)"
    else
      cat "$issue_file"
      printf '%s login: ' "$(hostname)"
    fi
  } > /dev/tty1 || true
fi
