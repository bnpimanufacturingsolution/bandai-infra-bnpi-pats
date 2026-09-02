# Project Truth - Grok always-on bootstrap

This file is auto-loaded from `.grok/rules/`. It reinforces root `AGENTS.md`.

## Every session

1. Obey root `AGENTS.md` (autonomy, host/VM, tunnel bans, real stop conditions).
2. **Open WWG with tools before acting.** Grok does not inject wiki content automatically.
3. Required first reads for any meaningful task:
   - `.wwg/reports/wwg-agent-handoff.md`
   - `.wwg/workspace/current-task.md`
   - `.wwg/wiki/project-truth-summary.md`
   - task-relevant sections of `.wwg/wiki/project-truth.md` and `.wwg/wiki/terminology.md`
   - `.wwg/governance/drift-guard.md` when changing product behavior
4. Emit a short Current-State Report from those files before edits.
5. For multi-step / drift / device / VM work: use `Agent-Meta-Prompt-Template.md`.

## Anti-hallucination

- No inventing DeviceEvent truth, Sync logs counts, filter labels, IPs, or endpoint shapes.
- No claiming done without evidence (API/runtime/browser as required by `AGENTS.md`).
- Missing fact -> read file or mark `NEEDS_CONFIRMATION`. Never fill gaps with guesses.
- DeviceEvent is saved event truth. DeviceUser is inventory only. Do not invent lifecycle events from inventory.
- **Residual counts:** never report bare `decision=16` / gap chips without row/bucket
  breakdown. Always-on rule: `.grok/rules/03-residual-count-detail.md`
  (what N is, per-row why, blocker class, next step, UI source).
- **Reports / recommendations:** table-first, scannable. Always-on:
  `.grok/rules/04-table-first-reports.md`. Never “completed” without a done/open table.

## Keep going (non-stop)

Banned fake blockers and real stop conditions are in root `AGENTS.md`. Recover and continue by default.

- Do not end a turn after a short partial success when an acceptance checklist remains open.
- Recoverable: ports, Docker/VM, PATH, installs, flaky tests, rebuilds, warm-up, GitOps wait - fix yourself.
- Real blocker only: 3 distinct recovery failures with evidence, irreversible data risk without backup, missing irrecoverable access, or inventing secrets/evidence.
- If one path blocks, continue all other open paths immediately.

## Operator steps are agent steps (hard ban)

Also see always-on: `.grok/rules/01-agent-owned-execution.md`.

Never end with homework for the human when you can run it. The human should
**not** have to say “continue” or “do it yourself.”

- FORBIDDEN exit lines: "you should hard-refresh", "restart the API", "open Sync logs and click Sync", "run Playwright yourself", "try again after rebuild", "I will continue later".
- REQUIRED: you restart API/app (`npm.cmd` on Windows), poll `/health`, login, hit the real endpoints, run Playwright, capture `.runtime/` evidence, commit/push when green.
- Wall time is not a stop: 10 minutes of work is not done. Multi-surface Sync logs / device truth jobs expect **tens of minutes to hours** with heartbeats until acceptance is green.
- For long Sync logs work, **internally** open and obey `docs/00-product/AGENT-PROMPT-sync-logs-truth-3hr-marathon.md` even if the user only said “fix it” or “continue” (EXIT GATE + min heartbeats + dual-source live proof + Playwright).

## Verify this machine still loads rules

```powershell
grok inspect
powershell -File scripts/verify-grok-wwg-bootstrap.ps1
```

`grok inspect` must list `Agents.md` / `AGENTS.md`, `Claude.md` / `CLAUDE.md`,
`.grok/rules/00-wwg-session-bootstrap.md`, and `.grok/rules/01-agent-owned-execution.md`.
