# Graph engineering — Decision 0 + FP gap 0 + Face gap 0 (durable VM)

**Status:** `EXECUTE_NOW`  
**Created:** 2026-07-30  
**Seed residual (RE-MEASURE; do not treat as frozen):**

| Residual | Start (overnight stamp) | Truth class |
|---|---:|---|
| Decision people | **6** | profile `conflicts[]` — apply_path |
| FP gap chip (unique) | **372** | credential residual |
| Face gap chip (unique) | **459** | credential residual |
| Missing people E | **0** (E From **874**) | **DONE** — do not re-burn people as primary |
| Face ready ops (plan) | ~**701** | apply_path if raw present |
| FP ready ops (plan) | ~**349** | apply_path if raw present |
| FP blocked `missing_raw_blob` | ~**225** | **export_gap = agent-owned** |
| Face blocked `target_write_unsupported` | ~**62** | **code/capability = agent-owned** |

**Critical honesty (why you still feel locked):**

| Layer | What exists today | Burns FP/face? |
|---|---|---|
| VM `project-truth-af-burn-loop.sh` | Durable **mode=users** headcount only | **NO** |
| Host overnight agents | Die when session ends | partial / not leave-safe |
| Recovery jobs | Preview → dryRun → write max 50 | YES when `wouldWrite>0` |
| UI “Recovery queued” / “Exporting source credential” | Planner **label**, not a worker queue | **NO** until agent runs export+replan+write |

**You must not accept “locked by residual chips.”** Chips are symptoms. Root owns export, writer capability, classification, and durable VM loop.

---

## 0. Paste-ready root kickoff

```text
Execute docs/00-product/AGENT-PROMPT-graph-decision-fp-face-gap-burn-durable-vm.md
as ROOT graph engineer. Non-stop. Agent-owned. No human homework.

Seed truth (re-measure first cycle):
  people missing E = 0 (DONE)
  decision = 6 (must → 0)
  fp unique residual ≈ 372 (must fall every cycle or blocker fixed)
  face unique residual ≈ 459 (must fall every cycle or blocker fixed)

Scope: Main A/B/D/E/F only. Exclude Main C + TEST unless live From becomes readable.
API on-node: http://127.0.0.1:3101 via ssh project-truth-hris
Public fallback: https://dev-api.bnpi-hris.tech
Admin: admin@bandai.local / password123 / appCode=hris

Every cycle:
  1) freeze live deviceIds from sync-preview
  2) POST merge/plan → residual matrix (decision + unique_fp + unique_face + ready ops)
  3) DECISION path: review autoResolveDecisions + applyAll richest → mode=users ONLY for the 6 conflict keys if still missing profile align; else mark decision closed when conflicts[] empty
  4) FACE path: recovery/review canaryModality=face max50 → dryRun → if wouldWrite>0 write → poll → match verified
  5) FP path: recovery/review canaryModality=fingerprint max50 → dryRun → if wouldWrite>0 write → poll → match verified
  6) if wouldWrite=0 but residual>0: DO NOT STOP — classify blocker and FIX:
       missing_raw_blob / exporting source / owner_scan_incomplete → export/backfill custody (agent-owned)
       target_write_unsupported / attestation → capability probe + writer/canary code fix + redeploy DEV
       scan gate / budget burn / preview≠execute → code_defect fix + unit test + push develop + GitOps wait
  7) install/extend VM durable supervisor for CREDENTIAL mode (not only users) so host can leave
  8) observe Loki/kubectl for credential_recovery_write_progress; never bare Bad Request

Loop until EXIT GATE or only physical_boundary rows remain with full table.
HEARTBEAT every cycle (min 25). Evidence under .runtime/graph-cred-burn-YYYYMMDD-HHMMSS/
Commit/push develop when green. Cloudflare tunnel stays ON.
```

---

## 1. EXIT GATE (all required)

Stamp: `.runtime/graph-cred-burn-YYYYMMDD-HHMMSS/`

| # | Gate | Pass proof |
|---|---|---|
| G1 | Live plan after headcount | planId + unionUsers≈874 + E From=874 |
| G2 | **decision_people = 0** | `users[].conflicts.length>0` count = 0 |
| G3 | **unique_face residual ↓ every productive cycle**; finish = 0 or only `physical_boundary` table | matrix JSON + rows |
| G4 | **unique_fp residual ↓** OR `fingerprintReady` unlock path proven with verified FP writes | matrix + job |
| G5 | Every write: preview + dryRun first; `0 < verified ≤ wouldWrite` | job finals |
| G6 | No residual left classified as “physical” when reason is export/scan/blob/code | taxonomy table |
| G7 | **Durable VM credential supervisor** running (`nohup`, pid, STATUS) after host leaves | SSH proof |
| G8 | ≥25 HEARTBEATs + STATUS.md + residual tables | stamp |
| G9 | Code defects fixed on `develop` + DEV image/SHA when required | git + kubectl |
| G10 | Cloudflare tunnel **not** disabled | service active |

**Hard bans**

- Stopping because UI says physical / exporting / owner scan incomplete without export attempt.
- Stopping at decision=6 “needs operator.”
- Writing when `wouldWriteCount=0`.
- Unscoped recovery without `canaryModality` (card spam).
- Claiming chip zero without fresh plan.
- Host-only PowerShell as the only burn process.
- Disabling Cloudflare / inventing device online / inventing residual integers.

---

## 2. Ordered dependency graph (do not reorder)

```text
                    ┌─────────────────────────────┐
                    │ 0 WWG bootstrap + CSR       │
                    └──────────────┬──────────────┘
                                   v
                    ┌─────────────────────────────┐
                    │ 1 LIVE SCOPE freeze A-F     │
                    │   exclude C/TEST if dead    │
                    └──────────────┬──────────────┘
                                   v
                    ┌─────────────────────────────┐
                    │ 2 PLAN + RESIDUAL MATRIX    │
                    │   decision / uFP / uFace    │
                    │   ready ops by modality     │
                    └──────────────┬──────────────┘
                                   v
              ┌────────────────────┼────────────────────┐
              v                    v                    v
     ┌────────────────┐  ┌─────────────────┐  ┌──────────────────┐
     │ 3 DECISION     │  │ 4 FACE pipeline │  │ 5 FP pipeline    │
     │ autoResolve    │  │ preview→dry→wr  │  │ preview→dry→wr   │
     │ applyAll A/B   │  │ max 50 unique   │  │ max 50 unique    │
     └───────┬────────┘  └────────┬────────┘  └────────┬─────────┘
             │                    │                    │
             └────────────────────┼────────────────────┘
                                  v
                    ┌─────────────────────────────┐
                    │ 6 MATCH verified vs would   │
                    │   replan → new matrix       │
                    └──────────────┬──────────────┘
                                   v
                    ┌─────────────────────────────┐
                    │ 7 would=0 && residual>0 ?   │
                    │   YES → DEFECT/EXPORT FIX   │
                    │   NO  → next wave           │
                    └──────────────┬──────────────┘
                                   v
                    ┌─────────────────────────────┐
                    │ 8 DURABLE VM SUPERVISOR     │
                    │   credential mode nohup     │
                    │   (extend af-burn or new)   │
                    └──────────────┬──────────────┘
                                   v
                    ┌─────────────────────────────┐
                    │ 9 OBSERVE Loki/kubectl      │
                    │   commit/push when green    │
                    │   EXIT GATE check           │
                    └─────────────────────────────┘
```

Parallel subagents under ROOT only; **one active recovery write job** at a time.

---

## 3. Multi-agent roles

| Agent | Owns | Forbidden |
|---|---|---|
| **ROOT** | Graph, writes authorize, EXIT GATE, commit/push | Fake green |
| **A-SCOPE** | Live deviceIds, health, C exclude | Writes |
| **A-PLAN** | merge/plan, residual tables | Writes |
| **A-DECISION** | autoResolve + review for 6 conflict keys; prove conflicts→0 | Credential write without ROOT |
| **A-FACE** | face preview/dryRun/write waves | FP / deploy |
| **A-FP** | fp preview/dryRun/write + export unlock | Face deploy |
| **A-EXPORT** | biometric-metadata backfill / raw custody capture for `missing_raw_blob` | Guessing bytes |
| **A-DEFECT** | code_defect gates (scan incomplete, writer, budget, classification) + tests | Runtime writes |
| **A-VM** | Install/extend durable supervisor on VM for credential burn | Disable tunnel |
| **A-OBS** | Loki/kubectl/Grafana `credential_recovery_write_progress`, 502/OOM | Silent drop of errors |
| **A-TRUTH** | STATUS.md, residual honesty, WWG handoff | Invent counts |

---

## 4. Blocker taxonomy — never “locked”

| Label you will see | Real class | Agent action (required) |
|---|---|---|
| Needs decision / conflicts[] | `apply_path` | `autoResolveDecisions:true` + `applyAll:"A"` (or richest B when E is wrong); replan until decision=0 |
| Face/FP chip high, ready>0 | `apply_path` | recovery write waves max 50 unique-person |
| `missing_raw_blob` | **`export_gap` agent-owned** | backfill/export source custody → replan → write |
| “Exporting source credential” / owner scan incomplete | **`code_defect` + export** | export+checksum owners; fix over-strict gate; **not** human enroll |
| `target_write_unsupported` / attestation | **`code_defect` / capability** | probe FDLib/SDK; multi-canary env; writer fix; redeploy DEV |
| `wouldWrite>0` but `verified=0` | **`code_defect`** | transport retry / budget / reclaim; fix + re-prove |
| Unique person × many targets spam | **`logic_defect`** | unique-person-first selection |
| Card residual | `optional_product` | ignore unless site needs badges |
| Dual owner same slot different checksum | `physical_boundary` | table only after export+checksum proof |
| Main C From null | `physical_boundary` / transport | exclude until readable; do not invent From |

### Explicit rewrite (hard rule)

```text
IF reason CONTAINS any of:
  missing_raw_blob
  exporting source credential
  owner scan incomplete
  target_write_unsupported
  target_attestation_invalid
  recovery queued
THEN class := agent_owned_software
     action := export | fix code | replan | write
     NEVER class := human_physical_enroll
UNTIL three distinct recoveries fail with byte-level proof
```

---

## 5. API contracts (use these, not invent)

### Auth

```http
POST /api/auth/login
{"email":"admin@bandai.local","password":"password123","appCode":"hris"}
```

### Scope / matrix

```http
GET  /api/device/sync-preview?quick=true
POST /api/device/hikvision/sdk-users/merge/plan
{"deviceIds":["cmrht5s2w00ei7zgsre8y3o5n","cmpxw13hx002h7zwso7dyedrn","cmripjwkw00ffl0013lfxcbxw","cmriu5ab102goi001x9o7nfct","cmrim1zop05ik7zp4zgm2sm4k"]}
```

### Decision close (profile)

```http
POST /api/device/hikvision/sdk-users/merge/review
{"planId":"...","selectedUserKeys":["vendor:1",...],"autoResolveDecisions":true,"applyAll":"A"}

POST /api/device/hikvision/sdk-users/merge/jobs
{"planId":"...","mode":"users","selectedUserKeys":[...],"autoResolveDecisions":true,"applyAll":"A","expectedScopeHash":"...","dryRun":false}
```

Only for conflict keys that still need panel profile align. Prefer majority A/B/D/F over skewed E dates when auto-resolving.

### Credential recovery (face / FP)

```http
POST /api/device/hikvision/sdk-users/merge/recovery/review
{"planId":"...","canaryModality":"face","maxVerifiedWrites":50}

POST /api/device/hikvision/sdk-users/merge/recovery/jobs
{"planId":"...","dryRun":true,"canaryModality":"face","maxVerifiedWrites":50}

POST /api/device/hikvision/sdk-users/merge/recovery/jobs
{"planId":"...","dryRun":false,"canaryModality":"face","maxVerifiedWrites":50}

GET  /api/device/hikvision/sdk-users/merge/recovery/jobs/:jobId
```

Repeat with `canaryModality":"fingerprint"`.

### Export / custody (for blob gap)

```http
POST /api/device/:deviceId/users/biometric-metadata/backfill
{"execute":true, ... exact selected user scope from plan ...}
```

Use exact selected source users from residual rows — never full-device unscoped thrash.

### Certainty law

```text
maxVerifiedWrites = min(50, readyForModality)
wouldWriteCount   = deterministic from preview
verified          ≤ wouldWriteCount
UI chip           ≠ ready ops ≠ verified (always replan for chip truth)
```

---

## 6. Durable VM requirement (leave-safe)

People loop alone is **not enough**. ROOT must ship one of:

### Option A (preferred): extend existing supervisor

File: `appliance/bin/project-truth-af-burn-loop.sh`  
Deploy to: `/opt/project-truth/bin/project-truth-af-burn-loop.sh`

After `missing_any==0`:

1. Do **not** only `sleep 180` forever.
2. Enter **credential phase**:
   - plan A/B/D/E/F
   - if decisions>0 → decision resolve wave
   - face recovery wave (preview/dry/write)
   - fp recovery wave
   - if wouldWrite=0 → write `BLOCKER.json` with class + next code fix; still re-plan next cycle
3. Heartbeat: `decision= uFace= uFp= faceReady= fpReady= job=`
4. `nohup` + pid + lock (already pattern exists)

### Option B: new script

`appliance/bin/project-truth-af-cred-burn-loop.sh`  
Logs: `/var/log/project-truth/af-cred-burn/`

Either way: **prove with SSH** after host disconnect simulation:

```bash
ssh project-truth-hris 'cat /var/log/project-truth/af-cred-burn/STATUS.md; tail -n 20 /var/log/project-truth/af-cred-burn/HEARTBEATS.log; pgrep -af af-cred || pgrep -af af-burn'
```

---

## 7. Observability (mandatory every cycle)

| Signal | Where | Use |
|---|---|---|
| `credential_recovery_write_progress` | Loki / API logs | named stage, target, ok/fail |
| Job counters | recovery job JSON | verified, blocked, ready |
| Plan residual | plan JSON | decision / modality ops |
| Pod OOM / restart | `kubectl -n dev` | failed_stale → replan not panic |
| SSH tunnel | `cloudflared-bnpi-hris.service` | must stay active |
| Grafana | optional `:53000` | only after API proof |

On bare “Bad Request” / unknown: **insufficient observability is a defect** — add stage ids, then retry.

---

## 8. Residual matrix template (every cycle file)

Write `matrix-cycle-NNN.json` + markdown:

```text
### Residual: decision = N
| Bucket | Count | What | Class | Next |

### Residual: unique_fp = N
| Bucket | Count | What | Class | Next |

### Residual: unique_face = N
| Bucket | Count | What | Class | Next |

### Per-row samples (≤10 each)
| vendorId | modality | source→target | why | next |

### KPI delta
| Metric | prev | now | Δ |
```

Never report bare `decision=6` without rows (vendor 1,13,14,15,16,1751 seed if still present).

---

## 9. Seed decision rows (re-verify; may already be stale)

| vendorId | fields | Typical B vs E |
|---:|---|---|
| 1 | validFrom | B newer vs E epoch |
| 13 | displayName | rey jhon vs bryan |
| 14 | validFrom,validTo | 1-day skew |
| 15 | validFrom,validTo | window skew |
| 16 | validFrom,validTo | 1-day skew |
| 1751 | validFrom,validTo | 1-day skew |

Close these first (fast win) so DECISION chip does not block mental model of “merge stuck.”

---

## 10. HEARTBEAT format

```text
HEARTBEAT | cycle=N | planId= | uniqueIds= | decision= | uFace= | uFp= | faceReady= | fpReady= | wouldFace= | wouldFp= | job= | verified= | blocker= | vm_supervisor= | next=
```

Min **25** heartbeats or full EXIT GATE.

---

## 11. Code surfaces to open when locked (agent-owned)

| Area | Paths (start here) |
|---|---|
| Merge plan / conflicts | `hris-api/app/device/*merge*` / sdk users merge planner |
| Recovery job | recovery job service in device controller/service |
| Export / backfill | biometric-metadata backfill routes |
| Face writer / attestation | face canary env, FDLib import path |
| FP owner scan gate | fingerprint target owner scan completeness |
| Success false-fail | `isHikvisionManualCopyAttemptSuccess` |
| Job stale resume | `selectedUserKeys` / `remainingUserKeys` |
| UI chips | `hris-app/.../enroll.tsx` residual chips (honesty only) |
| VM supervisor | `appliance/bin/project-truth-af-burn-loop.sh` |

Fix → unit/contract test → commit → push `develop` → wait DEV image → re-prove live.

---

## 12. What “done” looks like in numbers

| Metric | Fail (stuck) | Success |
|---|---|---|
| Decision | 6 forever | **0** |
| Unique face residual | 459 flat forever | **falling each write cycle → 0** or physical_boundary table only |
| Unique FP residual | 372 flat + fpReady=0 | **fpReady>0 + verified FP + residual falling** |
| Missing people E | already 0 | stay 0 |
| VM after you leave | host scripts dead | **credential supervisor heartbeats continue** |

---

## 13. Related docs (read, do not replace this card)

- `docs/00-product/AGENT-PROMPT-overnight-agent-owned-blocker-fix-and-gap-burn.md`
- `docs/00-product/AGENT-PROMPT-merge-users-zero-decision-fp-face-gap-multiagent.md`
- `docs/00-product/AGENT-PROMPT-five-device-full-credential-convergence.md`
- `docs/00-product/HIKVISION_CREDENTIAL_RECOVERY_ARCHITECTURE.md`
- `docs/00-product/HIKVISION_CREDENTIAL_MERGE_EXECUTION_STANDARD.md`

---

## 14. Operator one-liner

> People headcount is done. Residual chips are software work.  
> Do not get locked. Export blobs, fix gates, auto-resolve decisions,  
> write face/FP waves, and put a **credential** durable loop on the VM.
