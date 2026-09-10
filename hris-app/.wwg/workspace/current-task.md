# Current Task

## Latest Task Addendum - 2026-09-09: HR direct timesheet edit on APPROVED sheets (TimesheetViewModal)

- **Operator request:** HR must be able to update employee timesheets directly. All 2,235 sheets on the current period are APPROVED ("Payroll Ready"), and APPROVED sheets were previously read-only for everyone — the HR page's view modal had no save path at all.
- **Shipped in `app/components/organisms/TimesheetViewModal.tsx`:** (a) `isHrApprovedEdit` (HR role + APPROVED + not payroll-locked) now unlocks day clicking via `canEditDays`; (b) `isHrRole` declaration moved above `canEditDays` (no duplicate); (c) built-in `useUpdateTimesheet` save — `saveHrEditedDays()` PATCHes `PATCH /api/timesheet/:id` with the **full** breakdown + `editedDayKeys` (same contract as employee resubmit; backend recomputes summaries and versions changed days), resets dirty state on success; (d) orange **HR edit mode** banner independent of `showActions` (HR page opens modal with `showActions={false}`); (e) footer **Save changes (N)** CTA shown only when HR-edited days exist.
- **Employee/manager flows unchanged:** REVISED/permission resubmit, approval mode, payroll-correction path all untouched; non-HR roles see no banner/CTA on APPROVED.
- **Tests:** `TimesheetViewModal.test.tsx` 16/16 — added HR CTA gating, HR banner, non-HR isolation; also **repaired 8 pre-existing baseline failures** (the `useTimesheets` mock lacked `useCreatePayrollCorrection`/`useTimesheetPayrollCorrections` exports; auth mock made mutable). Page `timesheets.view-modal.test.tsx` + preview-modal 8/8. Targeted ESLint: 0 new errors (1 pre-existing a11y label error at line 2693 unchanged from baseline).
- **Dual-app:** HR-only exception — `/hr/timesheets` has no emp-app counterpart and the change is HR-role-gated (`HR-only (no emp counterpart)`).
- **Docs:** `docs/00-product/HR-TIMESHEET-DIRECT-EDIT-20260909.md`. Backend counterpart: hris-api addendum 2026-09-09.
- Boundary: local workspace only (not pushed / not VM-rolled). Pre-existing a11y error + 121 api tsc errors unchanged.

## Status
done

## Summary
Disciplinary Action review workflow (operator decisions 2026-09-03): row actions now include status transitions (DRAFT→Confirm/OPEN, OPEN→Ongoing/Dismiss, ONGOING→Resolved/Dismiss; terminal states locked), status filter and badges include DRAFT, and the File/Edit offense select is driven by the Disciplinary Rule Book (rule code = offenseType, severity prefilled from rule with CRITICAL→HIGH mapping, description prefilled, consequences hint shown). View modal shows the rule-book next step (employee/manager steps + response window) for the case severity. Backend notifications (hris-api) fire on DRAFT→OPEN and RESOLVED to employee + manager.

## Category
feature / mixed

## Packages
- bandai-infra/hris-app
- bandai-infra/hris-api
- Dual-app: **HR-only (no emp counterpart)**

## Changes
- `app/routes/hr/disciplinary-action.tsx` — `STATUS_TRANSITIONS` map + `handleStatusChange` (confirm dialogs for OPEN/DISMISSED), dropdown workflow items, DRAFT status option/badge, rule-book-driven offense select (`onOffenseTypeChange`, severity prefill `normalizeSeverity`), view-modal next-step card
- `app/services/disciplinaryAction.service.ts` — `DisciplinaryActionStatus` now includes `DRAFT`
- `app/services/disciplinaryRules.service.ts` — `DisciplinaryConsequenceStep` / `DisciplinaryConsequencePlan` types, payload accepts `consequencePlan`
- `app/routes/admin/rules-policies/disciplinary.tsx` — consequence-plan editor (per-severity action/employee step/manager step/response window, "Insert standard" prefill from the standard ladder), view modal renders plan tiers
- Backend counterpart: see `../hris-api/.wwg/workspace/current-task.md`

## Truth delta
YES — case confirmation (DRAFT→OPEN) is the review gate that triggers employee + manager notifications with the rule-book next step; Rule Book rules are the source of offense types when filing.

## Drift
LOW — contract tests updated; backend workspace synced

## Verification
- vitest: `hr/disciplinary-action.contract.test.ts` + `rules-policies/disciplinary.contract.test.ts` (9 passing, incl. new rule-book-driven offense contract)
- esbuild parse OK for both pages
- mocha (hris-api): disciplinary specs 19 passing; live API proof of DRAFT→OPEN notification

## Risks
- Rule-book consequence plans for seeded rules are template/standard-ladder drafts (NEEDS_CONFIRMATION until operator edits official policy)
