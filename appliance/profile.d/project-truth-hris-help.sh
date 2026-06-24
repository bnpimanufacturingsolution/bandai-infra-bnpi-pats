#!/usr/bin/env bash

lan_ip="$(ip route get 1.1.1.1 2>/dev/null | awk '{ for (i=1; i<=NF; i++) if ($i=="src") { print $(i+1); exit } }')"
if [ -z "$lan_ip" ]; then
  lan_ip="$(ip -4 -o addr show scope global up 2>/dev/null | awk '!/ docker| br-| veth| cni| flannel/ { split($4, a, "/"); print a[1]; exit }')"
fi

echo
echo "Project Truth HRIS appliance"
echo "Logged in as $(id -un). Use the URLs below from the Windows host browser."
echo "You are already logged in when the prompt ends with $. Do not type infra here."
echo

if [ -n "$lan_ip" ]; then
  echo "LAN IP: ${lan_ip}"
  echo
  echo "HRIS"
  printf '  %-5s login  http://%s:%s/auth/login\n' "PROD" "$lan_ip" "3000"
  printf '  %-5s api    http://%s:%s/health\n' "PROD" "$lan_ip" "3001"
  printf '  %-5s login  http://%s:%s/auth/login\n' "DEV" "$lan_ip" "3100"
  printf '  %-5s api    http://%s:%s/health\n' "DEV" "$lan_ip" "3101"
  printf '  %-5s login  http://%s:%s/auth/login\n' "UAT" "$lan_ip" "3200"
  printf '  %-5s api    http://%s:%s/health\n' "UAT" "$lan_ip" "3201"
  echo
  echo "Observability"
  printf '  %-10s http://%s:%s\n' "Grafana" "$lan_ip" "53000"
  printf '  %-10s http://%s:%s\n' "Prometheus" "$lan_ip" "9091"
  printf '  %-10s http://%s:%s\n' "Loki" "$lan_ip" "3110"
else
  echo "LAN IP: NOT DETECTED"
  echo "Repair: project-truth-lan-dhcp"
fi

if [ -s /run/project-truth/trycloudflare-public-urls.txt ]; then
  echo
  echo "TryCloudflare"
  awk -F'|' '
    $2 ~ /prod-app|prod-api|dev-app|dev-api|uat-app|uat-api|grafana|prometheus|loki/ {
      gsub(/^ +| +$/, "", $2)
      gsub(/^ +| +$/, "", $4)
      if ($4 ~ /^https:\/\/.*trycloudflare\.com/) {
        printf "  %-10s %s\n", $2, $4
      }
    }
  ' /run/project-truth/trycloudflare-public-urls.txt
fi

echo
echo "Client screens"
echo "  project-truth-lan-summary --screen-overview"
echo "  project-truth-lan-summary --screen-tunnels"
echo "  project-truth-lan-summary --screen-db"
echo

project_truth_command_not_found() {
  if [ "${1:-}" = "infra" ]; then
    echo "You are already logged in as infra."
    echo "At this shell prompt, run: project-truth-lan-summary --screen-overview"
    return 127
  fi

  if command -v command-not-found >/dev/null 2>&1; then
    command-not-found "$1"
    return $?
  fi

  echo "$1: command not found" >&2
  return 127
}

command_not_found_handle() {
  project_truth_command_not_found "$@"
}
