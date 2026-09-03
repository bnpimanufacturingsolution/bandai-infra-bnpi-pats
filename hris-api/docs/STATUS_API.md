# Status API Guide

This document describes the status endpoints used for operational monitoring and FE status pages.

## Base Routes

These routes are mounted directly on the app (not under `config.baseApiPath`):

- `GET /status`
- `GET /status/modules`
- `GET /status/ui`
- `GET /status/incidents`
- `GET /status/incidents/:incidentKey`
- `GET /status/timeline`

## Architecture

Status data uses a hybrid model:

- Hot status snapshots: in-memory + Redis (`status:snapshots:v1`)
- Runtime incidents: in-memory + Redis (`status:incidents:v1`)
- Durable incident history: MongoDB via Prisma model `StatusIncident`

Only incident transitions are persisted to DB:

- Open incident when module transitions to non-operational
- Resolve incident when module transitions back to operational

## `GET /status` and `GET /status/modules`

Returns current system status JSON:

- overall status
- dependency health (`database`, `redis`)
- module statuses
- 24h and 7d uptime percentages
- recent incidents

Use this for summary cards and module table.

## `GET /status/ui`

Returns server-rendered HTML status page (auto-refresh every 30s).

Use this for quick operational viewing in browser, not for frontend app data binding.

## `GET /status/incidents`

Returns incident history (DB-first, in-memory fallback).

### Query Parameters

- `limit` number, optional, default `50`, min `1`, max `200`
- `moduleSlug` string, optional (e.g. `auth`, `attendance`, `payroll`)
- `isResolved` boolean string, optional (`true` or `false`)
- `from` ISO datetime, optional (filters by `startedAt >= from`)
- `to` ISO datetime, optional (filters by `startedAt <= to`)

### Example

```http
GET /status/incidents?limit=20&moduleSlug=auth&isResolved=false&from=2026-05-01T00:00:00.000Z&to=2026-05-13T23:59:59.999Z
```

## `GET /status/incidents/:incidentKey`

Returns one incident detail by `incidentKey`.

### Example

```http
GET /status/incidents/auth-1715600000000
```

## `GET /status/timeline`

Returns FE-friendly timeline bars with per-slot status, color, and date range.

### Query Parameters

- `moduleSlug` string, optional
- `from` ISO datetime, optional (default: now - 7 days)
- `to` ISO datetime, optional (default: now)
- `interval` optional: `day` (default) or `hour`

If `moduleSlug` is omitted, timeline status represents the worst status across all sampled modules per slot.

### Response Item Shape

- `startAt` ISO datetime
- `endAt` ISO datetime
- `status` one of:
  - `operational`
  - `degraded_performance`
  - `partial_outage`
  - `major_outage`
- `color` hex color for FE rendering
- `samples` number of samples used for that slot

### Example

```http
GET /status/timeline?moduleSlug=auth&from=2026-02-01T00:00:00.000Z&to=2026-05-13T23:59:59.999Z&interval=day
```

Example item:

```json
{
  "startAt": "2026-05-13T00:00:00.000Z",
  "endAt": "2026-05-13T23:59:59.999Z",
  "status": "degraded_performance",
  "color": "#f59e0b",
  "samples": 46
}
```

## FE Integration Recommendation

Use:

1. `GET /status` for top-level health + module summary
2. `GET /status/timeline` for colored bar history
3. `GET /status/incidents` for incident list/history panel
4. `GET /status/incidents/:incidentKey` for drill-down modal/page

Avoid using `/status/ui` as data source since it is HTML.
