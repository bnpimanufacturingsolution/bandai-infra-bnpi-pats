# Current Task

## Status
done

## Summary
Device list/detail UX: show physical Device IP primary for reverse-tunneled panels; tunnel/runtime endpoint secondary. Do not change stored `address`/`port` used for API health/connectivity.

## Category
ui-ux

## Packages
- bandai-infra/hris-app
- Dual-app: **HR/emp-only (no counterpart)** — admin devices manage/enroll only

## Changes
- `app/lib/device-display-address.ts` — shared resolver: `config.physicalAddress` → name-embedded IPv4 → stored address; secondary `via reverse tunnel host:port`
- `app/lib/device-display-address.test.ts` — unit coverage for Import Target tunnel publish + loopback reverse-forward + fallbacks
- `app/routes/admin/devices/manage.tsx` — Device IP column + Connection/view modal; removed local partial helper
- `app/routes/admin/devices/manage.$id.tsx` — header Device IP + tunnel subtitle
- `app/routes/admin/devices/enroll.tsx` — Sync Center rows, pickers, merge tiles use display helper
- `app/routes/admin/devices/events.tsx` — sync device row address line uses same helper

## Display rules (CONFIRMED)
1. Primary **Device IP** = `config.physicalAddress` (+ `physicalPort` / `physicalHttpPort`) when present
2. Else IPv4 embedded in `name` (prefer parentheses, e.g. `Import Target A CSV (192.168.18.35)`)
3. Else stored `device.address`[:`port`]
4. When primary host ≠ runtime/tunnel host, show secondary: `via reverse tunnel {runtime}`
5. Runtime host = stored address when it differs from physical; else configured `hikvisionRuntimeAddress` / SDK runtime when it differs from physical
6. Stored address/port unchanged for API connectivity/health

## Truth delta
YES (CONFIRMED) — Operator UI must prefer physical panel IP over tunnel publish IP for reverse-tunneled device rows.

## Drift
NONE (docs via this task note; no broader project-truth rewrite required)

## Verification
- `npx vitest run app/lib/device-display-address.test.ts` — pass (6)
- Dual-app: single-app exception (admin devices; no emp counterpart)
