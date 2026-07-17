# Regression Guardrail Catalog

## Purpose

Capture bugs, incidents, sign-off misses, and validation blind spots so future runs can catch them reliably.

## How to Use

Add an entry when a missed bug, incident, sign-off gap, repeated regression, or validation blind spot is discovered.

## Rules

- Not every regression updates product truth. Some regressions update sign-off workflow truth, testing truth, or operational guardrails only.
- Guardrails should be specific, repeatable, owned, and tied to validation.
- Markdown is the default guardrail catalog format. Add machine-readable representation only when the project has a clear consumer for it.
- Missed-by reasons and future guardrails should include evidence level when possible.

## Workflow

```txt
Incident / missed bug / sign-off gap discovered
  ->
Capture symptom
  ->
Capture missed-by reason
  ->
Define future guardrail
  ->
Record evidence paths
  ->
Update machine-readable catalog or catalog section
  ->
Refresh human workflow docs
  ->
Update wiki/context only if product truth changed
  ->
Run validation
```

## Entry Fields

| Field | Description |
|---|---|
| id | Stable guardrail identifier |
| date | Date discovered |
| area | Product, system, or workflow area |
| change_category | Related change category |
| symptom | What failed or was missed |
| missed_by_reason | Why existing checks missed it |
| future_guardrail | What should catch it next time |
| evidence_paths | Code, docs, logs, tests, or report paths |
| required_validation | Validation expected before signoff |
| owner | Responsible person or role |
| status | proposed, active, retired |

## Starter Catalog

| id | date | area | change_category | symptom | missed_by_reason | future_guardrail | evidence_paths | required_validation | owner | status |
|---|---|---|---|---|---|---|---|---|---|---|
| RG-20260717-DEVICEUSER-STALE-PROCESSING | 2026-07-17 | Device users / Sync Center | regression | Persisted processing Device-user sync status older than progress TTL reopened as live after app/dev-server startup | UI treated any processing snapshot as active without recent `updatedAt`/progress evidence | On startup/job lookup, mark processing jobs without recent progress as stale/failed and clear live badge/modal | `hris-app/app/routes/admin/devices/enroll.tsx`; `hris-api/app/device/device.controller.ts`; Playwright `admin-device-user-summary-toolbar.spec.ts`; API contract expire stale processing | focused Playwright + mocha contract + typecheck | hris-admin | active |
| RG-20260716-DEVICEEVENT-NOT-INVENTORY | 2026-07-16 | Device events | source-of-truth | Inventory/`DEVICE_CURRENT_STATE` was used to invent lifecycle history rows | Lifecycle rows created from current inventory instead of saved DeviceEvent evidence | DeviceEvent is the only saved event ledger; inventory never creates lifecycle history; cleanup + contract tests | `.wwg/reports/hikvision-device-events-sync-center-current-state-20260716.md`; device-events API/UI contracts | focused mocha/vitest + dry-run cleanup recount | hris-admin | active |
| RG-20260716-SYNC-LOGS-EVENT-FIRST | 2026-07-16 | Sync logs | product contract | Sync logs modal told inventory-first story (On device / In HRIS) instead of what will be added to Device Events | Preview lacked `eventRows[]` / dual-source builders | Event-first preview table with Ready source checks and contract/Playwright smoke | `helper/sync-logs-event-rows.helper.ts`; `GET /api/device/sync-preview`; `admin-device-sync-logs-truth.spec.ts` | mocha + vitest + Playwright headless smoke | hris-admin | active |
| RG-20260704-ZKTECO-PREVIEW-PERF | 2026-07-04 | ZKTeco sync preflight | performance | Full attendance history pulls blocked interactive preflight | Serial full-history reads on every device | Parallel probes, skip unreachable, use `read_sizes()` for counts, async/history separate | recommendation registry REC-20260704-ZKTECO-PREVIEW-PERF | bridge count mode + contract tests | hris-admin | active |

## Generated Governance Context
