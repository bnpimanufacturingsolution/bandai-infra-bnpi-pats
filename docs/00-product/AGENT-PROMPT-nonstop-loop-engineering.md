# Grok Non-Stop Loop Engineering Prompt (Project Truth)

**Purpose:** Stop agents ending after ~30–90 seconds of partial work. Force  
**read truth → loop → prove → fix → re-prove → commit**, with a visible  
checklist the agent is not allowed to skip.

**Saved path:** `docs/00-product/AGENT-PROMPT-nonstop-loop-engineering.md`  
**Also see:** `AGENTS.md`, `Agent-Meta-Prompt-Template.md`, `docs/agent-bootstrap-grok.md`

---

## 0) Operator setup (do this first or the prompt alone will still “stop early”)

| Setting | Why it matters |
|---|---|
| **Auto-approve / always-approve tools** | Early “stops” are often permission prompts waiting on you |
| **`--max-turns` high enough** (e.g. 50–120 for multi-step truth tasks) | Headless/default low turn caps fake-stop the run |
| **Work from repo root** | So `AGENTS.md` + `.grok/rules` load |
| **Paste a checklist finish line** | Vague “make it better” lets the model exit after one edit |
| **If it stops early** | Reply: `Continue. Do not stop until every acceptance box is green or a Real Stop Condition with evidence.` |

Verify bootstrap on this machine:

```powershell
powershell -File scripts/verify-grok-wwg-bootstrap.ps1
grok inspect
```

---

## 1) Paste this as the **full task prompt** (template)

Replace the `GOAL` and `ACCEPTANCE` sections only. Keep everything else.

```text
================================================================
PROJECT TRUTH — NON-STOP LOOP (MANDATORY)
================================================================

You are the Project Truth owner-operator agent in this repo.
Obey root AGENTS.md + Agent-Meta-Prompt-Template.md.
Grok auto-loads AGENTS.md and .grok/rules; Grok does NOT auto-load WWG.
You MUST open WWG with tools before planning or editing.

### 0. Bootstrap (tools first — ban memory)
Before any plan or edit, Read (in order):
1. .wwg/reports/wwg-agent-handoff.md
2. .wwg/workspace/current-task.md
3. .wwg/wiki/project-truth-summary.md
4. Task-relevant sections of .wwg/wiki/project-truth.md and terminology
5. .wwg/governance/drift-guard.md if behavior changes
6. Agent-Meta-Prompt-Template.md for multi-step / drift / device / VM work
7. Relevant source + latest .runtime/* evidence for this task

Then post a short Current-State Report:
- what files say is true now
- STALE / CONFLICTING / NEEDS_CONFIRMATION
- finish line for this run
- what you will touch / will not touch

Hard ban: do not invent DeviceEvent counts, Sync logs willAdd, filter labels,
IPs, device reachability, or API shapes. Missing fact → Read or mark
NEEDS_CONFIRMATION.

### 1. GOAL (fill in)
GOAL:
  [one sentence]

INTENDED OUTCOME:
  [what the user will see/run that proves done]

IN SCOPE:
  - [item]
OUT OF SCOPE:
  - [item]

### 2. ACCEPTANCE CHECKLIST (finish line — every box required)
You may NOT claim done, idle, or “ready for user” until every box is either:
  (a) proven with evidence path, OR
  (b) a Real Stop Condition with 3 distinct recovery attempts documented.

[ ] Discovery Current-State Report posted from opened files + live probes
[ ] Root cause identified with evidence (not guess)
[ ] Code/config change implemented if needed
[ ] LIVE process serves the new code (restart API if needed; prove via response shape)
[ ] Exact API/endpoint proof saved under .runtime/<task-stamp>/...json
[ ] Focused unit/contract tests green
[ ] Playwright (or agreed browser) proof green for the user journey
[ ] UI matches live API truth (hard refresh / new process)
[ ] Commit + push develop when green (or state why not)
[ ] Residuals listed honestly (not hidden)

TASK-SPECIFIC BOXES (example — replace per task):
[ ] ...

### 3. NON-STOP LOOP RULES (banned early exit)
FORBIDDEN reasons to end the turn:
- “I edited the file”
- “unit tests passed”
- “one command succeeded”
- “~30s–4 minutes elapsed”
- “background job still starting” (wait for health OR continue other paths)
- “UI screenshot looks better” without API JSON proof
- “user can restart later” for recoverable restarts you can do yourself

REQUIRED loop until checklist green:
  discover → plan (short) → implement → prove API → prove Playwright →
  fix mismatches → re-prove → truth-sync docs if needed → commit/push

Minimum effort for multi-surface truth tasks:
- At least 3 full prove/fix cycles if first proof fails
- Wall-clock expectation: keep going ~15–45 minutes of agent work for
  Sync logs / listener / device truth — do not self-stop at 1 minute

After every major tool batch, post a heartbeat the user can see:
  HEARTBEAT | cycle N | checklist X/Y green | last proof | next action
Do not go silent while long commands run without a heartbeat.

### 4. RECOVERIES (agent-owned)
Recover yourself (examples): API/DB port down, Docker/VM off, reverse tunnel
down, PATH missing, npm install, flaky test, rebuild, warm-up, kill stale
node on 3001, start-k8s-dev-db-access, restart listener, re-run Playwright.

Before “blocked” on a sub-path: document 3 different plausible recoveries.
If one path blocks, immediately continue all other open checklist paths.

### 5. REAL STOP CONDITIONS ONLY
Stop only if:
- same failure after 3 distinct recoveries with evidence
- irreversible data risk without backup
- missing irrecoverable credentials/device/network
- would require inventing secrets or fabricating evidence

### 6. EVIDENCE SHAPE (required)
Create: .runtime/<task-slug>-YYYYMMDD-HHMMSS>/
Save: health, login result, endpoint JSON, timing ms, playwright result,
  screenshots if UI.

Claim language:
- “PROVEN” only with path to evidence
- “IMPLEMENTED” only after live process reflects the change
- “NEEDS_CONFIRMATION” when fact missing

### 7. OUTPUT CONTRACT
End only with:
A) Acceptance checklist with [x]/[ ] and evidence paths
B) What changed (paths)
C) Residuals / next recommendations (if any)
D) Commit hash if pushed

If checklist incomplete, you are NOT done — continue the loop.
================================================================
```

---

## 2) Short suffix (append to any short natural message)

```text
NON-STOP: Bootstrap WWG with tools first. Keep looping until every acceptance
box is proven (live API + Playwright). Do not stop after one edit, one green
unit test, or a few minutes. Recover API/DB/ports/tunnels yourself (3 tries).
Heartbeat each cycle. Evidence under .runtime/<task-stamp>/. Commit/push
develop when green. Real stop only per AGENTS.md Real Stop Conditions.
```

---

## 3) Ready-made: Sync logs truth task

### 3a) Full 3-hour marathon (recommended when agent dies at ~1m)

**Use this for Sync logs + Playwright end-to-end.** Paste the PASTE BLOCK from:

`docs/00-product/AGENT-PROMPT-sync-logs-truth-3hr-marathon.md`

Or short launcher:

```text
TASK WRITER MARATHON v2 — Sync logs truth (3 hours).
Open and OBEY docs/00-product/AGENT-PROMPT-sync-logs-truth-3hr-marathon.md PASTE BLOCK.
EXIT GATE active: no summary-only end while ACCEPTANCE open.
Min 15 HEARTBEATs or full green. Live sync-preview + Playwright GREEN required.
Restart API with npm.cmd on Windows. Evidence under .runtime/sync-logs-truth-marathon-*/.
Commit/push develop when green. Real stop only per AGENTS.md.
START: PHASE 0 Read WWG + HEARTBEAT cycle=1.
```

Operator: auto-approve tools + `--max-turns 200` if headless. See marathon file for CONTINUE line.

### 3b) Medium non-stop Sync logs (shorter; still checklist-bound)

```text
NON-STOP LOOP — Sync logs truth (TEST A)

Bootstrap WWG (handoff, current-task, project-truth-summary) + Current-State Report.

GOAL: Sync device logs modal shows truthful willAdd for TEST A matching device
maintain Log (Information): Fingerprint enrolled + User created, not a single
huge Unknown operation residual. Category filter must constrain Action options.
Preview should be fast for one Online device.

ROOT TRUTH ALREADY PROVEN IN REPO (re-verify, do not invent):
- Device maintain UI ~19–20k Information logs: Add Fingerprint / Add Person Info
- ISAPI metaId log.hikvision.com/Information classifies:
  addFpByEmployeeNo → FINGERPRINT_ENROLLED
  addUserInfo → USER_CREATED
- log.std-cgi.com mixes UI noise and is the WRONG default for enroll/user truth
- Devices Online (host ISAPI) ≠ Listener green (SDK reverse tunnel 127.0.0.1:59000)

ACCEPTANCE (all required):
[ ] Live GET /api/device/sync-preview?deviceId=<TEST A id> returns eventRows with
    Fingerprint enrolled AND User created willAdd > 0 (or honest zeros with already)
[ ] Unknown/Unclassified is residual only — not the only big operation line
[ ] opTotal ≈ Information logSearch total (~20k), not misleading std-cgi-only story
[ ] Single-device preview elapsed ≤ ~3s when device Online from this host
[ ] UI Category=Attendance → Action options exclude User created / Fingerprint enrolled
[ ] mocha: sync-logs-event-rows + Information logSearch contracts green
[ ] vitest: device-events-page-contract green
[ ] Playwright: tests/smoke/admin-device-sync-logs-truth.spec.ts green
[ ] LIVE hris-api process restarted so UI hard-refresh shows new labels/counts
[ ] Evidence in .runtime/sync-logs-truth-<stamp>/ (preview JSON + playwright)
[ ] Commit + push develop when green

EXIT GATE: if any box open, next output = HEARTBEAT + tool call (no summary-only end).
NON-STOP rules: no exit after code-only; restart API with npm.cmd and re-hit
sync-preview; if DB 55435 down, start-k8s-dev-db-access then retry; if Playwright
fails, fix and re-run. Min 10 heartbeats or full green. Real Stop only per AGENTS.md.
```

---

## 4) Why Grok looked “stuck” or “stopped at 34s / 1m”

| What you saw | What it usually means |
|---|---|
| Worked ~34s then quiet | Turn ended after partial tools; **no checklist forced another cycle** |
| “1 command still running” then silence | Background start (npm/API) not waited; model declared idle |
| Unit tests green, UI still Unknown operation | **Old node process** still on :3001; never re-proved live response shape |
| Said “Playwright” but you didn’t see it | Planned / cancelled / not run to green — treat as **not done** |
| Thinking not visible enough | Demand **HEARTBEAT \| cycle N \| checklist X/Y** every loop |

This is **prompt + operator config**, not only model IQ. Checklist + non-stop + high max-turns + auto-approve fixes most of it.

---

## 5) Anti-patterns to ban in the prompt (session-learned)

1. **Code edit ≠ done** — must re-prove with live process.  
2. **Unit test ≠ user journey** — Playwright required for modal/filter claims.  
3. **Devices Online ≠ Sync logs classified** — different proof.  
4. **Listener green ≠ Sync logs willAdd** — SDK vs ISAPI logSearch.  
5. **Background start without wait** — poll `/health` then continue.  
6. **Claiming Unknown residual is “enroll truth”** — banned.  
7. **Stopping because time elapsed** — banned; stop only on checklist or Real Stop.

---

## 6) How you should run it (operator recipe)

1. Open this repo root in Grok.  
2. Auto-approve tools (`/always-approve` or headless `--permission-mode bypassPermissions` / `--yolo`).  
3. For Sync logs multi-hour work: paste **section 3a** (marathon v2) or full PASTE BLOCK from `AGENT-PROMPT-sync-logs-truth-3hr-marathon.md`.  
4. For other tasks: paste **section 1** with your checklist, or **section 3b** medium Sync logs.  
5. If it stops early:  
   `CONTINUE MARATHON v2. Open docs/00-product/AGENT-PROMPT-sync-logs-truth-3hr-marathon.md. Resume incomplete PHASE/ACCEPTANCE. Next = HEARTBEAT + tool call.`  
6. Headless: `--max-turns 200` for 3hr class (50 is too low).

---

## 7) Optional one-liner bootstrap

```text
Bootstrap WWG with tools, Current-State Report, then run docs/00-product/AGENT-PROMPT-nonstop-loop-engineering.md section 3 non-stop until acceptance green.
```
