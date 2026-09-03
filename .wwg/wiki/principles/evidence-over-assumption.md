---
type: principle-brief
status: active
mutability: high-friction
scope: agent-reasoning
last_reviewed: 2026-08-19
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

Example: an operator sees five powered panels and states Main C is down while a
quick-health endpoint reports six `online`. The correct statement is not “six
devices are online.” It is:

- operator/physical evidence: five active, Main C down;
- quick transport evidence: six positive responses;
- full inventory evidence: separately measured;
- root cause of the disagreement: `NEEDS_CONFIRMATION` until traced.

The endpoint may be cached, mapped to the wrong tunnel, accepting a proxy
response, or proving only TCP/ISAPI transport. The agent owns proving which.

## Root cause is required, not optional

An error label is not a diagnosis. `fetch failed`, `Unauthorized`, `timeout`,
`sign-in failed`, and `listener unavailable` must be correlated across:

1. browser request and response;
2. API request id, route, duration, and selected device;
3. tunnel target and traffic proof;
4. listener/service logs for the same time;
5. device response/error code when available.

If the existing logs cannot explain the failure, add safe structured
observability and reproduce it. “We do not know why” means the defect remains
open; it is not a permitted green conclusion.

## Preview is not completion when a write was requested

For an explicitly authorized merge/sync/write task, dry-run and preview are
mandatory safety gates. They are not the finish line. The agent must freeze the
reviewed scope, execute the authorized write, monitor real success/failure
counts, repair recoverable failures, and reread targets to prove convergence.
Unknown identity choices or missing biometric custody remain excluded rather
than fabricated.

## Product anchors that must not be assumed away

- DeviceEvent is saved source-of-truth for device event history rows.
- DeviceUser is current inventory only.
- Lifecycle rows such as Fingerprint enrolled come from Operation logs (`ContentMgmt/logSearch`), not from inventory.
- Attendance taps come from Attendance/access events (`AccessControl/AcsEvent`).
- Host-local Windows Docker is diagnostic; the Project Truth finish line is VM/GitOps/LAN (+ named tunnel when public).
- Long-running admin/device jobs must be explainable while they run. If an API cannot expose locked scope, source, target, current stage, backend heartbeat, real successes/failures, and latest recoverable errors, the backend contract is not sufficient and the UI must not invent progress. Counts must distinguish selected unique IDs, source records, peer copy attempts, successful writes, failed writes, and biometric evidence/gaps.

## Hikvision callback / socket wire truth (do not invent)

Agents repeatedly fail by **assuming** the first `device-event:saved` always has plain person id (`15`) after panel create/enroll.

**Find truth this way (mandatory before claims):**

1. Read `vendor/hikvision-linux/src/hikvision_bio/acs.cpp` (callback/JSON) and `src/hikvision_bio/spool.cpp` (POST/enrich):
   - `alarm_callback` (`acs.cpp`) — person id **only** from `dwEmployeeNo` (empty when 0).
   - `build_hikvision_callback_json` (`acs.cpp`) — `employeeNo` / `employeeNoString` are that same string.
   - `hris_post_loop` / enrich path (`spool.cpp`) — what is filled **before** POST.
2. Read a real saved payload or `.runtime` SDK log (major/minor + `employeeNo`).
3. State what the wire actually had: **plain** / **empty** / **opaque**.

**Proven patterns (re-verify if firmware changes):**

| Packet | Typical person field |
|---|---|
| ACS major=3 panel create/enroll | often **empty** `dwEmployeeNo` |
| ACS major=5 fingerprint tap | often **plain** id |
| ISAPI logSearch addUser/addFp | often **opaque** token, not plain |

Socket shows saved row truth. It does not invent plain id missing from the POST body.

**Correct fix direction when user wants plain on live UI:**

- Prefer C++ inventory delta + template read **before** POST when ACS person is empty.
- HRIS multipass is fallback, not a license to claim “callback always had 15.”
- Store raw FP/face templates on DeviceUser when read. For USER_CREATED / FINGERPRINT_ENROLLED, also attach the same evidenced usable blobs to the DeviceEvent payload so the ledger journey is complete; never fabricate bytes or identity when capture is empty.

Also see: `.grok/rules/02-sdk-callback-wire-truth.md`.

## Non-goals

This principle does not authorize rewriting project truth without evidence. It requires agents to read and prove before they speak as if they know.
