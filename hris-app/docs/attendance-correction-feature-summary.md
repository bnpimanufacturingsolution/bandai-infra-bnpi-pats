# Attendance Correction Feature Summary

Status: ACTIVE  
Last reviewed: 2026-06-26  
Task mode: docs-only / feature summary  
Delivery mode: AI-agent

## One-Line Summary

Attendance fix is a mode-aware HR ledger flow: missing attendance becomes a backfill/create write, while wrong attendance becomes a correction that replaces the effective same-day attendance row without deleting the original attendance evidence.

## Does It Work

Yes. The implemented flow is covered at the HR UI layer, the employee/requester request client layer, the approver review UI layer, the approver approval client layer, the live employee-manager and HR approval route mounts, the admin workflow designer request-type option contract, and the backend correction helper. The direct HR route and the approval-side request workflow converge on the same mutation path, including approve and reject reviewer outcomes.

## How It Works

### Direct HR path

1. HR opens an attendance record.
2. HR launches **Fix Attendance**.
3. The form preloads the selected day and existing attendance context.
4. If the row is real, the app enters **Correct attendance** mode and posts to the correction endpoint.
5. If the row is virtual or missing, the app enters **Create missing attendance** mode and posts to the dedicated backfill endpoint.
6. HR sets status, reason, times, and notes.
7. On submit, the app posts the mode-specific mutation to the backend.

### Approval-side path

1. A request of type `ATTENDANCE_CORRECTION` is created.
2. An approver approves the request.
3. The backend applies the correction as a request approval side effect.
4. The result matches the direct HR path: a new effective correction row replaces the old effective row for that day.

### Shared backend behavior

The shared correction helper in `../hris-api/app/attendance/attendance-correction.service.ts`:

- normalizes the correction payload
- enforces status and time-window rules
- requires a written explanation for the correction
- supersedes prior effective same-day rows
- refreshes attendance obligations
- refreshes timesheet read models
- invalidates cache after the write

The dedicated backfill helper in `../hris-api/app/attendance/attendance-backfill.service.ts`:

- normalizes the same fix payload shape without requiring `attendanceId`
- rejects same-day writes when an attendance row already exists
- creates the first raw attendance row for the day
- refreshes attendance obligations
- refreshes timesheet read models
- invalidates cache after the write

## Coverage By Role

| Role | Current path | Coverage status |
| --- | --- | --- |
| HR | `Fix Attendance` from the HR attendance screen, which switches between correction and backfill | Tested in `app/routes/hr/time-corrections.test.ts`, `app/services/attendance.service.test.ts`, `app/lib/hooks/useAttendances.test.tsx`, and `app/components/templates/common/attendance-management-template.test.tsx` |
| Employee / requester | Generic request submission with `type: ATTENDANCE_CORRECTION` | Contract-tested in `app/services/requests.service.test.ts` |
| Approver / reviewer | Request approval and review flow for `ATTENDANCE_CORRECTION` | Approval endpoint contract-tested in `app/services/requests.service.test.ts`; review UI render-tested in `app/components/molecules/RequestReviewModal.test.tsx`; live route mounts in `app/routes/employee/approvals.tsx` under both `/employee/approvals/requests` and `/hr/approvals/requests`; route smoke coverage now lives in `tests/smoke/approvals-attendance-correction.spec.ts` and covers approve/reject reviewer outcomes |
| Admin / workflow designer | Workflow configuration can include `ATTENDANCE_CORRECTION` as a request type | Contract-tested in `app/routes/admin/rules-policies/workflows.test.ts` |
| Backend / system | Shared approval side effect in `../hris-api/app/request/request.controller.ts` and `../hris-api/app/attendance/attendance-correction.service.ts` | Tested by `../hris-api/tests/attendance-correction.service.spec.ts` and source-truth regression suites |

Important note: I did not find a dedicated employee attendance-correction create screen in the current app routes. The employee path is currently the generic request create contract, not a separate attendance-correction UI.

## Status Rules

- `PRESENT` requires both clock-in and clock-out.
- `INCOMPLETE` requires clock-in and allows clock-out to stay blank when the employee has not clocked out yet.
- `ABSENT`, `LEAVE`, and `REST_DAY` clear the worked window.
- Every correction requires notes/explanation.

## Audit Trail

- Direct HR correction remains immediate when the day already has a row.
- Direct HR backfill creates the first raw attendance row when the day is missing.
- The created correction row preserves source, actor, reason category, ledger type, applied timestamp, and supersession history.
- The HR correction and backfill endpoints both write explicit attendance audit log entries in addition to their ledger rows.

## Reason Categories

- The current shared allowlist is still code-defined and shared across app/API.
- Owner direction is that the category set may vary by organization policy, so this should be treated as a future configuration follow-up rather than a closed doctrine decision.

## Why It Exists

- Preserve audit history instead of overwriting raw attendance.
- Keep raw attendance truth separate from effective ledger truth.
- Keep timesheets and payroll-adjacent read models synchronized.
- Make direct HR correction and approval-driven correction behave the same way.

## User Journey

1. HR or an approver opens the relevant entry point.
2. The system shows the same-day attendance context or missing-day context.
3. The user reviews the day, picks a status, chooses a reason, and adds notes.
4. If the chosen status is a worked-window status, the user supplies the required time values.
5. The correction or backfill is submitted or approved.
6. The backend writes a new effective correction row or the first raw attendance row, depending on the mode.
7. The updated result appears in the correction list and details view, or in the attendance list for backfills.

## Validation

Feature-specific tests:

- `app/routes/hr/time-corrections.test.ts`
- `app/services/attendance.service.test.ts`
- `app/services/requests.service.test.ts`
- `app/components/molecules/RequestReviewModal.test.tsx`
- `app/routes/admin/rules-policies/workflows.test.ts`
- `tests/smoke/approvals-attendance-correction.spec.ts`
- `../hris-api/tests/attendance-correction.service.spec.ts`

Adjacent regression guards (do not exercise the correction service directly, but guard payroll/schema invariants the correction flow depends on):

- `npm run test:api:source-truth` (attendance-obligation, timesheet-line-version, payroll snapshot-lock contracts)
- `npm run test:db:source-truth` (schema source-truth and isolated-db-fault guard contracts)
