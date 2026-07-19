---
type: principle-brief
status: active
mutability: high-friction
scope: agent-reasoning
last_reviewed: 2026-07-19
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

## Hikvision callback / socket wire truth (do not invent)

Agents repeatedly fail by **assuming** the first `device-event:saved` always has plain person id (`15`) after panel create/enroll.

**Find truth this way (mandatory before claims):**

1. Read `vendor/hikvision-linux/hikvision_biometric_service.cpp`:
   - `alarm_callback` — person id **only** from `dwEmployeeNo` (empty when 0).
   - `build_hikvision_callback_json` — `employeeNo` / `employeeNoString` are that same string.
   - `hris_post_loop` / enrich path — what is filled **before** POST.
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
- Store raw FP/face templates on DeviceUser when read; pointer/status on DeviceEvent only.

Also see: `.grok/rules/02-sdk-callback-wire-truth.md`.

## Non-goals

This principle does not authorize rewriting project truth without evidence. It requires agents to read and prove before they speak as if they know.
