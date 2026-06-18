# PRD + Implementation Plan: Unified Timesheet-as-Request Workflow

## Summary
Convert timesheet workflow into a first-class request flow using the existing request engine, with `Request.type = TIMESHEET` and `metadata.timesheetAction` (`SUBMISSION` or `EDIT_PERMISSION`).  
Keep `Timesheet` as operational state for payroll/edit gating, and keep request records as approval/process source of truth.  
Manager/HR approval operations surface in `/hr/request-process` as the single inbox.

Locked decisions:
1. Timesheet appears in Request Process inbox.
2. Timesheet submit creates request records.
3. Single request type: `TIMESHEET` + metadata action.
4. Backfill legacy `OTHER + subType` timesheet requests.
5. Request Process is the main processing surface.
6. Edit gate rule: `DRAFT/SUBMITTED/APPROVED` gated; `REVISED` editable without permission.
7. Edit-permission request initiator: employee owner only.
8. Submission request policy: create on first submit; resubmit reuses same thread if still open.
9. Rejection default: return to `REVISED`.
10. Add org config field for reject behavior (`rejectBehavior`), default `REVISE`.

## Product Behavior (Final)

### 1) Core Separation
1. `Timesheet.status` stays business/record state (`DRAFT`, `SUBMITTED`, `REVISED`, `APPROVED`, `REJECTED`).
2. `Request.status` stays workflow/process state (`PENDING`, `IN_REVIEW`, etc.).
3. Request workflow drives manager actions; timesheet mirrors resulting operational state.

### 2) Request Taxonomy
1. New request type: `TIMESHEET`.
2. Required metadata key: `timesheetAction`.
3. Allowed actions:
- `SUBMISSION`
- `EDIT_PERMISSION`

### 3) Edit Permission Rules
1. Employee can edit directly only when `Timesheet.status = REVISED`.
2. For `DRAFT/SUBMITTED/APPROVED`, manual edits require approved edit-permission request.
3. Employee can submit in `DRAFT` even without edit permission.
4. Edit permission is employee-owner initiated only.
5. If `TimesheetConfig.enableEditBeforeSubmission = false`, manual edits and edit-permission request creation are blocked globally (`403 POLICY_DISABLED`), including `REVISED`.

### 4) Submission Rules
1. First submit (`DRAFT -> SUBMITTED`) creates `TIMESHEET/SUBMISSION` request.
2. Resubmit (`REVISED -> SUBMITTED`) reuses active submission thread when possible; create new only if prior is terminally closed.
3. Manager rejection sends back to `REVISED` by default/config.

### 5) Rejection Policy Config
1. Add `TimesheetConfig.rejectBehavior`.
2. Values:
- `REVISE` (default)
- `REJECT`
3. Runtime behavior:
- `REVISE`: manager reject => `Timesheet.status = REVISED`
- `REJECT`: manager reject => `Timesheet.status = REJECTED`

## Data Model / Schema Changes

### 1) `request.prisma`
1. Add enum value to `RequestType`:
- `TIMESHEET`
2. Keep existing `RequestStatus` unchanged.
3. Keep `metadata` JSON (no new table needed).

### 2) `timesheet.prisma`
1. Add enum for config:
- `TimesheetRejectBehavior { REVISE REJECT }`
2. Add to `TimesheetConfig`:
- `rejectBehavior TimesheetRejectBehavior @default(REVISE)`
3. Keep existing edit-permission inline fields:
- `editPermissionStatus`
- `editPermissionRequestId`
- audit timestamps/employee refs
4. Keep existing unique/index constraints.

### 3) Backfill/Migration
1. DB migration:
- Add `RequestType.TIMESHEET`
- Add `TimesheetRejectBehavior`
- Add `TimesheetConfig.rejectBehavior`
2. Data backfill script:
- Find `Request.type=OTHER` where metadata/subType indicates timesheet flows.
- Convert to `Request.type=TIMESHEET`.
- Normalize metadata to include `timesheetAction`.

## API / Contract Changes

### Backend (Timesheet module remains orchestration point)
1. `POST /api/timesheet/:id/submit`
- Ensure request creation/attach for `TIMESHEET/SUBMISSION`.
2. `POST /api/timesheet/:id/edit-permission/request`
3. `POST /api/timesheet/edit-permission/request-current`
- Preview-safe resolver (create draft then request).
4. `POST /api/timesheet/:id/edit-permission/review`
5. `POST /api/timesheet/:id/edit-permission/consume` (if one-shot stays enabled)

### Request payload/metadata (required)
1. `type: "TIMESHEET"`
2. `metadata.timesheetAction: "SUBMISSION" | "EDIT_PERMISSION"`
3. `metadata.timesheetId: string`
4. `metadata.employeeId: string`
5. `metadata.periodCode: string`
6. `metadata.reason: string` required for `EDIT_PERMISSION`

### Error contracts
1. `EDIT_PERMISSION_REQUIRED`
2. `EDIT_PERMISSION_ALREADY_REQUESTED`
3. `EDIT_PERMISSION_REVIEW_REASON_REQUIRED`
4. `TIMESHEET_SUBMISSION_REQUEST_CONFLICT` (if duplicate active thread)

## Controller/Service Synchronization Rules
All request+timesheet writes occur in a single DB transaction.

### 1) Submit action
1. Transition timesheet status to `SUBMITTED`.
2. Create/reuse `TIMESHEET/SUBMISSION` request.
3. Bind workflow and current step execution.
4. Update timesheet audit fields (`submittedAt`, `submittedBy`).

### 2) Submission review
1. Approve:
- request advances to approved/completed
- timesheet -> `APPROVED`
2. Reject:
- request advances with rejection note
- timesheet -> `REVISED` or `REJECTED` based on `TimesheetConfig.rejectBehavior`
- capture rejection reason on timesheet

### 3) Edit-permission request/review
1. Request:
- create `TIMESHEET/EDIT_PERMISSION` request
- timesheet `editPermissionStatus=REQUESTED`
2. Approve:
- timesheet `editPermissionStatus=APPROVED`, granted audit fields
3. Reject:
- timesheet `editPermissionStatus=REJECTED`, rejection reason/audit fields
4. Consume:
- first successful edit after approval sets `CONSUMED` (if one-shot policy enabled)

## Frontend Plan

### 1) Request Process (`/hr/request-process`)
1. Include `Request.type=TIMESHEET`.
2. Add badges/labels by `metadata.timesheetAction`.
3. Manager action buttons map to existing review endpoints.

### 2) Employee Timesheet Modal
1. Keep Option A banner layout.
2. DRAFT:
- show submit guidance + request edit-permission CTA.
- submit button remains in existing location.
3. REVISED:
- editable directly; no permission gate.
4. SUBMITTED/APPROVED:
- locked banner + request edit-permission CTA.
5. Use backend permission fields for UI gating; no local-only inference.

### 3) Sidebar/Navigation
1. Keep manager “Timesheet Approvals” route visible.
2. Request Process remains the main processing inbox for timesheet requests.

## Validation & Security Rules
1. Request and timesheet must share organization.
2. Requester for edit permission must match timesheet employee.
3. Manager review authorization must match workflow assigned roles.
4. No HR bypass for forced approval in this phase.
5. Reject actions requiring reason enforced server-side.

## Test Cases and Scenarios

### Model/API
1. Schema migration applies cleanly.
2. Legacy `OTHER` timesheet requests backfill to `TIMESHEET`.
3. Config defaults `rejectBehavior=REVISE`.

### Timesheet Editing
1. `DRAFT` edit without permission -> blocked.
2. `DRAFT` submit without permission -> allowed.
3. `REVISED` edit without permission -> allowed.
4. `SUBMITTED/APPROVED` edit without permission -> blocked.

### Request Workflow
1. First submit creates `TIMESHEET/SUBMISSION`.
2. Resubmit reuses active submission thread when applicable.
3. Edit-permission request in preview mode creates draft + request.
4. Manager reject requires reason.
5. Approval/rejection syncs request and timesheet states correctly.

### UI/UX
1. Option A visible in DRAFT/SUBMITTED/APPROVED scenarios as specified.
2. Request Process shows timesheet requests with clear action labels.
3. Deep links (`action`, `id`, `tab`, `periodCode`) remain functional.

### Payroll Regression
1. Payroll blockers still use unsubmitted logic and are unaffected by request typing changes.
2. No route URL changes required for payroll/timesheet pages.

## Rollout Plan
1. Phase 1: Prisma enum/config migration + backfill script.
2. Phase 2: Backend request typing + transactional sync in controllers.
3. Phase 3: Frontend request-process filtering + modal state wiring.
4. Phase 4: Integration QA on employee-manager-HR flows.
5. Phase 5: Clean-up legacy `OTHER/subType` compatibility paths after validation window.

## Assumptions and Defaults
1. Existing workflow engine and step execution remain unchanged.
2. `TIMESHEET` workflows will be seeded per org similarly to current request workflows.
3. `rejectBehavior` defaults to `REVISE`.
4. One-shot edit permission consumption remains enabled unless explicitly changed later.
5. Request Process route/component is already role-capable for manager and HR.
