# Merge device users — why it is slow, why it fails, how to continue

**Status:** Live runtime diagnosis (DEV local + VM SDK path)  
**Last updated:** 2026-07-22  
**Audience:** operators and agents working Project Truth Device Users merge  
**Evidence sources:** live `GET /api/device/hikvision/sdk-users/merge/jobs`, job poll JSON, copy failure summaries, `bnpi-pats-api` VM manual-copy path in `device.controller.ts`

---

## 1. Bottom line

| Question | Answer |
|---|---|
| **Primary problem** | Almost all **slowness** and **failures** are on the **VM SDK peer-copy write path**, not on “search can’t find users.” |
| **Dominant failure family** | **Timeout** on Hikvision **manual copy** (`static_spec`, then often `api` retry) |
| **Hot paths** | Writes **into Device F** and **out of Device E** (also B→F, C→F in samples) |
| **Not the primary problem** | SSH disabled; random BNPI PATS inventing fails; needing SSH to merge |
| **How to finish “all sync”** | One job at a time → terminal status → **remaining-only** retry from failure ledger + reread — **not** blind full re-mirror |

---

## 2. What the merge pipeline actually does

### 2.1 Execution-location routing

The API must not assume every merge starts on the Windows development host.
`PROJECT_TRUTH_HIKVISION_RUNTIME_LOCATION` has three explicit values:

| Location | SDK command route | Wrapper API base | Cloudflare SSH fallback |
|---|---|---|---|
| `windows-host` | Windows API → VM SSH | `http://127.0.0.1:53001` → Windows `:3001` | Allowed after direct LAN failure |
| `vm-host` | Local VM process, no SSH | Current API port | Never |
| `vm-container` | K3s/Docker → direct same-VM host control | PROD `:3001`, DEV `:3101`, UAT `:3201` | Never |

Auto-detection uses Windows, native Linux, or K3s/Docker evidence; manifests set
`vm-container` explicitly. The container route still has a same-VM SSH control
boundary because HCNetSDK is currently host/systemd-managed. It does not use the
Cloudflare alias and does not route back to Windows. Replacing that internal hop
requires a VM-local SDK control service or sidecar.

| Phase | What runs | Slow? | Fails often? |
|---|---|---|---|
| **Plan / inventory** | ISAPI-style user snapshot per selected device (`UserInfo/Search` etc.) | Medium (once per plan) | Sometimes **Unauthorized** under concurrent load (separate from write timeouts) |
| **Merge job write** | For each unique user: build spec → SCP to VM → SSH → HCNetSDK manual peer copy (user + fingerprint + face) → optional verify reread | **Yes — dominant cost** | **Yes — mostly timeouts** |
| **BNPI PATS update** | DeviceUser / link bookkeeping after copy | Fast | Rare |

UI poll stages that match the write path:

- `batch_copy_started` — one source user → multiple targets in one VM SDK session  
- `vm_copy_preflight_*` — VM can reach source/target SDK ports  
- `vm_copy_attempt_started` — actual SDK write (`static_spec` or `api`)  
- `vm_copy_attempt_timeout` / `copy_error` — that write failed  
- `user_done` / `batch_copy_done` — that user finished  

Example poll line shape:

```text
status=processing processed=N/TOTAL success=S failed=F
stage=vm_copy_attempt_started user=vendor:XXX
message=VM SDK static_spec|api attempt for user XXX: user/fingerprint/face to K target(s).
```

**TOTAL is peer write attempts**, not “unique people only.” One person can generate multiple writes (one per target device).

---

## 3. Why it is slow

### 3.1 Work per successful peer write

Each peer write roughly does:

1. Build a **manual copy spec** on the Windows host  
2. **SCP** the spec to the Hyper-V VM  
3. **SSH** into the VM and run the Hikvision wrapper  
4. HCNetSDK **login** to source and target (SDK port **8000**)  
5. Write **user + fingerprint + face** templates (heavy)  
6. Often a **second strategy** if the first times out (`static_spec` then `api`)  
7. Optionally **reread target** to verify fingerprint/face counts  

### 3.2 Hard timeouts in code

From `bnpi-pats-api` merge VM copy path (`device.controller.ts`):

- Manual copy wall clock is bounded (env `HIKVISION_MANUAL_COPY_TIMEOUT_SECONDS`, default floor ~25s, modality/peer bonuses, **cap ~90s** per strategy).  
- Comment in source: multi-target + FP/face need headroom; short defaults caused **timeout storms**.  
- **Two strategies** (`static_spec`, then `api`) means a bad user can burn **~1–3 minutes** alone.  
- Work is largely **serial per user** (SDK sessions do not parallelize well across many concurrent device writes).

### 3.3 Scale math

If the job has **554**, **896**, or **2551** peer writes:

| Scenario | Rough wall time |
|---|---|
| Mostly successes at ~5–15s each | **Hours** for full multi-device mirror |
| Many timeouts (30–90s × 2 strategies) | **Much longer**, and failure count climbs |

**Slow is expected** for full multi-device biometric mirror. It is not a “hard-refresh the browser” problem.

---

## 4. Why there are multiple fails — failure families

### 4.1 Primary: SDK copy **TIMEOUT** (main failure)

**Meaning:** The VM process did not finish the peer write before `timeout` killed it.

**Typical error text:**

```text
Timed out running Hikvision manual copy (static_spec) for user <id> from <Source Device>.
Last output: INFO: hikvision hot-reload LOCAL_API_BASE=http://127.0.0.1:53001
loop[2] find 16 mac and 16 ip
| Timed out running Hikvision manual copy (api) for user <id> ...
```

**Interpretation:**

- This is a **write timeout**, not “user missing from search.”  
- Log often stalls around network/SDK discovery (`find … mac and … ip`).  
- Both strategies failing means that user/path did not complete within the allowed window.

**Live evidence examples (2026-07-22 DEV):**

| Job | Observation |
|---|---|
| `77df35c4-…` (failed/stale) | **67** copy failures; heavy **E→C** and **E→F** timeouts; then bulk **skips** after 3 timeouts on those pairs |
| `a5fbc51e-…` | e.g. **C→F** timeout on user **469** |
| `e725737b-…` | e.g. **B→F** timeouts on users **344**, **888** |

**Hot paths:** **into Device F**, **out of Device E** (also B→F / C→F). That points at **source/target panels busy, slow, or unstable under SDK write load**, not bad plan math.

### 4.2 Circuit skip after repeated timeouts

After enough timeouts on the same **source → target** pair, the job records:

```text
Skipped SDK peer copy after 3 timeout failures for Main Entrance Device E to Main Entrance Device C
Skipped SDK peer copy after 3 timeout failures for Main Entrance Device E to Main Entrance Device F
```

**Meaning:** intentional **circuit breaker** — stop hammering a dying path. This multiplies “failed/skipped” counts without a new root cause each time.

### 4.3 Secondary: verify-after-copy mismatch

Example:

```text
SDK copy returned, but refreshed target truth still shows Main Entrance Device E fingerprint count 0
while Main Entrance Device B has 1 for employee <id>.
Treat this as not copied yet and retry after the target device reports the template.
```

**Meaning:** SDK reported progress, but a **reread** of the target still shows no fingerprint. Treated as **not really copied**. Causes can include race (template not committed yet), target reject, or incomplete write.

### 4.4 Separate: inventory **Unauthorized** / failed plan read

When a full **UserInfo/Search** fails during plan:

- Plan may attach `errors` / `unreachableDevices` for that device.  
- If UI treats empty records as success, the device can show **IDs read: 0** and **Missing: all unique IDs** — that is **misleading** when the real state is **read failed**.  
- Product fix direction: show **Unavailable / Read failed**, and do **not** count failed devices as “missing every unique ID.”  
- This is **not** the same ledger as write timeouts on the merge job.

### 4.5 Job death: `failed_stale`

Example: job `77df35c4-…` stopped at **428/2551** with **failed_stale** after API disconnect/restart.

**Meaning:** worker process died or job became non-active after API restart. **Do not invent completion.** Resume from **failure ledger + remaining plan**, not from memory.

### 4.6 Operational: two merge jobs at once

If two jobs show `status=processing` at the same time, they **compete** for the same physical panels and VM SDK path. That increases **timeouts** and **slowness**.

**Rule:** **only one merge job** at a time.

---

## 5. Cause → continue map

| Symptom | Root cause family | Right next step |
|---|---|---|
| `Timed out … static_spec` / `api` | **Write timeout** (SDK session slow/hang) | One job only; finish or cleanly stop; retry **failed pairs only**; cool down hot devices (E/F); optional timeout env tune |
| `Skipped … after 3 timeout failures` for E→C / E→F | **Circuit open** after repeated timeouts | Fix/cool path first; **remaining-only** retry later — not full re-run |
| `fingerprint count 0 while source has N` | **Verify mismatch** after copy | Retry that user; check target not overloaded/rejecting templates |
| Plan Unauthorized / “0 IDs read” | **Inventory read fail** | Sequential plan reads; honest Unavailable UI; do not start merge while blocking errors remain on selected scope |
| Job `failed_stale` | **API restart / crash mid-job** | Do not restart API during merge; resume from ledger |
| Hours of wall clock | **Serial SDK + dual strategies + hundreds–thousands of writes** | Scope to gaps; fewer devices; no full mirror every time |

---

## 6. What is *not* the primary problem

- Hikvision **SSH** disabled (SSH is not the merge bus; ISAPI + HCNetSDK are)  
- “Search can’t find users” as the main **write** failure class  
- BNPI PATS inventing failures without device interaction  
- Needing to re-merge **all** unique IDs from scratch after every partial run  

---

## 7. What to do to go faster and fail less

### 7.1 Operator rules (now)

1. **Only one** merge job at a time.  
2. **Do not restart** local API/app while a job is `processing`.  
3. After terminal status: **retry failed ledger only** (byPair + by user), not full 2551 again.  
4. Prefer smaller scopes when devices are already close.  
5. Watch **Device E** and **Device F** — they dominate timeout pairs; if thrashing, pause, rest/reboot panel if needed, then remaining-only retry.  
6. Keep **TEST A/B** out of full six-device mirror until reverse-bridge / SDK reachability is proven.

### 7.2 Engineering directions (right fixes)

1. **Global SDK copy mutex** — never two merge jobs sharing devices.  
2. **Smarter circuit** — after 3 timeouts on E→F, skip for this job and queue a **cool-down remaining retry**, don’t thrash forever.  
3. Tune `HIKVISION_MANUAL_COPY_TIMEOUT_SECONDS` (capped ~90s) if logs show work almost finishing.  
4. Optional: skip second strategy when discovery never leaves `find mac/ip`.  
5. Keep **sequential inventory** on plan to reduce Unauthorized false “empty device.”  
6. **Post-job remaining plan** driven by failure ledger + physical reread gaps.  
7. UI honesty: failed inventory = **Unavailable**, never **0 + all missing**.

---

## 8. Evidence snapshot (DEV, 2026-07-22)

Illustrative live tallies (exact job IDs/counts change over time; re-query jobs for current truth):

| Job (prefix) | Status | Progress | Notes |
|---|---|---|---|
| `77df35c4` | failed / stale | 428/2551 (ok≈361, fail≈67) | E→C / E→F timeout storm + skips; API stale |
| `a5fbc51e` | processing (sample) | tens–hundreds / 554 | e.g. C→F timeout on user 469 |
| `e725737b` | processing (sample) | early / 896 | e.g. B→F timeouts on 344, 888 |

**Dominant failure type:**  
`timeout` on **VM manual SDK peer copy** (write), especially **→ F** and **E → C/F**.

**Not dominant on the write ledger:**  
plan search empty for every row.

---

## 9. Recommended finish path for “all sync”

```text
1. Ensure exactly one processing merge job (stop extras if any).
2. Poll until terminal: completed | failed | failed_stale.
3. Save copyFailureSummary (byPair, byError, latest) + honest success/fail counters.
4. Fresh physical reread / merge plan on the same selected stable device IDs.
5. Start remaining-only job: failed pairs + still-missing IDs only.
6. Repeat until ledger empty and post-merge reread gaps are acceptable.
```

Do **not**:

- Start a second full mirror while another job runs  
- Restart API mid-job and claim the old job completed  
- Treat timeout skips as “device has zero users”  
- Rely on Hikvision SSH for biometric peer merge  

---

## 10. Related docs / code

| Item | Location |
|---|---|
| Merge plan / job API | `POST/GET /api/device/hikvision/sdk-users/merge/...` |
| VM manual copy + timeouts | `bnpi-pats-api/app/device/device.controller.ts` (manual copy strategies `static_spec` / `api`) |
| Unique-ID / missing semantics | `bnpi-pats-api/helper/device-user-merge.helper.ts` |
| Merge UI (Device Users) | `bnpi-pats-app/app/routes/admin/devices/enroll.tsx` |
| WWG handoff / task | `.wwg/reports/wwg-agent-handoff.md`, `.wwg/workspace/current-task.md` |
| Runtime evidence | `.runtime/merge-users-final-run-*`, `.runtime/device-e-merge-truth-*`, `.runtime/merge-overnight-*` |

---

## 11. Glossary for operators

| Term | Meaning |
|---|---|
| **Peer write / peer copy** | One attempt to write one vendor user (and modalities) from source device to one target device |
| **static_spec** | First VM copy strategy using a frozen device/spec file |
| **api** | Second strategy that re-resolves devices via host reverse API (`127.0.0.1:53001` in logs) |
| **Circuit skip** | After N timeouts on a pair, further copies on that pair are skipped for the job |
| **failed_stale** | Job no longer has an active worker (e.g. API restart); do not invent completion |
| **Remaining-only** | New job scoped to failed paths + post-reread gaps only |

---

*This document captures the diagnosis discussed for Project Truth DEV merge runs on 2026-07-22. Re-verify live job JSON before claiming current counts; wall-clock state changes while jobs process.*
