# AGENT-DEPLOY — sticky-clear hris-api on K3s DEV

**Status:** `FULFILLED`  
**Agent:** DEPLOY  
**When (UTC):** 2026-07-25T07:31:39Z  
**Evidence root:** `.runtime/deploy-sticky-clear-20260725-151955/`

## Finish line

| Check | Result |
|---|---|
| Sticky-clear SHA on `origin/develop` | `94425518116d38524f6d9867fbf7fd8a0fa1db0a` |
| Message | `fix(recovery): sticky admin FP clear + progress5 occupying-owner retry` |
| `k8s-runtime-image-state` commit | `94425518116d38524f6d9867fbf7fd8a0fa1db0a` |
| `k8s-runtime-image-state` services | `hris-api` |
| `k8s-runtime-image-state` synced_at | `2026-07-25T07:31:19Z` |
| Live pod `PROJECT_TRUTH_BUILD_SHA` | `94425518116d38524f6d9867fbf7fd8a0fa1db0a` |
| Sticky symbol `clearAdminSandboxFingerprintConflictsSticky` in `/app/dist/server.js` | **present** (grep count 2–3) |
| Sticky symbol `admin_sandbox_fp_clear_not_sticky` in `/app/dist/server.js` | **present** (grep count 1) |
| DEV API health `:3101` | **healthy** (uptime ~38s after rollout) |
| `:3001` health | healthy (separate long-lived process; not the K3s DEV pod) |

## Prior → current

| Surface | Before | After |
|---|---|---|
| ansible-pull repo | `340e60f` | `9442551` |
| image-state | `340e60f` / `services=none` | `9442551` / `services=hris-api` |
| Live API SHA | `8a5366e` (pod `hris-api-7b656bc966-55xnc`) | `9442551` (pod `hris-api-76779b54bd-jzfgw`) |
| Sticky symbols in dist | `0` / `0` | `2–3` / `1` |

## Deploy path used

1. Waited for CODE-FP push of sticky-clear commit (`9442551` observed on `origin/develop` at ~15:20 local / 07:20 UTC).
2. Host-local VM path: `ssh project-truth-hris` → node `project-truth-node`.
3. Managed `project-truth-ansible-pull` already pulled `9442551` (`apply_engine=ansible-pull`).
4. Image rebuild deferred while active DEV sync job snapshots were `processing` (ansible guard in `ansible/project-truth-pull.yml`).
5. Ansible later built/imported `hris-api-local:develop` for commit `9442551`, wrote image-state `services=hris-api`, and rolled `deployment/hris-api` in namespace `dev`.
6. Rollout status: `deployment "hris-api" successfully rolled out`.

No Cloudflare tunnel was disabled. No PROD/UAT image rebuild.

## Health proof (VM localhost)

```json
// http://127.0.0.1:3101/health  (K3s DEV API)
{"status":"healthy","timestamp":"2026-07-25T07:31:39.720Z","uptime":38.45711476,"message":"SLA monitoring is active"}

// http://127.0.0.1:3001/health  (separate long-uptime surface)
{"status":"healthy","timestamp":"2026-07-25T07:31:39.732Z","uptime":88861.468460648,"message":"SLA monitoring is active"}
```

## Sticky wire proof (in-pod)

```text
API_POD=hris-api-76779b54bd-jzfgw
PROJECT_TRUTH_BUILD_SHA=94425518116d38524f6d9867fbf7fd8a0fa1db0a
/app/dist/server.js size ~5655798 mtime Jul 25 07:28
grep -c clearAdminSandboxFingerprintConflictsSticky => 2
grep -c admin_sandbox_fp_clear_not_sticky => 1
uniq: admin_sandbox_fp_clear_not_sticky x1
      clearAdminSandboxFingerprintConflictsSticky x3
```

## Active-job note (honest)

- Before/during wait: sync job `489a2fd3-3c2f-49cf-8721-3f44134ecc74` was actively capturing missing FP/face raw bytes on Main Entrance Device E (progress ~22→702/889).
- DEPLOY preferred the ansible active-job deferral window rather than force-killing mid-write.
- After rollout, that job snapshot still shows `status=processing` with last `updatedAt=2026-07-25T07:30:58.192Z` and no further heartbeats (pod restarted → in-memory worker lost). Treat as **orphaned processing snapshot**, not live write progress. Recovery/sync agents should re-queue or mark terminal as needed.
- Ansible image-state still correctly records sticky SHA live; sticky-clear code is available for subsequent recovery jobs.

## Files

- `post-rollout-proof.txt` — raw SSH proof capture

## Commands for re-verify

```bash
ssh project-truth-hris
sudo cat /var/lib/project-truth/k8s-runtime-image-state
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
API_POD=$(sudo -E kubectl -n dev get pods --no-headers | awk '/hris-api/ && $1 !~ /db-init|init/ {print $1; exit}')
sudo -E kubectl -n dev exec "$API_POD" -- printenv PROJECT_TRUTH_BUILD_SHA
sudo -E kubectl -n dev exec "$API_POD" -- sh -c 'grep -c clearAdminSandboxFingerprintConflictsSticky /app/dist/server.js; grep -c admin_sandbox_fp_clear_not_sticky /app/dist/server.js'
curl -sS http://127.0.0.1:3101/health
```
