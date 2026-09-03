#!/bin/bash
# Install Project Truth LAN DNS (dnsmasq) + reverse proxy (Caddy) + TLS internal CA.
# Does NOT touch cloudflared-bnpi-hris.service.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
VM_IP="${PROJECT_TRUTH_LAN_IP:-10.184.37.19}"

if ! dpkg -s dnsmasq >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y dnsmasq
fi
if ! command -v caddy >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y caddy
fi

sudo cp "$ROOT/bnpi-hris-lan.dnsmasq.conf" /etc/dnsmasq.d/bnpi-hris-lan.conf
sudo cp "$ROOT/Caddyfile" /etc/caddy/Caddyfile

# UFW: DNS + HTTP + HTTPS
if command -v ufw >/dev/null 2>&1 && sudo ufw status 2>/dev/null | grep -q active; then
  sudo ufw allow 53/tcp || true
  sudo ufw allow 53/udp || true
  sudo ufw allow 80/tcp || true
  sudo ufw allow 443/tcp || true
fi

sudo systemctl enable dnsmasq
sudo systemctl restart dnsmasq
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable caddy
sudo systemctl restart caddy
sleep 2

# Export LAN CA for clients (after first TLS handshake materializes PKI)
sudo mkdir -p /etc/project-truth/lan-ca
CA_SRC=""
for p in \
  /var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt \
  /var/lib/caddy/pki/authorities/local/root.crt \
  /home/caddy/.local/share/caddy/pki/authorities/local/root.crt; do
  if [ -f "$p" ]; then CA_SRC="$p"; break; fi
done
# Trigger PKI by local HTTPS request
curl -sk -o /dev/null -H "Host: dev.bnpi-hris.lan" https://127.0.0.1/ || true
sleep 1
for p in \
  /var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt \
  /var/lib/caddy/pki/authorities/local/root.crt; do
  if [ -f "$p" ]; then CA_SRC="$p"; break; fi
done
if [ -n "$CA_SRC" ]; then
  sudo cp "$CA_SRC" /etc/project-truth/lan-ca/caddy-local-root.crt
  sudo chmod 644 /etc/project-truth/lan-ca/caddy-local-root.crt
  echo "LAN CA: /etc/project-truth/lan-ca/caddy-local-root.crt"
else
  echo "LAN CA not found yet — run: curl -sk https://dev.bnpi-hris.lan/ then re-run install"
fi

# Install summary script if present next to this tree or from ansible-pull
if [ -f "$ROOT/../bin/project-truth-lan-summary.sh" ]; then
  sudo install -m 0755 "$ROOT/../bin/project-truth-lan-summary.sh" /usr/local/bin/project-truth-lan-summary
elif [ -f /var/lib/project-truth/ansible-pull/appliance/bin/project-truth-lan-summary.sh ]; then
  sudo install -m 0755 /var/lib/project-truth/ansible-pull/appliance/bin/project-truth-lan-summary.sh /usr/local/bin/project-truth-lan-summary
fi
if command -v project-truth-lan-summary >/dev/null 2>&1; then
  sudo project-truth-lan-summary --quiet || true
fi

echo "=== status ==="
systemctl is-active dnsmasq
systemctl is-active caddy
systemctl is-active cloudflared-bnpi-hris.service || true
dig @"$VM_IP" dev.bnpi-hris.lan +time=2 +tries=1 +short || true
curl -sS -m 5 -o /dev/null -w "http_dev=%{http_code}\n" -H "Host: dev.bnpi-hris.lan" http://127.0.0.1/
curl -sk -m 5 -o /dev/null -w "https_dev=%{http_code}\n" -H "Host: dev.bnpi-hris.lan" https://127.0.0.1/
curl -sk -m 5 -o /dev/null -w "https_grafana=%{http_code}\n" -H "Host: grafana.bnpi-hris.lan" https://127.0.0.1/
echo "DONE"
