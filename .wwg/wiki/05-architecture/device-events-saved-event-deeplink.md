---
type: architecture
status: active
mutability: medium
scope: device-events-saved-event-deeplink
last_reviewed: 2026-08-17
---

# Device Events saved-event details deeplink

Canonical long-form spec:

**`docs/00-product/DEVICE-EVENTS-SAVED-EVENT-DEEPLINK.md`**

## One-line truth

The **Device event details** modal loads a saved `DeviceEvent` **by id**.
The table `page=` query is display position only.

## Planes (do not mix)

| Plane | Load path |
|---|---|
| Table page | `GET /api/device/events?page=&limit=&deviceId=` |
| Live overlay | Socket prepend on the open page (same tab) |
| Details modal | `GET /api/device/events/item/:eventId` |

Do not resolve the modal from `rows.find` alone. Page numbers go stale as
newest-first rows arrive.

## Proof event

Live local: `cmsr688py002xvxwwttxhdsal` is `ATTENDANCE` / `TAP` / person `10`.
It was missing from Device D `page=116` and present on the item route.
