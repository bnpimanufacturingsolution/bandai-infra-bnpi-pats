# BRD - Hikvision Device Events and Sync Center

## Business problem

Administrators cannot safely operate the Hikvision event ledger while current
inventory, events in a selected window, saved BNPI PATS rows, and sync-run results
are presented as interchangeable counts. Historical code also created
`USER_CREATED` and `FINGERPRINT_ENROLLED` rows from a current user list. That
invented lifecycle history and weakened trust in the ledger.

`DeviceEvent` is the single saved source of truth for device-origin events. The
UI reads and filters saved rows; it never reconstructs lifecycle history from
browser state, a current `DeviceUser` list, or a sync preview.

## Current-state evidence - 2026-07-16

Primary device: `Main Entrance Device A · Hikvision · 10.184.38.173:443`.

- The screen's former 165-user and 2,033-log claims were reverified and are
  stale. At `2026-07-16T09:16:50Z`, direct `UserInfo/Search` returned 167 users
  and direct ACS search returned a 2,107-row device log total.
- Six direct user pages contain 167 unique users: 162 with fingerprints, 161
  with faces, and 109 with cards. Three ACS pages contain 70 rows in the frozen
  `2026-07-16T00:00:00+08:00` through `16:46:14+08:00` window.
- Direct `ContentMgmt/logSearch` returned 23 rows over two XML pages. Exact
  `.173` metaIds prove two fingerprint enrollments, three face enrollments, two
  face deletions, two user creates, and fourteen intentionally unknown rows.
- The VM app/API and named Cloudflare tunnel are healthy; the tunnel service is
  active and was not changed.
- The BNPI PATS cache has 151 `DeviceUser` rows for this device, including 149 rows
  reporting fingerprints and 147 reporting faces. These are current-state
  cache values, not direct-device counts and not lifecycle-event counts.
- BNPI PATS had 1,075 saved rows before cleanup. The non-mutating reset preview
  identifies 219 proven legacy fake lifecycle rows: 120 `USER_CREATED` and 99
  `FINGERPRINT_ENROLLED`; none link to attendance.
- Cleanup exported all 219 rows, deleted those rows only, and deleted zero
  attendance rows. Postcondition preview returns zero remaining fake rows.
- In the frozen window, 70 ACS serials match 70 saved SDK rows with zero source
  rows missing. The direct SDK split is 9 taps, 7 rejected taps, 33 sync
  signals, and 21 unknowns. A further 23 saved logSearch rows bring the frozen
  saved window to 93 direct-evidence rows, exactly matching API totals.

Evidence is recorded under `.runtime/device-events-sync-center-20260716-160910/`.

## Users and journey

Primary role: `bnpi-pats-admin`. Secondary role: operations/support reviewer.

1. Open Device Events and select a device and time window.
2. Read separately labeled inventory, activity, saved-BNPI PATS, and sync-run totals.
3. Filter saved rows by runtime path, category, action, employee/user, match
   status, evidence source, and confidence.
4. Inspect raw evidence in **Device event details** (`action=view-event&id=`)
   without leaving the ledger. The modal loads that saved row by id, not by
   the current table page.
5. Start a preview-first sync, follow its correlation ID, and reconcile saved
   totals against source rows.

## Business rules

1. `DeviceEvent` is the only saved event ledger.
2. Inventory is `DEVICE_CURRENT_STATE`; it never proves when a lifecycle action
   occurred.
3. Evidence priority is SDK callback, ISAPI logSearch, verified before/after
   transition, then unknown/unmapped evidence.
4. Every new row preserves raw evidence and records `evidenceSource`,
   `directDeviceEvidence`, vendor action/code/string, raw device time,
   operator/source/remote host when available, employee/user identifier when
   available, and sync correlation ID when applicable.
5. `PROVEN` means explicit SDK/logSearch evidence; `SUPPORTED` is a known but
   not fully canonical vendor mapping; `INFERRED` requires two complete verified
   snapshots; `UNKNOWN` remains unmapped.
6. Current state alone creates no lifecycle event.
7. Deduplication is organization/device/evidence/action/time/vendor-identity
   scoped and never collapses distinct serial-numbered taps.
8. Cleanup may delete only rows proven to be current-state-derived fake
   lifecycle history, after preview, complete backup, and linked-attendance
   verification.

## Metric definitions

| Metric family | Metrics | Source |
|---|---|---|
| Inventory/current state | users, users with fingerprints/faces/cards, device log total | `DEVICE_CURRENT_STATE` |
| Window activity | taps, rejected taps, biometric/card/user lifecycle actions, sync imports/signals, unknown | `SDK_CALLBACK`, `ISAPI_LOGSEARCH`, or `STATE_TRANSITION_INFERRED` |
| Saved BNPI PATS | total, matched, needs match, ignored, failed, direct, inferred, unknown | `DEVICE_EVENT_DATABASE` |
| Sync reconciliation | source total, imported, known skipped, still missing | `DEVICE_SYNC_RUN` |

Each metric is labeled with its source and selected window. Inventory totals are
never added to event totals.

## Filtering requirements

Server-side filtering and summary counts must share the same predicate for
device, time window/date field, runtime path, category, action, employee/user,
match status, evidence source, and confidence. Pagination must not change the
summary denominator.

## Cleanup and migration

- Quarantine the current-state lifecycle generator.
- Preview and group suspect rows by device, action, type, and attendance link.
- Export complete JSON rollback artifacts and manifest before deletion.
- Delete only `BiometricStateBackfill` + `INFERRED` +
  `derivedFromCurrentDeviceState=true` rows.
- Backfill retained rows with explicit evidence metadata derived from their raw
  payload and runtime path without changing their raw evidence.

## Risks and boundaries

- Device availability was intermittent during discovery; current inventory is
  direct evidence but must show `Needs reverify` whenever a fresh direct probe
  fails. Cached counts cannot silently replace it.
- Existing SDK callback rows prove incoming physical-event evidence but do not
  prove current inventory totals.
- No biometric template is rendered or introduced by this work.
- Local/API proof does not by itself prove GitOps rollout; VM/LAN and browser
  evidence must name their runtime path.

## Acceptance criteria

1. Fake current-state lifecycle rows are backed up and removed with zero linked
   attendance deletion.
2. Every retained/new row exposes evidence source, directness, confidence, raw
   vendor evidence, and correlation where applicable.
3. Important category/action/evidence/confidence/match filters return saved
   rows and summaries whose totals agree.
4. The UI reads saved rows and keeps inventory, window activity, saved BNPI PATS,
   and sync results visually distinct.
5. Direct device counts, ACS pages, and raw logSearch pages are captured from
   `.173`; stale screen counts are replaced only after a successful probe.
6. API proof precedes Playwright proof; screenshots alone cannot close the task.

## Addendum - Sync logs must be dual-source

The `Sync logs` modal is not one generic counter. For Hikvision, it must support
two source families in the same admin workflow:

1. Operation/enrollment history from `ContentMgmt/logSearch`.
2. Attendance/access history from `AccessControl/AcsEvent`.

The business expectation is that an admin can answer:

- which device source was read;
- whether the source is available;
- how many rows are on the device for the selected window;
- how many equivalent rows already exist in BNPI PATS `DeviceEvent`;
- how many rows can be imported now;
- how many rows will be left alone because they are known duplicates,
  employee-less rows, or intentionally unmapped rows.

Fingerprint enrollment, face/card operations, and user-management changes must
come from explicit operation-log evidence such as logSearch rows. Attendance
taps and rejected access attempts must come from ACS event evidence. Current
inventory counts must never be presented as enrollment history.

Browser-captured curl examples are endpoint-shape evidence only. They contain
session material and must be redacted before storage. Implementation must use
server-side stored Hikvision credentials and existing BNPI PATS device records.
