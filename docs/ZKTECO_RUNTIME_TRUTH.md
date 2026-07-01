# ZKTeco Runtime Truth

Project Truth must not show Hikvision health terms for ZKTeco devices.

For a ZKTeco TCP device such as `10.184.38.9:4370`, the truthful contract is:

1. The physical terminal is reachable on TCP port `4370`.
2. A configured Windows Standalone SDK sidecar exposes `GET /health` and `GET /status`.
3. HRIS API reads that sidecar status through `ZKTECO_BRIDGE_STATUS_URL` when configured.
4. HRIS API accepts real sidecar attendance posts at `/api/zkteco/events`.
5. The UI shows ZKTeco sidecar health and saved HRIS events.

The UI must not show these labels for ZKTeco rows:

- `AlarmDemo`
- `Device API`
- `ISAPI`
- `SDK 4370`

Those labels belong to Hikvision-only paths.

## Active Runtime

Use `appliance/zkteco-standalone-sdk` when using the ZKTeco Standalone SDK (`Interop.zkemkeeper.dll` and `zkemkeeper.dll`). This bridge targets `.NET Framework 4.8`, x86, and Windows COM registration.

It must run on a Windows host or Windows container runtime. It cannot run as a normal Linux Docker container inside the Ubuntu VM.

The older `appliance/zkteco-bridge` Node socket bridge is retired from the active VM/K3s/Docker path because it can hold stale sessions and drift from the Windows SDK runtime truth.

## Linux VM / Docker Feasibility Truth

As of 2026-07-01, Project Truth has not proven a ZKTeco attendance-terminal
runtime inside the Ubuntu VM or a Linux Docker container.

The currently proven ZKTeco runtime remains the Windows Standalone SDK sidecar.
Installing a Linux SDK in the VM would be new runtime work, not a continuation
of the existing `appliance/zkteco-standalone-sdk` path, because the repo bridge
depends on Windows COM components.

Current SDK source research:

- Official ZKTeco Download Center lists `ZKFinger SDK Linux`, but that SDK is
  for fingerprint scanners, not the attendance-terminal Standalone SDK path
  used by Project Truth.
- Official ZKTeco `ZKFinger SDK for Linux` product text lists supported scanner
  devices such as `SLK20R`, `ZK9500`, `ZK6500`, and `ZK8500R`; it describes
  image/template capture, not TCP attendance-log sidecar operation.
- The public `ZKTeco/Standalone-SDK` repository is still the visible
  Standalone SDK source, and its open Linux request from 2024-12-24 asks ZKTeco
  to release a Linux-compatible version.

Therefore, do not mark ZKTeco realtime as VM/Docker-proven until one of these
is installed, licensed if needed, implemented, and verified end to end:

1. A vendor-supported Linux attendance-terminal Standalone/Pull/Push SDK that
   can connect to the known Project Truth terminals and post to
   `/api/zkteco/events`.
2. A documented Linux protocol implementation that proves device connection,
   event read/watch behavior, dedupe, HRIS event persistence, UI rendering, and
   sidecar health/status.
3. A deliberate external Windows sidecar architecture where the Windows SDK
   remains outside the VM but is documented as the canonical device runtime.

## Employee Mapping Truth

ZKTeco enroll numbers are the device-side biometric IDs. In HRIS they belong in `employees.deviceEmpId` without display padding. If the HR employee code is `00021`, the ZKTeco `deviceEmpId` should be `21`.

The HRIS API also matches incoming ZKTeco punches against padded employee codes as a fallback, so a device event with enroll number `21` can still resolve employee `00021`. For local DEV repair, run:

```powershell
cd .\hris-api
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:15433/hris"
npm run repair:zkteco-truth
```

That repair keeps the event ledger, normalizes numeric `deviceEmpId` values, and rematches existing `UNMATCHED` ZKTeco device events to employees when possible. It does not create Attendance, timesheet, or payroll writes.

When using the Windows SDK bridge with the current DEV VM:

```text
ZKTECO_WEBHOOK_URL=http://10.184.38.61:3101/api/zkteco/events
ZKTECO_STATUS_PORT=4371
```

Then point the HRIS API environment at the reachable sidecar:

```text
ZKTECO_BRIDGE_STATUS_URL=http://<windows-sidecar-ip>:4371/status
```

## Current Drift Symptom

If `http://10.184.38.61:3100/admin/configuration/devices/events?...` still shows `AlarmDemo`, `Device API`, or `ISAPI` for `ZKTeco Device 10.184.38.9`, the VM is serving an old app/API build or is still pointed at the old health contract.

The fix is to deploy the updated app/API and configure a reachable SDK sidecar status URL. Host-local Docker health alone is not the Project Truth finish line.

## 2026-06-29 SDK Device Count Truth

Read-only SDK summary command:

```powershell
$env:ZKTECO_DEVICE_IPS="10.184.38.10,10.184.38.234,10.184.38.235,10.184.38.9"
$env:ZKTECO_BACKFILL_MAX_EVENTS="100000"
.\appliance\zkteco-standalone-sdk\bin\Debug\net48\ZKTecoStandalone.exe --summary
```

Result captured on 2026-06-29:

| Device IP | SDK connected | User count | Event count | Unique event users | First event | Last event |
|---|---:|---:|---:|---:|---|---|
| `10.184.38.10` | yes | 907 | 41,586 | 838 | 2022-12-31 05:47:24 | 2026-06-29 08:27:27 |
| `10.184.38.234` | yes | 905 | 31,391 | 785 | 2022-12-31 05:36:18 | 2026-06-29 08:11:17 |
| `10.184.38.235` | yes | 905 | 21,160 | 813 | 2026-04-01 05:03:55 | 2026-06-29 10:09:10 |
| `10.184.38.9` | yes | 905 | 12,581 | 747 | 2022-12-31 17:39:06 | 2026-06-29 06:15:12 |

All four known Project Truth ZKTeco devices connected through the Windows Standalone SDK for this summary run. Earlier `10.184.38.234` and `10.184.38.235` SDK error `-2` evidence is now stale for count reporting, but remains useful as proof that SDK connectivity can be transient.

The live sidecar process listening at `http://127.0.0.1:5471/status` was separately configured for one device during this run:

| Sidecar device | Connected | Streaming | Events seen since sidecar start | Events posted since sidecar start |
|---|---:|---:|---:|---:|
| `10.184.38.9:4370` | yes | yes | 0 | 0 |

Do not confuse the read-only SDK summary event counts with sidecar realtime counters. The summary counts are stored device log rows read directly from each terminal. The sidecar counters are only events seen or posted since the current sidecar process started.

## 2026-06-29 ZKTeco Sync Mode Truth

The Windows SDK sidecar must default to watch mode. Starting the sidecar should connect to configured devices, register realtime events, and serve health/status without bulk-posting stored device logs to HRIS.

Historical/stored attendance sync is an explicit admin action:

- HRIS admin UI: `/admin/configuration/devices/events`, `Sync logs`
- Sidecar status API: `POST /sync`

`ZKTECO_BACKFILL_ATTENDANCE_LOGS=true` is an override for controlled maintenance only. Do not use it as the normal watch process default because it can import historical terminal punches into HRIS as if they were newly saved today.

## 2026-06-29 Admin Device Events Filter Truth

The admin events screen is an `hris-admin` surface:

```text
http://127.0.0.1:3100/admin/configuration/devices/events
```

Do not test this screen with `hris-hr-manager` unless a task explicitly asks for an HR workflow. The verified local dev admin identity is `hris-admin` in organization `cmqq3ho1g0000ti3dn4u5w8u3`.

The page has two different date meanings:

- `Saved in HRIS` uses the event ledger saved/received date, `device_events.receivedAt`.
- Punch time shown in the table is the terminal punch time, `device_events.eventTime`.

For the live dev stack on `127.0.0.1:3100` / `127.0.0.1:3101`, Prisma uses `PG_DATABASE_URL`, so diagnostics must target `hris-postgres-dev` explicitly:

```powershell
cd .\hris-api
$env:DEVICE_EVENTS_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:15433/hris?schema=public"
npx tsx scripts/dry-run-device-events-filter-truth.ts
```

Historical saved-event counts verified earlier on 2026-06-29, before the dev
hard-cutover purge:

| Filter window | Date field | Expected total | Matched | Needs match | Source |
|---|---|---:|---:|---:|---|
| Today, `2026-06-29` | `receivedAt` | 9,983 | 9,777 | 206 | `ZKTECO_EVENT` |
| Yesterday, `2026-06-28` | `receivedAt` | 0 | 0 | 0 | none |
| Last 7 days | `receivedAt` | 34,284 | 32,974 | 1,307 | `ZKTECO_EVENT` |
| All | `receivedAt` / `eventTime` | 34,284 | 32,974 | 1,307 | `ZKTECO_EVENT` |

Per-device saved ledger counts:

| Device IP | Today saved rows | All saved rows |
|---|---:|---:|
| `10.184.38.10` | 7,564 | 12,581 |
| `10.184.38.234` | 0 | 5,023 |
| `10.184.38.235` | 512 | 7,365 |
| `10.184.38.9` | 1,907 | 9,315 |

On 2026-06-29 at 11:13 Asia/Manila, the local dev database behind
`hris-api-dev` / `hris-postgres-dev` was hard-cutover purged for
`device_events`. The purge deleted 34,284 dev `ZKTECO_EVENT` ledger rows after
exporting a rollback backup to `.runtime/backups/`. Verification immediately
after the purge showed zero saved `device_events` for all windows and all four
known ZKTeco device IPs.

Therefore, a clean dev saved-ledger screen is expected until the Windows SDK
sidecar exports/posts fresh rows again. The SDK terminal event counts above are
still device-side terminal truth; the HRIS saved ledger now starts from zero for
this dev hard-cutover.
