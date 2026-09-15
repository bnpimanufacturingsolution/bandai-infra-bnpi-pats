---
type: principle-brief
status: active
mutability: high-friction
scope: agent-reasoning
last_reviewed: 2026-09-15
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

## Conflicting evidence is a defect to resolve

When sources disagree, agents must not select the source that makes the system
look green. Record the disagreement as `CONFLICTING`, identify each evidence
class, and investigate the boundary.

Example: a quick-health endpoint reports six services `online` while an
authenticated full-read probe fails or returns stale data for two of them. The
correct statement is not “six are online.” It is:

- transport evidence: six positive probes;
- authenticated / data-readable evidence: separately measured;
- operator-reported reality: first-class until traced;
- root cause of the disagreement: `NEEDS_CONFIRMATION` until traced.

The endpoint may be cached, mapped to the wrong target, accepting a proxy
response, or proving only TCP transport. The agent owns proving which.

## Root cause is required, not optional

An error label is not a diagnosis. `fetch failed`, `Unauthorized`, `timeout`,
and `sign-in failed` must be correlated across:

1. browser request and response;
2. API request id, route, duration, and selected scope;
3. tunnel target and traffic proof;
4. service logs for the same time;
5. upstream response/error code when available.

If the existing logs cannot explain the failure, add safe structured
observability and reproduce it. “We do not know why” means the defect remains
open; it is not a permitted green conclusion.

## Preview is not completion when a write was requested

For an explicitly authorized merge/sync/write task, dry-run and preview are
mandatory safety gates. They are not the finish line. The agent must freeze the
reviewed scope, execute the authorized write, monitor real success/failure
counts, repair recoverable failures, and reread targets to prove convergence.
Unreviewed identity choices or absent source records remain excluded rather
than fabricated.

## Product anchors that must not be assumed away

- Host-local Windows Docker is diagnostic; the Project Truth finish line is VM/GitOps/LAN (+ named tunnel when public).
- Long-running admin jobs must be explainable while they run. If an API cannot expose locked scope, source, target, current stage, backend heartbeat, real successes/failures, and latest recoverable errors, the backend contract is not sufficient and the UI must not invent progress. Counts must distinguish selected unique IDs, source records, write attempts, successful writes, and failed writes.

## Payload shape is proven, not assumed (retired device-lane lesson)

The retired Hikvision/ZKTeco lane repeatedly produced agent claims like “the
callback always carries the plain employee number.” The truth lived only in the
SDK source, the POST builder, and real saved payloads — and it varied per event
type. The durable lesson survives the lane:

1. Read the implementation that builds the payload.
2. Read a real saved payload or `.runtime` log for the same path.
3. State what the wire actually had (plain / empty / opaque) before claiming.

Never fabricate bytes, identity, or shape to make a counter zero. Historical
device evidence is dated and read-only in `.wwg/reports/` and git history.

## Non-goals

This principle does not authorize rewriting project truth without evidence. It requires agents to read and prove before they speak as if they know.
