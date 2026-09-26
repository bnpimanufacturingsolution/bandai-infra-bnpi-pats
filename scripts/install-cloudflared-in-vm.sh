#!/usr/bin/env bash
# Install and start the Cloudflare connector INSIDE the Project Truth VM.
#
# Target architecture (matches AGENTS.md "Running Cloudflare Tunnel Safety Rule"):
# the VM owns the named tunnel, so the tunnel ingress can use localhost and the
# public domains resolve to the VM rather than to some other host.
#
# Usage (from the Windows host, over SSH):
#   PROJECT_TRUTH_TUNNEL_TOKEN='<token>' bash install-cloudflared-in-vm.sh
#
# The token is read from the environment on purpose. Never commit it.

set -euo pipefail

TUNNEL_NAME="${TUNNEL_NAME:-bnpi-pats}"
TUNNEL_ID="${TUNNEL_ID:-12e89b6a-dabb-4897-9925-08ce9213b983}"
LOG_TAG="install-cloudflared-in-vm"

log() { printf '%s [%s] %s\n' "$(date -Is)" "$LOG_TAG" "$*"; }
die() { log "ERROR: $*"; exit 1; }

TOKEN="${PROJECT_TRUTH_TUNNEL_TOKEN:-}"
[ -n "$TOKEN" ] || die "PROJECT_TRUTH_TUNNEL_TOKEN is empty. Export it before running."

log "host=$(hostname) user=$(id -un) arch=$(dpkg --print-architecture 2>/dev/null || uname -m)"

# --- 1. install cloudflared -------------------------------------------------
if command -v cloudflared >/dev/null 2>&1; then
    log "cloudflared already present: $(cloudflared --version 2>&1 | head -1)"
else
    log "downloading cloudflared"
    tmp=$(mktemp -d)
    curl -fsSL -o "$tmp/cloudflared.deb" \
        "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb"
    dpkg -i "$tmp/cloudflared.deb" >/dev/null
    rm -rf "$tmp"
    log "installed: $(cloudflared --version 2>&1 | head -1)"
fi

# --- 2. enable + start the connector as a service ---------------------------
# If a stale unit already exists, remove it first so the token is not duplicated.
if systemctl list-unit-files | grep -q '^cloudflared.service'; then
    log "removing existing cloudflared.service"
    systemctl stop cloudflared 2>/dev/null || true
    systemctl disable cloudflared 2>/dev/null || true
    rm -f /etc/systemd/system/cloudflared.service /lib/systemd/system/cloudflared.service
    systemctl daemon-reload
fi

log "installing service for tunnel ${TUNNEL_NAME} (${TUNNEL_ID})"
cloudflared --no-autoupdate service install "$TOKEN" >/dev/null
systemctl daemon-reload
systemctl enable cloudflared >/dev/null
systemctl restart cloudflared

# --- 3. wait for the connector to register ---------------------------------
log "waiting for connector to register..."
connected=0
for i in $(seq 1 30); do
    if systemctl is-active --quiet cloudflared; then
        if journalctl -u cloudflared --since "-2min" --no-pager 2>/dev/null \
             | grep -qE 'Registered tunnel connection|Initial protocol version'; then
            connected=1
            break
        fi
    fi
    sleep 5
done

systemctl is-active cloudflared >/dev/null 2>&1 || die "cloudflared service is not active"
[ "$connected" = "1" ] || log "WARNING: service active but no 'Registered tunnel connection' line yet"

log "--- connector log tail ---"
journalctl -u cloudflared --since "-3min" --no-pager 2>/dev/null | tail -15 || true

# --- 4. report what the ingress will now reach ------------------------------
# With the connector inside the VM, tunnel ingress localhost:PORT refers to this
# VM. Report whether those ports are actually listening so a 502 is diagnosable.
log "--- local port check (tunnel ingress targets) ---"
for p in 3000 3001 3100 3101 3200 3201 22; do
    if ss -ltn "sport = :$p" 2>/dev/null | grep -q LISTEN; then
        log "  port $p LISTENING"
    else
        log "  port $p not listening  <-- tunnel rule for this port will 502"
    fi
done

log "CLOUDFLARED_IN_VM_DONE connected=$connected"
