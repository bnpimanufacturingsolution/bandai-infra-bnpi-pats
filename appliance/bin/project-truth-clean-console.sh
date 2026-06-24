#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  exec sudo "$0" "$@"
fi

tty_path="/dev/tty1"

if [ ! -w "$tty_path" ]; then
  exit 0
fi

sysctl -w kernel.printk="3 4 1 3" >/dev/null 2>&1 || true
dmesg -n 1 >/dev/null 2>&1 || true

if command -v project-truth-lan-summary >/dev/null 2>&1; then
  project-truth-lan-summary --quiet >/dev/null 2>&1 || true
fi

systemctl restart getty@tty1.service >/dev/null 2>&1 || true
sleep 1

{
  printf '\033c'
  if [ -f /etc/issue ]; then
    cat /etc/issue
  else
    echo "Project Truth HRIS appliance"
    echo "LAN IP: NOT DETECTED"
    echo
    echo "Console login:"
    echo "  username: infra"
    echo "  password: infra (hidden while typing)"
    echo "Do not type infra again after the shell prompt appears."
    echo
  fi
  echo "After login run:"
  echo "  project-truth-lan-summary --screen-overview"
  echo "  project-truth-lan-summary --screen-tunnels"
  echo
  printf '%s login: ' "$(hostname)"
} > "$tty_path"
