# PRD: Timesheet Edit Permission Workflow

## Summary
This document is the source of truth for allowing controlled edits on locked timesheets using the existing workflow engine.

The workflow reuses:
1. `RequestWorkflow`
2. `RequestStepExecution`

The timesheet keeps inline permission state for enforcement and UI.

## Problem
Timesheet entries may need corrections before or after submission, but direct manual edits must stay controlled by approval rules.

## Goals
1. Prevent direct manual edits unless permission is approved in locked states.
2. Reuse existing request workflow and step execution system.
3. Keep edit gate checks fast using timesheet-level permission fields.
4. Keep full traceability of who requested, approved, rejected, and when.

## Non-Goals
1. No model rename from `RequestWorkflow` to generic workflow.
2. No new `TimesheetEditPermission` table for this phase.
3. No schema changes to `RequestStepExecution`.

## Final Model Design

### 1) Workflow Binding (Org-level)
`TimesheetConfig.workflowId -> RequestWorkflow.id`

Purpose:
1. One org-level policy for timesheet edit-permission approvals.
2. Avoid duplicating workflow ID in every timesheet row.

### 2) Timesheet Inline Permission State
`Timesheet` stores:
1. `editPermissionStatus` (`NONE`, `REQUESTED`, `APPROVED`, `REJECTED`, `CONSUMED`, `EXPIRED`, `REVOKED`)
2. `editPermissionRequestId -> Request.id`
3. timestamps:
   - `editPermissionRequestedAt`
   - `editPermissionGrantedAt`
   - `editPermissionRejectedAt`
   - `editPermissionConsumedAt`
   - `editPermissionExpiresAt`
4. reason fields:
   - `editPermissionReason`
   - `editPermissionRejectionReason`
5. actor references (Employee model):
   - `editPermissionGrantedBy -> Employee.id`
   - `editPermissionRejectedBy -> Employee.id`
   - relation fields to `Employee`

### 3) Request Inverse Link
`Request.timesheetEditPermissionTargets[]` (inverse of `Timesheet.editPermissionRequest`)

## Why Both Timesheet State and Step Execution
1. `RequestStepExecution` is workflow progression detail.
2. `Timesheet.editPermissionStatus` is enforcement snapshot.
3. This avoids expensive or fragile step-join checks for every edit action.

## End-to-End Flow
1. Employee opens timesheet.
2. Manual editing controls are locked by default in `DRAFT`, `SUBMITTED`, and `APPROVED`.
3. If employee needs to manually correct entries in those statuses, employee submits edit-permission request first.
4. Request runs through configured workflow steps.
5. Approver decision:
   - Approve: timesheet permission set to `APPROVED`.
   - Reject: timesheet permission set to `REJECTED`.
6. Employee edits when permission is approved.
7. Employee submits/resubmits timesheet as normal.
8. On successful submit/resubmit, permission becomes `CONSUMED`.

Default behavior:
1. Submit/resubmit is still available by timesheet status rules.
2. Editing is blocked in `DRAFT`, `SUBMITTED`, and `APPROVED` unless permission is `APPROVED`.
3. `REVISED` allows direct editing without permission request.
3. After consumption, editing locks again until a new permission cycle.

Policy override:
1. If `TimesheetConfig.enableEditBeforeSubmission = false`, all manual timesheet edits are blocked.
2. When this policy is OFF, edit-permission requests are also blocked (`POLICY_DISABLED`).
3. This override applies even when timesheet status is `REVISED`.

## First-View Rule (Locked)
1. On first modal open (`DRAFT`), employee can view all timesheet details.
2. Edit actions remain disabled until permission approval in `DRAFT`, `SUBMITTED`, and `APPROVED`.
3. Employee may either:
   - submit immediately (if no correction needed), or
   - request edit permission before making corrections.

## Text UI Visualization (Current Modal Layout)

```txt
TIMESHEET VIEW MODAL (existing layout)

[Header]
Title + description + status chip + X close

[Body]
- Employee card + Hours card
- Calendar

[Info Banner]
- Status/copy area (recommended location for request-permission CTA)

[Footer Buttons]
LEFT  : [ Close ]
RIGHT : [ Submit for Approval ] or [ Resubmit for Approval ] when applicable
```

### DRAFT (no permission yet)
```txt
+------------------------------------------------------------------+
| Editing is locked until manager approval is granted.             |
|                                                                  |
|                           [ Request Edit Permission ]             |
+------------------------------------------------------------------+
[ Close ]                               [ Submit for Approval ]
```

### DRAFT (permission approved)
```txt
+------------------------------------------------------------------+
| Edit permission approved. You may now correct entries and submit. |
+------------------------------------------------------------------+
[ Close ]                               [ Submit for Approval ]
```

### REVISED
```txt
+------------------------------------------------------------------+
| Your manager requested revisions. Update entries and resubmit.    |
+------------------------------------------------------------------+
[ Close ]                             [ Resubmit for Approval ]
```

### SUBMITTED / APPROVED (locked)
```txt
+------------------------------------------------------------------+
| This timesheet is locked.                                        |
| Request manager permission to unlock for corrections.            |
|                                                                  |
|                           [ Request Edit Permission ]             |
+------------------------------------------------------------------+
[ Close ]
```

### Request Edit Permission Modal (new)
```txt
+--------------------------------------------------------------+
| Request Edit Permission                                      |
|--------------------------------------------------------------|
| Submit a request to unlock this timesheet for correction.    |
|                                                              |
| Reason for correction *                                      |
| +----------------------------------------------------------+ |
| | e.g. Missing time-out due to log discrepancy             | |
| +----------------------------------------------------------+ |
|                                                              |
|                    [ Cancel ] [ Submit Request ]            |
+--------------------------------------------------------------+
```

### Post-request banner states
```txt
REQUESTED: Edit permission request sent. Waiting for manager approval.
APPROVED:  Edit permission approved. You can now edit and resubmit.
REJECTED:  Edit permission request rejected. Reason: {reason}
CONSUMED:  Edit permission already used after resubmission.
```

## Manager UI Visualization (existing approvals pages)

```txt
URL: /employee/approvals/requests

List Card:
- Type: Timesheet Edit Permission
- Employee: {name}
- Period: {period}
- Status: Pending

Review Modal:
- Requested reason
- [Reject Request] [Approve Request]
- Reject requires reason
```

## Permission Lifecycle
1. `NONE -> REQUESTED -> APPROVED -> CONSUMED`
2. `REQUESTED -> REJECTED`
3. Optional terminal states:
   - `APPROVED -> EXPIRED`
   - `APPROVED -> REVOKED`

## Enforcement Rules
1. Employee cannot manually edit in `DRAFT`, `SUBMITTED`, or `APPROVED` unless permission status is `APPROVED`.
2. `REVISED` is editable without permission request.
3. Permission is scoped to a single timesheet via `editPermissionRequestId`.
4. Approved permission is consumed after successful submit/resubmit.
5. Actor IDs for grant/reject must reference `Employee`.

## ID/Relation Integrity Rules
1. `TimesheetConfig.organizationId` must match `RequestWorkflow.organizationId`.
2. `Timesheet.organizationId` must match linked `Request.organizationId`.
3. `Timesheet.employeeId` must match linked `Request.requesterId`.
4. Do not link soft-deleted request or timesheet rows.

## API and Behavior Scope
Implemented endpoints:
1. `POST /api/timesheet/:id/edit-permission/request`
2. `POST /api/timesheet/edit-permission/request-current`
3. `POST /api/timesheet/:id/edit-permission/review`
4. `POST /api/timesheet/:id/edit-permission/consume`

Behavior wiring in place:
1. Request creation + workflow step execution bootstrapping.
2. Manager review updates request workflow progression and timesheet inline permission state.
3. Timesheet `PATCH` edit gate enforcement with `EDIT_PERMISSION_REQUIRED`.
4. One-shot consumption:
   - consumed on first approved manual edit, and
   - reset to `NONE` on successful submit/resubmit.

Preview support:
1. `GET /api/timesheet/view` preview response includes `tempId`, `canRequestEditPermission`, and `requestEditPermissionMode`.
2. `request-current` resolver creates DRAFT first (if missing), then creates edit-permission request.

## Acceptance Criteria
1. Data model supports workflow-driven edit permission without new tables.
2. Timesheet references request and approver/rejector employees correctly.
3. Workflow progress remains queryable through `Request` and `RequestStepExecution`.
4. Inline permission state is sufficient for UI status and edit enforcement checks.

## Implementation Notes
1. Keep `RequestWorkflow` and `RequestStepExecution` names as-is.
2. Treat them as reusable engine by usage pattern, not by renaming.
3. Keep model first, behavior second rollout.
