#!/bin/bash
# Install Project Truth LAN DNS (dnsmasq) + reverse proxy (Caddy) on appliance VM.
# Safe with Cloudflare: does not touch cloudflared-bnpi-hris.service.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
VM_IP="${PROJECT_TRUTH_LAN_IP:-10.184.37.19}"
sudo cp "$ROOT/bnpi-hris-lan.dnsmasq.conf" /etc/dnsmasq.d/bnpi-hris-lan.conf
sudo cp "$ROOT/Caddyfile" /etc/caddy/Caddyfile
sudo systemctl enable --now dnsmasq
sudo systemctl restart dnsmasq
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo systemctl restart caddy
systemctl is-active dnsmasq caddy cloudflared-bnpi-hris.service
dig @"$VM_IP" dev.bnpi-hris.lan +short
curl -sS -m 5 -o /dev/null -w "dev=%{http_code}\n" -H "Host: dev.bnpi-hris.lan" http://127.0.0.1/