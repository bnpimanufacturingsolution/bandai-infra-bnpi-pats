# GitHub Actions CI / Observe / Validate — operator map

| Field | Value |
|---|---|
| Status | `DOCUMENTED_LIVE_20260819` |
| Documented | 2026-08-20 (evidence is 2026-08-19) |
| Operator hold | Lifted 2026-08-20: operator said **do it** (push `develop`). |
| Harden (2026-08-20) | Additive CI `zkteco` + `ansible` syntax-check. Observe prints VM `outcome=` description. Reporter still never fails Observe. |
| Tip SHA at proof | `efc86c56cea98ec0ab2c88c98b65d1181acb2086` |
| Verdict | **Not all DevOps is in the workflow named CI.** The three root workflows on this SHA were green. That is not live API/app image SHA and not Argo Healthy. |

Canonical live pack: `.runtime/devops-ci-validate-20260819/`.

---

## Operator hold

Operator 2026-08-20 said **do it** (push `develop`). VM ansible-pull will apply this SHA.

| Action | Status |
|---|---|
| `git push origin develop` | **authorized this pass** |
| ansible-pull (timer) | expected after push; docs-only so `services=none` |
| `gh workflow run` | not required; push triggers CI/Observe/Validate |

Code for CI / Observe is already on `origin/develop` from earlier 2026-08-19 pushes. This document does not add a new deploy.

---

## How to read GitHub Actions

Three **root** workflows run on `bandai-infra`. Nested `hris-api/.github` and `hris-app/.github` (Cloud Run, Firebase) **do not run** on this monorepo.

| Workflow | File | What it is | Watch for |
|---|---|---|---|
| **CI** | `.github/workflows/ci.yml` | Per-type **tests / syntax / kustomize render** | Product check names |
| **Observe VM GitOps deploy** | `.github/workflows/observe-deploy.yml` | Per-type **VM reporter** (GitHub Deployments) | deploying vs pulled |
| **Validate Project Truth Hyper-V Repo** | `.github/workflows/validate.yml` | Windows **appliance** contracts (terraform/packer/installer) | Host/repo static gate |
| **Promote GitOps Release Tag** | `.github/workflows/promote-gitops.yml` | Manual overlay tag write | Dispatch only; not auto |

Watch:

```powershell
gh run list --branch develop --limit 10
gh run list --workflow ci.yml --limit 5
gh run list --workflow observe-deploy.yml --limit 5
gh run list --workflow validate.yml --limit 5
```

---

## CI jobs (tests, not deploy)

| Job | Command | Honest meaning | This SHA `efc86c56` |
|---|---|---|---|
| **hris-api** | `npm run test:regression:payroll-source-truth` | Payroll/schema source-truth mocha. Not full API mocha, lint, or typecheck. | success |
| **hris-app** | `npm run test:payroll-correction` | Two vitest files. **Not** full `npm test` / typecheck. | success |
| **hris-emp-app** | skip if no `package.json` | **Skip-success** when submodule is missing. Not emp-app test proof. | success (skipped) |
| **hikvision** | Python unittest + `requirements.txt` | Probe/parser tests. **Not** C++ `g++` / HCNetSDK link. | success |
| **zkteco** | Python unittest (local unpushed 2026-08-20) | Probe tests. Not live devices. | not on origin until push |
| **ansible** | `ansible-playbook --syntax-check` (local unpushed) | Playbook parse only. | not on origin until push |
| **callback-outbox** | `python -m py_compile outbox_server.py` | Syntax only. | success |
| **gitops** | `kubectl kustomize` overlays | YAML renders. **Not** Argo apply or HEALTH. | success |

CI run: https://github.com/hrisworkforcesystem-coder/bandai-infra/actions/runs/32261539761

---

## Observe jobs (VM pull reporter, not live pod SHA)

GitHub environments: `vm-gitops`, `hris-api`, `hris-app`, `hris-emp-app`, `callback-outbox`.

VM script: `appliance/bin/project-truth-report-github-deploy.sh` after ansible-pull records `/var/lib/project-truth/ansible-pull-state`. Image/gitops envs **never post `failure`**. `services=none` is still GitHub `success` with description **not rebuilt**. On-prem port jobs **do post `failure`** if VM localhost HTTP is not 2xx.

| Job / env | Success means | Does **not** mean |
|---|---|---|
| **ansible-pull** / `vm-gitops` | VM wrote pull state for this SHA | Images rebuilt; pods rolled; Argo Healthy |
| **hris-api** | Reporter posted; rebuilt **or** `services=none` | Live `/health` SHA; `kubectl exec` `PROJECT_TRUTH_BUILD_SHA` |
| **hris-app** | same | Public HTML is this SHA |
| **hris-emp-app** | same | Emp-app tests ran |
| **callback-outbox** | same | Outbox process identity |

### On-prem instance ports (DEV / UAT / PROD)

GitHub-hosted runners **cannot** reach `10.184.37.19`. The VM curls `127.0.0.1` (same processes published on the LAN IP).

| Env | LAN URL | VM bind | Live 2026-08-20 |
|---|---|---|---|
| `onprem-prod-app` | `http://10.184.37.19:3000/auth/login` | `:3000` | 200 |
| `onprem-prod-api` | `http://10.184.37.19:3001/health` | `:3001` | 200 |
| `onprem-dev-app` | `http://10.184.37.19:3100/auth/login` | `:3100` | 200 |
| `onprem-dev-api` | `http://10.184.37.19:3101/health` | `:3101` | 200 |
| `onprem-uat-app` | `http://10.184.37.19:3200/auth/login` | `:3200` | 200 |
| `onprem-uat-api` | `http://10.184.37.19:3201/health` | `:3201` | 200 |

This workstation on Wi-Fi `192.168.1.26` still cannot open those LAN URLs (host_not_on_lan). Use VM bind proof or Cloudflare for remote.

Observe run: https://github.com/hrisworkforcesystem-coder/bandai-infra/actions/runs/32261539755

Live statuses for `efc86c56`:

| env | id | state | description |
|---|---:|---|---|
| vm-gitops | 5984011136 | success | ansible-pull `synced_at=2026-08-19T14:20:10Z` |
| hris-api | 5984011590 | success | **not rebuilt** (`services=none`) |
| hris-app | 5984011498 | success | **not rebuilt** |
| hris-emp-app | 5984011090 | success | **not rebuilt** |
| callback-outbox | 5984012202 | success | **not rebuilt** |

---

## Validate (Windows appliance — not named CI)

Same SHA ran **Validate** success: https://github.com/hrisworkforcesystem-coder/bandai-infra/actions/runs/32261539731

| Surface | In **CI** workflow? | In **Validate**? |
|---|---|---|
| terraform-hyperv fmt/init/validate | no | yes |
| Packer Hyper-V + VirtualBox validate | no | yes |
| Installer + shortcut contract | no | yes |
| Self-heal contract | no | yes |
| Observability contract | no | yes |
| PowerShell parse | no | yes |
| `kubectl kustomize` | yes (duplicate) | yes |

If you only watch the workflow named **CI**, you miss terraform/packer/installer. On `efc86c56` they still ran, under **Validate**.

Validate is **not** deploy proof (WWG standing rule).

---

## Live VM / Argo (2026-08-19)

| Surface | SHA | Note |
|---|---|---|
| origin/develop | `efc86c56` | tip at proof |
| `/var/lib/project-truth/ansible-pull-state` | `efc86c56` | `14:20:10Z` |
| `/var/lib/project-truth/k8s-runtime-image-state` | `efc86c56` | `services=none` |
| Argo `project-truth-{dev,uat,prod}` | `efc86c56` | Synced / **Healthy** |
| Argo `project-truth-runtime-{dev,uat,prod}` | `efc86c56` | Synced / **Degraded** |
| Degraded cause | Job `hris-api-db-init` **Failed** `BackoffLimitExceeded` since `2026-08-19T05:57:19Z` | Not SHA lag. Workloads were Ready 1. |

Image tags in GitOps stay **`:develop`**, not the git SHA. SHA lives in ansible-pull-state / GitHub Deployments.

---

## Public health (tunnel up, not SHA)

Unauthenticated 200 at 2026-08-19T14:24Z: DEV/UAT/prod API `/health`, DEV login, Grafana `/api/health`.

`GET /health` body is `{ status, timestamp, uptime, message }` — **no `buildSha`**. Proves Cloudflare + process liveness only.

---

## Residual (do not collapse to “all green”)

| Bucket | Count | What it is | Blocker class | Next (when operator allows) |
|---|---:|---|---|---|
| Root GHA green this SHA | 3 | CI + Observe + Validate | none | watch Actions; no push now |
| Partial CI | 3 | app subset; emp skip; outbox syntax | `code_defect` / `export_gap` | REC-20260819-HRIS-APP-CI-FULL-VITEST; emp token |
| Validate-only (not named CI) | 5 | terraform, packer, installer, self-heal, obs contract | `optional_product` | require Validate as a check, or fold Windows jobs |
| Missing from GHA | 6 | ZKTeco tests, ansible syntax, C++ compile, health SHA, pod SHA, UAT/prod observe | `export_gap` | candidate only |
| Runtime Degraded | 3 apps | failed `hris-api-db-init` Job | `apply_path` | diagnose Job; do not “fix” via Observe success |
| Nested workflows | 2+ | Cloud Run / Firebase YAML under packages | `optional_product` | leave; they do not run here |
| Hikvision listener env | 0 | systemd ELF not an Observe environment | `optional_product` | do not read Observe as listener deploy |

---

## Hard bans for agents

| Do not say | Because |
|---|---|
| “CI green = deployed” | CI is tests; Observe is reporter; images may be `services=none` |
| “Observe hris-api success = new API image” | Description can be **not rebuilt this SHA** |
| “`/health` healthy = this git SHA” | No `buildSha` field |
| “Argo Healthy” from Observe | Runtime apps can be Synced/**Degraded** with a Failed db-init Job |
| Nested Cloud Run/Firebase ran on this push | GitHub only loads repo-root `.github/workflows/` |

---

## Related

| Path | Role |
|---|---|
| `.github/workflows/ci.yml` | Per-type tests |
| `.github/workflows/observe-deploy.yml` | Per-type VM wait |
| `appliance/bin/project-truth-report-github-deploy.sh` | VM → GitHub Deployments |
| `docs/GITOPS_GH_WATCH_RUNBOOK.md` | Operator watch commands |
| `docs/DEVOPS_RUNBOOK.md` | Workflow roles (updated to include CI + Observe) |
| `.runtime/devops-ci-validate-20260819/` | Live JSON/txt from 2026-08-19 probes |
| REC-20260819-HRIS-APP-CI-FULL-VITEST | Full app vitest still not CI-green |
