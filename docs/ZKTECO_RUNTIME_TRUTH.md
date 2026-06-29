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

The fix is to deploy the updated app/API and configure a reachable bridge status URL. Host-local Docker health alone is not the Project Truth finish line.

## 2026-06-29 Device Probe Truth

For `10.184.38.234:4370` and `10.184.38.235:4370`, TCP was reachable during the current run, but the Windows SDK connect failed after three attempts with SDK error `-2`. Treat those devices as `TCP reachable, SDK not connected right now`; do not infer event counts from that state.
