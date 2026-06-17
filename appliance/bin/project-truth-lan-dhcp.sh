#!/usr/bin/env bash
set -euo pipefail

iface="${1:-enp0s3}"
netplan_file="/etc/netplan/99-project-truth-dhcp.yaml"

if ! ip link show "$iface" >/dev/null 2>&1; then
  echo "Network interface not found: $iface" >&2
  echo "Available interfaces:" >&2
  ip -br link >&2
  exit 1
fi

sudo tee "$netplan_file" >/dev/null <<EOF
network:
  version: 2
  ethernets:
    ${iface}:
      dhcp4: true
EOF

sudo chmod 600 "$netplan_file"
sudo rm -f /etc/netplan/50-cloud-init.yaml /etc/netplan/99-project-truth-static*.yaml
sudo netplan apply

sleep 3
lan_ip="$(ip -4 -o addr show dev "$iface" scope global up | awk '{ split($4, a, "/"); print a[1]; exit }')"

if [ -z "$lan_ip" ]; then
  echo "DHCP applied, but no IPv4 address was detected on $iface." >&2
  echo "Check that the VM adapter is bridged and cable-connected." >&2
  ip -br addr show "$iface" >&2
  exit 1
fi

echo "Project Truth LAN DHCP repaired on $iface"
echo "LAN IP: $lan_ip"
echo "HRIS App URL: http://${lan_ip}:3000"
echo "HRIS API Health URL: http://${lan_ip}:3001/health"
