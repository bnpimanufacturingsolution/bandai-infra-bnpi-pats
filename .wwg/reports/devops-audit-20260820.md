# DevOps audit — 2026-08-20 (10 agents + lead live proof)

| Field | Value |
|---|---|
| Status | `AUDITED_LIVE` |
| SHA | `origin/develop` `37b443a656e48a8bde261f34f490aca8468da25a` |
| Subject | `docs: audit timesheet connection to changeable schedule` |
| Agents | 10 (A–J) + lead |
| Evidence | `.runtime/devops-audit-20260820/` |
| Tunnel | `cloudflared-bnpi-hris.service` **active + enabled** (not touched) |
| This PC LAN | `192.168.1.26` — SSH/TCP to `10.184.37.19` **timeout** (`host_not_on_lan`) |
| VM SSH | `ssh project-truth-hris` OK at 2026-08-20T12:27Z |

This is an **audit**. No playbook, workflow, overlay, or runtime Job was changed.

---

## Verdict (one screen)

| Surface | Verdict | Care? |
|---|---|---|
| CI on tip SHA | **Green** (8/8 jobs) | Green ≠ full product tests |
| Validate on tip SHA | **Green** | Includes self-heal auto-roll contract |
| Observe on tip SHA | **Waiting** on VM GitHub Deployment (not failed) | Stacked behind prior SHA |
| Appliance auto-roll (code) | **Matches docs** — rebuild restarts `dev uat prod` | Docs-only does **not** roll |
| DEV/UAT/PROD isolation | **Separate** ns / hostPorts / Postgres PVs | Auto-roll does **not** merge DBs |
| On-prem ports | **Up on VM** HTTP 200; this PC **cannot** reach LAN | Use Cloudflare or SSH loopback |
| Public APIs | **200** `healthy` DEV/UAT/PROD | `/health` has **no `buildSha`** |
| Runtime Argo | Synced / **Degraded** all 3 ns | Failed Job `hris-api-db-init` |
| Overlay Argo | Synced / **Healthy** all 3 ns | Git rev = tip `37b443a` |
| Image vs git | Last apply stamp **`885c331`** `services=none` | Tip SHA not rebuilt into `:develop` |

---

## Team

| # | Role | Outcome |
|---|---|---|
| A | Root GHA workflows | 4 root workflows; CI subset tests; Observe 11 matrix; Promote dispatch-only |
| B | ansible-pull rebuild/roll | Path filters; `services=none` no roll; app/API `dev uat prod` skip-missing; emp-app hardcoded no skip |
| C | Self-heal vs playbook | Contract matches auto-roll; Validate still runs it; no `env_name=dev` assignment |
| D | Argo overlay isolation | 3 ns, 3 ports, 3 PVs, `newTag: develop`, `imagePullPolicy: Never` |
| E | Docs vs code | Operator runbooks aligned; `devops-ci-observe-validate-20260819.md` residual rows **STALE** |
| F | Live GitHub Actions | Tip CI+Validate success; Observe 11/11 present, incomplete |
| G | Live VM GitOps SHA | Worktree/Argo `37b443a`; apply stamp `885c331` `services=none`; runtime Degraded |
| H | Ports A/B/C | VM 6×200; this PC LAN fail; public 3×200 healthy |
| I | GitHub Deployments | Tip SHA mostly `in_progress` “Waiting for VM report”; 2 envs no deployment yet |
| J | Residual gaps | 9 listed; 3 old “missing” items **closed in code** |

Lead verified: `gh run list/view`, `ssh project-truth-hris` Argo+Jobs, public `/health` JSON, LAN SSH timeout.

---

## Live SHA map (2026-08-20T12:26–12:27Z)

| Surface | SHA | Health |
|---|---|---|
| `origin/develop` | `37b443a` | tip |
| VM `ansible-pull` worktree HEAD | `37b443a` | fetched |
| `ansible-pull-state` | `885c331` | last apply `synced_at=2026-08-20T12:20:14Z` — **LAGS** tip |
| `k8s-runtime-image-state` | `885c331` | `services=none` |
| `github-deploy-report` | `885c331` | `reported=yes` `12:21:10Z` `image_services=none` |
| Argo overlay `dev/uat/prod` | `37b443a` | Synced / Healthy |
| Argo runtime `dev/uat/prod` | `37b443a` | Synced / **Degraded** |
| Deploy `hris-api` / `hris-app` ×3 ns | tag `hris-*-local:develop` | Ready 1/1 (not git SHA) |

**CONFLICTING:** git/Argo rev is tip `37b443a`; last ansible-pull **apply stamp** is docs SHA `885c331`. Expected for docs-only: worktree can advance before the 5-minute apply rewrites state; images stay previous `:develop`.

---

## GitHub Actions (tip `37b443a`)

| Workflow | Run | Status |
|---|---|---|
| CI | [32368517756](https://github.com/hrisworkforcesystem-coder/bandai-infra/actions/runs/32368517756) | **success** |
| Validate | [32368517759](https://github.com/hrisworkforcesystem-coder/bandai-infra/actions/runs/32368517759) | **success** |
| Observe | [32368517802](https://github.com/hrisworkforcesystem-coder/bandai-infra/actions/runs/32368517802) | **queued / in_progress** (wait VM report) |
| Observe prior `e7b6704` | [32368325143](https://github.com/hrisworkforcesystem-coder/bandai-infra/actions/runs/32368325143) | **in_progress** (stacked) |
| Last completed Observe | [32365593191](https://github.com/hrisworkforcesystem-coder/bandai-infra/actions/runs/32365593191) | success on **`885c331`**, not tip |

### CI jobs (all success)

| Job | Proves | Gap |
|---|---|---|
| hris-api | payroll source-truth mocha | not full mocha / typecheck |
| hris-app | 2 vitest files (`test:payroll-correction`) | not full vitest / Playwright |
| hris-emp-app | skip-success (no `package.json`) | **not test proof** |
| hikvision | Python unittest | not C++ / live device |
| zkteco | Python unittest | not live device |
| ansible | playbook `--syntax-check` | not VM apply |
| callback-outbox | `py_compile` | not process/image |
| gitops | `kubectl kustomize` | not Argo Healthy |

Nested `hris-api/.github` Cloud Run and `hris-app/.github` Firebase **do not run** on this monorepo.

---

## Auto-roll vs isolation (code)

| Item | Truth |
|---|---|
| Trigger | `develop` pull + path-filter **rebuild** |
| After import | restart `hris-api` / `hris-app` (/ DEV outbox) in `${PROJECT_TRUTH_ROLLOUT_NAMESPACES:-dev uat prod}` |
| Missing Deployment | skip (outbox uat/prod) |
| Docs-only | `services=none`, **no** restart |
| Revert | `PROJECT_TRUTH_ROLLOUT_NAMESPACES=dev` |
| GitHub branch `uat`/`production` | **not** the trigger; Argo `targetRevision: develop` |
| `promote-gitops.yml` | **manual** overlay **tag** write only |
| emp-app | hardcoded `prod dev uat`; **no** skip-if-missing; ignores revert env |
| DBs | **not** restarted; per-ns `hris-postgres` + hostPath PV |

| env | ns | app | api | pg | image tag |
|---|---|---:|---:|---:|---|
| DEV | `dev` | 3100 | 3101 | 15433 | `develop` + `Never` |
| UAT | `uat` | 3200 | 3201 | 15434 | `develop` + `Never` |
| PROD | `prod` | 3000 | 3001 | 15432 | `develop` + `Never` |

---

## Ports (three classes)

| Class | Probe | Result |
|---|---|---|
| A VM loopback | `127.0.0.1:{3000,3001,3100,3101,3200,3201}` | **PASS** HTTP 200; APIs `status=healthy` |
| B this PC LAN | `10.184.37.19` SSH:22 and TCP 3000–3201 | **FAIL** timeout — `host_not_on_lan` |
| C public | `https://{dev-api,uat-api,api}.bnpi-hris.tech/health` | **PASS** 200 `healthy`; **no `buildSha`** |

Class B fail is **not** instance-down. Class A proves the binds.

Public `/health` body (lead, 12:27Z): `{ status, timestamp, uptime, message }` only.

---

## Residual: DevOps gaps = 9 listed

| Bucket | Count | What it is | Blocker class | Next |
|---|---:|---|---|---|
| Observe stacked wait | 2 runs | Tip + prior SHA both waiting for VM `gh` Deployment report (~5 min timer, 1200s wait) | `apply_path` | Let ansible-pull report; do not spam docs pushes |
| Runtime Argo Degraded | 3 apps | Job `hris-api-db-init` Failed `BackoffLimitExceeded` ~6h (dev 06:03Z, uat/prod 06:11Z) | `apply_path` + Job spec `code_defect` | REC-20260820-RUNTIME-DB-INIT-DEGRADED — diagnose Job, do **not** `--accept-data-loss` |
| `/health` no `buildSha` | 1 | Cannot prove serving image = git SHA | `code_defect` | REC-20260820-HEALTH-BUILDSHA-AND-OBSERVE |
| CI subset (app) | 1 | 2 vitest files, not full suite | `code_defect` | REC-20260819-HRIS-APP-CI-FULL-VITEST |
| CI subset (api) | 1 | payroll source-truth only | `code_defect` | widen after current slice stays green |
| emp-app skip-green | 1 | submodule not checked out | `export_gap` | checkout with token or stop skip-success |
| Observe image envs never fail | 5 | reporter always `success` when `gh` works; `services=none` still green | `code_defect` (honesty) | same health-SHA rec |
| `promote-gitops` / env branches | 2 | Manual tag; branches ≠ auto-roll | `optional_product` | keep; do not “fix” by adding branches |
| Nested Cloud Run/Firebase | 2+ | Dead on this monorepo | `optional_product` | ignore |
| `imagePullPolicy: Never` + `:develop` | policy | Appliance path; needs ctr import + restart | `optional_product` | keep on this VM |
| Required GitHub checks | 1 | Not in git | `export_gap` | `gh` protection GET — `NEEDS_CONFIRMATION` |
| emp-app roll no skip | 1 | Missing Deployment would fail playbook | `code_defect` | add skip-if-missing like app/API |
| STALE WWG residual list | 1 | `.wwg/reports/devops-ci-observe-validate-20260819.md` still says ZKTeco/ansible/UAT observe missing | docs `STALE` | treat this audit as current |

### Closed (do not re-open as missing)

| Old residual | Now |
|---|---|
| ZKTeco / ansible not in CI | **In CI** and green on tip |
| UAT/PROD on-prem Observe | **In Observe matrix** (`onprem-{prod,dev,uat}-{api,app}`) |
| UAT/PROD never restart app/API | **Code** restarts after rebuild; skip missing |

### Docs honesty

| Doc | vs code |
|---|---|
| `docs/ONPREM_PORT_ACCESS.md` | Aligned |
| `docs/DEVOPS_RUNBOOK.md` auto-roll / promote | Aligned; Validate check **list incomplete** (omits self-heal + observability); “Latest local check 2026-06-16” **STALE** |
| `docs/GITOPS_GH_WATCH_RUNBOOK.md` | Aligned (image Observe jobs still **DEV-named**) |
| `.wwg/reports/uat-prod-app-api-auto-roll-20260820.md` | Aligned |
| `.wwg/reports/devops-ci-observe-validate-20260819.md` | **STALE** residual “ZKTeco/ansible/UAT observe missing” |

Leftover present-tense “UAT/PROD app/API is manual only” / “`env_name=dev` only”: **not found** in operator runbooks.

---

## Done vs not done

| Claim | Status | Evidence | Operator still sees |
|---|---|---|---|
| 10-agent DevOps audit | **Done** | this file + `.runtime/devops-audit-20260820/` | — |
| CI/Validate green on tip | **Done** | runs 32368517756 / 32368517759 | green checks |
| Observe = this SHA serving | **False / waiting** | stamp `885c331` `services=none`; Deployments in_progress | Actions “waiting for VM” |
| UAT/PROD isolated | **Done in code+live Deploy Ready** | overlays + kubectl Ready 1/1 | separate ports |
| Runtime Argo Healthy | **Open** | 3× Failed db-init Job | Synced/Degraded |
| This PC on-prem ports | **Open (expected)** | LAN timeout | Cloudflare / SSH |
| Tunnel kept up | **Done** | `active` `enabled` | public HRIS |

---

## Recommendations (already Proposed; no new product work in this audit)

| Pri | Action | Owner | Rec |
|---|---|---|---|
| 1 | Repair `hris-api-db-init` Failed Jobs (dev/uat/prod) without data-loss | agent | REC-20260820-RUNTIME-DB-INIT-DEGRADED |
| 2 | `/health` `buildSha` + Observe compare | agent | REC-20260820-HEALTH-BUILDSHA-AND-OBSERVE |
| 3 | Widen hris-app (then api) CI after Router/typecheck | agent | REC-20260819-HRIS-APP-CI-FULL-VITEST |
| 4 | emp-app CI skip-green | agent | (candidate) checkout submodule or fail closed |
| 5 | Do not add `uat`/`production` branches to “fix” auto-roll | — | optional_product |

No new architecture principle. Existing recommendations remain `Proposed`.
