#!/usr/bin/env bash
set -euo pipefail

iface="${PROJECT_TRUTH_LAN_IFACE:-${1:-eth0}}"
config_file="/etc/project-truth/lan.env"
netplan_file="/etc/netplan/99-project-truth-lan.yaml"
legacy_dhcp_file="/etc/netplan/99-project-truth-dhcp.yaml"
mode="${PROJECT_TRUTH_LAN_MODE:-dhcp}"
address="${PROJECT_TRUTH_LAN_ADDRESS:-}"
addresses="${PROJECT_TRUTH_LAN_ADDRESSES:-}"
gateway="${PROJECT_TRUTH_LAN_GATEWAY:-}"
dns="${PROJECT_TRUTH_LAN_DNS:-1.1.1.1,8.8.8.8}"
search_domains="${PROJECT_TRUTH_LAN_SEARCH_DOMAINS:-}"
dhcp_addresses="${PROJECT_TRUTH_LAN_DHCP_ADDRESSES:-}"

usage() {
  cat <<'USAGE'
Usage:
  project-truth-lan-config [iface]
  project-truth-lan-config --dhcp [iface]
  project-truth-lan-config --static <cidr> <gateway> [dns_csv] [iface]
  project-truth-lan-config --status

Static config is persisted in /etc/project-truth/lan.env and re-applied by
ansible-pull. Example:
  sudo project-truth-lan-config --static 192.168.254.50/24 192.168.254.1 1.1.1.1,8.8.8.8

Static mode can pin multiple addresses by setting PROJECT_TRUTH_LAN_ADDRESSES
to a comma-separated CIDR list in /etc/project-truth/lan.env.

DHCP mode is retained only for fresh-image/bootstrap fallback. Current BNPI
runtime should use PROJECT_TRUTH_LAN_MODE=static with explicit addresses.
USAGE
}

if [ -r "$config_file" ]; then
  # shellcheck disable=SC1090
  . "$config_file"
  mode="${PROJECT_TRUTH_LAN_MODE:-$mode}"
  address="${PROJECT_TRUTH_LAN_ADDRESS:-$address}"
  addresses="${PROJECT_TRUTH_LAN_ADDRESSES:-$addresses}"
  gateway="${PROJECT_TRUTH_LAN_GATEWAY:-$gateway}"
  dns="${PROJECT_TRUTH_LAN_DNS:-$dns}"
  search_domains="${PROJECT_TRUTH_LAN_SEARCH_DOMAINS:-$search_domains}"
  dhcp_addresses="${PROJECT_TRUTH_LAN_DHCP_ADDRESSES:-$dhcp_addresses}"
  iface="${PROJECT_TRUTH_LAN_IFACE:-$iface}"
fi

case "${1:-}" in
  --help|-h)
    usage
    exit 0
    ;;
  --status|status)
    echo "Project Truth LAN config"
    echo "  config_file=${config_file}"
    echo "  iface=${iface}"
    echo "  mode=${mode}"
    if [ "$mode" = "static" ]; then
      echo "  addresses=${addresses:-$address}"
      echo "  gateway=${gateway}"
      echo "  dns=${dns}"
      echo "  search=${search_domains}"
    else
      echo "  dhcp_addresses=${dhcp_addresses}"
    fi
    exit 0
    ;;
  --dhcp|dhcp)
    mode="dhcp"
    iface="${2:-$iface}"
    sudo install -d -m 0755 "$(dirname "$config_file")"
    sudo tee "$config_file" >/dev/null <<EOF
PROJECT_TRUTH_LAN_MODE=dhcp
PROJECT_TRUTH_LAN_IFACE=${iface}
PROJECT_TRUTH_LAN_DHCP_ADDRESSES=${dhcp_addresses}
EOF
    sudo chmod 0644 "$config_file"
    ;;
  --static|static)
    if [ $# -lt 3 ]; then
      usage >&2
      exit 2
    fi
    mode="static"
    address="$2"
    addresses="$2"
    gateway="$3"
    dns="${4:-$dns}"
    iface="${5:-$iface}"
    sudo install -d -m 0755 "$(dirname "$config_file")"
    sudo tee "$config_file" >/dev/null <<EOF
PROJECT_TRUTH_LAN_MODE=static
PROJECT_TRUTH_LAN_ADDRESS=${address}
PROJECT_TRUTH_LAN_ADDRESSES=${address}
PROJECT_TRUTH_LAN_GATEWAY=${gateway}
PROJECT_TRUTH_LAN_DNS=${dns}
PROJECT_TRUTH_LAN_SEARCH_DOMAINS=${search_domains}
PROJECT_TRUTH_LAN_IFACE=${iface}
EOF
    sudo chmod 0644 "$config_file"
    ;;
  -*)
    usage >&2
    exit 2
    ;;
  *)
    iface="${1:-$iface}"
    ;;
esac

if ! command -v netplan >/dev/null 2>&1; then
  echo "netplan is not installed; skipping LAN config repair." >&2
  exit 0
fi

if ! ip link show "$iface" >/dev/null 2>&1; then
  echo "Interface $iface not found; skipping LAN config repair." >&2
  exit 0
fi

if [ "$mode" = "static" ]; then
  if [ -z "$addresses" ]; then
    addresses="$address"
  fi
  if [ -z "$addresses" ] || [ -z "$gateway" ]; then
    echo "Static LAN mode requires PROJECT_TRUTH_LAN_ADDRESSES or PROJECT_TRUTH_LAN_ADDRESS, plus PROJECT_TRUTH_LAN_GATEWAY in $config_file." >&2
    exit 1
  fi
  static_address_yaml="$(printf '%s' "$addresses" |
    tr ',' '\n' |
    awk '{ gsub(/^ +| +$/, ""); if ($0 != "") printf "        - %s\n", $0 }')"
  dns_yaml="$(printf '%s' "$dns" | awk -F',' '{ for (i = 1; i <= NF; i++) { gsub(/^ +| +$/, "", $i); if ($i != "") printf "%s%s", sep, $i; sep = ", " } }')"
  search_yaml=""
  if [ -n "$search_domains" ]; then
    search_yaml="$(printf '%s' "$search_domains" | awk -F',' '{ for (i = 1; i <= NF; i++) { gsub(/^ +| +$/, "", $i); if ($i != "") printf "%s%s", sep, $i; sep = ", " } }')"
  fi
  sudo tee "$netplan_file" >/dev/null <<EOF
network:
  version: 2
  ethernets:
    ${iface}:
      dhcp4: false
      addresses:
${static_address_yaml}
      routes:
        - to: default
          via: ${gateway}
          on-link: true
      nameservers:
        addresses: [${dns_yaml}]
EOF
  if [ -n "$search_yaml" ]; then
    sudo tee -a "$netplan_file" >/dev/null <<EOF
        search: [${search_yaml}]
EOF
  fi
else
  if [ -n "$dhcp_addresses" ]; then
    dhcp_address_yaml="$(printf '%s' "$dhcp_addresses" |
      tr ',' '\n' |
      awk '{ gsub(/^ +| +$/, ""); if ($0 != "") printf "        - %s\n", $0 }')"
    sudo tee "$netplan_file" >/dev/null <<EOF
network:
  version: 2
  ethernets:
    ${iface}:
      dhcp4: true
      addresses:
${dhcp_address_yaml}
EOF
  else
    sudo tee "$netplan_file" >/dev/null <<EOF
network:
  version: 2
  ethernets:
    ${iface}:
      dhcp4: true
EOF
  fi
fi

sudo chmod 600 "$netplan_file"
sudo rm -f /etc/netplan/50-cloud-init.yaml "$legacy_dhcp_file" /etc/netplan/99-project-truth-static*.yaml
sudo netplan apply

if [ "${PROJECT_TRUTH_SKIP_TTY1_WRITE:-0}" != "1" ] && command -v project-truth-lan-summary >/dev/null 2>&1; then
  project-truth-lan-summary --quiet || true
fi
