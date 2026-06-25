#!/usr/bin/env bash
set -euo pipefail

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

port_state() {
  local port="$1"
  if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | awk '{ print $4 }' | grep -Eq "(:|\\])${port}$"; then
    printf 'listening'
    return
  fi
  if command -v nc >/dev/null 2>&1 && nc -z 127.0.0.1 "$port" >/dev/null 2>&1; then
    printf 'reachable-local'
    return
  fi
  printf 'not-listening'
}

firewall_state() {
  local port="$1"
  if command -v ufw >/dev/null 2>&1; then
    if ufw status 2>/dev/null | grep -Eq "^${port}/tcp\\s+ALLOW"; then
      printf 'ufw-allow'
      return
    fi
    if ufw status 2>/dev/null | grep -q 'Status: inactive'; then
      printf 'ufw-inactive'
      return
    fi
    printf 'ufw-check'
    return
  fi
  if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
    if firewall-cmd --list-ports 2>/dev/null | grep -qw "${port}/tcp"; then
      printf 'firewalld-allow'
      return
    fi
    printf 'firewalld-check'
    return
  fi
  printf 'no-firewall-tool'
}

emit_url_row() {
  local env_name="$1"
  local port="$2"
  local ip_addr="$3"
  local url="postgresql://postgres:postgres@${ip_addr}:${port}/hris"
  printf '  %-4s %-11s firewall=%-16s %s\n' "$env_name" "$(port_state "$port")" "$(firewall_state "$port")" "$url"
}

ip_addr="$(lan_ip || true)"

echo "Project Truth database access"
echo "============================="
if [ -z "$ip_addr" ]; then
  echo "LAN IP: NOT DETECTED"
  echo "Repair: project-truth-lan-dhcp"
  exit 1
fi

echo "LAN IP: ${ip_addr}"
emit_url_row "PROD" "15432" "$ip_addr"
emit_url_row "DEV" "15433" "$ip_addr"
emit_url_row "UAT" "15434" "$ip_addr"
echo
echo "Client examples:"
echo "  psql postgresql://postgres:postgres@${ip_addr}:15432/hris"
echo "  psql postgresql://postgres:postgres@${ip_addr}:15433/hris"
echo "  psql postgresql://postgres:postgres@${ip_addr}:15434/hris"
echo
echo "Cloudflare TCP access is not a trycloudflare HTTP URL."
echo "Use named Cloudflare Tunnel + Access, then on each client run:"
echo "  cloudflared access tcp --hostname <prod-db-hostname> --url localhost:15432"
echo "  cloudflared access tcp --hostname <dev-db-hostname>  --url localhost:15433"
echo "  cloudflared access tcp --hostname <uat-db-hostname>  --url localhost:15434"
