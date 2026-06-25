#!/usr/bin/env bash
set -euo pipefail

iface="${1:-}"
config_file="/etc/project-truth/lan.env"
netplan_file="/etc/netplan/99-project-truth-lan.yaml"
legacy_dhcp_file="/etc/netplan/99-project-truth-dhcp.yaml"
mode="${PROJECT_TRUTH_LAN_MODE:-dhcp}"
address="${PROJECT_TRUTH_LAN_ADDRESS:-}"
gateway="${PROJECT_TRUTH_LAN_GATEWAY:-}"
dns="${PROJECT_TRUTH_LAN_DNS:-1.1.1.1,8.8.8.8}"

usage() {
  cat <<'EOF'
Usage:
  project-truth-lan-dhcp [iface]
  project-truth-lan-dhcp --dhcp [iface]
  project-truth-lan-dhcp --static <cidr> <gateway> [dns_csv] [iface]
  project-truth-lan-dhcp --status

Static config is persisted in /etc/project-truth/lan.env and re-applied by
ansible-pull. Example:
  sudo project-truth-lan-dhcp --static 192.168.254.50/24 192.168.254.1 1.1.1.1,8.8.8.8
EOF
}

if [ -r "$config_file" ]; then
  # shellcheck disable=SC1090
  . "$config_file"
  mode="${PROJECT_TRUTH_LAN_MODE:-$mode}"
  address="${PROJECT_TRUTH_LAN_ADDRESS:-$address}"
  gateway="${PROJECT_TRUTH_LAN_GATEWAY:-$gateway}"
  dns="${PROJECT_TRUTH_LAN_DNS:-$dns}"
  iface="${PROJECT_TRUTH_LAN_IFACE:-$iface}"
fi

case "${1:-}" in
  --help|-h)
    usage
    exit 0
    ;;
  --status|status)
    echo "Project Truth LAN config"
    if [ -r "$config_file" ]; then
      sed 's/^/  /' "$config_file"
    else
      echo "  mode=dhcp"
      echo "  config_file=$config_file"
    fi
    ip -br addr
    exit 0
    ;;
  --dhcp|dhcp)
    mode="dhcp"
    iface="${2:-$iface}"
    sudo install -d -m 0755 /etc/project-truth
    sudo tee "$config_file" >/dev/null <<EOF
PROJECT_TRUTH_LAN_MODE=dhcp
PROJECT_TRUTH_LAN_IFACE=${iface}
EOF
    sudo chmod 0644 "$config_file"
    ;;
  --static|static)
    mode="static"
    address="${2:-}"
    gateway="${3:-}"
    dns="${4:-$dns}"
    iface="${5:-$iface}"
    if [ -z "$address" ] || [ -z "$gateway" ]; then
      usage >&2
      exit 1
    fi
    sudo install -d -m 0755 /etc/project-truth
    sudo tee "$config_file" >/dev/null <<EOF
PROJECT_TRUTH_LAN_MODE=static
PROJECT_TRUTH_LAN_ADDRESS=${address}
PROJECT_TRUTH_LAN_GATEWAY=${gateway}
PROJECT_TRUTH_LAN_DNS=${dns}
PROJECT_TRUTH_LAN_IFACE=${iface}
EOF
    sudo chmod 0644 "$config_file"
    ;;
esac

if [ -z "$iface" ]; then
  iface="$(ip -o link show |
    awk -F': ' '$2 != "lo" { print $2; exit }' |
    sed 's/@.*//')"
fi

if ! ip link show "$iface" >/dev/null 2>&1; then
  echo "Network interface not found: $iface" >&2
  echo "Available interfaces:" >&2
  ip -br link >&2
  exit 1
fi

if [ "$mode" = "static" ]; then
  if [ -z "$address" ] || [ -z "$gateway" ]; then
    echo "Static LAN mode requires PROJECT_TRUTH_LAN_ADDRESS and PROJECT_TRUTH_LAN_GATEWAY in $config_file." >&2
    exit 1
  fi
  dns_yaml="$(printf '%s' "$dns" | awk -F',' '{ for (i = 1; i <= NF; i++) { gsub(/^ +| +$/, "", $i); if ($i != "") printf "%s%s", sep, $i; sep = ", " } }')"
  sudo tee "$netplan_file" >/dev/null <<EOF
network:
  version: 2
  ethernets:
    ${iface}:
      dhcp4: false
      addresses:
        - ${address}
      routes:
        - to: default
          via: ${gateway}
      nameservers:
        addresses: [${dns_yaml}]
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

sudo chmod 600 "$netplan_file"
sudo rm -f /etc/netplan/50-cloud-init.yaml "$legacy_dhcp_file" /etc/netplan/99-project-truth-static*.yaml
sudo netplan apply

sleep 3
lan_ip="$(ip -4 -o addr show dev "$iface" scope global up | awk '{ split($4, a, "/"); print a[1]; exit }')"

if [ -z "$lan_ip" ]; then
  echo "LAN ${mode} config applied, but no IPv4 address was detected on $iface." >&2
  echo "Check that the VM adapter is bridged and cable-connected." >&2
  ip -br addr show "$iface" >&2
  exit 1
fi

echo "Project Truth LAN ${mode} repaired on $iface"
echo "LAN IP: $lan_ip"
echo "HRIS App URL: http://${lan_ip}:3000"
echo "HRIS API Health URL: http://${lan_ip}:3001/health"

if command -v project-truth-lan-summary >/dev/null 2>&1; then
  project-truth-lan-summary || true
fi
