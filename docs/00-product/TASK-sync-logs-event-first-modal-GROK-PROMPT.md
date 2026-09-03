# Grok Non-Stop Prompt — Sync Logs Event-First Modal

Copy everything under **PASTE BELOW THIS LINE** into a fresh Grok session in this repo.

---

## How Grok loads instructions (research notes)

Grok does **not** magically read the whole WWG wiki first. It loads project rules automatically, then follows what those rules (and your prompt) tell it to open.

### Auto-loaded by Grok (session start)

| Priority | Path | What it is |
|---|---|---|
| 1 | `~/.grok/AGENTS.md` | Global Grok rules (all projects) |
| 2 | Repo root `AGENTS.md` / `Agents.md` | Project Truth operating rules (this repo) |
| 3 | Deeper `AGENTS.md` under cwd | Directory-scoped rules (wins on conflict) |
| + | `CLAUDE.md`, `.grok/rules/*.md`, etc. | Compatibility / extra rules if present |

On this Windows host, Project Truth injects root **`Agents.md` / `AGENTS.md`** as project instructions. That is the “always on” autonomy/safety layer.

### NOT auto-loaded (agent must open them)

| Path | Why open it |
|---|---|
| `.wwg/reports/wwg-agent-handoff.md` | Latest handoff / validation FAIL notes |
| `.wwg/workspace/current-task.md` | Current task status |
| `.wwg/wiki/project-truth.md` (+ summary) | Canonical product truth |
| `.wwg/wiki/terminology.md` | Names that must stay stable |
| `.wwg/governance/drift-guard.md` | What not to drift |
| `Agent-Meta-Prompt-Template.md` | Phase loop for multi-step work |
| Relevant source under `hris-app` / `hris-api` | Real implementation |

**Rule of thumb:**  
- **AGENTS.md** = how Grok must behave (autonomy, host/VM, bans, stop conditions).  
- **WWG** = what is true about the product and what the current task is.  
- **Your paste prompt** = this specific finish line (event-first Sync logs).

If the prompt does not force WWG discovery + non-stop recovery, the agent may “finish” after one UI edit. This prompt forbids that.

---

## PASTE BELOW THIS LINE

```text
You are Grok in Project Truth. Owner-operator mode. Do not stop early.

================================================================================
0) HOW YOU LOAD TRUTH (DO THIS FIRST, EVERY SESSION)
================================================================================

A. Project rules are already injected from AGENTS.md / Agents.md.
   Obey them: autonomy, host-local VM first, Cloudflare tunnel ban, real
   endpoint dry-run, browser proof after API proof, keep-going default.

B. Immediately open these files in order (do not skip):
   1. .wwg/reports/wwg-agent-handoff.md
   2. .wwg/workspace/current-task.md
   3. .wwg/wiki/project-truth-summary.md
   4. .wwg/wiki/project-truth.md  (DeviceEvent / DeviceUser / Hikvision sections)
   5. .wwg/wiki/terminology.md
   6. .wwg/governance/drift-guard.md
   7. docs/00-product/TASK-hikvision-sync-logs-dual-source.md  (if present)
   8. docs/00-product/TASK-sync-logs-event-first-modal-GROK-PROMPT.md  (this task)
   9. Agent-Meta-Prompt-Template.md  (use the phase loop for this multi-step work)

C. Then code discovery (read before editing):
   - hris-app/app/routes/admin/devices/events.tsx  (Sync logs modal UI)
   - hris-app/app/services/devices.service.ts
   - hris-app/app/lib/*device-events*
   - hris-api device controller + Hikvision sync/preview helpers
   - hris-api helper/hikvision-event-contract.helper.ts (and related)
   - existing tests: device-events page contract, smoke sync modal, taxonomy specs
   - latest .runtime/* and .wwg/reports/*hikvision*device-events* evidence

D. Write a short Current-State Report in chat (or .runtime stamp) BEFORE coding:
   - what Sync logs shows today
   - which preview/sync endpoints exist
   - what is already event-first vs still device-first
   - what is broken / missing for this finish line

================================================================================
1) GOAL
================================================================================

Screen:
Admin > Configuration > Devices > Device Events > Sync logs

Redesign Sync logs so the admin sees, per Hikvision device:

  "What event rows will be added to Device Events if I click Sync logs?"

Main table is EVENT-FIRST, not inventory-first.

================================================================================
2) CURRENT PROBLEM
================================================================================

Current modal is hard to understand: one broad row per device with abstract
counts like On device / In HRIS / Can import.

That forces the admin to decode internals instead of seeing:

  Fingerprint enrolled +24
  User created +20
  Attendance tap +2,085
  ...

================================================================================
3) NEW MODAL DESIGN (VISUAL FINISH LINE)
================================================================================

Top of modal: summary for the whole run.

Then for EVERY Hikvision device:

  Device: Hikvision Main Entrance Device A
  Address: 10.184.38.173:443

  Will add to Device Events

  | Event to add | Will add | Already in HRIS | Source proof | Filter after sync | Status |
  |---|---:|---:|---|---|---|
  | Fingerprint enrolled | +24 | 3 | Operation logs | Enrollment > Fingerprint enrolled | Ready |
  | User created | +20 | 0 | Operation logs | User Management > User created | Ready |
  | Face enrolled | +12 | 1 | Operation logs | Enrollment > Face enrolled | Ready |
  | Attendance tap | +2,085 | 23 | Attendance/access events | Attendance > Tap | Ready |
  | Rejected tap | +7 | 0 | Attendance/access events | Attendance > Tap rejected | Ready |
  | Unknown operation | +14 | 0 | Operation logs | Unknown > Unknown | Needs review |

Admin must see event counts FIRST.
Source proof is secondary but visible.

"On device / In HRIS / Can import" may live in collapsed details only.
They must NOT be the main story.

Required columns exactly:
Event to add | Will add | Already in HRIS | Source proof | Filter after sync | Status

================================================================================
4) TOP SUMMARY (REQUIRED)
================================================================================

Devices checked: N
Will add to Device Events: N
Already in HRIS: N
Needs review: N
Failed: N
Ready source checks: X of Y

Example target shape:
Devices checked: 7
Will add to Device Events: 12,927
Already in HRIS: 23
Needs review: 14
Failed: 0
Ready source checks: 12 of 14

================================================================================
5) REQUIRED EVENT ROWS
================================================================================

From Operation logs (ContentMgmt/logSearch):
- Fingerprint enrolled / updated / deleted
- Face enrolled / updated / deleted
- Card enrolled / updated / deleted
- User created / updated / deleted
- Unknown operation

From Attendance/access events (AccessControl/AcsEvent):
- Attendance tap
- Rejected tap
- Unknown access event

Required filter destinations:
- Fingerprint enrolled -> Enrollment > Fingerprint enrolled
- Fingerprint updated -> Enrollment > Fingerprint updated
- Fingerprint deleted -> Enrollment > Fingerprint deleted
- Face enrolled -> Enrollment > Face enrolled
- Face updated -> Enrollment > Face updated
- Face deleted -> Enrollment > Face deleted
- Card enrolled -> Enrollment > Card enrolled
- Card updated -> Enrollment > Card updated
- Card deleted -> Enrollment > Card deleted
- User created -> User Management > User created
- User updated -> User Management > User updated
- User deleted -> User Management > User deleted
- Attendance tap -> Attendance > Tap
- Rejected tap -> Attendance > Tap rejected
- Unknown operation -> Unknown > Unknown
- Unknown access event -> Unknown > Unknown

================================================================================
6) PRODUCT TRUTH (NON-NEGOTIABLE)
================================================================================

- DeviceEvent is the saved source of truth for these rows.
- DeviceUser is only current inventory.
- NEVER create Fingerprint enrolled (or other lifecycle events) from DeviceUser inventory.
- Fingerprint enrolled comes from Operation logs only.
- Attendance tap comes from Attendance/access events only.
- Operation logs = ContentMgmt/logSearch
- Attendance/access events = AccessControl/AcsEvent
- Do NOT reuse browser cookies, WebSession, SessionTag, or copied curl session headers.
- Use stored HRIS device credentials / existing server-side Hikvision client only.

================================================================================
7) PREVIEW BEHAVIOR
================================================================================

Preview shows what WILL be added.
Preview SAVES NOTHING.
Preview is safe and re-runnable.
Preview response must power the event-first per-device tables + top summary.

If preview endpoint shape is wrong/missing, fix backend + frontend together.
Do not fake UI counts.

================================================================================
8) SYNC BEHAVIOR
================================================================================

On Sync logs click:
1. Save listed Will-add rows as DeviceEvent
2. Do not duplicate rows already in HRIS
3. Preserve raw device evidence
4. After sync, the Filter after sync destinations must show imported rows
5. Refresh modal/page counts so Will add drops and Already in HRIS rises correctly

Support dual sources in one sync run when both are ready:
- logSearch operation/enrollment history
- AcsEvent attendance/access history

================================================================================
9) MUST NOT DO
================================================================================

- Do not stop after one file edit, one test pass, or a "looks fine" claim
- Do not ask for approval for normal implement/test/recover/commit progress
- Do not disable/stop/mask cloudflared-bnpi-hris tunnel
- Do not make Windows Docker Desktop / WSL the Project Truth runtime
- Do not invent lifecycle events from DeviceUser inventory
- Do not leave device-first On device/In HRIS/Can import as primary UX
- Do not save during preview
- Do not import duplicates
- Do not paste secrets/cookies into repo, logs, screenshots, or .runtime
- Do not claim done without evidence under .runtime/<task-stamp>/

================================================================================
10) EXECUTION LOOP (NO LONG IDLE STOPS)
================================================================================

Use Agent-Meta-Prompt-Template phases. Keep working until the finish line or a
REAL stop condition from AGENTS.md.

Loop forever until acceptance checklist is green:

PASS A — Discovery + current-state report (no code yet if truth is unclear)
PASS B — Plan (files, API contract deltas, UI contract, tests, evidence path)
PASS C — Implement preview contract (backend) if needed
PASS D — Implement event-first modal UI
PASS E — Implement sync execute path + dedupe + filter destinations
PASS F — Unit/contract tests
PASS G — Local API dry-run proof (admin@bandai.local / password123 / appCode hris)
PASS H — Browser/Playwright proof of Sync logs modal (headless preferred)
        Use: cd hris-app; npx playwright test tests/smoke/admin-device-events-sync-modal.spec.ts --config=playwright.smoke.config.ts
        (webServer auto-starts Vite; plain playwright.config.ts expects :5175 and will fail if app is down)
        Save screenshots under .runtime/sync-logs-event-first-<stamp>/screenshots/
PASS I — Fix failures; re-run from the failed pass
PASS J — Truth sync: update current-task, project-truth if behavior changed,
         recommendation-registry if out-of-scope work appears
PASS K — Commit + push develop when implementation is proven
PASS L — If VM/LAN is part of verification for this machine, use direct LAN first:
         ssh -i %USERPROFILE%\.ssh\node-health-appliance_ed25519 infra@10.184.37.19

Recovery rule (AGENTS.md):
- Fake blockers are banned (Docker off, VM off, port down, warm-up, workflow not
  started, missing agent-browser, need commit/push, need install/build).
- Research, recover, retry.
- Same failure after 3 DIFFERENT plausible fixes with evidence => document as
  real blocker and continue every other unblocked path.
- Do not idle waiting for the user. Keep going.

Evidence rule:
Create:
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $dir = Join-Path '.runtime' "sync-logs-event-first-$stamp"
Capture:
  - preview JSON (full)
  - sync dry-run/execute summary (non-destructive first)
  - screenshots of modal + per-device event table
  - filter proof after sync if execute was approved by safety rules
  - test command outputs

For local admin API checks, default actor:
  email=admin@bandai.local password=password123 appCode=hris
Prefer non-mutating first (preview / execute=false).

Browser verification:
  Prefer headless Playwright path from AGENTS.md until agent-browser is proven.
  API/network proof BEFORE browser proof.

================================================================================
11) ACCEPTANCE CHECKLIST (ALL REQUIRED)
================================================================================

[ ] Top summary shows Devices checked, Will add, Already in HRIS, Needs review,
    Failed, Ready source checks
[ ] Every Hikvision device shows name + address
[ ] Event-first table columns exactly match required set
[ ] Event counts are the primary visual (Fingerprint enrolled +N, etc.)
[ ] Source proof shows Operation logs vs Attendance/access events
[ ] logSearch and AcsEvent mapping is correct in code + UI labels
[ ] Required event groups from both sources are supported
[ ] Filter destinations match required mapping
[ ] Preview saves nothing (prove with DB/API before/after or dry-run flag)
[ ] Sync saves only Will-add DeviceEvent rows
[ ] Already-in-HRIS rows are not duplicated
[ ] Raw device evidence preserved
[ ] After sync, filters show imported rows
[ ] Fingerprint enrolled never created from DeviceUser inventory
[ ] No cookie/WebSession/SessionTag reuse
[ ] Focused unit/contract tests pass
[ ] Smoke/Playwright modal proof passes or evidence explains residual UI-only gap
[ ] .runtime stamp folder exists with JSON + screenshots
[ ] current-task / truth docs updated if product behavior changed
[ ] Changes committed and pushed to develop when green
[ ] Final handoff lists remaining drift only if real stop conditions hit

================================================================================
12) OUTPUT FORMAT WHEN TRULY DONE
================================================================================

Return a short close-out only when checklist is green or real stop condition hit:

1. What changed (UI + API + tests)
2. Evidence paths under .runtime and .wwg/reports
3. Commands run + pass/fail
4. Commit SHAs / push status
5. Remaining drift (only real blockers with 3-attempt evidence)

Until then: keep executing. No "waiting for approval". No long stall.
If blocked on one path, switch to the next unblocked path immediately.
```

---

## Optional: one-line starter for a new Grok chat

```text
Read AGENTS.md (already injected), then open .wwg handoff + current-task + project-truth, then execute docs/00-product/TASK-sync-logs-event-first-modal-GROK-PROMPT.md without stopping until the acceptance checklist is green or a real AGENTS.md stop condition is proven with 3 recovery attempts.
```
