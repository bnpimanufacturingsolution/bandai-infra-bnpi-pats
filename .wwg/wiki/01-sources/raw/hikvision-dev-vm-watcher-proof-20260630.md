# Hikvision DEV VM Watcher Proof - 2026-06-30

## Scope

DEV physical Hikvision ACS-pull watcher proof for Project Truth BNPI PATS.

## Runtime Evidence

- VM: `project-truth-node`
- VM LAN IP: `192.168.254.148`
- Namespace: `dev`
- Deployment: `bnpi-pats-hikvision-watcher`
- Pod observed: `bnpi-pats-hikvision-watcher-86d6549-nmm8m`
- Pod status: `READY 1/1`, `Running`, `RESTARTS 0`
- Device: `Main Entrance Device`
- BNPI PATS device ID: `cmqquro2g002em73cdp74rx0q`
- Device address: `192.168.254.181:80`
- Source: `HIKVISION_CALLBACK`

## Watcher Report

The watcher ran `audit-hikvision-device-events.ts --apply` from the
`bnpi-pats-api-db-init:develop` image and reported:

- `live.total=10`
- `live.withEmployeeNo=5`
- `live.withoutEmployeeNo=5`
- `saved.matchingAfterApply=5`
- `gap.missingWithEmployeeNo=0`

Events without `employeeNo` were left unsaved as punches.

## Saved Event Evidence

Public DEV API returned newly saved rows for employee no. `1` with:

- `receivedAt=2026-06-30T13:48:29.499Z`,
  `eventTime=2026-06-30T13:37:05.000Z`
- `receivedAt=2026-06-30T13:48:29.466Z`,
  `eventTime=2026-06-30T13:37:30.000Z`
- `receivedAt=2026-06-30T13:48:29.400Z`,
  `eventTime=2026-06-30T13:39:29.000Z`

All were `HIKVISION_CALLBACK` and `UNMATCHED`.

## Browser Evidence

Headless browser verification opened:

```text
https://dev.bnpi-pats.tech/admin/configuration/devices/events?view=saved&deviceId=cmqquro2g002em73cdp74rx0q&source=HIKVISION_CALLBACK&sort=receivedAt&order=desc
```

The page rendered fresh saved punches for `Main Entrance Device` with address
`192.168.254.181`, employee no. `1`, and save path `Device callback`.

Screenshot:

```text
.runtime/browser-evidence/screenshots/hikvision-dev-watcher-auth-boundary.png
```

## Boundary

This proves DEV VM/K3s-managed ACS-pull watcher startup and saved-event
ingestion for employee-bearing physical Hikvision events. It does not prove
spontaneous device HTTP-host push, Windows HCNetSDK AlarmDemo as a managed
service, employee matching for employee no. `1`, attendance creation in DEV, or
PROD/UAT parity.
