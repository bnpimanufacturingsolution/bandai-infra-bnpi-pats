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
