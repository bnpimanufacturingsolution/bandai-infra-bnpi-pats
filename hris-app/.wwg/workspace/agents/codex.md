# Codex Instructions

## Purpose

Provide agent-specific operating guidance.

## How to Use

Load this file with the shared context bundle before starting work.

## Rules

- Respect layer boundaries, inspect before editing, validate changes, and produce a report.
- Developers may prompt naturally. Execute structurally.
- Use execution-first mode by default for fix, implement, investigate, debug, update, create, add, test, commit, or push requests when access exists.
- Use ticket-only mode only when explicitly requested.
- Compare adjacent working flows when debugging.
- Preserve human-written content outside generated markers.
- Record meaningful implementation notes in `reports/agent-implementation-log.md`; treat `reports/codex-implementation-log.md` as a legacy name.
- Register accessible external-chat files, screenshots, docs, and images through WWG source intake; if the artifact is chat-only and inaccessible, add a raw source note documenting the limitation.

## Output Format

Clear change summary, validation results, and unresolved assumptions.
