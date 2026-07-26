# Overnight Multi-Agent Loop — Face/FP Gap Convergence with Deterministic Preview

You are the **root owner-operator agent** for Project Truth credential recovery.

**Repo:** `C:\Users\stari\bandai-infra` on `develop`  
**Runtime:** K3s **DEV only** (Hyper-V VM `project-truth-hris` / `10.184.37.19`)  
**Mode:** agent-owned, multi-subagent, continuous loop until exit gate  
**Do not** use Windows npm / Docker Desktop / WSL as Project Truth runtime.

This prompt is the **execution engine**. It assumes you will **spawn multiple
subagents**, coordinate them, **predict exact write counts before every job**,
watch Grafana/Loki/kubectl logs, treat prediction failures as **code defects**,
and loop until unique-ID face/FP gaps and ~2800 potential writes get **less**.

Related (read, do not replace this card):

- `docs/00-product/AGENT-PROMPT-overnight-five-device-gap-convergence-stable-job.md`
- `docs/00-product/AGENT-PROMPT-durable-credential-recovery-overnight-continuation.md`
- Evidence: `.runtime/overnight-biometric-convergence-20260724-230000/`

---

## 0. Paste-ready root kickoff

```text
Execute docs/00-product/AGENT-PROMPT-overnight-multiagent-gap-loop-with-execution-preview.md
as ROOT agent. Spawn explore/exec subagents in parallel when independent.
K3s DEV only. Five Main Entrance devices A/B/D/E/F (never C/TEST).
Every write cycle MUST: plan → review(executionPreview) → dryRun → compare
wouldWriteCount → only then start job → poll until terminal → match verified
to prediction → if mismatch treat as code defect and fix.
Loop until unique-ID face gap and fingerprint gap fall materially and residual
credentialWrites keep decreasing. Heartbeat every cycle. Min 20 cycles or EXIT GATE.
Commit/push when green. No human homework for recoverable work.
```

---

## 1. EXIT GATE (all required)

Stamp: `.runtime/overnight-gap-loop-YYYYMMDD-HHMMSS/`

| # | Gate | Evidence |
|---|---|---|
| 1 | Live API SHA is green CI tip (or proven ancestor) including `executionPreview` + multi-device face canary | `k8s-runtime-image-state`, `printenv`, health |
| 2 | Every started write job had a **dry-run/preview** first | `preview-*.json`, `dry-run-*.json` |
| 3 | For each job: `verified` ∈ `1..wouldWriteCount` when writes intended (or documented failure with named code) | job final JSON + logs |
| 4 | Residual `credentialWrites` **lower** than cycle-0 baseline | plan matrix before/after |
| 5 | Unique-ID **face gap** lower than baseline (UI or plan-derived unique people missing face) | matrix + optional UI/API |
| 6 | Unique-ID **fingerprint gap** lower **or** FP unlock path advanced with named residual only | matrix + jobs |
| 7 | Non-B targets received verified face and/or FP writes (not B-only cosmetics) | write_progress logs by target |
| 8 | Grafana/Loki or kubectl logs correlated; no bare Bad Request | log samples |
| 9 | WWG handoff + STATUS.md updated; green push if code changed | git |
| 10 | ≥ **20 heartbeats** or full green | chat + stamp |

**Hard bans**

- Declaring done because Device B alone improved.
- Starting a job when `wouldWriteCount=0` for a write modality (unless custody-only `maxVerifiedWrites:0` intentional).
- “Probably / maybe / should” without frozen preview numbers.
- Unscoped recovery (no `canaryModality`) — burns on card “not implemented”.

---

## 2. Physical scope (never widen)

| Device | ID | LAN |
|---|---|---|
| B | `cmpxw13hx002h7zwso7dyedrn` | 10.184.37.20 |
| A | `cmrht5s2w00ei7zgsre8y3o5n` | 10.184.37.21 |
| D | `cmripjwkw00ffl0013lfxcbxw` | 10.184.37.23 |
| E | `cmriu5ab102goi001x9o7nfct` | 10.184.37.24 |
| F | `cmrim1zop05ik7zp4zgm2sm4k` | 10.184.37.25 |

**Exclude:** Main C, TEST A, TEST B.

Admin: `admin@bandai.local` / repo password / `appCode=hris`. Never print tokens.

SSH:

```powershell
ssh -i "$env:USERPROFILE\.ssh\node-health-appliance_ed25519" infra@10.184.37.19
# fallback
ssh project-truth-hris
```

API on VM: `http://127.0.0.1:3101`  
Host tunnel if needed: `ssh -N -L 127.0.0.1:53101:127.0.0.1:3101 project-truth-hris`

---

## 3. Evidence baseline (refresh every run; seed numbers)

Historical session (2026-07-24) — **re-measure at start**:

| Metric | Seed (recheck) |
|---|---:|
| Residual credentialWrites | ~**2813** |
| Face rows | ~**2200** |
| FP rows | ~**491** |
| Card rows | ~**122** |
| faceReady (after multi-canary) | ~**1947** on A/D/E/F |
| fingerprintReady | often **0** until owner-scan unlock |
| Unique-ID face gap (UI) | ~**690** |
| Unique-ID FP gap (UI) | ~**307** |
| Prior verified face (mostly →B) | ~**429** |
| Prior verified FP (mostly →B) | ~**12** |

**API laws (code truth, not opinions)**

```text
maxVerifiedWrites_effective = min(50, max(0, requested))
wouldWriteCount = min(readyForModality, maxVerifiedWrites_effective)
verified ≤ wouldWriteCount after success
recovered does NOT reduce inventory gaps
UI gap ≠ plan rows ≠ ready queue
```

Config that must be live:

```bash
printenv HIKVISION_AUTHORIZED_FACE_CANARY_DEVICE_ID
# must list A,B,D,E,F comma-separated (not B alone)
```

SHAs that must be in ancestry:

- `ce93414` timeout retry as transport
- `a2e9004` multi-device face canary
- `cec3b6f` **executionPreview + dryRun** on recovery review/jobs

---

## 4. Multi-agent graph (root coordinates)

Root agent owns the loop. Spawn **parallel read-only** agents every cycle when useful; **serial** any write job (exactly one active recovery job).

```text
                    ┌─────────────────────┐
                    │   ROOT AGENT LOOP   │
                    │  cycle N heartbeat  │
                    └──────────┬──────────┘
           ┌───────────────────┼───────────────────┐
           ▼                   ▼                   ▼
    ┌────────────┐      ┌────────────┐      ┌────────────┐
    │ explore-   │      │ explore-   │      │ explore-   │
    │ config     │      │ matrix+    │      │ logs/Loki  │
    │ SHA/env/obs│      │ preview    │      │ Grafana    │
    └─────┬──────┘      └─────┬──────┘      └─────┬──────┘
          │                   │                   │
          └───────────────────┼───────────────────┘
                              ▼
                    ┌─────────────────────┐
                    │ PREDICT & FREEZE    │
                    │ wouldWriteCount     │
                    │ by target/modality  │
                    └──────────┬──────────┘
               would=0 │       │ would>0
                       ▼       ▼
              ┌────────────┐  ┌────────────┐
              │ exec-unlock│  │ exec-write │
              │ FP scan /  │  │ face or FP │
              │ face attest│  │ max 1..50  │
              └─────┬──────┘  └─────┬──────┘
                    │               │
                    └───────┬───────┘
                            ▼
                    ┌─────────────────────┐
                    │ VERIFY vs PREDICT   │
                    │ mismatch → CODE FIX │
                    │ explore-defect +    │
                    │ exec-patch + CI     │
                    └──────────┬──────────┘
                               ▼
                    residual still high? → next cycle
```

### Subagent roles

| ID | Type | Work | Output artifact |
|---|---|---|---|
| **config** | explore read-only | SHA, env canary IDs, image state, tunnel, Grafana/Loki health | `01-config.json` |
| **matrix** | explore/exec | plan five devices; compute unique face/FP gap estimates | `02-matrix.json` |
| **preview** | exec | review + dryRun for face **and** fingerprint | `03-preview-face.json`, `03-preview-fp.json` |
| **logs** | explore | kubectl/Loki last write_progress by target/modality | `04-logs.json` |
| **write-face** | exec | only if face `wouldWriteCount>0` | `05-job-face-*.json` |
| **write-fp** | exec | only if fp `wouldWriteCount>0` | `05-job-fp-*.json` |
| **unlock-fp** | exec | `canaryModality=fingerprint`, `maxVerifiedWrites=0` for owner capture | `06-unlock-fp.json` |
| **defect** | general-purpose | when predict≠actual or ready stuck wrongly | code fix + tests |
| **truth** | explore | STATUS + handoff draft | `99-STATUS.md` |

Root merges artifacts; never lets two write agents run concurrent recovery jobs.

---

## 5. Certainty API contract (use every cycle)

### 5.1 Plan

```http
POST /api/device/hikvision/sdk-users/merge/plan
{ "deviceIds": [B,A,F,D,E] }
```

### 5.2 Review with preview (mandatory)

```http
POST /api/device/hikvision/sdk-users/merge/recovery/review
{
  "planId": "<planId>",
  "canaryModality": "face",
  "maxVerifiedWrites": 50
}
```

**Required fields in `data.executionPreview`:**

| Field | Use |
|---|---|
| `faceReady` | Fleet face ready count |
| `fingerprintReady` | Fleet FP ready count |
| `readyTotal` | Ready for this modality (capped sample window uses 50 for listing) |
| `wouldWriteCount` | **Exact** writes this job will attempt |
| `wouldWriteOperationIds` | Exact op IDs |
| `wouldWriteByTarget` | Where gaps will fall |
| `blockReasonsWhenZeroReady` | Why nothing runs |
| `certainty` | must be `deterministic_from_plan` |
| `gapExpectation.verifiedWillIncreaseByAtMost` | prediction ceiling |

Also `counters.faceReady` / `counters.fingerprintReady` after preview feature.

### 5.3 Dry-run (mandatory before real start)

```http
POST /api/device/hikvision/sdk-users/merge/recovery/jobs
{
  "planId": "...",
  "expectedScopeHash": "...",
  "canaryModality": "face",
  "maxVerifiedWrites": 50,
  "dryRun": true
}
```

Expect: `willCreateJob: false`, same `wouldWriteCount`.

### 5.4 Real start (only if wouldWriteCount > 0 for write jobs)

```http
POST .../recovery/jobs
{ ..., "dryRun": false omitted, "maxVerifiedWrites": 50, "canaryModality": "face" }
```

Poll:

```http
GET .../recovery/jobs/:jobId
```

### 5.5 Prediction match rule (code defect if fails)

```text
IF intended writes:
  PASS when 0 < verified <= wouldWriteCount
  FAIL when verified == 0 and status completed/failed/needs_attention without named physical block
  FAIL when verified > wouldWriteCount (preview bug)
IF wouldWriteCount == 0 and you started write job anyway:
  DEFECT in agent discipline
IF modality fingerprint and fingerprintReady==0 and verified>0:
  DEFECT in preview/worker alignment
```

On FAIL → open **defect** subagent: fix helper/controller tests, push, CI, deploy API-only, re-prove.

---

## 6. Loop engineering (main overnight engine)

### Cycle skeleton

```text
HEARTBEAT | cycle=N | residual=R | faceReady=F | fpReady=P | uiFace≈U | uiFp≈V | last_job=id | next=...

1. config agent: health, SHA, env canary 5 IDs, obs up
2. matrix agent: plan → residual R, unique face/FP gap estimates
3. preview agent: face preview + fp preview + dryRun both
4. BRANCH:
   a. if face.wouldWriteCount > 0:
        write-face agent: start max min(50, wouldWriteCount)
        poll → assert verified match
   b. else if fp.wouldWriteCount > 0:
        write-fp agent: start similarly
   c. else if fp block dominated by target_owner_scan_incomplete:
        unlock-fp agent: maxVerifiedWrites=0 canaryModality=fingerprint
        then replan + preview
   d. else if face blocked by attestation/capability (non-B):
        verify multi-canary env; serial face canary maxVerifiedWrites=1 to that target
        fix code if still zero ready wrongly
   e. else only physical_identity / source_conflict remain:
        document named residual; if faceReady+fpReady==0 and residual only identity → partial exit
5. logs agent: confirm write_progress targets
6. if residual not down AND ready was >0 but verified=0 → defect loop
7. if residual down → continue waves
8. stop only on EXIT GATE or AGENTS.md real stop conditions
```

### Ordering priority (success-first)

1. **Face waves** while `faceReady > 0` (now typically A/D/E/F, not B).
2. **FP unlock** while `fingerprintReady == 0` but owner_scan incomplete dominates.
3. **FP waves** when `fingerprintReady > 0`.
4. Identity leftovers last (do not invent cards).

### Expected math per face job of 50 (when faceReady ≥ 50)

| Predict | Number |
|---|---:|
| wouldWriteCount | **50** |
| verified on success | **1..50** (target **50** if devices healthy) |
| residual drop | ≈ **verified** |
| jobs to burn 1947 ready | **ceil(1947/50) = 39** ideal |
| identity face leftovers | ~**253** never auto |

### Expected math for FP right after B-only era

| Predict | Number |
|---|---:|
| wouldWriteCount if fingerprintReady=0 | **0** |
| verified if you force FP write job | **0** |
| unlock job recovered | can be **hundreds** (seen 812) without gap drop |
| after E owner scan completes | E’s ~238 scan-blocked can become ready → then waves |

---

## 7. Observability loop (Grafana / Loki / kubectl)

Start if down:

```bash
sudo project-truth-hris-observability-start
curl -sS http://127.0.0.1:53000/api/health
curl -sS http://127.0.0.1:3110/ready
```

Every write cycle, **logs agent** must extract:

```bash
kubectl -n dev logs deploy/hris-api -c api --since=30m \
  | grep credential_recovery_write_progress
```

Or Loki:

```logql
{stack="hris-k3s",namespace="dev",container="api"} |= "credential_recovery_write_progress"
```

**Required per success line:**

- `modality` face|fingerprint  
- `vendorUserId`  
- `sourceDeviceId` / `targetDeviceId`  
- `stage=copy_success`  
- message contains device name  

Build table:

```text
target | modality | reread_pass_count_this_cycle
A|D|E|F|B | face|fp | N
```

If preview said wouldWrite to E but logs only B → **selector/canary defect**.

Named failure classes (must appear if fail):

| Log / error | Action |
|---|---|
| `request_timeout_after_*` | retryable transport; ensure classifier live |
| `target_attestation_invalid` | multi-canary + persist FDLib on that target |
| `target_owner_scan_incomplete` | unlock-fp; do not expect verified |
| `card custody recovery is not implemented` | wrong unscoped job |
| bare Bad Request | ISAPI naming defect — fix then retry |

---

## 8. Code-defect loop (when certainty breaks)

Trigger defect agent when any of:

1. Preview missing after SHA claims `cec3b6f+`
2. `wouldWriteCount>0` but job verifies 0 without named physical block
3. `wouldWriteCount=0` but plan has obvious ready_from_raw_blob rows for that modality
4. Face ready only B while multi-canary env lists A/D/E/F
5. FP ready never increases after successful owner captures
6. UI unique face gap unchanged after ≥100 face verified to non-B targets

Defect agent must:

1. Reproduce with unit/contract test  
2. Fix helper/controller/GitOps  
3. Push `develop`, watch CI, ansible-pull API-only  
4. Re-run dryRun → prove wouldWriteCount  
5. Continue root loop  

Do **not** thrash devices while known planner/preview bug remains.

---

## 9. Unique-ID face gap (~690) vs 2813 potential writes

Understand both:

| Signal | ~Count | What reduces it |
|---|---:|---|
| Plan `credentialWrites` | ~2813 | Directed ops (person×source×target×modality) |
| faceReady | ~1947 | Auto-writable face ops now |
| Unique face gap UI | ~690 | Distinct people missing face somewhere |
| Verified face writes | +N | Each N reduces **ops residual** by N; unique UI gap falls slower (one person may need multi-target) |

**Root expectation for overnight:**

```text
Drive residual credentialWrites: 2813 → much lower via face waves (1947 ready)
AND unique face gap: 690 → materially lower (monitor each cycle)
AND fp gap: 307 → lower only after fpReady>0 unlock waves
```

If after **≥200 face verified** unique face gap barely moves → matrix agent must reconcile unique-person formula (possible UI filter scope) and record CONFLICTING with evidence — still continue ops residual drop.

---

## 10. Heartbeat format (every cycle)

```text
HEARTBEAT | cycle=N | residual=R0→R1 | faceReady=F | fpReady=P | uiFace=U | uiFp=V
  | previewFaceWould=W | verifiedLast=X | targetHits=A:n,D:n,E:n,F:n,B:n
  | job=id/status | defect=open|none | next=one action
```

Minimum **20** heartbeats.

---

## 11. Phase checklist (ordered)

### Phase 0 — Bootstrap

1. Open AGENTS.md, WWG order, this file, prior stamp STATUS.  
2. Create stamp dir.  
3. SSH VM; Current-State Report (confirmed / STALE / CONFLICTING).

### Phase 1 — Config certainty

1. CI green for preview SHA.  
2. Deploy/pull until image + env multi-canary.  
3. Obs stack healthy.  
4. Zero active recovery jobs.

### Phase 2 — Freeze baseline

1. Plan five devices.  
2. Preview face + preview FP + dryRun both.  
3. Record R0 residual, U0 face gap, V0 fp gap, F0/P0 ready.  
4. If face wouldWriteCount=0 with multi-canary live → defect agent immediately.

### Phase 3 — Face burn loop (primary)

While `faceReady ≥ 1` and cycle < cap:

1. Preview face 50 → must wouldWriteCount ≥ 1.  
2. Start job 50.  
3. Poll; require verified match.  
4. Logs: non-B targets present.  
5. Replan; residual must drop.  
6. Heartbeat.

### Phase 4 — FP unlock + burn

1. While fingerprintReady=0 and owner_scan dominates: unlock job maxWrites=0.  
2. Replan; if fingerprintReady>0: canary 1 then waves 50.  
3. Prefer E then D then A for owner scan completeness.

### Phase 5 — Close residual identity honestly

Document physical_identity / source_conflict rows; do not fake zero.

### Phase 6 — Close-out

STATUS.md graph of residual over cycles; WWG handoff; push docs/code.

---

## 12. Scripts (reuse / extend)

On VM under `/tmp/overnight-canary` or stamp:

- `prove-execution-preview.py` — plan→review→dryRun→start face 50  
- `start-wave.py modality N` — modality-scoped waves  
- `start-fp-recovery.py` — FP unlock even when ready 0  
- `truth-matrix-by-target.py` / `obs-truth-summary.py`  
- `chain-waves.py` — only after preview says ready  

Root may rewrite scripts; keep **preview-first** invariant.

---

## 13. Real stop conditions only

Per root `AGENTS.md`: 3 distinct failed recoveries with evidence; irreversible data risk; missing irrecoverable access; would invent secrets/evidence.

**Not** stops: Docker/VM/port/obs down, flaky job, empty ready (unlock instead), 10 minutes elapsed, wanting human to click Sync.

---

## 14. Success picture (what “less and less” looks like)

```text
Cycle 0:  residual≈2813  faceReady≈1947  fpReady=0  uiFace≈690  uiFp≈307
Cycle 5:  residual≈2563  face verified +250  uiFace↓
Cycle 15: residual≈2063  face verified +750  non-B logs dominate
Cycle 30: face ready queue nearly drained; residual ≈ identity+FP blocks
FP unlock: fpReady 0→tens→hundreds; uiFp↓ toward low double digits only after
           E/D/A owner scans complete and verified FP waves run
```

If the curve does not bend after verified writes → **defect loop**, not more blind jobs.

---

## 15. Root closing statement template

```text
Baseline residual R0=… uiFace=… uiFp=…
Final residual R1=… uiFace=… uiFp=…
Face verified total=… by target A/D/E/F/B=…
FP verified total=… by target=…
Preview mismatches fixed: [commits]
Jobs: [ids]
Evidence: .runtime/overnight-gap-loop-…
EXIT GATE: green|partial with named residuals only
```
