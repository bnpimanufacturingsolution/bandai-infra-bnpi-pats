# Overnight ZKTeco Runtime Truth Prompt

You are working in:

```text
C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH
```

Do not assume ZKTeco truth. Verify repo, runtime, database, and visible device-management state before changing anything. Keep this run ZKTeco-only unless an HRIS shared contract directly blocks the ZKTeco proof.

## Verified Truth At Start

These facts were verified on 2026-06-19 local Asia/Manila time:

- Parent repo branch: `develop`.
- Parent remote: `https://github.com/hrisworkforcesystem-coder/bandai-infra.git`.
- ZKTeco bridge submodule: `vendor/zkteco-sdk`.
- ZKTeco bridge remote: `https://github.com/ernestdodz/ZKTECO.git`.
- ZKTeco bridge commit with configurable env support: `5a0fad73e607b2f2c59a239242edab8193bb8e59`.
- ZKTeco bridge commit with Windows Dockerfile: `bf2d09e0d875648881a7ba20608fd56c319967b3`.
- Running Docker engine mode was Linux, so the Windows-container bridge was not running.
- `hris-api` was healthy on `http://localhost:3001/health`.
- `hris-app` was healthy on `http://localhost:3000/health`.
- Hyper-V PowerShell inspection from the non-admin shell failed with authorization errors. Use an elevated PowerShell session for VM-level proof.

## Current ZKTeco Contract Truth

HRIS API:

- Public bridge endpoint: `POST /api/zkteco/events`.
- Also accepts: `POST /api/zkteco/callback`.
- Router: `hris-api/app/zkteco/zkteco.router.ts`.
- Controller: `hris-api/app/zkteco/zkteco.controller.ts`.
- Contract helper: `hris-api/helper/zkteco-event-contract.helper.ts`.
- Contract test: `hris-api/tests/zkteco-event-contract.helper.spec.ts`.
- Device matching uses `Device.address` plus `Device.port`.
- Employee matching uses `employees.deviceEmpId`.
- Saved source must be `ZKTECO_EVENT`.
- Current endpoint saves `device_events` evidence only. It must not mutate `Attendance`, timesheets, or payroll unless a separate tested attendance applicator is deliberately built.

ZKTeco bridge:

- Bridge entrypoint: `vendor/zkteco-sdk/Program.cs`.
- Project file: `vendor/zkteco-sdk/ZKTecoStandalone.csproj`.
- Run script: `vendor/zkteco-sdk/Run-Monitor.ps1`.
- Windows Dockerfile: `vendor/zkteco-sdk/Dockerfile.windows`.
- Uses `RegEvent` and `OnAttTransactionEx`.
- Posts JSON with `device`, `attendance`, and `eventType` fields to `ZKTECO_WEBHOOK_URL`.

Configurable bridge environment:

```text
ZKTECO_DEVICE_IPS=10.184.38.10,10.184.38.234,10.184.38.235,10.184.38.9
ZKTECO_DEVICE_PORT=4370
ZKTECO_WEBHOOK_URL=http://localhost:3001/api/zkteco/events
ZKTECO_CONNECT_PASSWORD=0
ZKTECO_MACHINE_NUMBER=1
ZKTECO_SYNC_FINGERPRINT_TEMPLATES=false
```

Use `http://host.docker.internal:3001/api/zkteco/events` when the bridge is running inside a Windows container and HRIS API is on the host.

## Runtime Database Truth To Verify

The local runtime DB is `hris-postgres`, database `hris`, user `postgres`.

Run:

```powershell
@'
select enumlabel
from pg_enum
where enumtypid = '"DeviceEventSource"'::regtype
order by enumsortorder;

select id, name, address, port, protocol, access, config, "organizationId", "isDeleted"
from "Device"
where address in ('10.184.38.10','10.184.38.234','10.184.38.235','10.184.38.9')
order by address;

select source, status, count(*)
from device_events
group by source,status
order by source,status;

select id, "employeeId", "deviceEmpId", "organizationId", "isDeleted", "updatedAt"
from employees
where "deviceEmpId" is not null and "isDeleted" = false
order by "updatedAt" desc
limit 50;
'@ | docker exec -i hris-postgres psql -U postgres -d hris
```

Expected minimum truth:

- `DeviceEventSource` includes `ZKTECO_EVENT`.
- Four live `Device` rows exist:
  - `10.184.38.10:4370`
  - `10.184.38.234:4370`
  - `10.184.38.235:4370`
  - `10.184.38.9:4370`
- Each row uses `protocol = tcp`, `access = {}`, and `config.vendor = ZKTeco`.
- `device_events` may contain `ZKTECO_EVENT` rows.
- If no employee has `deviceEmpId = 1`, smoke result should be `employee_not_found`, not `device_not_found`.

If the enum is missing in the running DB, run:

```powershell
@'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum WHERE enumtypid = '"DeviceEventSource"'::regtype AND enumlabel = 'ZKTECO_EVENT'
  ) THEN
    ALTER TYPE "DeviceEventSource" ADD VALUE 'ZKTECO_EVENT';
  END IF;
END $$;
'@ | docker exec -i hris-postgres psql -U postgres -d hris
```

If device rows are missing, seed them through `hris-api/prisma/seeds/deviceSeeder.ts` or apply this idempotent local repair:

```powershell
@'
with org as (
  select id as organization_id from organizations order by "createdAt" asc limit 1
), desired(address, name) as (
  values
    ('10.184.38.10', 'ZKTeco Device 10.184.38.10'),
    ('10.184.38.234', 'ZKTeco Device 10.184.38.234'),
    ('10.184.38.235', 'ZKTeco Device 10.184.38.235'),
    ('10.184.38.9', 'ZKTeco Device 10.184.38.9')
)
insert into "Device" (id, "organizationId", name, address, port, protocol, access, config, "createdAt", "updatedAt", "isDeleted")
select
  'zkteco-' || replace(d.address, '.', '-'),
  org.organization_id,
  d.name,
  d.address,
  4370,
  'tcp'::"Protocol",
  '{}'::jsonb,
  jsonb_build_object('vendor', 'ZKTeco', 'source', 'vendor/zkteco-sdk', 'webhookPath', '/api/zkteco/events'),
  now(),
  now(),
  false
from desired d
cross join org
on conflict ("organizationId", address, port) do update set
  name = excluded.name,
  protocol = excluded.protocol,
  access = excluded.access,
  config = excluded.config,
  "isDeleted" = false,
  "updatedAt" = now();
'@ | docker exec -i hris-postgres psql -U postgres -d hris
```

## Required Checks

Start with:

```powershell
git status --short --branch
git submodule status
git -C vendor/zkteco-sdk status --short --branch
rg -n "zkteco|ZKTECO|deviceEmpId|DeviceEvent|device_events|10\.184\.38|4370|api/zkteco/events" hris-api hris-app appliance scripts docs vendor/zkteco-sdk
```

Verify compose and services:

```powershell
docker info --format '{{.OSType}} {{.OperatingSystem}}'
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
docker compose -f .\appliance\docker-compose.yml config --quiet
docker compose -f .\appliance\docker-compose.yml --profile zkteco config --quiet
Invoke-RestMethod http://localhost:3001/health
Invoke-RestMethod http://localhost:3000/health
```

Run focused tests:

```powershell
cd .\hris-api
npx tsx node_modules/mocha/bin/mocha --no-config tests/zkteco-event-contract.helper.spec.ts
npm run typecheck
cd ..
```

Known typecheck residual risk as of the verified run:

- `middleware/apiActivityLogging.ts(140,24)`: `AuthRequest.userName` missing.
- `middleware/apiActivityLogging.ts(197,6)`: shorthand `organizationId` has no value in scope.

Do not hide those. Fix them only if the user asks or they block a ZKTeco change you make.

Run bridge build/static proof:

```powershell
Test-Path .\vendor\zkteco-sdk\Program.cs
Test-Path .\vendor\zkteco-sdk\ZKTecoStandalone.csproj
Test-Path .\vendor\zkteco-sdk\Build-Project.ps1
Test-Path .\vendor\zkteco-sdk\Run-Monitor.ps1
Test-Path .\vendor\zkteco-sdk\Dockerfile.windows
rg -n "OnAttTransactionEx|RegEvent|ZKTECO_WEBHOOK_URL|ZKTECO_DEVICE_IPS|api/zkteco/events|HttpClient|PostAsync" .\vendor\zkteco-sdk
dotnet build .\vendor\zkteco-sdk\ZKTecoStandalone.csproj --no-incremental -p:Configuration=Debug -p:Platform=x86 -v:minimal
```

Run contract smoke:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-zkteco-bridge.ps1 -ContractOnly -DeviceIp 10.184.38.10 -DevicePort 4370 -EnrollNumber 1
```

Interpretation:

- `device_not_found`: device rows are missing or wrong.
- `employee_not_found`: device truth is correct; enroll number needs an employee `deviceEmpId`.
- `matched = true`: device and employee truth align.
- `duplicate = true`: dedupe works.

## VM Truth Check

Run these from elevated PowerShell because non-admin Hyper-V access was denied:

```powershell
Get-VM | Select-Object Name,State,Status,Generation,Version,ProcessorCount,MemoryAssigned,Uptime | Format-Table -AutoSize
Get-VMNetworkAdapter -VMName * | Select-Object VMName,Name,SwitchName,MacAddress,Status,IPAddresses | Format-List
```

Then verify the VM or host bridge uses the same truth:

```powershell
$env:ZKTECO_DEVICE_IPS="10.184.38.10,10.184.38.234,10.184.38.235,10.184.38.9"
$env:ZKTECO_DEVICE_PORT="4370"
$env:ZKTECO_WEBHOOK_URL="http://localhost:3001/api/zkteco/events"
$env:ZKTECO_CONNECT_PASSWORD="0"
.\vendor\zkteco-sdk\Build-Project.ps1 -Configuration Debug -Platform x86
.\vendor\zkteco-sdk\Run-Monitor.ps1 -NoBuild
```

Acceptance:

- The bridge logs those four IPs and port 4370.
- Each reachable device logs connected and registered events.
- Any posted punch creates or reuses a `device_events` row with `source = ZKTECO_EVENT`.
- Device management saved-events view can show it at:

```text
http://localhost:3000/admin/devices/events?view=saved&source=ZKTECO_EVENT
```

## Final Handoff

Return:

1. Repo/submodule commit truth.
2. Runtime service health.
3. VM truth or exact permission blocker.
4. Device rows present/missing.
5. `DeviceEventSource` enum truth.
6. Contract smoke response.
7. `device_events` counts and latest saved row.
8. Employee `deviceEmpId` truth and the next enroll number to map.
9. Whether attendance/timesheet/payroll rows changed. Expected answer: no.
