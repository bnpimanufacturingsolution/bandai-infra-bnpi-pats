# Overnight ZKTeco Project Truth Bridge Prompt

Use this prompt for an overnight agent run. Keep the work ZKTeco-only. Do not spend time on Hikvision runner scripts unless a ZKTeco file imports or depends on them.

## Mission

Prove the Project Truth ZKTeco path end to end:

1. HRIS accepts ZKTeco attendance events at `POST /api/zkteco/events`.
2. The contract helper normalizes bridge payloads in `hris-api/helper/zkteco-event-contract.helper.ts`.
3. The controller stores matched device evidence in `device_events` with `source = ZKTECO_EVENT`.
4. Employee matching uses `employees.deviceEmpId`.
5. The saved event is visible in Admin > Devices > Device attendance at `/admin/devices/events?view=saved&source=ZKTECO_EVENT`.
6. The real ZKTeco bridge code lives locally under `vendor/zkteco-sdk` so it syncs with this repo.
7. Attendance, timesheets, and payroll are not mutated unless a separate explicit attendance-applicator change is built and tested.

## Current Truth

- Repo root: `C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH`
- HRIS API route: `hris-api/app/zkteco/zkteco.router.ts`
- HRIS controller: `hris-api/app/zkteco/zkteco.controller.ts`
- Contract helper: `hris-api/helper/zkteco-event-contract.helper.ts`
- Contract test: `hris-api/tests/zkteco-event-contract.helper.spec.ts`
- Verifier: `scripts/verify-zkteco-bridge.ps1`
- Overnight doc: `docs/OVERNIGHT_ZKTECO_PROJECT_TRUTH_BRIDGE_PROMPT.md`
- Real bridge folder expected by compose: `vendor/zkteco-sdk`

ZKTeco callback support is bridge/listener based for Standalone SDK style devices. The agent should verify this during the run, but the working assumption is:

- A Windows process uses ZKTeco `zkemkeeper` / Standalone SDK.
- The process connects to each device over TCP, usually port `4370`.
- The process registers realtime events with SDK event registration such as `RegEvent`.
- The attendance callback such as `OnAttTransactionEx` fires when a punch happens.
- The bridge callback posts JSON to Project Truth:

```text
POST http://localhost:3001/api/zkteco/events
```

Research references to confirm before touching code:

- ZKTeco SDK page: https://www.zkteco.com/en/SDK
- ZKTeco Standalone SDK GitHub page: https://github.com/ZKTeco/Standalone-SDK
- ZKTeco Standalone SDK manual references `OnAttTransactionEx` and realtime attendance transactions.
- Docker Desktop networking docs for `host.docker.internal`: https://docs.docker.com/desktop/features/networking/
- Docker Desktop networking how-tos: https://docs.docker.com/desktop/features/networking/networking-how-tos/
- Microsoft container mode reference: https://learn.microsoft.com/en-us/virtualization/windowscontainers/quick-start/run-your-first-container

## Non-Negotiable Boundaries

- Stay ZKTeco-only.
- Do not copy a large proprietary SDK package into the repo.
- Do commit/sync bridge source code, scripts, docs, and placeholders.
- Do not commit `Interop.zkemkeeper.dll`, generated `.exe`, `.dll`, `bin`, or `obj` outputs unless explicitly approved.
- Do not silently make ZKTeco punches payroll-effective.
- If a punch is saved but not attendance-applied, that is currently correct.

## Expected Local Bridge Code

If `vendor/zkteco-sdk` is empty or incomplete, create the local scaffold:

```text
vendor/zkteco-sdk/
  README.md
  ProjectTruth.ZktecoBridge.csproj
  Program.cs
  Build-Project.ps1
  Run-Monitor.ps1
  Dockerfile.windows
  lib/
    README.md
```

`Program.cs` must show the actual source-side callback shape:

```csharp
device.OnAttTransactionEx += OnAttTransactionEx;

private void OnAttTransactionEx(
    string enrollNumber,
    int isInvalid,
    int attState,
    int verifyMethod,
    int year,
    int month,
    int day,
    int hour,
    int minute,
    int second,
    int workCode)
{
    // Build JSON with device.ip, device.port, attendance.enrollNumber,
    // timestamp, verifyMethod, attState, isValid, workCode.
    // POST it to ZKTECO_WEBHOOK_URL.
}
```

The bridge should read these environment variables:

```text
ZKTECO_DEVICE_IPS=10.184.38.10,10.184.38.234,10.184.38.235,10.184.38.9
ZKTECO_DEVICE_PORT=4370
ZKTECO_WEBHOOK_URL=http://localhost:3001/api/zkteco/events
ZKTECO_CONNECT_PASSWORD=0
```

Use `x86` as the default build platform unless the real installed SDK proves it is 64-bit. ZKTeco COM SDK deployments are commonly bitness-sensitive.

## Ordered Work Plan

1. Start with a visible status update.

   Say what is being checked, then run:

   ```powershell
   cd C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH
   git status --short
   rg -n "zkteco|ZKTECO|deviceEmpId|DeviceEvent|device_events" hris-api hris-app scripts docs
   ```

2. Research for no more than 20 minutes.

   Confirm these points and cite links in the final handoff:

   - ZKTeco Standalone SDK supports realtime attendance callbacks.
   - The callback/event is bridge-side, not a native HTTP webhook from the device.
   - `OnAttTransactionEx` or equivalent carries enroll number, timestamp parts, verify method, attendance state, validity, and work code.
   - Docker Desktop host-to-container / container-to-host naming is understood for host process vs Windows container bridge.

   If research is unclear after 20 minutes, proceed with the local bridge scaffold and mark the specific unknowns.

3. Verify HRIS contract files.

   Read:

   ```text
   hris-api/app/zkteco/zkteco.router.ts
   hris-api/app/zkteco/zkteco.controller.ts
   hris-api/helper/zkteco-event-contract.helper.ts
   hris-api/tests/zkteco-event-contract.helper.spec.ts
   hris-api/prisma/schema-postgres/device.prisma
   hris-api/prisma/schema-postgres/employee.prisma
   hris-app/app/routes/admin/devices/events.tsx
   scripts/verify-zkteco-bridge.ps1
   ```

4. Create or repair local bridge source under `vendor/zkteco-sdk`.

   Required behavior:

   - Connect to each `ZKTECO_DEVICE_IPS` entry.
   - Register realtime attendance events.
   - On attendance callback, create the HRIS JSON payload.
   - POST to `ZKTECO_WEBHOOK_URL`.
   - Log success and failure lines with enough detail to prove progress.
   - Keep retry behavior bounded and visible.

5. Confirm the HRIS payload shape.

   The bridge must post this shape:

   ```json
   {
     "device": { "type": "ZKTeco", "ip": "10.184.38.10", "port": 4370 },
     "attendance": {
       "enrollNumber": "1",
       "userName": "",
       "timestamp": "2026-06-18T22:27:26",
       "verifyMethod": 1,
       "verifyMethodName": "Fingerprint",
       "attState": 0,
       "attStateName": "Check In",
       "isValid": true,
       "workCode": 0,
       "serialNo": 0
     },
     "eventType": "AttendanceTransaction"
   }
   ```

6. Run required tests.

   These must pass before calling the run successful:

   ```powershell
   cd .\hris-api
   npx tsx node_modules/mocha/bin/mocha --no-config tests/zkteco-event-contract.helper.spec.ts
   npm run typecheck
   cd ..
   ```

   Do not use `npm run test -- tests/zkteco-event-contract.helper.spec.ts`; this package script already expands `tests/**/*.spec.ts`, so appended args still run the broader suite.

   If full `typecheck` fails on unrelated existing errors, capture the first 20 relevant lines and still run the targeted ZKTeco test. Do not hide the failure.

7. Run static proof checks.

   ```powershell
   Test-Path .\vendor\zkteco-sdk\Program.cs
   Test-Path .\vendor\zkteco-sdk\ProjectTruth.ZktecoBridge.csproj
   Test-Path .\vendor\zkteco-sdk\Build-Project.ps1
   Test-Path .\vendor\zkteco-sdk\Run-Monitor.ps1
   Test-Path .\vendor\zkteco-sdk\Dockerfile.windows
   rg -n "OnAttTransactionEx|RegEvent|ZKTECO_WEBHOOK_URL|api/zkteco/events|HttpClient|PostAsync" .\vendor\zkteco-sdk
   ```

8. Start or verify HRIS services.

   ```powershell
   docker compose -f .\appliance\docker-compose.yml config --quiet
   docker compose -f .\appliance\docker-compose.yml --profile zkteco config --quiet
   docker compose -f .\appliance\docker-compose.yml up -d --build postgres hris-api-db-init hris-api hris-app
   docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
   Invoke-RestMethod http://localhost:3001/health
   Invoke-RestMethod http://localhost:3000/health
   ```

9. Run contract smoke.

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-zkteco-bridge.ps1 -ContractOnly -DeviceIp 10.184.38.10 -DevicePort 4370 -EnrollNumber 1
   ```

   Interpret results:

   - `device_not_found`: API contract works; add/fix HRIS `Device` row.
   - `employee_not_found`: device matched; fix `employees.deviceEmpId`.
   - `matched = true`: device and employee truth rows align.
   - `duplicate = true`: dedupe works.

10. Inspect database truth.

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
   limit 50;
   '@ | docker exec -i hris-postgres psql -U postgres -d hris
   ```

11. Add the ZKTeco truth rows if missing.

   Required device truth:

   - `Device.address = 10.184.38.10`
   - `Device.port = 4370`
   - `Device.protocol = tcp`
   - `Device.access = {}`
   - `Device.config.vendor = ZKTeco`

   Required employee truth:

   - `employees.deviceEmpId` equals the ZKTeco enroll number from the terminal.

   Prefer app/API flows when available. If using SQL for a local dry run, record exactly what was changed.

12. Run the real host bridge if SDK DLL is available.

   ```powershell
   $env:ZKTECO_DEVICE_IPS="10.184.38.10"
   $env:ZKTECO_DEVICE_PORT="4370"
   $env:ZKTECO_WEBHOOK_URL="http://localhost:3001/api/zkteco/events"
   .\vendor\zkteco-sdk\Build-Project.ps1 -Configuration Debug -Platform x86
   .\vendor\zkteco-sdk\Run-Monitor.ps1 -NoBuild
   ```

   If `Interop.zkemkeeper.dll` or the registered COM dependency is missing, stop real bridge execution and continue contract proof. Do not fake a successful SDK connection.

13. Optional Windows container bridge.

   Only do this if Docker Desktop is switched to Windows containers. The Linux HRIS stack and Windows bridge container generally cannot run on the same Docker Desktop daemon at the same time.

   ```powershell
   $env:ZKTECO_DEVICE_IPS="10.184.38.10"
   $env:ZKTECO_WEBHOOK_URL="http://host.docker.internal:3001/api/zkteco/events"
   docker compose -f .\appliance\docker-compose.yml --profile zkteco up -d --build zkteco-bridge
   ```

14. Verify UI truth.

   Open:

   ```text
   http://localhost:3000/admin/devices/events?view=saved&source=ZKTECO_EVENT
   ```

   Acceptance:

   - Saved row appears.
   - Source reads `ZKTeco bridge`.
   - Unknown enroll numbers show unmatched / needs match.
   - Known enroll numbers show matched employee.
   - Duplicate posts do not create duplicate evidence rows.

15. Watch and show progress.

   Keep at least two watcher panes open:

   ```powershell
   docker logs -f hris-api
   ```

   ```powershell
   Get-Content .\vendor\zkteco-sdk\logs\*.log -Wait
   ```

   If there is no live punch for 15 minutes, send a progress note with:

   - API health
   - bridge process status
   - latest bridge log line
   - latest `ZKTECO_EVENT` count
   - current blocker or next action

## Do Not Get Stuck Rules

- If SDK research is unclear after 20 minutes, continue with contract scaffold and mark the source as unverified.
- If Docker is unavailable, run helper tests and static bridge-code proof.
- If API health is down, inspect `docker logs hris-api --tail 100` and `docker logs hris-postgres --tail 100`.
- If `device_not_found`, stop debugging code and fix the `Device` row.
- If `employee_not_found`, stop debugging code and fix `employees.deviceEmpId`.
- If no real SDK DLL exists, do not block the entire proof; complete mock webhook proof and document that real device callback is pending DLL/COM availability.
- If tests fail, fix ZKTeco-related failures first. For unrelated failures, capture them and continue only with clear risk notes.

## Final Handoff Format

Return:

1. Research proof with links.
2. Files changed.
3. Tests run and pass/fail result.
4. Contract smoke result.
5. DB truth result: device row, employee `deviceEmpId`, `ZKTECO_EVENT` counts.
6. UI truth result.
7. Real bridge result: connected, DLL missing, COM missing, or no device reachable.
8. Attendance truth statement: whether any `Attendance`, timesheet, or payroll row was changed.

Best finish state:

- ZKTeco source exists under `vendor/zkteco-sdk`.
- Targeted ZKTeco test passes.
- Typecheck is either passing or unrelated failures are captured.
- `/api/zkteco/events` accepts a smoke payload.
- Saved event appears in `device_events` and UI when matching `Device` exists.
- The team knows exactly which truth row to fix next: device, employee `deviceEmpId`, SDK DLL/COM, or attendance applicator.
