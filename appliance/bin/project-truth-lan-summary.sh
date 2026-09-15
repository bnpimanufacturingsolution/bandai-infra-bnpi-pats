#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  exec sudo "$0" "$@"
fi

state_dir="/run/project-truth"
sync_state_file="/var/lib/project-truth/ansible-pull-state"
log_file="/var/log/project-truth-network-summary.log"
issue_file="/etc/issue"
motd_file="/etc/motd"
summary_file="${state_dir}/network-summary.txt"
quiet=false
screen=false
screen_page="overview"

for arg in "$@"; do
  case "$arg" in
    --quiet)
      quiet=true
      ;;
    --screen)
      screen=true
      screen_page="overview"
      ;;
    --screen-overview)
      screen=true
      screen_page="overview"
      ;;
    --screen-tunnels)
      screen=true
      screen_page="tunnels"
      ;;
    --screen-db)
      screen=true
      screen_page="db"
      ;;
  esac
done

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

emit_os_sync_summary() {
  echo "OS/Git sync"
  if [ -r "$sync_state_file" ]; then
    awk -F= '
      $1 == "branch" { branch=$2 }
      $1 == "commit" { commit=$2 }
      $1 == "synced_at" { synced_at=$2 }
      END {
        if (commit != "") {
          printf "  %s@%s\n", branch, substr(commit, 1, 12)
          printf "  synced: %s\n", synced_at
        } else {
          print "  state file present but commit missing"
        }
      }
    ' "$sync_state_file"
  else
    echo "  waiting for first project-truth-ansible-pull run"
  fi
  if command -v systemctl >/dev/null 2>&1 &&
    systemctl list-timers project-truth-ansible-pull.timer --no-pager >/dev/null 2>&1; then
    systemctl list-timers project-truth-ansible-pull.timer --no-pager 2>/dev/null |
      awk 'NR == 2 && $1 != "-" { printf "  next: %s %s %s\n", $1, $2, $3 }'
  fi
  echo "  sync now: sudo project-truth-ansible-pull"
  echo "  status: project-truth-ansible-pull --status"
}

emit_bnpi_pats_rows() {
  local ip_addr="$1"
  # Prefer clean LAN hostnames (dnsmasq + Caddy). Port URLs remain as fallback.
  echo "  Prefer clean LAN names (no ports) when DNS= ${ip_addr} or hosts file:"
  printf '  %-5s %-7s %s\n' "DEV" "login" "https://dev.bnpi-pats.lan/auth/login"
  printf '  %-5s %-7s %s\n' "DEV" "api" "https://dev-api.bnpi-pats.lan/health"
  printf '  %-5s %-7s %s\n' "DEV" "emp" "https://dev-emp.bnpi-pats.lan/auth/login"
  printf '  %-5s %-7s %s\n' "UAT" "login" "https://uat.bnpi-pats.lan/auth/login"
  printf '  %-5s %-7s %s\n' "UAT" "api" "https://uat-api.bnpi-pats.lan/health"
  printf '  %-5s %-7s %s\n' "UAT" "emp" "https://uat-emp.bnpi-pats.lan/auth/login"
  printf '  %-5s %-7s %s\n' "PROD" "login" "https://bnpi-pats.lan/auth/login"
  printf '  %-5s %-7s %s\n' "PROD" "app" "https://app.bnpi-pats.lan/auth/login"
  printf '  %-5s %-7s %s\n' "PROD" "api" "https://api.bnpi-pats.lan/health"
  printf '  %-5s %-7s %s\n' "PROD" "emp" "https://emp.bnpi-pats.lan/auth/login"
  printf '  %-5s %-7s %s\n' "OBS" "grafana" "https://grafana.bnpi-pats.lan"
  echo "  HTTP also works (http://dev.bnpi-pats.lan). Trust LAN CA once:"
  echo "    /etc/project-truth/lan-ca/caddy-local-root.crt"
  echo "  Port fallbacks (direct NodePort):"
  printf '  %-5s %-5s http://%s:%s/auth/login\n' "PROD" "login" "$ip_addr" "3000"
  printf '  %-5s %-5s http://%s:%s/health\n' "PROD" "api" "$ip_addr" "3001"
  printf '  %-5s %-5s http://%s:%s/auth/login\n' "PROD" "emp" "$ip_addr" "3300"
  printf '  %-5s %-5s http://%s:%s/auth/login\n' "DEV" "login" "$ip_addr" "3100"
  printf '  %-5s %-5s http://%s:%s/health\n' "DEV" "api" "$ip_addr" "3101"
  printf '  %-5s %-5s http://%s:%s/auth/login\n' "DEV" "emp" "$ip_addr" "3310"
  printf '  %-5s %-5s http://%s:%s/auth/login\n' "UAT" "login" "$ip_addr" "3200"
  printf '  %-5s %-5s http://%s:%s/health\n' "UAT" "api" "$ip_addr" "3201"
  printf '  %-5s %-5s http://%s:%s/auth/login\n' "UAT" "emp" "$ip_addr" "3320"
}

emit_lan_dns_rows() {
  local ip_addr="$1"
  echo "LAN DNS + reverse proxy (*.bnpi-pats.lan)"
  echo "  zone: bnpi-pats.lan  (not .local)"
  echo "  DNS server: ${ip_addr}  (dnsmasq)"
  echo "  proxy: Caddy :80 + :443 (tls internal CA)"
  if command -v systemctl >/dev/null 2>&1; then
    echo "  dnsmasq: $(systemctl is-active dnsmasq 2>/dev/null || echo unknown)"
    echo "  caddy:   $(systemctl is-active caddy 2>/dev/null || echo unknown)"
  fi
  echo "  DEV:     https://dev.bnpi-pats.lan   | https://dev-api.bnpi-pats.lan/health"
  echo "  UAT:     https://uat.bnpi-pats.lan   | https://uat-api.bnpi-pats.lan/health"
  echo "  PROD:    https://bnpi-pats.lan       | https://api.bnpi-pats.lan/health"
  echo "  Grafana: https://grafana.bnpi-pats.lan"
  echo "  CA trust: /etc/project-truth/lan-ca/caddy-local-root.crt"
  echo "  reinstall: sudo bash /usr/local/share/project-truth/lan-dns-proxy/install.sh"
}

emit_observability_rows() {
  local ip_addr="$1"
  printf '  %-18s http://%s:%s\n' "Grafana" "$ip_addr" "53000"
  printf '  %-18s http://%s:%s/api/health\n' "Grafana health" "$ip_addr" "53000"
  printf '  %-18s http://%s:%s/-/healthy\n' "Prometheus" "$ip_addr" "9091"
  printf '  %-18s http://%s:%s/ready\n' "Loki" "$ip_addr" "3110"
  printf '  %-18s http://%s:%s/ready\n' "Tempo" "$ip_addr" "3202"
  printf '  %-18s http://%s:%s/-/healthy\n' "Alertmanager" "$ip_addr" "9093"
  printf '  %-18s http://%s:%s/metrics\n' "Node exporter" "$ip_addr" "9110"
  printf '  %-18s http://%s:%s/metrics\n' "cAdvisor" "$ip_addr" "8088"
  printf '  %-18s http://%s:%s/-/healthy\n' "Blackbox exporter" "$ip_addr" "9115"
  printf '  %-18s http://%s:%s/metrics\n' "OTEL metrics" "$ip_addr" "8889"
}

emit_database_lan_rows() {
  local ip_addr="$1"
  printf '  %-5s %s\n' "PROD" "postgresql://postgres:postgres@${ip_addr}:15432/bnpi_pats"
  printf '  %-5s %s\n' "DEV" "postgresql://postgres:postgres@${ip_addr}:15433/bnpi_pats"
  printf '  %-5s %s\n' "UAT" "postgresql://postgres:postgres@${ip_addr}:15434/bnpi_pats"
}

cloudflare_tunnel_mode() {
  if command -v systemctl >/dev/null 2>&1 &&
    systemctl is-active --quiet cloudflared-bnpi-pats.service 2>/dev/null; then
    echo "VM-managed active"
  else
    echo "host-managed on Windows"
  fi
}

cloudflare_http_origin() {
  local ip_addr="$1"
  if [ "$(cloudflare_tunnel_mode)" = "VM-managed active" ]; then
    echo "http://localhost:3000"
  else
    echo "http://${ip_addr}:3000"
  fi
}

cloudflare_ssh_origin() {
  local ip_addr="$1"
  if [ "$(cloudflare_tunnel_mode)" = "VM-managed active" ]; then
    echo "ssh://localhost:22"
  else
    echo "ssh://${ip_addr}:22"
  fi
}

emit_named_cloudflare_rows() {
  local ip_addr="$1"
  echo "Cloudflare named tunnel"
  echo "  mode: $(cloudflare_tunnel_mode)"
  echo "  name: bnpi-pats"
  echo "  domain: bnpi-pats.tech"
  echo "  public app: https://bnpi-pats.tech/auth/login"
  echo "  public api: https://api.bnpi-pats.tech/health"
  echo "  employee app: https://emp.bnpi-pats.tech/auth/login"
  echo "  dev app: https://dev.bnpi-pats.tech/auth/login"
  echo "  dev api: https://dev-api.bnpi-pats.tech/health"
  echo "  dev employee app: https://dev-emp.bnpi-pats.tech/auth/login"
  echo "  uat app: https://uat.bnpi-pats.tech/auth/login"
  echo "  uat api: https://uat-api.bnpi-pats.tech/health"
  echo "  uat employee app: https://uat-emp.bnpi-pats.tech/auth/login"
  echo "  grafana: https://grafana.bnpi-pats.tech/api/health"
  echo "  origin: $(cloudflare_http_origin "$ip_addr")"
  echo "  VM setup: sudo project-truth-cloudflare-vm-tunnel <credential.json>"
  echo "  host repair: project-truth ensure-bnpi-cloudflare-host -ProvisionDns -StartTunnel -VerifyPublic -VerifySsh"
}

emit_cloudflare_ssh_rows() {
  local ip_addr="$1"
  echo "Cloudflare SSH"
  echo "  status: verified through Cloudflare Access"
  echo "  browser: https://ssh.bnpi-pats.tech"
  echo "  CLI: ssh project-truth-bnpi-pats"
  echo "  Access host: ssh.bnpi-pats.tech"
  echo "  origin: $(cloudflare_ssh_origin "$ip_addr")"
  echo "  full: ssh -i %USERPROFILE%\\.ssh\\node-health-appliance_ed25519 \\"
  echo "        -o ProxyCommand=\"cloudflared access ssh --hostname %h\" \\"
  echo "        infra@ssh.bnpi-pats.tech"
  echo "  LAN fallback: ssh infra@${ip_addr}"
}

emit_cloudflare_tcp_db_instructions() {
  echo "Cloudflare DB TCP"
  echo "  Use named Cloudflare Tunnel + Access, not trycloudflare HTTP quick tunnels."
  echo "  Client commands after Access/DNS are configured:"
  echo "    cloudflared access tcp --hostname db.bnpi-pats.tech     --url localhost:5432"
  echo "    cloudflared access tcp --hostname dev-db.bnpi-pats.tech --url localhost:5433"
  echo "    cloudflared access tcp --hostname uat-db.bnpi-pats.tech --url localhost:5434"
  echo "  Local URLs after forwarding:"
  echo "    PROD postgresql://postgres:postgres@localhost:5432/bnpi_pats"
  echo "    DEV  postgresql://postgres:postgres@localhost:5433/bnpi_pats"
  echo "    UAT  postgresql://postgres:postgres@localhost:5434/bnpi_pats"
  echo "  Direct db.bnpi-pats.tech:5432 needs WARP private routing or Spectrum/raw TCP."
}

emit_screen_os_sync_line() {
  if [ -r "$sync_state_file" ]; then
    awk -F= '
      $1 == "branch" { branch=$2 }
      $1 == "commit" { commit=$2 }
      END {
        if (commit != "") {
          printf "Ansible pull: %s@%s\n", branch, substr(commit, 1, 12)
        } else {
          print "Ansible pull: state file present, commit missing"
        }
      }
    ' "$sync_state_file"
  else
    echo "Ansible pull: waiting for first sudo project-truth-ansible-pull"
  fi
}

write_summary() {
  local ip_addr="$1"
  local generated_at
  generated_at="$(date '+%Y-%m-%d %H:%M:%S %Z')"

  mkdir -p "$state_dir"

  {
    echo "Project Truth BNPI PATS appliance"
    echo "Host: $(hostname)"
    echo "Generated: ${generated_at}"
    echo
    if [ -n "$ip_addr" ]; then
      echo "LAN IP"
      echo "  ${ip_addr}"
      echo
      echo "Open these from your host browser"
      emit_lan_dns_rows "$ip_addr"
      echo
      emit_bnpi_pats_rows "$ip_addr"
      echo
      emit_named_cloudflare_rows "$ip_addr"
      echo
      emit_cloudflare_ssh_rows "$ip_addr"
      echo
      echo "Postgres LAN URLs"
      emit_database_lan_rows "$ip_addr"
      echo
      echo "Observability"
      emit_observability_rows "$ip_addr"
      echo
      emit_os_sync_summary
      echo
      echo "Experimental TryCloudflare"
      echo "  disabled by default; use named tunnel for public access"
      echo "  manual legacy proof only: start-trycloudflare-suite -Force"
    else
      echo "LAN IP: NOT DETECTED"
      echo
      echo "The VM has no active non-loopback IPv4 address yet."
      echo "Check that the VM network adapter is bridged/external and cable-connected."
      echo "Repair command after login: project-truth-lan-config"
    fi
    echo
      echo "Useful commands"
      echo "  project-truth-progress --watch"
      echo "  project-truth-bnpi-pats-status"
      echo "  project-truth-db-access"
      echo "  project-truth-lan-config"
    echo "  sudo project-truth-ansible-pull"
    echo "  project-truth-ansible-pull --status"
  } > "$summary_file"
}

emit_trycloudflare_screen() {
  local file="${state_dir}/trycloudflare-public-urls.txt"
  local experimental_env="/etc/project-truth/experimental.env"
  local rows=0
  local host_ip
  local current_public_base=""

  host_ip="$(lan_ip || true)"

  if [ ! -r "$experimental_env" ] ||
    ! grep -Eq '^EXPERIMENTAL_TRY_CLOUDFLARE=true$' "$experimental_env"; then
    echo "TryCloudflare: disabled"
    echo "  Named tunnel is the normal public path."
    echo "  Ignoring stale quick-tunnel files unless explicitly enabled."
    return
  fi

  if [ ! -s "$file" ]; then
    echo "TryCloudflare: disabled"
    echo "  Named tunnel is the normal public path."
    echo "  Manual legacy proof only: start-trycloudflare-suite -Force."
    return
  fi

  echo "Deprecated TryCloudflare demo URLs"
  echo "  Temporary quick tunnels. Not normal public access."
  while IFS='|' read -r _ target local_check public_check public_url _rest; do
    target="$(printf '%s' "$target" | xargs 2>/dev/null || true)"
    local_check="$(printf '%s' "$local_check" | xargs 2>/dev/null || true)"
    public_check="$(printf '%s' "$public_check" | xargs 2>/dev/null || true)"
    public_url="$(printf '%s' "$public_url" | xargs 2>/dev/null || true)"
    local_path="$local_check"
    if [ -n "$host_ip" ]; then
      local_path="${local_check#http://${host_ip}:}"
      if [ "$local_path" = "$local_check" ]; then
        local_path="${local_check#https://${host_ip}:}"
      fi
      if [ "$local_path" != "$local_check" ]; then
        local_path=":${local_path}"
      fi
    fi
    public_path="$public_check"
    if [ -n "$public_url" ] && [ "$public_path" != "${public_path#"$public_url"}" ]; then
      public_path="${public_path#"$public_url"}"
    fi
    if [ -z "$public_path" ]; then
      public_path="/"
    fi

    case "$target" in
      ""|"Target"|---*|prod-db|dev-db|uat-db) continue ;;
    esac
    case "$public_url" in
      https://*.trycloudflare.com*)
        rows=$((rows + 1))
        if [ "$public_url" != "$current_public_base" ]; then
          current_public_base="$public_url"
          printf '  base   %s\n' "$current_public_base"
        fi
        printf '  %-10s local %-26s public %s\n' "$target" "$local_path" "$public_path"
        ;;
    esac
  done < "$file"

  if [ "$rows" -eq 0 ]; then
    echo "  No public URL rows found in ${file}."
  fi
}

emit_database_screen() {
  local file="${state_dir}/trycloudflare-public-urls.txt"
  local rows=0
  local ip_addr

  ip_addr="$(lan_ip || true)"

  echo "Database facts"
  if [ -n "$ip_addr" ]; then
    echo "  LAN URLs"
    emit_database_lan_rows "$ip_addr"
  else
    echo "  LAN IP: NOT DETECTED"
  fi
  echo
  emit_cloudflare_tcp_db_instructions
  echo
  echo "  trycloudflare HTTP quick tunnels: disabled for raw DB."
  if [ ! -s "$file" ]; then
    echo "  DB topology file: not present."
    return
  fi

  while IFS='|' read -r _ name internal_service host_port url_shape _rest; do
    name="$(printf '%s' "$name" | xargs 2>/dev/null || true)"
    internal_service="$(printf '%s' "$internal_service" | xargs 2>/dev/null || true)"
    host_port="$(printf '%s' "$host_port" | xargs 2>/dev/null || true)"
    url_shape="$(printf '%s' "$url_shape" | xargs 2>/dev/null || true)"

    case "$name" in
      ""|"Name"|---*) continue ;;
    esac
    case "$url_shape" in
      postgresql://*)
        rows=$((rows + 1))
        printf '  %s\n' "$name"
        printf '    host %s\n' "$host_port"
        printf '    svc  %s\n' "$internal_service"
        printf '    url  %s\n' "$url_shape"
        ;;
    esac
  done < "$file"

  if [ "$rows" -eq 0 ]; then
    echo "  No redacted DB rows found in ${file}."
  fi
}

emit_screen_summary() {
  local ip_addr="$1"
  local page="${2:-overview}"
  local generated_at
  generated_at="$(date '+%Y-%m-%d %H:%M:%S %Z')"

  if [ "${PROJECT_TRUTH_SCREEN_NO_CLEAR:-}" != "1" ]; then
    printf '\033c\033[3J\033[H\033[2J'
  fi
  echo "PROJECT TRUTH CLIENT SUMMARY"
  echo "Host: $(hostname) | Generated: ${generated_at}"

  if [ -z "$ip_addr" ]; then
    echo "LAN IP: NOT DETECTED"
    echo "Repair: project-truth-lan-config"
    return
  fi

  echo "LAN IP: ${ip_addr}"

  if [ "$page" = "overview" ]; then
    echo
    echo "Login: infra / infra  (password is hidden while typing)"
    echo "If prompt ends with $, you are already logged in."
    echo
    echo "SSH"
    echo "  LAN target: ${ip_addr}:22"
    echo "  OpenSSH: ssh infra@${ip_addr}"
    echo "  Key: ~/.ssh/node-health-appliance_ed25519"
    echo "  Password: infra"
  fi

  if [ "$page" = "tunnels" ]; then
    echo
    emit_named_cloudflare_rows "$ip_addr"
    echo
    emit_cloudflare_ssh_rows "$ip_addr"
    echo
    echo "If public URL fails: run host repair from Windows."
    echo
    echo "Deprecated fallback"
    emit_trycloudflare_screen
    echo
    echo "Next: project-truth-lan-summary --screen-db"
    return
  fi

  if [ "$page" = "db" ]; then
    echo
    emit_database_screen
    echo
    echo "Run: project-truth-db-access"
    return
  fi

  echo
  echo "BNPI PATS"
  emit_bnpi_pats_rows "$ip_addr"
  echo "Cloudflare"
  echo "  public: https://bnpi-pats.tech/auth/login"
  echo "  api: https://api.bnpi-pats.tech/health"
  echo "  dev: https://dev.bnpi-pats.tech/auth/login"
  echo "  uat: https://uat.bnpi-pats.tech/auth/login"
  echo "  grafana: https://grafana.bnpi-pats.tech/api/health"
  echo "  origin: $(cloudflare_http_origin "$ip_addr")"
  echo "  mode: $(cloudflare_tunnel_mode) tunnel bnpi-pats"
  echo "  ssh: ssh project-truth-bnpi-pats"
  echo "Postgres"
  emit_database_lan_rows "$ip_addr"
  echo "Observability"
  emit_observability_rows "$ip_addr"
  emit_screen_os_sync_line
  echo "More: project-truth-lan-summary --screen-tunnels | --screen-db"
  echo "Commands: project-truth-progress --watch"
  echo "        project-truth-bnpi-pats-status"
  echo "        project-truth-db-access"
  echo "        sudo project-truth-ansible-pull"
}

ip_addr="$(lan_ip || true)"
write_summary "$ip_addr"

if [ "$screen" = "true" ]; then
  printf '\033c\033[3J\033[H\033[2J'
  PROJECT_TRUTH_SCREEN_NO_CLEAR=1 emit_screen_summary "$ip_addr" "$screen_page"
  exit 0
fi

{
  echo "Project Truth BNPI PATS appliance"
  if [ -n "$ip_addr" ]; then
    echo "LAN IP: ${ip_addr}"
    echo "DEV:  https://dev.bnpi-pats.lan/auth/login"
    echo "DEV:  https://dev-api.bnpi-pats.lan/health"
    echo "UAT:  https://uat.bnpi-pats.lan/auth/login"
    echo "PROD: https://bnpi-pats.lan/auth/login"
    echo "Grafana: https://grafana.bnpi-pats.lan"
    echo "LAN DNS: ${ip_addr}  zone: bnpi-pats.lan"
    echo "Port fallback DEV: http://${ip_addr}:3100/auth/login"
    echo "Cloudflare: https://dev.bnpi-pats.tech/auth/login"
    echo "Tunnel: $(cloudflare_tunnel_mode) bnpi-pats"
    echo "SSH: ssh infra@${ip_addr}  |  ssh project-truth-bnpi-pats"
    echo "Summary: project-truth-lan-summary --screen-overview"
    if [ -r "$sync_state_file" ]; then
      commit="$(awk -F= '$1 == "commit" { print substr($2, 1, 12) }' "$sync_state_file")"
      branch="$(awk -F= '$1 == "branch" { print $2 }' "$sync_state_file")"
      if [ -n "$commit" ]; then
        echo "Ansible pull: ${branch}@${commit}"
      fi
    fi
  else
    echo "LAN IP: NOT DETECTED"
  fi
  echo "Run after login: project-truth-lan-summary"
  echo "OS pull: sudo project-truth-ansible-pull"
} > "$motd_file"

{
  echo "Project Truth BNPI PATS appliance"
  if [ -n "$ip_addr" ]; then
    echo "LAN IP: ${ip_addr}"
  else
    echo "LAN IP: NOT DETECTED"
  fi
  echo "LAN clean URLs (DNS ${ip_addr:-?} / hosts):"
  echo "  DEV  https://dev.bnpi-pats.lan/auth/login"
  echo "  DEV  https://dev-api.bnpi-pats.lan/health"
  echo "  UAT  https://uat.bnpi-pats.lan/auth/login"
  echo "  PROD https://bnpi-pats.lan/auth/login"
  echo "  Grafana https://grafana.bnpi-pats.lan"
  echo "Cloudflare (public):"
  echo "  https://dev.bnpi-pats.tech/auth/login"
  echo "  https://dev-api.bnpi-pats.tech/health"
  echo "  https://bnpi-pats.tech/auth/login"
  echo "SSH:"
  if [ -n "$ip_addr" ]; then
    echo "  OpenSSH: ssh infra@${ip_addr}"
    echo "  port: 22"
    echo "  key: ~/.ssh/node-health-appliance_ed25519"
  else
    echo "  waiting for LAN IP"
  fi
  echo "Tunnel:"
  echo "  $(cloudflare_tunnel_mode) bnpi-pats"
  echo "Cloudflare SSH:"
  echo "  browser: https://ssh.bnpi-pats.tech"
  echo "  CLI: ssh project-truth-bnpi-pats"
  echo "  host: ssh.bnpi-pats.tech"
  echo "  LAN fallback: ssh infra@${ip_addr:-<lan-ip>}"
  echo
  echo "Console login:"
  echo "  username: infra"
  echo "  password: infra (hidden while typing)"
  echo "Only type infra when the line ends with login:"
  echo "If the prompt ends with $, you are already logged in."
  echo "After login run:"
  echo "  project-truth-lan-summary --screen-overview"
  echo "  project-truth-lan-summary --screen-tunnels"
  echo "  project-truth-db-access"
  echo "  sudo project-truth-ansible-pull"
  echo
} > "$issue_file"

{
  echo "----- $(date '+%Y-%m-%d %H:%M:%S %Z') -----"
  cat "$summary_file"
  echo
} >> "$log_file"

if [ "$quiet" != "true" ]; then
  PROJECT_TRUTH_SCREEN_NO_CLEAR=1 emit_screen_summary "$ip_addr" "overview"
  echo
  echo "Full saved summary: ${summary_file}"
fi

if [ "${PROJECT_TRUTH_SKIP_TTY1_WRITE:-}" != "1" ] && [ -w /dev/tty1 ]; then
  tty_user="$(who 2>/dev/null | awk '$2 == "tty1" { print $1; exit }')"
  {
    printf '\033c'
    if [ -n "$tty_user" ]; then
    echo "Project Truth BNPI PATS appliance"
    echo "LAN IP: ${ip_addr:-NOT DETECTED}"
    echo "Cloudflare: https://bnpi-pats.tech/auth/login"
    echo "Cloudflare SSH: ssh project-truth-bnpi-pats"
    echo
      echo "Console is already logged in as ${tty_user}."
      echo "Do not type infra at this shell prompt."
      echo
      echo "Run:"
      echo "  project-truth-lan-summary --screen-overview"
      echo "  project-truth-lan-summary --screen-tunnels"
      echo "  project-truth-db-access"
      echo "  sudo project-truth-ansible-pull"
      echo
      printf '%s@%s:~$ ' "$tty_user" "$(hostname)"
    else
      cat "$issue_file"
      printf '%s login: ' "$(hostname)"
    fi
  } > /dev/tty1 || true
fi
