# Overnight ZKTeco Runtime Truth Prompt

Use this for ZKTeco-only verification in Project Truth.

## Current Runtime Truth

- ZKTeco uses a configured bridge status endpoint. The Linux VM bridge is `project-truth-zkteco-bridge`; the Windows Standalone SDK sidecar lives in `appliance/zkteco-standalone-sdk`.
- Bridge source: `appliance/zkteco-bridge`.
- Bridge image: `project-truth-zkteco-bridge:develop`.
- Bridge status endpoint: `http://<vm-lan-ip>:4371/status`.
- Bridge health endpoint: `http://<vm-lan-ip>:4371/health`.
- HRIS ingest endpoint: `POST /api/zkteco/events`.
- The Windows COM bridge under `vendor/zkteco-sdk` is not the Project Truth runtime path.

## Required Environment

```text
ZKTECO_DEVICE_IPS=10.184.38.10,10.184.38.234,10.184.38.235,10.184.38.9
ZKTECO_DEVICE_PORT=4370
ZKTECO_WEBHOOK_URL=http://hris-api:3001/api/zkteco/events
ZKTECO_STATUS_PORT=4371
ZKTECO_POLL_INTERVAL_SECONDS=60
ZKTECO_BRIDGE_STATUS_URL=http://zkteco-bridge:4371/status
# or, for the Windows Standalone SDK sidecar:
# ZKTECO_BRIDGE_STATUS_URL=http://<windows-sidecar-ip>:4371/status
```

## Truth Checks

```powershell
docker compose -f .\appliance\docker-compose.yml config --quiet
docker compose -f .\appliance\docker-compose.yml up -d --build zkteco-bridge
Invoke-RestMethod http://localhost:4371/status
Invoke-RestMethod http://localhost:3001/health
Invoke-RestMethod http://localhost:3000/health
```

Database truth:

```powershell
@'
select id, name, address, port, protocol, access, config, "organizationId", "isDeleted"
from "Device"
where address in ('10.184.38.10','10.184.38.234','10.184.38.235','10.184.38.9')
order by address;

select source, status, count(*)
from device_events
group by source,status
order by source,status;
'@ | docker exec -i hris-postgres psql -U postgres -d hris
```

Expected minimum:

- Four ZKTeco device rows exist on TCP `4370`.
- Each row has `config.vendor = ZKTeco`.
- `DeviceEventSource` includes `ZKTECO_EVENT`.
- The bridge `/status` reports configured devices, connected devices, and latest event time.
- Admin > Devices > Details shows VM ZKTeco bridge proof, not Hikvision listener state.

## Tests

```powershell
cd .\hris-api
npx tsx node_modules/mocha/bin/mocha --no-config tests/zkteco-event-contract.helper.spec.ts tests/device-health-zkteco.spec.ts
npm run typecheck
cd ..
```

## Acceptance

- `project-truth-hris-status` shows `project-truth-zkteco-bridge` running.
- `project-truth-lan-summary --screen` shows ZKTeco bridge status.
- `/api/device/:id/health` returns `checks.zktecoBridge` and `checks.lastZktecoEvent` for ZKTeco devices.
- ZKTeco ingestion remains evidence-only and does not mutate Attendance, timesheets, or payroll.
