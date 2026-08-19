#!/usr/bin/env bash
# Report ansible-pull and per-service image outcomes to GitHub Deployments.
# Always posts success when gh works. Image envs include outcome=rebuilt|not_rebuilt|pull_only.
set -euo pipefail

repo="${PROJECT_TRUTH_GITHUB_REPO:-hrisworkforcesystem-coder/bandai-infra}"
state_file="${PROJECT_TRUTH_ANSIBLE_PULL_STATE:-/var/lib/project-truth/ansible-pull-state}"
image_state_file="${PROJECT_TRUTH_K8S_IMAGE_STATE:-/var/lib/project-truth/k8s-runtime-image-state}"
report_file="${PROJECT_TRUTH_GITHUB_DEPLOY_REPORT:-/var/lib/project-truth/github-deploy-report}"

run_gh() {
  if [ "$(id -u)" -eq 0 ] && id infra >/dev/null 2>&1; then
    sudo -u infra -H gh "$@"
  else
    gh "$@"
  fi
}

post_json() {
  python3 -c 'import json,sys; print(json.dumps(json.loads(sys.argv[1])))' "$1"
}

report_env() {
  local environment="$1"
  local env_url="$2"
  local description="$3"
  local ids
  local deploy_id
  local ok_local=0
  local create_body
  local status_body

  ids="$(run_gh api "repos/${repo}/deployments?sha=${commit}&environment=${environment}&per_page=10" --jq '.[].id' 2>/dev/null || true)"
  if [ -z "$ids" ]; then
    create_body="$(post_json "{\"ref\":\"${commit}\",\"environment\":\"${environment}\",\"auto_merge\":false,\"required_contexts\":[],\"description\":\"${description}\"}")"
    ids="$(printf '%s\n' "$create_body" | run_gh api "repos/${repo}/deployments" --input - --jq .id)"
  fi
  if [ -z "$ids" ]; then
    echo "could not create or find GitHub deployment for ${environment} ${commit}" >&2
    return 0
  fi

  status_body="$(post_json "{\"state\":\"success\",\"environment\":\"${environment}\",\"description\":\"${description}\",\"environment_url\":\"${env_url}\"}")"
  for deploy_id in $ids; do
    [ -z "$deploy_id" ] && continue
    if printf '%s\n' "$status_body" | run_gh api "repos/${repo}/deployments/${deploy_id}/statuses" --input - >/dev/null; then
      ok_local=1
    fi
  done

  echo "${environment}: reported=$( [ "$ok_local" -eq 1 ] && echo yes || echo no ) ids=${ids}"
  if [ "$ok_local" -eq 1 ]; then
    ok=1
  fi
}

if ! command -v gh >/dev/null 2>&1; then
  echo "gh not installed; skip GitHub deploy report" >&2
  exit 0
fi

if [ ! -r "$state_file" ]; then
  echo "ansible-pull state missing; skip GitHub deploy report" >&2
  exit 0
fi

commit="$(awk -F= '/^commit=/{print $2; exit}' "$state_file" | tr -d '[:space:]')"
synced_at="$(awk -F= '/^synced_at=/{print $2; exit}' "$state_file" | tr -d '[:space:]')"
if [ -z "$commit" ]; then
  echo "ansible-pull commit empty; skip GitHub deploy report" >&2
  exit 0
fi

if ! run_gh auth status >/dev/null 2>&1; then
  echo "gh not logged in; skip GitHub deploy report" >&2
  exit 0
fi

image_services=""
if [ -r "$image_state_file" ]; then
  image_commit="$(awk -F= '/^commit=/{print $2; exit}' "$image_state_file" | tr -d '[:space:]')"
  image_services="$(awk -F= '/^services=/{print $2; exit}' "$image_state_file")"
  if [ -n "$image_commit" ] && [ "$image_commit" != "$commit" ]; then
    echo "image-state commit ${image_commit} != ansible-pull ${commit}; reporting pull only" >&2
    image_services=""
  fi
fi

service_outcome() {
  local needle="$1"
  if [ -z "$image_services" ]; then
    printf '%s' "pull_only"
  elif [ "$image_services" = "none" ]; then
    printf '%s' "not_rebuilt"
  elif printf '%s' " ${image_services} " | grep -Fq " ${needle}"; then
    printf '%s' "rebuilt"
  else
    printf '%s' "not_rebuilt"
  fi
}

service_note() {
  local needle="$1"
  local outcome
  outcome="$(service_outcome "$needle")"
  case "$outcome" in
    rebuilt) printf '%s' "outcome=rebuilt images=${image_services}" ;;
    pull_only) printf '%s' "outcome=pull_only image-state missing or SHA mismatch" ;;
    *) printf '%s' "outcome=not_rebuilt services=${image_services:-none}" ;;
  esac
}

ok=0
report_env "vm-gitops" "https://dev.bnpi-hris.tech/auth/login" "ansible-pull ${commit} outcome=pulled synced_at=${synced_at:-unknown}"
report_env "hris-api" "https://dev-api.bnpi-hris.tech/health" "hris-api ${commit} $(service_note 'hris-api-local:develop')"
report_env "hris-app" "https://dev.bnpi-hris.tech/auth/login" "hris-app ${commit} $(service_note 'hris-app-local:develop')"
report_env "hris-emp-app" "https://dev-emp.bnpi-hris.tech/auth/login" "hris-emp-app ${commit} $(service_note 'hris-emp-app-local:develop')"
report_env "callback-outbox" "https://dev-api.bnpi-hris.tech/health" "callback-outbox ${commit} $(service_note 'hris-callback-outbox:develop')"

{
  echo "repo=${repo}"
  echo "commit=${commit}"
  echo "synced_at=${synced_at}"
  echo "image_services=${image_services}"
  echo "reported=$( [ "$ok" -eq 1 ] && echo yes || echo no )"
  echo "reported_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} | tee "$report_file" >/dev/null

if [ "$ok" -eq 1 ]; then
  echo "GitHub deploy report success for ${commit}"
else
  echo "GitHub deploy report did not post success for ${commit}" >&2
fi
exit 0
