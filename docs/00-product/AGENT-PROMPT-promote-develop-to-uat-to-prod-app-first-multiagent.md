# Multi-agent job — Promote develop → UAT → PROD (APP STATE FIRST)

You are the **ROOT owner-operator agent** for Project Truth environment promotion.

| | |
|---|---|
| **Repo** | `C:\Users\stari\bandai-infra` on `develop` |
| **Runtime** | K3s on VM `project-truth-node` / `10.184.37.19` |
| **SSH** | Prefer direct LAN: `ssh -i %USERPROFILE%\.ssh\node-health-appliance_ed25519 infra@10.184.37.19` |
| **Fallback SSH** | `ssh project-truth-bnpi-pats` (Cloudflare) only if LAN SSH fails |
| **Mode** | Multi-subagent, root-coordinated, continuous loop with **watch state** |
| **Order** | **APP / GitOps / images first** → prove UAT → prove PROD → **only then** DB/uploads clone (Phase D) |
| **Forbidden** | Windows Docker Desktop / WSL as Project Truth runtime; disable Cloudflare; invent Synced/Healthy; invent DB parity |

---

## 0. Paste-ready root kickoff

```text
Execute docs/00-product/AGENT-PROMPT-promote-develop-to-uat-to-prod-app-first-multiagent.md
as ROOT. Spawn multi-agents every cycle. Root owns watch-state + EXIT GATE.

PRIORITY ORDER (do not skip ahead):
  PHASE A — APP STATE truth (git/Argo/images) for develop@HEAD
  PHASE B — promote same app code to UAT; watch until UAT green
  PHASE C — promote same app code to PROD; watch until PROD green
  PHASE D — only after A+B+C green: backup + DEV DB/uploads → UAT → PROD
  PHASE E — parity proof + WWG stamp + commit/push if docs/scripts changed

Truth for THIS repo (must re-open files; do not invent branch strategy):
  - Argo apps project-truth-{dev,uat,prod} and runtime-* all use
    targetRevision: develop (gitops/argocd/applications/*.yaml).
  - There is NO remote origin/uat or origin/production branch required.
  - "Merge develop → uat → prod" means: same develop commit + same
    container image content running in uat then prod namespaces,
    NOT a classic three-branch merge unless operator adds branches later.
  - Image tags are already "develop" in overlays; stale pods can still run
    old layers under the same tag — rebuild/import/roll is required when
    pod age or imageId diverges from current DEV.

LAN first. Never stop Cloudflare. HEARTBEAT every cycle. Min 15 heartbeats
or full EXIT GATE. No human homework for recoverable steps.
```

---

## 1. EXIT GATE (finish line)

Stamp: `.runtime/promote-dev-uat-prod-YYYYMMDD-HHMMSS/`

### Phase A–C — APP STATE (required before any DB write)

| # | Check | Pass criteria | Evidence file |
|---|---|---|---|
| A1 | `origin/develop` HEAD known | SHA printed; local matches remote | `00-git.json` |
| A2 | Argo env apps track develop | All three `project-truth-{dev,uat,prod}` `targetRevision=develop` and revision = develop HEAD (or documented lag + fix) | `01-argo.json` |
| A3 | DEV app healthy | `http://10.184.37.19:3101/health` 200; `bnpi-pats-api` Ready; admin login works | `02-dev-app.json` |
| B1 | UAT image/code matches DEV promote intent | UAT `bnpi-pats-api` / `bnpi-pats-app` rolled after import; imageId or pod start ≥ promote stamp; health `3201` 200 | `03-uat-app.json` |
| B2 | UAT admin UI reachable | Login + `/admin/dashboard` (API or Playwright) | `03-uat-app.json` |
| C1 | PROD image/code matches same promote | PROD rolled same images; health `3001` 200 | `04-prod-app.json` |
| C2 | PROD admin UI reachable | Login + `/admin/dashboard` | `04-prod-app.json` |
| X1 | Cloudflare still active | `cloudflared-bnpi-pats.service` active; not stopped/masked | `05-tunnel.txt` |
| X2 | Runtime degraded classified | Failed `bnpi-pats-api-db-init` Jobs named `preexisting` or fixed — not left as silent “green” lie | `01-argo.json` |

### Phase D — DATA (only after A–C green; operator-authorized)

| # | Check | Pass criteria | Evidence |
|---|---|---|---|
| D0 | Pre-clone backups | DEV/UAT/PROD `pg_dump -Fc` + uploads archives; `sha256sum -c` green | `10-backups.md` |
| D1 | UAT restored from DEV | Business counts match DEV (see matrix); uploads set hash match | `11-uat-db.json` |
| D2 | PROD restored from same DEV dump | Same matrix as DEV/UAT | `12-prod-db.json` |
| D3 | Writers restored | Each env `bnpi-pats-api` Ready after scale-up | health JSON |

### Phase E — close-out

| # | Check | Evidence |
|---|---|---|
| E1 | `STATUS.md` + `HEARTBEATS.md` (≥15 lines) | stamp |
| E2 | WWG handoff + current-task addendum updated | `.wwg/...` |
| E3 | No invented device online counts | screenshots/API only |

**Hard bans**

- Starting Phase D before B1+B2+C1+C2 pass.
- Claiming “merged to uat/prod” because Argo says Synced while pods still run pre-promote imageId.
- Merging to `main` unless EXIT GATE explicitly requires it (optional Phase A4).
- Disabling Cloudflare or using Windows Docker as runtime.
- Dropping UAT/PROD DB without verified backups.

---

## 2. Architecture truth (app promotion in THIS repo)

```text
GitHub origin/develop @ SHA
        │
        ▼
Argo CD (all envs targetRevision: develop)
  project-truth-dev  → gitops/overlays/dev
  project-truth-uat  → gitops/overlays/uat
  project-truth-prod → gitops/overlays/prod
  project-truth-runtime-{dev,uat,prod}
        │
        ▼
K3s namespaces dev / uat / prod
  images: bnpi-pats-*-local:develop  (and outbox on DEV only today)
        │
        ▼
LAN proof
  DEV  app/api :3100/:3101
  UAT  app/api :3200/:3201
  PROD app/api :3000/:3001
```

**What “merge develop → uat → prod” means here**

| Operator phrase | Actual agent action |
|---|---|
| Merge develop to UAT | Ensure UAT pods run current develop-built images; Argo overlay path `uat` at develop SHA; roll UAT deployments |
| Merge UAT to PROD | Same image set promoted to PROD namespace (not a second git branch); roll PROD after UAT green |
| gh merge | Optional: `gh` PR develop→main **only if** product wants main = release mirror; **not required** for Argo (apps track develop) |
| promote-gitops.yml | Optional tag pin when using non-`develop` tags; current overlays already use `runtime_image_tag: develop` |

**DEV-only vs all-env workloads (do not fake parity)**

| Workload | DEV | UAT | PROD | Note |
|---|---|---|---|---|
| bnpi-pats-api / bnpi-pats-app / bnpi-pats-emp-app | yes | yes | yes | must match image promote |
| bnpi-pats-callback-outbox | yes (today) | no unless overlay added | no unless overlay added | classify as `optional_product` / env asymmetry |
| bnpi-pats-hikvision-watcher | yes | usually no | usually no | DEV device path; do not invent UAT/PROD watcher green |

---

## 3. Ordered graph (phases + edges)

```text
                    ┌─────────────┐
                    │  A-ROOT     │
                    │  watch state│
                    └──────┬──────┘
           spawn parallel  │
     ┌──────────┬──────────┼──────────┬──────────┐
     ▼          ▼          ▼          ▼          ▼
  A-GIT      A-ARGO     A-OBS      A-MON      A-DRIFT
  (SHA)      (apps)     (health)   (watch)   (protocol)
     │          │          │
     └────┬─────┘          │
          ▼                │
     A-BUILD-IMPORT        │
     (docker build +       │
      k3s ctr import)      │
          │                │
          ▼                │
     A-PROMOTE-UAT ──────► A-VERIFY-UAT ──► gate B green
          │
          ▼
     A-PROMOTE-PROD ─────► A-VERIFY-PROD ─► gate C green
          │
          ▼  (only if operator still wants data)
     A-BACKUP ──► A-CLONE-UAT ──► A-VERIFY-DB-UAT
                      │
                      ▼
                 A-CLONE-PROD ──► A-VERIFY-DB-PROD
                      │
                      ▼
                 A-TRUTH-SYNC (WWG + STATUS)
```

**Edge rules**

1. Do not enter `A-PROMOTE-UAT` until A1+A2+A3 pass (or A-BUILD-IMPORT completed for stale images).
2. Do not enter `A-PROMOTE-PROD` until B1+B2 pass.
3. Do not enter `A-BACKUP` / clone until C1+C2 pass.
4. On any red watch sample: spawn A-CLASS → A-FIX → re-enter promote/verify; do not advance gate.
5. A-MON runs for entire job; never killed until EXIT GATE or real stop condition.

---

## 4. Multi-agent roster (spawn protocol)

### Hard multi-agent protocol

1. **MUST spawn** children via tool API (`spawn_subagent` / Task). Solo root only if `tool_unavailable` evidenced.
2. **Cycle 1 must-spawn (parallel):** `A-GIT`, `A-ARGO`, `A-OBS`, `A-MON`, `A-DRIFT`.
3. Print chat-visible lines:

```text
SPAWNED | A-GIT=<id> | A-ARGO=<id> | A-OBS=<id> | A-MON=<id> | A-DRIFT=<id> | stamp=<path>
HEARTBEAT | cycle=N | phase=A|B|C|D|E | gate=A.x/B.x/C.x | last_proof=<path|fail> | next=<one action>
AGENT_DONE | role=A-OBS | id=<id> | status=ok|fail | deliverable=<path>
DRIFT_ALERT | severity=red|yellow | item=<code> | next=<spawn role>
```

4. Write `MANIFEST.json` under stamp with roles, ids, status, deliverables.
5. Missing deliverable → re-spawn role once → then `ROOT_FALLBACK` fill with evidence.

### Role table

| Role | Type | Owns | Deliverable |
|---|---|---|---|
| **A-ROOT** | manager | graph, gates, heartbeats, no silent solo | `00-ROOT-STATUS.md`, `HEARTBEATS.md` |
| **A-GIT** | explore/exec | `git fetch`; develop SHA; optional main delta; dirty tree | `00-git.json` |
| **A-ARGO** | exec | Argo apps SYNC/HEALTH/REV; classify runtime Degraded Jobs | `01-argo.json` |
| **A-OBS** | exec | LAN health 3101/3201/3001; pod Ready; tunnel active; disk | `02-obs.md` |
| **A-BUILD-IMPORT** | exec | Rebuild images at develop source; `k3s ctr` import; record digests | `06-images.json` |
| **A-PROMOTE-UAT** | exec | Roll UAT api/app/emp (and only workloads in UAT overlay) | `03-uat-promote.txt` |
| **A-VERIFY-UAT** | exec | Health + login + dashboard proof UAT | `03-uat-app.json` |
| **A-PROMOTE-PROD** | exec | Roll PROD after UAT green | `04-prod-promote.txt` |
| **A-VERIFY-PROD** | exec | Health + login + dashboard proof PROD | `04-prod-app.json` |
| **A-BACKUP** | exec | Phase D dumps + upload tars + sha256 | `10-backups.md` |
| **A-CLONE-UAT** | exec | Scale API 0 → restore DEV dump → uploads → scale 1 | `11-uat-db.json` |
| **A-CLONE-PROD** | exec | Same for PROD after UAT DB verify | `12-prod-db.json` |
| **A-CLASS** | explore | Error → layer (git/argo/image/pod/db/network) | `02-error-classification.md` |
| **A-FIX** | exec | One named repair; re-prove | patch + proof |
| **A-MON** | monitor | 60–120s samples of three env health + Argo | `05-monitor.md` |
| **A-DRIFT** | explore | Card compliance; SPAWNED lines; gate order violations | `06-drift-compliance.md` |
| **A-TRUTH** | exec | WWG handoff + current-task; STATUS.md | stamp + `.wwg` |

**Cycle-1 must-spawn:** A-GIT + A-ARGO + A-OBS + A-MON + A-DRIFT.

**After A truth known:** spawn A-BUILD-IMPORT if imageId/pod age stale vs develop work.

**After import:** A-PROMOTE-UAT then A-VERIFY-UAT; only then A-PROMOTE-PROD / A-VERIFY-PROD.

**Phase D:** A-BACKUP → A-CLONE-UAT → verify → A-CLONE-PROD → verify → A-TRUTH.

---

## 5. Watch state machine

Root maintains `WATCH-STATE.json` (update every cycle):

```json
{
  "stamp": ".runtime/promote-dev-uat-prod-YYYYMMDD-HHMMSS",
  "phase": "A|B|C|D|E",
  "developSha": "",
  "argo": {
    "dev": { "sync": "", "health": "", "rev": "" },
    "uat": { "sync": "", "health": "", "rev": "" },
    "prod": { "sync": "", "health": "", "rev": "" }
  },
  "app": {
    "dev": { "health": null, "apiReady": null, "imageId": "" },
    "uat": { "health": null, "apiReady": null, "imageId": "", "promoted": false },
    "prod": { "health": null, "apiReady": null, "imageId": "", "promoted": false }
  },
  "gates": {
    "A": false, "B": false, "C": false, "D": false, "E": false
  },
  "dbPhaseAuthorized": true,
  "dbPhaseStarted": false,
  "tunnelActive": null,
  "blockers": [],
  "next": ""
}
```

### Gate predicates

```text
gate A = A1 ∧ A2 ∧ A3 ∧ X1
gate B = gate A ∧ B1 ∧ B2
gate C = gate B ∧ C1 ∧ C2
gate D = gate C ∧ D0 ∧ D1 ∧ D2 ∧ D3   (skip D if operator APP-ONLY)
gate E = gate C ∧ E1 ∧ E2  (or gate D if data run)
```

---

## 6. Phase playbooks (agent-owned commands)

### Phase A — APP truth

```powershell
# Host
git fetch origin
git rev-parse origin/develop
git status -sb

# VM (LAN)
ssh -i $env:USERPROFILE\.ssh\node-health-appliance_ed25519 infra@10.184.37.19
kubectl get applications -n argocd -o custom-columns=NAME:.metadata.name,SYNC:.status.sync.status,HEALTH:.status.health.status,REV:.status.sync.revision
curl -sS http://127.0.0.1:3101/health
curl -sS http://127.0.0.1:3201/health
curl -sS http://127.0.0.1:3001/health
systemctl is-active cloudflared-bnpi-pats.service
```

Optional **A4 main mirror** (only if product wants `main` = release tip):

```powershell
gh pr create --base main --head develop --title "Promote develop to main (release mirror)" --body "App-first promote; Argo still tracks develop."
# or fast-forward if policy allows:
# git checkout main; git merge --ff-only origin/develop; git push origin main
```

Do **not** block UAT/PROD app promote on main merge; Argo uses `develop`.

### Phase B — UAT app promote

1. On VM: ensure source at develop SHA (`ansible-pull` / `/var/lib/project-truth/ansible-pull` or documented build path).
2. Rebuild and import the same tags DEV uses (`bnpi-pats-api-local:develop`, `bnpi-pats-app-local:develop`, `bnpi-pats-emp-app-local:develop`, `bnpi-pats-api-db-init:develop` as needed).
3. Record digests before/after.
4. Roll UAT:

```bash
kubectl -n uat rollout restart deploy/bnpi-pats-api deploy/bnpi-pats-app deploy/bnpi-pats-emp-app
kubectl -n uat rollout status deploy/bnpi-pats-api --timeout=300s
curl -sS http://127.0.0.1:3201/health
```

5. Admin login against UAT API (`3201`) with `admin@bandai.local` / `password123` / `appCode=bnpi-pats`.
6. Mark gate B only when health + login + image/pod proof match promote stamp.

### Phase C — PROD app promote

Same as B for namespace `prod` / ports `3000`/`3001`, **only after gate B**.

### Phase D — DB/uploads (APP first already green)

Follow proven 2026-07-24 pattern (re-open report; do not invent):

`.runtime/dev-to-uat-prod-20260724-144222/REPORT.md`

For each target independently (UAT then PROD):

1. Backup target `pg_dump -Fc` + uploads archive; `sha256sum`.
2. Dump DEV once; verify checksum; reuse same dump for both targets.
3. Scale target `bnpi-pats-api` to 0.
4. Drop/recreate `bnpi-pats` with compatible encoding; `pg_restore --no-owner --no-acl --exit-on-error`.
5. Mirror DEV uploads → target uploads path.
6. Scale API back; wait Ready; re-count matrix.
7. Do not touch secrets, Cloudflare, or shared DM host paths.

**Count matrix (minimum)**

| Key | Source |
|---|---|
| employees, users, departments, positions | tables |
| documents, attendances, timesheets, timesheet lines | tables |
| devices, device_users, device_events | tables |
| upload file count + set hash | host path |

Operational rows (`ActivityLogging`, `AuditLogging`, last-login) may diverge after verify logins — expected.

---

## 7. HEARTBEAT format

Every cycle (min 15):

```text
HEARTBEAT | cycle=N | phase=A|B|C|D|E | gates=A.B.C.D | devSHA= | uatImg= | prodImg= | health=3101/3201/3001 | argo= | next=
```

---

## 8. Real stop conditions

Stop only when:

- 3 distinct recovery failures with evidence for the same gate.
- Backup verification failed and restore would be irreversible.
- Missing irrecoverable credentials / SSH / disk full.
- Operator cancels Phase D explicitly (APP-only exit is allowed if gates A–C + E pass).

Everything else is agent-owned.

---

## 9. APP-ONLY vs FULL run modes

| Mode | Phases | When |
|---|---|---|
| **APP-ONLY** (default for “focus on app state first”) | A → B → C → E | Code/GitOps/images only |
| **FULL** | A → B → C → D → E | After app green, match DB+uploads to DEV |

Root must print mode at start:

```text
MODE | APP-ONLY|FULL | dbPhaseAuthorized=<bool>
```

If user said “matches … from DB” in the same session, default **FULL** but still **serialize**: never start D before C green.

---

## 10. Current-state snapshot (stale until re-probed)

Last agent probe (2026-07-29) — **re-verify; do not treat as final**:

| Item | Value | Label |
|---|---|---|
| origin/develop | `6f8a398` | re-fetch |
| Argo env apps | Synced/Healthy @ develop | re-probe |
| Argo runtime apps | Synced/Degraded (failed db-init Jobs) | classify, don’t invent fixed |
| Image tag all envs | `*:develop` | tag same ≠ content same |
| DEV API pod age | newer (~hours) | promote reference |
| UAT/PROD API pod age | older (~day) | **stale risk under same tag** |
| Uploads | DEV 92 / UAT 71 / PROD 71 | Phase D residual |
| Cloudflare | must stay active | X1 |

---

## 11. Deliverable tree

```text
.runtime/promote-dev-uat-prod-YYYYMMDD-HHMMSS/
  MANIFEST.json
  WATCH-STATE.json
  HEARTBEATS.md
  00-ROOT-STATUS.md
  00-git.json
  01-argo.json
  02-obs.md
  02-error-classification.md
  03-uat-app.json
  03-uat-promote.txt
  04-prod-app.json
  04-prod-promote.txt
  05-monitor.md
  05-tunnel.txt
  06-images.json
  06-drift-compliance.md
  10-backups.md          # FULL only
  11-uat-db.json         # FULL only
  12-prod-db.json        # FULL only
  STATUS.md
```

---

## 12. Operator visibility (hard)

Root chat must show SPAWNED / HEARTBEAT / AGENT_DONE / gate transitions. Tool-only background work without chat lines is a **protocol defect** — spawn A-DRIFT / A-PROMPT.

Forbidden exit lines: “you should merge in GitHub”, “please restart pods”, “run promote yourself”.

---

## 13. Success one-liner

**APP-ONLY:** UAT and PROD admin apps run the same develop-built image content as DEV, health+login green, Argo revision = develop HEAD, Cloudflare active.

**FULL:** APP-ONLY plus DEV logical DB+uploads mirrored to UAT then PROD with verified backups and matching count matrix.
