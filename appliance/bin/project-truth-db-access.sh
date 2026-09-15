#!/usr/bin/env bash
set -euo pipefail

lan_ip() {
  local preferred_ip="${PROJECT_TRUTH_LAN_IP:-10.184.37.19}"
  if [ -n "$preferred_ip" ] &&
    ip -4 -o addr show scope global up 2>/dev/null |
      awk '{ split($4, a, "/"); print a[1] }' |
      grep -Fxq "$preferred_ip"; then
    printf '%s\n' "$preferred_ip"
    return
  fi

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
  local url="postgresql://postgres:postgres@${ip_addr}:${port}/bnpi_pats"
  printf '  %-4s %-11s firewall=%-16s %s\n' "$env_name" "$(port_state "$port")" "$(firewall_state "$port")" "$url"
}

ip_addr="$(lan_ip || true)"

echo "Project Truth database access"
echo "============================="
if [ -z "$ip_addr" ]; then
  echo "LAN IP: NOT DETECTED"
  echo "Repair: project-truth-lan-config"
  exit 1
fi

echo "LAN IP: ${ip_addr}"
emit_url_row "PROD" "15432" "$ip_addr"
emit_url_row "DEV" "15433" "$ip_addr"
emit_url_row "UAT" "15434" "$ip_addr"
echo
echo "Client examples:"
echo "  psql postgresql://postgres:postgres@${ip_addr}:15432/bnpi_pats"
echo "  psql postgresql://postgres:postgres@${ip_addr}:15433/bnpi_pats"
echo "  psql postgresql://postgres:postgres@${ip_addr}:15434/bnpi_pats"
echo
echo "Cloudflare TCP access is not a trycloudflare HTTP URL."
echo "Use named Cloudflare Tunnel + Access, then on each client run:"
echo "  cloudflared access tcp --hostname db.bnpi-pats.tech     --url localhost:5432"
echo "  cloudflared access tcp --hostname dev-db.bnpi-pats.tech --url localhost:5433"
echo "  cloudflared access tcp --hostname uat-db.bnpi-pats.tech --url localhost:5434"
echo
echo "Then use local database URLs:"
echo "  PROD postgresql://postgres:postgres@localhost:5432/bnpi_pats"
echo "  DEV  postgresql://postgres:postgres@localhost:5433/bnpi_pats"
echo "  UAT  postgresql://postgres:postgres@localhost:5434/bnpi_pats"
echo
echo "Direct postgresql://postgres:postgres@db.bnpi-pats.tech:5432/bnpi_pats requires"
echo "Cloudflare WARP private routing or Spectrum/raw TCP, not normal Access TCP."
