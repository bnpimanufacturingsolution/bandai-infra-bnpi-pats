# Hikvision Device Events realtime contract

Last updated: 2026-08-17

## Goal

When services are up, a physical ACS event (and any successful callback save) must appear on the admin Device Events page **without hard refresh**, for both **All devices** and **single-device** filters.

## Planes (do not conflate)

| Plane | Meaning | Green signal |
|---|---|---|
| **Transport** | Device TCP 80/8000 reachable from VM | Port open |
| **Listener armed** | HCNetSDK login + alarm channel | systemd active + arm logs |
| **Callback save** | POST `/api/hikvision/callback` → `DeviceEvent` | API 200 + DB row |
| **Socket realtime** | `device-event:saved` to correct rooms | FE row or refetch |
| **Person match** | plain `employeeNo` + HRIS link | Not always available on major=3 |

Saved Events ledger is **independent** of listener readiness. Historical rows stay visible while armed/quiet.

Saved **Device event details** is **independent** of the current table page.
`action=view-event&id=` loads `GET /api/device/events/item/:eventId`. Socket
prepend can make a new row clickable on a stale `page=`; a reload must still
open that id. Contract: `docs/00-product/DEVICE-EVENTS-SAVED-EVENT-DEEPLINK.md`.

## FE join contract

- **All devices:** join only `device-events:org:{organizationId}`
- **One device:** join org room + `device-events:device:{deviceId}`
- Never require intersection of both rooms for All-devices viewers

## BE emit contract

- Emit **union** fan-out:
  - `io.to(orgRoom).emit(...)`
  - `io.to(deviceRoom).emit(...)` when deviceId present
- **Forbidden:** chained `.to(org).to(device)` (Socket.IO intersection)
- Payload **must** include at least: `eventId`, `organizationId`, `deviceId`, `status`, `source`, `emittedAt`
- Payload **should** include slim `event` (`id` + person/time fields) so FE can prepend without HTTP refetch

## Producer paths

| Path | Role | Realtime? |
|---|---|---|
| systemd `project-truth-hikvision-hot-reload-listener` | Primary ACS alarms | Yes (callback → socket) |
| DEV `hris-hikvision-watcher` ACS pull | Gap fill only | Yes if POST hits API with `io` |
| Admin Sync / import | Operator | Yes on save |

PROD/UAT intentionally have **no** K3s watcher. Realtime there depends on the HCNetSDK listener + callback.

## Watcher hard rules

- `--all-hikvision` must **skip** devices with empty `access` username/password
- Log structured `hikvision_audit_devices_skipped` for observability
- Ghost rows (no creds) should be `isDeleted=true`, not left active

## Empty person is not a broken listener

Major=3 panel ops often arrive with empty `employeeNo`. UI shows **Unknown person / No person id**. That is wire truth until multipass identity enrich is wired. Major=5 attendance taps usually carry plain person id.

## Startup all-green checklist

1. API `/health` 200 (env)
2. Listener unit `active (running)`
3. No watcher loop on `missing access credentials` (last 15m)
4. Zero active Hikvision devices with empty access
5. Unit tests: `device event realtime helper` green
6. Optional: one major-5 tap proves socket + person

## Code owners

- Emit: `hris-api/helper/device-event-realtime.helper.ts`
- Join: `hris-api/index.ts` (`join:device-events`)
- FE: `hris-app/app/routes/admin/devices/events.tsx`
- Watcher audit: `hris-api/scripts/audit-hikvision-device-events.ts`
- Listener: `project-truth-hikvision-hot-reload-listener.service`
