#!/usr/bin/env bash
set -euo pipefail

repo_url="${PROJECT_TRUTH_REPO_URL:-https://github.com/bnpimanufacturingsolution/bandai-infra-bnpi-pats.git}"
branch="${PROJECT_TRUTH_BRANCH:-develop}"
checkout_root="${PROJECT_TRUTH_ANSIBLE_PULL_ROOT:-/var/lib/project-truth/ansible-pull}"
state_dir="/var/lib/project-truth"
lock_file="/run/project-truth-ansible-pull.lock"
playbook="${PROJECT_TRUTH_ANSIBLE_PLAYBOOK:-ansible/project-truth-pull.yml}"
git_askpass=""

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

ensure_dependencies() {
  local packages=(ca-certificates curl git rsync util-linux ansible)
  local missing=()

  for command_name in curl git rsync flock ansible-pull; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
      missing+=("$command_name")
    fi
  done

  if [ "${#missing[@]}" -eq 0 ]; then
    return 0
  fi

  if command -v apt-get >/dev/null 2>&1; then
    wait_for_apt_locks
    as_root apt-get update
    as_root apt-get install -y "${packages[@]}"
    return 0
  fi

  echo "Missing dependencies: ${missing[*]}" >&2
  return 1
}

wait_for_apt_locks() {
  local attempt
  local locks=(
    /var/lib/apt/lists/lock
    /var/lib/dpkg/lock
    /var/lib/dpkg/lock-frontend
    /var/cache/apt/archives/lock
  )

  for attempt in $(seq 1 60); do
    local locked=0
    for lock_path in "${locks[@]}"; do
      if command -v fuser >/dev/null 2>&1 &&
        as_root fuser "$lock_path" >/dev/null 2>&1; then
        locked=1
        break
      fi
    done

    if [ "$locked" -eq 0 ]; then
      return 0
    fi

    echo "Waiting for apt/dpkg lock to clear (${attempt}/60)..." >&2
    sleep 5
  done

  echo "Timed out waiting for apt/dpkg locks." >&2
  return 1
}

repair_network_for_git() {
  local host="${PROJECT_TRUTH_GIT_HOST:-github.com}"
  local attempt

  for attempt in 1 2 3; do
    if getent hosts "$host" >/dev/null 2>&1 &&
      curl -fsSI --max-time 8 "https://${host}" >/dev/null 2>&1; then
      return 0
    fi

    echo "Git network check failed for ${host}; repair attempt ${attempt}/3" >&2
    if command -v resolvectl >/dev/null 2>&1; then
      as_root resolvectl flush-caches >/dev/null 2>&1 || true
    fi
    if command -v systemctl >/dev/null 2>&1; then
      as_root systemctl restart systemd-resolved.service >/dev/null 2>&1 || true
    fi
    if command -v project-truth-lan-config >/dev/null 2>&1; then
      PROJECT_TRUTH_SKIP_TTY1_WRITE=1 as_root project-truth-lan-config >/dev/null 2>&1 || true
    fi
    sleep 5
  done

  getent hosts "$host" >/dev/null 2>&1 &&
    curl -fsSI --max-time 8 "https://${host}" >/dev/null 2>&1
}

cleanup_git_credentials() {
  if [ -n "$git_askpass" ]; then
    as_root rm -f "$git_askpass" >/dev/null 2>&1 || true
  fi
}

prepare_git_credentials() {
  local git_username=""
  local git_password=""
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
  git_askpass="${state_dir}/ansible-pull-git-askpass.$$"
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

show_status() {
  echo "Project Truth ansible-pull"
  if [ -r "${state_dir}/ansible-pull-state" ]; then
    sed 's/^/  /' "${state_dir}/ansible-pull-state"
  else
    echo "  state: never synced by ansible-pull"
  fi

  if command -v systemctl >/dev/null 2>&1; then
    echo
    systemctl --no-pager --full status project-truth-ansible-pull.timer 2>/dev/null || true
  fi

  if command -v kubectl >/dev/null 2>&1; then
    echo
    as_root kubectl get applications -n argocd -o wide 2>/dev/null || true
  fi
}

run_ansible_pull() {
  as_root install -d -m 0755 "$state_dir" "$checkout_root"
  prepare_git_credentials
  repair_network_for_git

  local env_args=(
    PROJECT_TRUTH_REPO_URL="$repo_url"
    PROJECT_TRUTH_BRANCH="$branch"
    ANSIBLE_FORCE_COLOR=false
    GIT_TERMINAL_PROMPT=0
  )
  if [ -n "$git_askpass" ]; then
    env_args+=(GIT_ASKPASS="$git_askpass")
  fi

  as_root env "${env_args[@]}" ansible-pull \
    -U "$repo_url" \
    -C "$branch" \
    -d "$checkout_root" \
    -i localhost, \
    -l localhost \
    --clean \
    "$playbook"
}

# ansible-pull recurses submodules. A private submodule the appliance token
# often cannot read can still abort the pull. If the main checkout is already on
# develop, still apply the playbook so /opt and units stay in sync.
apply_from_checkout() {
  if ! git -C "$checkout_root" rev-parse HEAD >/dev/null 2>&1; then
    echo "ansible-pull checkout is missing; cannot apply locally" >&2
    return 1
  fi
  echo "Applying ${playbook} from existing checkout $(git -C "$checkout_root" rev-parse --short HEAD)" >&2
  as_root ansible-playbook \
    -i localhost, \
    -c local \
    -l localhost \
    "${checkout_root}/${playbook}"
}

main() {
  case "${1:-}" in
    --status|status)
      show_status
      return 0
      ;;
  esac

  ensure_dependencies
  trap cleanup_git_credentials EXIT
  exec 9>"$lock_file"
  if ! flock -n 9; then
    echo "Project Truth ansible-pull already running."
    exit 0
  fi

  if ! run_ansible_pull; then
    echo "ansible-pull failed; trying playbook from existing checkout" >&2
    apply_from_checkout
  fi
}

main "$@"
