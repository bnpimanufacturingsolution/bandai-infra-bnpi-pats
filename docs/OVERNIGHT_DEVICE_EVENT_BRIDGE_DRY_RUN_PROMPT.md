# Overnight ZKTeco Event Contract Dry Run Prompt

Use this as the ordered run prompt for proving ZKTeco punch ingestion into Project Truth HRIS.

## Objective

Prove ZKTeco end to end without touching unrelated device integrations:

- A ZKTeco bridge or mock posts to `POST /api/zkteco/events`.
- HRIS normalizes the payload through `zkteco-event-contract.helper.ts`.
- HRIS stores a `device_events` row with `source = ZKTECO_EVENT` when a matching `Device` exists.
- HRIS matches the event to `employees.deviceEmpId` when possible.
- Admin > Devices > Device attendance shows the saved ZKTeco event.
- Attendance/payroll truth remains unchanged until a later explicit ZKTeco attendance-application change is built.

## ZKTeco Callback Truth

ZKTeco Standalone SDK integrations are usually bridge/listener based, not direct device-to-HRIS HTTP webhooks.

Expected real flow:

1. A Windows bridge process uses the ZKTeco SDK / `zkemkeeper.dll`.
2. The bridge connects to the terminal on TCP port `4370`.
3. The bridge registers real-time events such as attendance transactions.
4. When the SDK raises an attendance event, the bridge posts JSON to HRIS:

   ```text
   POST /api/zkteco/events
   ```

So in Project Truth, `/api/zkteco/events` is the HRIS webhook contract. The device callback/listener behavior belongs to the Windows ZKTeco bridge.

## Current Dry Run Facts

Run date: 2026-06-18, Asia/Manila host.

- `http://localhost:3001/health` returned healthy.
- Mock post to `http://localhost:3001/api/zkteco/events` returned HTTP 200.
- Mock result was `device_not_found`, meaning HRIS accepted the payload shape but no `Device` matched `10.184.38.10:4370`.
- Current default Postgres device row is `Main Entrance Device`, `192.168.110.24:80`, `https`.
- Current `device_events` count is zero.
- Current employees table has no rows with `deviceEmpId`.
- `vendor/zkteco-sdk` exists but is missing required real bridge files: `Program.cs`, `Interop.zkemkeeper.dll`, and `Dockerfile.windows`.

## Contract Map

API files:

- `hris-api/app/zkteco/zkteco.router.ts`
- `hris-api/app/zkteco/zkteco.controller.ts`
- `hris-api/helper/zkteco-event-contract.helper.ts`
- `hris-api/prisma/schema-postgres/device.prisma`

Frontend visibility:

- `hris-app/app/routes/admin/devices/events.tsx`
- URL: `http://localhost:3000/admin/devices/events?view=saved&source=ZKTECO_EVENT`

Accepted ZKTeco payload shape:

```json
{
  "device": { "type": "ZKTeco", "ip": "10.184.38.10", "port": 4370 },
  "attendance": {
    "enrollNumber": "1",
    "userName": "Project Truth Smoke",
    "timestamp": "2026-06-18T22:27:26",
    "verifyMethodName": "Fingerprint",
    "attState": 0,
    "attStateName": "Check In",
    "isValid": true,
    "workCode": 0,
    "serialNo": 123
  },
  "eventType": "AttendanceTransaction"
}
```

## Truth Matrix

| Condition | API result | DB effect | Attendance effect |
|---|---|---|---|
| No matching `Device.address` + `port` | `device_not_found` | No `device_events` row | None |
| Matching device, missing enroll number | `missing_employee_no` | `DeviceEvent.status = IGNORED` | None |
| Matching device, unknown `deviceEmpId` | `employee_not_found` | `DeviceEvent.status = UNMATCHED` | None |
| Matching device and employee | `matched = true` | `DeviceEvent.status = MATCHED` | None |
| Same event posted twice | `duplicate = true` | Existing event reused | None |

Important: ZKTeco currently records and matches device events only. It does not create or update `Attendance`, `AttendanceObligation`, timesheets, or payroll inputs yet.

## Ordered Run

1. Start at repo root.

   ```powershell
   cd C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH
   git status --short
   ```

2. Verify HRIS services.

   ```powershell
   docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
   Invoke-RestMethod http://localhost:3001/health
   Invoke-RestMethod http://localhost:3000/health
   ```

3. Run the ZKTeco contract-only smoke.

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-zkteco-bridge.ps1 -ContractOnly -DeviceIp 10.184.38.10 -DevicePort 4370 -EnrollNumber 1
   ```

4. Inventory current truth rows.

   ```powershell
   @'
   select id, name, address, port, protocol, "organizationId", "isDeleted"
   from "Device"
   order by "createdAt" desc;

   select source, status, count(*)
   from device_events
   group by source,status
   order by source,status;

   select id, "employeeId", "deviceEmpId", "organizationId", "isDeleted"
   from employees
   where "deviceEmpId" is not null
   order by "updatedAt" desc
   limit 20;
   '@ | docker exec -i hris-postgres psql -U postgres -d hris
   ```

5. Add or verify the ZKTeco `Device`.

   Required truth:

   - `address`: real terminal IP, for example `10.184.38.10`
   - `port`: `4370`
   - `protocol`: `tcp`
   - `access`: `{}`
   - `config`: optional marker such as `{ "vendor": "ZKTeco" }`

6. Add or verify employee device IDs.

   The bridge enroll number must match:

   ```text
   employees.deviceEmpId
   ```

7. Re-run the contract smoke after the device row exists.

   Expected:

   - unknown employee number -> `UNMATCHED`
   - known employee number -> `MATCHED`
   - duplicate body -> reused duplicate event

8. Verify saved events.

   ```powershell
   @'
   select id, source, status, "employeeNo", "employeeId", "deviceId", "eventTime", "errorMessage"
   from device_events
   where source = 'ZKTECO_EVENT'
   order by "receivedAt" desc
   limit 20;
   '@ | docker exec -i hris-postgres psql -U postgres -d hris
   ```

9. Open the UI.

   ```text
   http://localhost:3000/admin/devices/events?view=saved&source=ZKTECO_EVENT
   ```

10. Stop before real bridge work if files are missing.

    Real bridge files currently expected under `vendor/zkteco-sdk`:

    ```powershell
    Test-Path .\vendor\zkteco-sdk\Program.cs
    Test-Path .\vendor\zkteco-sdk\Interop.zkemkeeper.dll
    Test-Path .\vendor\zkteco-sdk\Dockerfile.windows
    ```

    If these are false, stay in mock/contract mode.

## Later Implementation Decision

Only after saved ZKTeco events are proven, choose how to apply them to attendance truth:

1. Keep ZKTeco as audit-only device events.
2. Add a ZKTeco attendance applicator that creates/updates `Attendance` from matched `DeviceEvent` rows.
3. Reuse the same attendance-obligation/timesheet refresh pipeline used by other attendance paths.

Do not silently make ZKTeco punches payroll-effective without a visible status transition such as `ATTENDANCE_CREATED` or `ATTENDANCE_UPDATED`.
