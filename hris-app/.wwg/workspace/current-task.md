# Current Task

## Status
done

## Summary
Run Payroll period strip collapsed into a small calendar button (operator request 2026-09-09): the always-visible 8-card carousel on `/hr/run-payroll` is now a compact `SEPTEMBER 2026 [Current] ... [Sep 10 - Sep 25 v]` picker. Click opens all periods with search + Past toggle; selection, Current/Completed badges, stuck-run button, and `periodCode`/`periodView` URL contract unchanged.

Follow-up same day (redundant dates): removed 3 duplicated period displays — header subtitle range (= picker button), title-card `Semi-Monthly Employees` (= sidebar Pay Schedule row), and sidebar `Pay Period` row (= picker button). Single range display is now the picker button; sidebar keeps unique `Pay Date` + `Due by`; title keeps the payroll name.

Follow-up same day (accordions default closed): main stack (`payroll-adjustments`, `approved-ot`, `schedule-deltas`) and employee detail modal (`earnings-deductions`, etc.) now mount with `defaultValue={[]}` — all collapsed until HR opens them.

Follow-up same day (modal count accuracy): fixed "Processed 693 of 2206 payable" — the denominator mixed org-wide approved rows (2,234) with scoped exclusions (28). Modal now uses the job-scoped total only (851). Backend `payrollRunTotals` scoped to the run universe (see `../hris-api/.wwg/workspace/current-task.md`); completion now stores tsTotal 880 / approved 880 / ready 851 (live proof on PP-20260826-20260911, COMPLETED 851/851).

Follow-up same day (register columns): payroll records table (`payroll-management-template.tsx`) gained **Absent** (absentDeduction + days-absent sub-line) and **Status** (Paid / Unpaid / No salary + reason sub-line) columns. Reasons come from new `app/lib/utils/payroll-row-status.ts` (`resolvePayrollRowStatus`, row data only, never guessed): no basic salary → no timesheet → day-less timesheet → absent-all-days (with count) → generic zero-pay fallback.

Follow-up same day (compress + hover): register table compressed (tighter padding, widths 85% + actions room, "Semi-Mo" freq labels with full name on hover) and the No-salary reason moved off the row into a hover tooltip on the Status badge (reuses in-template `ValueHover`), so the badge fits without clipping.

Follow-up same day (fill Status→Actions gap): the sticky Actions column held a single 32px button inside the 132px default — shrunk to `actionColumnWidth="64px"` on both register tables and data widths raised to 95% (Employee 18 / Period 13 / Freq 7 / Basic+Absent+Gross+Deduct 8 / Net 11 / Status 14), so no dead space sits between Status and Actions on wide shells.

## Category
feature / UX (SHE: Shrink + Hide)

## Packages
- bandai-infra/hris-app
- Dual-app: **HR-only (no emp counterpart)** — Run Payroll has no employee-app surface.

## Changes
- `app/components/templates/common/run-payroll-template.tsx` — replaced always-open period carousel with `payroll-period-picker-trigger` calendar DropdownMenu (`payroll-period-carousel` testid kept on dropdown list); added `periodPickerQuery` search state; moved `Show Past Periods` toggle inside dropdown as `Past`; kept `View stuck payroll run`, Current/Completed badges, `handlePeriodChange`/`handlePeriodViewToggle` logic untouched.
- Same file, dedupe pass — deleted header subtitle range, title-card frequency line, and sidebar `Pay Period` row (all exact duplicates of the picker button range / sidebar Pay Schedule row).

## Truth delta
YES — Run Payroll period selection is now a hidden-until-asked calendar picker (SHE), not an always-visible strip.

## Drift
LOW — URL contract (`periodCode`, `periodView`) and selection semantics preserved; no backend change.

## Verification
- TypeScript transpile of `run-payroll-template.tsx` OK (0 diagnostics, 255k output).
- vitest `app/lib/utils/payroll-preview-modal.test.ts`: 7/7 passing.
- Full `tsc`/`eslint` not green in this env (tsc times out on full project; eslint 9.39 config error `createRequire` — pre-existing, unrelated to this edit).
- Browser proof NEEDS_CONFIRMATION (no live dev server run this pass).

## Risks
- Radix DropdownMenu focus: search input uses `stopPropagation` on keydown; verify typing + Past toggle do not close the menu in a live browser pass.
