# Task Writer: Sync logs truth — 3-hour non-stop marathon (v3)

**File:** `docs/00-product/AGENT-PROMPT-sync-logs-truth-3hr-marathon.md`  
**Purpose:** Force a long, evidence-driven loop until Sync logs is truthful **and** Playwright-green **and** live dual-source sync proven by the agent (not the human).  
**Use when:** Agent stops after ~30s–10m of partial work; ends with “you should hard-refresh”; UI still wrong; you want a true multi-hour job.

---

## Why short prompts fail (session-learned)

| Failure | Root cause | What this card forces |
|---|---|---|
| Stops at ~34s / 1m / **10m** | Soft “keep going” + no exit gate | **EXIT GATE** forbids summary-only end |
| Ends with “you should…” | Operator homework | **Agent owns all operator steps** |
| “Done” after edit | Code ≠ live process | Live `sync-preview` + **live dual-source sync job** |
| Unit green, UI wrong | Stale node on :3001 | Restart + re-prove response shape |
| Says Playwright, never runs | Planned ≠ proven | Playwright GREEN is a hard box |
| Background npm abandoned | No wait/poll | Poll `/health` up to 3 min |
| Permission / turn cap fake-stop | Operator config | `--max-turns 250` + always-approve |
| Windows `Start-Process npm` dies | npm is a shim | Use `npm.cmd` / `cmd /c` |
| Sync only attendance | ACS-only import | **includeOperations + includeAttendance** job proof |

**This file alone cannot fight low max-turns or tool permission prompts.** Operator setup below is mandatory for headless length; **inside the job, the agent never assigns work back to the human.**

---

## Operator setup (do this BEFORE pasting)

| Setting | Required value |
|---|---|
| Working directory | Repo root `PROJECT_TRUTH_HYPERV_FRESH` |
| Branch | `develop` |
| Tool permissions | **Always approve** / `/always-approve` / `--yolo` / `--permission-mode bypassPermissions` |
| Max turns (headless) | **`--max-turns 250`** (50–80 is too low; 10m fake-stops often = turn budget) |
| Wall clock | Plan **up to 3 hours**; do **not** kill the session after 1–15 minutes |
| Mode | Keep session open; if it ends early, paste **CONTINUE** block |

### Headless / CLI (preferred for marathon)

```powershell
cd C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH

# Headless example (flags from Grok user-guide 14-headless-mode):
grok -p (Get-Content -Raw docs\00-product\AGENT-PROMPT-sync-logs-truth-3hr-marathon.md) `
  --max-turns 250 `
  --permission-mode bypassPermissions
```

Interactive TUI: open repo root → enable always-approve → paste **PASTE BLOCK** below → leave it running for hours if needed.

### If it dies early (paste only this)

```text
CONTINUE MARATHON v3.
Open docs/00-product/AGENT-PROMPT-sync-logs-truth-3hr-marathon.md.
Resume last incomplete PHASE and incomplete ACCEPTANCE boxes.
EXIT GATE still applies: no summary-only turn, no "you should hard-refresh" exit.
Next action = HEARTBEAT + tool call. Do the operator steps yourself.
Do not re-plan from zero unless evidence is missing.
```

---

## PASTE BLOCK — copy everything inside the fence into Grok

```text
================================================================
TASK WRITER JOB CARD v3 — SYNC LOGS TRUTH (3-HOUR MARATHON)
================================================================
You are Project Truth owner-operator agent (NOT a chat summarizer).
Repo = this workspace root. Branch = develop unless told otherwise.
Law = AGENTS.md + Agent-Meta-Prompt-Template.md + THIS JOB CARD.
Also obey .grok/rules/00-wwg-session-bootstrap.md "Operator steps are agent steps".

DURATION CONTRACT:
- Budget: UP TO 3 HOURS of continuous loop engineering.
- FORBIDDEN self-stops at 30s / 1m / 4m / 10m / 15m / “one PR” /
  “tests planned” / “enough for now” / “user can continue later”.
- Wall-clock is NOT a finish line. 10 minutes of work is NOT done.
- You may finish EARLY only if ACCEPTANCE (section F) is fully green
  with .runtime evidence paths. Early green is allowed. Early exit
  without green is BANNED.

================================================================
A. EXIT GATE (read twice — this is why 34s / 10m stops happen)
================================================================
Before you emit ANY final/idle/summary-only message, you MUST:

1) Re-list ACCEPTANCE boxes mentally (section F).
2) If ANY required box is still open:
   - You are NOT allowed to end the turn.
   - Your next output MUST include:
     HEARTBEAT | cycle=N | phase=... | checklist=X/Y | last_proof=... | next=...
   - And MUST include a tool call (Read / Shell / Edit / Playwright / etc.)
3) Partial success is NOT done. Especially NOT done:
   - code edited but live API still Unknown-only
   - unit tests green but Playwright not run to green
   - Playwright green on mocks but live sync-preview wrong
   - live dual-source sync job never started / never polled to completed
   - “user should restart API / hard-refresh / click Sync” (YOU do it)
   - background job started but never polled to health
4) If a command is long: wait/poll; do not abandon the job card.
5) If one path blocks after 3 documented recoveries: mark that sub-path
   blocked with evidence, then CONTINUE every other open box.
6) Fake blockers (FORBIDDEN to stop on these alone):
   Docker off, VM off, port down, warm-up, PATH, npm install, flaky test,
   dirty git you can isolate, need restart, tunnel needs start,
   DB forward 55435 down, Windows Start-Process npm failure
   (use npm.cmd or cmd /c — recover yourself).
7) Real Stop only per AGENTS.md: 3 distinct recoveries failed with evidence,
   irreversible data risk, missing irrecoverable access, or would invent secrets.

OPERATOR STEPS ARE AGENT STEPS (never assign to human):
- Restart bnpi-pats-api with npm.cmd; poll http://localhost:3001/health.
- Restart or re-hit bnpi-pats-app if UI is stale; prove via network/API + Playwright.
- Login admin@bandai.local / password123 / appCode=bnpi-pats.
- GET sync-preview; POST hikvision/sync with includeAttendance+includeOperations;
  poll import-jobs until completed; save JSON under .runtime/.
- Run Playwright smoke for Sync logs table + scope toggles to GREEN.
- Commit + push develop when green. Do not say “you should push”.

HEARTBEAT (required every cycle; user-visible):
HEARTBEAT | cycle=<N> | phase=<0-7> | checklist=<done>/<total> | last_proof=<path|fail> | next=<one action>

MINIMUM WORK BEFORE YOU MAY CONSIDER STOPPING IF NOT GREEN:
- At least 20 HEARTBEAT cycles, OR
- Full ACCEPTANCE green with evidence
(whichever comes first for DONE; if not green after 20 cycles, KEEP GOING)

If you catch yourself writing “In summary…” or “What you should do next…”
with open boxes: DELETE that and issue the next tool call instead.

================================================================
B. BOOTSTRAP (tools first — ban memory / ban hallucination)
================================================================
Before plan or edit, Read with tools IN ORDER:
1. .wwg/reports/wwg-agent-handoff.md
2. .wwg/workspace/current-task.md
3. .wwg/wiki/project-truth-summary.md
4. Task-relevant .wwg/wiki/project-truth.md (device events / sync)
5. .wwg/governance/drift-guard.md
6. Agent-Meta-Prompt-Template.md (phase loop)
7. docs/00-product/AGENT-PROMPT-nonstop-loop-engineering.md (rules)
8. This file’s sibling knowledge in code:
   - bnpi-pats-api/app/device/device.controller.ts (sync-preview, logSearch)
   - bnpi-pats-api/helper/sync-logs-event-rows.helper.ts
   - bnpi-pats-api/helper/hikvision-event-contract.helper.ts
   - bnpi-pats-app/app/routes/admin/devices/events.tsx
   - bnpi-pats-app/tests/smoke/admin-device-sync-logs-truth.spec.ts
9. Latest .runtime/* sync-logs / listener evidence if present

Post short Current-State Report:
- what files + live probes say is true now
- STALE / CONFLICTING / NEEDS_CONFIRMATION
- marathon finish line
- touch list / do-not-touch list

Hard ban: inventing willAdd, device counts, filter labels, IPs, or “done”
without .runtime proof.

================================================================
C. PRODUCT TRUTH (re-prove live; do not only believe chat memory)
================================================================
Known failure mode (must re-verify):
- Device maintain Log shows ~20k Information rows:
  Minor "Add Fingerprint..." / "Add Person Inf..." (user create)
- Sync modal wrongly shows mainly:
  Unknown operation +20k (Needs review) + Attendance tap +4k
- That residual dump is NOT enroll truth.

Correct ISAPI truth for operations:
- metaId MUST be: log.hikvision.com/Information
- NOT only log.std-cgi.com (mixes UI noise like enterLocalUIBackground)
- Classify:
  addUserInfo / Add Person* → USER_CREATED
  addFpByEmployeeNo / Add Fingerprint* → FINGERPRINT_ENROLLED
- Sample classify + extrapolate proportions × totalMatches → willAdd
- Attendance willAdd from ACS residual (separate source)

Also:
- Devices table Online = host ISAPI health, NOT listener SDK green
- Listener green = reverse tunnel 127.0.0.1:59000 + sdk_login/arm
- Category=Attendance must NOT list User created in Action filter

TEST A defaults (re-confirm from live API/DB; do not invent if changed):
- Device address: 192.168.254.189
- Prefer deviceId from live list/sync-preview if present
- App UI: http://localhost:5175  API: http://localhost:3001
- Admin: admin@bandai.local / password123 / appCode=bnpi-pats

================================================================
D. GOAL
================================================================
Make Sync device logs modal TRUTHFUL for TEST A and keep filters honest:

1) Preview shows Fingerprint enrolled + User created willAdd from
   Information logSearch classification (not Unknown-only dump)
2) Attendance tap residual remains separate and honest
3) Unclassified residual is residual only (Needs review)
4) Single Online device preview ideally ≤3s (all-devices partial OK)
5) Category→Action filter map (Attendance excludes enroll/user)
6) Sync path targets missing/estimated rows (no full-history default)
7) Playwright + unit/contract prove the contract
8) Live localhost UI after API restart matches JSON truth

================================================================
E. 3-HOUR PHASE PLAN (task writer schedule)
================================================================
Execute phases in order. Incomplete phase = stay until done or 3 recoveries.
Time boxes are guidance for a 3-hour budget, not permission to quit early.

PHASE 0 — BOOTSTRAP + STAMP (0–10 min)
  - Create .runtime/sync-logs-truth-marathon-<yyyyMMdd-HHmmss>/
  - Write current-state.md from WWG + probes
  - HEARTBEAT cycle 1

PHASE 1 — LIVE TRUTH PROBE (10–40 min)
  - Health + login local API
  - If login fails: recover DB 127.0.0.1:55435
    (scripts/start-k8s-dev-db-access.ps1 or repo equivalent) — 3 tries
  - Direct device logSearch digest to TEST A with metaId
    log.hikvision.com/Information; save XML sample under .runtime/
  - Classify sample offline with classifyHikvisionLogSearchRow
  - GET /api/device/sync-preview?deviceId=<TEST A>
  - Compare live preview vs device maintain vs classifier
  - Write probe-report.md (totals, byAction, elapsed ms)
  - HEARTBEAT

PHASE 2 — ROOT CAUSE LOCK (40–60 min)
  - Name exact bug with evidence (wrong metaId, sample not wired,
    stale node process, Map not passed, UI label stale, etc.)
  - Minimal fix list only
  - HEARTBEAT

PHASE 3 — IMPLEMENT (60–120 min)
  - Fix API logSearch metaId + sample classify + extrapolate willAdd
  - Fix UI category→action options
  - Fix targeted sync filters if import still full-scans
  - Update unit/contract tests in same pass
  - HEARTBEAT after each meaningful edit batch

PHASE 4 — LIVE PROCESS PROOF (120–150 min)  *** CRITICAL ***
  - Kill stale process on :3001 if needed
  - Start bnpi-pats-api dev RELIABLY on Windows:
      Prefer: npm.cmd run dev  (or cmd /c "npm run dev")
      Do NOT assume Start-Process -FilePath npm works (often fails)
  - Poll http://localhost:3001/health until healthy (up to ~3 min)
  - Re-run sync-preview; MUST show Fingerprint enrolled + User created
  - Save preview JSON; if still Unknown-only → return PHASE 2/3 (loop)
  - HEARTBEAT

PHASE 5 — AUTOMATED PROOF (150–165 min)
  - bnpi-pats-api mocha: sync-logs-event-rows + device-log-sync + hikvision contracts
  - bnpi-pats-app vitest: device-events-page-contract
  - Playwright (headless):
      bnpi-pats-app/tests/smoke/admin-device-sync-logs-truth.spec.ts
      bnpi-pats-app/tests/smoke/admin-device-events-sync-modal.spec.ts
  - On fail: fix → re-run (do not stop)
  - Save junit/stdout + screenshots under .runtime/
  - HEARTBEAT

PHASE 6 — BROWSER / USER JOURNEY (165–175 min)
  - Hard-refresh localhost:5175 Sync logs for TEST A
  - Screenshot modal showing classified rows (not Unknown-only)
  - Category=Attendance → Action list has no User created / Fingerprint enrolled
  - HEARTBEAT

PHASE 7 — CLOSEOUT (175–180 min)
  - Update .wwg/workspace/current-task.md addendum (truthful status)
  - Commit focused files; push develop when green
  - FINAL acceptance table with evidence paths
  - List residuals honestly (do not hide)

If at 180 min checklist incomplete: do NOT fake done.
Post blocked sub-paths with 3 recoveries each; continue if session open.

================================================================
F. ACCEPTANCE CHECKLIST (DONE only when all proven)
================================================================
[ ] WWG bootstrap Current-State Report posted
[ ] Direct Information logSearch sample saved under .runtime/
[ ] Classifier maps addUserInfo / addFpByEmployeeNo (and UI labels)
[ ] Live sync-preview JSON includes eventRows:
      - Fingerprint enrolled willAdd (number visible; not hidden)
      - User created willAdd (number visible; not hidden)
      - Attendance tap willAdd honest
      - Unclassified/Unknown is residual only (not sole huge op line)
[ ] opTotal for operations ≈ Information total (~20k class), explained
[ ] Single-device preview timing recorded (target ≤3s Online host)
[ ] Category→Action filter: Attendance excludes User created / enroll
[ ] mocha contracts green (sync-logs-event-rows + Information metaId)
[ ] vitest device-events-page-contract green
[ ] Playwright admin-device-sync-logs-truth.spec.ts GREEN
[ ] Playwright admin-device-events-sync-modal.spec.ts GREEN (or justified skip with evidence)
[ ] Live dual-source sync job completed with operationsImported>0 AND attendanceImported>0
    (POST hikvision/sync includeAttendance+includeOperations; poll import-jobs; .runtime JSON)
[ ] Scope controls on Sync logs modal proven (What to save + How far back) via Playwright
[ ] Live UI screenshot after API restart matches JSON
[ ] Evidence directory complete under .runtime/sync-logs-truth-marathon-*/ (or sync-operator-owned-*)
[ ] develop commit+push when green (or blocked with reason + evidence)
[ ] FINAL message has ZERO "you should hard-refresh / click Sync / restart API" homework

================================================================
G. COMMANDS (adapt; never invent success)
================================================================
# Evidence dir
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dir = Join-Path '.runtime' "sync-logs-truth-marathon-$stamp"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

# DB if login fails
# powershell -File scripts/start-k8s-dev-db-access.ps1 -LocalPort 55435

# Windows-safe API restart pattern
# Stop-Process on owners of port 3001 if needed
# Start with npm.cmd (NOT bare "npm" via Start-Process):
#   Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' `
#     -WorkingDirectory '...\bnpi-pats-api' -RedirectStandardOutput $out `
#     -RedirectStandardError $err -WindowStyle Hidden
# Then poll /health until up.

# Login + preview (admin)
# $loginBody = @{ email='admin@bandai.local'; password='password123'; appCode='bnpi-pats' } | ConvertTo-Json
# $login = Invoke-RestMethod -Method Post 'http://localhost:3001/api/auth/login' ...
# Invoke-RestMethod GET sync-preview?deviceId=... → save JSON to $dir

# Unit
# cd bnpi-pats-api
# npx tsx node_modules/mocha/bin/mocha --no-config tests/sync-logs-event-rows.helper.spec.ts tests/device-log-sync-targeted.contract.spec.ts tests/hikvision-event-contract.helper.spec.ts
# cd bnpi-pats-app
# npx vitest run app/lib/device-events-page-contract.test.ts

# Playwright
# cd bnpi-pats-app
# npx playwright test --config=playwright.smoke.config.ts tests/smoke/admin-device-sync-logs-truth.spec.ts tests/smoke/admin-device-events-sync-modal.spec.ts

================================================================
H. OUTPUT RULES
================================================================
- Prefer tool actions over long essays.
- Never invent Playwright green.
- Never say “should work after refresh” without YOU restarting API
  and re-fetching sync-preview.
- FINAL message only when section F complete OR Real Stop with
  3 recoveries documented per blocked path.
- Final message format when DONE:
  A) Acceptance checklist [x]/[ ] + evidence paths
  B) What changed (paths)
  C) Residuals
  D) Commit hash if pushed

START NOW: PHASE 0 bootstrap with tool Reads.
First user-visible line after bootstrap: HEARTBEAT | cycle=1 | ...
================================================================
```

---

## Shorter operator paste (if fence is too long for UI)

If the TUI chokes on length, paste this instead (agent must still open the full file):

```text
TASK WRITER MARATHON v3 — Sync logs truth (3 hours).
Open and OBEY docs/00-product/AGENT-PROMPT-sync-logs-truth-3hr-marathon.md PASTE BLOCK.
EXIT GATE active: no summary-only end while ACCEPTANCE open.
Never end with "you should hard-refresh / click Sync" — YOU do operator steps.
Min 20 HEARTBEATs or full green. Live sync-preview + dual-source sync job + Playwright GREEN.
Restart API with npm.cmd on Windows. Evidence under .runtime/.
Commit/push develop when green. Real stop only per AGENTS.md.
Headless: --max-turns 250. START: PHASE 0 Read WWG + HEARTBEAT cycle=1.
```

---

## Why v2 is stronger than v1 / short non-stop suffix

| Feature | Short suffix | v1 marathon | **v2 marathon** |
|---|---|---|---|
| Soft “keep going” | Yes | Soft | **EXIT GATE hard ban** |
| Min heartbeats | No | 10 | **15** |
| Windows npm recovery | No | Weak | **npm.cmd documented** |
| Headless flags | Vague | 150+ | **`--max-turns 200` + bypassPermissions** |
| Continue protocol | Weak | Yes | **CONTINUE MARATHON v2** |
| Live process = done | Soft | Yes | **Phase 4 critical loop** |
| Playwright hard box | Soft | Yes | **Yes + screenshots** |

---

## Related

- General non-stop template: `docs/00-product/AGENT-PROMPT-nonstop-loop-engineering.md`
- Bootstrap: `docs/agent-bootstrap-grok.md`
- Law: `AGENTS.md`
