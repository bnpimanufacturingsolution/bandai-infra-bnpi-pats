# Overnight ZKTeco Project Truth Bridge Prompt

Use this for a ZKTeco-only agent run. The authoritative bridge runtime is the Linux container inside the Project Truth VM.

## Mission

Prove the Project Truth ZKTeco path end to end:

1. `project-truth-zkteco-bridge` runs in the VM.
2. The bridge connects to configured ZKTeco devices on TCP `4370`.
3. The bridge posts attendance payloads to `POST /api/zkteco/events`.
4. HRIS stores `device_events` rows with `source = ZKTECO_EVENT`.
5. Admin > Devices shows VM bridge status and latest saved event.
6. Attendance, timesheets, and payroll are not mutated by this bridge.

## Source Truth

- Bridge source: `appliance/zkteco-bridge`.
- Bridge Dockerfile: `appliance/zkteco-bridge/Dockerfile`.
- Bridge runtime: `project-truth-zkteco-bridge`.
- HRIS API route: `hris-api/app/zkteco/zkteco.router.ts`.
- HRIS controller: `hris-api/app/zkteco/zkteco.controller.ts`.
- Contract helper: `hris-api/helper/zkteco-event-contract.helper.ts`.
- Contract tests:
  - `hris-api/tests/zkteco-event-contract.helper.spec.ts`
  - `hris-api/tests/device-health-zkteco.spec.ts`

## Bridge Payload Shape

```json
{
  "device": { "type": "ZKTeco", "ip": "10.184.38.10", "port": 4370 },
  "attendance": {
    "enrollNumber": "1",
    "userName": "",
    "timestamp": "2026-06-18T22:27:26.000Z",
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

## Required Checks

```powershell
git status --short --branch
rg -n "zkteco|ZKTECO|deviceEmpId|DeviceEvent|device_events|4370|4371|api/zkteco/events" hris-api hris-app appliance scripts docs
docker compose -f .\appliance\docker-compose.yml config --quiet
docker compose -f .\appliance\docker-compose.yml up -d --build zkteco-bridge
Invoke-RestMethod http://localhost:4371/status
```

Run focused tests:

```powershell
cd .\hris-api
npx tsx node_modules/mocha/bin/mocha --no-config tests/zkteco-event-contract.helper.spec.ts tests/device-health-zkteco.spec.ts
npm run typecheck
cd ..
```

Run contract smoke:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-zkteco-bridge.ps1 -ContractOnly -DeviceIp 10.184.38.10 -DevicePort 4370 -EnrollNumber 1
```

## Acceptance

- `docker ps` shows `project-truth-zkteco-bridge`.
- `/status` shows configured device count, connected device count, and latest event time.
- Device Details modal shows `VM ZKTeco bridge`, `Device port`, and `Latest saved event`.
- Saved events are visible at `/admin/devices/events?view=saved&source=ZKTECO_EVENT`.
- No ZKTeco UI or Project Truth summary path mentions any Hikvision listener.
