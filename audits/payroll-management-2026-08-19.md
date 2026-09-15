# Payroll Management audit

**Date:** 2026-08-19  
**Sheet:** Payroll Management (section 3) — claimed Core 100%, Customization 100%, Testing 94.25%, module **98.08%**  
**Kind:** live API with real users **plus** Playwright hops (not page-open only)  
**Answer to “is it 100% / can generate create records?”:** **No, not 100%.** Payroll **does** create `EmployeePayroll` rows when a generate actually ran. **Payslip PDFs were not created.** Current August cut cannot generate for Zen.

---

## Actors used (actual users)

| Actor | Login | Role | Employee |
|---|---|---|---|
| HR | `hr-manager@seed.local` / `Password123!` | `bnpi-pats-hr-manager` | Maria Santos `EMP-HR-MGR-001` |
| Employee | `employee@seed.local` / `Password123!` | `bnpi-pats-employee` | Juan Mendoza `EMP-SW-DEV-001` |
| Subject | (HR API as Maria) | DIRECT | Zen Andrei `00010` `cmspnnxot02s5qw01yk7yy2er` |
| Admin | `admin@bandai.local` / `password123` | login only | same payroll count **46** |

App `http://localhost:5175` · API `http://localhost:3001` · DEV DB `127.0.0.1:55435`  
Evidence: `.runtime/payroll-mgmt-audit-20260819-204314/` · UI shots `.runtime/payroll-mgmt-audit-20260819-204314/ui/`

---

## Verdict vs the sheet

| Claim on sheet | Live 2026-08-19 |
|---|---|
| 3 Payroll Management 98.08% | **Wrong.** Screens exist. Generate/payslip/correction/EPP/last-pay are not all working for real users. |
| 3.1 Core 100% | **Not 100%.** Engine + historical rows exist. Current cut blocked. No payslip files. EPP is mock. Last pay unused. |
| 3.2 Customization 100% | **Not 100%.** Correction **code** exists. Generic request create **400**. **0** correction records. Workflow UI has no Payroll Correction tab. |
| 3.3 Testing 94.25% | Unit/function files exist. This audit is the first live sheet-3 pass. No UAT screen. |

---

## Does generate / payslip create records?

| Action | Writes a record? | Live proof | What the user sees |
|---|---|---|---|
| **Start Payroll** / `POST …/generate-timesheet` | **Yes** — `EmployeePayroll` | **46** rows in DEV: **35** on Jun P1 `PP-20260611-20260626` + **11** on Jul P1 `PP-20260711-20260726`. Sample `cmsf94zsv07u6mx01v6katg5p` employee **00169** John Emerson Lasin: basic ₱14,600 / gross ₱16,961.42 / net ₱13,643.90 / hourlySalary ₱165.91 / `isPaid=false` | Run Payroll **Start Payroll** is live. Current Aug cut: **0** approved timesheets → **0** new rows if you start it now |
| **Preview Payroll** | **No** | Aug preview 200. Zen excluded `missing_timesheet`. Included = **0**. Estimated net **₱0** | Preview modal is dry-run (project truth) |
| **Generate payslips** | **Yes, but gated** — PDF + `metadata.payslip` only after period **COMPLETED** **and** release attachment | Jul COMPLETED → **409** “Upload the payslip release attachment…”. Open/Draft → **409** “only after … completed”. Four sampled payrolls have `payslip=null` | Employee My Payroll: **No payslips found** |
| **Release payslips** | Not run | Blocked by missing attachment | Employees cannot see payslips |
| **Special / last pay** | **Yes** if a run is created (`SpecialPayrollRun` + `SpecialPayrollPayslip`) | **0** runs. Juan special payslips **[]** | Special Payroll button exists on Run Payroll |
| **Loans** | **Yes** — `EmployeeLoan` | **1,321** ACTIVE loans. Notes: `BNPI Deduction Mass Upload … DEDCODE=BNPISALLN`. Types include **BNPI Salary Loan** | No employee “apply for salary loan” request type |
| **Allowances / benefits** | **Yes** — `EmployeeBenefit` | **7,472** enrollments. UNIDED **13** | Benefits Management screen exists (slow first paint) |
| **Payroll correction** | **Yes** via `POST /api/timesheet/:id/payroll-corrections` (`Request` + `PayrollCorrection`) | Generic `POST /api/request` type `PAYROLL_CORRECTION` → **400** (zod enum). **0** existing corrections | Workflows UI: Leave / Timesheet / Documents / PAN only |

Jun P1 register (metrics, not a generate this turn): processed **35** / pending **2,026** / paid **0** / gross ₱668,470.64 / loans ₱2,797.90 / net ₱537,635.71.

---

## Current August cut (why generate will not create Zen’s row)

| Fact | Value | Class |
|---|---|---|
| Period | `PP-20260811-20260826` OPEN · 11–25 Aug · pay 31 Aug | confirmed |
| Approved timesheets | **0** / 507 | `apply_path` |
| Payroll-ready / payable now | **0** (Run Payroll sidebar) | matches API |
| Zen `00010` preview | excluded · `Timesheet is missing for this payroll period.` | `export_gap` |
| Zen timesheet `cmswwobaz05mxlp01e8p71f9q` (WWG 2026-08-17) | **404 Timesheet not found** | `CONFLICTING` vs 08-17 truth |
| Aug `EmployeePayroll` | **0** | no generate yet |
| Line OT | **0h** · policy still requires approved OT | matches 08-18 OT addendum |

Starting payroll **now** would not invent rows for people without **APPROVED** timesheets. It would not create Zen’s payslip.

---

## 3.1 Core

| ID | Sheet row | Route / API | Feature? | Live result | Proof |
|---|---|---|---|---|---|
| 3.1.1 | Payroll processing, payslip generation, last pay | `/hr/run-payroll` · generate-timesheet · generate-payslips · `/special-payroll` | Yes (split) | **Partial.** Run Payroll loaded Aug 11–25, **Start Payroll** + **Preview** + **Special Payroll**. Historical **46** payroll rows. **No payslip files.** Special runs **0**. Last/final pay is Special Payroll, unused | UI `3.1.1-run-payroll.png` + later loaded `3.1.6-adjustments.png`; API counts |
| 3.1.1b | Payroll Records | `/hr/hr-payroll` | Yes | **Fail vs Run Payroll.** UI: “No active payroll period found for today.” Run Payroll **does** show Aug 11–25. Records page filters `startDate<=today,endDate>=today` and missed the OPEN cut | `3.1.1b-payroll-records.png` |
| 3.1.1c | Employee payslips | `/hr/payroll` as Juan | Yes | **Working empty.** Recent Payslips **No payslips found.** YTD ₱0. Matches 0 payslip files | `3.1.1c-employee-payroll.png` |
| 3.1.2 | EPP + BNPI salary loan + allowances | `/employee/benefits/epp` · `/hr/benefits-management` · `employeeLoan` | Split | **Partial / fail EPP.** HR Benefits Management exists + Bulk upload. **1,321** loans + BNPI Salary Loan type. EPP is a **mock Gundam store**, not a loan/EPP deduction app. Juan has **0** loans / **0** benefits | `3.1.2b-epp.png`, loan APIs |
| 3.1.3 | Mass upload compensation / deductions | `/admin/configuration/migration` · `POST /api/migration/dm3/import-*-mass-upload` | Yes | **Partial.** Migration DM1–DM4 screen opens. History GET **0 items**. Loans still carry “BNPI Deduction Mass Upload” notes from 2026-08-04 — records exist, list is empty | `3.1.3-mass-upload.png` |
| 3.1.4 | Uniform / loan reports / payroll summary / labor cost | `/hr/reports/payroll` · metrics `payrollSummary` | Split | **API works / UI slow.** Payroll Reports first paint “Loading payroll metrics…”. Jun P1 summary **200** with 35 processed. Uniform is a register column (`uniformDeduction`), not its own report. Labor cost = workforce Direct/Indirect, also still loading | `3.1.4-payroll-reports.png`, `summary-jun-p1.json` |
| 3.1.5 | Overtime summary Agency & Direct | `/hr/reports/attendance?tab=overtime` · OT readiness | Yes | **Working as 0.** Overtime Report chrome. Aug metrics **0h / 0 people**. Run Payroll Approved OT **0**. No Agency vs Direct split on that tab | `3.1.5-overtime-summary.png`, `ot-readiness-aug.json` |
| 3.1.6 | Adjustments | Run Payroll **Payroll Adjustments** | Yes | **Working chrome, 0 rows.** Attendance / Allowances / OT / Deductions / Loans / Other. “0 of 0 employee benefits for this period” | `3.1.6-adjustments.png` |

---

## 3.2 Customization

| ID | Sheet row | Route / API | Feature? | Live result |
|---|---|---|---|---|
| 3.2.1 | Payroll Correction Request | Timesheet modal · `POST /api/timesheet/:id/payroll-corrections` | Code yes | **Partial.** Dedicated create path exists. Generic `/api/request` **rejects** `PAYROLL_CORRECTION` (zod missing the prisma enum). **0** requests. Juan My Requests has New Request but no loan/correction type in API enum |
| 3.2.2 | Payroll Correction Approval Workflow | `/hr/request-process` · `/hr/approvals/requests` | Partial | **Fail UI.** Request Workflows tabs: Leave, Timesheet, File Documents, PAN. **No Payroll Correction.** Approvals table skeleton / empty |
| 3.2.2b | Next Payroll Adjustment | `PayrollCorrection` target period + Run Payroll adjustments | Code yes | **Not proven live.** Model can pin a future period. **0** applied corrections. Adjustments accordion is benefit/loan lines, not next-period correction ledger |

---

## 3.3 Testing (not a UI section)

| ID | Sheet | Claimed | What exists |
|---|---|---|---|
| 3.3.1 | Unit | 100% | mocha/vitest around generate snapshot, preview modal, correction form helpers |
| 3.3.2 | Function | 95% | Service/hook tests. Not a per-row function pack |
| 3.3.3 | E2E | 92% | Harness `payroll-correction-modal.spec.ts` + this live audit. Not full-sheet e2e |
| 3.3.4 | UAT | 90% | No UAT product surface |

---

## Residual: why sheet 98% is inflated

| Bucket | Count / state | What it is | Blocker class | Next step |
|---|---|---|---|---|
| Current Aug generate | 0 included / 871 excluded | No APPROVED timesheets; Zen timesheet **deleted** | `export_gap` + `apply_path` | Recreate/approve Zen Aug timesheet, then preview, then scoped generate if operator asks |
| Payslip files | 0 on sampled 46 payrolls | Generate payroll ≠ generate payslip. COMPLETED Jul needs release attachment | `apply_path` | Upload release attachment on Jul P1, then `generate-payslips` (not done this audit) |
| Payroll Records vs Run Payroll | 1 UI miss | Records says no period today; Run Payroll shows Aug 11–25 | `code_defect` | Fix `startDate<=today,endDate>=today` filter / date compare |
| EPP | 1 mock page | Merch store, not payroll EPP | `optional_product` / missing | Do not score as salary-loan/EPP |
| Employee loan apply | 400 | `LOAN` not a request type | `optional_product` | Loans are HR/mass-upload enrollments |
| Payroll correction records | 0 | Dedicated API unused; generic create 400 | `code_defect` (zod) + `apply_path` | File via timesheet locked path; add type to request zod |
| Last pay / special | 0 runs | Special Payroll unused | `apply_path` | Only if operator needs a final/special cut |
| Mass-upload history | 0 list / 1321 loan rows | History table empty; leftover enrollments remain | `export_gap` | Don’t treat empty history as “never imported” |
| Fleet money tally | still not green | Jun 26–Jul 10 preview vs Sheet2 (prior WWG) | existing | Separate tally job; not this audit |

### Per-row samples

| vendor / person | Period | Record | Why it matters |
|---|---|---|---|
| **00169** John Emerson Lasin | Jun P1 OPEN | `EmployeePayroll` `cmsf94zsv07u6mx01v6katg5p` net ₱13,643.90, **no payslip** | Generate **did** write money; payslip step **did not** |
| **00024** Augusto Libuit | Jun P1 | summary row 1 UNPAID | Register exists |
| **00010** Zen Andrei | Aug P1 OPEN | preview `missing_timesheet`; old TS **404** | Cannot generate his Aug payroll |
| **EMP-SW-DEV-001** Juan Mendoza | any | 0 payroll, 0 loan, 0 benefit, 0 payslip | Seed employee is not on BNPI register |
| Loan `cmse2k5jn00mgnxmo2hjsmcoj` | Jun P1 notes | ACTIVE ₱650/cut BNPISALLN | Mass-upload **created** loan records |

### UI / API source

- Run Payroll: `/hr/run-payroll` · preview `GET /api/payrollPeriod/:id/generate-timesheet/preview?calculateRows=true` · start `POST …/generate-timesheet`
- Payslips: `POST /api/employeePayroll/period/:id/payslip-release/generate-payslips`
- Records: `/hr/hr-payroll` · `GET /api/employeePayroll?count=true`
- Employee payslips: `/hr/payroll` (Juan)
- Corrections: `POST /api/timesheet/:id/payroll-corrections` (not `POST /api/request`)

---

## How to re-run

```powershell
# API (DEV DB must be on 55435)
powershell -File .runtime/payroll-mgmt-audit-20260819-204314/run-pass3.ps1
powershell -File .runtime/payroll-mgmt-audit-20260819-204314/run-focus.ps1

# UI
cd bnpi-pats-app
npx playwright test tests/smoke/hr-payroll-management-audit.spec.ts tests/smoke/hr-payroll-management-audit-employee.spec.ts --reporter=list
```

This file in `audits/` is the human write-up. Do **not** treat 98.08% as UAT sign-off.
