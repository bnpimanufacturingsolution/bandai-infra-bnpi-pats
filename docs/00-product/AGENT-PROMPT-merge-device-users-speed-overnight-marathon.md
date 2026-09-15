# Task Writer: Merge device users — speed + truth overnight marathon

**File:** `docs/00-product/AGENT-PROMPT-merge-device-users-speed-overnight-marathon.md`  
**Purpose:** Agent-owned, non-stop loop to make **Merge device users** fast enough and truthful enough that you can wake up with **per-device user / fingerprint / face tallies** equalized across the **VM-reachable** fleet, with a **durable failure ledger + retry**.  
**Use when:** Merge job “runs” but progress is mostly circuit-skips; 6 devices look online on host but peer copy dies; you want overnight work without babysitting.

**Prior session evidence (do not invent past this — re-prove live):**

| Path | What it holds |
|---|---|
| `.runtime/merge-speed-truth-20260722-073117/SPEED-TRUTH-MATRIX.md` | Speed + product truth matrix |
| `.runtime/merge-speed-truth-20260722-073117/ssh-tcp.txt` | VM TCP to 6 devices |
| `.runtime/merge-job-status-20260722-071734/` | Live job ~364 ok / 2000+ fail, circuit-skips |
| Code (partial) | `applyHikvisionSdkUserMerge` already wired to `copyHikvisionUserToPeersBatch` + circuit default **3** (restart API to load) |

---

## Why short prompts fail

| Failure | Root cause | What this card forces |
|---|---|---|
| “Job is processing” = success | Circuit skip after 1 timeout | Count **real peer writes**, not processed counter |
| Host health online = copy works | Copy runs on **VM**, not host | SSH `project-truth-bnpi-pats` TCP probe before every wave |
| 6 devices in one job | TEST A/B `192.168.254.x` **FAIL from VM** | Wave 1 = Main A–D only |
| Sequential 1:1 copy | N×T VM sessions | Batch multi-target per unique ID (one VM session) |
| Stops after one fix | No EXIT GATE | Heartbeats + acceptance checklist |
| “Bulk ISAPI” fantasy | Repo has **no** multi-user bulk write | Stage user → FP → face; skip invented bulk |

---

## Operator setup (before paste)

| Setting | Required |
|---|---|
| Working directory | Repo root `bandai-infra` |
| Branch | `develop` |
| Permissions | Always-approve / bypassPermissions |
| Max turns | **`--max-turns 300`** (or higher) |
| Wall clock | **Overnight / multi-hour OK** — do not kill at 10–15 min |
| SSH | `ssh project-truth-bnpi-pats` must work (fallback LAN `infra@10.184.37.19`) |
| Local API | `http://localhost:3001` admin `admin@bandai.local` / `password123` / `appCode=bnpi-pats` |
| App | `http://localhost:5175` optional for FE proof |

### Headless example

```powershell
cd C:\Users\stari\bandai-infra

grok -p (Get-Content -Raw docs\00-product\AGENT-PROMPT-merge-device-users-speed-overnight-marathon.md) `
  --max-turns 300 `
  --permission-mode bypassPermissions
```

### If session dies early — paste only this

```text
CONTINUE MERGE SPEED OVERNIGHT MARATHON.
Open docs/00-product/AGENT-PROMPT-merge-device-users-speed-overnight-marathon.md.
Resume last incomplete PHASE and open ACCEPTANCE boxes.
Re-prove SSH VM TCP + API health first.
EXIT GATE still applies. Next action = HEARTBEAT + tool call.
No "you should restart API" homework — you restart it.
```

---

## PASTE BLOCK — copy everything inside the fence into Grok

```text
================================================================
TASK WRITER JOB CARD — MERGE DEVICE USERS SPEED + TRUTH OVERNIGHT
================================================================
You are Project Truth owner-operator agent (NOT a chat summarizer).
Repo = this workspace root. Branch = develop unless told otherwise.
Law = AGENTS.md + Agent-Meta-Prompt-Template.md + THIS JOB CARD.
Obey .grok/rules/00-wwg-session-bootstrap.md and 01-agent-owned-execution.md.

DURATION CONTRACT:
- Budget: OVERNIGHT / multi-hour continuous loop. Wall-clock is NOT a finish line.
- FORBIDDEN self-stops at 30s / 1m / 10m / 15m / “enough for now” / “user continues later”.
- Recoverable failures: retry infinitely with different approaches until Real Stop
  Conditions in AGENTS.md (only after 3+ distinct failed recoveries with evidence).
- Spawn subagents freely (explore / general-purpose) for parallel research + implement.
- SSH: `ssh project-truth-bnpi-pats` first; LAN `ssh -i %USERPROFILE%\.ssh\node-health-appliance_ed25519 infra@10.184.37.19` if needed.
- Windows: `npm.cmd` not bare npm. Restart local API yourself; poll /health.
- Commit + push develop when green slices land.

HEARTBEAT every major cycle:
HEARTBEAT | cycle=N | phase=P | checklist=X/Y | last_proof=path|fail | next=one action

================================================================
A) PRODUCT GOAL (wake-up finish line)
================================================================

GOAL: Merge device users so selected active Hikvision devices share the same
people and the same biometric richness available on the fleet.

CORRECT EXPECTATION (do not invent softer goals):

1) UNIQUE IDS
   - Union of vendor person IDs across devices in the ACTIVE WAVE.
   - Prior full-6 plan evidence: unionUsers ≈ 852, sourceRows ≈ 3715,
     plannedWrites ≈ 4260 (re-measure live; do not trust stale).

2) PER-DEVICE USER TALLY
   - After merge + reread, each device in the ACTIVE WAVE has userCount ≈
     union size for that wave (± permanent documented write failures).

3) FINGERPRINT TALLY
   - For each unique ID: if max(FP count across fleet for that ID) = N,
     every device that has the user must have FP ≥ N.
   - IDs with max FP = 0 stay "not enrolled" (NOT a merge failure).

4) FACE TALLY
   - Same rule as fingerprint for face counts / presence.
   - Missing face because device 404 / not enrolled = review item, not fake success.

5) FAILURES ARE FIRST-CLASS
   - Every failed (source, target, vendorUserId, stage, error, at) is saved to
     `.runtime/merge-ledger-<stamp>/failure.jsonl` (and success.jsonl).
   - Operator can re-run **retry-failed-only** without redoing successes.
   - In-memory job Map alone is NOT enough (lost on API restart).

OUT OF SCOPE UNLESS EXPLICITLY UNBLOCKED:
- Main Entrance Device E (10.184.38.168)
- Login A (10.184.38.167)
- Inventing multi-user bulk ISAPI that is not in repo / not proven

================================================================
B) TRUTH MATRIX (re-prove at session start — do not only quote this table)
================================================================

Prior live evidence (2026-07-22). RE-RUN SSH + health and rewrite matrix if drift.

| Device | Address | Host health users (prior) | VM TCP 80/443/8000 (prior) | In merge? |
|---|---|---|---|---|
| Main Entrance B | 10.184.37.20 | 687 | OK | YES wave1 |
| Main Entrance A | 10.184.37.21 | 687 | OK | YES wave1 |
| Main Entrance C | 10.184.37.22 | 687 | OK | YES wave1 |
| Main Entrance D | 10.184.37.23 | 687 | OK | YES wave1 |
| TEST A | 192.168.254.109 | 227 (host) | FAIL from VM | WAVE later only if VM TCP OK |
| TEST B | 192.168.254.110 | 740 (host) | FAIL from VM | WAVE later only if VM TCP OK |

CRITICAL ARCHITECTURE TRUTH:
- Host `GET /api/device/:id/health` can show ONLINE via host tunnels.
- Peer copy runs on the VM (`runHikvisionManualCopyOnVm` → C++ listener
  `--manual-full-mirror-source-device-id` + `--manual-employee-no`).
- If VM cannot TCP device:8000/443, merge WILL timeout and circuit-skip.
- Prior bad job: ~364 success / ~2300+ fail in ~60m; dominant error
  "Skipped SDK peer copy after 1 timeout failures for X to Y".

PATH TRUTH:
Windows API → SSH/SCP to VM → sudo timeout run-once C++ →
  for each peer: UserInfo/SetUp (ISAPI) → FP (ISAPI/SDK) → face (SDK).

C++ already fans ONE employee to ALL sessions in one process.
There is NO multi-employee bulk write API in repo.
`copyHikvisionUserToPeersBatch` = one employee → many targets in ONE VM session.
Merge apply was 1:1 sequential; partial fix may already call batch — VERIFY live
source contains: await copyHikvisionUserToPeersBatch + batch_copy_started +
HIKVISION_MERGE_COPY_TIMEOUT_CIRCUIT_LIMIT || 3. Restart API if code present but
process old.

ISAPI BULK:
| Op | Multi-user bulk write in repo? |
|---|---|
| User SetUp/Record | NO (per person) |
| FingerPrintDownload | NO (per finger + progress) |
| Face | NO (SDK per person) |
| One user → many peers | YES (C++ + batch JS) |

================================================================
C) SPEED MATRIX (ordered work — do in this order)
================================================================

SPEED LEVERS (highest first):

S1. SCOPE WAVE = VM-reachable devices only
    - Prove with: ssh project-truth-bnpi-pats + TCP 80/443/8000
    - Wave1 = Main A–D only (same 10.184.37.x)
    - Do NOT include TEST A/B until VM TCP OK or explicit tunnel repair

S2. BATCH MULTI-TARGET PER UNIQUE ID (not N×T VM spawns)
    - Merge apply MUST call copyHikvisionUserToPeersBatch
    - One VM session: source + all pending targets for that employeeNo
    - Keep users sequential (or concurrency ≤1–2 with VM lock) — NO unbounded Promise.all across users

S3. GAP-ONLY MATRIX
    - Skip already-converged user/FP/face (noop_already_synced)
    - Count: selectedUniqueIds, potentialWrites, skippedConverged, realPhysicalCopies

S4. CIRCUIT + TIMEOUT TRUTH
    - Circuit default ≥3 (not 1)
    - Preflight source+targets once; fail target independently
    - Persist failures; do not pretend skip = success

S5. OPTIONAL TWO-PASS MODALITY (if still slow)
    - Pass A: users only (fill missing person shells fast)
    - Pass B: fingerprints
    - Pass C: faces
    - Wake-up can green USER tallies while biometrics still running

S6. LONG-LIVED SDK SESSION (C++ / listener) — if run-once still dominates
    - Prefer armed listener multi-user queue over SSH spawn per user
    - May edit vendor/hikvision-linux/src/hikvision_bio/acs.cpp + spool.cpp + identity.cpp + fingerprint.cpp + face.cpp + copy.cpp
    - Prove with small N before full wave

S7. DURABLE LEDGER + RETRY-FAILED API/UI
    - .runtime/merge-ledger-<stamp>/{plan,success,failure,before,after}.json*
    - API or script: retry only failure.jsonl rows
    - FE: show failed rows + Retry failed (if time)

S8. NETWORK REPAIR FOR TEST A/B (separate phase)
    - Make VM reach 192.168.254.109/110 OR document as host-only diagnostic
    - Do not block Wave1 on this

FORBIDDEN SPEED MYTHS:
- "One ISAPI bulk dump for 852 people" without firmware proof
- Parallel SDK logins to same panel (will thrash)
- Trusting host health as copy path proof

================================================================
D) PHASES (execute in order; do not skip proof)
================================================================

PHASE 0 — Bootstrap + Current-State Report
- Open WWG order (project-truth, terminology, principles as needed,
  current-task, drift-guard, handoff, README).
- Write short Current-State Report in chat + `.runtime/merge-overnight-<stamp>/00-current-state.md`.
- Kill/abandon stale in-memory merge jobs if they are circuit-skipping junk
  (document jobId + last counters).

PHASE 1 — Truth matrix re-proof (SSH + API)
- ssh project-truth-bnpi-pats: hostname, listener service active?, TCP probe all 6.
- Admin login localhost:3001; device list + /health per device; capture user counts.
- Write TRUTH-MATRIX.md under evidence dir (devices, users, VM TCP, host health).
- GATE: Wave1 device set locked = only devices with VM TCP OK.

PHASE 2 — Speed baseline
- Non-mutating merge plan for Wave1 deviceIds only.
- Capture uniqueIds, plannedWrites, missing, conflicts, plan seconds.
- If old sequential code path still live: implement/confirm batch path, restart API.
- Contract test: merge apply includes copyHikvisionUserToPeersBatch + batch_copy_started.
- Optional micro-bench: copy 3 unique IDs Main B→A,C,D with Measure-Command; save JSON.

PHASE 3 — Implement remaining speed work (agent-owned coding)
Priority order inside this phase:
  a) Ensure batch multi-target in merge apply (done if already present — re-prove).
  b) Durable failure/success ledger to disk for every merge job.
  c) Retry-failed-only entrypoint (API and/or PowerShell script under scripts/).
  d) Soften circuit + preflight skip unreachable targets BEFORE timeout burn.
  e) Optional: user-only pass flag includeFingerprints/includeFaceRecognition false first.
  f) Optional C++: skip already-present peers; longer-lived session; reduce FP poll waste
     — only with evidence and focused tests.
- Unit/contract tests for every meaningful change.
- Commit focused slices on develop when green.

PHASE 4 — Wave1 execute (Main A–D)
- Small canary first: 5–10 unique IDs with gaps, batch copy, reread, prove tallies.
- Then expand: selected needs-review IDs or full gap matrix for Wave1.
- Progress must expose: stage, vendorId, source→targets, success/fail, ledger path.
- On timeout: repair path (listener, timeout env, network), do NOT leave infinite silent skip.

PHASE 5 — Reread + tally proof
- Per-device user counts for Wave1.
- Sample + aggregate FP/face gap remaining.
- Write WAKEUP-REPORT.md with before/after tables.
- If TEST A/B still desired: only after VM TCP fixed; new wave + ledger.

PHASE 6 — FE / operator journey (if time)
- Merge modal shows batch progress honestly.
- Retry failed from ledger.
- Playwright or API proof of journey.

PHASE 7 — Close-out
- Truth-sync notes if product behavior changed.
- Recommendation registry if future work found.
- Commit + push develop.
- Final acceptance checkboxes all green or Real Stop with 3 recoveries.

================================================================
E) ACCEPTANCE CHECKLIST (all required unless real blocker)
================================================================

[ ] SSH project-truth-bnpi-pats works; TCP probe saved
[ ] TRUTH-MATRIX.md + SPEED work written under .runtime/merge-overnight-<stamp>/
[ ] Wave1 excludes VM-unreachable devices (unless repaired)
[ ] Live merge apply uses batch multi-target (code + runtime log/event batch_copy_*)
[ ] Circuit limit not 1-by-default (or justified + proven)
[ ] Durable success.jsonl + failure.jsonl for a real run
[ ] Retry-failed-only path exists and is proven on ≥1 failure row
[ ] Canary 5–10 IDs: real peer write success (not only BNPI PATS db_merge)
[ ] Wave1 reread: user tallies moved toward union; FP/face gaps reduced with numbers
[ ] Focused tests green (merge helper + biometric sync contract at minimum)
[ ] API restarted and /health healthy after code change
[ ] Commit(s) on develop pushed when green
[ ] No open “you should…” residual for recoverable work
[ ] WAKEUP-REPORT.md with exact counts and remaining gaps

EXIT GATE:
- Do NOT end with summary-only if any required box is open and not a Real Stop.
- Do NOT claim bulk ISAPI multi-user write without live device proof.
- Do NOT treat circuit-skip processedWrites as successful merges.
- Next action after any heartbeat is a TOOL CALL, not homework for the human.

================================================================
F) EVIDENCE DIRECTORY SHAPE
================================================================

.runtime/merge-overnight-<stamp>/
  00-current-state.md
  TRUTH-MATRIX.md
  SPEED-MATRIX.md
  ssh-tcp.txt
  api-health.json
  devices-health.json
  merge-plan-wave1.json
  canary-copy-*.json
  merge-ledger/
    plan.json
    success.jsonl
    failure.jsonl
    before-reread.json
    after-reread.json
  WAKEUP-REPORT.md
  git-log.txt

================================================================
G) DEVICE IDS (prior — re-resolve from API; do not hardcode blindly)
================================================================

Prior IDs (verify live):
- TEST B: cmrv02vam004cnxekd57dsjh8 @ 192.168.254.110
- TEST A: cmrlgqsjv000oob01165tbd8n @ 192.168.254.109
- Main B: cmpxw13hx002h7zwso7dyedrn @ 10.184.37.20
- Main A: cmrht5s2w00ei7zgsre8y3o5n @ 10.184.37.21
- Main C: cmripjwbx00ewl001ihcke210 @ 10.184.37.22
- Main D: cmripjwkw00ffl0013lfxcbxw @ 10.184.37.23

================================================================
START NOW
================================================================
1) Bootstrap WWG + Current-State Report
2) HEARTBEAT cycle=1
3) PHASE 1 SSH TCP + API truth matrix
4) Continue phases without waiting for human
================================================================
```

---

## Short copy: “just give me the goal” (optional tiny paste)

```text
Overnight merge speed marathon: open and obey
docs/00-product/AGENT-PROMPT-merge-device-users-speed-overnight-marathon.md
Agent-owned, nonstop, SSH project-truth-bnpi-pats, Wave1 = VM-reachable Main A–D only,
batch multi-target peer copy, durable failure ledger + retry-failed, prove user/FP/face
tallies with reread evidence under .runtime/merge-overnight-<stamp>/. EXIT GATE applies.
--max-turns 300, always-approve.
```

---

## Session findings baked into this card (from parallel agents + live probes)

| Finding | Source |
|---|---|
| Merge apply was sequential user×target 1:1 | Explore agent TS path |
| Batch multi-target already exists for copy-to-all | `copyHikvisionUserToPeersBatch` + PRD |
| C++ one employee → all sessions in one run | `src/hikvision_bio/copy.cpp` + `acs.cpp` |
| No multi-user bulk ISAPI write in repo | Explore agent ISAPI research |
| TEST A/B FAIL TCP from VM; Main A–D OK | `ssh project-truth-bnpi-pats` probe |
| Prior job ~14% success, mostly circuit-skip | Live merge job API |
| Partial code: merge → batch + circuit default 3 | Local controller (restart API to load) |

---

## Related files

- `docs/00-product/PRD-hikvision-copy-to-all-performance.md`
- `.runtime/merge-speed-truth-20260722-073117/SPEED-TRUTH-MATRIX.md`
- `bnpi-pats-api/app/device/device.controller.ts` (`applyHikvisionSdkUserMerge`, `copyHikvisionUserToPeersBatch`)
- `vendor/hikvision-linux/src/hikvision_bio/acs.cpp` + `spool.cpp` + `identity.cpp` + `fingerprint.cpp` + `face.cpp` + `copy.cpp`
