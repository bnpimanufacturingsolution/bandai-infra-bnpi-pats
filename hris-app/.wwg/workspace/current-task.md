# Current Task

## Latest Task Addendum - 2026-09-14: Agency workspace mirrors the Agency Daily Report pack (overview summary + report detail)

- **Source:** operator folder `Agency Daily Report/` (7 agencies × 6-file pack: Manpower Databank, Time Entries, Daily Absentee Report, Attendance Summary, Daily Inactive Agency Operators, Disciplinary Action Databank). Audited CGSI set for columns (`dump` evidence via local xlsx read, not committed).
- **Overview (`routes/agency/dashboard.tsx`) = summary:** new `Absent (14d)` card (ABSENT rows in window) + `Inactive operators` card (all-status roster minus `ACTIVE/ONBOARDING/ON_LEAVE` via new `isActiveAgencyMember` in `agency-shared.tsx`). Agency scope (`agencyId` match, no status restriction — proven in `hris-api/helper/agency-scope.helper.ts`) returns inactive members too.
- **Reports (`routes/agency/reports.tsx`) = detail:** new Time Entries table (date/code/name/time in-out/status), Daily Absentee table (absent rows), Manpower databank table (code/name/dept/section/status, section falls back to —), Inactive operators table; each capped at first 100 rows with honest totals. Export workbook gains Time entries, Absentee, Inactive sheets (Roster sheet gains Section column).
- **Boundary:** DA databank omitted — `GET /api/disciplinaryAction` has no agency filter (single-`employeeId` only); filed REC-20260914-AGENCY-DA-DATABANK-NO-SCOPE (Proposed). Absence reasons/DA status from the xlsx have no HRIS field and are not invented.
- **Proof:** contract spec 7/7, eslint 0 errors, live browser probe (agency-test) PASSED — overview cards + all 4 report tables visible, screenshots `.runtime/agency-pack-proof/`. TEST-agency data is thin (zeros are honest, not stubs). Not pushed.
- **Dual-app:** single-app exception (no emp-app agency counterpart).

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
Operator request 2026-09-10: rename user-facing **Preview Payroll** to **Payroll Management** on `/hr/run-payroll` — the surface previews dry-run amounts but also manages manual additions/deductions (2026-09-08 quick-adjust: per-row `Adjust` + auto re-run, OAD/NEGADJ enrollments pinned to the OPEN period).

## Category
copy-only + docs-only (AI-agent delivery). No money logic, API, auth, or persistence change.

## Packages
- bandai-infra/hris-app
- Dual-app: **HR-only (no emp counterpart)** — Run Payroll has no employee-app surface.

## Changes
- `app/components/templates/common/run-payroll-template.tsx` — Quick Actions button + results H1 now `Payroll Management`; `Managed rows` count labels; `Run Management` / `Retry management` buttons; `Computing payroll management…` / `Could not compute payroll management` states; `Payroll management employees` tooltip; journey comments updated. `Preview only` badge and dry-run explanatory copy kept (still truthful: the run itself creates no payslips/period-status writes).
- `app/lib/utils/payroll-preview-modal.ts` — `previewPayrollModalTitle` now returns `Start Payroll Management` / `Payroll Management running` / `Payroll Management failed` / `Payroll Management`. Technical URL action (`preview-payroll`), testIDs, and helper/function names unchanged by design (deep-link stability).
- `app/lib/utils/payroll-preview-modal.test.ts` — title expectations + test names updated.
- `tests/smoke/hr-payroll-management-audit.spec.ts` — needles/matcher accept `Payroll Management` (keeps `Preview Payroll` as fallback).
- `CHANGELOG.md` — Unreleased entry for the rename.
- Root `.wwg/wiki/terminology.md` — `Payroll Preview` term row renamed to `Payroll Management` with former-name note; technical contract documented as unchanged.

## Truth delta
YES — user-facing name of the Run Payroll dry-run + adjustment journey is now **Payroll Management** (root terminology synced). Engine semantics (dry-run, estimate-only non-APPROVED rows, APPROVED-only Start Payroll) unchanged.

## Drift
LOW — labels/comments/tests/docs only. Untouched: payroll engine, API routes, URL `action` values, `data-testid`s, function/variable names, `special-payroll-modal.tsx` ("Preview failed" there is a different surface), device-events `Retry preview` (different surface), emp-app (no counterpart).

## Verification
- vitest `app/lib/utils/payroll-preview-modal.test.ts`: 7/7 passing.
- `tsc --noEmit` filtered to touched files: only pre-existing `run-payroll-template.tsx(2231,5)` name-type error (matches prior handoff note) + stock vitest-global `describe/it/expect` noise on `.test.ts` under plain `tsc` (repo uses `tsconfig.test.json` for those); zero diagnostics from this change.
- Browser proof NEEDS_CONFIRMATION (no live dev server run this pass).

## Risks
- None known. If HR bookmarks/search reference the old `Preview Payroll` wording, the URL contract is unchanged so links keep working; only visible copy changed.
