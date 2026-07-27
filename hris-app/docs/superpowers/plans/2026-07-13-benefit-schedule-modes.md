# Benefit Payroll Schedule Modes Implementation Plan

> **Extension (2026-07-14):** Product added third mode `RECURRING` (per-period amount, optional end date, lazy payroll ensure). Durable contract: `docs/BENEFIT_SCHEDULE_MODES.md` and `../hris-api/docs/BENEFIT_SCHEDULE_MODES.md`. WWG truth/terminology/changelogs updated for the extension.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ambiguous benefit date/installment behavior with explicit `TIME_BOUND` and `FIXED_INSTALLMENTS` scheduling modes across the HR modal, API persistence, installment generation, Payroll sourcing, tests, and documentation.

**Architecture:** Store a schedule mode on `EmployeeBenefit`, keep generated `EmployeeBenefitInstallment` rows as the Payroll execution source, and make the API generate rows from either overlapping payroll periods or an explicit installment count. The frontend owns conditional field visibility and preview calculations; the API remains authoritative for validation, persistence, and schedule generation.

**Tech Stack:** React, React Hook Form, Zod, TanStack Query, TypeScript, Express, Prisma Mongo/PostgreSQL schemas, Vitest/Jest-style repository tests, and existing WWG quality scripts.

## Global Constraints

- New records must explicitly use `TIME_BOUND` or `FIXED_INSTALLMENTS`; do not silently default new records to six installments.
- Existing records without a schedule mode remain readable and continue using their existing generated installments.
- Payroll must continue resolving only active/approved, active, non-deleted benefits and marking applied installments as `DEDUCTED`.
- Compensation/deduction direction and reconciliation behavior remain unchanged.
- Frontend visibility is not authorization; API validation and persistence tests are required.
- Every new or modified function must have at least five meaningful test cases under WWG governance.
- Do not mutate shared or production databases, run destructive migrations, or deploy.

---

## File Map

### Backend repository: `../hris-api`

- Modify `prisma/schema/employeebenefit.prisma` and `prisma/schema-postgres/employeebenefit.prisma`: add the schedule-mode enum and persisted field.
- Modify `zod/employeebenefit.zod.ts`: validate schedule mode and mode-specific input.
- Modify `helper/employee-benefit-program.helper.ts`: normalize schedule settings and generate fixed/time-bound installment rows.
- Modify `app/employeeBenefit/employeeBenefit.controller.ts`: load overlapping payroll periods for time-bound creation/update and pass them to the schedule helper.
- Modify `helper/payroll-benefit-source.helper.ts` and `helper/payroll-period.helper.ts` only if needed to preserve legacy records and consume generated rows consistently.
- Add `hris-api/tests/employee-benefit-schedule.contract.spec.ts`, `hris-api/tests/employee-benefit-schedule.helper.spec.ts`, and `hris-api/tests/employee-benefit-schedule.controller.spec.ts` for validation, schedule generation, and persistence payloads.
- Update backend benefits/payroll documentation and migration notes.

### Frontend repository: `hris-app`

- Modify `app/components/templates/hr/benefits-management-template.tsx`: add schedule mode, conditional fields, preview, and payload construction.
- Modify `app/services/employee-benefit.service.ts` and `app/zod/employee-benefit.zod.ts`: add typed schedule fields.
- Modify `app/lib/hooks/useEmployeeBenefits.ts` if query/mutation types need propagation.
- Add `hris-app/app/components/templates/hr/benefits-management-template.test.tsx` and extend `hris-app/app/zod/employee-benefit.zod.test.ts` for component and contract coverage.
- Update `docs/testing-strategy.md` and the relevant benefits/payroll user documentation.

---

### Task 1: Add backend schedule-mode contract and failing tests

**Files:**
- Modify: `hris-api/prisma/schema/employeebenefit.prisma`
- Modify: `hris-api/prisma/schema-postgres/employeebenefit.prisma`
- Modify: `hris-api/zod/employeebenefit.zod.ts`
- Test: `hris-api/tests/employee-benefit-schedule.contract.spec.ts`

**Interfaces:**
- Produces `BenefitScheduleMode = "TIME_BOUND" | "FIXED_INSTALLMENTS"`.
- Produces `scheduleMode` on create/update employee-benefit input and persisted `EmployeeBenefit` records.

- [x] **Step 1: Write five failing contract tests** covering fixed mode acceptance, time-bound acceptance, missing fixed installment count rejection, missing time-bound end date rejection, and invalid mode rejection.
- [x] **Step 2: Run the focused contract test and verify it fails because the new field/schema is absent.**
- [x] **Step 3: Add the enum and nullable/default-compatible persisted field to both Prisma schema tracks.** Use a compatibility-safe default for existing rows and ensure new API/UI payloads always provide the mode.
- [x] **Step 4: Extend Zod schemas with the enum and cross-field rules.** Keep existing legacy payloads parseable while requiring mode-specific fields when a mode is supplied.
- [x] **Step 5: Run the focused contract tests and Prisma type generation/check command.**
- [x] **Step 6: Commit the backend contract changes.**

---

### Task 2: Implement schedule normalization and installment generation

**Files:**
- Modify: `hris-api/helper/employee-benefit-program.helper.ts`
- Test: `hris-api/tests/employee-benefit-schedule.helper.spec.ts`

**Interfaces:**
- Add `BenefitSchedulePeriod { id: string; startDate: Date; endDate: Date }`.
- Add `buildBenefitInstallments(benefitId, benefit, periods?)`, returning scheduled installment rows.
- Keep the existing legacy call signature behavior when `scheduleMode` is absent and installments already exist.

- [x] **Step 1: Write at least ten failing helper tests** for fixed count, one installment, rounding remainder, invalid count, missing start date, time-bound period selection, date boundary inclusion, no overlapping periods, inactive status exclusion at caller boundary, and legacy six-installment compatibility.
- [x] **Step 2: Run the focused helper tests and verify the new cases fail.**
- [x] **Step 3: Implement fixed-installment generation.** Divide total amount by the requested count, schedule at the existing 15-day cadence, and put the centavo remainder in the final row.
- [x] **Step 4: Implement time-bound generation.** Use the supplied payroll periods whose dates overlap the inclusive start/end range; generate one row per selected payroll period, divide the amount across those rows, and put the remainder in the final row.
- [x] **Step 5: Update normalization so new explicit modes do not receive an implicit six-installment count; retain compatibility defaults only for legacy payloads without `scheduleMode`.**
- [x] **Step 6: Run the helper test file and typecheck.**
- [x] **Step 7: Commit the helper implementation and tests.**

---

### Task 3: Wire API create/update to authoritative time-bound generation

**Files:**
- Modify: `hris-api/app/employeeBenefit/employeeBenefit.controller.ts`
- Test: `hris-api/tests/employee-benefit-schedule.controller.spec.ts`

**Interfaces:**
- Create/update handlers query organization payroll periods overlapping a time-bound benefit.
- Controller passes those periods to `buildBenefitInstallments` and persists the generated rows.

- [x] **Step 1: Write at least ten failing controller/service tests** for fixed create, time-bound create, missing periods, invalid date range, pending benefit without installments, approved/active benefit with installments, update without duplicate installments, organization scoping, payroll-period linkage, and API validation error responses.
- [x] **Step 2: Run the focused controller test and verify it fails.**
- [x] **Step 3: Add a small controller-local/query helper that fetches only the organization’s payroll periods overlapping the requested time-bound range.**
- [x] **Step 4: Pass the fetched periods into schedule generation for create and update.** Do not generate time-bound rows from arbitrary calendar dates when payroll periods are available.
- [x] **Step 5: Preserve the existing active/approved gate and ensure pending/cancelled records do not create scheduled rows.**
- [x] **Step 6: Prevent update from duplicating existing installment rows; only create missing schedules for compatible legacy records.**
- [x] **Step 7: Run API contract/controller tests, Prisma typecheck, and the relevant API quality test command.**
- [x] **Step 8: Commit the API wiring changes and tests.**

---

### Task 4: Preserve Payroll source behavior and add regression coverage

**Files:**
- Modify: `hris-api/helper/payroll-benefit-source.helper.ts` only when required by the explicit schedule mode contract
- Modify: `hris-api/helper/payroll-period.helper.ts` only when required by the explicit schedule mode contract
- Test: `hris-api/tests/payroll-benefit-source.helper.spec.ts`
- Test: `hris-api/tests/payroll-benefit-integration.spec.ts`

**Interfaces:**
- Existing `resolvePayrollBenefitSource` continues consuming generated installment rows.
- `SCHEDULED` rows are selected once for their payroll period and become `DEDUCTED` after successful payroll processing.

- [x] **Step 1: Write at least ten regression tests** for fixed-mode due installment selection, time-bound due installment selection, out-of-range exclusion, benefit-period exclusion, compensation aggregation, deduction aggregation, legacy amount fallback, duplicate-processing protection, deducted-state persistence, and payroll-period mismatch exclusion.
- [x] **Step 2: Run the focused regression tests and verify any missing expectations fail.**
- [x] **Step 3: Make the smallest compatibility change necessary so Payroll uses generated schedules without changing direction/reconciliation calculations.**
- [x] **Step 4: Run the focused payroll tests and the existing payroll source-truth quality suite.**
- [x] **Step 5: Commit only the payroll compatibility/regression changes.**

---

### Task 5: Add frontend schedule selector, conditional fields, and preview

**Files:**
- Modify: `hris-app/app/components/templates/hr/benefits-management-template.tsx`
- Modify: `hris-app/app/services/employee-benefit.service.ts`
- Modify: `hris-app/app/zod/employee-benefit.zod.ts`
- Modify if needed: `hris-app/app/lib/hooks/useEmployeeBenefits.ts`
- Test: `hris-app/app/components/templates/hr/benefits-management-template.test.tsx`

**Interfaces:**
- Form data includes `scheduleMode`, optional `totalInstallments`, and the existing total amount/date fields.
- Create/update payloads send explicit `scheduleMode` and only the relevant mode-specific fields.

- [x] **Step 1: Write at least ten failing UI/form tests** for default mode, time-bound field visibility, fixed-installment field visibility, mode switching cleanup, missing time-bound end date, invalid installment count, amount preview, rounding preview, create payload, and edit compatibility.
- [x] **Step 2: Run the focused frontend tests and verify they fail.**
- [x] **Step 3: Add `scheduleMode` to the form schema and typed service request interfaces.**
- [x] **Step 4: Add the schedule selector and conditional fields to the modal.** Use existing Select/Input/DatePicker patterns and explain the behavior in plain language.
- [x] **Step 5: Add a pure preview calculation in the component or a small testable utility.** Show estimated installment count and amount; do not treat this preview as the API authority.
- [x] **Step 6: Clear irrelevant fields when switching modes and construct explicit API payloads.**
- [x] **Step 7: Preserve view mode, edit mode, payroll-period prefill, and benefit-type direction display.**
- [x] **Step 8: Run focused frontend tests, typecheck, and lint.**
- [x] **Step 9: Commit the frontend form changes and tests.**

---

### Task 6: Update documentation and WWG-facing test evidence

**Files:**
- Modify: `hris-app/docs/testing-strategy.md`
- Modify: the relevant benefits/payroll user guide or module documentation discovered by `rg -n "benefits management|payroll adjustment|employee benefit" hris-app/docs hris-api/docs`
- Modify only if durable terminology requires it: `hris-app/.wwg/wiki/terminology.md`, `hris-app/.wwg/wiki/project-truth.md`, `hris-api/.wwg/wiki/terminology.md`, or `hris-api/.wwg/wiki/project-truth.md`
- Add/update: focused test evidence notes under the appropriate repository test/report documentation

- [x] **Step 1: Document the two schedule modes, required fields, generated installment behavior, and the fact that Payroll applies scheduled rows later.**
- [x] **Step 2: Document frontend/API test ownership and the focused commands used for this feature.**
- [x] **Step 3: Reconcile only accepted durable terminology into WWG truth files; preserve generated sections and do not overwrite inferred truth.**
- [x] **Step 4: Run documentation/link/repository hygiene checks.**
- [x] **Step 5: Commit documentation and evidence updates.**

---

### Task 7: Full verification and handoff

- [x] **Step 1: Run backend focused schedule tests, payroll source-truth tests, typecheck, and the required API CI/source-truth quality commands.**
- [x] **Step 2: Run frontend focused benefits tests, app test-obligation checks, typecheck, lint, and the relevant deterministic smoke test.**
- [x] **Step 3: Inspect both repository diffs and status for unrelated changes, generated artifacts, weakened tests, or missing documentation.**
- [x] **Step 4: Record behavior changed, tests added, commands/results, manual verification, remaining risks, and WWG surfaces updated.**
- [x] **Step 5: Use the verification-before-completion and requesting-code-review skills before claiming completion.**

> Task 7 evidence: `.superpowers/sdd/task-7-report.md`. Full repo typecheck/lint remain pre-existing red baseline debt outside this feature; focused schedule suites and payroll source-truth passed.

