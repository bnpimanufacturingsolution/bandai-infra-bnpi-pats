# Approval Chain Test Guide

## Purpose

This guide explains how to test the new scalable approval chain implementation:

- Dynamic approver assignment by hierarchy (`reportToId`)
- Escalation to higher-rank approvers when manager/HR manager is unavailable
- Strict approval authorization (only current assigned approver can decide)
- Self-approval prevention

---

## Where This Is Implemented

- Assignee resolution logic:
  - `Hris-Api/helper/request-workflow.helper.ts`
- Approval authorization and step progression:
  - `Hris-Api/app/request/request.controller.ts`

---

## Pre-Test Requirements

1. Seeded employee hierarchy with valid `reportToId` chains.
2. Levels configured with `rank` values (used for higher-up fallback).
3. Active workflow for request type being tested (for example `LEAVE`).
4. Access tokens for these users:
   - Requester
   - Manager
   - Manager's manager or higher-up
   - HR Manager
   - HR User

---

## API Endpoints Used In Tests

- Create request: `POST /api/request`
- Approve/reject request: `POST /api/request/:id/approval`
- Get request details: `GET /api/request/:id`

---

## Suggested Request Workflow For Leave

Use or configure this step order:

1. `SUBMISSION` -> `REQUESTER`
2. `APPROVAL` -> `SUPERVISOR`
3. `APPROVAL` -> `HR`

---

## Test 1: Direct Manager Approval (Primary Path)

1. Create a leave request as employee.
2. Fetch request details and verify:
   - `currentStepExecution.assigneeType` is `SUPERVISOR`
   - `currentStepExecution.assigneeId` is the direct manager
3. Approve using manager token.
4. Fetch request details and verify:
   - next step is `HR`
   - status should be `PROCESSING` until final step

Expected:

- Manager approval succeeds.
- Workflow advances to HR step.

---

## Test 2: Manager Unavailable -> Escalate To Higher-Up

Simulate manager unavailable by one of:

- set manager `isDeleted = true`, or
- set manager `employmentStatus` to `INACTIVE`, `TERMINATED`, or `RESIGNED`

Steps:

1. Create a new leave request as employee.
2. Fetch request details.
3. Verify current supervisor assignee is not unavailable manager.
4. Verify assignee moved to manager's manager or higher-up.

Expected:

- Step is auto-assigned to higher hierarchy approver.
- `stepExecutions[].metadata.approvalResolution` contains fallback details.

---

## Test 3: HR Manager Unavailable -> Escalation

Simulate HR manager unavailable (`isDeleted` or non-approvable employment status).

Steps:

1. Move a request to HR step (approve supervisor step first).
2. Fetch current step and verify HR manager is not assigned.
3. Verify fallback order:
   - higher-up (by reporting chain / rank), then
   - HR user fallback if applicable

Expected:

- Request still gets an approver automatically.
- No manual reassignment needed.

---

## Test 4: Unauthorized Approver Is Blocked

Steps:

1. Create request and ensure current step assigned to user A.
2. Try approving with user B token (not current assignee).

Expected:

- API returns `403`.
- Message indicates only current assigned approver can decide.

---

## Test 5: Self-Approval Is Blocked

Steps:

1. Create request as requester.
2. Try approving it as same requester account.

Expected:

- API returns `403`.
- Message indicates self-approval is not allowed.

---

## Test 6: No Available Approver

Simulate no valid approver in the chain (all candidates unavailable).

Steps:

1. Create request.
2. Attempt to advance approval on unresolved required step.

Expected:

- API returns `409`.
- Message indicates no available approver found.

---

## Sample Approval Request (cURL)

```bash
curl -X POST "http://localhost:3000/api/request/<REQUEST_ID>/approval" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "approve",
    "comment": "Approved for testing"
  }'
```

Reject:

```bash
curl -X POST "http://localhost:3000/api/request/<REQUEST_ID>/approval" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "reject",
    "comment": "Rejected for testing"
  }'
```

---

## What To Inspect In Response Data

1. `request.status`
2. `request.currentStepExecutionId`
3. `request.lastCompletedStepExecutionId`
4. `request.stepExecutions[].assigneeId`
5. `request.stepExecutions[].metadata.approvalResolution`

Key metadata fields:

- `resolved_assignee_id`
- `resolved_from_chain`
- `fallback_level`
- `fallback_reason`
- `resolved_at`

---

## Quick Validation Matrix

1. Manager available -> manager assigned.
2. Manager unavailable -> higher-up assigned.
3. HR manager unavailable -> higher-up/HR fallback assigned.
4. Wrong user approves -> `403`.
5. Requester self-approves -> `403`.
6. No approver available -> `409`.

If all 6 pass, the scalable approval chain is working as expected.
