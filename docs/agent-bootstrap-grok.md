# How Grok loads Project Truth (and how not to hallucinate)

## What Grok auto-loads every session

| Source | Loaded automatically? |
|---|---|
| `~/.grok/AGENTS.md` (global) | Yes, if present |
| Repo root `AGENTS.md` / `Agents.md` | Yes |
| Nested `AGENTS.md` from repo root → cwd | Yes |
| `.grok/rules/*.md` | Yes |
| `CLAUDE.md` (compat) | Yes, when Claude compatibility is on |
| `.wwg/wiki/*`, handoff, current-task | **No — agent must Read** |

Use `grok inspect` in this repo to verify which instruction files are loaded.

## What we configured for “always follow WWG”

1. **Root `AGENTS.md`** — Session Bootstrap Rule + anti-hallucination ban at the top.
2. **`.grok/rules/00-wwg-session-bootstrap.md`** — short always-on reminder.
3. **`CLAUDE.md`** — same bootstrap for Claude-compatible tools.
4. **Principle** `.wwg/wiki/principles/evidence-over-assumption.md` — durable “prove, don’t assume” doctrine.

## Your job as operator

- Keep working from this repo root (or a subdir under it) so Grok discovers `AGENTS.md`.
- Trust the project when prompted (`/hooks-trust` only matters for hooks; rules still load).
- Start meaningful work with a one-liner if you want extra force:

```text
Bootstrap: open WWG handoff + current-task + project-truth-summary, Current-State Report, then continue the task. No assumptions.
```

- For Sync logs redesign non-stop work, also paste or reference:
  `docs/00-product/TASK-sync-logs-event-first-modal-GROK-PROMPT.md`

## Limits (honest)

No agent can force-file-read without a rule + tool use. We cannot embed the entire WWG wiki into the system prompt every time (too large). The durable fix is:

**auto-load short rules → force tool-read of WWG → ban invention → require evidence.**

That is the same pattern Claude/Codex use with project instructions + memory files: rules are injected; truth packs are opened on demand under instruction.

## Live verification (loop until green)

```powershell
powershell -File scripts/verify-grok-wwg-bootstrap.ps1 -ProbeCount 2
```

This runs `grok inspect` + independent headless probes. Evidence lands in `.runtime/grok-bootstrap-verify-<stamp>/`.

### What we already proved (2026-07-16)

| Probe | Prompt style | Result |
|---|---|---|
| 1 | Explicit required file list | PASS — opened 3 WWG files |
| 2 | Natural WWG status question | PASS — opened handoff + current-task + summary |
| 3 | Minimal “hi” + JSON | PASS — still opened WWG first |
| 4 | Non-stop multi-check + write proof.json | PASS — 5 turns, proof written, inspect count 3 |
| Script | 2 more independent probes | Run after each rule change |

### Why a long task still “stops in a minute”

| Cause | Recoverable by agent? | What to do |
|---|---|---|
| Permission prompt waiting for you | Yes (config) | Use auto-approve / always-approve / `bypassPermissions` for trusted local work |
| Headless `--max-turns` too low | Yes | Raise `--max-turns` (e.g. 40–100 for big tasks) |
| Vague prompt, no checklist | Yes | Paste Sync logs non-stop prompt with acceptance checklist |
| Model ends after partial success | Partial | Rules + checklist + “do not end until green”; re-run same session with “continue until checklist green” |
| Real Stop Condition (3 failed recoveries, data risk, missing secrets) | No | Agent must report the blocker with evidence; you supply access/decision |

### Sync logs implementation proof commands

```powershell
# Unit
cd hris-api; npx tsx node_modules/mocha/bin/mocha --no-config tests/sync-logs-event-rows.helper.spec.ts; cd ..
cd hris-app; npx vitest run app/lib/device-events-page-contract.test.ts; cd ..

# Headless Playwright (starts its own Vite via smoke config)
cd hris-app
npx playwright test tests/smoke/admin-device-events-sync-modal.spec.ts --config=playwright.smoke.config.ts
cd ..

# Live API (needs DB: LAN SSH to VM or working 55435 forward)
# If login fails with 127.0.0.1:55435, recover VM/SSH first — do not claim live preview green.
```

### Operator checklist for next prompt

1. Start Grok from this repo root (so AGENTS + `.grok/rules` load).
2. Prefer this starter if you want extra force:

```text
Bootstrap WWG first (handoff, current-task, project-truth-summary). Current-State Report. Then execute docs/00-product/TASK-sync-logs-event-first-modal-GROK-PROMPT.md without stopping until the acceptance checklist is green or a real AGENTS.md stop condition is proven with 3 recovery attempts. Recover yourself on ports/Docker/VM/PATH/tests. Do not idle.
```

3. If interactive tools ask permission every step, enable always-approve for this trusted project so the run does not fake-stop.
4. Re-check anytime: `powershell -File scripts/verify-grok-wwg-bootstrap.ps1`
