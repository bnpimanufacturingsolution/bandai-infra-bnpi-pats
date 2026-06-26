# ZKTeco Runtime Truth

Project Truth must not show Hikvision health terms for ZKTeco devices.

For a ZKTeco TCP device such as `10.184.38.9:4370`, the truthful contract is:

1. The physical terminal is reachable on TCP port `4370`.
2. A configured ZKTeco bridge exposes `GET /health` and `GET /status`.
3. HRIS API reads that bridge status through `ZKTECO_BRIDGE_STATUS_URL`.
4. HRIS API accepts real bridge attendance posts at `/api/zkteco/events`.
5. The UI shows ZKTeco bridge health and saved HRIS events.

The UI must not show these labels for ZKTeco rows:

- `AlarmDemo`
- `Device API`
- `ISAPI`
- `SDK 4370`

Those labels belong to Hikvision-only paths.

## Bridge Options

### Linux VM Bridge

Use `appliance/zkteco-bridge` when the bridge is running in the Ubuntu Project Truth VM. It uses a Node socket library against ZKTeco TCP devices and exposes the same `/health` and `/status` contract.

### Windows SDK Bridge

Use `appliance/zkteco-standalone-sdk` when using the ZKTeco Standalone SDK (`Interop.zkemkeeper.dll` and `zkemkeeper.dll`). This bridge targets `.NET Framework 4.8`, x86, and Windows COM registration.

It must run on a Windows host or Windows container runtime. It cannot run as a normal Linux Docker container inside the Ubuntu VM.

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
