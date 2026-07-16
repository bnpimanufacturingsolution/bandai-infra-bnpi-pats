---
type: principle-brief
status: active
mutability: high-friction
scope: agent-reasoning
last_reviewed: 2026-07-16
---

# Evidence Over Assumption

## Why this exists

Agents (Grok, Claude, Codex, and others) load behavior rules automatically, but they do **not** magically load full Project Truth or live runtime state. Guessing creates false confidence and broken repairs.

## How agents must think

1. **Rules first** — follow `AGENTS.md` / `.grok/rules` for autonomy and safety.
2. **Truth second** — open WWG handoff, current task, project truth, terminology.
3. **Code third** — open the real files for the surface being changed.
4. **Evidence fourth** — API dry-run, runtime, then browser proof as required.
5. **Only then** implement, commit, or declare done.

## Labels when uncertain

Use explicit labels instead of inventing facts:

- `NEEDS_CONFIRMATION` — unknown; must verify
- `CONFLICTING` — sources disagree
- `STALE` — documented truth may be outdated vs code/runtime

## Product anchors that must not be assumed away

- DeviceEvent is saved source-of-truth for device event history rows.
- DeviceUser is current inventory only.
- Lifecycle rows such as Fingerprint enrolled come from Operation logs (`ContentMgmt/logSearch`), not from inventory.
- Attendance taps come from Attendance/access events (`AccessControl/AcsEvent`).
- Host-local Windows Docker is diagnostic; the Project Truth finish line is VM/GitOps/LAN (+ named tunnel when public).

## Non-goals

This principle does not authorize rewriting project truth without evidence. It requires agents to read and prove before they speak as if they know.
