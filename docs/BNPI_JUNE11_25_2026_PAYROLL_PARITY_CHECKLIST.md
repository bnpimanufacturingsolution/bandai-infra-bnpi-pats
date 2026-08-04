# BNPI Payroll Parity Checklist — June 11 – 25, 2026

**Status:** Active operator / agent source-of-truth map  
**Created:** 2026-08-04  
**Period:** `2026-06-11` → `2026-06-25` (BNPI semi-monthly **period 1**, pay date **2026-06-30**)  
**Password (register):** `9090` (sensitive; local/client handling only)

---

## 1. Purpose

Make **processed payroll in HRIS** tally to the client **HRIS Payroll Computation** workbook for this cutoff, using the ordered import pipeline:

```text
Biometrics (raw punches)
  → DM4 attendance / timesheet materialization
Approved OT report (hour buckets)
  → DM4.3 / timesheet-line repair → Timesheetline OT/RD/Hol/ND
Compensation mass upload
  → EmployeeBenefit enrollments (payroll adjustments / allowances)
Deduction mass upload
  → EmployeeBenefit / EmployeeLoan payments (loans, other deductions)
Run Payroll (period 1)
  → EmployeePayroll NetPay + TotalReceivable-class fields
Compare to register Sheet2 (password 9090)
  → fix SOURCE/import/engine mismatch → clear unpaid → re-run → re-compare
```

This cut is **not** the same as June 26 – July 10:

| Fact | June 11–25 (this pack) | June 26 – July 10 |
|---|---|---|
| BNPI `periodNumber` | **1** | **2** |
| SSS Cont / PhilHealth / Pag-IBIG | **Non-zero** on register (engine full) | **Blank / 0** (engine splitFactor 0) |
| Pay date | ~2026-06-30 | ~2026-07-15 |
| Pack folder | `docs/new-cutoff/june-11-25/` | `docs/new-cutoff/june-26-10/` |

Contribution schedule: `BNPI_FIRST_CUTOFF_FULL_SECOND_CUTOFF_NONE` in  
`hris-api/helper/payroll-period.helper.ts` → period 1 factor **1**, period 2 factor **0**.

---

## 2. Local file inventory (source of truth for this cut)

All paths relative to repo root unless noted.

| # | Role | Path | Proven shape (2026-08-04 probe) |
|---|---|---|---|
| T | **Target register** | `docs/new-cutoff/june-11-25/HRIS Payroll Computation June 11 - 25, 2026.xlsx` | Password `9090`. Sheets: `Sheet2` (full register, ~859 employees + grand total), `Sheet1` (Emp / Bank / Total Receivable). Period line: `6/11/2026 to 6/25/2026`, pay date `6/30/2026`. |
| B | **Biometrics (raw attendance)** | `docs/new-cutoff/june-11-25/Biometrics Data_Jun 11 - 25.xlsx` | Sheet `062626_1`. Columns **only** `No.`, `Date/Time`. ~24,054 punch rows. **Not** OT buckets. |
| O | **Approved OT** | `docs/new-cutoff/june-11-25/1rptOvertimeDetails - June 11-25, 2026.xlsx` | Sheet `rptOvertimeDetails`. Title OVERTIME/ND/HOLIDAY WORK DETAIL REPORT. Range `6/11/2026 to 6/25/2026`. Headers include Regular Dys, Reg OTHrs, Reg NDHrs, Spcl*, RHol*, RDHrs, RDOTHrs. |
| C | **Compensation mass upload** | `docs/new-cutoff/june-11-25/Compensation Mass Upload 06.30.26.xlsx` | Sheet1. `COMCODE, Amount, EmployeeID, EmployeeName, StartPayDate`. ~2,027 rows. Codes seen: LLA, TSA, OAD, INC, MTX, ARP, OBA, ABS, AON. StartPayDate aligns to this cut (~6/11 local). |
| D | **Deduction mass upload** | `docs/new-cutoff/june-11-25/Deduction Mass Upload 06.30.26.xlsx` | Sheet1. `DEDCODE, Amount, Payment, EmployeeID, EmployeeName, StartPayment`. **Only ~24 rows** (SSSSALLN, HDMFSALLN, HDMFCALLN, BNPISALLN, RCBCLN). Likely **incomplete vs full register loans** for many employees. |
| U | Unlocked probe copy | `.runtime/june-11-25-source-probe/register.unlocked.xlsx` | Excel COM unlock of register for tooling (regenerate any time with password 9090). |

### Masters / setup (not in this folder — still required)

| Need | Typical path / surface |
|---|---|
| DM1 master | Confidential / migration DM1 workbook |
| DM2 policy (benefit + loan types for COMCODE/DEDCODE) | Confidential / migration DM2 |
| DM3 employees + schedules | DM3 workbook / manpower databank; `BASIC_SALARY` from register Sheet2 **Basic Salary** family when proving this cut |
| Breaktime / schedules | Supporting schedule sources if DM3.2 incomplete |

Do **not** use April statutory remittance board as this cut’s contribution or loan truth.

---

## 3. Component ownership (register → source)

Sheet2 header (105 money/identity columns). Ownership for **this cut**:

| Register family (Sheet2) | Source of truth | HRIS path |
|---|---|---|
| Monthly / Daily / Basic Salary, No. of Days | Employee master + attendance/timesheet | DM3 `BASIC_SALARY`; DM4 punches + schedules |
| Absent-Amt / UT/Late-Amt | Attendance + rules | DM4 biometrics + timesheet rules |
| Reg OT / RD / Hol / ND hour + pay columns | **Approved OT workbook**, not punches | DM4.3 + `repair:bandai-payroll-timesheet-lines` → `Timesheetline` |
| Night Differential | OT/ND report + engine | OT workbook ND hrs + payroll calc |
| Allowances in GrossPay (OBA, HYS, etc.) | Compensation mass upload / catalog | `POST /api/migration/dm3/import-compensation-mass-upload` |
| Adjustment OT/ND, Other Adjustment, AON-class | Compensation (`AON`, `OAD`, …) | Same compensation import |
| De Minimis / catalog fixed | DM2 + DM3.6 or compensation | Benefit types + enrollments |
| **SSS Cont / PhilHealth / Pagibig** | **Engine period 1 full** | Calculator + `BNPI_FIRST_CUTOFF_FULL…` — **do not import as open benefits from April file** |
| W/Tax | Engine | Calculator from taxable gross |
| Loans (SSS/HDMF/RCBC/BNPI…) | Deduction mass upload (+ any complete loan enrollments) | `POST /api/migration/dm3/import-deduction-mass-upload` |
| NetPay | Generated | Run Payroll → `EmployeePayroll` |
| Post-net receivable lines (MLA, PFA/Perfect Attendance, ARP, Incentive 2025 30%, Meal Allowance, LLA, …) | Compensation / special lines | Often hit **TotalReceivable**, not NetPay — **never mix columns** |
| TotalReceivable | NetPay + receivable-only lines | Compare separately from NetPay |

### Guardrails (hard)

1. Biometrics = attendance evidence only. **OT hour buckets require file O.**  
2. Period 1 contributions **should be non-zero** for most employees (probe: ~842 of ~859 with SSS Cont). Zero contributions on this cut is a **bug or wrong periodNumber**, not success.  
3. Deduction mass upload has **~24 rows** only — many register loan cells will be `SOURCE_INCOMPLETE` until client file is complete or explicit enrollments exist.  
4. Clear **unpaid** `EmployeePayroll` (or full debug reset) before re-run after source fixes.  
5. Comparison scripts still default to Apr 26–May 10 paths — **always pass this cut’s `--workbook=` and source flags**.

---

## 4. Sample register proof rows (unlocked Sheet2, 2026-08-04)

### 4.1 Rio Jane Marasigan (`01360`) — continuity with prior June cut docs

| Component | Amount |
|---|---:|
| Monthly Salary | 19,000 |
| No. of Days | 12 |
| Basic Salary | 9,500 |
| Reg OT Hrs | 25 |
| Reg OT | 2,845.45 |
| GrossPay | 12,595.45 |
| W/Tax | 0 |
| SSS Cont | 1,350 |
| PhilHealth | 475 |
| Pagibig | 200 |
| SSS Salary Loan | 904.545 |
| RCBC Loan | 2,146.395 |
| TOTAL DEDN | 5,325.95 |
| NetPay | 7,269.50 |
| Meal Allowance | 500 |
| Attendance Recognition Program | 500 |
| TotalReceivable | ~34,191.91 (includes large post-net items — do not equate to NetPay) |

### 4.2 Ivy Sheena Llarena (`00032`) — OT + multi-loan + contributions

| Component | Amount |
|---|---:|
| Basic Salary | 15,200 |
| Reg OT Hrs | 8.5 |
| Reg OT | 1,547.92 |
| GrossPay | 16,997.92 |
| SSS Cont / PH / Pagibig | 1,750 / 760 / 200 |
| SSS / HDMF / RCBC loans | 904.545 / 1,162.29 / 1,109.26 |
| NetPay | 9,171.29 |
| TotalReceivable | 56,291.29 |

### 4.3 Lessons

1. **Period-1 contributions are real money** on this register — engine must compute them.  
2. **TotalReceivable ≫ NetPay** is common (incentives, ARP, MLA, etc.). Tally **NetPay vs NetPay** first.  
3. OT hours on register require OT file + timesheet lines before Run Payroll.  
4. Loans on register may exceed the 24-row deduction upload — classify gaps as source incomplete, not random calculator noise.

---

## 5. Historical context — Apr 26 – May 10 (what was tried before)

Prior parity tooling and truth docs defaulted to:

| Item | Historical path / fact |
|---|---|
| Target register | `docs/Bandai Payroll/.../HRIS Payroll Computation April 26 - May 10, 2026.xlsx` (password `9090`) |
| Source-trace script defaults | `hris-api/scripts/validate-bandai-payroll-source-trace.ts` cutoff `2026-04-26`–`2026-05-10`, pay `2026-05-15` |
| Comparison CLI defaults | `dry-run-bandai-payroll-comparison.ts` still points at May 15 reference + Compensation/Deduction `05.15.26` + generic OT workbook under `docs/Bandai Payroll/` |
| DM3.6 lesson | Employee benefits dated **only** Apr 26–May 10 are **wrong period** for June cuts |
| OT timesheet repair default periodCode | `PP-20260426-20260511` — **must override** for June 11–25 |
| Process that worked as a pattern | Source-only dry-run → benefits import dry-run → OT timesheet-line dry-run/repair → clear unpaid → run payroll → full comparison → repair by **source** not by editing register |

**Do not** re-import May 15 compensation/deduction as truth for June 11–25.  
**Do** reuse the **same graph**: masters → cutoff mass uploads → DM4 bio+OT → clean payroll → compare.

Related checklist pattern: `docs/BNPI_JUNE26_JULY10_2026_PAYROLL_PARITY_CHECKLIST.md` (period **2** contribution zeros).

---

## 6. Ordered import / process phases

### Phase 0 — Freeze scope

- [ ] Target workbook = June 11–25 register (`docs/new-cutoff/june-11-25/...`)
- [ ] App payroll period: start `2026-06-11`, end `2026-06-25`, **periodNumber = 1**, pay date ~`2026-06-30`
- [ ] Sample set: at least `01360`, `00032`, `00021`, plus 2–3 high-OT production rows
- [ ] Decide primary tally column: **NetPay** (receivable secondary)

### Phase 1 — Masters (once per org / if drift)

- [ ] DM0 setup: PH calculator, timesheet rules, BNPI semi-monthly cycle
- [ ] DM1 + DM2 (codes must cover COMCODE/DEDCODE in mass uploads)
- [ ] DM3 employees (`BASIC_SALARY` consistent with this register for proof employees)
- [ ] DM3 schedules / obligations

### Phase 2 — Cutoff money (this period only)

- [ ] Upload **Compensation** `Compensation Mass Upload 06.30.26.xlsx`  
  UI: DM3 **Upload compensation** → `POST /api/migration/dm3/import-compensation-mass-upload`
- [ ] Upload **Deduction** `Deduction Mass Upload 06.30.26.xlsx`  
  UI: DM3 **Upload deduction** → `POST /api/migration/dm3/import-deduction-mass-upload`
- [ ] Spot-check samples: every non-zero register loan/allowance either has a June-dated enrollment or is labeled `SOURCE_INCOMPLETE`
- [ ] Do **not** upload April statutory board as contributions

### Phase 3 — Attendance + approved OT (DM4)

- [ ] DM4 biometrics: `Biometrics Data_Jun 11 - 25.xlsx`
- [ ] DM4 approved OT: `1rptOvertimeDetails - June 11-25, 2026.xlsx`
- [ ] Materialize timesheets for the period
- [ ] Dry-run OT → timesheet lines until `plannedLineUpdates = 0`:

```powershell
cd hris-api
npm.cmd run dry-run:bandai-payroll-timesheet-lines -- `
  --periodCode=<ACTUAL_JUNE_11_25_PERIOD_CODE> `
  --overtime-workbook="../docs/new-cutoff/june-11-25/1rptOvertimeDetails - June 11-25, 2026.xlsx" `
  --password=9090
# when plan is correct:
npm.cmd run repair:bandai-payroll-timesheet-lines -- `
  --periodCode=<ACTUAL_JUNE_11_25_PERIOD_CODE> `
  --overtime-workbook="../docs/new-cutoff/june-11-25/1rptOvertimeDetails - June 11-25, 2026.xlsx" `
  --password=9090
```

- [ ] Sample: days + OT hours match register **before** Run Payroll

### Phase 4 — Clean Run Payroll

- [ ] Clear unpaid generated payroll for this period  
  Deep link (logged-in HR/admin): `/settings?debug=true&resetEmployeePayrolls=true`  
  or API `POST /api/employeePayroll/debug/reset-generated-payrolls` body `{ "confirm": "DELETE_EMPLOYEE_PAYROLLS" }`  
  (org-wide debug reset — use only on local/DEV proof orgs; see settings route)
- [ ] Or period-scoped clear unpaid only if a safer script is available for that period
- [ ] Reopen period if status blocks re-run (`OPEN`)
- [ ] Run Payroll for **period 1** only
- [ ] Expect **non-zero** SSS/PH/Pag-IBIG for normal employees

### Phase 5 — Compare and fix by source

Priority order when mismatching:

1. Basic Salary / days  
2. Absent / UT  
3. OT / RD / Hol / ND hours and pay  
4. GrossPay  
5. Contributions (period-1 engine)  
6. Loans / deductions  
7. Compensation in gross  
8. W/Tax  
9. **NetPay**  
10. Receivable-only → **TotalReceivable**

```powershell
cd hris-api
# Source ownership only (no DB compare):
npm.cmd run dry-run:bandai-payroll-source -- `
  --workbook="../docs/new-cutoff/june-11-25/HRIS Payroll Computation June 11 - 25, 2026.xlsx" `
  --password=9090 `
  --no-default-sources `
  --compensation-upload="../docs/new-cutoff/june-11-25/Compensation Mass Upload 06.30.26.xlsx" `
  --deduction-upload="../docs/new-cutoff/june-11-25/Deduction Mass Upload 06.30.26.xlsx" `
  --overtime-workbook="../docs/new-cutoff/june-11-25/1rptOvertimeDetails - June 11-25, 2026.xlsx" `
  --output-dir="../.runtime/june-11-25-payroll-parity/source"

# Full DB vs register (requires local API/DB with generated payroll):
npm.cmd run dry-run:bandai-payroll-comparison -- `
  --workbook="../docs/new-cutoff/june-11-25/HRIS Payroll Computation June 11 - 25, 2026.xlsx" `
  --password=9090 `
  --no-default-sources `
  --compensation-upload="../docs/new-cutoff/june-11-25/Compensation Mass Upload 06.30.26.xlsx" `
  --deduction-upload="../docs/new-cutoff/june-11-25/Deduction Mass Upload 06.30.26.xlsx" `
  --overtime-workbook="../docs/new-cutoff/june-11-25/1rptOvertimeDetails - June 11-25, 2026.xlsx" `
  --output-dir="../.runtime/june-11-25-payroll-parity/compare"
```

- [ ] After each fix: clear unpaid → re-run → re-compare  
- [ ] Label residuals: `SOURCE_INCOMPLETE` | `ENGINE_RULE` | `STALE_PERIOD` | `IMPORT_GAP` | `CODE_DEFECT` | `NEEDS_CONFIRMATION`

### Phase 6 — Sign-off

- [ ] Sample employees NetPay match within agreed tolerance (default ₱0.01 or document ₱1 rounding rule)
- [ ] OT hours for samples match before accepting gross
- [ ] Contribution non-zero proven on period 1
- [ ] Residual table only (no silent zeros)
- [ ] Evidence under `.runtime/june-11-25-payroll-parity-*`

---

## 7. What not to do

1. Do **not** skip OT upload because “biometrics already has OT.”  
2. Do **not** force period-2 contribution zeros on this cut.  
3. Do **not** use May 10 / May 15 default script paths without overrides.  
4. Do **not** compare app NetPay to register TotalReceivable.  
5. Do **not** re-run payroll on top of stale unpaid rows after OT/benefit repair.  
6. Do **not** invent missing loan rows to force tally; mark `SOURCE_INCOMPLETE`.  
7. Do **not** use production destructive reset without explicit scope; prefer DEV/local org.

---

## 8. Code / UI reference map

| Concern | Location |
|---|---|
| DM workflow | `docs/dm-migration-workflow.md` |
| Contribution period 1/2 | `hris-api/helper/payroll-period.helper.ts` |
| Tax / contributions | `hris-api/helper/tax-calculator.helper.ts`, payroll config |
| Compensation / deduction import | `hris-api/app/migration/bnpi-mass-upload-import.service.ts` |
| Migration routes | `hris-api/app/migration/migration.router.ts` |
| Register unlock + compare | `hris-api/helper/payroll-reconciliation.helper.ts` |
| Comparison CLI | `hris-api/scripts/dry-run-bandai-payroll-comparison.ts` |
| OT → timesheet lines | `hris-api/scripts/repair-bandai-payroll-source-timesheet-lines.ts` |
| Source-trace (May defaults — override) | `hris-api/scripts/validate-bandai-payroll-source-trace.ts` |
| Debug payroll wipe deep link | `hris-app/app/routes/settings.tsx` → `?debug=true&resetEmployeePayrolls=true` |
| Reset API | `POST /api/employeePayroll/debug/reset-generated-payrolls` |
| June 26–10 sibling checklist | `docs/BNPI_JUNE26_JULY10_2026_PAYROLL_PARITY_CHECKLIST.md` |

---

## 9. Residual risk register

| ID | Risk | Type | Mitigation |
|---|---|---|---|
| R1 | Deduction upload only ~24 rows | Source | Client-complete file or per-employee enrollments; label residual |
| R2 | Stale May DM3.6 benefits still ACTIVE | Data | Prefer June mass-upload upsert; deactivate wrong-period openings |
| R3 | Wrong periodNumber on payroll period | Config | Prove period 1 dates + contribution non-zero |
| R4 | Comparison CLI defaults to May paths | Tooling | Always pass `--no-default-sources` + this pack’s files |
| R5 | TotalReceivable pollution (incentives) | Process | NetPay-first tally |
| R6 | OT line repair periodCode default May | Tooling | Pass June periodCode + OT file path |
| R7 | Debug reset is org-wide | Safety | DEV/local only; document counts deleted |

---

## 10. Related agent prompts

| Prompt | Path |
|---|---|
| Overnight ordered E2E | `docs/00-product/AGENT-PROMPT-overnight-june-11-25-payroll-parity-e2e.md` |
| Graph + loop engine | `docs/00-product/AGENT-PROMPT-graph-loop-june-11-25-payroll-tally.md` |
| Non-stop loop template | `docs/00-product/AGENT-PROMPT-nonstop-loop-engineering.md` |

---

## 11. Change log

| Date | Note |
|---|---|
| 2026-08-04 | Initial truth map from `docs/new-cutoff/june-11-25` probe + unlocked register; sample rows; period-1 contribution distinction vs June 26–10 |
