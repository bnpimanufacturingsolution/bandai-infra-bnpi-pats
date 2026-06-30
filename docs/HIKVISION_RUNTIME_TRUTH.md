# Hikvision Runtime Truth

Project Truth has a real Hikvision integration surface, but it is not yet at
the same runtime-proven level as the ZKTeco Windows SDK sidecar.

## Current Integration

Hikvision is implemented through two paths:

1. HRIS API callback ingestion at `/api/hikvision/callback`.
2. HRIS API ISAPI client reads through `hris-api/lib/hikvision-client.ts` and
   `hris-api/config/hikvision.endpoint.ts`.

The callback path parses JSON, XML, and AlarmDemo-normalized events, stores a
`device_events` ledger row, emits `device-event:saved`, and can create or update
Attendance plus AttendanceObligation for matched attendance punches.

The accepted `DeviceEventSource` values are:

| Source | Meaning |
|---|---|
| `HIKVISION_CALLBACK` | Device HTTP host callback or normal callback payload |
| `EN_HCNETSDK_ALARM` | Windows HCNetSDK AlarmDemo listener payload |
| `ZKTECO_EVENT` | ZKTeco Windows Standalone SDK sidecar event |

Do not use `AlarmDemo`, `Device API`, `ISAPI`, or `SDK 4370` as stored
`DeviceEventSource` values. Those are runtime labels only.

## Vendor Source

Editable Hikvision reference source is tracked as a submodule:

```text
vendor/hikvision-bio -> https://github.com/hrisworkforcesystem-coder/HikVision_Bio.git
```

The local full HCNetSDK folder currently exists outside this repo:

```text
C:\Users\anoni\OneDrive\Desktop\HRIS-PROJECT\EN-HCNetSDKV6.1.9.4_build20220412_win64
```

That folder contains editable `AlarmDemo.cpp`, `build-alarmdemo.ps1`,
`find-deps.ps1`, HCNetSDK headers, docs, sample projects, DLLs, LIBs, and build
outputs. Treat proprietary SDK binaries and device credentials as local-only
runtime inputs. Do not copy them into the Project Truth super-repo.

Use this environment variable when the SDK is outside the repo:

```powershell
$env:HIKVISION_SDK_ROOT="C:\Users\anoni\OneDrive\Desktop\HRIS-PROJECT\EN-HCNetSDKV6.1.9.4_build20220412_win64"
```

The API helper scripts look for AlarmDemo in this order:

1. `$env:HIKVISION_SDK_ROOT`
2. `vendor/hikvision-bio`
3. `EN-HCNetSDKV6.1.9.4_build20220412_win64` at the repo root
4. The current operator-local HCNetSDK path above

## Runtime Commands

Build AlarmDemo from the SDK folder:

```powershell
cd $env:HIKVISION_SDK_ROOT
.\build-alarmdemo.ps1
```

Run the AlarmDemo listener only:

```powershell
cd .\hris-api
npm run dev:alarmdemo
```

Run API development with AlarmDemo when available:

```powershell
cd .\hris-api
npm run dev
```

Skip AlarmDemo and run API only:

```powershell
cd .\hris-api
$env:HRIS_SKIP_HIKVISION_ALARMDEMO="true"
npm run dev
```

Audit live Hikvision events against saved HRIS device events:

```powershell
cd .\hris-api
npm run dry-run:hikvision-device-events -- --deviceId=<hris-device-id>
```

Apply missing live events through the normal callback controller:

```powershell
cd .\hris-api
npm run repair:hikvision-device-events -- --deviceId=<hris-device-id>
```

Check device clock skew:

```powershell
cd .\hris-api
npm run check:hikvision-device-clock -- --deviceId=<hris-device-id>
```

These commands require a configured HRIS Device row, reachable device network,
and runtime credentials supplied through environment or the Device access field.

## ZKTeco Parity

| Surface | ZKTeco | Hikvision |
|---|---|---|
| Vendor source | `appliance/zkteco-standalone-sdk`, `vendor/zkteco-sdk` | `vendor/hikvision-bio` submodule plus local HCNetSDK folder |
| Runtime listener | Windows .NET Framework SDK sidecar | Windows HCNetSDK AlarmDemo listener |
| API ingress | `/api/zkteco/events` | `/api/hikvision/callback` |
| Stored source | `ZKTECO_EVENT` | `HIKVISION_CALLBACK` or `EN_HCNETSDK_ALARM` |
| Raw payload preservation | `device_events.payload` | `device_events.payload` |
| Employee match | `employee.deviceEmpId`, padded employee ID fallback | `employee.deviceEmpId` |
| Attendance write | Current endpoint records/matches device event only | Callback can create/update Attendance and AttendanceObligation |
| Health path | `ZKTECO_BRIDGE_STATUS_URL`, sidecar `/status`, `/sync` | `AlarmDemo.exe` process check, TCP check, ISAPI time check |
| UI saved events | Admin device events page with source filter | Same page with source filter |
| Realtime | `device-event:saved` | `device-event:saved` and attendance realtime when attendance changes |

## Current Drift

- Hikvision vendor source was not present in the Project Truth repo until the
  `vendor/hikvision-bio` submodule adoption.
- First-party scripts previously assumed the SDK folder existed at the repo
  root. The actual verified local folder is outside the repo under
  `C:\Users\anoni\OneDrive\Desktop\HRIS-PROJECT`.
- GitOps and VM manifests do not currently start AlarmDemo or manage a
  Hikvision listener sidecar. Hikvision listener runtime is Windows-host/local
  unless a later approved runtime design adds a managed service.
- Physical-device proof requires a reachable Hikvision device and credentials.
  Do not mark physical-device testing complete from schema/tests alone.
- Existing ZKTeco runtime truth is broader across environments. Docker DEV has
  stored Hikvision rows for `HIKVISION_CALLBACK` and `EN_HCNETSDK_ALARM`,
  including attendance-linked rows, but Docker PROD/UAT and public DEV did not
  show the same Hikvision event evidence during the 2026-06-30 verification
  pass.
- Hikvision still needs repeatable physical-device, browser/socket, LAN/public,
  and attendance journey proof across the intended production path.

## Admin UI Truth

Use admin / `hris-admin`.

The saved event page is:

```text
/admin/configuration/devices/events?view=saved
```

Source filters must distinguish:

- `HIKVISION_CALLBACK`
- `EN_HCNETSDK_ALARM`
- `ZKTECO_EVENT`

The page listens for `device-event:saved` on:

- `device-events:org:<organizationId>`
- `device-events:device:<deviceId>`

When a Hikvision punch creates or updates attendance, the API also emits
`attendance:event` to the attendance organization room and employee room.

## Runtime Finish Line

A complete Hikvision proof requires:

1. AlarmDemo or direct device callback reaches `/api/hikvision/callback`.
2. A row is stored in `device_events` with source `HIKVISION_CALLBACK` or
   `EN_HCNETSDK_ALARM`.
3. The row preserves raw payload and dedupe key.
4. The row matches an employee through `employees.deviceEmpId`, or is clearly
   marked `UNMATCHED`.
5. Attendance is created or updated for accepted punch events.
6. AttendanceObligation and timesheet refresh behavior is verified.
7. `device-event:saved` is observed by the admin device events page.
8. `attendance:event` is observed by the attendance page when attendance changes.
9. Host-local, VM LAN, and public Cloudflare paths are documented with exact
   endpoints and responses.
10. Remaining physical-device or network drift is recorded without inventing
    evidence.
