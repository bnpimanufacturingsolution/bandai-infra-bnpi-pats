#!/usr/bin/env bash
set -euo pipefail

tunnel_name="${PROJECT_TRUTH_CLOUDFLARE_TUNNEL_NAME:-bnpi-pats}"
tunnel_id="${PROJECT_TRUTH_CLOUDFLARE_TUNNEL_ID:-e3486f00-f974-46d3-9e11-911266749d00}"
credential_source="${1:-}"
config_dir="/etc/cloudflared"
credential_path="${config_dir}/${tunnel_id}.json"
config_path="${config_dir}/config.yml"
unit_path="/etc/systemd/system/cloudflared-bnpi-pats.service"

if [ "$(id -u)" -ne 0 ]; then
  exec sudo "$0" "$@"
fi

usage() {
  cat <<USAGE
Usage:
  sudo project-truth-cloudflare-vm-tunnel /path/to/${tunnel_id}.json

Installs the existing named Cloudflare Tunnel credential as root-only VM
runtime state, writes localhost ingress for bnpi-pats.tech, and enables the
VM-side connector. Do not run this in image baking; credentials are secrets.
USAGE
}

if [ "${credential_source}" = "-h" ] || [ "${credential_source}" = "--help" ]; then
  usage
  exit 0
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed in the VM. Run project-truth-os-sync first." >&2
  exit 2
fi

if [ -z "$credential_source" ] || [ ! -f "$credential_source" ]; then
  usage >&2
  echo "Missing credential JSON source file." >&2
  exit 2
fi

install -d -m 0755 "$config_dir"
install -m 0600 -o root -g root "$credential_source" "$credential_path"

cat > "$config_path" <<YAML
tunnel: ${tunnel_id}
credentials-file: ${credential_path}

ingress:
  - hostname: bnpi-pats.tech
    path: /api/.*
    service: http://localhost:3001
  - hostname: www.bnpi-pats.tech
    path: /api/.*
    service: http://localhost:3001
  - hostname: app.bnpi-pats.tech
    path: /api/.*
    service: http://localhost:3001
  - hostname: dev.bnpi-pats.tech
    path: /api/.*
    service: http://localhost:3101
  - hostname: uat.bnpi-pats.tech
    path: /api/.*
    service: http://localhost:3201
  - hostname: emp.bnpi-pats.tech
    path: /api/.*
    service: http://localhost:3001
  - hostname: dev-emp.bnpi-pats.tech
    path: /api/.*
    service: http://localhost:3101
  - hostname: uat-emp.bnpi-pats.tech
    path: /api/.*
    service: http://localhost:3201
  - hostname: bnpi-pats.tech
    service: http://localhost:3000
  - hostname: www.bnpi-pats.tech
    service: http://localhost:3000
  - hostname: app.bnpi-pats.tech
    service: http://localhost:3000
  - hostname: api.bnpi-pats.tech
    service: http://localhost:3001
  - hostname: dev.bnpi-pats.tech
    service: http://localhost:3100
    originRequest:
      httpHostHeader: localhost:3100
  - hostname: dev-api.bnpi-pats.tech
    service: http://localhost:3101
  - hostname: uat.bnpi-pats.tech
    service: http://localhost:3200
  - hostname: uat-api.bnpi-pats.tech
    service: http://localhost:3201
  - hostname: emp.bnpi-pats.tech
    service: http://localhost:3300
  - hostname: dev-emp.bnpi-pats.tech
    service: http://localhost:3310
  - hostname: uat-emp.bnpi-pats.tech
    service: http://localhost:3320
  - hostname: grafana.bnpi-pats.tech
    service: http://localhost:53000
  - hostname: ssh.bnpi-pats.tech
    service: ssh://localhost:22
  - hostname: db.bnpi-pats.tech
    service: tcp://localhost:15432
  - hostname: dev-db.bnpi-pats.tech
    service: tcp://localhost:15433
  - hostname: uat-db.bnpi-pats.tech
    service: tcp://localhost:15434
  - service: http_status:404
YAML
chmod 0644 "$config_path"

cat > "$unit_path" <<UNIT
[Unit]
Description=Project Truth BNPI BNPI PATS Cloudflare named tunnel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$(command -v cloudflared) tunnel --config ${config_path} run ${tunnel_name}
Restart=always
RestartSec=5s
User=root

[Install]
WantedBy=multi-user.target
UNIT

cloudflared tunnel --config "$config_path" ingress validate
systemctl daemon-reload
systemctl enable --now cloudflared-bnpi-pats.service
systemctl --no-pager --full status cloudflared-bnpi-pats.service | sed -n '1,18p'
