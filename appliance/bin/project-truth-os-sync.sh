#!/usr/bin/env bash
set -euo pipefail

repo_url="${PROJECT_TRUTH_REPO_URL:-https://github.com/hrisworkforcesystem-coder/bandai-infra.git}"
branch="${PROJECT_TRUTH_BRANCH:-develop}"
install_root="${PROJECT_TRUTH_ROOT:-/opt/project-truth}"
source_root="${PROJECT_TRUTH_SOURCE_ROOT:-/var/lib/project-truth/source}"
state_dir="/var/lib/project-truth"
lock_file="/run/project-truth-os-sync.lock"
git_askpass=""
git_username=""
git_password=""

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

ensure_dependencies() {
  local missing=()
  for command_name in git rsync flock curl; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
      missing+=("$command_name")
    fi
  done

  if [ "${#missing[@]}" -eq 0 ]; then
    return 0
  fi

  if command -v apt-get >/dev/null 2>&1; then
    as_root apt-get update
    as_root apt-get install -y git rsync util-linux curl
    return 0
  fi

  echo "Missing dependencies: ${missing[*]}" >&2
  return 1
}

ensure_cloudflared() {
  if command -v cloudflared >/dev/null 2>&1; then
    return 0
  fi

  if ! command -v dpkg >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1; then
    echo "cloudflared unavailable and automatic install prerequisites are missing" >&2
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
    echo "cloudflared download failed; TryCloudflare service will retry on the next OS sync" >&2
  fi
}

enable_trycloudflare() {
  as_root install -d -m 0755 /etc/project-truth
  printf 'EXPERIMENTAL_TRY_CLOUDFLARE=true\n' |
    as_root tee /etc/project-truth/experimental.env >/dev/null
  as_root chmod 0644 /etc/project-truth/experimental.env
}

cleanup_git_credentials() {
  if [ -n "$git_askpass" ]; then
    as_root rm -f "$git_askpass" >/dev/null 2>&1 || true
  fi
}

prepare_git_credentials() {
  local secret_name="${PROJECT_TRUTH_ARGOCD_REPO_CREDS_SECRET:-project-truth-repo-creds}"
  local secret_namespace="${PROJECT_TRUTH_ARGOCD_NAMESPACE:-argocd}"
  local secret_url=""

  if [ -n "${PROJECT_TRUTH_GIT_USERNAME:-}" ] && [ -n "${PROJECT_TRUTH_GIT_PASSWORD:-}" ]; then
    git_username="$PROJECT_TRUTH_GIT_USERNAME"
    git_password="$PROJECT_TRUTH_GIT_PASSWORD"
  elif [ -n "${PROJECT_TRUTH_GITHUB_TOKEN:-}" ]; then
    git_username="x-access-token"
    git_password="$PROJECT_TRUTH_GITHUB_TOKEN"
  elif command -v kubectl >/dev/null 2>&1 &&
    as_root kubectl get secret -n "$secret_namespace" "$secret_name" >/dev/null 2>&1; then
    secret_url="$(
      as_root kubectl get secret -n "$secret_namespace" "$secret_name" \
        -o jsonpath='{.data.url}' 2>/dev/null | base64 -d 2>/dev/null || true
    )"
    if [ -z "$secret_url" ] || [ "${repo_url#"$secret_url"}" != "$repo_url" ]; then
      git_username="$(
        as_root kubectl get secret -n "$secret_namespace" "$secret_name" \
          -o jsonpath='{.data.username}' 2>/dev/null | base64 -d 2>/dev/null || true
      )"
      git_password="$(
        as_root kubectl get secret -n "$secret_namespace" "$secret_name" \
          -o jsonpath='{.data.password}' 2>/dev/null | base64 -d 2>/dev/null || true
      )"
    fi
  fi

  if [ -z "$git_username" ] || [ -z "$git_password" ]; then
    return 0
  fi

  as_root install -d -m 0755 "$state_dir"
  git_askpass="${state_dir}/git-askpass.$$"
  as_root tee "$git_askpass" >/dev/null <<ASKPASS
#!/usr/bin/env bash
case "\$1" in
  *Username*) printf '%s\n' '$git_username' ;;
  *Password*) printf '%s\n' '$git_password' ;;
  *) printf '%s\n' '$git_password' ;;
esac
ASKPASS
  as_root chmod 0700 "$git_askpass"
}

git_remote() {
  if [ -n "$git_askpass" ]; then
    as_root env GIT_ASKPASS="$git_askpass" GIT_TERMINAL_PROMPT=0 "$@"
  else
    as_root env GIT_TERMINAL_PROMPT=0 "$@"
  fi
}

show_status() {
  echo "Project Truth OS sync"
  if [ -r "${state_dir}/os-sync-state" ]; then
    sed 's/^/  /' "${state_dir}/os-sync-state"
  else
    echo "  state: never synced"
  fi

  if command -v systemctl >/dev/null 2>&1; then
    echo
    systemctl --no-pager --full status project-truth-os-sync.timer 2>/dev/null || true
  fi

  if command -v kubectl >/dev/null 2>&1; then
    echo
    as_root kubectl get applications -n argocd -o wide 2>/dev/null || true
  fi
}

sync_source_repo() {
  as_root install -d -m 0755 "$state_dir"
  prepare_git_credentials

  if [ -d "${source_root}/.git" ]; then
    git_remote git -C "$source_root" remote set-url origin "$repo_url"
    git_remote git -C "$source_root" fetch --prune origin "$branch"
  else
    as_root rm -rf "$source_root"
    git_remote git clone --branch "$branch" --single-branch "$repo_url" "$source_root"
    return 0
  fi

  git_remote git -C "$source_root" reset --hard "origin/$branch"
  git_remote git -C "$source_root" clean -fdx
}

sync_install_root() {
  as_root install -d -m 0755 "$install_root"
  as_root rsync -a --delete \
    --exclude .git \
    --exclude .env \
    --exclude ".env.*" \
    --exclude node_modules \
    --exclude "*/node_modules" \
    --exclude logs \
    --exclude .runtime \
    --exclude "hris-api/infrastructure/onprem/observability/.env" \
    --exclude "hris-api/infrastructure/onprem/observability/backup/.env" \
    "${source_root}/" "${install_root}/"
}

install_commands_and_services() {
  local bin_dir="${install_root}/appliance/bin"
  local systemd_dir="${install_root}/appliance/systemd"
  local profile_dir="${install_root}/appliance/profile.d"

  as_root install -m 0755 "${bin_dir}/project-truth-status.sh" /usr/local/bin/project-truth-status
  as_root install -m 0755 "${bin_dir}/project-truth-progress.sh" /usr/local/bin/project-truth-progress
  as_root install -m 0755 "${bin_dir}/project-truth-monitor.sh" /usr/local/bin/project-truth-monitor
  as_root install -m 0755 "${bin_dir}/project-truth-hris-env-start.sh" /usr/local/bin/project-truth-hris-env-start
  as_root install -m 0755 "${bin_dir}/project-truth-hris-env-seed.sh" /usr/local/bin/project-truth-hris-env-seed
  as_root install -m 0755 "${bin_dir}/project-truth-hris-dev-current-restore.sh" /usr/local/bin/project-truth-hris-dev-current-restore
  as_root install -m 0755 "${bin_dir}/project-truth-hris-start.sh" /usr/local/bin/project-truth-hris-start
  as_root install -m 0755 "${bin_dir}/project-truth-hris-status.sh" /usr/local/bin/project-truth-hris-status
  as_root install -m 0755 "${bin_dir}/project-truth-hris-seed.sh" /usr/local/bin/project-truth-hris-seed
  as_root install -m 0755 "${bin_dir}/project-truth-hris-observability-start.sh" /usr/local/bin/project-truth-hris-observability-start
  as_root install -m 0755 "${bin_dir}/project-truth-lan-dhcp.sh" /usr/local/bin/project-truth-lan-dhcp
  as_root install -m 0755 "${bin_dir}/project-truth-lan-summary.sh" /usr/local/bin/project-truth-lan-summary
  as_root install -m 0755 "${bin_dir}/project-truth-clean-console.sh" /usr/local/bin/project-truth-clean-console
  as_root install -m 0755 "${bin_dir}/project-truth-console-session-hook.sh" /usr/local/bin/project-truth-console-session-hook
  as_root install -m 0755 "${bin_dir}/project-truth-trycloudflare-start.sh" /usr/local/bin/project-truth-trycloudflare-start
  as_root install -m 0755 "${bin_dir}/project-truth-os-sync.sh" /usr/local/bin/project-truth-os-sync

  as_root install -m 0644 "${systemd_dir}/project-truth-hris.service" /etc/systemd/system/project-truth-hris.service
  as_root install -m 0644 "${systemd_dir}/project-truth-lan-summary.service" /etc/systemd/system/project-truth-lan-summary.service
  as_root install -m 0644 "${systemd_dir}/project-truth-clean-console.service" /etc/systemd/system/project-truth-clean-console.service
  as_root install -m 0644 "${systemd_dir}/project-truth-trycloudflare.service" /etc/systemd/system/project-truth-trycloudflare.service
  as_root install -m 0644 "${systemd_dir}/project-truth-os-sync.service" /etc/systemd/system/project-truth-os-sync.service
  as_root install -m 0644 "${systemd_dir}/project-truth-os-sync.timer" /etc/systemd/system/project-truth-os-sync.timer
  as_root install -m 0644 "${profile_dir}/project-truth-hris-help.sh" /etc/profile.d/project-truth-hris-help.sh
  as_root chmod 0644 /etc/profile.d/project-truth-hris-help.sh
  configure_console_session_hook

  as_root systemctl daemon-reload
  as_root systemctl enable project-truth-hris.service
  as_root systemctl enable project-truth-lan-summary.service
  as_root systemctl enable project-truth-clean-console.service
  as_root systemctl enable project-truth-trycloudflare.service
  as_root systemctl enable project-truth-os-sync.timer
}

configure_console_session_hook() {
  local pam_login="/etc/pam.d/login"
  local pam_line="session optional pam_exec.so quiet /usr/local/bin/project-truth-console-session-hook"

  if [ -f "$pam_login" ] && ! as_root grep -Fq "$pam_line" "$pam_login"; then
    printf '\n# Refresh Project Truth console LAN summary on tty1 login/logout.\n%s\n' "$pam_line" |
      as_root tee -a "$pam_login" >/dev/null
  fi
}

refresh_argocd() {
  if ! command -v kubectl >/dev/null 2>&1; then
    return 0
  fi

  if [ -d "${install_root}/gitops/argocd/platform" ]; then
    as_root kubectl apply -k "${install_root}/gitops/argocd/platform" || true
  fi
  if [ -d "${install_root}/gitops/argocd/applications" ]; then
    as_root kubectl apply -n argocd -f "${install_root}/gitops/argocd/applications" || true
  fi
  if [ -d "${install_root}/gitops/argocd/runtime-applications" ]; then
    as_root kubectl apply -n argocd -f "${install_root}/gitops/argocd/runtime-applications" || true
  fi

  as_root kubectl get applications -n argocd -o name 2>/dev/null |
    while read -r app_name; do
      as_root kubectl -n argocd annotate "$app_name" argocd.argoproj.io/refresh=hard --overwrite >/dev/null 2>&1 || true
    done
}

record_state() {
  local sha
  sha="$(as_root git -C "$source_root" rev-parse HEAD)"
  printf 'repo_url=%s\nbranch=%s\ncommit=%s\nsynced_at=%s\n' \
    "$repo_url" "$branch" "$sha" "$(date -Iseconds)" |
    as_root tee "${state_dir}/os-sync-state" >/dev/null
  echo "Project Truth OS sync complete: ${branch}@${sha}"
}

refresh_lan_summary() {
  if command -v project-truth-lan-summary >/dev/null 2>&1; then
    as_root project-truth-lan-summary --quiet >/dev/null 2>&1 || true
  fi
}

start_trycloudflare() {
  if command -v systemctl >/dev/null 2>&1; then
    as_root systemctl start --no-block project-truth-trycloudflare.service >/dev/null 2>&1 || true
  fi
}

main() {
  case "${1:-}" in
    --status|status)
      show_status
      return 0
      ;;
  esac

  ensure_dependencies
  ensure_cloudflared
  enable_trycloudflare
  trap cleanup_git_credentials EXIT
  exec 9>"$lock_file"
  if ! flock -n 9; then
    echo "Project Truth OS sync already running."
    exit 0
  fi

  sync_source_repo
  sync_install_root
  install_commands_and_services
  refresh_argocd
  record_state
  start_trycloudflare
  refresh_lan_summary
}

main "$@"
