# PRD - Hikvision Device Events and Sync Center

## Product contract

The screen is an operational ledger over persisted `DeviceEvent` rows. It has
four explicitly separated data planes:

1. device inventory/current state;
2. new evidence events in the selected time window;
3. saved HRIS event rows and match results;
4. sync-run reconciliation results.

No client-side array, socket-only row, or current user list is allowed to
manufacture enrollment, user-management, attendance, or sync history.

## Persistence contract

Required persisted taxonomy:

- categories: `ATTENDANCE`, `ENROLLMENT`, `USER_MANAGEMENT`, `RUNTIME`,
  `UNKNOWN_VENDOR` (legacy categories may remain readable);
- actions: `TAP`, `TAP_REJECTED`, fingerprint/face/card enrolled, updated, and
  deleted; user created, updated, and deleted; `SYNC_IMPORTED`, `SYNC_SIGNAL`,
  and `UNKNOWN`;
- confidence: `PROVEN`, `SUPPORTED`, `INFERRED`, `UNKNOWN`.

Every saved payload contains:

```json
{
  "evidenceSource": "SDK_CALLBACK | ISAPI_LOGSEARCH | STATE_TRANSITION_INFERRED | RUNTIME_PROCESS",
  "directDeviceEvidence": true,
  "vendorAction": "raw vendor action/code/string",
  "rawDeviceTime": "raw device timestamp",
  "operator": "optional device/operator identity",
  "remoteHost": "optional remote host",
  "employeeNo": "optional device employee/user identifier",
  "correlationId": "optional sync job/run id",
  "rawEvidence": {}
}
```

Existing raw payload keys remain intact. Migration adds contract keys; it does
not replace or summarize away original evidence.

## Endpoint contracts

### `GET /api/device/events`

Query: `deviceId`, `from`, `to`, `dateField`, `source`, `eventCategory`,
`eventAction`, `query`, `status`, `evidenceSource`, `eventConfidence`, `page`,
`limit`, `sort`, `order`.

Response includes saved rows, pagination, and a summary calculated using the
same filter predicate: total; category/action/result/runtime buckets;
confidence/evidence buckets; direct/inferred/unknown totals; matched,
needs-match, ignored, and failed totals.

### `POST /api/device/:id/hikvision/log-search`

Admin-only. Body: `execute=false` by default, `startTime`, `endTime`,
`maxResults`, `maxRows`, optional `searchId`, and initial search result
position. It uses stored device credentials through the existing Hikvision
client and never accepts credentials from browser state.

Preview returns request metadata, raw pages, parsed rows, normalized rows,
summary, next position, elapsed/failure context, and no secrets. Execute
persists normalized rows with deduplication and returns IDs/duplicate flags.

### `POST /api/device/:id/hikvision/acs-events`

Admin-only. Body: `execute=false` by default, `startTime`, `endTime`,
`maxResults`, `maxRows`, optional `searchId`, `major=0`, `minor=0`, and
`timeReverseOrder=true`. It uses stored device credentials through the existing
Hikvision client and never accepts browser session cookies or `SessionTag`.

Preview returns request metadata, raw pages, normalized ACS rows, source totals,
summary buckets, elapsed/failure context, and no secrets. Execute persists only
missing `DeviceEvent` rows with deduplication and returns IDs/duplicate flags.

### `GET /api/device/sync-preview`

For Hikvision devices, preview rows must include source-specific plans instead
of one ambiguous device total:

```json
{
  "deviceId": "device-id",
  "vendor": "Hikvision",
  "sources": [
    {
      "sourceKey": "hikvision_logsearch",
      "label": "Operation logs",
      "endpoint": "ContentMgmt/logSearch",
      "evidenceSource": "ISAPI_LOGSEARCH",
      "onDeviceCount": 2478,
      "savedHrisCount": 0,
      "canImportCount": 2478,
      "leaveAloneCount": 0,
      "failedCount": 0,
      "status": "ready"
    },
    {
      "sourceKey": "hikvision_acs_events",
      "label": "Attendance/access events",
      "endpoint": "AccessControl/AcsEvent",
      "evidenceSource": "SDK_CALLBACK",
      "onDeviceCount": 2108,
      "savedHrisCount": 23,
      "canImportCount": 2085,
      "leaveAloneCount": 0,
      "failedCount": 0,
      "status": "ready"
    }
  ]
}
```

Legacy flat count fields may remain temporarily for compatibility, but the UI
must prefer `sources[]` when present.

### `POST /api/device/events/reset`

Admin-only and preview-first. Cleanup scope can target the exact legacy
predicate. Execute must create a complete rollback directory and manifest
before a transaction deletes rows. Linked attendance deletion remains false
for this cleanup.

## Hikvision logSearch request and pagination

- Endpoint: `POST /ISAPI/ContentMgmt/logSearch`.
- XML root: `CMSearchDescription` version 2.0.
- Request `metaId`: `log.std-cgi.com`; response rows preserve their exact
  device-reported `metaId` before normalization.
- Preserve Hikvision's field spelling `searchResultPostion`.
- Advance by actual returned row count, continue only for `MORE`, stop at total,
  empty page, or bounded `maxRows`.
- Save each raw XML page before mapping.

## Vendor normalization table

| Raw evidence | Category / action | Confidence |
|---|---|---|
| SDK attendance pass (`major=5`, observed `minor=38`, `75`, or `104`) | `ATTENDANCE/TAP` | `PROVEN` |
| SDK fingerprint compare fail (observed numeric `minor=39`) | `ATTENDANCE/TAP_REJECTED` | `SUPPORTED` |
| `log.hikvision.com/Information/addFpByEmployeeNo` | `ENROLLMENT/FINGERPRINT_ENROLLED` | `PROVEN` |
| explicit fingerprint modify text/code | `ENROLLMENT/FINGERPRINT_UPDATED` | `PROVEN` log / `SUPPORTED` SDK mapping |
| explicit fingerprint delete/clear text/code | `ENROLLMENT/FINGERPRINT_DELETED` | `PROVEN` log / `SUPPORTED` SDK mapping |
| `log.hikvision.com/Operation/localfaceDataAppend` | `ENROLLMENT/FACE_ENROLLED` | `PROVEN` |
| explicit face modify evidence | `ENROLLMENT/FACE_UPDATED` | evidence-dependent |
| `log.hikvision.com/Operation/localfaceDataDelete` | `ENROLLMENT/FACE_DELETED` | `PROVEN` |
| `.../addCard` | `ENROLLMENT/CARD_ENROLLED` | `PROVEN` |
| explicit card modify/delete evidence | `CARD_UPDATED` / `CARD_DELETED` | evidence-dependent |
| `log.hikvision.com/Information/addUserInfo` or explicit Add Person | `USER_MANAGEMENT/USER_CREATED` | `PROVEN` |
| explicit user modify evidence | `USER_MANAGEMENT/USER_UPDATED` | evidence-dependent |
| `.../clearUserInfo` | `USER_MANAGEMENT/USER_DELETED` | `PROVEN` |
| bounded sync run completion | `RUNTIME/SYNC_IMPORTED` | `PROVEN` runtime evidence |
| explicit but not canonical SDK operation callback | `RUNTIME/SYNC_SIGNAL` or `UNKNOWN_VENDOR/UNKNOWN` | `SUPPORTED` or `UNKNOWN` |
| `log.hikvision.com/Operation/enterLocalUIBackground` | `UNKNOWN_VENDOR/UNKNOWN` | `UNKNOWN` |
| other unmapped vendor row | `UNKNOWN_VENDOR/UNKNOWN` | `UNKNOWN` |

These `.173` strings are device-proven by the raw XML pages captured on
2026-07-16. Raw strings are stored before mapping. An Add Person/user row must
never map to fingerprint enrollment.

## Deduplication

- SDK callbacks use the established key including device, event time, employee,
  vendor code, serial number, and source.
- logSearch uses device, evidence source, parsed event time, employee, category,
  action, major/minor, parameter, and information.
- runtime events use organization, device, action, and correlation ID.
- state-transition inference uses both snapshot timestamps and before/after raw
  state; one snapshot returns no events.

## Match resolution

Resolve `DeviceUser(deviceId + vendorUserId)` first, then its employee link,
then legacy `Employee.deviceEmpId`. Preserve the device identifier even when no
employee matches. The status filter is the HRIS match/processing result; it
does not change the event action.

## Sync-run behavior

Each accepted users/log sync has a durable `DeviceSyncRun`. Completion saves
one idempotent `RUNTIME/SYNC_IMPORTED` event with run/job correlation and
processed/imported/skipped/known-skipped/failed counts. Listener operation
signals remain separate source events and never masquerade as completed runs.

## UI information architecture

Header: `Main Entrance Device A · Hikvision · 10.184.38.173`.

Below it:

- one compact inventory strip;
- one time-window activity line;
- one filter toolbar;
- one dense saved-events table;
- one details drawer.

Primary columns: event time, category, action, employee/user, device, evidence,
confidence, and HRIS result. The drawer shows event/received times, identifiers,
evidence source/directness, raw code/string, runtime path, result, correlation,
and formatted raw payload. Use flat borders/dividers and existing primitives;
avoid nested dashboard cards.

### Sync logs modal

The existing `Sync device logs` modal must place the new behavior here, not on a
separate page:

- top summary: devices checked, on-device total, already in HRIS, can import
  now, will leave alone, failed, ready;
- per Hikvision device: device identity and address;
- per source family under that device:
  - `Operation logs` from `ContentMgmt/logSearch`;
  - `Attendance/access events` from `AccessControl/AcsEvent`;
  - read state, endpoint family, on-device count, in-HRIS count, can-import
    count, leave-alone count, failed count, and last read/elapsed time.

The primary action `Sync logs` runs only ready source plans. The UI must not
show `Device users` as a tile in this modal because identity/user sync is a
separate admin workflow.

## States

- Loading: row/table skeletons and stable header dimensions.
- Empty: state names the active filters and distinguishes no saved rows from an
  unreachable source.
- Error: inline operational error with retry and exact failing plane.
- Stale inventory: show `Needs reverify`, last successful source timestamp, and
  cached HRIS count separately.
- Partial sync: keep imported/skipped/failed/still-missing counts and job ID.

## Tests

Backend tests cover SDK normalization, raw XML parsing, exact verified metaId
fixtures, pagination, every required mapping family, Add Person separation,
current-state refusal, before/after inference, runtime persistence,
deduplication, category/action/evidence/confidence/status filters, cleanup
predicate/backup, and summary parity.

Frontend contract tests cover all filter query keys, required action options,
saved-row-only lifecycle rendering, compact metric family labels, table/drawer
fields, and loading/error/empty states.

## Observability

Log request ID, device ID (not credentials), endpoint, time window, search ID,
page position/size, response status, elapsed time, normalized/persisted/
duplicate/unknown counts, correlation ID, and failure cause. Evidence artifacts
must redact tokens and credentials.

## Rollout and rollback

1. Apply additive enum/schema migration and evidence-payload migration.
2. Deploy backend normalization/filter/summary contract.
3. Preview cleanup, export backup, verify linked attendance zero, delete exact
   fake rows, and recount.
4. Deploy UI contract.
5. Verify local API, VM/LAN API, saved-row parity, then Playwright.

Rollback keeps raw rows: restore cleanup JSON after dedupe review; roll UI back
to the compatible event endpoint; do not remove enum values in-place. A failed
evidence migration is rolled back from the pre-migration table/JSON backup.
