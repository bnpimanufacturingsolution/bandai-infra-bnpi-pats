# Apr 26 – May 10, 2026 cutoff: DEV payroll generation + client-register parity (2026-09-15)

Task mode: mixed data + engine fix (operator: "generate a payroll on the system for the same cutoff and compare where is the issue of mismatch"; then "go, make sure it is well documented").

## Inputs

- Client registers: `PAYROLL 2026/` (9 cutoffs Dec 26 2025 – Apr 26-May 10 2026, password 9090 via Excel COM) + target `confidential-files/HRIS Payroll Computation April 26 - May 10, 2026.xlsx`.
- Same-pack mass uploads executed on canonical DEV (K3s 55435 via local API :3001):
  - `Compensation Mass Upload 04.30.26.xlsx` → total=173 created=172 failed=0
  - `Compensation Mass Upload 04.30.26_additional.xlsx` → created=91 updated=3 failed=0
  - `Deduction Mass Upload 04.30.26.xlsx` → created=8 updated=6 failed=0
- Pre-existing period state: `Period 2 - Apr 2026` (`cmpxw139n00117zwsipy7md5r`, code `PP-20260426-20260511`), OPEN, 837 APPROVED timesheets (Sep-11 backfill), 2,249 in-period benefits, 0 payrolls.

## Generation (DEV)

- Pass A `bcb0ffa5`: 834/834, 825 success + 9 transport-flap rows (recovered).
- Pass B `c7a466a9` (all-unpaid refresh): 834/834.
- Pass C (post-waiver regen) `dade8bfd`: 834/834 completed; 27 rows hit forward flaps mid-pass and retain valid earlier-pass data; zero nulls.
- Rows: 834 `EmployeePayroll`, all unpaid, period COMPLETED. Export: `.runtime/dev-payroll-test-20260914/Payroll-Apr26-May10-DEV.xlsx` (Register/Summary/MoneySources, client column letters G→CW).

## Client zero-pay rule (proven, then implemented)

Audit across all nine client registers: 128 zero-GrossPay rows, **every one TOTAL DEDN = 0** — client books no statutory deduction on a cutoff that pays nothing. Engine already waived loans/benefits (`applyZeroSalaryGuardrail`) but charged the Aug-25 salary-based PhilHealth schedule (00091 = 17,300×2.5% = 432.50; 01303 = 15,950×2.5% = 398.75 — both zero-pay, TR tied to the peso, only the deduction line differed).

Fix: `waiveZeroPayContributions()` in `hris-api/helper/payroll-period.helper.ts`, called in BOTH generate + preview twins immediately after `resolveBandaiPhilHealthCutoffContribution`. Regression: `hris-api/tests/zero-pay-contribution-waiver.spec.ts` (5 passing incl. twin source contract). Neighboring specs green (PH schedule + missing-punch: 16). tsc delta 0 (68 pre-existing).

## Tally effect (measured, predicted before shipped)

| | before | after |
|---|---|---|
| TALLIED | 0 | **2** (00091 Gonzales, 01303 Abarracoso) |
| totalDedn fails | 834 | 832 |

## Loan "duplicate" audit — hypothesis REJECTED with data

00138's RCBC 6,854.26 vs register 3,427.13 looked like a double enrollment. Fleet audit of every `EmployeeLoan` schedule covering 2026-04-26..05-10: 1,182 window loans, 1,182 unique emp+loanType groups, **0 duplicates** (`.runtime/dev-payroll-test-20260914/loan-dup-audit.json`). It is ONE loan where `monthlyPayment` is charged whole per cutoff while the client's register charges half per cutoff. NOT changed in code — engine semantics need the client's answer first (filed REC-20260915-LOAN-MONTHLY-VS-CUTOFF-AMORTIZATION). Existing residual loan gaps remain the §14c client-data class.

## Remaining mismatch walls (Apr 26–May 10, app − register)

| Field | fails | gap | class |
|---|---|---|---|
| absent | 268 | +₱241,349 | absence/Saturday policy wall (client ruling + day-status data) |
| late | 262 | +₱95,069 | late/UT source basis (client minute data) |
| totalDedn (non-zero-pay) | 832 | +₱204,710 | composition incl. tax cascade + loan amortization basis + §14c client data |
| tax | 308 | −₱56,604 | cascade of above |
| pfa | 164 | −₱32,800 | no PFA rule/enrollment in engine (client pays ₱200 perfect attendance) |
| numberOfDays | 146 | −236 days | known register-definition mismatch |
| leavePay | 2 | −₱11,400 | residual manual client exclusions |
| (register-only people) | 15 codes | adds to gap | no app timesheet: 00396 00679 00782 00836 00852 00985 00987 01113 01127 01228 01370 01432 01523 01730 01775 |

OT is the strongest area: 737 people OT-hours exact.

## Infra truth re-proven this session

The 55435 Cloudflare-SSH forward flaps on a minutes cycle under heavy writes; the 2026-09-14 stability fixes (no-exit on unhandledRejection + guarded migration events + tsx-CLI DM4.3 verification spawn) held — the API survived every flap; only transport-level row retries were needed. During this pass a stale stash-pop conflict marker in `migration-event.service.ts` (left by a concurrent session's autostash) blocked boot; resolved to the committed guarded version (`git checkout HEAD -- <file>`), their stash untouched.

## Boundary / next

- DEV test lane only; UAT/PROD untouched (PROD still lacks all post-2026-07-24-clone data, see prod-jul1125 check).
- PFA award rule, the 15 missing people, and the loan amortization semantics are candidate next steps (Proposed in registry, not implemented).
- Evidence: `.runtime/tally-PP-20260426-20260511-*` (2 runs), `.runtime/dev-payroll-test-20260914/` (audit json, exports, job logs), `docs/BNPI_PAYROLL_APP_VS_FILE_FINDINGS_20260813.md` §14h.
