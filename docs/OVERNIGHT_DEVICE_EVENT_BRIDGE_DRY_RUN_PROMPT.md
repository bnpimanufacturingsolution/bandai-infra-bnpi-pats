# Overnight ZKTeco Event Contract Dry Run Prompt

Use this to prove ZKTeco event ingestion without touching attendance/payroll truth.

## Runtime Truth

- ZKTeco bridge runtime is the configured bridge status endpoint.
- Linux bridge source lives in `appliance/zkteco-bridge`.
- Windows Standalone SDK bridge source lives in `appliance/zkteco-standalone-sdk`.
- Bridge status is exposed at `GET /status` on port `4371`.
- HRIS event ingest remains `POST /api/zkteco/events`.

## Dry Run

```powershell
docker compose -f .\appliance\docker-compose.yml config --quiet
docker compose -f .\appliance\docker-compose.yml up -d --build zkteco-bridge
Invoke-RestMethod http://localhost:4371/status
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-zkteco-bridge.ps1 -ContractOnly -DeviceIp 10.184.38.10 -DevicePort 4370 -EnrollNumber 1
```

## Expected Result

- `device_not_found`: add or repair the HRIS `Device` row.
- `employee_not_found`: device matched; map the enroll number to `employees.deviceEmpId`.
- `matched = true`: device and employee truth align.
- `duplicate = true`: dedupe works.

## Acceptance

- `device_events.source = ZKTECO_EVENT`.
- Saved events show under `/admin/devices/events?view=saved&source=ZKTECO_EVENT`.
- ZKTeco remains evidence-only: no Attendance, timesheet, or payroll mutation in this dry run.
