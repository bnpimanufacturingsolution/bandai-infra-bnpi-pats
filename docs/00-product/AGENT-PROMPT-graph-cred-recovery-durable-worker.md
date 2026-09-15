# Graph engineering — durable credential recovery (not poll-timeout theater)

## Exact success ledger (session 2026-07-30)

| When (approx local) | Event | Numbers (exact from evidence) |
|---|---|---|
| Overnight start | People headcount | E From **782→874**, missing people **0** |
| Plan baseline | A/B/D/E/F plan | unique **874**, decision **6**, face ops **~737**, FP ops **~511**, uFace **~551**, uFp **~373** |
| Decision close | plan `45718cbb` + ISAPI align + `33452cb` | decision **6→0**, conflicts **0** |
| Face waves | 3× completed `physically_verified` | verified **50+50+50 = 150** |
| FP wave `cms75gg4f` | `physically_retained` tasks | verified **48**, failed **2** (vendors 12, 1381) |
| Mid-session replan | plan `44dc0518` | decision **0**, uFace **410**, uFp **360**, faceReady **596**, fpReady **498**, cw **1095** |
| VM STATUS later | cycle 6 plan `b6727f1a` | decision **0**, uFace **410**, uFp **263**, faceReady **596**, fpReady **398** |

**Net residual burn (plan → VM later):** uFp **373→263 (−110)**, faceReady still high, decision **closed**.

---

## What is SUCCESS (only these count)

| Success class | Proof required | Example |
|---|---|---|
| **Physical verified** | job `status=completed` or task `physically_retained` + `verified>0` | face 50/50 |
| **Partial physical** | task status `succeeded` count even if job `needs_attention` | FP 48/50 |
| **Decision closed** | replan `decisionPeople=0` and `conflicts=0` | plan 45718cbb |
| **People parity** | From=874 on A/B/D/E/F | live matrix |

## What is NOT success

| Symptom | Class | Action |
|---|---|---|
| `expired_physical_stage_requires_adjudication` verified=0 | **code_defect** (lease 60s / API restart) | longer lease + replan new wave |
| `worker_failed` mid-write | ops / API crash | durable worker + replan |
| `device_fp_write_rejected_progress` sticky | **physical_boundary** | keep table; do not fake green |
| Host poll timeout while job still recovering | observability only | trust job stage + task counts |
| UI chip lag until replan | expected | replan after wave |

---

## Why poll/timeout felt broken

```text
OLD PATH (works but fragile)
  host/VM poll GET job every 10–15s
  worker lease = 60s
  if API pod restarts OR event-loop blocks >60s during FP write:
    leaseExpiresAt < now
    GET fences job → needs_attention / expired_physical_stage
    verified may show 0 even if panels already wrote some templates
  supervisor must REPLAN + NEW job (correct) but looks like "lease problem forever"
```

**Polling is fine for observation.** The bug is **short lease + in-process worker death**, not “we should stop polling.”

---

## Target architecture (durable background)

```text
                    ┌─────────────────────────────┐
                    │ VM nohup supervisor (ALIVE)  │
                    │ af-cred-burn-loop.sh         │
                    └──────────────┬──────────────┘
                                   │ plan / review / start
                                   v
                    ┌─────────────────────────────┐
                    │ Postgres CredentialRecovery │
                    │ Job + Task rows (durable)   │
                    │ leaseExpiresAt, heartbeatAt │
                    │ counters.verified from tasks│
                    └──────────────┬──────────────┘
                                   │ claimed by
                                   v
                    ┌─────────────────────────────┐
                    │ API worker process          │
                    │ processHikvisionCredential  │
                    │ RecoveryJob (in API pod)    │
                    │ physical heartbeat 10s      │
                    │ lease TTL 5m / physical 10m │  ← CODE FIX
                    └──────────────┬──────────────┘
                                   │ SDK write + reread
                                   v
                    ┌─────────────────────────────┐
                    │ Devices A/B/D/E/F            │
                    │ physical retain proof       │
                    └─────────────────────────────┘
```

### Rules

1. **Job state lives in Postgres**, not only RAM.
2. **Lease TTL ≥ max FP wave wall time** (default **5m job / 10m physical**).
3. On expire during physical: fence job, **copy task succeeded→counters.verified**, recoveryHint = replan+new wave.
4. Supervisor never “stops”: always replan → face → FP → sleep → repeat.
5. Host poll is **observer only**; VM nohup is owner.

---

## Graph loop (execute forever until residual low)

```text
1 SCOPE freeze A/B/D/E/F (exclude C)
2 PLAN → matrix (decision, uFace, uFp, faceReady, fpReady)
3 if decision>0 → physical profile align path (already fixed beginTime)
4 FACE: review→dryRun→write max50 → poll to terminal → record verified
5 FP: review→dryRun→write max50 → poll to terminal → record verified
6 if expired_physical_stage → replan (do not resume same job)
7 if physical_boundary rows → table only (vendors 12, 1381…)
8 if wouldWrite=0 residual>0 → export/code path (not human enroll)
9 HEARTBEAT residual Δ every cycle
10 deploy lease fix when API image rolls; keep VM loop running
```

---

## Code change (this pass)

File: `bnpi-pats-api/app/device/device.controller.ts`

- `CREDENTIAL_RECOVERY_JOB_LEASE_MS` default **5 min**
- `CREDENTIAL_RECOVERY_PHYSICAL_LEASE_MS` default **10 min**
- physical heartbeat extends physical lease
- expire fence fills `verified` from succeeded tasks + `recoveryHint`

Env overrides: `PROJECT_TRUTH_RECOVERY_JOB_LEASE_MS`, `PROJECT_TRUTH_RECOVERY_PHYSICAL_LEASE_MS`.

---

## Operator watch

```powershell
ssh project-truth-bnpi-pats 'cat /var/log/project-truth/af-cred-burn/STATUS.md; tail -n 30 /var/log/project-truth/af-cred-burn/HEARTBEATS.log'
Get-Content .runtime\graph-cred-burn-20260730-140651\OPERATOR-MINUTE.md
```
