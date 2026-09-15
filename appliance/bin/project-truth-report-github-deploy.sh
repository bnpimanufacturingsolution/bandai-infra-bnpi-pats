#!/usr/bin/env bash
# Report ansible-pull and per-service image outcomes to GitHub Deployments.
# Always posts success when gh works. Image envs include outcome=rebuilt|not_rebuilt|pull_only.
set -euo pipefail

repo="${PROJECT_TRUTH_GITHUB_REPO:-bnpimanufacturingsolution/bandai-infra-bnpi-pats}"
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
  # GitHub deployment-status descriptions are capped at 140 chars (over-limit
  # posts are rejected with 422). Truncate so image-env notes that embed the
  # full rebuilt/not_rebuilt service list can never be silently skipped.
  local description="${3:0:140}"
  local state="${4:-success}"
  local ids
  local deploy_id
  local ok_local=0
  local create_body
  local status_body

  case "$state" in
    success|failure|error|inactive) ;;
    *) state="success" ;;
  esac

  ids="$(run_gh api "repos/${repo}/deployments?sha=${commit}&environment=${environment}&per_page=10" --jq '.[].id' 2>/dev/null || true)"
  if [ -z "$ids" ]; then
    create_body="$(post_json "{\"ref\":\"${commit}\",\"environment\":\"${environment}\",\"auto_merge\":false,\"required_contexts\":[],\"description\":\"${description}\"}")"
    ids="$(printf '%s\n' "$create_body" | run_gh api "repos/${repo}/deployments" --input - --jq .id)"
  fi
  if [ -z "$ids" ]; then
    echo "could not create or find GitHub deployment for ${environment} ${commit}" >&2
    return 0
  fi

  status_body="$(post_json "{\"state\":\"${state}\",\"environment\":\"${environment}\",\"description\":\"${description}\",\"environment_url\":\"${env_url}\"}")"
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
report_env "vm-gitops" "https://dev.bnpi-pats.tech/auth/login" "ansible-pull ${commit} outcome=pulled synced_at=${synced_at:-unknown}"
report_env "bnpi-pats-api" "https://dev-api.bnpi-pats.tech/health" "bnpi-pats-api ${commit} $(service_note 'bnpi-pats-api-local:develop')"
report_env "bnpi-pats-app" "https://dev.bnpi-pats.tech/auth/login" "bnpi-pats-app ${commit} $(service_note 'bnpi-pats-app-local:develop')"

probe_http() {
  local url="$1"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 "$url" || true)"
  if [ -z "$code" ]; then
    code="000"
  fi
  printf '%s' "$code"
}

report_onprem_port() {
  local environment="$1"
  local lan_url="$2"
  local loop_url="$3"
  local code
  local state="failure"
  code="$(probe_http "$loop_url")"
  case "$code" in
    200|301|302|303|307|308) state="success" ;;
  esac
  report_env "$environment" "$lan_url" "onprem ${environment} ${commit} outcome=${state} http=${code} bind=${loop_url}" "$state"
}

# On-prem instance ports on the VM (not Cloudflare). GitHub runners cannot reach 10.184.37.19.
report_onprem_port "onprem-prod-api" "http://10.184.37.19:3001/health" "http://127.0.0.1:3001/health"
report_onprem_port "onprem-prod-app" "http://10.184.37.19:3000/auth/login" "http://127.0.0.1:3000/auth/login"
report_onprem_port "onprem-dev-api" "http://10.184.37.19:3101/health" "http://127.0.0.1:3101/health"
report_onprem_port "onprem-dev-app" "http://10.184.37.19:3100/auth/login" "http://127.0.0.1:3100/auth/login"
report_onprem_port "onprem-uat-api" "http://10.184.37.19:3201/health" "http://127.0.0.1:3201/health"
report_onprem_port "onprem-uat-app" "http://10.184.37.19:3200/auth/login" "http://127.0.0.1:3200/auth/login"

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
