# Device Event Model Hard Cutover - 2026-07-09

## Status

Implemented and locally verified for the BNPI PATS admin local app/API:

- App: `http://localhost:5175`
- API: `http://localhost:3001`
- Actor: `admin@bandai.local` / `bnpi-pats-admin`
- Evidence directory: `.runtime/device-event-model-hardcutover-20260709-225223/`

## Task Classification

Mixed feature/model cleanup, schema/data migration, UI hard cutover, and verification.
Risk was medium/high because the work changed persisted `DeviceEvent` schema,
API filters/summary contract, and the admin device-events ledger.

## Schema And API Truth

`DeviceEvent` now has persisted canonical event fields:

- `eventCategory`
- `eventAction`
- `eventLabel`
- `eventConfidence`

Prisma enum values were added for `DeviceEventCategory`,
`DeviceEventAction`, and `DeviceEventConfidence`. Useful indexes were added for
category/action/time, raw runtime path/time, and BNPI PATS processing result/time.

Raw fields are retained:

- `source` remains the raw listener/callback/runtime path and is exposed as
  `Runtime path` only in debug/details surfaces.
- `status` remains the BNPI PATS processing result and is exposed as `BNPI PATS result`.
- `eventType`, `major`, `minor`, `payload`, and `errorMessage` remain raw
  vendor/runtime evidence.

`GET /api/device/events` now returns persisted taxonomy fields directly, accepts
`eventCategory` and `eventAction`, and returns summary buckets:
`byCategory`, `byAction`, `byProcessingResult`, and `byRuntimePath`.
Compatibility aliases `byStatus` and `bySource` are still returned.

## Migration And Backfill

Migration file:
`bnpi-pats-api/prisma/schema-postgres/migrations/20260709_device_event_taxonomy_hardcutover.sql`

The migration is narrow SQL, not Prisma `db push`. It creates the enum types
and columns idempotently, backfills existing rows from deterministic raw
evidence, and creates indexes.

Backup proof:

- Backup table: `device_events_backup_20260709_225223`
- Source rows before migration: 96
- Backup rows: 96
- Evidence: `db-device-events-backup-proof.json`

Post-backfill distribution:

| Category | Action | Confidence | Count |
|---|---|---:|---:|
| `ACCESS_CONTROL` | `UNKNOWN` | `UNKNOWN` | 62 |
| `ATTENDANCE` | `TAP` | `PROVEN` | 32 |
| `UNKNOWN_VENDOR` | `LISTENER_RECEIVED` | `UNKNOWN` | 2 |

Rollback notes are embedded at the top of the SQL migration. Raw event rows are
not destroyed by rollback; rollback would drop only the added taxonomy columns,
indexes, and enum types after confirming backup/restore expectations.

## Vendor Classification

Proven from saved data/runtime:

- Hikvision `EN_HCNETSDK_ALARM`, `MINOR_FINGERPRINT_COMPARE_PASS`,
  `eventKind=attendance_fingerprint_success`, or `minor=38`:
  `ATTENDANCE` / `TAP` / `Fingerprint attendance punch` / `PROVEN`.
- ZKTeco `ZKTECO_EVENT` or `AttendanceTransaction`:
  `ATTENDANCE` / `TAP` / `Attendance punch` / `PROVEN`.

Supported by Hikvision SDK code/header mapping but not yet proven in saved data:

- Fingerprint add/update/delete.
- Card add/update/delete.
- Device user create/update/delete.
- Failed or rejected fingerprint/card verification as `ACCESS_CONTROL` /
  `TAP_REJECTED`.

Unknown Hikvision ACS rows with unrecognized minor/action codes are not invented
into attendance or enrollment actions. The local backfill classified them as
`ACCESS_CONTROL` / `UNKNOWN` / `UNKNOWN`.

## UI Cutover

`/admin/configuration/devices/events` now presents a generic `Device events`
ledger.

Primary columns:

- Event time
- Event
- Employee/User
- Terminal
- BNPI PATS result

Primary filters:

- View
- Device
- Time window
- Event category
- Event action

Runtime path/source and BNPI PATS result/status filters are kept only in the debug
strip. The event details modal is titled `Device event details` and includes
event label, category, action, confidence, event time, employee/device user,
terminal, BNPI PATS result, runtime path, and raw payload evidence.

Device create/edit copy now uses `Runtime adapter`, `Internal adapter key`, and
`Callback path`; stored `config.source` remains an implementation detail.

## Verification

Focused tests:

- `bnpi-pats-api`: `npm test -- --grep "Device event taxonomy|Device events API contract"` passed, 10 tests.
- `bnpi-pats-api`: `npm run typecheck` passed.
- `bnpi-pats-app`: `npm test -- app/lib/device-events-page-contract.test.ts` passed, 10 tests.
- `bnpi-pats-app`: `npm run typecheck:test` failed on unrelated existing
  `app/routes/employee/dashboard/TimesheetsTab.test.tsx(54,46)` React Query
  mock typing; focused device-event contract passed.

API endpoint proof:

- `api-endpoint-proof.json`
- `api-saved.json`
- `api-category-attendance.json`
- `api-action-tap.json`
- `api-unknown-vendor.json`

Browser proof:

- `playwright-device-events-proof.json`
- `playwright-device-events-page.png`
- `playwright-device-events-modal-text.txt`
- `playwright-device-events-journey.json`
- `playwright-device-events-journey.png`
- `playwright-device-form-copy-proof.json`
- `playwright-device-form-copy.png`

The browser proof verified `Device events`, category/action filters, no visible
`Device attendance` or `Punch details`, and modal fields for category, action,
confidence, runtime path, and BNPI PATS result.

## Recommendations

No new recommendations were identified. Existing 2026-07-09 recommendations
already cover remaining PROD source-count and employee-mapping follow-up.
