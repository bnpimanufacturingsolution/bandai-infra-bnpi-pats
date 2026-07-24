# Overnight Job Card — Five-Device Face + Fingerprint Gap Convergence (Stable)

**Audience:** owner-operator agents (Grok / Claude / multi-agent root).  
**Mode:** agent-owned end-to-end. No human homework for recoverable steps.  
**Environment:** K3s **DEV only** on Hyper-V VM (`project-truth-hris` / LAN `10.184.37.19`).  
**Repo:** `C:\Users\stari\bandai-infra` on `develop`.

This card encodes **proven production mistakes, log truth, and recovery patterns**
from the 2026-07-24 live run so the next overnight job **actually reduces fleet
face/fingerprint gaps**, not only Device B.

---

## 0. Exit gate (do not stop early)

Done only when **all** are true with evidence under a new stamp  
`.runtime/overnight-gap-convergence-YYYYMMDD-HHMMSS/`:

1. [ ] Runtime API SHA is exact green CI SHA **and** env proves multi-device face canary.
2. [ ] Fresh five-device plan: all 5 devices authenticated + full-inventory-readable.
3. [ ] Matrix saved **by target** (A/B/D/E/F), not only fleet totals.
4. [ ] Fingerprint: at least one **non-B** target has owner-scan complete enough for `fp_ready > 0`, **or** residual is only named identity/physical blocks with evidence.
5. [ ] Face: at least one **non-B** target has FDLib `ready` (canary reread + persisted attestation) and `face_ready > 0` toward that target.
6. [ ] Bounded verified writes with **physical reread** reduce:
   - fleet residual `physicallyVerifiedRemaining` and/or
   - UI face gaps and fingerprint gaps (record before/after).
7. [ ] Observability up (Grafana/Loki/Prom or kubectl logs) and every failure is **named** (not bare Bad Request / unclassified timeout).
8. [ ] No active writers left unmanaged; handoff + STATUS.md updated; green commits pushed when code changed.
9. [ ] Min **20 heartbeats** or full green — wall-clock alone is not a stop.

**Hard ban:** “Done because B looks good.” Fleet UI gaps stay high if A/D/E/F never receive writes.

---

## 1. Runtime path (DEV truth)

```text
Windows repo develop
  -> push + exact-SHA GitHub Actions
  -> VM ansible-pull / GitOps
  -> K3s namespace dev (hris-api NodePort :3101, app :3100)
  -> devices 10.184.37.20–25 from inside VM
  -> named Cloudflare tunnel STAYS active
```

**Do not** use Windows npm/Docker Desktop/WSL as Project Truth runtime.

SSH preference:

```powershell
ssh -i "$env:USERPROFILE\.ssh\node-health-appliance_ed25519" infra@10.184.37.19
# fallback
ssh project-truth-hris
```

API:

```text
http://127.0.0.1:3101/health   # on VM
# host tunnel if needed:
ssh -N -L 127.0.0.1:53101:127.0.0.1:3101 project-truth-hris
```

Admin actor: `admin@bandai.local` / documented password / `appCode=hris`. Never print bearer tokens.

Observability (start if down):

```bash
sudo project-truth-hris-observability-start
# Grafana :53000  Loki :3110  Prometheus :9091
# LogQL: {stack="hris-k3s",namespace="dev",container="api"} |= "credential_recovery"
```

---

## 2. Exact device scope (never widen)

| Device | ID | LAN |
|---|---|---|
| **B** | `cmpxw13hx002h7zwso7dyedrn` | 10.184.37.20 |
| **A** | `cmrht5s2w00ei7zgsre8y3o5n` | 10.184.37.21 |
| **D** | `cmripjwkw00ffl0013lfxcbxw` | 10.184.37.23 |
| **E** | `cmriu5ab102goi001x9o7nfct` | 10.184.37.24 |
| **F** | `cmrim1zop05ik7zp4zgm2sm4k` | 10.184.37.25 |

**Exclude always:** Main C `cmripjwbx00ewl001ihcke210`, TEST A, TEST B.

---

## 3. Proven baseline from 2026-07-24 (recheck; do not invent)

These are **historical evidence**, not permission to skip a fresh plan.

| Fact | Evidence class |
|---|---|
| Session residual fell ~3254 → ~2813 credentialWrites | plan + job counters |
| ~429 face verified via FDLib | almost all **→ B** only |
| ~12 FP verified | almost all **→ B** only |
| UI still ~690 face / ~307 FP gaps | **non-B** residual |
| Face block on A/D/E/F | `target_write_unsupported` / `target_attestation_invalid` |
| FP block on A/D/E | `target_owner_scan_incomplete` (all-or-nothing per target) |
| B LOCALS faceURL 404 | **half-success** if model/FDLib reread passes |
| `maxVerifiedWrites` hard cap | **50** per job |
| Unscoped recovery jobs | burn on **card custody not implemented** |
| Timeout `request_timeout_after_*` | must be **retryable transport** (`ce93414`) |
| Face canary env was B-only | **code/config defect** fixed in `a2e9004` (multi-ID) |

Prior evidence stamp:

`.runtime/overnight-biometric-convergence-20260724-230000/`  
(STATUS.md, wave logs, truth-by-target, obs-truth-summary)

---

## 4. Critical truth agents must not re-learn the hard way

### 4.1 UI gap ≠ ready queue ≠ verified writes

| Counter | Meaning |
|---|---|
| UI Face / FP gaps | Inventory missing across devices |
| Plan `ready_from_raw_blob` | Only rows the worker may write **now** |
| Job `verified` | Physical reread-proven only |
| Job `recovered` | Custody export — **does not** lower gap alone |

If `face_ready=0` and `fp_ready=0`, a long job **will not** move UI gaps. Fix gates first.

### 4.2 Almost all successful writes went to B — by design defect, not destiny

- Face FDLib: GitOps env `HIKVISION_AUTHORIZED_FACE_CANARY_DEVICE_ID` was **B only**.
- After multi-ID fix, env must list A,B,D,E,F (comma-separated).
- FP: `gateFingerprintWritesForTargetOwnerScan` blocks **all** writes to a target until **every** enrolled FP owner on that target has checksums.
- B owner scan completed furthest → only B got FP ready rows.

### 4.3 Expected gap movement (use this to set expectations)

| Action | Expect |
|---|---|
| 50 face writes → B only | B face gap ↓; **E/A/D/F flat** |
| 10 FP → B only | Fleet FP ↓ ~10; B nearly done; E still huge |
| Face canary unlock A then wave | **A face gap** starts falling |
| Complete E FP owner scan then wave | **E fingerprint gap** starts falling |
| `recovered: 800` with `verified: 0` | Gaps **flat** — do not celebrate |

### 4.4 Stability rules (error reduction)

1. **One fleet writer** at a time (zero active recovery before start).
2. Always set `canaryModality`: `"fingerprint"` or `"face"` — **never** unscoped mixed.
3. Canary first: `maxVerifiedWrites: 1` → physical reread proof → then waves of ≤50.
4. Prefer **target-aware** success: rotate unlock order **B already green → A → D → E → F** (or highest residual non-B first after unlock).
5. On failure: require named code (`device_transport`, `target_write_unsupported`, …). If bare/unclassified, **fix classifier** before retry spam.
6. Timeouts (`request_timeout_after_*`) → retryable; do not abort whole job as observabilityDefect.
7. Device B LOCALS photo 404 → log as half-success; continue FDLib model path.
8. Heartbeat every cycle:  
   `HEARTBEAT | cycle=N | checklist=X/Y | remaining=R | face_ready=F | fp_ready=P | last_proof=path | next=action`

---

## 5. Required config / K3s / GitOps checks (Phase A)

Before any write job:

### A1. Branch / CI / image

```powershell
git fetch origin; git checkout develop; git pull
# required SHAs include at least:
# - ce93414 request_timeout retry
# - a2e9004 multi-device face canary IDs
# - isAuthorizedHikvisionFaceCanaryDevice helper
gh run list --branch develop --limit 3
```

On VM:

```bash
sudo cat /var/lib/project-truth/k8s-runtime-image-state
kubectl -n dev get deploy hris-api hris-app
kubectl -n dev exec deploy/hris-api -c api -- printenv HIKVISION_AUTHORIZED_FACE_CANARY_DEVICE_ID
# MUST contain all five IDs (comma-separated), not B alone
kubectl -n dev exec deploy/hris-api -c api -- printenv HIKVISION_FDLIB_FACE_DELIVERY_ORIGIN
# expect http://10.184.37.19:3101 (or verified DEV API origin)
```

If env still B-only: push/deploy `gitops/runtime-k8s/overlays/dev/hris-api-credential-recovery-env.patch.yaml` + API image with multi-ID parser; **API-only** rebuild when possible (`services=hris-api`).

### A2. Zero writers + health

```bash
curl -sS http://127.0.0.1:3101/health
# recovery jobs: no pending/recovering/retrying
# cloudflared-bnpi-hris active; do not stop tunnel
```

### A3. Observability

```bash
curl -sS http://127.0.0.1:53000/api/health || sudo project-truth-hris-observability-start
curl -sS http://127.0.0.1:3110/ready
```

---

## 6. Ordered overnight phases

### Phase B — Fresh plan + deterministic executionPreview (mandatory)

POST plan for exact five device IDs. Then **always** review with modality + cap:

```json
POST /api/device/hikvision/sdk-users/merge/recovery/review
{
  "planId": "...",
  "canaryModality": "face",
  "maxVerifiedWrites": 50
}
```

Response includes `executionPreview` (deterministic, same selection as worker):

| Field | Meaning |
|---|---|
| `faceReady` / `fingerprintReady` | Ready counts on frozen plan |
| `wouldWriteCount` | Exact number this job will attempt (≤50) |
| `wouldWriteOperationIds` | Exact op IDs in write order |
| `wouldWriteByTarget` | Count by target device |
| `blockReasonsWhenZeroReady` | Why nothing would write |
| `certainty` | always `deterministic_from_plan` |

Dry-run without starting a job:

```json
POST /api/device/hikvision/sdk-users/merge/recovery/jobs
{
  "planId": "...",
  "expectedScopeHash": "...",
  "canaryModality": "face",
  "maxVerifiedWrites": 50,
  "dryRun": true
}
```

**Hard rule:** Do not start a write job until `executionPreview.wouldWriteCount > 0`
for that modality (or you intentionally run custody-only `maxVerifiedWrites: 0`).

If preview says wouldWriteCount=0, the defect is **named** in
`blockReasonsWhenZeroReady` — fix unlock gates; do not spam jobs.

Save by-target matrix + preview JSON under the stamp.

**Stop for review** only if: <5 valid devices, plan errors, scope creep to C/TEST.

### Phase C — Fingerprint unlock (non-B first priority after B is healthy)

Order:

1. Confirm B FP residual small (often <20 rows).
2. For each of **E, D, A, F** with `target_owner_scan_incomplete`:
   - Start recovery job: `canaryModality=fingerprint`, `maxVerifiedWrites=0` **or** 1 if ready>0  
   - Goal: drive `target_owner_capture` / source export until missing owner checksums → 0 for that target.
3. Replan; require `fp_ready_by_target` shows non-B keys when scan complete.
4. Canary: `maxVerifiedWrites=1`, modality fingerprint, prove reread on that target.
5. Waves: ≤50 verified per job; chain until ready exhausted or only identity/conflict remain.
6. **Success metric:** fleet FP gap material drop (tens+), not only B.

Do **not** declare FP done when only B improved.

### Phase D — Face unlock (non-B FDLib canaries)

Prerequisite: multi-device `HIKVISION_AUTHORIZED_FACE_CANARY_DEVICE_ID` live.

For each target in **A, D, E, F** (B already proven):

1. Replan; confirm that target can get `authorized_canary_ready` / FDLib actionable.
2. One face canary: `canaryModality=face`, `maxVerifiedWrites=1`, prefer write **to that target**.
3. Require log: `FDLib face picture reread passed for <id> on Main Entrance Device <X>`.
4. Confirm persistence: device `config.fdlibPictureWriter` / capability evidence (or next plan shows ready to that target without env-only).
5. Wave face ≤50 toward that target while ready>0.
6. Rotate next device.

Identity-blocked rows (`physical_identity_adjudication_required`) stay named — do not invent card linkage.

### Phase E — Stable write loop (while ready remains)

```text
loop:
  matrix by target
  if fp_ready>0: wave fingerprint min(50, ready)  # prefer non-B ready first if selector allows
  elif face_ready>0: wave face min(50, ready)
  else: run custody unlock (C/D) once more
  if no progress 2 consecutive unlock cycles: diagnose logs, fix code/config, redeploy
  heartbeat + stamp
until exit gate or real stop conditions
```

### Phase F — Observability contract every failure

From logs require:

```text
event=credential_recovery_write_progress
stage=copy_success | copy_error | credential_raw_write_started
modality, vendorUserId, sourceDeviceId, targetDeviceId
message with device name when possible
```

Forbidden silent states:

- bare `Bad Request` without statusString/subStatusCode
- `unclassified` + `observabilityDefect` on known timeout
- job `failed: 50` with zero reread after partial successes (retry/transport bug)

Query:

```bash
kubectl -n dev logs deploy/hris-api -c api --since=2h | grep credential_recovery_write_progress
```

### Phase G — Close-out

1. Final plan matrix by target + UI gap screenshot/API counts.
2. STATUS.md: before/after remaining, verified by modality, verified by target.
3. WWG handoff + current-task sync.
4. Commit/push only real code/docs; re-prove exact-SHA if code changed.
5. List residual **only** as: agent-owned unlock still open | physical identity | firmware.

---

## 7. Multi-agent coordination (root agent owns integration)

Root agent **must** fan out read-only explores, then execute serially for writes:

| Subagent | Role | Output |
|---|---|---|
| **explore-config** | SHA, env canary IDs, image state, tunnel, obs health | PASS/FAIL gates |
| **explore-matrix** | Live plan by target; ready pairs; block tops | matrix JSON |
| **explore-logs** | Last 2h write_progress by target/modality | success/fail table |
| **exec-fp-unlock** | Owner scan + FP canaries/waves for one target | job IDs + verified |
| **exec-face-unlock** | FDLib canary + waves per non-B target | job IDs + verified |
| **exec-obs-fix** | Classifier/retry/config defects only | PR/commit if needed |

**Write safety:** only **one** recovery job `pending|recovering|retrying` fleet-wide.

Root agent merges evidence into stamp and refuses “B-only success” as finish.

---

## 8. API recipes (stable)

Login → plan → review → start (never invent planId/scopeHash).

```json
// Fingerprint canary
{
  "planId": "<fresh>",
  "expectedScopeHash": "<review>",
  "maxVerifiedWrites": 1,
  "canaryModality": "fingerprint"
}
```

```json
// Face canary
{
  "planId": "<fresh>",
  "expectedScopeHash": "<review>",
  "maxVerifiedWrites": 1,
  "canaryModality": "face"
}
```

```json
// Wave (API clamps to 50)
{
  "planId": "<fresh>",
  "expectedScopeHash": "<review>",
  "maxVerifiedWrites": 50,
  "canaryModality": "fingerprint"
}
```

Custody-heavy FP unlock when ready=0:

```json
{
  "planId": "<fresh>",
  "expectedScopeHash": "<review>",
  "maxVerifiedWrites": 0,
  "canaryModality": "fingerprint"
}
```

Reuse VM scripts when present:

- `/tmp/start-wave.py`
- `/tmp/start-fp-recovery.py`
- `/tmp/truth-matrix-by-target.py`
- `/tmp/obs-truth-summary.py`
- `/tmp/chain-waves.py` (modality-scoped only)

---

## 9. Known failure playbook (from live logs)

| Symptom | Root class | Agent action |
|---|---|---|
| face_ready=0, all non-B `target_attestation_invalid` | config/code canary pin | Deploy multi-ID env + API parser; serial canary per target |
| fp_ready only B / owner_scan incomplete on E | logic gate | FP modality recovery exports; do not write-spam |
| Job fails `request_timeout_after_15000ms` unclassified | observability defect | Ensure `ce93414` live; retry transport |
| `card custody recovery is not implemented` floods | wrong job scope | Always set canaryModality face/fp |
| verified stalls, recovered climbs | expected custody | Replan after batch; then write wave |
| LOCALS 404 on B photo UI | half-success | Ignore for gap math if FDLib reread pass |
| Plan 5 devices but UI shows 690 face | not a bug | Gaps are multi-target; check by-target matrix |
| maxVerifiedWrites 100 but verified 50 | API cap | Chain jobs of 50 |

Real stop only per `AGENTS.md` Real Stop Conditions (3 failed distinct recoveries, irreversible risk, missing credentials/devices, inventing secrets).

---

## 10. Current-state seed (refresh at start — 2026-07-24/25)

| Item | Last known | Recheck |
|---|---|---|
| CI multi-canary | `a2e9004` run `30133960664` success | yes |
| Image state | may lag docs commits; env canary may already list 5 IDs | printenv |
| Active jobs | often 0 between waves | list endpoint |
| Residual | ~2813 credentialWrites; face_ready 0 fp_ready 0 after B drain | plan |
| FP by target residual | E≫D>A>B≈F | matrix |
| Face by target residual | E>F>A>D≫B | matrix |

---

## 11. Paste-ready root instruction

```text
Execute docs/00-product/AGENT-PROMPT-overnight-five-device-gap-convergence-stable-job.md
as root agent. Agent-owned, K3s DEV only, five Main Entrance devices A/B/D/E/F.
Spawn explore subagents for config/matrix/logs; execute unlock+writes serially.
Prioritize non-B face FDLib canaries and non-B FP owner-scan unlock so fleet UI
gaps fall—not B-only cosmetics. Prove with plan-by-target + credential_recovery
logs + verified counters. Heartbeat until EXIT GATE. Commit/push when green.
```

---

## 12. Related docs

- `docs/00-product/AGENT-PROMPT-durable-credential-recovery-overnight-continuation.md`
- `docs/00-product/HIKVISION_CREDENTIAL_RECOVERY_ARCHITECTURE.md`
- `docs/00-product/HIKVISION_CREDENTIAL_MERGE_EXECUTION_STANDARD.md`
- `gitops/runtime-k8s/overlays/dev/hris-api-credential-recovery-env.patch.yaml`
- `.runtime/overnight-biometric-convergence-20260724-230000/STATUS.md`
