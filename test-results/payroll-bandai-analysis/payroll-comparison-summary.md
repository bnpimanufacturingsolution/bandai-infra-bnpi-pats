# Bandai Payroll Dry-Run Comparison

- Workbook: C:\Users\User\Desktop\AZURO\BANDAI\bandai-infra\.runtime\payroll-comparison-apr26-may10\BNPI PATS Payroll Computation April 26 - May 10, 2026.unlocked.xlsx
- DB: bnpi-pats
- PG_DATABASE_URL used: postgresql://postgres:postgres@127.0.0.1:5433/bnpi_pats?schema=public
- Detected cutoff: 2026-04-26 to 2026-05-10
- Payroll period: PP-20260426-20260511 (OPEN)
- Dry-run only: yes
- Run Payroll reuse: used previewPayrollFromTimesheets

## Counts

- Sheets parsed: Sheet2
- Workbook rows parsed: 849
- Employees matched: 844
- Approved timesheets found: 0
- Exact row matches: 0
- Tolerance row matches: 0
- Mismatch/skipped rows: 849
- Skipped rows: 849

## Timesheet Calculation Coverage

- NO_EMPLOYEE: 5
- NO_TIMESHEET: 844
- Approved rows use the production payroll preview. Non-approved rows, when present with effective lines, use a diagnostic dry-run from effective `Timesheetline` rows so calculation differences can still be inspected without marking them payroll-ready.

## Source Gap Summary

- Rows requiring approved OT/OTR source: 0
- Rows requiring allowance source import: 0
- Rows requiring deduction or loan source import: 0
- Rows requiring withholding-tax/statutory source verification: 0
- Rows with timesheet source missing: 844
- Rows with employee source missing: 5
- Repair-candidate field comparisons after source gaps are resolved: 0

## Reconciliation Repair Plan

- Guardrail: payroll preview must keep reading approved `Timesheet` plus effective `Timesheetline` snapshots for this cutoff. Do not change payroll math just to match workbook totals while OT, allowances, statutory config, loans, or missing approved timesheets are still classified as source gaps.
- First repair/import source gaps: approved OT/OTR, allowance/benefit earnings, payroll-only loans/deductions, statutory configuration/source splits, then missing approved timesheets.
- Only after those sources exist should `BNPI_PATS_LOGIC_MISMATCH_REPAIRABLE` rows be treated as calculation or timesheet-line defects.
- Do not repair `grossPay`, `totalDeductions`, or `netPay` directly. They are downstream rollups; fix the classified component that feeds them.

### Top Partial Matches


### Allowance Columns To Import

- No per-column allowance breakdown was captured. Re-run the dry-run script after this helper change.

### Loan/Deduction Columns To Import

- No per-column loan/deduction breakdown was captured. Re-run the dry-run script after this helper change.

## Mismatch Categories

- EMPLOYEE_NOT_FOUND: 5
- TIMESHEET_NOT_FOUND: 844

## Field-Level Matches


## Top Reasons


## Statutory Config Check

- SSS: official SSS contribution guidance states the 15% contribution rate effective January 1, 2025, with MSC up to PHP 35,000; BNPI PATS calculator config should be checked against the active table before treating SSS mismatches as code bugs. Source: https://www.sss.gov.ph/pay-contribution/
- PhilHealth: PhilHealth Advisory 2025-0002 keeps the 5.0% premium rate with PHP 10,000 floor and PHP 100,000 ceiling; employee/employer split should be verified against the calculator config. Source: https://www.philhealth.gov.ph/advisories/2025/PA2025-0002.pdf
- Pag-IBIG: Pag-IBIG Fund Circular No. 460 sets the maximum fund salary increase effective February 2024; BNPI PATS currently needs config/source verification before parity claims. Source: https://naro.law.upd.edu.ph/documents/3217
- BIR: RR 11-2018 Annex E is the current withholding table effective January 1, 2023 onward, including semi-monthly brackets. Source: https://bir-cdn.bir.gov.ph/local/pdf/Annex%20E%20RR%2011-2018.pdf

## Sample Mismatches

### 00021 Salud, Arvin M. (TIMESHEET_NOT_FOUND)
- Recommendation: Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.

### 00024 Libuit, Augusto L. (TIMESHEET_NOT_FOUND)
- Recommendation: Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.

### 00032 Llarena, Ivy Sheena T. (TIMESHEET_NOT_FOUND)
- Recommendation: Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.

### 00050 Almero, Lesley M. (TIMESHEET_NOT_FOUND)
- Recommendation: Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.

### 00062 Ebreo, Danica P. (TIMESHEET_NOT_FOUND)
- Recommendation: Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.

### 00065 Belen, Ma. Angelina L. (TIMESHEET_NOT_FOUND)
- Recommendation: Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.

### 00073 Andal, Marilou S. (TIMESHEET_NOT_FOUND)
- Recommendation: Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.

### 00083 Redondo, Maria Sarah Jane L. (TIMESHEET_NOT_FOUND)
- Recommendation: Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.

### 00088 Domingo, Melroshelle A. (TIMESHEET_NOT_FOUND)
- Recommendation: Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.

### 00091 Gonzales, Melanie M. (TIMESHEET_NOT_FOUND)
- Recommendation: Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.

### 00092 Aguda, Maryann M. (TIMESHEET_NOT_FOUND)
- Recommendation: Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.

### 00093 Medrano, Marianne  A. (TIMESHEET_NOT_FOUND)
- Recommendation: Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.

### 00094 Araja, Liezl J. (TIMESHEET_NOT_FOUND)
- Recommendation: Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.

### 00098 Ona, Rufina M. (TIMESHEET_NOT_FOUND)
- Recommendation: Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.

### 00104 Atienza, Maria Cristina H. (TIMESHEET_NOT_FOUND)
- Recommendation: Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.

### 00105 Marasigan, Jelen M. (TIMESHEET_NOT_FOUND)
- Recommendation: Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.

### 00106 Albia, Nilda T. (TIMESHEET_NOT_FOUND)
- Recommendation: Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.

### 00109 Saloza, Shiela Marie  T. (TIMESHEET_NOT_FOUND)
- Recommendation: Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.

### 00111 Torres, Sheilla C. (TIMESHEET_NOT_FOUND)
- Recommendation: Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.

### 00115 Lanaria, Cybelle Ann Chairmain C. (TIMESHEET_NOT_FOUND)
- Recommendation: Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.

### 00121 Ambal, Adrian C. (TIMESHEET_NOT_FOUND)
- Recommendation: Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.

### 00138 Almeron, Sherwin D. (TIMESHEET_NOT_FOUND)
- Recommendation: Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.

### 00143 Umali, Grace T. (TIMESHEET_NOT_FOUND)
- Recommendation: Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.

### 00147 Rosales, Merre Ann I. (TIMESHEET_NOT_FOUND)
- Recommendation: Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.

### 00150 Magpantay, Michelle J. (TIMESHEET_NOT_FOUND)
- Recommendation: Import/materialize and approve the employee timesheet for this cutoff before payroll comparison.

## Candidate Missing Source Files

