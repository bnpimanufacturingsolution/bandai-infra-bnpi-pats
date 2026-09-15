# WWG Report — Payroll Domain Audit (2026-09-03)

**Status:** `DOCUMENTED`
**Scope:** payroll domain on restored `develop` (`d78afe29`; working tree = `9d51fa63` + handoff-only diff, so file/line evidence applies to both)
**Method:** read-only. `git grep`/`git ls-tree` wiring proof + local mocha runs (no DB writes). No code, config, or data modified.
**Non-goals:** live-DB tally re-verification (818-employee compare), frontend deep audit, `uat` branch, develop CI runner failure (separate open item).

## Executive summary

Post-restore, the payroll domain is **intact and internally consistent on the money path**. All BNPI register rules verified live in `generatePayrollFromTimesheets` / `previewPayrollFromTimesheets` (Path A/B, 313 basis, FILE_DUAL), Run Payroll OT readiness is wired, and **184/184 tests pass** across the 22 runnable payroll specs. Five findings below are hygiene/latent-class issues; none affect current money math with `enableAutoApprove=false`.

## Findings

| # | Finding | Class | Severity | Evidence |
|---|---|---|---|---|
| F1 | Org-policy auto-approve (PR #9) is **misattributed in Run Payroll OT readiness** when flag is ON: submitter's own id stamped as `approvedBy` and `resolveOtApprovalMeta` ignores the `ORG_POLICY_ENABLE_AUTO_APPROVE` metadata marker → UI shows "Manager approved" by the employee themselves. Latent (flag OFF in live config). | code_defect (labeling/audit) | P2 latent | `timesheet.controller.ts:4672-4683` (`approvedBy = employeeId`), `:4860-4876`; `payroll-ot-readiness.helper.ts:238-299` (only checks `bandaiPayrollSourceRepair.*`) |
| F2 | `tests/unit/payroll-generation-job.service.test.ts` is **vitest-based in a mocha repo** (`import … from "vitest"`) and vitest is not installed → MODULE_NOT_FOUND. It never runs: `npm test` glob is `tests/**/*.spec.ts`, file is `.test.ts`; CI bnpi-pats-api job runs only source-truth regression. Net: `PayrollGenerationJobService` (durable job/orphan logic) has **zero executed coverage** despite an existing spec. | test_gap | P2 | spec line 1-2; `package.json` `test` script; `ci.yml` bnpi-pats-api job (single "Source-truth tests" step) |
| F3 | `payroll-calculator.helper.ts` `calculatePayrollBreakdown` is **test-only** (sole consumer `tests/wwg/payroll-attendance.behavior.spec.ts`) and its rate basis (`basicSalary / scheduleWorkDays` for MONTHLY) **contradicts** the production BNPI register basis (`×12/313`, Path A/B in `payroll-period.helper.ts`). If ever wired in, basic-pay math regresses. | dead_code / drift risk | P3 | `payroll-calculator.helper.ts:110-120,240-241` vs `payroll-period.helper.ts:380,470-510`; repo-wide grep: no `app/` call sites |
| F4 | The OT-import auto-approve chain (`bandai-payroll-ot-auto-approve.helper.ts`, `bandai-ot-line-patch.helper.ts`) is **ops-script-only**: consumed solely by `scripts/repair-bandai-payroll-source-timesheet-lines.ts` (manual workbook repair). No API route/cron uses it. Intentional DM4.3 operator path, but undocumented in the root wiki — readiness blockers (`timesheet_not_approved`) can only be cleared by hand-run script. | doc_gap (design confirmed, not wired in-app) | P3 | helper imports repo-wide; `bandai-ot-line-patch.helper.ts:227`; `migration.controller.ts:973` (filename regex only); script header |
| F5 | CI scope for bnpi-pats-api is **only** `test:regression:payroll-source-truth`; the 22 payroll specs (184 tests) run locally green but are not CI-enforced. Full `npm test` (all `tests/**/*.spec.ts`) never runs in CI either. | test_gap (CI) | P3 | `.github/workflows/ci.yml` bnpi-pats-api job |

## Verified-healthy (wiring proof)

- **BNPI register rules live in production paths:** `resolveBnpiAttendanceDailyRate` + `resolveBandaiRegisterBasicPay` called at `payroll-period.helper.ts:2002/2029` (generate) and `:5091/:5116` (preview); `BANDAI_DIRECT_ANNUAL_WORK_DAYS=313` at `:78`; Path A `FILE_DAILY_OVER_8_APPROVED_BUCKETS` / Path B `BNPI_DIRECT_313_APPROVED_BUCKETS` as documented in the 2026-08-13 findings.
- **Run Payroll OT readiness wired:** `payrollperiod.controller.ts:1079-1080` → `getPayrollPeriodOtReadiness`; perf strategy (SQL line-agg, page-scoped deep load) intact.
- **Live helpers confirmed in use:** `resolvePayrollPreviewReadiness` (`:3767`, `:5370`), `payroll-source-display.helper.ts` (`employeepayroll.controller.ts:47`).
- **Generation job observability honest:** `payroll-generation-job.service.ts` exposes processed/success/failed/errors, heartbeat `updatedAt`, pause/cancel request fields, orphan detection — aligns with the Long-Running Job Observability Rule.
- **PR #9 interplay benign on money path:** org-policy auto-approve produces status `APPROVED` → readiness counts it payable (`classifyPerson` line 215); only the *label* is wrong (F1).
- **Tests:** 184 passing / 0 failing across all runnable payroll specs (`TESTEXIT=0`), DB-logger noise from offline `10.184.37.19:15433` is the known non-fatal pattern.

## Follow-ups registered

- `REC-20260903-OT-READINESS-POLICY-AUTOAPPROVE-LABEL` (F1)
- `REC-20260903-PAYROLL-GENJOB-VITEST-DEAD-SPEC` (F2)
- `REC-20260903-PAYROLL-CALC-HELPER-TEST-ONLY` (F3 + F5 CI scope)
- F4 to be folded into wiki truth when DM4.3 ops-path documentation is next touched.
