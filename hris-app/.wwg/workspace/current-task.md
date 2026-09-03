# Current Task

## Status
done

## Summary
DM3 migration page: **Upload work sharing schedule** button + modal for BNPI WorkSharingSchedule .xlsx (DM3.2 employee schedules).

## Category
feature / ui-ux

## Packages
- bandai-infra/hris-app
- bandai-infra/hris-api (API dependency)
- Dual-app: **HR/emp-only (no counterpart)**

## Changes
- `app/lib/admin-migration-ui.ts` — `WorkbookUploadKind` adds `worksharing-schedule`
- `app/routes/admin/configuration/migration.tsx` — button, modal copy, mass-upload import path, activity filter "Schedule"
- `app/routes/admin/configuration/migration.import-route.test.ts` — upload kind coverage

## Truth delta
YES — UI exposes WorkSharing as preferred period DM3.2 operator path

## Drift
LOW

## Verification
- vitest: migration.import-route.test.ts (19 passing)
