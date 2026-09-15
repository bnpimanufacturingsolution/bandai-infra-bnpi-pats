# Overnight Agent-Owned Job — Blocker Fix + Preview/Dry-Run Gap Burn

You are the **root owner-operator agent** for Project Truth credential recovery.

| | |
|---|---|
| **Repo** | `C:\Users\stari\bandai-infra` on `develop` |
| **Runtime** | K3s **DEV only** — VM `project-truth-bnpi-pats` / `10.184.37.19` |
| **Mode** | Multi-subagent, root-coordinated, continuous loop |
| **Forbidden** | Windows npm / Docker Desktop / WSL as Project Truth runtime |

**Goal:** unique face people + unique FP people + residual credentialWrites keep
getting **less**, because every cycle **predicts** what will run, **dry-runs**,
**executes**, **matches verified to preview**, and **fixes code/architecture
blockers** that fake “physical action required.”

There is **no** honest “physical fingerprint enroll in the room” for:

```text
Recovery needed: Exporting source credential
Target-wide fingerprint owner scan is incomplete for N enrolled identities.
Export and checksum every target owner before mutation.
```

That is **agent-owned**: SDK export + checksum custody + planner gate. Treat it
as a **code/architecture defect** until `fingerprintReady > 0` and FP writes
verify.

---

## 0. Paste-ready root kickoff

```text
Execute docs/00-product/AGENT-PROMPT-overnight-agent-owned-blocker-fix-and-gap-burn.md
as ROOT agent. Spawn many explore/exec subagents; root owns the loop.
K3s DEV only. Devices A/B/D/E/F only (never Main C / TEST).

Every cycle:
  plan five devices
  → review(executionPreview face + fingerprint)
  → dryRun both
  → if wouldWriteCount>0: start write job (max 50), poll, match verified
  → if wouldWriteCount=0: FIX the named blocker in code/export path (not stop)
  → never label exportable owner-scan incomplete as permanent physical action

Loop until unique face people, unique FP people, and residual writes fall.
Heartbeat every cycle (min 20). Watch kubectl/Loki. Commit/push when green.
Use richest-source selection and unique-person-first waves. No human homework.
```

---

## 1. EXIT GATE

Stamp: `.runtime/overnight-blocker-fix-gap-burn-YYYYMMDD-HHMMSS/`

| # | Required | Evidence |
|---|---|---|
| 1 | Live API includes executionPreview + multi-device face canary + transport-retry budget fix | image state, printenv, health |
| 2 | Every write job had preview + dryRun first | `preview-*.json`, `dry-run-*.json` |
| 3 | Write jobs: `0 < verified ≤ wouldWriteCount` (or fixed mismatch with commit) | job finals |
| 4 | Residual `credentialWrites` **↓** vs baseline | plan matrix |
| 5 | Unique face people **↓** vs baseline | matrix unique count |
| 6 | Unique FP people **↓** **or** `fingerprintReady` went **0 → N>0** with verified FP writes | matrix + jobs |
| 7 | Non-B targets get verified writes (A/D/E/F) | write_progress logs |
| 8 | Owner-scan incomplete is **not** left as unfixed “physical” forever | code path + unlock proof |
| 9 | No bare Bad Request; transport retries don’t burn canary to verified=0 | logs |
| 10 | STATUS.md + WWG handoff; ≥20 heartbeats | stamp + chat |

**Hard bans**

- Stopping because UI says “physical action required” when reason is **export/checksum/scan incomplete**.
- Starting write when `wouldWriteCount=0`.
- Unscoped recovery (missing `canaryModality`) — card path burns.
- Declaring done on B-only success while unique face/FP still high.

---

## 2. Scope

| Device | ID | LAN |
|---|---|---|
| B | `cmpxw13hx002h7zwso7dyedrn` | 10.184.37.20 |
| A | `cmrht5s2w00ei7zgsre8y3o5n` | 10.184.37.21 |
| D | `cmripjwkw00ffl0013lfxcbxw` | 10.184.37.23 |
| E | `cmriu5ab102goi001x9o7nfct` | 10.184.37.24 |
| F | `cmrim1zop05ik7zp4zgm2sm4k` | 10.184.37.25 |

**Exclude:** Main C, TEST A/B.  
Admin: `admin@bandai.local` / repo password / `appCode=bnpi-pats`. Never print tokens.

```powershell
ssh -i "$env:USERPROFILE\.ssh\node-health-appliance_ed25519" infra@10.184.37.19
# fallback
ssh project-truth-bnpi-pats
```

API: `http://127.0.0.1:3101` on VM.

---

## 3. Live seed (re-measure every run)

Proven session trajectory (recheck; do not invent):

| Metric | Early baseline | Later observed | Meaning |
|---|---:|---:|---|
| Residual writes | ~2813 | ~1942→2232 mid-burn | Ops queue |
| faceReady | ~1947 (A/D/E/F) | falling | Auto face writes |
| Unique face people | ~690 | ~486–528 falling | **Primary face KPI** |
| fingerprintReady | 0 | often still 0 | FP blocked by scan gate |
| Unique FP people | ~306 | flat until unlock | **Primary FP KPI** |
| Preview wouldWrite face | 50 | 50 match verified | Certainty works |
| Non-B FDLib rereads | — | hundreds | Not B-only |

**API laws**

```text
maxVerifiedWrites = min(50, max(0, n))
wouldWriteCount   = min(readyForModality, maxVerifiedWrites)  # deterministic preview
verified         ≤ wouldWriteCount after success
recovered alone does NOT lower inventory gaps
UI gap ≠ plan rows ≠ ready queue
```

Must be live:

- multi-device `HIKVISION_AUTHORIZED_FACE_CANARY_DEVICE_ID` = A,B,D,E,F  
- `executionPreview` + dryRun (`cec3b6f+`)  
- transport retry budget fix (`39d5a7d` unique-person + permanent-budget) when available  

---

## 4. Blocker taxonomy (do not mislabel)

| UI / plan reason | Real class | Agent action |
|---|---|---|
| **Exporting source credential** / `target_owner_scan_incomplete` / “N enrolled identities” | **Code/architecture + SDK export** | Export+checksum target owners; fix gate if over-strict; **not** human enroll |
| `target_write_unsupported` / `target_attestation_invalid` | **Config/code canary** | Multi-canary + FDLib persist; serial canary per target |
| `wouldWriteCount>0` but `verified=0` + `awaiting_replan` after ECONNRESET | **Code defect** (budget burn / claim fence) | Fix permanent-budget + reclaim retrying tasks (`39d5a7d`) |
| Multi-target spam (same person × A/D/E/F) | **Logic defect** | Unique-person-first selection |
| `canonical_identity_unproven` | Identity linkage | Prefer richest source with proven employee/card; only then true physical |
| `source_conflict` | Real multi-source ambiguity | Checksum superset / richest source; refuse invent |
| `physical_identity_adjudication_required` | **Only if** after export+linkage still blocked | Document; do not use this bucket for scan incomplete |
| Card “not implemented” | Wrong job scope | Always set `canaryModality` face\|fingerprint |

### Explicit rewrite rule for the message you quoted

```text
UI: "Recovery needed: Exporting source credential"
UI: "Target-wide fingerprint owner scan incomplete for N identities"

ROOT MUST TREAT AS:
  agent_owned_export_gate
NOT:
  physical_action_required / human enroll / stop

DONE FOR THAT TARGET WHEN:
  fingerprintTargetOwnerScans[target].complete == true
  OR planner allows safe per-identity write with proven custody
  AND fingerprintReady > 0 for that target after replan
```

---

## 5. Multi-agent graph (root coordinates)

```text
                         ROOT LOOP (cycle N)
                                |
        +-----------+-----------+-----------+-----------+
        v           v           v           v           v
   config-SHA   matrix+      preview     logs/Loki   defect
   env/obs      unique KPIs  dryRun      write hits  fixer
        |           |           |           |           |
        +-----------+-----+-----+-----------+-----------+
                          v
                 PREDICT wouldWriteCount
                 uniquePeople in wave
                          |
            +-------------+-------------+
            | would>0                   | would=0
            v                           v
      exec-write                  FIX BLOCKER
      face or FP                  export / gate / canary
      max 1..50                   richest source
            |                           |
            +-------------+-------------+
                          v
                 MATCH verified vs would
                 unique face/FP ↓ ?
                 residual ↓ ?
                          |
                    residual high → next cycle
```

### Subagents

| Agent | Work | Artifact |
|---|---|---|
| **config** | SHA, multi-canary env, health, Grafana/Loki | `01-config.json` |
| **matrix** | plan; residual; unique face/FP people; blocks by target | `02-matrix.json` |
| **preview** | review face+fp with max 50; dryRun both | `03-preview-*.json` |
| **logs** | kubectl/Loki `credential_recovery_write_progress` by target | `04-logs.json` |
| **write-face** | only if face wouldWriteCount>0 | `05-job-face-*.json` |
| **write-fp** | only if fp wouldWriteCount>0 | `05-job-fp-*.json` |
| **unlock-fp** | export path: `canaryModality=fingerprint`, maxWrites=0 **and/or** code fix gate | `06-unlock-fp.*` |
| **richest-source** | for conflicts: pick max custody / checksum superset source | `07-source-choice.json` |
| **defect** | preview≠execute, scan gate wrong, budget burn | code + tests + CI |
| **truth** | STATUS.md, handoff | `99-STATUS.md` |

**One active recovery job max.** Writes serial. Explores parallel.

---

## 6. Certainty contract (every cycle)

### Plan

```http
POST /api/device/hikvision/sdk-users/merge/plan
{ "deviceIds": [B,A,F,D,E] }
```

### Review + executionPreview

```http
POST /api/device/hikvision/sdk-users/merge/recovery/review
{
  "planId": "...",
  "canaryModality": "face",
  "maxVerifiedWrites": 50
}
```

Must read:

| Field | Use |
|---|---|
| `faceReady` / `fingerprintReady` | Ready KPIs |
| `wouldWriteCount` | Exact writes this job attempts |
| `wouldWriteUniquePeople` | Unique people in wave (if present) |
| `wouldWriteByTarget` | Where gaps fall (A/D/E/F expected for face) |
| `wouldWriteOperationIds` | Frozen op list |
| `blockReasonsWhenZeroReady` | **Fix these** — do not stop as physical |
| `certainty` | `deterministic_from_plan` |

### Dry-run

```http
POST .../recovery/jobs
{
  "planId", "expectedScopeHash",
  "canaryModality": "face"|"fingerprint",
  "maxVerifiedWrites": 50,
  "dryRun": true
}
```

`willCreateJob: false`. Same wouldWriteCount.

### Execute only if wouldWriteCount > 0

Poll until terminal. **Match rule:**

```text
PASS: 0 < verified ≤ wouldWriteCount
FAIL: verified=0 after write intended → defect agent (budget/retry/transport)
FAIL: wouldWriteCount=0 but you started write job → agent discipline defect
```

---

## 7. Main loop (blocker-fix + burn)

```text
HEARTBEAT | cycle=N | residual=R | uniqueFace=U | uniqueFp=V
  | faceReady=F | fpReady=P | faceWould=W | fpWould=X
  | verifiedLast=Y | targets=A:n,D:n,E:n,F:n | defect=... | next=...

1) config: health, SHA, multi-canary, obs up, zero writers
2) matrix: plan; compute uniqueFace/uniqueFp residual
3) preview face + fp + dryRun both
4) BRANCH (success-first):
   A. if faceWould > 0:
        write-face 50; match; logs must show non-B
   B. else if fpWould > 0:
        write-fp 50; match
   C. else if blockReasons include target_owner_scan_incomplete
        OR UI "Exporting source credential":
        → UNLOCK-FP PATH (section 8) — agent-owned, not physical stop
   D. else if face block target_attestation_invalid:
        verify multi-canary; canary maxWrites=1 per target; persist FDLib
   E. else if only true identity/source_conflict after export+linkage:
        document named residual (rare)
5) if uniqueFace not ↓ after ≥50 face verified → force unique-person selection (code)
6) if predict≠actual → defect fix, deploy, continue
7) stop only EXIT GATE or AGENTS.md real stops
```

Min **20** heartbeats.

---

## 8. UNLOCK-FP path (the message you quoted)

### 8.1 What the gate is

Code: `gateFingerprintWritesForTargetOwnerScan`  
Any target with enrolled FP owners missing slot/checksum evidence blocks
**all** ready FP writes to that target (`target_owner_scan_incomplete`).

UI stage: **Exporting source credential**.

### 8.2 What to do (ordered)

1. **List missing owners** from plan `fingerprintTargetOwnerScans` / block samples  
   (e.g. “incomplete for 11 enrolled identities” → 11 export tasks).  
2. Start recovery:  
   `canaryModality=fingerprint`, `maxVerifiedWrites=0`  
   so worker runs `target_owner_capture` / source export, not fake writes.  
3. Replan → require `fingerprintReady` **increase** (0 → N).  
4. If still 0 after exports succeeded in logs:  
   **code defect** — gate over-strict or export not attaching checksums → defect agent:  
   - prove export path stores `_fingerprintTemplateChecksums`  
   - optionally allow write when **this** source+target person have complete custody  
     even if other unrelated owners pending (only with tests + safety comments)  
5. When `fingerprintReady>0`: canary maxWrites=1 → waves 50.  
6. Prefer **richest source** (highest FP count / complete checksum set / superset).  

### 8.3 Never do

- Call this “physical action required” and stop.  
- Start FP write jobs with wouldWriteCount=0.  
- Invent templates.

---

## 9. Face path (keep unique people falling)

1. Multi-canary live → faceReady on A/D/E/F.  
2. Unique-person-first selection (code): diversify people per wave of 50.  
3. Preview should show high `wouldWriteUniquePeople`.  
4. Logs must list Device A/D/E/F rereads.  
5. Residual and uniqueFace must both trend down each successful cycle.

Historical proof: residual 2813→~1900+, unique face 690→~480+ while faceReady burns.

---

## 10. Richest-source / conflict workarounds

When `source_conflict` or multi-source:

1. Prefer source with **complete raw custody** + highest count.  
2. Prefer **checksum superset** of peer templates.  
3. Prefer same canonical employee + exact shared card.  
4. Never invent bytes.  
5. If only true dual-owner physical conflict remains after custody, document as
   residual (not the owner-scan case).

---

## 11. Observability

```bash
sudo project-truth-bnpi-pats-observability-start   # if down
kubectl -n dev logs deploy/bnpi-pats-api -c api --since=30m | grep credential_recovery
# Loki: {stack="bnpi-pats-k3s",namespace="dev",container="api"} |= "credential_recovery"
```

Per success: modality, vendorUserId, source/target, stage=copy_success, device name.  
Transport: `device_transport` / ECONNRESET → must **retry**, not kill canary budget.

---

## 12. Defect playbook (architecture/code, not room)

| Symptom | Fix class |
|---|---|
| Owner scan incomplete forever after exports | Export attach bug or gate too strict → code |
| verified=0 after would=50 + ECONNRESET | Budget/claim fence → permanent-only budget + reclaim (`39d5a7d`) |
| Face ready only B | Multi-canary env/parser |
| Unique face flat after 200 verified | Unique-person selection not live → deploy |
| Card not implemented floods | Missing canaryModality |
| Bare Bad Request | Name ISAPI fields |

Defect agent: test → fix → push → CI → ansible-pull API-only → re-preview → continue.

---

## 13. Scripts

- `/tmp/overnight-gap-loop-engine.py` (or stamp copy) — plan→preview→dryRun→write  
- `start-fp-recovery.py` — unlock when fpReady=0  
- `truth-matrix-by-target.py` / `obs-truth-summary.py`  
- Prefer engine that tracks **uniqueFace / uniqueFp** each HEARTBEAT  

---

## 14. Success curve (what less-and-less looks like)

```text
Cycle 0:  residual≈2800  uniqueFace≈690  uniqueFp≈306  faceReady≈1900  fpReady=0
Face burn: residual↓  faceReady↓  uniqueFace↓  logs A/D/E/F
FP unlock: fpReady 0→N  then uniqueFp↓
End: residual mostly true identity/conflict only; scan-incomplete gone
```

---

## 15. Closing template

```text
Baseline residual=… uniqueFace=… uniqueFp=… faceReady=… fpReady=…
Final residual=… uniqueFace=… uniqueFp=… faceReady=… fpReady=…
Face verified=… FP verified=… non-B log hits=…
Owner-scan incomplete: fixed|remaining(N) with evidence
Preview mismatches fixed: [SHAs]
Jobs: […]
Evidence: .runtime/overnight-blocker-fix-gap-burn-…
EXIT GATE: green|partial
```

---

## Related

- `docs/00-product/AGENT-PROMPT-overnight-multiagent-gap-loop-with-execution-preview.md`  
- `docs/00-product/AGENT-PROMPT-overnight-five-device-gap-convergence-stable-job.md`  
- Evidence: `.runtime/overnight-gap-loop-20260725-075850/`,  
  `.runtime/overnight-biometric-convergence-20260724-230000/`
