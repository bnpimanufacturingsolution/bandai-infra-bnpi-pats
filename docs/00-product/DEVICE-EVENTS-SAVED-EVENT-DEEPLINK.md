# Device Events — saved event details deeplink

Last reviewed: 2026-08-17  
Status: `CONFIRMED_CODE_AND_LIVE_LOCAL_API`

Canonical product contract for opening **Device event details** from a URL.
The details modal is **not** allowed to depend on the current table page.

Architecture brief: `.wwg/wiki/05-architecture/device-events-saved-event-deeplink.md`

## One-line truth

`action=view-event&id=<DeviceEvent.id>` must load that saved row by id.
`page=` is only the table’s current page. It is not the event’s identity.

## Operator URL

Both admin routes render the same page module (`bnpi-pats-app/app/routes/admin/devices/events.tsx`):

```text
/admin/configuration/devices/events?deviceId=<deviceId>&page=<n>&action=view-event&id=<eventId>
/admin/devices/events?deviceId=<deviceId>&page=<n>&action=view-event&id=<eventId>
```

| Query | Owns | Notes |
|---|---|---|
| `id` | Which saved `DeviceEvent` to open | Required for the modal. This is the Prisma CUID. |
| `action=view-event` | Open **Device event details** | Modal is open whenever this action is set. |
| `page` | Saved-events **table** page only | Default page size is 10. Newest-first (`sort=receivedAt`, `order=desc`). |
| `deviceId` | Table filter | Must not hide the modal fetch. |
| `limit`, `window`, category, query | Table filters | Must not hide the modal fetch. |

**View** on a row only writes `action` and `id`. It does **not** rewrite `page`.
A copied URL can therefore keep a stale page (for example `page=116`) after new
listener rows shift `receivedAt desc` paging.

## Planes (do not mix)

| Plane | Record | How to load |
|---|---|---|
| Saved ledger table | Current page of `DeviceEvent` rows | `GET /api/device/events?page=&limit=&deviceId=&summaryScope=page` |
| Socket overlay | Newest live saves prepended onto whatever page is open | `prependRealtimeSavedRows` — same-tab only |
| Details modal | One saved `DeviceEvent` | `GET /api/device/events/item/:eventId` |

Hard ban: `rows.find(row => row.id === id)` as the **only** source for the modal.

## Why `page=116` + a real id used to fail

Proven with live DEV row `cmsr688py002xvxwwttxhdsal` (Device D TAP, person `10`):

| Request | Result |
|---|---|
| Table `page=116&limit=10&deviceId=cmripjwkw00ffl0013lfxcbxw` | 10 other ids. Target **absent**. |
| `GET /api/device/events/item/cmsr688py002xvxwwttxhdsal` | **1 row** — `ATTENDANCE` / `TAP` / person `10` |

The old modal looked only at the current table page, then showed
“This event is not in the current table page.”

That copy is **banned**. The modal must fetch by id.

Typical stale-page paths:

1. Operator is parked on page 116. A new tap arrives and is socket-prepended.
   **View** writes `id=` and leaves `page=116`. Reload has no socket overlay.
2. New rows shift newest-first paging. Yesterday’s page 116 is no longer that event.
3. `localhost:3001` is down. The table can still show cached rows; the modal fetch fails.

## API

### Details (required for the modal)

```text
GET /api/device/events/item/:eventId
```

| Rule | Value |
|---|---|
| Auth | Same admin Device Events session (`organizationId` required) |
| Lookup | `deviceEvent.findFirst({ id, organizationId })` |
| Cache | **None** (do not put this on the 15s list cache) |
| Missing | HTTP 404 `Device event not found` |
| Success | `{ events: [row], pagination: { page: 1, limit: 1, total: 1 } }` |
| Route order | Nested under `/events/…` so Express never treats it as `GET /device/:id` |

Client: `devicesService.getDeviceEventById` → `useDeviceEvent(id)`.

### List (table only)

```text
GET /api/device/events?eventId=<id>
```

When `eventId` is set, `getEvents` forces `page=1`, ignores list filters, and
adds `de.id = eventId`. This is a **fallback**, not the modal’s primary path.
The list route is cached (15s) and shares the Prisma pool with the table query.

## UI states

| Condition | Modal shows |
|---|---|
| Row is already on the current table page | Details immediately (page row wins) |
| Fetch in flight | `Loading saved event…` |
| Fetch HTTP/network error | `Could not load this saved event.` + error message |
| 404 / empty after fetch | `This saved event was not found.` |
| Resolver | `resolveActiveSavedDeviceEvent` — page row, else fetched row **only if** `fetched.id === eventId` |

## Local runtime requirement

The Vite app on `http://localhost:5175` calls `http://localhost:3001/api`.
A healthy table cache is **not** proof the API is up. Before diagnosing a
deeplink as “event deleted,” hit `/health` and `GET /api/device/events/item/:id`.

## Proof

| Kind | Path |
|---|---|
| Live compare (page 116 miss vs by-id hit) | `.runtime/device-event-deeplink-20260817/` |
| API contract | `bnpi-pats-api/tests/device-events-api-contract.spec.ts` |
| UI resolver | `bnpi-pats-app/app/lib/device-events-realtime-ui.test.ts` |
| Page contract | `bnpi-pats-app/app/lib/device-events-page-contract.test.ts` |

## Code map

| Layer | Symbol |
|---|---|
| Route | `bnpi-pats-api/app/device/device.router.ts` `GET /events/item/:eventId` |
| Handler | `getEventById` in `bnpi-pats-api/app/device/device.controller.ts` |
| List fallback | `getEvents` `req.query.eventId` |
| Client | `bnpi-pats-app/app/services/devices.service.ts` `getDeviceEventById` |
| Hook | `bnpi-pats-app/app/lib/hooks/useDevices.ts` `useDeviceEvent` |
| Page | `bnpi-pats-app/app/routes/admin/devices/events.tsx` |
| Resolver | `resolveActiveSavedDeviceEvent` |
