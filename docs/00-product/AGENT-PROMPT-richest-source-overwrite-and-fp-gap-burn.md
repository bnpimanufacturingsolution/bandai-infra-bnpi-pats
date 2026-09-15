# Agent-Owned Job — Richest-Source Overwrite + FP Gap Burn (Queued)

You are the **root owner-operator agent** for Project Truth credential recovery
after the operator-authorized **richest-source default overwrite** product rule.

| | |
|---|---|
| **Repo** | `C:\Users\stari\bandai-infra` on `develop` |
| **Runtime** | K3s **DEV only** — VM `project-truth-bnpi-pats` / `10.184.37.19` |
| **Mode** | Multi-subagent, root-coordinated, continuous loop |
| **Forbidden** | Windows npm / Docker Desktop / WSL as Project Truth runtime |
| **Policy SHA** | `c5d43a0` (or later) must be **live** on DEV API before claiming rule active |

---

## 0. Paste-ready root kickoff

```text
Execute docs/00-product/AGENT-PROMPT-richest-source-overwrite-and-fp-gap-burn.md
as ROOT agent. Agent-owned end-to-end. K3s DEV only.
Devices A/B/D/E/F only (never Main C / TEST).

QUEUED GOALS (in order):
  1) Prove PROJECT_TRUTH_BUILD_SHA includes c5d43a0+ (richest-source overwrite)
  2) If image lagging: ansible-pull / API-only rebuild until live
  3) Wait for zero active recovery jobs (one writer max)
  4) Plan five devices → matrix of blocks (source_conflict, identity, physical)
  5) Dry-run face + fingerprint (max 50) — record wouldWriteCount + unique people
  6) PROVE conflict flip: source_conflict count ↓ vs pre-c5d43a0 baseline
     and recommendationReason includes "RICHEST SOURCE OVERWRITE" on samples
  7) Execute fingerprint waves (then face if faceWould>0) max 50
     preview → dryRun → execute → verified match
  8) Loop until fpReady / uniqueFp residual hard blocks only
  9) STATUS + handoff; commit/push when green

Hard: never invent biometrics. Never overwrite DIFFERENT vendor-user slots
(physical_identity_adjudication stays blocked). Cards stay fail-closed.
One active recovery job max. No human homework.
```

---

## 1. Product rule (operator-authorized — do not re-litigate)

```text
DEFAULT for recovery / AI-run jobs:
  pick RICHEST source = max raw template count for that modality
  ties → complete checksum custody preferred → stable deviceId
  same vendorUserId target with different templates → OVERWRITE allowed
  UI + recommendationReason must say RICHEST SOURCE OVERWRITE clearly

STILL BLOCKED (not richest-pick):
  physical_identity_adjudication_required  (other vendor user owns slot)
  canonical_identity_unproven              (no proven BNPI PATS employee match)
  missing_raw_blob                         (export first)
  card source_conflict                     (exact card value not proven)
```

Code anchors (must re-open, not invent):

- `bnpi-pats-api/helper/device-user-merge.helper.ts`
  - `resolveFingerprintCredentialSource` → `richest_count_default_overwrite`
  - same-person target overwrite no longer `source_conflict` solely from different checksums
- `bnpi-pats-app/app/routes/admin/devices/enroll.tsx`
  - gap rows: `RICHEST SOURCE (default): … overwrite …`
- Commit: `c5d43a0 feat(recovery): default richest fingerprint/face source with overwrite`

---

## 2. EXIT GATE

Stamp: `.runtime/richest-source-fp-burn-YYYYMMDD-HHMMSS/`

| # | Required | Evidence |
|---|---|---|
| 1 | Live API SHA ≥ `c5d43a0` (ancestor or equal) | `printenv PROJECT_TRUTH_BUILD_SHA` |
| 2 | Zero active jobs before baseline plan | jobs list |
| 3 | Baseline matrix after new SHA: residual, faceReady, fpReady, uniqueFace, uniqueFp, block histogram | `01-baseline-matrix.json` |
| 4 | Dual dryRun face+fp; `willCreateJob:false`; wouldWrite recorded | `02-dry-run-face.json`, `02-dry-run-fp.json` |
| 5 | **Conflict flip proof**: `source_conflict` FP rows **↓** vs pre-deploy baseline **or** sample writes show `RICHEST SOURCE OVERWRITE` | `03-conflict-flip.json` |
| 6 | At least one FP execute wave: `0 < verified ≤ wouldWriteCount` | job final |
| 7 | uniqueFp **↓** and/or fpReady **↓** vs baseline | matrix after ≥1 wave |
| 8 | Non-B targets appear in write_progress when fpReady on A/D/E | kubectl/Loki |
| 9 | UI-facing copy still says richest (code or live review payload) | quote path |
| 10 | STATUS.md + ≥10 heartbeats; no “you should click Sync” exit | stamp |

**Hard bans**

- Claiming richest rule live while SHA is still `11ea34f` / pre-`c5d43a0`
- Starting execute with `wouldWriteCount=0`
- Unscoped job (missing `canaryModality`)
- Treating dual-owner `physical_identity_adjudication_required` as richest overwrite
- Stopping because UI “Needs review” still high while ready queue is burnable

---

## 3. Scope

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

## 4. Live seed (re-measure — do not invent)

Proven trajectory before richest deploy (recheck):

| Metric | Observed mid-burn | Notes |
|---|---:|---|
| Residual | ~817–866 after face drain | Falling |
| faceReady | 0 | Face auto-queue drained |
| unique face people | ~96 | Matches UI face gaps ~96 |
| fingerprintReady | ~368–417 | Burning |
| unique FP people | ~257–306 | Falling with FP waves |
| source_conflict (old code) | ~20 | **Must re-count after c5d43a0** |
| Last FP job | 49/50 needs_attention | Partial match OK if 0&lt;v≤would |
| Live SHA when queued | `11ea34f` | **c5d43a0 not yet live** |

API laws (unchanged):

```text
maxVerifiedWrites = min(50, max(0, n))
wouldWriteCount   = min(readyForModality, maxVerifiedWrites)
dryRun: willCreateJob=false, same wouldWriteCount
verified after success: 0 < verified ≤ wouldWriteCount
UI gap ≠ plan rows ≠ ready queue
Needs review IDs ≠ fpReady
```

---

## 5. Ordered phases (do not reorder)

### Phase A — Deploy certainty (blocker until green)

1. `printenv PROJECT_TRUTH_BUILD_SHA` on `deploy/bnpi-pats-api`
2. If not ancestor of / equal to `c5d43a0`:
   - `sudo systemctl start project-truth-ansible-pull.service`
   - watch until services include `bnpi-pats-api` or SHA updates
   - at least 3 recovery paths if stuck (timer, manual pull, rebuild status file)
3. Record `01-config.json`: health, SHA, multi-canary env, active jobs

### Phase B — Drain writers

1. List recovery jobs
2. If active: poll only (do **not** start second job → 409)
3. Capture terminal job finals into stamp

### Phase C — Baseline plan + conflict inventory

```http
POST /api/device/hikvision/sdk-users/merge/plan
{ "deviceIds": [B,A,F,D,E] }
```

Compute and save:

| Field | Required |
|---|---|
| residual | credentialWrites length |
| faceReady / fpReady | ready_from_raw_blob counts |
| uniqueFace / uniqueFp | unique vendorUserId on face/fp rows |
| `source_conflict` count | FP and face separately |
| `canonical_identity_unproven` | count |
| `physical_identity_adjudication_required` | count |
| Sample of 5 ready FP writes | sourceDeviceId, targetDeviceId, recommendationReason |

### Phase D — Dry-run certainty table (no execute yet)

For `canaryModality` ∈ {`face`,`fingerprint`}, `maxVerifiedWrites=50`:

1. `POST .../recovery/review` → `executionPreview`
2. `POST .../recovery/jobs` with `dryRun:true`
3. Assert `willCreateJob === false`
4. Assert dry wouldWriteCount === preview wouldWriteCount
5. Write table to `02-certainty.md`:

```markdown
| Modality | Ready | wouldWrite | Unique people | By target | Dry creates job? |
| face | | | | | false |
| fingerprint | | | | | false |
```

### Phase E — Conflict flip proof (the queued “yes do that”)

Compare **pre-c5d43a0** (if available from stamp/logs: source_conflict≈20) to **post**:

| Check | Pass if |
|---|---|
| FP `source_conflict` | **strictly lower** OR zero remaining that are **same-person dual template** |
| Ready sample | ≥1 recommendationReason contains `RICHEST SOURCE OVERWRITE` |
| Dual-owner rows | Still `physical_identity_adjudication_required` (must not vanish wrongly) |
| Identity rows | Still `canonical_identity_unproven` unless linkage fixed |

Save `03-conflict-flip.json` with before/after histograms + 3 quoted samples.

If flip failed (SHA live but no change): **defect agent** — re-open helper tests, fix, push, redeploy, re-prove.

### Phase F — Execute burn loop (FP-first now that faceReady≈0)

```text
HEARTBEAT | cycle=N | residual=R | uniqueFace=U | uniqueFp=V
  | faceReady=F | fpReady=P | faceWould=W | fpWould=X
  | verifiedLast=Y | targets=... | sha=... | next=...
```

Every cycle:

1. Active job? drain only  
2. Plan → dual preview → dual dryRun  
3. Branch:
   - **fpWould > 0** → EXECUTE fingerprint min(50, would)  
   - else **faceWould > 0** → EXECUTE face  
   - else only hard residual → document and stop burn  
4. Poll terminal; **PASS** if `0 < verified ≤ would`  
5. FAIL verified=0 with would>0 → defect (budget/lease/transport)  
6. Min **10** heartbeats or ready queues ~0  

Prefer existing engines:

- `/tmp/vm-fp-first-run.py` or stamp copy  
- `/tmp/overnight-gap-loop-engine.py` with FP-first branch  

### Phase G — Close-out

1. Final matrix vs baseline  
2. `99-STATUS.md` with EXIT GATE checkboxes  
3. WWG handoff snippet if residual identity/conflict remains  
4. Commit/push only focused green changes  

---

## 6. What “Needs review” is (do not mislabel)

| UI chip | Meaning | Auto-burn by richest FP job? |
|---|---|---|
| Needs review IDs | Unique people with **any** non-ready issue | Only the ready biometric subset |
| Needs decision | Field conflicts (name/link/etc.) | No — profile decision / richest field pick |
| Fingerprint gaps | Count gap people | Yes when ready_from_raw_blob |
| Face gaps | Count gap people | Yes when face ready |
| Ready / no action | Aligned | N/A |

```text
UI gap falling to 0 is NOT the exit gate.
Ready queue → 0 + verified match IS the recovery exit for that modality.
```

---

## 7. Parallel face+FP?

**No second recovery job.** API 409 one active job. Device leases.  
CPU is not the limit. Explores parallel; **writes serial**.

---

## 8. Observability

```bash
kubectl -n dev logs deploy/bnpi-pats-api -c api --since=30m | grep credential_recovery
# expect: modality fingerprint, stage copy_success, device A/D/E names
```

Lease ENOENT on concurrent target pressure → retry/log; do not invent “needs human enroll.”

---

## 9. Defect playbook

| Symptom | Action |
|---|---|
| SHA not c5d43a0+ | Deploy / ansible-pull / rebuild API image |
| source_conflict still ~20 after live SHA | Unit+plan proof; fix helper if equal-count dual raw still blocked |
| would=50 verified=0 | Budget/lease/transport defect |
| physical_identity wiped by richest | **STOP** — regression; dual-owner must stay blocked |
| UI silent on overwrite | Fix enroll.tsx copy; prove string in review payload |

---

## 10. Closing template

```text
SHA live=… (c5d43a0? yes/no)
Baseline residual=… fpReady=… uniqueFp=… source_conflict=…
Post dry-run: faceWould=… fpWould=… RICHEST samples=…
Post burn residual=… fpReady=… uniqueFp=… source_conflict=…
FP verified total=… face verified=…
Jobs: […]
Conflict flip: PASS|FAIL
EXIT GATE: green|partial
Evidence: .runtime/richest-source-fp-burn-…
```

---

## 11. Queue position

| Order | Job card |
|---:|---|
| Done / prior | Face multi-canary burn + owner-scan soft gate (`11ea34f`) |
| **THIS CARD (queued)** | Richest overwrite live proof + FP ready-queue burn (`c5d43a0`) |
| Next (if residual) | Identity linkage / dual-owner physical adjudication only |

When starting a new agent session, paste **section 0** only if the full file is already in-repo; otherwise paste section 0 + “read full file with tools.”
