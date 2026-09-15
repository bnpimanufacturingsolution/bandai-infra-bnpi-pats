# Agent-Owned Multi-Agent Job — Zero Face/FP Gaps (Target-Balanced + Richest)

You are the **ROOT owner-operator agent**. You spawn and coordinate many
explore/exec subagents. You own the loop until UI **Face gaps → 0** and
**Fingerprint gaps → 0** on the five Main Entrance devices, or until only
explicit hard residuals remain with evidence.

| | |
|---|---|
| **Repo** | `C:\Users\stari\bandai-infra` on `develop` |
| **Runtime** | K3s **DEV only** — `project-truth-bnpi-pats` / `10.184.37.19` |
| **Mode** | Multi-subagent, root-coordinated, continuous |
| **Forbidden** | Windows npm / Docker Desktop / WSL as Project Truth runtime |
| **Policy already live** | `c5d43a0` richest-source overwrite (prove still live) |

**Operator intent (do not re-litigate):**

- Richest source is default; same vendor id target may be overwritten.
- Fastest **stable** path: burn ready queues with **target-balanced** waves
  (A/D/E parallel inside one job), not serial E-only.
- Dual-owner different vendorUser slots stay blocked.
- Do not invent biometrics.
- One active recovery job max.
- No human homework.

---

## 0. Paste-ready root kickoff

```text
Execute docs/00-product/AGENT-PROMPT-zero-gap-target-balanced-richest-multiagent.md
as ROOT. Spawn explore/config/matrix/preview/logs/defect/write/ui/truth subagents.
K3s DEV only. Devices A/B/D/E/F only (never Main C / TEST).

GOAL: UI Face gaps=0 AND Fingerprint gaps=0 (or hard residual only with names).

NOW:
  1) Kill host engines that start extra recovery jobs; drain or let single API job finish
  2) Prove SHA c5d43a0+ live; multi-canary; Grafana/Loki up
  3) IMPLEMENT target-balanced FP (and face) write selection so each wave of 50
     spreads across A/D/E/F targets — unlock in-job multi-target parallel
     WITHOUT same-device parallel, WITHOUT raising 50-cap first, WITHOUT dual-owner overwrite
  4) UI: richest source clearly labeled on merge gap/decision rows + recovery copy
  5) Unit tests green; push develop; ansible-pull API (+ app if UI); prove SHA
  6) Plan → dual preview/dryRun → show wouldWriteByTarget diversified
  7) Execute FP then face waves; match verified; residual/uniqueFace/uniqueFp ↓
  8) When ready≈0: residual identity/dual-owner work only
  9) STATUS + handoff; ≥15 heartbeats

Hard bans: second concurrent recovery job; invent templates; redeploy mid-write
unless job terminal; claim UI zero from ready queue alone.
```

---

## 1. Why current path is slow (from live evidence)

Proven before this card:

| Observation | Implication |
|---|---|
| FP wave ~18–19s/person on Device E | Device reread bound, not CPU |
| Waves skewed **B → E** heavily | Same-target serial → ~15 min/50 |
| Code already `Promise.all` by **target** | Diversify targets → real wall-clock speedup |
| Same device parallel | **Forbidden** (lease / ISAPI) |
| Job `verified` mid-wave = 0 | Normal; jumps at terminal |
| Richest SHA | `c5d43a0` when last measured |
| source_conflict | 20 → 3 after richest (keep that) |

**Do not “speed up” by:** dual jobs, skipping physical reread proof, overwriting other vendor users, inventing bytes.

**Do speed up by:** target-balanced selection + keep richest + keep one job + fewer wasted E-only waves.

---

## 2. EXIT GATE

Stamp: `.runtime/zero-gap-balanced-richest-YYYYMMDD-HHMMSS/`

| # | Required | Evidence |
|---|---|---|
| 1 | SHA ≥ c5d43a0 + target-balance commit live | printenv, image state |
| 2 | Selection unit tests for multi-target diversity | test log |
| 3 | Dry-run FP wouldWriteByTarget has ≥2 non-B targets when ready exists on ≥2 | dry-run JSON |
| 4 | Execute waves: 0 < verified ≤ would (or fixed defect) | job finals |
| 5 | Wall time per 50-wave **↓** vs E-only ~15 min baseline (or prove multi-target concurrent in logs) | timestamps |
| 6 | residual / uniqueFace / uniqueFp **↓** vs baseline | matrix |
| 7 | UI strings show RICHEST SOURCE default | enroll.tsx + optional Playwright |
| 8 | Grafana/Loki show copy_success multi-device | log snippets |
| 9 | When ready≈0: hard residual only named | block histogram |
| 10 | STATUS + ≥15 heartbeats; push green | stamp |

**UI zero gate (final):**

```text
replan → faceReady=0, fpReady=0
AND UI Face gaps=0 AND Fingerprint gaps=0
OR documented hard residual people with blockingReason in:
  canonical_identity_unproven | physical_identity_adjudication_required
  | leftover true source_conflict after richest
```

---

## 3. Scope

| Device | ID | LAN |
|---|---|---|
| B | `cmpxw13hx002h7zwso7dyedrn` | 10.184.37.20 |
| A | `cmrht5s2w00ei7zgsre8y3o5n` | 10.184.37.21 |
| D | `cmripjwkw00ffl0013lfxcbxw` | 10.184.37.23 |
| E | `cmriu5ab102goi001x9o7nfct` | 10.184.37.24 |
| F | `cmrim1zop05ik7zp4zgm2sm4k` | 10.184.37.25 |

Exclude Main C, TEST. Admin `admin@bandai.local` / repo password / `appCode=bnpi-pats`. Never print tokens.

```powershell
ssh -i "$env:USERPROFILE\.ssh\node-health-appliance_ed25519" infra@10.184.37.19
# fallback
ssh project-truth-bnpi-pats
```

API: `http://127.0.0.1:3101` on VM.

---

## 4. Multi-agent graph (ROOT coordinates)

```text
                         ROOT LOOP
                            |
     +----------+-----------+-----------+-----------+----------+
     v          v           v           v           v          v
  config     matrix     preview/    logs/Loki   defect     truth
  SHA/obs    unique     dryRun      write hits  fixer      STATUS
     |          |           |           |           |          |
     +----------+-----+-----+-----------+-----------+----------+
                      v
              PREDICT wouldWrite + byTarget diversity
                      |
         +------------+------------+
         | would>0                 | would=0 ready
         v                         v
    write FP/face             residual agent
    max 50 balanced           identity / dual-owner
```

| Subagent | Work | Artifact |
|---|---|---|
| **config** | SHA, multi-canary, health, Grafana/Loki ready | `01-config.json` |
| **stop-clean** | Kill host engines; ensure ≤1 API recovery job; no second start | `01b-writers.json` |
| **matrix** | plan; residual; unique face/fp; blocks | `02-matrix.json` |
| **balance-design** | read `selectCredentialRecoveryReadyWrites` / unique-person; design target round-robin | `03-balance-design.md` |
| **balance-impl** | code + tests; do not touch dual-owner gate | PR/commit |
| **ui-richest** | enroll.tsx labels; recovery recommendation visible | UI proof |
| **preview** | review+dryRun face+fp; assert multi-target | `04-preview-*.json` |
| **logs** | kubectl/Loki copy_success by target | `05-logs.json` |
| **write** | serial jobs only if would>0 | `06-job-*.json` |
| **residual** | only after ready≈0 | `07-residual.md` |
| **truth** | STATUS, handoff | `99-STATUS.md` |

**ROOT rules:**

- Explores parallel; **at most one write job**.
- Defect agent owns: verified=0 after would>0, E-only waves after balance deploy, dual-owner regressions.
- Heartbeat every cycle:

```text
HEARTBEAT | cycle=N | residual=R | uFace=U | uFp=V | faceR=F | fpR=P
  | faceWould=W | fpWould=X | byTarget=A:n,D:n,E:n,F:n | verified=Y | next=...
```

Min **15** heartbeats.

---

## 5. Implementation contract — target-balanced selection

### 5.1 Where to change

Primary: `bnpi-pats-api/helper/hikvision-credential-recovery.helper.ts`
function that selects ready writes for a canary wave (`selectCredentialRecoveryReadyWrites` or equivalent unique-person-first).

### 5.2 Required behavior

```text
Input: ready writes for modality, maxVerifiedWrites ≤ 50
Output: frozen operation list

1) Prefer unique-person-first (keep existing anti-spam)
2) ALSO diversify targetDeviceId:
   - Round-robin / least-filled target among remaining candidates
   - Goal: when ready exists on ≥2 targets, wave includes ≥2 targets
3) Never select two concurrent ops that are same person + different targets
   before finishing that person if unique-person-first already says so
   (combine: pick next person, assign best target for them, then next person
    on least-loaded other target when possible)
4) max still min(50, ready)
5) Dual-owner / identity blocked rows never enter ready selection
```

### 5.3 Tests (must add)

| Test | Expect |
|---|---|
| Ready ops only on E | wave all E (no invent) |
| Ready on A,D,E | wave of 50 has ≥2 targets (ideally 3 when enough people) |
| Unique person still not multi-target spam in one wave | at most one target per person per wave |
| Dual-owner blocked not selected | unchanged |

### 5.4 Optional later (NOT first)

- Raise maxWrites 50→100 only after multi-target proven + transport budget stable.
- Do **not** implement same-device parallel.

### 5.5 UI richest (if not already complete)

`bnpi-pats-app/.../enroll.tsx`:

- Fingerprint/face gap rows: `RICHEST SOURCE (default): … overwrite …`
- Decision rows: default richest
- Optional: per-device impact tooltip that recovery uses richest + target-balanced waves

App image rebuild if UI changes.

---

## 6. Runtime phases (execute order)

### Phase A — Stop chaos, one writer

1. Kill: `vm-fp-burn-loop.py`, `vm-fp-first-run.py`, `overnight-gap-loop-engine.py`, `vm-recover-and-run.py`
2. List recovery jobs; if one recovering, **either**:
   - poll until terminal (preserve mid-wave verified), **or**
   - operator already allowed stop: do not start another until active=0
3. Prefer **finish current wave** if &lt;5 min left; else wait terminal; do not stack jobs

### Phase B — Config + observability

```bash
printenv PROJECT_TRUTH_BUILD_SHA   # must include c5d43a0 ancestry
printenv HIKVISION_AUTHORIZED_FACE_CANARY_DEVICE_ID
curl -sS http://127.0.0.1:3101/health
curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/ready   # Loki
# Grafana if present
kubectl -n dev logs deploy/bnpi-pats-api -c api --since=15m | grep credential_recovery | tail
```

### Phase C — Code: balance + tests + push + deploy

1. Implement target-balanced selection + tests  
2. Confirm richest path still in merge helper  
3. UI richest labels  
4. Commit focused files; push `develop`  
5. ansible-pull until new SHA live (API; app if UI)  
6. **Never redeploy while recovery job recovering** — wait active=0  

### Phase D — Certainty dry-run

```http
POST /plan { deviceIds: [B,A,F,D,E] }
POST /recovery/review { planId, canaryModality: fingerprint|face, maxVerifiedWrites: 50 }
POST /recovery/jobs { dryRun: true, ... }
```

Must show:

- `wouldWriteCount` / unique people  
- `wouldWriteByTarget` diversified after balance deploy  
- `willCreateJob: false`  

### Phase E — Burn loop

```text
while true:
  drain active
  plan + dual preview + dual dryRun
  if fpWould>0: execute FP 50 (balanced)
  else if faceWould>0: execute face 50
  else break to Phase F
  poll terminal; require 0 < verified ≤ would (or defect)
  HEARTBEAT
```

### Phase F — Residual to true UI zero

Only when faceReady≈0 and fpReady≈0:

1. Bucket remaining: identity / dual-owner / source_conflict / other  
2. Agent-owned: export raw, link employee where proven, richest same-person only  
3. Document true physical dual-owner with vendor ids  
4. Replan until UI gaps 0 or residual list frozen  

### Phase G — Close

STATUS, handoff, evidence pull to `.runtime/`, commit docs if needed.

---

## 7. Safety rails (do not break what works)

| Keep | Never |
|---|---|
| Richest overwrite same vendor id | Invent templates |
| physical_identity dual-owner block | Overwrite other vendorUser slots |
| One recovery job | Second concurrent job |
| Physical reread for verified | Claim verified from copy without reread |
| max 50 until proven | Blind 500 writes |
| Card fail-closed | Unscoped canaryModality |

---

## 8. Observability success signals

Loki/kubectl:

```text
credential_recovery_write_progress
stage=copy_success
target devices: A and/or D and/or E (not only E)
modality=fingerprint
```

Grafana: API error rate stable; no ECONNRESET storm burning budget.

If after balance deploy logs still **only E** while ready on A/D: **selection defect** — fix, don’t accept.

---

## 9. Heartbeat + subagent spawn pattern

ROOT each cycle:

1. Spawn **config** + **matrix** + **logs** in parallel (read-only)  
2. If code not deployed: spawn **balance-impl** then wait  
3. Spawn **preview**  
4. If would>0: ROOT or **write** agent starts **one** job  
5. Spawn **truth** every 3 cycles for STATUS  

Do not spawn multiple write agents.

---

## 10. Closing template

```text
SHA live=…
Balance commit=…
Baseline residual=… uFace=… uFp=… fpReady=… faceReady=…
Final residual=… uFace=… uFp=… fpReady=… faceReady=…
UI face gaps=… UI fp gaps=… (or NEEDS_CONFIRMATION with API matrix)
Waves: [{would, verified, byTarget, durationMin}]
Multi-target parallel proven: yes/no
Hard residual: identity=… dualOwner=… conflict=…
EXIT: green|partial
Evidence: .runtime/zero-gap-balanced-richest-…
```

---

## 11. Queue position

| Order | Card |
|---:|---|
| Done | Multi-canary face burn; owner-scan soft gate; richest overwrite `c5d43a0` |
| **THIS** | Target-balanced waves + UI richest + burn to zero gaps |
| After | Only named identity/dual-owner if any remain |

When starting a session, paste **section 0** and open this file with tools.
