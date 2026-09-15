# Claude / multi-agent compatibility

This repo’s primary operating contract is **`AGENTS.md`**.

Grok, Claude Code, and similar agents should treat `AGENTS.md` as mandatory behavior rules.

## Session start (do not skip)

1. Read `AGENTS.md` fully if not already injected.
2. Open with tools (not memory):
   - `.wwg/reports/wwg-agent-handoff.md`
   - `.wwg/workspace/current-task.md`
   - `.wwg/wiki/project-truth-summary.md`
   - task-relevant `.wwg/wiki/project-truth.md` / terminology
   - `.wwg/governance/drift-guard.md` when changing behavior
3. Write a short Current-State Report before edits.
4. For multi-step work, follow `Agent-Meta-Prompt-Template.md`.

## Anti-hallucination

Do not invent Project Truth, workload counts, row counts, filters, IPs, or API contracts. Read WWG + code + evidence. Label unknowns as `NEEDS_CONFIRMATION`.

Also load `.grok/rules/00-wwg-session-bootstrap.md` and
`.grok/rules/01-agent-owned-execution.md` intent when present.

## Agent-owned execution (default)

Do not leave recoverable work as human homework. Restart API/app, prove live
endpoints, run Playwright, write `.runtime/` evidence, commit/push `develop`
when green. The human should not need to say “continue” or “do it yourself.”
