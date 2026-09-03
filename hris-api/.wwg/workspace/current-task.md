# Current Task

## Status
done

## Summary
DM3 WorkSharingSchedule upload for employee schedule assignments (DM3.2). Operators can upload period WorkSharingSchedule .xlsx from the migration page; API assigns embedded schedules and refreshes obligations.

## Category
feature / mixed

## Packages
- bandai-infra/hris-api
- bandai-infra/hris-app
- Dual-app: **HR/emp-only (no counterpart)**

## Changes
- `helper/bnpi-worksharing-schedule-import.helper.ts` — parse WorkSharingSchedule workbooks
- `app/migration/bnpi-worksharing-schedule-import.service.ts` — import + template ensure + assign + obligations
- `app/migration/migration.controller.ts` / `migration.router.ts` — `POST /api/migration/dm3/import-worksharing-schedule`
- `app/migration/bnpi-mass-upload-import.service.ts` — activity kind `worksharing-schedule`
- `tests/bnpi-worksharing-schedule-import.helper.spec.ts`
- Docs: `docs/dm-source-input-manifest.json`, `bandai-infra/docs/dm-migration-workflow.md`

## Truth delta
YES — WorkSharingSchedule is an operator-uploadable DM3.2 source (period window effective dates; Mon–Sat shift without lunch unless later repaired). Breaktime remains break-detail / legacy transform path.

## Drift
LOW — workflow + manifest updated with new path

## Verification
- mocha: `tests/bnpi-worksharing-schedule-import.helper.spec.ts` (6 passing)
- vitest: migration.import-route.test.ts (19 passing)
