# Overnight ZKTeco Project Truth Bridge Prompt

Use this as the ordered run prompt for bringing ZKTeco punches into Project Truth HRIS without creating a second attendance truth model.

## Objective

Bridge `ernestdodz/ZKTECO` into Project Truth so ZKTeco attendance events are ingested through `POST /api/zkteco/events`, stored in `DeviceEvent` with source `ZKTECO_EVENT`, and visible in the existing Admin > Devices > Device attendance saved-events journey.

## Architecture Truth

- Current verified Docker engine mode on this workstation is Linux Docker Desktop, so the Linux HRIS VM stack can build and run here.
- The ZKTeco SDK depends on .NET Framework 4.8 and `zkemkeeper.dll`/COM. Treat it as a Windows bridge, not a Linux service.
- Docker Desktop Linux containers run inside a lightweight Linux VM and published ports are proxied from the host into that VM. This is why `localhost:3001` reaches the Linux HRIS API from the Windows host.
- Docker Desktop documents `host.docker.internal` as the special name containers can use to reach host services. That is why the optional Windows-container bridge points to `http://host.docker.internal:3001/api/zkteco/events`.
- Microsoft documents that Linux containers on Windows require Docker to target the Linux daemon. The inverse is true for Windows containers: switch Docker Desktop to Windows containers before using the `zkteco` Windows-container profile.

Source references:
- https://docs.docker.com/desktop/features/networking/
- https://docs.docker.com/desktop/features/networking/networking-how-tos/
- https://learn.microsoft.com/en-us/virtualization/windowscontainers/deploy-containers/set-up-linux-containers

## Verified Before Overnight

These checks were already run successfully on this workstation:

```powershell
docker info --format '{{.OSType}} {{.OperatingSystem}}'
# linux Docker Desktop

docker compose -f .\appliance\docker-compose.yml config --quiet
docker compose -f .\appliance\docker-compose.yml --profile zkteco config --quiet
docker compose -f .\appliance\docker-compose.yml build hris-api
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-zkteco-bridge.ps1 -SmokePost -DeviceIp 10.184.38.10 -EnrollNumber 1
```

Result:
- HRIS API image builds with the ZKTeco API module.
- Compose default Linux stack is valid.
- Compose `zkteco` profile is valid.
- Windows ZKTeco image build is not attempted while Docker is in Linux mode.
- `POST http://localhost:3001/api/zkteco/events` returns HTTP 200 without bearer auth after the rebuilt `hris-api` container is recreated.
- Current smoke result is `device_not_found` for `10.184.38.10:4370`, which means the endpoint is bridged and the next required truth row is an HRIS `Device` matching that IP/port.

Verified running containers:

```text
hris-api   hris-api-local:develop   healthy   0.0.0.0:3001->3001
hris-app   hris-app-local:develop   healthy   0.0.0.0:3000->3000
postgres   postgres:16-alpine       healthy   0.0.0.0:15432->5432
```

## Ordered Overnight Run

1. Start from a clean terminal at the repository root.

   ```powershell
   cd C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH
   git status --short
   ```

2. Confirm the SDK bridge source exists.

   ```powershell
   Test-Path .\vendor\zkteco-sdk\Program.cs
   Test-Path .\vendor\zkteco-sdk\Interop.zkemkeeper.dll
   ```

3. Start Project Truth HRIS Linux services.

   ```powershell
   docker compose -f .\appliance\docker-compose.yml up -d --build postgres hris-api-db-init hris-api hris-app
   ```

4. Verify API and app health.

   ```powershell
   Invoke-RestMethod http://localhost:3001/health
   Invoke-RestMethod http://localhost:3000/health
   ```

5. Push the Prisma enum/table shape before ingesting ZKTeco events.

   ```powershell
   docker compose -f .\appliance\docker-compose.yml run --rm hris-api-db-init
   ```

6. Create or verify HRIS device records for each ZKTeco terminal in Admin > Configuration > Devices.

   Required fields:
   - `address`: ZKTeco terminal IP, for example `10.184.38.10`
   - `port`: `4370`
   - `protocol`: `tcp`
   - `access`: `{}` unless credentials are later needed

7. Verify employees have `deviceEmpId` values matching ZKTeco enroll numbers.

   Use Admin > Devices > Enroll or the existing enrollment import so user metadata and `Employee.deviceEmpId` stay in sync.

8. Run the ZKTeco bridge on the Windows host first.

   ```powershell
   $env:ZKTECO_DEVICE_IPS="10.184.38.10,10.184.38.234,10.184.38.235,10.184.38.9"
   $env:ZKTECO_WEBHOOK_URL="http://localhost:3001/api/zkteco/events"
   .\vendor\zkteco-sdk\Build-Project.ps1 -Configuration Debug -Platform x86
   .\vendor\zkteco-sdk\Run-Monitor.ps1 -NoBuild
   ```

9. Optional Windows Docker bridge mode.

   Only use this when Docker Desktop is switched to Windows containers. The current HRIS stack is Linux-based, so do not expect this to run at the same time as the Linux compose stack on a single Docker Desktop engine.

   ```powershell
   $env:ZKTECO_DEVICE_IPS="10.184.38.10,10.184.38.234,10.184.38.235,10.184.38.9"
   $env:ZKTECO_WEBHOOK_URL="http://host.docker.internal:3001/api/zkteco/events"
   docker compose -f .\appliance\docker-compose.yml --profile zkteco up -d --build zkteco-bridge
   ```

10. Smoke test ingestion without waiting for a live punch.

    Replace `deviceIP` and `enrollNumber` with a real configured device and employee enrollment number.

    ```powershell
    $body = @{
      device = @{ type = "ZKTeco"; ip = "10.184.38.10"; port = 4370 }
      attendance = @{
        enrollNumber = "1"
        userName = "Smoke Test"
        timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
        verifyMethod = 1
        verifyMethodName = "Fingerprint"
        attState = 0
        attStateName = "Check In"
        isValid = $true
        workCode = 0
      }
      eventType = "AttendanceTransaction"
    } | ConvertTo-Json -Depth 6

    Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/zkteco/events -ContentType "application/json" -Body $body
    ```

11. Verify the event appears in HRIS.

    Open:

    ```text
    http://localhost:3000/admin/devices/events?view=saved&source=ZKTECO_EVENT
    ```

12. Acceptance checks.

    - A row appears under saved device attendance.
    - Save path shows `ZKTeco bridge`.
    - Matched employees show employee name/no.
    - Unmatched enroll numbers show `Needs match`.
    - Repeated webhook posts reuse the existing dedupe key instead of creating duplicate rows.

13. Best finish state.

    Stop and call it finished when all of these are true:

    - Docker Desktop remains in Linux mode for HRIS API/app/Postgres.
    - `hris-api` and `hris-app` health endpoints return healthy responses.
    - The ZKTeco bridge runs as a Windows host process with `ZKTECO_WEBHOOK_URL=http://localhost:3001/api/zkteco/events`.
    - At least one smoke event or real punch appears at `/admin/devices/events?view=saved&source=ZKTECO_EVENT`.
    - A duplicate post of the same smoke event returns duplicate/reused status rather than creating a second row.
    - If a real employee enroll number exists in `Employee.deviceEmpId`, the row becomes `Matched`.
    - If an enroll number is unknown, the row becomes `Needs match`, proving the exception path is visible instead of silent.

14. Stop early and fix before continuing if any of these happen:

    - API health is down.
    - `POST /api/zkteco/events` returns HTTP 500.
    - The bridge log shows repeated `[Webhook] Failed`.
    - No HRIS `Device` matches the ZKTeco `device.ip` and `port`.
    - Docker Desktop has been switched to Windows containers while the Linux HRIS stack is expected to stay running.

15. Overnight watch.

    Keep these visible:

    ```powershell
    docker logs -f hris-api
    Get-Content .\vendor\zkteco-sdk\bin\Debug\net48\logs\*.log -Wait
    ```

16. Morning handoff.

    Capture:
    - Count of `ZKTECO_EVENT` rows in Admin > Devices > Device attendance.
    - List of unmatched enroll numbers.
    - Any bridge log lines containing `[Webhook] Failed` or SDK connection errors.
    - Confirm whether the bridge ran as host process or Windows Docker profile.
