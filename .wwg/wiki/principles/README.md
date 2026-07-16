# Principles

This folder contains durable Principle Briefs for this project.

Principles explain how agents should reason about product direction, architecture, governance, positioning, UX, and long-term design choices.

Principles are not the same as project truth.

- Use `../project-truth.md` for canonical facts.
- Use `../terminology.md` for official names and definitions.
- Use `../decisions/` for specific decisions and rationale.
- Use `../../workspace/` for current task state.
- Use `../../governance/` for enforcement rules, drift checks, and validation behavior.

Recommended default frontmatter for active Principle Briefs:

```yaml
---
type: principle-brief
status: active
mutability: high-friction
scope: ""
last_reviewed: YYYY-MM-DD
---
```

Principles are high-friction mutable guidance. Agents may update them when a user explicitly identifies something as a principle, doctrine, guiding philosophy, or durable design rationale, or when a task clearly changes an existing principle.

If uncertain, agents should create a candidate principle note or mention the possible principle change in a handoff/report rather than rewriting an active principle.

## Active principles

| Principle | Path | Use when |
|---|---|---|
| Evidence Over Assumption | `./evidence-over-assumption.md` | Every agent session; any claim about product truth, runtime, Device Events, Sync logs, or “done” |

## Candidate principles

| Principle | Path | Notes |
|---|---|---|
| Adopted (inferred) | `./adopted-principles.md` | Review before treating as active |
