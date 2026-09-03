# ZKTeco Device Events Filter Truth - 2026-06-29

## Current State

The admin device events page was verified with `agent-browser` as `hris-admin`, not `hris-hr-manager`.

Verified URL:

```text
http://127.0.0.1:3100/admin/configuration/devices/events
```

The live dev stack uses:

- App: `hris-app-dev` at `127.0.0.1:3100`
- API: `hris-api-dev` at `127.0.0.1:3101`
- DB: `hris-postgres-dev` / host `127.0.0.1:15433`
- Organization: `cmqq3ho1g0000ti3dn4u5w8u3`

## Query Contract

For the `Saved in HRIS` view, the frontend must send:

```text
GET /api/device/events?page=1&limit=10&sort=receivedAt&order=desc&dateField=receivedAt&from=YYYY-MM-DD&to=YYYY-MM-DD
```

`dateField=receivedAt` is intentional. This view is the HRIS saved event ledger. The displayed punch time can be older because it comes from `eventTime`.

## Historical Verified Counts Before Hard-Cutover

Diagnostic command:

```powershell
cd .\hris-api
$env:DEVICE_EVENTS_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:15433/hris?schema=public"
npx tsx scripts/dry-run-device-events-filter-truth.ts
```

Saved-page expected filters:

| Window | Expected total | Matched | Needs match | Other statuses | Source |
|---|---:|---:|---:|---|---|
| Today, `2026-06-29` | 9,983 | 9,777 | 206 | none | `ZKTECO_EVENT` |
| Yesterday, `2026-06-28` | 0 | 0 | 0 | none | none |
| Last 2 days | 9,983 | 9,777 | 206 | none | `ZKTECO_EVENT` |
| Last 7 days | 34,284 | 32,974 | 1,307 | `RECEIVED=2`, `IGNORED=1` | `ZKTECO_EVENT` |
| All | 34,284 | 32,974 | 1,307 | `RECEIVED=2`, `IGNORED=1` | `ZKTECO_EVENT` |

Per-device saved counts:

| Device IP | Today by `receivedAt` | Yesterday by `receivedAt` | All saved rows |
|---|---:|---:|---:|
| `10.184.38.10` | 7,564 | 0 | 12,581 |
| `10.184.38.234` | 0 | 0 | 5,023 |
| `10.184.38.235` | 512 | 0 | 7,365 |
| `10.184.38.9` | 1,907 | 0 | 9,315 |

## Hard-Cutover Purge

On 2026-06-29 at 11:13 Asia/Manila, the local dev database behind
`hris-api-dev` / `hris-postgres-dev` was purged for `device_events` after
creating a rollback export.

- Target: `hris-postgres-dev`, database `hris`, host port `15433`.
- Backup: `.runtime/backups/device_events_dev_before_hardcutover_20260629-111329.sql`.
- Deleted rows: `34,284`.
- Remaining `device_events`: `0`.
- Guard counts after purge: `Attendance=77,744`, `AttendanceObligation=89,345`, `Timesheet=10,112`.
- Per-device remaining saved rows for `10.184.38.10`, `10.184.38.234`, `10.184.38.235`, and `10.184.38.9`: `0`.

The historical counts below are preserved only as pre-purge evidence. They are
not the current saved HRIS ledger state.

## Browser Evidence

`agent-browser` verified:

- `window=today`: total events `9,983`, matched `9,777`, needs match `206`, page rows render, save path shows `ZKTeco SDK sidecar`.
- `window=yesterday`: total events `0`, matched `0`, needs match `0`, page shows `No saved events found`.
- Screenshot evidence was saved locally under `.runtime/zkteco-events-today-admin.png` and `.runtime/zkteco-events-yesterday-admin.png`.

## Drift Found

Two local DB surfaces existed during verification:

- `127.0.0.1:15432` / `hris-postgres` had a different seeded/imported event state.
- `127.0.0.1:15433` / `hris-postgres-dev` is the browser/API truth for `127.0.0.1:3100`.

The Prisma schema uses `PG_DATABASE_URL`, not `DATABASE_URL`, so diagnostics must set `DEVICE_EVENTS_DATABASE_URL` or `PG_DATABASE_URL` when targeting the dev page database.

## WWG Truth Synchronization

- Task mode: mixed bug fix, browser/API/database drift verification, and docs synchronization.
- New truth detected: YES.
- Wiki updated: N/A.
- Workspace updated: NO.
- Governance review completed: YES.
- Drift status: MEDIUM before fix, LOW after verification.
- Canonical files changed:
  - `docs/ZKTECO_RUNTIME_TRUTH.md`
  - `hris-api/scripts/dry-run-device-events-filter-truth.ts`
  - `.wwg/reports/zkteco-device-events-filter-truth-20260629.md`
- Implementation discoveries synced:
  - Admin device events are `hris-admin` work.
  - Saved HRIS event filters must use `receivedAt`.
  - Live dev browser DB is `hris-postgres-dev` on host port `15433`.
- Remaining stale context:
  - Existing WWG validation still reports older generated report truth-sync field failures unrelated to this ZKTeco filter verification.

## Recommendation Capture

No new recommendations were identified.
