#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  exec sudo "$0" "$@"
fi

tty_path="/dev/tty1"
tty_user="$(who 2>/dev/null | awk '$2 == "tty1" { print $1; exit }')"

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

if [ ! -w "$tty_path" ]; then
  exit 0
fi

sysctl -w kernel.printk="3 4 1 3" >/dev/null 2>&1 || true
dmesg -n 1 >/dev/null 2>&1 || true

if command -v project-truth-lan-summary >/dev/null 2>&1; then
  project-truth-lan-summary --quiet >/dev/null 2>&1 || true
fi

if [ -z "$tty_user" ]; then
  systemctl restart getty@tty1.service >/dev/null 2>&1 || true
  sleep 1
fi

{
  printf '\033c'
  if [ -n "$tty_user" ]; then
    echo "Project Truth BNPI PATS appliance"
    echo "LAN IP: ${lan_ip:-NOT DETECTED}"
    echo "Console is already logged in as ${tty_user}."
    echo "Do not type infra at this shell prompt."
    echo
    echo "Run:"
    echo "  project-truth-lan-summary --screen-overview"
    echo "  project-truth-lan-summary --screen-tunnels"
    echo "  project-truth-db-access"
    echo
    printf '%s@%s:~$ ' "$tty_user" "$(hostname)"
  elif [ -f /etc/issue ]; then
    cat /etc/issue
    printf '%s login: ' "$(hostname)"
  else
    echo "Project Truth BNPI PATS appliance"
    echo "LAN IP: NOT DETECTED"
    echo
    echo "Console login:"
    echo "  username: infra"
    echo "  password: infra (hidden while typing)"
    echo "Only type infra when the line ends with login:"
    echo "If the prompt ends with $, you are already logged in."
    echo
    echo "After login run:"
    echo "  project-truth-lan-summary --screen-overview"
    echo "  project-truth-lan-summary --screen-tunnels"
    echo "  project-truth-db-access"
    echo
    printf '%s login: ' "$(hostname)"
  fi
} | sed 's/$/\r/' > "$tty_path"
