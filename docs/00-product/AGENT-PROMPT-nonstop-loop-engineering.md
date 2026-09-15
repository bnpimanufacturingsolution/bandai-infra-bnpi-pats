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
6. Agent-Meta-Prompt-Template.md for multi-step / drift / VM work
7. Relevant source + latest .runtime/* evidence for this task

Then post a short Current-State Report:
- what files say is true now
- STALE / CONFLICTING / NEEDS_CONFIRMATION
- finish line for this run
- what you will touch / will not touch

Hard ban: do not invent runtime counts, filter labels, IPs, reachability, or
API shapes. Missing fact → Read or mark
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
- “~30s–4 minutes elapsed” OR “~10 minutes elapsed” (time is not done)
- “background job still starting” (wait for health OR continue other paths)
- “UI screenshot looks better” without API JSON proof
- “user can restart later” for recoverable restarts you can do yourself
- “What you should do: hard-refresh / open the page / click the button” — YOU do those steps

OPERATOR STEPS ARE AGENT STEPS (hard ban on homework endings):
- Restart API/app yourself (Windows: npm.cmd, poll /health up to 3 min).
- Login as admin, hit live endpoints, start sync jobs, poll import-jobs.
- Run Playwright to green; save screenshots under .runtime/.
- Hard-refresh is not a user chore: restart Vite/app process or re-navigate
  with cache-busting probes; prove the live process serves the new code.
- Never close with a bullet list of actions for the human if any of them
  are recoverable agent work.

REQUIRED loop until checklist green:
  discover → plan (short) → implement → prove API → prove Playwright →
  fix mismatches → re-prove → truth-sync docs if needed → commit/push

Minimum effort for multi-surface truth tasks:
- At least 3 full prove/fix cycles if first proof fails
- Wall-clock expectation: keep going ~30–180 minutes of agent work for
  multi-surface runtime truth work — do not self-stop at 1–10 minutes
- Headless: --max-turns 250+ and always-approve; 50–80 turns is too low

After every major tool batch, post a heartbeat the user can see:
  HEARTBEAT | cycle N | checklist X/Y green | last proof | next action
Do not go silent while long commands run without a heartbeat.

### 4. RECOVERIES (agent-owned)
Recover yourself (examples): API/DB port down, Docker/VM off, reverse tunnel
down, PATH missing, npm install, flaky test, rebuild, warm-up, kill stale
node on 3001, start-k8s-dev-db-access, re-run Playwright.

Before “blocked” on a sub-path: document 3 different plausible recoveries.
If one path blocks, immediately continue all other open checklist paths.

### 5. REAL STOP CONDITIONS ONLY
Stop only if:
- same failure after 3 distinct recoveries with evidence
- irreversible data risk without backup
- missing irrecoverable credentials/network
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
unit test, or ~10 minutes. YOU own operator steps (restart API with npm.cmd,
poll health, login, hit endpoints, run Playwright, commit) — never end with
"you should hard-refresh / click Sync". Recover API/DB/ports/tunnels yourself
(3 tries). Heartbeat each cycle. Evidence under .runtime/<task-stamp>/.
Commit/push develop when green. Real stop only per AGENTS.md Real Stop Conditions.
```

---

## 3) Ready-made task packs

The former Sync-logs/device marathons (`AGENT-PROMPT-sync-logs-truth-3hr-marathon.md`,
`AGENT-PROMPT-sync-logs-user-journey-truth.md`, `TASK-sync-logs-event-first-modal-GROK-PROMPT.md`)
were retired 2026-09-15 with the device lane. For current BNPI PATS tasks use the
section 1 template plus the section 2 suffix.

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
3. **Transport green ≠ product truth** — different proof.  
4. **Cached probe ≠ live state** — re-read after the change.  
5. **Background start without wait** — poll `/health` then continue.  
6. **Bare residual numbers** — banned without a row/bucket breakdown.  
7. **Stopping because time elapsed** — banned; stop only on checklist or Real Stop.

---

## 6) How you should run it (operator recipe)

1. Open this repo root in Grok.  
2. Auto-approve tools (`/always-approve` or headless `--permission-mode bypassPermissions` / `--yolo`).  
3. For tasks: paste **section 1** with your checklist, or the **section 2** short suffix.  
4. If it stops early:  
   `CONTINUE. Resume incomplete ACCEPTANCE. Next = HEARTBEAT + tool call. Do operator steps yourself — no hard-refresh homework.`  
5. Headless: `--max-turns 250` for long jobs (50–80 is too low; ~10m stops are often turn budget).

---

## 7) Optional one-liner bootstrap

```text
Bootstrap WWG with tools, Current-State Report, then run docs/00-product/AGENT-PROMPT-nonstop-loop-engineering.md section 3 non-stop until acceptance green.
```
