#!/usr/bin/env bash
# Report ansible-pull success to GitHub Deployments so Actions can show
# deploying vs deployed without LAN SSH.
set -euo pipefail

repo="${PROJECT_TRUTH_GITHUB_REPO:-hrisworkforcesystem-coder/bandai-infra}"
environment="${PROJECT_TRUTH_GITHUB_DEPLOY_ENV:-vm-gitops}"
state_file="${PROJECT_TRUTH_ANSIBLE_PULL_STATE:-/var/lib/project-truth/ansible-pull-state}"
report_file="${PROJECT_TRUTH_GITHUB_DEPLOY_REPORT:-/var/lib/project-truth/github-deploy-report}"
dev_url="${PROJECT_TRUTH_DEV_APP_URL:-https://dev.bnpi-hris.tech/auth/login}"

run_gh() {
  if [ "$(id -u)" -eq 0 ] && id infra >/dev/null 2>&1; then
    sudo -u infra -H gh "$@"
  else
    gh "$@"
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

ids="$(run_gh api "repos/${repo}/deployments?sha=${commit}&environment=${environment}&per_page=10" --jq '.[].id' 2>/dev/null || true)"
if [ -z "$ids" ]; then
  ids="$(
    printf '%s\n' "{\"ref\":\"${commit}\",\"environment\":\"${environment}\",\"auto_merge\":false,\"required_contexts\":[],\"description\":\"ansible-pull ${commit}\"}" |
      run_gh api "repos/${repo}/deployments" --input - --jq .id
  )"
fi

if [ -z "$ids" ]; then
  echo "could not create or find GitHub deployment for ${commit}" >&2
  exit 0
fi

description="ansible-pull ${commit} synced_at=${synced_at:-unknown}"
ok=0
while read -r deploy_id; do
  [ -z "$deploy_id" ] && continue
  if run_gh api "repos/${repo}/deployments/${deploy_id}/statuses" --input - <<EOF
{"state":"success","environment":"${environment}","description":"${description}","environment_url":"${dev_url}"}
EOF
  then
    ok=1
  fi
done <<EOF
${ids}
EOF

{
  echo "repo=${repo}"
  echo "environment=${environment}"
  echo "commit=${commit}"
  echo "synced_at=${synced_at}"
  echo "deployment_ids=$(printf '%s' "$ids" | tr '\n' ',')"
  echo "reported=$( [ "$ok" -eq 1 ] && echo yes || echo no )"
  echo "reported_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} | tee "$report_file" >/dev/null

if [ "$ok" -eq 1 ]; then
  echo "GitHub deploy report success for ${commit}"
else
  echo "GitHub deploy report did not post success for ${commit}" >&2
fi
exit 0
