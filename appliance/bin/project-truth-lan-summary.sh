#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  exec sudo "$0" "$@"
fi

state_dir="/run/project-truth"
log_file="/var/log/project-truth-network-summary.log"
issue_file="/etc/issue"
motd_file="/etc/motd"
summary_file="${state_dir}/network-summary.txt"
quiet=false

if [ "${1:-}" = "--quiet" ]; then
  quiet=true
fi

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
  } > "$summary_file"
}

ip_addr="$(lan_ip || true)"
write_summary "$ip_addr"

{
  echo "Project Truth HRIS appliance"
  if [ -n "$ip_addr" ]; then
    echo "LAN IP: ${ip_addr}"
    echo "Open: http://${ip_addr}:3000/auth/login"
  else
    echo "LAN IP: NOT DETECTED"
  fi
  echo "Run: project-truth-lan-summary"
} > "$motd_file"

{
  echo "Project Truth HRIS appliance"
  if [ -n "$ip_addr" ]; then
    echo "LAN IP: ${ip_addr}"
  else
    echo "LAN IP: NOT DETECTED"
  fi
  echo
  echo "Login with infra / infra"
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
