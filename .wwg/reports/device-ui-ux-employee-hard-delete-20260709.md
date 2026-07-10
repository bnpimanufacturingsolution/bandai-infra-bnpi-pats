# Device UX And Employee Hard Delete Report - 2026-07-09

Status: COMPLETE

## Scope

- Verify and improve normal-admin Add/Edit Device UX.
- Reduce confusing Device events wording while preserving the hard-cutover
  event model truth.
- Add an admin-only Employee hard delete dropdown journey with mandatory
  dry-run/preview and blocker reporting.

## Changes

- Add/Edit Device now explains adapter and callback setup under
  `Vendor and runtime routing`, while preserving `Runtime adapter`,
  `Internal adapter key`, and `Callback path`.
- Device events copy now separates browser/runtime connectivity from actual SDK
  tap evidence and removes old misleading language such as `All statuses`,
  `All sources`, `Device attendance`, and `Punch details`.
- Employee admin rows now show `Preview hard delete` only for admin
  configuration users.
- Added `POST /api/employee/:id/hard-delete-preview`.
- Hard delete execution is blocked unless preview is safe and the admin types
  `DELETE <employeeId>`.
- Attendance, payroll, legal/history, timesheet, schedule, and SOA relations
  block hard delete. Device/audit references are explicitly detached during the
  safe execute path rather than destroyed.

## Evidence

- Evidence directory:
  `.runtime/device-ui-ux-employee-delete-20260709-231712/`
- API dry-run:
  `.runtime/device-ui-ux-employee-delete-20260709-231712/employee-hard-delete-preview-dry-run.json`
- Playwright proof:
  `.runtime/device-ui-ux-employee-delete-20260709-231712/playwright-verification.json`
- Screenshots:
  `.runtime/device-ui-ux-employee-delete-20260709-231712/screenshots/`

## Validation

- `hris-app` focused tests passed:
  `npm test -- app/lib/device-events-page-contract.test.ts app/lib/employee-hard-delete-ui-contract.test.ts app/services/employees.service.test.ts`.
- `hris-api` focused direct Mocha tests passed:
  `npx tsx node_modules/mocha/bin/mocha --no-config tests/employee-hard-delete.contract.spec.ts tests/device-events-api-contract.spec.ts tests/device-event-taxonomy.helper.spec.ts`.
- `hris-api npm run typecheck` passed.
- `hris-app npm run typecheck:test` still has the known unrelated
  `TimesheetsTab.test.tsx` React Query mock typing failure already tracked in
  the recommendation registry.
- Real local API dry-run as `admin@bandai.local` returned HTTP 200 with
  `blockerCount=2`, `deleteCount=2`, `detachCount=13`, and `archiveCount=0`.
  No live employee execute request was made.
- Headless Playwright verified Add Device, Edit Device, Device events, Sync
  logs modal, Listener modal, event details modal, and employee hard-delete
  preview blocker modal.

## Recommendation Review

No new recommendations were identified.
