# Special Payroll — One-Time Compensation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. This document is finalized for implementation planning only; no implementation is authorized by this document.

**Goal:** Add a separate, immediately-created Special Payroll workflow to `/hr/run-payroll?periodCode=PP-20260726-20260811` with manual compensation entry, Excel mass upload, separate history, separate payslips, HR release, and strict exclusion from regular payroll.

**Architecture:** Use dedicated immutable `SpecialPayrollRun`, `SpecialPayrollLine`, and `SpecialPayrollPayslip` records. The selected regular payroll period is display context only: its start date, end date, and pay date are inherited for labeling, but the regular period code is not the special-run identity and the special run never waits for or enters regular payroll processing. Manual and upload rows converge on one preview → validate → create service.

**Status:** `PLAN_ACCEPTED` — product-policy decisions are finalized; implementation has not started.

## Final Product Decisions

- Special Payroll executes immediately after the admin confirms a valid preview. It does not wait for the selected period to finish.
- The selected period is label/context only. Display its start date, end date, and pay date; use a separate Special Payroll run identifier instead of the regular period code.
- Each confirmed manual submission or workbook upload creates one immutable run. Later corrections use a new run.
- A custom run label is required, for example `Annual Incentive 2026`; the type remains `Special Payroll`.
- One employee may have multiple compensation codes in one run. Duplicate employee + compensation-code rows in the same context are rejected.
- The same employee + compensation code may be used only once per selected-period context across non-cancelled runs. A cancelled run does not block a corrected replacement.
- Only currently active employees are eligible for manual selection or import.
- Compensation is selected from active compensation catalog types. Do not create `EmployeeBenefit` enrollments or installments.
- Snapshot the selected catalog type’s code, name, direction, and taxability into special history.
- The entered amount is the complete one-time payout. Gross equals net; no statutory, withholding-tax, or regular payroll deduction calculation is performed in v1.
- Catalog taxability is retained for classification/audit only and does not create a deduction.
- The modal has `Manual Entry` and `Mass Upload` tabs. Both use the same preview and confirm flow.
- Manual entry selects one compensation type and employees, then collects a separate amount for each employee.
- Mass upload accepts `.xlsx` only, uses flexible column mapping, and blocks the whole run when any row is invalid.
- The downloadable template columns are `COMPENSATION_CODE`, `AMOUNT`, `EMPLOYEE_NUMBER`, `EMPLOYEE_NAME`, and `START_PAY_DATE`.
- The supplied workbook aliases `COMCODE`, `Amount`, `EmployeeID`, `EmployeeName`, and `StartPayDate` must map to the template fields.
- `START_PAY_DATE` is parsed and retained as source/audit metadata only. It does not schedule, delay, or change the payout.
- `EMPLOYEE_NUMBER` is the identity key. A materially conflicting `EMPLOYEE_NAME` rejects the row for review.
- Creation produces an HR-reviewable finalized run. HR must explicitly release the entire run before employees can view payslips.
- HR can release from the creation result or Special Payroll history. Release is all-or-nothing and sends the existing payslip-available notification.
- Before release, HR may cancel the run. After release, it is immutable. Corrections use a new run.
- Employees see released special payslips in existing payroll history with a prominent Special Payroll badge and separate detail/PDF routes.
- Payroll reporting may show a separate Special Payroll section, but special amounts must not enter regular payroll calculations, regular totals, or regular register rows.

## Current-State Evidence

- `bnpi-pats-app/app/routes/hr/run-payroll.tsx` renders `bnpi-pats-app/app/components/templates/common/run-payroll-template.tsx`; the right card currently exposes regular `Start Payroll` only.
- Regular payroll uses `POST /api/payrollperiod/:id/generate-timesheet`, with preview and progress contracts. Special Payroll must not reuse that generator.
- `EmployeeBenefit` and `EmployeeBenefitInstallment` are established regular payroll sources. Reusing them would risk regular-payroll consumption.
- `EmployeePayroll` is the regular snapshot and has unique `(employeeId, payrollPeriodId)` semantics. Special payslips require a separate record boundary.
- Existing benefit import and payslip patterns can be reused for UI conventions, parsing, authorization, and PDF presentation, but not for special persistence semantics.
- The supplied workbook has one sheet, `Sheet1`, with 1,221 data rows and headers `COMCODE`, `Amount`, `EmployeeID`, `EmployeeName`, `StartPayDate`. Employee data and amounts are not copied into this plan.

## Public Interfaces and Data Contract

### Dedicated records

- `SpecialPayrollRun`: organization, own run identifier, required label, selected-period date context, status (`FINALIZED`, `RELEASED`, `CANCELLED`), totals, source filename/hash metadata, actor, idempotency key, created/released/cancelled timestamps.
- `SpecialPayrollLine`: run, employee, compensation snapshot, one-time amount, source row number, audit-only source date, and immutable employee/code/name/direction/taxability fields.
- `SpecialPayrollPayslip`: run, employee, immutable gross/net snapshot, compensation lines, generated/released state, and stable payslip identifier.

### Required endpoints

- `POST /api/special-payroll/preview` — validate normalized manual rows without writing.
- `POST /api/special-payroll/import/preview` — parse `.xlsx`, map columns, and return the same preview contract without writing.
- `POST /api/special-payroll/runs` — create one run from a confirmed preview using an idempotency key.
- `GET /api/special-payroll/runs` — HR history and separate report section.
- `GET /api/special-payroll/runs/:id` — run state, totals, row outcomes, and audit metadata.
- `POST /api/special-payroll/runs/:id/release` — release every payslip in the run and send existing notifications.
- `POST /api/special-payroll/runs/:id/cancel` — cancel only an unreleased run.
- `GET /api/special-payroll/runs/:id/payslips` — HR list of special payslips.
- `GET /api/special-payroll/payslips/:id` — released employee/HR authorization-checked PDF/detail read.

Preview must return a preview ID, selected-period display context, normalized rows, totals, source snapshots, stable row errors, duplicate candidates, and a source fingerprint. It must not write database rows. Create must revalidate current employee/catalog ownership inside one transaction and return the existing result for a repeated idempotency key.

### Invariants

- Organization and actor come from authenticated context.
- Compensation must be active, organization-owned, and compensation-direction supported.
- Employee number must resolve exactly once to a current active employee.
- Name mismatch is a blocking validation error.
- Amount must be finite, positive, currency-normalized, and stored as the complete gross/net payout.
- Any invalid or duplicate row blocks the entire run; no partial run is created.
- Source fingerprint and selected-period context prevent repeat application.
- Regular payroll source resolution and `EmployeePayroll` generation never query special rows.
- Special payslip totals use immutable special snapshots, not live benefits.
- Released runs cannot be edited or cancelled.

## Implementation Plan

### Backend persistence and service

Add PostgreSQL Prisma models, matching schema definitions where required by repository convention, plus an additive migration and indexes for organization, run, employee, status, fingerprint, and payslip lookup. Add Zod request/response contracts and a dedicated service/controller/router under `bnpi-pats-api/app/specialPayroll`.

Implement one normalization service for manual rows and workbook rows. It must support the canonical template fields and sample aliases, parse comma-formatted amounts and workbook dates, validate active employees and compensation types, compare optional employee names, detect duplicates, calculate gross/net totals, and retain source metadata without logging raw employee data.

Implement transaction-safe creation, idempotency, once-per-period uniqueness, audit records, release, cancellation, and separate payslip snapshots. Do not add a special mode to `EmployeePayroll` and do not create regular benefit enrollments.

### Frontend workflow

Update `run-payroll-template.tsx` with a secondary `Special Payroll` action beneath regular Start Payroll. Add a focused Special Payroll modal with Manual Entry and Mass Upload tabs, required label, selected-period context display, per-employee amount table, flexible mapper, preview summary, all-or-nothing confirmation, creation result, release action, and cancellation state.

Add typed service/hooks and import utilities/constants in `bnpi-pats-app`. Add the downloadable canonical template and map sample aliases. Add the HR Special Payroll history/report section and separate payslip links. Update employee payroll history to show released special payslips with a Special Payroll badge, existing notification routing, separate detail view, and PDF download.

### Payslip and reporting

Extend the existing payslip presentation conventions through a special-payslip renderer. The document must show the required custom label, selected-period dates, employee, compensation lines, gross/net equal to the one-time amount, and Special Payroll type. It must not appear as a regular employee payroll payslip.

Add a separate Special Payroll report section. Regular payroll preview, generation, totals, adjustments, register rows, and regular payslip reads remain unchanged.

### Truth and documentation

After implementation evidence exists, update API/app Special Payroll documentation and reconcile accepted terminology in WWG truth, workspace, governance, and handoff files. Keep the confidential workbook out of source control and tests. Record any unrelated future payment/approval work as a proposed recommendation rather than implementing it.

## Test and Acceptance Plan

Backend tests must cover:

- schema/migration safety and regular payroll uniqueness preservation;
- manual and workbook normalization using synthetic rows with both canonical and sample headers;
- active employee and active compensation enforcement;
- employee-name mismatch rejection;
- amount/date parsing and source-date audit-only behavior;
- multiple codes allowed, duplicate employee/code rejection, and once-per-period uniqueness;
- all-or-nothing invalid-row behavior;
- idempotent and concurrent create requests;
- organization and role authorization;
- immediate creation without waiting for period completion;
- release-all, pre-release cancellation, post-release immutability, and replacement after cancellation;
- regular payroll preview/generation exclusion;
- separate PDF/detail output and released-only employee authorization.

Frontend and Playwright tests must cover:

- exact Run Payroll URL and secondary button placement;
- manual per-employee amounts;
- upload mapping for sample aliases and canonical template;
- preview errors and blocked confirmation;
- successful create, release, cancel, and replacement states;
- separate HR report section and employee payroll Special Payroll badge;
- notification route and separate PDF/detail navigation;
- regular payroll UI and totals remaining unchanged;
- keyboard focus, escape, validation association, and narrow viewport behavior.

Required implementation-time validation includes backend typecheck, focused backend contracts, frontend Vitest contracts, existing regular payroll/payslip regressions, Prisma generation/migration review, `git diff --check`, and a final confidential-data/worktree scan. A skipped check is `NOT_RUN`, not a pass. No physical device or Cloudflare runtime action is relevant to this feature.

## Explicit Scope Boundary

In scope: dedicated special records, immediate one-time creation, manual entry, Excel upload, validation, idempotency, release/cancellation, separate payslips, employee visibility, notifications, and separate reporting.

Out of scope: bank/payment execution, regular payroll formula changes, statutory deduction recalculation, normal benefit enrollment, production migration/application, importing the confidential workbook into a shared runtime, and unrelated HR/device/runtime work.

## Handoff

Implementation must begin with a fresh worktree/status check and current-state report, then proceed in backend persistence → normalization/preview → create/release/cancel → payslip/reporting → UI → browser/regression validation order. Do not modify regular payroll generation to implement Special Payroll.
