# Task Prompt - Hikvision Sync Logs Dual Source Backfill

## Execution mode

Mode: owner-operator implementation, preview-first, evidence-backed.

Do not ask for approval for normal development progress. Do not run destructive
cleanup or irreversible device writes. Use stored HRIS device credentials only;
do not paste browser `WebSession_*`, `SessionTag`, cookies, or raw curl session
headers into source, docs, tests, logs, screenshots, or runtime artifacts.

## Goal

Make the existing admin `Sync logs` flow under
`/admin/configuration/devices/events?action=sync-logs` support two distinct
Hikvision log sources:

1. `ContentMgmt/logSearch` for device operation/enrollment history, including
   fingerprint enrolled, face/card changes, user create/update/delete, and
   unknown operation rows.
2. `AccessControl/AcsEvent` for attendance/access event history, including
   successful taps, rejected taps, and other ACS rows.

The user-facing modal must show where each source will be added, how many rows
are on the device, how many are already saved in HRIS `DeviceEvent`, how many
can be imported now, how many will be left alone, and whether the source read is
available.

## Truth from user-provided evidence

The user showed working browser-origin requests for:

- `https://10.184.38.167/ISAPI/ContentMgmt/logSearch` with
  `metaId=log.std-cgi.com`, XML payload, `maxResults=20`, and
  `searchResultPostion=0`.
- `https://10.184.38.173/ISAPI/AccessControl/AcsEvent?format=json...` with
  JSON `AcsEventCond`, `maxResults=24`, `major=0`, `minor=0`, and
  `timeReverseOrder=true`.

These are endpoint-shape evidence, not reusable credentials. Replace browser
sessions with the existing server-side Hikvision client and stored device
credentials.

## Required UI behavior

In the `Sync device logs` modal, each Hikvision device row must expose source
specific checks:

- `Operation logs` from `ContentMgmt/logSearch`.
- `Attendance/access events` from `AccessControl/AcsEvent`.

For each source show:

- read state: ready, unavailable, partial, or stale;
- endpoint family: `logSearch` or `AcsEvent`;
- on-device count for the selected date/window;
- saved HRIS count using the same device/window/source/action/confidence
  predicate;
- can-import count;
- leave-alone count;
- failed/unknown count;
- last read timestamp and elapsed time when available.

The modal primary action remains `Sync logs`, but the action must run the
selected/available source plans, not only one generic total.

## Required backend behavior

Add or refine a preview endpoint that returns source-specific plans without
mutating:

```txt
GET /api/device/sync-preview?deviceId=...&source=HIKVISION_CALLBACK&from=...&to=...
```

Response shape must include per-device `sources[]`.

Add or refine execute behavior so the UI can request only the planned source
families through `POST /api/device/hikvision/sync`.

The server must still support preview/dry-run. Execute must dedupe and persist
only missing `DeviceEvent` rows.

## Mapping rules

`ContentMgmt/logSearch` rows:

- map fingerprint enrollment rows such as `addFpByEmployeeNo` to
  `ENROLLMENT/FINGERPRINT_ENROLLED/PROVEN`;
- map face/card/user operation rows to the matching event action only when the
  raw evidence explicitly supports it;
- preserve unknown operation rows as `UNKNOWN_VENDOR/UNKNOWN/UNKNOWN`;
- preserve raw XML page and raw row fields in payload.

`AccessControl/AcsEvent` rows:

- map accepted attendance/access rows to `ATTENDANCE/TAP`;
- map rejected fingerprint/access rows to `ATTENDANCE/TAP_REJECTED` when
  supported by code/minor mapping;
- preserve serial number, employee number, verify mode, door number, event time,
  major/minor, and raw payload;
- do not convert ACS rows into fingerprint enrollment unless the endpoint
  explicitly proves enrollment.

## Acceptance criteria

1. Sync logs shows both source families for Hikvision devices.
2. Fingerprint enrollment is imported from `ContentMgmt/logSearch` evidence,
   not from current inventory counts.
3. Attendance taps/rejections are imported from `AccessControl/AcsEvent`
   evidence.
4. Counts in the modal match the same filters used by saved Device Events.
5. Re-running sync is idempotent: duplicates stay duplicates, not new rows.
6. Browser session headers/cookies are never committed or logged.
7. Tests cover source-specific preview, execute, dedupe, mapping, UI labels, and
   a smoke proof of the modal.

