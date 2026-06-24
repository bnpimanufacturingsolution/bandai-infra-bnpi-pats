#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
install_root="${PROJECT_TRUTH_ROOT:-/opt/project-truth}"
data_root="${OBSERVABILITY_DATA_ROOT:-/srv/hris/observability}"
backup_root="${BACKUP_DIR:-/srv/hris/backups}"

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    echo "Docker Compose is not installed" >&2
    exit 1
  fi
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    return 0
  fi

  if command -v apt-get >/dev/null 2>&1; then
    as_root apt-get update
    as_root apt-get install -y ca-certificates curl git gnupg lsb-release rsync docker.io docker-compose-v2
  else
    echo "Unsupported package manager. Install Docker and Docker Compose, then rerun this script." >&2
    exit 1
  fi

  as_root systemctl enable docker
  as_root systemctl start docker
}

ensure_cloudflared() {
  if command -v cloudflared >/dev/null 2>&1; then
    return 0
  fi

  local arch package_url tmp_deb
  arch="$(dpkg --print-architecture 2>/dev/null || true)"
  case "$arch" in
    amd64)
      package_url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb"
      ;;
    arm64)
      package_url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb"
      ;;
    *)
      echo "cloudflared automatic install skipped for architecture: ${arch:-unknown}" >&2
      return 0
      ;;
  esac

  tmp_deb="/tmp/cloudflared-${arch}.deb"
  if curl -fsSL --retry 3 --retry-delay 5 "$package_url" -o "$tmp_deb"; then
    as_root dpkg -i "$tmp_deb" >/dev/null 2>&1 || as_root apt-get install -f -y
    as_root rm -f "$tmp_deb" >/dev/null 2>&1 || true
  else
    echo "cloudflared download failed; TryCloudflare service can retry after bootstrap" >&2
  fi
}

enable_trycloudflare() {
  as_root install -d -m 0755 /etc/project-truth
  printf 'EXPERIMENTAL_TRY_CLOUDFLARE=true\n' |
    as_root tee /etc/project-truth/experimental.env >/dev/null
  as_root chmod 0644 /etc/project-truth/experimental.env
}

sync_repo_to_install_root() {
  if [ "$repo_root" = "$install_root" ]; then
    return 0
  fi

  as_root mkdir -p "$install_root"
  if command -v rsync >/dev/null 2>&1; then
    as_root rsync -a --delete \
      --exclude .git \
      --exclude node_modules \
      --exclude "*/node_modules" \
      "${repo_root}/" "${install_root}/"
  else
    echo "rsync is recommended for syncing to ${install_root}; falling back to cp" >&2
    as_root cp -a "${repo_root}/." "$install_root/"
  fi
}

install_commands_and_services() {
  as_root install -m 0755 "${install_root}/appliance/bin/project-truth-hris-start.sh" /usr/local/bin/project-truth-hris-start
  as_root install -m 0755 "${install_root}/appliance/bin/project-truth-hris-env-start.sh" /usr/local/bin/project-truth-hris-env-start
  as_root install -m 0755 "${install_root}/appliance/bin/project-truth-hris-seed.sh" /usr/local/bin/project-truth-hris-seed
  as_root install -m 0755 "${install_root}/appliance/bin/project-truth-hris-env-seed.sh" /usr/local/bin/project-truth-hris-env-seed
  as_root install -m 0755 "${install_root}/appliance/bin/project-truth-hris-status.sh" /usr/local/bin/project-truth-hris-status
  as_root install -m 0755 "${install_root}/appliance/bin/project-truth-hris-observability-start.sh" /usr/local/bin/project-truth-hris-observability-start
  as_root install -m 0755 "${install_root}/appliance/bin/project-truth-lan-dhcp.sh" /usr/local/bin/project-truth-lan-dhcp
  as_root install -m 0755 "${install_root}/appliance/bin/project-truth-lan-summary.sh" /usr/local/bin/project-truth-lan-summary
  as_root install -m 0755 "${install_root}/appliance/bin/project-truth-clean-console.sh" /usr/local/bin/project-truth-clean-console
  as_root install -m 0755 "${install_root}/appliance/bin/project-truth-trycloudflare-start.sh" /usr/local/bin/project-truth-trycloudflare-start
  as_root install -m 0755 "${install_root}/appliance/bin/project-truth-os-sync.sh" /usr/local/bin/project-truth-os-sync

  as_root install -m 0644 "${install_root}/appliance/systemd/project-truth-hris.service" /etc/systemd/system/project-truth-hris.service
  as_root install -m 0644 "${install_root}/appliance/systemd/project-truth-lan-summary.service" /etc/systemd/system/project-truth-lan-summary.service
  as_root install -m 0644 "${install_root}/appliance/systemd/project-truth-clean-console.service" /etc/systemd/system/project-truth-clean-console.service
  as_root install -m 0644 "${install_root}/appliance/systemd/project-truth-trycloudflare.service" /etc/systemd/system/project-truth-trycloudflare.service
  as_root install -m 0644 "${install_root}/appliance/systemd/project-truth-os-sync.service" /etc/systemd/system/project-truth-os-sync.service
  as_root install -m 0644 "${install_root}/appliance/systemd/project-truth-os-sync.timer" /etc/systemd/system/project-truth-os-sync.timer
  as_root install -m 0644 "${install_root}/appliance/profile.d/project-truth-hris-help.sh" /etc/profile.d/project-truth-hris-help.sh
  as_root chmod 0644 /etc/profile.d/project-truth-hris-help.sh
  as_root systemctl daemon-reload
  as_root systemctl enable project-truth-hris.service
  as_root systemctl enable project-truth-lan-summary.service
  as_root systemctl enable project-truth-clean-console.service
  as_root systemctl enable project-truth-trycloudflare.service
  as_root systemctl enable project-truth-os-sync.timer
}

prepare_env_files() {
  if [ ! -f "${install_root}/hris-api/infrastructure/onprem/observability/.env" ]; then
    as_root cp \
      "${install_root}/hris-api/infrastructure/onprem/observability/.env.example" \
      "${install_root}/hris-api/infrastructure/onprem/observability/.env"
  fi

  if [ ! -f "${install_root}/hris-api/infrastructure/onprem/observability/backup/.env" ]; then
    as_root cp \
      "${install_root}/hris-api/infrastructure/onprem/observability/backup/.env.example" \
      "${install_root}/hris-api/infrastructure/onprem/observability/backup/.env"
  fi
}

prepare_persistent_dirs() {
  as_root mkdir -p \
    "${backup_root}" \
    "${data_root}/grafana" \
    "${data_root}/prometheus" \
    "${data_root}/loki" \
    "${data_root}/tempo" \
    "${data_root}/alertmanager" \
    "${data_root}/collector" \
    "${data_root}/backups"
}

start_stacks() {
  cd "${install_root}/hris-api/infrastructure/onprem/observability"
  compose up -d

  cd "${install_root}/appliance"
  compose build
  compose up -d postgres
  compose up -d --no-deps hris-api
  compose up -d --no-deps hris-app
}

verify_local_endpoints() {
  echo "Waiting for local services..."
  for url in \
    "http://127.0.0.1:3001/health" \
    "http://127.0.0.1:53000/api/health" \
    "http://127.0.0.1:9091/-/ready" \
    "http://127.0.0.1:3110/ready" \
    "http://127.0.0.1:3200/ready" \
    "http://127.0.0.1:8889/metrics"; do
    for attempt in $(seq 1 60); do
      if curl -fsS "$url" >/dev/null; then
        echo "OK $url"
        break
      fi
      if [ "$attempt" -eq 60 ]; then
        echo "FAILED $url" >&2
        return 1
      fi
      sleep 5
    done
  done
}

start_trycloudflare() {
  as_root systemctl start --no-block project-truth-trycloudflare.service >/dev/null 2>&1 || true
}

install_docker
ensure_cloudflared
enable_trycloudflare
sync_repo_to_install_root
prepare_persistent_dirs
prepare_env_files
install_commands_and_services
start_stacks
verify_local_endpoints
start_trycloudflare

echo "On-prem VM bootstrap complete."
project-truth-lan-summary || true
