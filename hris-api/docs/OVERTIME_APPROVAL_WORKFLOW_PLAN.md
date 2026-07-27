# Overtime Approval Workflow

## Problem

Clock-out previously auto-wrote payable `overtimeHours` on attendance, obligations, and timesheet lines. There was no manager gate between detection and payroll totals.

## Locked behavior

1. Detection stays automatic (post-shift excess, rest day, holiday work).
2. Effective `overtimeHours` remains `0:00` until a manager approves an `OVERTIME` request.
3. Pending candidate minutes are stored on line/obligation metadata (`overtimeCandidate`, `pendingOvertimeMinutes`, `pendingOvertimeHours`).
4. Employees must file an `OVERTIME` request for every candidate day before timesheet submit.
5. Manager approval via seeded workflow `WF-OVERTIME-DEFAULT` (SUPERVISOR assignee).

## Data model

- `RequestType.OVERTIME`
- `TimesheetConfig.requireManagerApprovedOvertime` (default `true`)
- Line metadata: `overtimeCandidate`, `pendingOvertimeMinutes`, `pendingOvertimeHours`, `overtimeCandidateReason`, `overtimeRequestId`, `overtimeApprovalStatus`
- Behavior flag: `OT_CANDIDATE` until approved; `OVERTIME` only after approval threshold met

## API

- `POST /api/timesheet/:id/overtime-requests` — file OT request from a candidate line
- Timesheet submit returns `403 OVERTIME_REQUEST_REQUIRED` when unfiled candidates remain

## Approval side effects

- **Approve**: copy detected minutes to payable `overtimeHours`, rematerialize line, refresh attendance obligation
- **Reject**: keep payable OT at `0:00`, set `overtimeApprovalStatus = REJECTED`

## Exceptions

Imported DM4/Bandai repair rows with `metadata.bandaiPayrollSourceRepair` bypass the candidate gate and keep pre-approved OT.

## Policy rollback

Set `TimesheetConfig.requireManagerApprovedOvertime = false` to restore legacy auto-OT behavior.