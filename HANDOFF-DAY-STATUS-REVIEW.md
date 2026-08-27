# Day-status Review UI + Endpoint — Handoff

## Status: Done (code complete, API live, app-side route+sidebar registered)

## What was delivered

### API (read-only, no payroll charges ever)
- **GET `/api/payrollperiod/:id/day-status-review`** — bucket counts + review queue items, DB-only or workbook-refined
- **POST `/api/payrollperiod/:id/day-status-review/refine-with-workbooks`** — merges leaveFile + awolFile (SheetJS), runs classifyEmployeeDay per-day, returns refined buckets + queue
- `classifyEmployeeDay` precedence: EXEMPT > PRESENT_PUNCH > LEAVE_PAID > UNPAID > REVIEW_NO_EVIDENCE
- Both are activity-logged, paginated (200 default / 5000 max via `?limit=`), auth-guarded

### Helper (pure, 12/12 tests green)
- `hris-api/helper/day-status-resolution.helper.ts` — `classifyEmployeeDay`, `buildDayStatusReviewPayload`, `parseBenefitNotesLeaveDates`
- `hris-api/tests/day-status-resolution.helper.spec.ts` — precedence contract tests

### Controller (`hris-api/app/payrollperiod/payrollperiod.controller.ts`)
- `getDayStatusReview` + `refineDayStatusReviewWithWorkbooks` (added ~line 1779)
- **FIXED**: `await` → `yield` at line ~1849 (this file uses `__awaiter`/generator style, not async/await)

### Router (`hris-api/app/payrollperiod/payrollperiod.router.ts`)
- GET + POST routes added after `schedule-deltas` (~line 509)
- multer with `leaveFile` + `awolFile` fields, 20MB limit
- Interface `IRouter` updated with both method signatures

### Constants (`hris-api/config/constant.ts`)
- `DAY_STATUS_REVIEW_ACTIONS`, `DAY_STATUS_REVIEW_DESCRIPTIONS`, `DAY_STATUS_REVIEW_PAGES` added (~line 2625)

### Frontend
- **Service**: `hris-app/app/services/day-status-review.service.ts` — `getDayStatusReview`, `refineWithWorkbooks`, `buildDayStatusReviewCsvRows` (pure, tested)
- **Spec**: `hris-app/app/services/day-status-review.spec.ts` — 3 tests (header, blank exposure, ESTIMATE_ONLY contract)
- **Page**: `hris-app/app/routes/hr/day-status-review.tsx` — AuthGuard, period selector, bucket chips, weekday histogram, review queue DataTable, export CSV, upload refine, estimate-note banner
- **Route**: `hris-app/app/routes.ts` — `route("day-status-review", "./routes/hr/day-status-review.tsx")` added after time-corrections
- **Sidebar**: `hris-app/app/components/organisms/Sidebar.tsx` — submenu entry under hr-timekeeping after Attendance Corrections

## What remains (next session)

### Live endpoint proof (API is up at :3001 on local DB 5433)
1. Login `admin@bandai.local` / `password123` / `appCode=hris`
2. GET both periods — confirm bucket numbers match simulation (sim `REPORT-MONSAT-TALLY.md`)
3. Build combined leave workbook (Jun+Jul qualifying sheets) via SheetJS and POST refine — confirm parity
4. Save proof JSONs into `.runtime/day-status-live/`

### Playwright page proof
- Login, navigate to `/hr/day-status-review`
- Screenshot + console proof the page renders

### WWG close-out
- Flip `REC-20260826-DAY-STATUS-REVIEW-QUEUE` to **Implemented** in `.wwg/governance/recommendation-registry.md`
- Add section to `.wwg/wiki/project-truth.md` for day-status resolution pipeline
- Update `.wwg/workspace/current-task.md` final addendum
- Update `.wwg/reports/wwg-agent-handoff.md` row
- Commit + push `develop`

## Known quirks / gotchas
- **Controller style**: `payrollperiod.controller.ts` uses `// @ts-nocheck` + `__awaiter` generator pattern (`yield` not `await`). New code must match this pattern exactly.
- **Frontend**: `services/` use import maps (`~/services/...`); route files use `~/lib/...` for auth hooks.
- **Local DB clone**: `.env.development.local` → `127.0.0.1:5433`. K3s forward (55435) is down.
- **LVP notes format**: `dates=2026-07-11+2026-07-12+...` stored in `EmployeeBenefit.notes` JSONB column.
- **Jun26–Jul10 damage**: DB LVP has ~101 underpaid rows (lost days) vs original workbook truth; workbook-refined endpoint overwrites with clean source.
- **Multiplier freeze issue**: backend does `getRegularDays() * getsTotalDays()` for paid-day mass updates — can mutate multiplier if pushed post-workbook. Not in scope for this feature (controller runs DB-only + workbook modes only).
