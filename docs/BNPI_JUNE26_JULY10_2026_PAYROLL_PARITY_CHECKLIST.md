# BNPI Payroll Parity Checklist — June 26 – July 10, 2026

**Status:** Active operator / agent checklist  
**Last investigation:** 2026-07-26  
**Target register:** `confidential-files/HRIS Payroll Computation June_26 - July 10, 2026.xlsx`  
**Period:** `2026-06-26` → `2026-07-10` (BNPI semi-monthly **period 2**, pay date ~2026-07-15)  
**Password (register):** `9090` (sensitive; local/client handling only)

---

## 1. Purpose

Make **processed payroll in the HRIS app** tally with the client payroll computation workbook for this cutoff.

This document is based on:

- Column ownership of the June 26 – July 10 register (Sheet2)
- Available files under `confidential-files/`
- DM workflow (`docs/dm-migration-workflow.md`)
- BNPI contribution schedule (`BNPI_FIRST_CUTOFF_FULL_SECOND_CUTOFF_NONE`)
- Sample employee proof: **Rio Jane Marasigan (`01360`)**

---

## 2. Verdict: missing files vs code/logic

### 2.1 Do you still lack files to import?

**Mostly no — the core June cutoff pack is already under `confidential-files/`.**

You have:

| Need | Local file |
|---|---|
| Target register | `confidential-files/HRIS Payroll Computation June_26 - July 10, 2026.xlsx` |
| DM1 | `confidential-files/DMs/DM1-master-data-migration (4).xlsx` |
| DM2 | `confidential-files/DMs/DM2-policy-data-migration (2).xlsx` |
| DM3 | `confidential-files/DMs/DM3-employee-data-migration (4).xlsx` |
| Compensation (cutoff) | `confidential-files/Compensation Mass Upload 07.15.26.xlsx` |
| Deduction (cutoff) | `confidential-files/Deduction Mass Upload 07.15.26.xlsx` |
| Biometrics (cutoff) | `confidential-files/DMs/Biometrics Data_Jun 26 - Jul 10.xlsx` — punch-only (`No.`, `Date/Time`); **not** OT buckets |
| Approved OT (cutoff) | `confidential-files/2rptOvertimeDetails - June 26 - July 10, 2026.xlsx` — required for Reg OT / RD / Hol / ND; **not** replaceable by biometrics |
| Schedules source | `confidential-files/Breaktime Schedule.xlsx` (if not already in DM3.2) |
| Leave (optional) | `confidential-files/rptLeaveBalance as of June 4, 2026.xlsx` |

**Not required for this cut’s contribution lines:**

| File | Role for June 26–July 10 |
|---|---|
| `April 2026 Monthly Payment_Statutory Benefits.xlsx` | Remittance / historical loan board. **Not** the source of SSS Cont / PhilHealth / Pag-IBIG. Loan amounts are **April**, often **wrong for June**. |

**Possible incomplete client data (not “missing HRIS code”):**

- Deduction mass upload may not list **every** register loan for every employee (example: Rio `01360` has register SSS Salary Loan `904.55`, RCBC `2,146.40`, MHDMF2 `250`, but mass upload only has HDMF Salary Loan ~`843.68`).
- Compensation mass upload may omit every-period items if they are expected from catalog/recurring enrollment (example: Rio register DMA `250`, MLA `500` not on her compensation rows; only PFA/ARP/AON).

If those pesos are on the register but not on any June-dated import, you need **client-corrected mass-upload rows** (or an explicit product decision to pull them from the register). That is a **source completeness** issue, not a missing DM workbook type.

### 2.2 Do you need code/logic changes?

**Primary path: no — use existing import + DM4 + Run Payroll + BNPI schedule.**

Already implemented:

| Capability | Where |
|---|---|
| DM1–DM3 import | `/admin/configuration/migration` |
| Compensation / deduction mass upload | DM3 UI + `POST /api/migration/dm3/import-*-mass-upload` (covers **all** cutoff benefits and deductions) |
| Statutory / monthly payment register import | **Removed from DM3 UI and HTTP.** Do not use April statutory board as a migration step; loans/deductions belong in the cutoff deduction mass upload. Offline helper only: `hris-api/helper/bnpi-statutory-benefits-import.helper.ts` |
| DM4 biometrics + approved OT materialization | DM4 durable migration run |
| Contribution schedule period 1 full / period 2 zero | `payroll-period.helper.ts` → `BNPI_FIRST_CUTOFF_FULL_SECOND_CUTOFF_NONE` |
| SSS/PHIC/Pag-IBIG calculation | Calculator + `tax-calculator.helper.ts` at Run Payroll |
| Comparison tooling (historical Apr/May shape) | `npm run dry-run:bandai-payroll-comparison` etc. |

**Code/logic changes only if you intentionally want different product behavior**, for example:

| Change | Needed? for register tally | Notes |
|---|---|---|
| Import SSS Cont / PhilHealth / Pag-IBIG **amounts** from statutory file into Run Payroll | **No** for this cut | Register has those columns **blank** on period 2 |
| Force contributions on period 2 | **No** | Would **break** register parity |
| Auto-merge April statutory loans as June truth | **No** | Amounts often differ (Rio SSS loan 761.39 vs 904.55) |
| Point comparison defaults at June workbook paths | Optional ergonomics | Scripts still default to Apr 26–May 10 docs paths; pass `--workbook=` |
| Stricter “period-scoped only” benefits (ignore Apr 26–May 10 openings on June cut) | Optional hardening | Reduces stale DM3.6 bleed; not strictly required if June mass uploads supersede |
| Fill missing mass-upload rows from register | Optional tooling | Convenience; source of truth remains client files |

**Conclusion:**  
For June 26–July 10 parity, focus on **correct period sources, complete mass-upload coverage, DM4 OT/attendance, clear unpaid payroll, re-run**.  
Do **not** block on inventing a contribution-amount import or changing period-2 contribution logic.

---

## 3. Component ownership (register → source)

| Register column family (Sheet2) | Source of truth for this cut | Import / system path |
|---|---|---|
| Monthly Salary / Basic Salary | Period basic on employee | DM3 Employees `BASIC_SALARY` |
| No. of Days / Absent / UT-Late | Attendance + schedule + timesheet rules | DM3.2 schedules + DM4 biometrics + setup timesheet rules |
| Reg OT / RD / Hol / ND buckets | Approved OT workbook (**not** raw biometrics) | DM4.3 `2rptOvertimeDetails - June 26 - July 10, 2026.xlsx`. Biometrics file has only punch timestamps; OT report has approved hour buckets.
| Allowances / AON / ARP / PFA / OBA / … | Cutoff compensation file | Compensation Mass Upload 07.15.26 |
| Loans / NEGADJ / some deductions | Cutoff deduction file | Deduction Mass Upload 07.15.26 |
| SSS Cont / PhilHealth / Pagibig | Engine (period 2 = **0**) | No file; Calculator + schedule |
| W/Tax | Engine | Calculator + taxable gross |
| TotalReceivable extras (e.g. MLA/PFA/ARP) | Often post-net / receivable | Compensation or recurring benefits; compare to correct column |
| April statutory loan board | Historical remittance | Supporting only; not June primary |

---

## 4. Sample proof — Rio Jane Marasigan (`01360`)

### 4.1 Register (June 26 – July 10)

| Component | Amount |
|---|---:|
| Basic Salary | 9,500.00 |
| Reg OT (33.00 hrs) | 3,755.99 |
| Adjustment OT/ND | 341.45 |
| De Minimis | 250.00 |
| GrossPay | 13,847.44 |
| W/Tax | 477.07 |
| SSS Cont / PhilHealth / Pagibig | blank / 0 |
| Modified HDMF 2 | 250.00 |
| RCBC Loan | 2,146.40 |
| HDMF Salary Loan | 843.69 |
| SSS Salary Loan | 904.55 |
| NetPay | 9,225.73 |
| ARP + PFA + MLA (receivable side) | 500 + 200 + 500 |
| TotalReceivable | 10,425.73 |

### 4.2 What local imports contain for Rio

| Source | Content for `01360` | Match register? |
|---|---|---|
| DM3 Employees | `BASIC_SALARY` 9500 | Yes (basic) |
| Compensation 07.15.26 | PFA 200, ARP 500, AON 341.45 | Partial (missing DMA/MLA on this file) |
| Deduction 07.15.26 | HDMFSALLN payment ~843.68 only | Partial (missing SSS loan 904.55, RCBC, MHDMF2) |
| April statutory | SSS loan 15th/30th **761.39** | **No** for June SSS loan |
| DM3 Benefits Loans sheet | Dated **2026-04-26 → 2026-05-10** only | Wrong period |
| OT workbook | Has Rio rows for 06/26/2026 | Must be applied via DM4.3 |
| App period-2 contributions | 0 | **Yes** (matches blank register) |

### 4.3 Lessons from the sample

1. **Contributions at 0 is correct** for this cut — not a missing import.  
2. **April statutory loans fight June parity** if used as open-horizon amounts.  
3. **June deduction/compensation files can be incomplete** vs the full register for a given employee.  
4. **Gross will not match without DM4 OT + attendance truth.**  
5. Compare **NetPay to NetPay**, not NetPay to TotalReceivable.

---

## 5. Phase checklist

### Phase 0 — Scope and target

- [ ] Confirm target: `confidential-files/HRIS Payroll Computation June_26 - July 10, 2026.xlsx`
- [ ] Confirm payroll period in app: start `2026-06-26`, end `2026-07-10`, **periodNumber = 2**
- [ ] Confirm BNPI cycle: period 1 = 11–25, period 2 = 26–10
- [ ] Pick sample employees (include `01360` and at least 2–3 others with OT + loans)
- [ ] Decide comparison column: NetPay vs TotalReceivable (do not mix)

### Phase 1 — Setup and masters (once per org)

- [ ] DM0 / setup: company, timesheet rules, payroll cycle, **Default Philippine Calculator**
- [ ] Import DM1 master workbook
- [ ] Import DM2 policy workbook (benefit types + loan types must cover mass-upload codes)
- [ ] Import DM3 employees (`BASIC_SALARY` = register period basic for this proof)
- [ ] Import DM3 schedules (from Breaktime → Employee Schedule Assignments)
- [ ] Optional: reporting lines, leave balances (not primary for this register’s money lines)

### Phase 2 — Cutoff money enrollments (this period only)

- [ ] Import **Compensation Mass Upload 07.15.26** (`StartPayDate` 6/26/26) via DM3 **Upload compensation**
- [ ] Import **Deduction Mass Upload 07.15.26** (`StartPayment` 6/26/26) via DM3 **Upload deduction**
- [ ] Spot-check sample employees: every non-zero register loan/allowance has a June-dated enrollment
- [ ] Do **not** upload April statutory / monthly payment register (UI path removed; benefits/deductions are only compensation + deduction mass upload)
- [ ] If older April statutory enrollments already exist: re-import June deduction rows so they **upsert** loan payments
- [ ] For gaps like Rio (SSS loan / RCBC / MHDMF2 missing from mass upload): obtain client rows or add explicit enrollments for this period before expecting full tally

### Phase 3 — Attendance and approved OT (DM4)

- [ ] DM4: biometrics `Biometrics Data_Jun 26 - Jul 10.xlsx` (attendance punches only)
- [ ] DM4: approved OT `2rptOvertimeDetails - June 26 - July 10, 2026.xlsx` (**still required**; punches do not contain Reg OT / ND / RD / Hol buckets)
- [ ] Complete timesheet materialization for the period
- [ ] Dry-run / repair approved OT → timesheet lines until planned updates = 0  
  (pattern: `npm run dry-run:bandai-payroll-timesheet-lines` then `repair:…` when applicable; point at this period’s OT file)
- [ ] Sample check: days, absent, OT hours match register **before** Run Payroll
- [ ] Do **not** skip OT upload because “OT is already in biometrics” — verified false for BNPI sources

### Phase 4 — Process payroll (clean snapshot)

- [ ] Clear **unpaid** `EmployeePayroll` rows for this period (avoid stale UI)
- [ ] Reopen period if status blocks re-run
- [ ] Run Payroll for period 2 (scoped as needed)
- [ ] Expect **SSS Cont / PhilHealth / Pag-IBIG = 0** for employees on this cut
- [ ] Expect loans/benefits from June enrollments, not April remittance board

### Phase 5 — Compare and fix by source

- [ ] Diff sample employees against Sheet2 in priority order:
  1. Basic Salary  
  2. Absent / UT  
  3. OT / RD / Hol / ND  
  4. GrossPay  
  5. Loans / deduction benefits  
  6. Compensation / receivable items  
  7. W/Tax  
  8. NetPay / TotalReceivable  
- [ ] Optional tooling (pass June workbook explicitly):
  ```bash
  npm run dry-run:bandai-payroll-comparison -- --workbook="<path-to-June-register>" --password=9090
  ```
- [ ] Fix **source/import**, not the client register
- [ ] After each source fix: clear unpaid payroll → re-run → re-compare

### Phase 6 — Sign-off

- [ ] Sample employees full-match or documented residual gaps only
- [ ] Residual gaps labeled: `SOURCE_INCOMPLETE` | `ENGINE_RULE` | `STALE_PERIOD` | `NEEDS_CONFIRMATION`
- [ ] Do not claim full org parity until comparison coverage is defined (all rows vs sample)

---

## 6. What not to do

1. Do **not** import April statutory SSS EE / PHIC EE / HDMF EE as open-ended contribution benefits to “fix” ₱0 contributions on period 2.  
2. Do **not** expect period-2 contributions to be non-zero under current BNPI logic.  
3. Do **not** treat DM3.6 rows dated Apr 26–May 10 as June money truth.  
4. Do **not** re-run payroll without clearing unpaid rows after source changes.  
5. Do **not** compare app NetPay to register TotalReceivable without noting receivable-only lines.

---

## 7. File inventory (operator view)

### Required for June 26 – July 10 parity path

| # | File | Stage |
|---|---|---|
| 1 | DM1 master | Phase 1 |
| 2 | DM2 policy | Phase 1 |
| 3 | DM3 employee | Phase 1 |
| 4 | Compensation Mass Upload 07.15.26 | Phase 2 |
| 5 | Deduction Mass Upload 07.15.26 | Phase 2 |
| 6 | Biometrics Jun 26 – Jul 10 | Phase 3 |
| 7 | OT details Jun 26 – Jul 10 | Phase 3 |
| 8 | HRIS Payroll Computation June_26 – July 10 | Target / Phase 5 |

### Optional / supporting

| File | Use |
|---|---|
| Breaktime Schedule | Build/repair DM3.2 if schedules incomplete |
| Leave balance Jun 4 | Leave only |
| April statutory benefits | Audit only; **not** a DM3 upload step (use cutoff compensation/deduction mass uploads) |
| OT Jun 11–25 workbook | **Other** period; not this cut |

### Explicitly not a Run Payroll contribution source

| File | Why |
|---|---|
| April Monthly Payment_Statutory Benefits | Contributions are remittance snapshot; period-2 engine uses splitFactor 0; loans are wrong period for many emps |

---

## 8. Code reference map

| Concern | Location |
|---|---|
| DM workflow / re-import / DM4 order | `docs/dm-migration-workflow.md` |
| Contribution split period 1/2 | `hris-api/helper/payroll-period.helper.ts` → `resolveContributionSchedule` |
| Contribution math | `hris-api/helper/tax-calculator.helper.ts`, `hris-api/config/payroll.config.ts` |
| Compensation / deduction mass upload | `hris-api/app/migration/bnpi-mass-upload-import.service.ts` + DM3 UI buttons |
| Statutory loan board parse (offline only; not a migration UI step) | `hris-api/helper/bnpi-statutory-benefits-import.helper.ts` |
| Historical source-trace roles (Apr/May defaults) | `hris-api/scripts/validate-bandai-payroll-source-trace.ts` |
| Comparison CLI | `hris-api/scripts/dry-run-bandai-payroll-comparison.ts` |
| Admin UI uploads (workbook + compensation/deduction only) | `hris-app/app/routes/admin/configuration/migration.tsx` |

---

## 9. Residual risk register

| ID | Risk | Type | Mitigation |
|---|---|---|---|
| R1 | Mass upload incomplete vs register for some emps | Source | Client-complete June compensation/deduction files |
| R2 | April statutory open-horizon loans override June payments | Process | Prefer June deduction upsert; avoid April for this cut |
| R3 | Stale DM3.6 Apr–May benefits still ACTIVE | Data | Supersede with June uploads or deactivate old period rows |
| R4 | OT/attendance not materialized | Process | Complete DM4 for this window before payroll |
| R5 | Stale EmployeePayroll snapshot | Process | Clear unpaid + re-run |
| R6 | Comparison scripts default to Apr/May paths | Tooling | Pass `--workbook=` for June register (optional code default later) |
| R7 | Rate basis / tax formula micro-diffs | Engine | Spot-check after gross/loan parity; only then tune calculator |

---

## 10. Final answer (investigation)

| Question | Answer |
|---|---|
| Do I still lack files to import? | **Core pack is present.** Possible **gaps inside** June compensation/deduction rows for specific employees vs the full register — that is incomplete source content, not a missing DM stage. |
| Should there be code/logic changes? | **Not required** for standard BNPI tally of this cut. Process + period-correct imports + DM4 + clean re-run first. Code only for optional ergonomics or if product rules are deliberately changed. |
| Why contributions stay 0? | **Engine rule + register blank on period 2.** Not a missing mandatory-contribution import file. |

---

## 11. Related documents

- `docs/dm-migration-workflow.md` — DM0–DM6 sequence, DM4 OT proof, re-import semantics  
- `hris-api/docs/multi-period-tax-calculation-plan.md` — contribution toggles by period  
- Historical Apr 26–May 10 tooling paths under `docs/Bandai Payroll/` (same pattern; different cutoff files)

---

## 12. Change log

| Date | Note |
|---|---|
| 2026-07-26 | Initial checklist from confidential-files investigation and Rio `01360` source cross-walk |
