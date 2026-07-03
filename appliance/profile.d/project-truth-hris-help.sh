#!/usr/bin/env bash

preferred_lan_ip="${PROJECT_TRUTH_LAN_IP:-10.184.37.19}"
lan_ip=""
if [ -n "$preferred_lan_ip" ] &&
  ip -4 -o addr show scope global up 2>/dev/null |
    awk '{ split($4, a, "/"); print a[1] }' |
    grep -Fxq "$preferred_lan_ip"; then
  lan_ip="$preferred_lan_ip"
fi
if [ -z "$lan_ip" ]; then
  lan_ip="$(ip route get 1.1.1.1 2>/dev/null | awk '{ for (i=1; i<=NF; i++) if ($i=="src") { print $(i+1); exit } }')"
fi
if [ -z "$lan_ip" ]; then
  lan_ip="$(ip -4 -o addr show scope global up 2>/dev/null | awk '!/ docker| br-| veth| cni| flannel/ { split($4, a, "/"); print a[1]; exit }')"
fi

echo
echo "Project Truth HRIS appliance"
echo "Logged in as $(id -un). Use the URLs below from the Windows host browser."
echo "You are already logged in when the prompt ends with $. Do not type infra here."
echo

cloudflare_tunnel_mode() {
  if command -v systemctl >/dev/null 2>&1 &&
    systemctl is-active --quiet cloudflared-bnpi-hris.service 2>/dev/null; then
    echo "VM-managed active"
  else
    echo "host-managed on Windows"
  fi
}

cloudflare_http_origin() {
  if [ "$(cloudflare_tunnel_mode)" = "VM-managed active" ]; then
    echo "http://localhost:3000"
  else
    echo "http://${lan_ip}:3000"
  fi
}

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
  echo "Cloudflare named tunnel"
  echo "  mode: $(cloudflare_tunnel_mode)"
  echo "  name: bnpi-hris"
  echo "  domain: bnpi-hris.tech"
  echo "  public app: https://bnpi-hris.tech/auth/login"
  echo "  public api: https://api.bnpi-hris.tech/health"
  echo "  dev app: https://dev.bnpi-hris.tech/auth/login"
  echo "  dev api: https://dev-api.bnpi-hris.tech/health"
  echo "  uat app: https://uat.bnpi-hris.tech/auth/login"
  echo "  uat api: https://uat-api.bnpi-hris.tech/health"
  echo "  grafana: https://grafana.bnpi-hris.tech/api/health"
  echo "  origin: $(cloudflare_http_origin)"
  echo "  VM setup: sudo project-truth-cloudflare-vm-tunnel <credential.json>"
  echo "  host repair: project-truth ensure-bnpi-cloudflare-host -ProvisionDns -StartTunnel -VerifyPublic -VerifySsh"
  echo "  SSH browser: https://ssh.bnpi-hris.tech"
  echo "  SSH CLI: ssh project-truth-hris"
  echo "  SSH host: ssh.bnpi-hris.tech"
  echo "  SSH full: ssh -i %USERPROFILE%\\.ssh\\node-health-appliance_ed25519 -o ProxyCommand=\"cloudflared access ssh --hostname %h\" infra@ssh.bnpi-hris.tech"
  echo "  SSH LAN fallback: ssh infra@${lan_ip}"
  echo
  echo "Postgres"
  printf '  %-5s %s\n' "PROD" "postgresql://postgres:postgres@${lan_ip}:15432/hris"
  printf '  %-5s %s\n' "DEV" "postgresql://postgres:postgres@${lan_ip}:15433/hris"
  printf '  %-5s %s\n' "UAT" "postgresql://postgres:postgres@${lan_ip}:15434/hris"
  echo
  echo "Observability"
  printf '  %-10s http://%s:%s\n' "Grafana" "$lan_ip" "53000"
  printf '  %-10s http://%s:%s\n' "Prometheus" "$lan_ip" "9091"
  printf '  %-10s http://%s:%s\n' "Loki" "$lan_ip" "3110"
  printf '  %-10s http://%s:%s\n' "Gateway" "$lan_ip" "38080"
else
  echo "LAN IP: NOT DETECTED"
  echo "Repair: project-truth-lan-config"
fi

if [ -s /run/project-truth/trycloudflare-public-urls.txt ]; then
  echo
  echo "Deprecated TryCloudflare proof"
  echo "  Named tunnel is the normal public path."
  awk -F'|' '
    $2 ~ /gateway|prod-app|prod-api|dev-app|dev-api|uat-app|uat-api|grafana|prometheus|loki/ {
      gsub(/^ +| +$/, "", $2)
      gsub(/^ +| +$/, "", $4)
      if ($4 ~ /^https:\/\/.*trycloudflare\.com/) {
        printf "  %-10s %s\n", $2, $4
      }
    }
  ' /run/project-truth/trycloudflare-public-urls.txt
fi

echo
echo "OS pull"
if [ -r /var/lib/project-truth/ansible-pull-state ]; then
  awk -F= '
    $1 == "branch" { branch=$2 }
    $1 == "commit" { commit=$2 }
    $1 == "synced_at" { synced_at=$2 }
    END {
      if (commit != "") {
        printf "  last: %s@%s\n", branch, substr(commit, 1, 12)
        printf "  synced: %s\n", synced_at
      }
    }
  ' /var/lib/project-truth/ansible-pull-state
else
  echo "  waiting for first project-truth-ansible-pull run"
fi
echo "  sync now: sudo project-truth-ansible-pull"
echo "  status: project-truth-ansible-pull --status"
echo
echo "Client screens"
echo "  project-truth-lan-summary --screen-overview"
echo "  project-truth-lan-summary --screen-tunnels"
echo "  project-truth-lan-summary --screen-db"
echo "  project-truth-db-access"
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
