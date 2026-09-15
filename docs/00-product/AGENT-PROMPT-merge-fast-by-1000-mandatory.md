# PROJECT TRUTH — MERGE FAST BY 10:00 (MANDATORY MULTI-AGENT)

> **Historical job card — do not use as the current live-write standard.**
> Its device scope and mandatory-agent assumptions predate the five-device
> physical-truth correction. For current live biometric writes, follow
> `docs/00-product/HIKVISION_CREDENTIAL_MERGE_EXECUTION_STANDARD.md`: exactly
> one write-owning server job, parallelism only across different target panels,
> serialization within each panel, and other agents limited to read-only work.

**Paste this entire file as the agent job card.**  
**Deadline: today 10:00 local (operator wall clock). Work until EXIT GATE is green or Real Stop.**  
**Branch: `develop`. Agent-owned. Non-stop. No plan-only closeout.**

---

## 0) HARD LAWS (if you violate these the run is invalid)

1. Obey root `AGENTS.md` + open WWG with tools before first edit:
   - `.wwg/reports/wwg-agent-handoff.md`
   - `.wwg/workspace/current-task.md`
   - `.wwg/wiki/project-truth-summary.md`
   - task-relevant `.wwg/wiki/project-truth.md` / principles `evidence-over-assumption.md`
   - `.wwg/governance/drift-guard.md` when changing behavior
2. **Do not invent** device counts, tallies, timings, “success,” or C++ behavior. Prove from live API/SSH/`.runtime` or label `NEEDS_CONFIRMATION`.
3. **Do not disable** `cloudflared-bnpi-pats` / Cloudflare tunnel.
4. **Do not count** circuit-skips, `db_merge_done`, or `noop_overlay_only` as peer-write success.
5. Windows: `npm.cmd`. Restart API yourself. Prefer `npm.cmd run dev:api-only` if `predev` device-live-path flakes; poll `/health`.
6. SSH first: `ssh project-truth-bnpi-pats` (fallback LAN key to `infra@10.184.37.19`).
7. Local admin: `admin@bandai.local` / `password123` / `appCode=bnpi-pats` on `http://localhost:3001`.
8. **MANDATORY MULTI-AGENT (cycle ≤2):** spawn **≥3** subagents. Soft language is banned. See §2.

---

## 1) HUMAN GOAL (what “done” means when I wake / by 10:00)

I use **Merge device users** so Main Entrance Hikvision panels share the same people + biometrics.

When the job is done I must see **numbers**, not vibes:

| Goal | Required evidence |
|---|---|
| **A. SPEED** | Same small ID set, before/after wall-clock seconds, ok peer writes, fail, timeout count. Winner beats baseline by clear margin. |
| **B. TALLIES** | On **VM-reachable** WAVE devices only: after merge + reread, per-device userCount ~ union; per person ID FP/face on each device ≥ max fleet for that ID (or labeled not-enrolled-anywhere). |
| **C. RELIABILITY** | `.runtime/merge-fast-<stamp>/ledger/success.jsonl` + `failure.jsonl`; retry-failed works ≥1 row; progress distinguishes peer success vs circuit-skip vs db-only. |
| **D. HONESTY** | Host-online but VM-unreachable devices excluded (TEST A/B) unless you fix VM TCP. No fake success. |

**Product path (re-verify in code, do not invent bulk multi-user ISAPI):**
```text
Admin merge job → copyHikvisionUserToPeersBatch → runHikvisionManualCopyOnVm
  → C++ hikvision_biometric_service (UserInfo/SetUp + FP + face)
```

---

## 2) MANDATORY MULTI-AGENT GATE (non-negotiable)

### 2.1 By HEARTBEAT cycle=2 you MUST have spawned at least 3 agents

| # | subagent_type | Leg (independent) | Required return |
|---|---|---|---|
| A1 | `explore` | `bnpi-pats-api/app/device/device.controller.ts` merge apply, batch, circuit, durable job, face physical gap, timeout scaling | path + line quotes + “what live events mean” |
| A2 | `explore` | `vendor/hikvision-linux/src/hikvision_bio/copy.cpp` + `acs.cpp` + `spool.cpp` + `identity.cpp` + `fingerprint.cpp` + `face.cpp` manual copy / peer write / timeouts / 401 faceURL | path + line quotes + failure classes |
| A3 | `general-purpose` (execute) | SSH TCP matrix all 6 devices × 80/443/8000 + listener active | `.runtime/merge-fast-<stamp>/ssh-tcp.txt` |
| A4 (optional 4th) | `general-purpose` | API health + WAVE plan + gap ID pick list | `devices-health-summary.json`, `merge-plan-wave.json`, `bakeoff-ids.json` |

**Rules:**
- Soft “when it helps” is **banned**. Spawn is **required**.
- If you skip spawn, write `PARALLEL-SKIP.md` with reason — valid **only** for *mutate* contention on same panels. **Read-only explores A1+A2 must still run.**
- HEARTBEAT must list `subagent_ids=` until complete.
- Children return **evidence paths**, not essays.

### 2.2 Parallel vs serial

| Parallel OK | Serial only |
|---|---|
| Code explore, C++ explore, SSH TCP, plan/dry-run | Live peer copy / merge job on same Main A–D panels |
| Writing BAKE-OFF / TRUTH-MATRIX from collected JSON | Concurrent unbounded SDK logins to same device |

---

## 3) ALREADY TRUE (do not re-discover as the finish line — re-verify then build)

Session/code truth as of `develop` (re-check git tip):

| Item | Status | Evidence / path |
|---|---|---|
| WAVE = Main A–D only | Re-probe | VM TCP OK on 10.184.37.20–23; TEST A/B `192.168.254.109/110` FAIL from VM |
| Host health can show TEST A/B ONLINE | Trap | Peer copy runs on **VM** — exclude TEST until VM TCP fixed |
| Batch path in merge apply | Code + live event | `batch_copy_started` / `copyHikvisionUserToPeersBatch` |
| Circuit default 3 | Code | `HIKVISION_MERGE_COPY_TIMEOUT_CIRCUIT_LIMIT \|\| 3` |
| Durable merge jobs | Shipped | `.runtime/device-user-merge-jobs/<jobId>.json`; orphan → `failed_stale` |
| Poll script | Shipped | `scripts/poll-merge-job.ps1` (no stale-status lie) |
| Retry script | Shipped | `scripts/retry-merge-failures.ps1` |
| Manual copy timeout floor | Code | default ~25s + modality/peer bonus, cap 90s |
| Target refresh before physical plan | Code | fixes polluted DeviceUser `numOfFP` overlay lies |
| Prior bad poll screenshot | Explained | API died; RAM job lost; **now durable** — use poll script |

**Do not declare overnight success from the above alone.** Tallies + timed bake-off + real peer writes are still open.

---

## 4) STILL OPEN (this is your actual job)

- [ ] Live TRUTH-MATRIX this session (SSH + health + WAVE lock)
- [ ] BAKE-OFF with **real** `vmSessionCount≥1` / physical peer writes (not only noop)
- [ ] Numbers: seconds, ok, fail, timeouts per arm
- [ ] Canary merge job with nested `choices` + selectedUserKeys + **poll-merge-job.ps1**
- [ ] Ledger success.jsonl + failure.jsonl from that run
- [ ] retry-failed proven ≥1 row
- [ ] Larger WAVE gap run or gap-only selected set with **before/after tallies**
- [ ] C++ evidence quoted for timeout/401/face path (agent A2)
- [ ] WAKEUP-REPORT.md by deadline
- [ ] `develop` pushed when green slices land

---

## 5) DEVICE SCOPE (re-resolve IDs live)

| Name | IP | Expected id (re-check API) | WAVE default |
|---|---|---|---|
| Main B | 10.184.37.20 | `cmpxw13hx002h7zwso7dyedrn` | YES if VM TCP OK |
| Main A | 10.184.37.21 | `cmrht5s2w00ei7zgsre8y3o5n` | YES if VM TCP OK |
| Main C | 10.184.37.22 | `cmripjwbx00ewl001ihcke210` | YES if VM TCP OK |
| Main D | 10.184.37.23 | `cmripjwkw00ffl0013lfxcbxw` | YES if VM TCP OK |
| TEST A | 192.168.254.109 | `cmrlgqsjv000oob01165tbd8n` | NO unless VM TCP fixed |
| TEST B | 192.168.254.110 | `cmrv02vam004cnxekd57dsjh8` | NO unless VM TCP fixed |

Prior WAVE plan shape (stale until re-run): ~687 union users, ~2061 planned writes, missing≈0, conflicts≈950+, plan ~22s.  
**Heavy work = FP/face peer copy + conflict resolution, not shell create.**

---

## 6) WORK ORDER (mandatory sequence)

### PHASE A — Measure (start now)

1. Create `.runtime/merge-fast-<stamp>/` + `ledger/` + write `00-current-state.md`.
2. **HEARTBEAT cycle=1 | phase=A** then **spawn A1+A2+A3** (and A4 if capacity).
3. SSH TCP → `ssh-tcp.txt` (listener active? Main A–D vs TEST).
4. API `/health`; restart with env if needed:
   ```powershell
   $env:HIKVISION_MERGE_LEDGER_DIR = (Resolve-Path ".runtime\merge-fast-<stamp>\ledger").Path
   $env:HIKVISION_MANUAL_COPY_TIMEOUT_SECONDS = "45"
   $env:HIKVISION_MERGE_COPY_TIMEOUT_CIRCUIT_LIMIT = "3"
   # If predev ensure-device-live-path fails:
   npm.cmd run dev:api-only   # from bnpi-pats-api
   ```
5. Devices health summary → `devices-health-summary.json` (user counts from `checks.userRead.count`).
6. WAVE lock → `TRUTH-MATRIX.md` + `wave-lock.json`.
7. Non-mutating merge plan WAVE → `merge-plan-wave.json` (seconds, union, plannedWriteCount, conflicts, missing).
8. Extract **8–12 gap IDs** from plan live `numOfFP`/`numOfFace` deltas → `bakeoff-ids.json`.  
   Prefer IDs where dry-run after **live refresh path** needs physical copy (`requiresPhysicalPeerCopy=true` / `vmSessionCount` on execute).

### PHASE B — Bake-off (DO NOT SKIP) ★

Same IDs every arm. Record wall clock.

| Arm | Method | Measure |
|---|---|---|
| ARM0 | Sequential 1:1 `copy-user` single `targetDeviceId` (subset if time) | s, ok, fail, timeouts, vm sessions |
| ARM1 | Batch `targetDeviceIds` (`copyHikvisionUserToPeersBatch`) | s, ok, fail, timeouts, **vmSessionCount** |
| ARM2 | Staged FP-only then face-only batch | s per pass, ok/fail |
| ARM3 | Optional concurrency≤2 only if ARM1 still slow and no thrash | prove or discard |

Write `BAKE-OFF-MATRIX.md`:

```text
arm | seconds | ok_peer | fail | timeouts | vmSessions | notes | winner?
```

**Winner rule:** best **reliable ok peer-writes per minute**, not theoretical.  
**Invalid “ok”:** `noop_overlay_only`, `already_converged` with no VM, circuit-skip, db_merge only.

If all arms show `vmSessionCount=0`, you have **not** baked off peer copy — fix physical detection / network / credentials / C++ 401, then re-run bake-off.

### PHASE C — Implement winner into production merge path

Already partially present; **prove live** and close gaps:

1. Live merge job must emit `batch_copy_*` / `copy_success` with strategy (not only db).
2. Ledger on every terminal copy (already wired) → confirm files under this stamp’s `ledger/`.
3. Durable jobs: use `scripts/poll-merge-job.ps1 -JobId ... -RestartApiOnConnectFail -EvidenceDir ...`
4. Nested choices format (required or job 409):
   ```json
   {
     "planId": "...",
     "selectedUserKeys": ["vendor:1154", "..."],
     "choices": {
       "vendor:1154": { "fingerprint": "A", "face": "A" }
     }
   }
   ```
   Prefer higher credential count side per conflict field.
5. Focused tests green (`hikvision-biometric-sync-contract` + merge helper if touched).
6. Commit + push `develop` when green.

### PHASE D — Real run + tallies (finish line)

1. **Canary:** 3–8 gap IDs on WAVE. Require ≥1 real peer write (`vmSessionCount≥1` or SDK strategy not noop). Capture job final JSON + ledger.
2. **Expand:** more gap IDs (time-boxed; prefer gap-only / richest-source). Prefer **not** full 2061 writes if time is short — prove improved tallies on a defined selected set with numbers.
3. **Reread:** health user counts + sample gap re-plan (FP/face min/max per ID on WAVE).
4. **`WAKEUP-REPORT.md`** with:
   - before/after per device users / FP gaps / face gaps (sample + totals)
   - bake-off winner + speed delta
   - remaining failures + exact retry command
   - git SHA pushed
5. TEST A/B only if VM TCP fixed; else document excluded.

---

## 7) SELF-REPAIR MAP (agent does these — never dump on human)

| Symptom | Agent action |
|---|---|
| API down / connect refused | Free 3001; `npm.cmd run dev:api-only` or `dev`; poll health 3× |
| predev `ensure-device-live-path` fails | Use `dev:api-only`; log why; continue |
| Poll 404 old job | Check `.runtime/device-user-merge-jobs/<id>.json`; expect `failed_stale` after restart; **new job** for remainder |
| Poll shows stale processing forever | **Bug** — use `poll-merge-job.ps1` only; never custom loop that reprints old `$d` |
| UTF-8 BOM snapshot 404 | Reader strips BOM (shipped); rewrite snapshot if corrupt |
| Merge 409 resolve conflicts | Nested `choices` userKey→field→A/B |
| `noop_overlay_only` / false converged | Target+source single-user refresh; use live numOfFP; do not celebrate overlay |
| VM copy 401 / curl 401 | Agent A2 C++ + credentials/spec; try FP-only; check listener contention |
| Circuit-skip storm | WAVE exclude unreachable; circuit ≥3; do not count skip as ok |
| SSH flake | Retry `project-truth-bnpi-pats`; then LAN key |

---

## 8) HEARTBEAT FORMAT (every major cycle)

```text
HEARTBEAT | cycle=N | phase=A/B/C/D | checklist=X/Y | subagent_ids=... | last_proof=path|fail | next=<one action> | deadline_risk=green|yellow|red
```

Min **12 heartbeats** or full green. Do not self-stop after 1–15 minutes with open checklist.

---

## 9) ACCEPTANCE CHECKLIST (all required)

- [ ] `TRUTH-MATRIX.md` + `ssh-tcp.txt` + `devices-health-summary.json`
- [ ] WAVE = VM-reachable only (TEST A/B out unless TCP fixed)
- [ ] ≥3 subagents spawned by cycle 2 (or PARALLEL-SKIP only for mutate + A1/A2 still ran)
- [ ] C++ leg notes under `.runtime/merge-fast-<stamp>/explore-cpp.md`
- [ ] Controller leg notes under `.runtime/merge-fast-<stamp>/explore-controller.md`
- [ ] `BAKE-OFF-MATRIX.md` with timings; winner named; **at least one arm with real VM peer work**
- [ ] Live merge job uses winner; events prove batch path
- [ ] `ledger/success.jsonl` + `failure.jsonl` from real run
- [ ] `poll-merge-job.ps1` used (terminal.json with honest outcome)
- [ ] retry-failed proven ≥1 failure row
- [ ] Canary: ≥1 real peer write success (not circuit-skip, not db-only, not noop_overlay_only)
- [ ] Larger/gap WAVE numbers: before/after tallies + speed vs baseline
- [ ] Focused tests green; `/health` healthy; `develop` pushed when green
- [ ] `WAKEUP-REPORT.md` written
- [ ] No “you should hard-refresh / restart API / click Sync” residual

### EXIT GATE

- Do **not** end if any box is open and not Real Stop (3 distinct failed recoveries with evidence / irreversible risk / missing irrecoverable access).
- Do **not** invent multi-user bulk ISAPI without live device proof.
- Next step after HEARTBEAT is always a **tool call**.

---

## 10) START SEQUENCE (first 5 minutes)

```text
1) Read WWG + this prompt
2) stamp = yyyyMMdd-HHmmss; mkdir .runtime/merge-fast-$stamp/{ledger}
3) HEARTBEAT cycle=1 phase=A
4) spawn A1 explore controller | A2 explore C++ | A3 execute SSH TCP
5) Continue A→B→C→D without waiting for human
6) By 10:00: WAKEUP-REPORT.md + green checklist or honest blockers with evidence only
```

---

## 11) KEYWORD / TOOL TRIGGERS (so the agent cannot “forget”)

Use these exact actions (not metaphors):

| Keyword in this prompt | Required tool/behavior |
|---|---|
| `spawn` / `multi-agent` | `spawn_subagent` ≥3 by cycle 2 |
| `HEARTBEAT` | Print line every cycle |
| `ssh-tcp` | Real SSH probe file |
| `bake-off` | Timed arms + BAKE-OFF-MATRIX.md |
| `ledger` | success.jsonl + failure.jsonl |
| `poll-merge-job` | `scripts/poll-merge-job.ps1` |
| `failed_stale` | Treat as terminal; new job for remainder |
| `tally` | Before/after counts on devices |
| `peer write success` | Not noop / not circuit-skip / not db-only |
| `commit` / `push` | When green focused slices land on `develop` |

---

## 12) REAL STOP ONLY

Stop only if:

1. Same failure after **3 different** recovery attempts with evidence, or  
2. Irreversible data risk without backup, or  
3. Missing irrecoverable credentials/device/network, or  
4. Would require inventing secrets/evidence.

Everything else is agent-owned. **Continue.**
