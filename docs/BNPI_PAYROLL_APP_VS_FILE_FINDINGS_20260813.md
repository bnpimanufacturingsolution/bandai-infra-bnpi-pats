# BNPI Payroll — App vs Computation File Findings

**Documented:** 2026-08-13  
**Session scope:** Jun 26–Jul 10, 2026 payroll tally residual analysis (local clone); OT rate dual-path proof on April 26–May 10 register  
**Status:** Investigation findings + product recommendations (OT dual path **not implemented** unless a later commit says so)  
**Related checklists:**  
- `docs/BNPI_JUNE26_JULY10_2026_PAYROLL_PARITY_CHECKLIST.md`  
- `docs/dm-migration-workflow.md` (BASIC_SALARY / DM3)  
- `.wwg/reports/bnpi-june26-jul10-payroll-tally-20260811.md`

---

## 1. Purpose

Capture **session-proven** reasons the HRIS app Payroll Preview does not tally to the client **HRIS Payroll Computation** workbooks (Sheet2), with emphasis on:

1. Absent / empty biometrics policy  
2. Basic Salary column mismatch  
3. OT hours vs OT pay (rate)  
4. File dual OT formula (Path A daily vs Path B monthly)  
5. What Admin Rates does **not** control  
6. Recommended engine direction to match the file  

**Operator product locks from this session:**

| Decision | Status |
|---|---|
| Empty biometrics workday = **full-day ABSENT** | **Keep** (do not flip to file’s 0-absent for empty days) |
| OT engine should follow **file dual formula** | **Recommended** (not yet implemented in this doc’s commit unless stated elsewhere) |
| DMA / MLA / loans deep dive | Deferred (earlier sessions); not reopened here |

---

## 2. Periods and sources

| Item | Path / value |
|---|---|
| Primary tally period | `PP-20260626-20260711` (Jun 26–Jul 10, 2026) |
| June register | `confidential-files/june26-july10/` or `confidential-files/HRIS Payroll Computation June_26 - July 10, 2026.xlsx` (password `9090`) |
| Unlocked June copy (agent use) | `.runtime/alexa-payroll-compare/hris_payroll_unlocked.xlsx` |
| April register (OT formula consistency) | `confidential-files/HRIS Payroll Computation April 26 - May 10, 2026.xlsx` (password `9090`) |
| April unlocked extract | `.runtime/april-ot-rate-20260813/april_unlocked.xlsx` |
| Fleet scan (post BNPI OT fix) | `.runtime/payroll-scan-june26-jul10-after-otbnpi-20260812-131059/` |
| Gross unmatch report | `.runtime/gross-unmatch-from-bio-ot-20260812/` |
| Rio absent peers | `.runtime/rio-absent-pattern-peers-20260812/` |
| Non-Rio unmatch cut | `.runtime/unmatch-non-rio-20260813/` |
| Basic align → TR impact | `.runtime/unmatch-non-rio-20260813/basic-align-tr-impact.json` |
| OT rate proof (BNPI-only engine) | `.runtime/ot-rate-proof-20260812/` |
| April OT formula deep | `.runtime/april-ot-rate-20260813/formula-deep.json` |

---

## 3. Fleet snapshot (Jun 26–Jul 10, after OT BNPI-only + attendance repairs)

Compared: **818** employees (app preview ∩ Sheet2).

| Metric | Count (approx.) | Notes |
|---|---:|---|
| Full money tallied (Gross+Net+TR+OT+Absent+Late+Dedn) | **~4** | Extremely few end-to-end |
| Gross exact match | **~12** | |
| Gross unmatch | **~805** | App Gross usually **lower** than file |
| TotalReceivable (TR) exact | **~4** | |
| OT **hours** match | **~817 / 818** | Hours path is healthy |
| OT **pay** unmatch | **~482** | Rate problem, not missing hours |
| Hours OK, pay wrong | **~481** | Pure rate gap |
| Absent field fail | **~603** | Includes accepted empty-bio policy |
| Basic field unmatch | **481** | App `basicPay` ≠ file Basic Salary |
| Day-count field fail | **818 / 818** | Definition mismatch; not sole money fix |

**TR** = **TotalReceivable** (Net + post-net items such as MLA, PFA, ARP).

---

## 4. Component map (how money is built)

### 4.1 App Gross (simplified)

```text
attendanceGross =
    periodBasic (Employee.basicSalary for SEMI_MONTHLY)
  − Absent (ABSENT days × BNPI daily when buckets present)
  − Shortfall (late + early-out × BNPI minute rate)
  + Reg OT (approvedBuckets × BNPI hourly × 1.25)
  + other premium buckets

GrossPay = attendanceGross + GROSS_INCLUDED benefits (DMA, AON, …)
```

Code: `hris-api/helper/payroll-period.helper.ts`  
Detail map: `.runtime/payroll-component-map-20260812/REPORT.md`

### 4.2 File Gross (Sheet2)

```text
GrossPay ≈ Basic Salary − Absent-Amt − UT/Late + Reg OT + premiums + allowances/DMA/leave/…
```

Post-net: MLA, PFA, ARP, etc. → **TotalReceivable**.

### 4.3 Gross unmatch primary drivers (non-Rio cut, residual labeling)

Among Gross-unmatched (Rio excluded), largest residual slice after comparing |ΔAbsent|, |ΔLate|, |ΔOT|:

| Primary label | Count | Meaning |
|---|---:|---|
| basic | ~321 | Largest residual is BasicPay delta |
| absent | ~290 | Largest is Absent-Amt |
| other_gross | ~100 | Leave/bonus/package residual |
| dma | ~79 | DMA |
| late | ~14 | Late/UT |
| ot_pay | ~1 | OT $ as single largest (rare as primary alone) |

Official earlier bag (lump): other_gross_components 539, absent 255, late 9, ot_pay 1  
(`.runtime/gross-unmatch-from-bio-ot-20260812/`)

---

## 5. Absent / biometrics (P0 Rio pattern)

### 5.1 Policy (locked this session)

```text
Empty biometrics on a Mon–Sat workday → app full-day ABSENT
```

Do **not** change product to “file Absent=0 when bio empty” without a separate policy decision.

### 5.2 Rio pattern definition

1. File **Absent-Amt = 0**  
2. Biometrics **missing ≥1 Mon–Sat** punch  
3. App **Absent-Amt > 0**

| Group | Count |
|---|---:|
| All peers | **472** |
| Tight (OT hrs match + late ~0) | 349 |
| Missing only 2026-07-04 | 167 |
| Missing includes Jul 4 | 310 |
| App absent ≈ 1 BNPI day | 194 |

**Rio 01360:** target Absent 0, app Absent 728.43, missing **2026-07-04 only**, OT/late matched after repairs.

False-absent probe: ABSENT lines with punches in DB = **0** (empty days are real empty, not import miss).

Evidence: `.runtime/rio-absent-pattern-peers-20260812/`, `.runtime/attend-repair-20260812-093657/`

### 5.3 Non-Rio focus

With empty=ABSENT kept, next investigation set is **Absent already matches but Gross still unmatch (~203)** plus basic/DMA package — not “fix” empty bio to present.

### 5.4 Clear report — does absent residual mean bio ≠ computation? (2026-08-18)

**Full write-up:** `.runtime/absent-residual-explained-20260818/REPORT.md`  
**Proof + WS-off fix:** `.runtime/absent-nopunch-proof-20260818/FINDINGS.md`

| Question | Answer |
|---|---|
| Bio vs Sheet2 on Absent-$ | Often **disagree**: empty bio days exist; Sheet2 Absent frequently **0** |
| App inventing absent when punches exist? | **No** — false-absent probe = 0 |
| Leave causing no-punch / file no-charge? | **No** in local evidence (`requests` empty; no day-leave file in Jul pack) |
| Holiday-off from `rptOvertimeDetails`? | **No** — that file is holiday/OT **hours worked**, not holiday-off |
| Primary proven cause (Jul Rio-class) | **WorkSharing flag=0** days charged ABSENT (import ignored flag=0) |
| Fix | Flag=0 → `REST_DAY` / `isOff` override with reason; repaired 1715 lines |
| After fix absent fails | **173** — now mostly **file>0 / app=0** (false app charges cleared) |

Operator truth: many “no punch + file Absent=0” cases were **not scheduled (WS=0)**, not leave. Empty=ABSENT still applies on **scheduled** empty days (WS=1).

---

## 6. Basic Salary mismatch

### 6.1 Counts (Jun 26–Jul 10)

| Result | Count | Share |
|---|---:|---:|
| Basic **matches** | **337** | 41.2% |
| Basic **does not match** | **481** | **58.8%** |
| App Basic **lower** than file | 309 | of 481 |
| App Basic **higher** than file | 172 | of 481 |

Among “primary = basic” Gross unmatch (321): **all 321** had file Basic = **file days × ₱600**;  
`ΔBasic = appBasic − (fileDays × 600)`.

Dominant gaps: **−₱600** (~180), **−₱1,200** (~62), multiples of ₱600.

### 6.2 Root cause (definition clash)

| Side | Basic means |
|---|---|
| **App** | Fixed **period basic** = `Employee.basicSalary` → preview `basicPay` |
| **File (daily-rated cohort)** | **Days × ₱600** (day-prorated) |

Neither side is randomly corrupt for the mass — **different definitions**.

### 6.3 Where app Basic is imported

| Path | Writes `Employee.basicSalary`? |
|---|---|
| **DM3 Employees** column `BASIC_SALARY` | **Yes — primary** |
| Rebuild from payroll Sheet2 Basic | Script maps register Basic → `BASIC_SALARY` |
| Manpower Databank upload | **No** (does not wipe; creates with 0) |
| DM4 biometrics / OT | **No** |
| Preview time re-read of June file | **No** |
| PAN / salary change request | Yes (later updates) |

Docs: `docs/dm-migration-workflow.md` — use Sheet2 **Basic Salary** (period amount), not Monthly Salary, for semi-monthly proof.

Payroll reads:

```text
periodBasic = Employee.basicSalary  (SEMI_MONTHLY, no ÷2 in current code)
basicPay = periodBasic
```

### 6.4 If Basic matched the file — would TR match jump?

**No (optimistic simulation).**

| Metric | Now | After align Basic 1:1 into TR | Gain |
|---|---:|---:|---:|
| TR exact match | 4 | 4 | **0** |
| Gross exact | 12 | 12 | **0** |

Reasons:

- **333** already match Basic and still fail TR  
- Among 481 Basic-unmatch: **0** become exact TR after subtracting `dBasic` from `dTotal`  
- Median TR gap only shrinks modestly; residual is absent / OT / DMA / deductions  

Evidence: `.runtime/unmatch-non-rio-20260813/basic-align-tr-impact.json`

---

## 7. Overtime — hours vs pay

### 7.1 Fleet (post always-BNPI OT rate)

| Check | Count |
|---|---:|
| OT hours match | ~817 / 818 |
| OT pay unmatch | ~482 |
| Hours match, pay wrong | ~481 |
| App OT lower than file | ~481 of those |

### 7.2 App OT formula (Bandai approved buckets) — **current**

```text
periodBasic = Employee.basicSalary
daily  = periodBasic × 24 / 313     // BANDAI_DIRECT_ANNUAL_WORK_DAYS (hardcoded)
hourly = daily / 8
Reg OT $ = regOtHrs × hourly × 1.25
```

- Hours: `TimesheetLine.metadata.bandaiPayrollSourceRepair.approvedBuckets`  
- When buckets present, bucket OT **replaces** generic calculator OT  
- Multipliers for Bandai path: hardcoded `BANDAI_APPROVED_BUCKET_MULTIPLIERS` (regularOt = 1.25)  
- Constant: `BANDAI_DIRECT_ANNUAL_WORK_DAYS = 313` in `payroll-period.helper.ts` — **hardcoded**, not Admin  

### 7.3 Admin `/admin/rules-policies/payroll?tab=rates`

| Controls | Does **not** control |
|---|---|
| Payroll Calculator **rateMultipliers** (Work / OT / ND / NDOT by day type, e.g. ordinary OT 1.25) | Base hourly ₱ (file ₱75 or Daily/8) |
| | BNPI 313 constant |
| | Path A vs Path B selection |

For Bandai bucket employees, OT **pesos** come from BNPI code path, not from editing that Rates grid to “install ₱75.”

### 7.4 File OT formulas (consistent April + June)

#### Path A — Daily-rated

```text
Daily Salary present (usually ₱600)
hourly = Daily / 8                    // 600/8 = ₱75  (“P75”)
Reg OT $ = OT Hrs × hourly × 1.25     // effective ₱93.75 / OT hour (“P93”)
```

Also consistent with Basic = Days × Daily when Daily=600.

#### Path B — Monthly-rated

```text
Daily Salary blank / 0
Monthly Salary present
hourly = Monthly × 12 / 313 / 8
Reg OT $ = OT Hrs × hourly × 1.25
```

Math identity: `(Monthly/2) × 24 / 313 / 8` ≡ `Monthly × 12 / 313 / 8` when period basic = half monthly.

### 7.5 April 26–May 10 proof (password 9090)

| Group | Count (with OT) | Formula fit |
|---|---:|---|
| Path A (Daily/8 × 1.25) | **545** | Daily=600 → base **75** exact |
| Path B (BNPI monthly × 1.25) | **249** | Daily=0, Monthly>0 |
| Unexplained (data rows) | **0** | (grand total line excluded) |

**Path B is real on the file** — not an app-only idea. Samples (exact OT match to BNPI):

| Code | Daily | Monthly | Hrs | File Reg OT |
|---|---:|---:|---:|---:|
| 00032 | 0 | 30400 | 8 | 1456.87 |
| 00050 | 0 | 65000 | 1 | 389.38 |
| 00065 | 0 | 45000 | 27 | 7278.35 |

Forcing Path A at ₱75 on 00032 would pay **750** vs file **1456.87**.

Evidence: `.runtime/april-ot-rate-20260813/`

### 7.6 Why Path A and Path B exist (business)

| Path | Workforce rate type | Register columns |
|---|---|---|
| A | **Daily-rated** (e.g. ₱600/day) | Daily filled; OT from Daily/8 |
| B | **Monthly-rated** | Daily empty; OT from monthly via 313 |

One premium (1.25); two **base** definitions. App today applies **only Path-B-style BNPI for everyone**, so Path A people fail OT pay vs file.

### 7.7 Why not Path A only?

- Clear, but **wrong** for ~**31%** of April OT rows (Path B).  
- Flat ₱75 underpays monthly staff heavily.  
- `(Basic÷Days)÷8` does **not** reproduce Path B OT on April samples.  

---

## 8. App vs file OT comparison (summary board)

| Piece | App (now) | File Path A | File Path B |
|---|---|---|---|
| Hours | approved `regOtHrs` | Reg OT Hrs | Reg OT Hrs |
| Base hourly | `periodBasic×24/313/8` | **Daily/8** (₱75 if 600) | `Monthly×12/313/8` |
| Premium | 1.25 | 1.25 | 1.25 |
| 313 used? | Yes (hardcoded) | No | Yes |
| Admin Rates sets base ₱? | No | n/a | n/a |

Example: 8 OT hrs, Daily=600, app periodBasic=6600:

| | Hourly | OT $ |
|---|---:|---:|
| File A | 75 | 750 |
| App | ~63.26 | ~633 |
| Gap | | App lower |

---

## 9. What “313” is

| | |
|---|---|
| Meaning | BNPI **annual work-day factor** for monthly → daily rate |
| Code | `BANDAI_DIRECT_ANNUAL_WORK_DAYS = 313` |
| Hardcoded? | **Yes** — not on Admin Rates page |
| Used for | Bandai OT buckets, absent/late BNPI daily when buckets present, diagnostics |

---

## 10. Biggest reasons app won’t tally (priority narrative)

| Rank | Factor | Notes |
|---:|---|---|
| 1 | **Gross package** (basic definition + DMA/allowances/other) | Largest money wall; app Gross usually lower |
| 2 | **Absent** (empty bio = ABSENT vs file often 0) | Policy-accepted; hundreds of peers |
| 3 | **Deductions / tax cascade** | Follow Gross; TotalDedn fails hundreds |
| 4 | **OT pay rate** (hours OK) | Path A file ₱75 vs app BNPI; ~481 |
| 5 | Late / day-count labels | Secondary / definitional |

Fixing Basic alone does **not** unlock TR tally.  
Fixing OT dual path **does** unlock OT pay parity for daily-rated without abandoning Path B.

---

## 11. Recommended direction to match file OT (product)

### 11.1 Target dual formula (mirror file)

```text
if dailyRate > 0:                                    // Path A
  OT = hrs × (dailyRate / 8) × 1.25
else:                                                // Path B
  OT = hrs × (periodBasic × 24 / 313 / 8) × 1.25
  // with periodBasic ≈ Monthly/2 for semi-monthly
```

### 11.2 Prerequisites

| Need | Why |
|---|---|
| Store / import **Daily Salary** (or rate class) on employee | App has only `basicSalary` + `payFrequency` today |
| Keep Path B BNPI | Protect monthly-paid file parity |
| Do not hardcode everyone to ₱75 | Breaks Path B |

### 11.3 Implementation order

1. Data: Daily Salary / rate basis from register or master  
2. Code: dual hourly in `calculateBandaiApprovedBucketPay` / rate basis  
3. Tests: Path A (600→75) and Path B (BNPI)  
4. Rescan Jun 26–Jul 10 OT pay match  
5. Later: Basic / Absent daily alignment for Gross (separate from OT; avoid double-count with empty=ABSENT)  
6. Optional Admin: OT mode `FILE_DUAL` vs `BNPI_ONLY` (Rates matrix alone is insufficient)

### 11.4 Keep empty = ABSENT

Independent of OT rate work.

---

## 12. Terminology (session shorthands)

| Term | Meaning |
|---|---|
| **TR** | TotalReceivable |
| **P0 absent** | Priority pattern: file Absent=0, bio empty, app Absent>0 (Rio-class) |
| **P75** | File base hourly **₱75** (= Daily 600 ÷ 8), Path A |
| **P93** | Effective OT ₱/hour on Path A: **75 × 1.25 = 93.75** |
| **BNPI 313** | Annual day factor in app (and file Path B) |
| **Path A** | Daily-rated OT: Daily/8 × 1.25 |
| **Path B** | Monthly-rated OT: Monthly×12/313/8 × 1.25 |

---

## 13. Evidence index

| Topic | Path |
|---|---|
| Fleet scan after OT BNPI | `.runtime/payroll-scan-june26-jul10-after-otbnpi-20260812-131059/` |
| Gross unmatch | `.runtime/gross-unmatch-from-bio-ot-20260812/` |
| Full tally after attend | `.runtime/full-tally-after-attend-20260812/` |
| Rio peers | `.runtime/rio-absent-pattern-peers-20260812/` |
| Non-Rio + basic deep | `.runtime/unmatch-non-rio-20260813/` |
| OT BNPI proof | `.runtime/ot-rate-proof-20260812/` |
| April OT Path A/B | `.runtime/april-ot-rate-20260813/` |
| Component map | `.runtime/payroll-component-map-20260812/` |
| Attend repair | `.runtime/attend-repair-20260812-093657/` |

---

## 14. Implementation status (FILE_DUAL OT)

| Item | Status |
|---|---|
| Implement FILE_DUAL OT in engine | **Implemented** (2026-08-13): Path A if `Employee.dailyRate > 0`, else Path B BNPI |
| Scope | All Bandai approved-bucket hourly pays (Reg OT, RD, Hol, ND hrs) |
| Absent/late dual | **Out of scope** (still BNPI attendance path) |
| Import Daily Salary | `DAILY_SALARY` / `DAILY_RATE` on employee import → `dailyRate` |
| Schema | `Employee.dailyRate Float?` + migration `20260813_add_employee_daily_rate.sql` |
| Backfill script | `hris-api/scripts/backfill-employee-daily-rate-from-sheet2.mjs` |
| Tests | `hris-api/tests/bandai-ot-rate-basis.spec.ts` (Path A + B) |
| Admin toggle | Not in first ship (hardcoded FILE_DUAL) |
| **Local clone DB** (`127.0.0.1:5433` / `hris-local-dev-clone`) | **Backfilled** 2026-08-13: `dailyRate` column + **569 Path A** (all 600), 1643 Path B |
| **VM DB** (`10.184.37.19:15433` / appliance) | **NOT updated yet** — host/LAN/Cloudflare SSH unreachable this session. Re-run migrate/backfill when VM is up. |
| **Re-tally local after FILE_DUAL** | 2026-08-13: OT pay fails **482 → 1**; OT_MATCH_ONLY **327 → 797**; full TALLIED still **4**. Evidence: `.runtime/full-tally-after-ot-dual-20260813/` |
| Re-import period Basic | Optional; won’t alone fix TR |
| Gross package / DMA | **DMA closed** for Jul compared set — see **§14d**; Gross package still open |
| Recurring loans | See **§14c** (prior DED mass + multi-cutoff horizon) |
| Recurring DMA | See **§14d** (open-horizon EVERY_CUTOFF from Sheet2 Jul amounts) |

## 14b. Implementation status (FILE_DUAL Basic Path A)

| Item | Status |
|---|---|
| Path A Basic | **Implemented** (2026-08-17): `basicPay = paidRegularDays × dailyRate` when `dailyRate > 0` |
| Paid days source | `approvedBuckets.regularDays` sum (Sheet2 **No. of Days**); fallback PRESENT/INCOMPLETE count |
| Path A full-day Absent | **Suppressed** (already excluded from paid days — no double-count) |
| Path B Basic | Unchanged: `periodBasic` + full-day absent still charged |
| Register | `buildBandaiPayrollRegister` uses computed `basicPay` + Path A days/daily (no longer forces periodBasic) |
| Helper | `resolveBandaiRegisterBasicPay` in `payroll-period.helper.ts` |
| Tests | `hris-api/tests/bandai-register-basic-pay.spec.ts` (5) + OT dual (6) = **11 green** |
| **Re-tally local after Path A Basic** | Jun 26–Jul 10: **basicPay fails 481 → 1**; **absent 603 → 222**; **numberOfDays 818 → 263**; OT pay still 1; Gross ~805; TR ~827. Evidence: `.runtime/full-tally-jul11-25-after-basic-path-a-20260817/` |
| Single Basic residual | `01711` Lanto: target 8050 vs app 7975 (Path B periodBasic drift ₱75) |
| VM dailyRate | Still pending (same as OT dual) |

### Engine formula (live code) — OT + Basic

```text
if Employee.dailyRate > 0:                    // Path A
  hourly = dailyRate / 8
  basicPay = paidRegularDays × dailyRate      // paidRegularDays = bucket regularDays
  fullDayAbsentDeduction = 0
  method OT = FILE_DAILY_OVER_8_APPROVED_BUCKETS
else:                                         // Path B
  hourly = periodBasic × 24 / 313 / 8
  basicPay = periodBasic
  fullDayAbsentDeduction = daysAbsent × attendanceDaily
  method OT = BNPI_DIRECT_313_APPROVED_BUCKETS
bucket OT/premium $ = hours × hourly × Bandai multipliers
```

## 14c. Recurring deductions — past mass upload, Amount vs Payment, multi-cutoff

### Product truth (CONFIRMED)

BNPI computation Sheet2 loan columns for a cutoff are **not** filled from that cutoff’s deduction mass file alone. Many HDMF SL / SSS SL / RCBC / BNPI SL / calamity / emergency lines are **recurring**: they were enrolled in **earlier** deduction mass uploads and keep deducting until paid off.

| Source | Role |
|---|---|
| `confidential-files/deduction mass upload/` (Jan→Jun history) | Primary enrollment of recurring loans (`Amount` + `Payment`) |
| Cut mass e.g. `june26-july10/Deduction Mass Upload 07.15.26.xlsx` | Updates / new enrollments for that StartPayment window |
| Cut mass e.g. `july11-july25/Deduction Mass Upload 07.31.26.xlsx` | **Incomplete alone** (Jul example: **39** rows; Sheet2 loan cells ≠0 ≈ **1227**) |
| Computation Sheet2 loan $ | **This cutoff’s charge** (tally target) — not remaining balance |
| Workbook seed (“BNPI payroll workbook loan deduction”) | Earlier import of Sheet2 Payment into `EmployeeLoan`; often weak principal/balance |

**Locks**

- Empty bio = ABSENT unchanged.
- Do **not** expect Jul (or any single-cut) DED mass alone to explain fleet loan columns.
- Reimport mass **oldest → newest** so last Payment wins; use correct org (local Bandai `cmryhwpv70000vgaktlmrubmx`).

### Amount vs Payment (how “still owed” works)

Deduction mass upload columns:

| Column | Meaning | App field | Used for |
|---|---|---|---|
| **Payment** | Deduct **this cutoff** | `EmployeeLoan.monthlyPayment` | Payroll loan line + Sheet2 tally |
| **Amount** | Principal / **still owed** at enroll time | `principalAmount` / `balance` | Remaining payoff; **not** the Sheet2 period column |

```text
Still owed (balance)   ←  Amount  (mass) / EmployeeLoan.balance
This cutoff charge     ←  Payment (mass) / monthlyPayment / Sheet2 loan $
When done              ←  balance ≈ 0 (or last short payment)
```

Rough remaining cutoffs ≈ `Amount ÷ Payment` (~2 cutoffs/month ⇒ months ≈ cutoffs/2).

**Honesty bound:** Payroll today applies **Payment** when the loan window overlaps the period. Live amortized `amountPaid` / declining `balance` after each run is **not** fully proven; `amountPaid` is often still 0. Trust **Amount** from mass for “still owed”; workbook-seeded rows that copied Payment into principal are **weak** for balance.

### Multi-cutoff horizon (why past mass alone was not enough)

Payroll applies `EmployeeLoan` only when:

```text
status IN (ACTIVE, APPROVED)
startDate <= period.endDate
endDate   >= period.startDate
```

Local defect (before 2026-08-17 repair): `loan_types.maxTermMonths = 1` and workbook seed stamped `endDate` to a **single cut** (e.g. 2026-04-26→2026-05-10). Loans had correct Payment but **did not apply** in Jul 11–25.

| Fix | What it does |
|---|---|
| `resolveBandaiMassUploadLoanTermMonths` | Floor **24** months; ignore type term=1; grow from Amount/Payment when longer |
| `resolveBandaiLoanEndDate` | Never shrink existing later `endDate` on reimport |
| `repair-bnpi-loan-multi-cutoff-horizon.mjs` | Lift types to 24; extend ACTIVE loan endDates |
| `import-prior-deduction-mass-history.ts` | Reimport prior+cut DED mass oldest→newest |

### Jul 11–25 proof (local clone)

| Metric | Before loan fix | After repair + prior mass |
|---|---:|---:|
| Loans overlapping Jul | 88 | **1280+** |
| Emps with any loan applied (preview) | ~4 | **509** |
| Full tally HDMF SL fails | 353 | **11** |
| Full tally SSS SL fails | 300 | **31** |
| Full tally RCBC fails | 132 | **29** |
| Gross / absent / late / DMA fails | unchanged | unchanged |
| Total Receivable fails | ~827 | ~826 |

Evidence:

- Investigation: `.runtime/prior-deduction-recur-20260817/REPORT.md`
- Full re-tally: `.runtime/tally-after-loan-20260818/COMPARE-BEFORE-AFTER.md`

### What is / is not “done using past deduction mass upload files”

| Claim | Verdict |
|---|---|
| Recurring loan **Payments** that match computation | **Mostly yes** — past (+ cut) DED mass |
| **Amount / still owed** when mass-sourced | **Yes** — mass `Amount` |
| Jul cut DED mass alone sufficient | **No** |
| Loan apply in later periods | Needs **horizon fix** + mass (not Excel alone) |
| OT / Basic / absent / late / DMA / fleet TR | **No** — other workstreams |

### Operator FAQ

**Q: Do most deductions now match computation?**  
**A:** Most **loan** columns largely match. **TOTAL DEDN** still fails for nearly everyone (other deds + Gross-driven package). Fleet TR still open.

**Q: How do we know how much is still needed to be paid?**  
**A:** Use mass upload **Amount** (and app `balance` when it reflects that Amount). Sheet2 loan $ is only this cutoff’s **Payment**.

**Q: Is all of this from past deduction mass uploads?**  
**A:** Recurring loan enrollments/Payments **yes (primarily)**. Making them apply across cutoffs also required the multi-cutoff code/data repair. Workbook seed and attendance/Gross are separate.

---

## 14d. Recurring De Minimis (DMA) — open-horizon EVERY_CUTOFF

**Problem (Jul 11–25):** Sheet2 still pays De Minimis (often ₱150) but app DMA = 0 for **332** compared people.

| Cause | Evidence |
|---|---|
| Jul COMP mass has **0** DMA rows | `july11-july25/Compensation Mass Upload 07.31.26.xlsx` |
| Existing DMA enrollments expired | 336 rows, `startDate=2026-04-26` … `endDate=2026-05-10`, all `payrollPeriodId` pinned |
| Apply rule | `resolvePayrollBenefitSource` skips when `endDate < period.start` or wrong `payrollPeriodId` |

Same class of bug as short loan horizons: **period-scoped seed**, not open-horizon recurring.

**Fix (2026-08-18):**

1. `isOpenHorizonCompensationCode('DMA')` — DMA only; ARP/PFA/MLA stay cut-scoped.
2. COMP mass upload writes DMA with `payrollPeriodId=null`, `endDate=null`, `RECURRING` + `EVERY_CUTOFF`.
3. Workbook benefit apply treats DMA the same way.
4. Local repair: `repair-bnpi-dma-open-horizon.mjs --execute` upserts amounts from **Jul Sheet2** (operator choice).

**Jul re-tally proof** (period id `cmryhzl500032vgakz1uy1k7l`, 828 compared):

| Metric | Before | After |
|---|---:|---:|
| DMA match | 496 | **828** |
| DMA fail | 332 | **0** |
| `fieldFailCounts.dma` | 332 | **0** |

Repair: 329 updated, 6 inserted, 2 missing employees (`01831`, `01845` — not in compared set).

Evidence: `.runtime/dma-tally-20260818/REPORT.md`, `.runtime/dma-open-horizon-repair-20260818/`, `.runtime/tally-after-dma-repair-20260818/DMA-REPORT.md`.

**Local vs VM (operator note, 2026-08-18):** Local clone DB (`127.0.0.1:5433` / `hris-local-dev-clone`) is **testing only**. Brute/data repairs proved here (DMA open-horizon upsert, multi-cutoff loan horizon repair, WS-off ABSENT→REST_DAY line repair, late/EO punch recompute, prior DED mass reimport, Sheet2 dailyRate backfill, etc.) are **not** durable runtime truth until re-run against the **VM/appliance DB**. Code/import-path fixes land via git; data mutations must be replayed on VM later.

**Still open:** Gross (~620), absent reverse (~173), late (~55), TR/Net — not DMA. VM data replay of brute fixes.

---

## 14e. Period leave import (LVP) — Sheet2 "Leave" gap closed (2026-08-25)

**Operator feed:** `confidential-files/Leave (July 1-31, 2026).xlsx` — sheet **`Leave (2)`**
(strict subset of `Leave (1)`; empirically matches Sheet2 at 99.2% money).

### Proven fit vs Jul 11–25 Sheet2 (analysis, pre-import)

| Check | Result |
|---|---|
| Sheet2 Leave people / ₱ | **376** / **₱445,111.72** |
| File coverage of those people | **376/376 (100%)** |
| Money formula reproduced | **373/376 (99.2%)** ±₱1 |
| Path A (`days × dailySalary`) | 217 people |
| Path B (`days × monthly × 12/313`) | 156 people |
| Residuals | 00342/01176/01321 pay one day fewer on Sheet2; 01624 file-paid but Sheet2 ₱0 |

### Implementation status

| Item | Status |
|---|---|
| Helper | `hris-api/helper/bnpi-period-leave-import.helper.ts` — sheet pick (first qualifying = `EmployeeNumber`+`DateOfLeave`), paid+window filter, dual daily basis (Path A `dailyRate`; Path B `basicSalary × 24 / 313`, unrounded rate, cent-rounded amount), `LVP` code constants |
| Service | `hris-api/app/migration/bnpi-period-leave-import.service.ts` — preview-first (`dryRun` defaults true), explicit `payrollPeriodId` override, upsert keyed `employee|LVP benefitType|payrollPeriodId` (period-pinned RECURRING/EVERY_CUTOFF like COMP mass), notes carry sheet/days/dates/basis/source, durable log kind `period-leave` |
| Endpoint | `POST /api/migration/dm3/import-period-leave` (multipart `file`; optional `dryRun=true`; `payrollPeriodId`; `sheetName`) — **executes on upload by default** like the other DM3 mass uploads (operator decision 2026-08-25); multer string booleans coerced |
| Engine | **`leavePay` now included in GrossPay**: `grossPayWithSources = grossPay + grossIncludedBenefits + payrollSourceAmounts.leavePay` at both generate and preview sites in `payroll-period.helper.ts`. Register `leavePay` unchanged (already sourced). Net/TR/tax follow Gross. |
| UI | Admin → Configuration → Migration → DM3 card **Upload leave (period)** → **payroll-period selector** (default OPEN period, sends `payrollPeriodId`) + single **Import** button (immediate execute per operator feedback). Failures render in the result panel and in Upload activity click-through (kind `period-leave`). |
| Tests | `hris-api/tests/bnpi-period-leave-import.spec.ts` (9): sheet pick, window/paid filter, dual basis incl. Sheet2 sample 00032 (₱2913.74), explicit dry-run no-writes, execute create+update+log, **default-executes contract**, missing-employee failures |
| Local DB state | **Executed 2026-08-25** on local clone (5433): PP-20260711-20260726 → **321 created / 0 updated / 6 failed** (missing emps 01827/01834/01835/01836/01838/01841), **₱327,991.84**, log `cmt86rh9b00s8vgewuoj41i4j`. Superseded by the full **§14f tally fix pack** same day — final tally `.runtime/tally-jul1125-after-repairs-2026082508243/REPORT.md`. Baseline (pre-leave, reconstructed vs July Sheet2): `.runtime/tally-jul1125-before-leave-julysheet2/`. |

### Multi-file hazard (discovered 2026-08-26, fix pending — REC-20260826-PERIOD-LEAVE-MULTI-FILE-MERGE)

The upsert is one LVP row per employee+cutoff and the update path **overwrites** the amount
with the current file's in-window aggregate only — sequential month-file imports do NOT merge.
A cutoff spanning two client month files (e.g. Jun 26–Jul 10 fed by the June + July ledgers)
must therefore be imported from ONE combined workbook; importing June then July leaves
employees with leave on both halves holding only their July days (last import wins).

Live proof on the local DB: PP-20260626-20260711 has **101/387 LVP rows underpaid**
(136 lost leave days ≈ ₱90,377.61) after a June→July sequence — stored notes carry only
July dates (e.g. 00922 stored 0.5d vs correct 4.5d). Dry-runs vs both real workbooks
confirmed window filtering works (June: 208 people/287.5 days kept, 1161 skipped;
July: 283/453, 1022 skipped; combined correct = 390 people/740.5 days).
Evidence: `.runtime/verify-period-leave-20260826/REPORT.md`.

## 14f. Jul 11–25 tally fix pack — comp from Sheet2 + replay (2026-08-25)

The local clone was refreshed after the 8/17–8/20 sessions and lost every brute
repair. Operator directive: recurring comp/ded cannot rely on the single cut
file — fix compensation **from Sheet2**, always with proof.

| Step | What ran | Proof |
|---|---|---|
| DM4 Jul bio + approved OT | `/api/migration/runs` (options.sourceFiles paths) | OT buckets landed (₱1.33M fleet); strict verify gate flaps non-convergent (known) |
| WorkSharing Jul | `import-worksharing-schedule` | 841 updated, OFF overrides restored |
| Late/UT recompute | `repair-period-late-ut-from-punches --apply` | punches vs rebuilt schedules |
| dailyRate | `backfill-employee-daily-rate-from-sheet2` (July Sheet2) | 569 Path A |
| **Comp from Sheet2** | **`repair-bnpi-comp-from-sheet2.mjs`** — DMA open-horizon (329 upd + 6 ins); period-pinned MLA 824 (831 open superseded), ARP 673, AON 33, LLA 65, TSA 10, OBA 33, OAD 5, HYS 66, ABS 48, MTX 153, PFA 1 | `.runtime/comp-from-sheet2-*/` |
| Deductions | Jul DED mass + prior DED Jan→Jun + loan horizon 24mo | loans back to June-residual level (RCBC 29 / HDMF 11 / SSS 31) |
| Register fix | **`arp` register column was missing** — added `attendanceRecognitionProgram` sourceBy(["ARP"],…). **Special-holiday split proven**: Path A work premium = 1.3 (stale `useSourceDailyRate` forced 0.3), Path B = 0.3; excess spclOtHrs×1.69 → own register column (`resolveBandaiSpecialHolidayWorkMultiplier`) | ARP 668 fails → **0** (₱335,500); premium gross recovered ≈₱206k |

**Final proof (828 compared):** UNMATCH **694 → 2**; TALLIED **0 → 10**; NEAR_10 9;
OT_OK_NEAR_50 **76**; **802/828 improved**; gross fails 826 → **554** (gap
−₱324k → −₱117k); **net gap −₱423k → +₱52k**; late 322 → **55**. Now matching:
OT ₱1.33M, DMA, MLA, ARP, PFA, AON, LLA, TSA, OBA, OAD, HYS, ABS, MTX,
basicPay, numberOfDays. Remaining walls: absent policy 173 (Sheet2 ₱269k vs
app ₱6k), deductions over ₱170k (contrib/loan/tax cascade), leave day-count
201 (₱106k), ND ₱49.5k, RD Hrs Pay 13.
Pack orchestrator: `run-jul1125-tally-fix-pack.mjs` (dry-run default,
`--execute`, `--step=N`). Local clone only — VM replay required.

---

## 14g. Recurring comp/ded + future periods WITHOUT Sheet2 (2026-08-25 doctrine)

Operator directives: (1) recurring comp/ded must keep recurring — next period
should not need re-fixing; (2) Sheet2 will not always exist — future periods
must compute from the app itself.

### Recurring status after this session

| Component | Mechanism | Recurs next period? |
|---|---|---|
| **DMA** | open-horizon EVERY_CUTOFF (§14d) | **Yes** — proven |
| **MLA** | **UNIVERSAL since 2026-08-26 (operator directive): every Bandai (DIRECT) employee, every cutoff, forever.** Engine injects ₱500 RECEIVABLE_ONLY when no enrollment resolves (`applyUniversalBandaiMlaSources`); backfill script `repair-bnpi-mla-universal.ts` keeps rows in sync. Agency excluded. | **Yes** — guaranteed at run/preview |
| **Loans** | EmployeeLoan enrollments from prior DED mass + 24-mo horizon | **Yes** — proven (1,356 loans / ₱831,766 overlap next period) |
| ARP/PFA/AON/LLA/TSA/OBA/OAD/HYS/ABS/MTX | period-pinned (cut-specific adjustments) | No — by design; future cuts get them from that cut's COMP mass or app workflow |
| Statutory (SSS/PhilHealth/Pag-IBIG/W-Tax) | engine schedules | **Yes** — native |
| Absent / Late / UT | schedules + biometric punches (native engine) | **Yes** — native |
| Leave pay | app leave module / period-leave import | **Yes** — native going forward |
| OT / premium buckets | DM4 `rptOvertimeDetails` (client file) today; in-app approved-OT workflow is the future-native path | Needs that cut's OT file until in-app OT covers it |

**Recurrence proof (next period PP-20260726-20260811, Sheet2 NOT used):**
DMA 335 people / ₱110,300 · MLA 824 / ₱412,000 (engine resolver) ·
loans 1,356 / ₱831,766 (SQL window). Evidence:
`.runtime/recurring-next-period-proof-20260825/proof.json`.

### Sheet2 = parity harness, not a dependency

Sheet2 computation files are used ONLY to (a) migrate historical cutoffs and
(b) audit/tally proof. A future period runs entirely in-app:
schedules + punches → attendance money; approved OT → buckets; leave module →
leave pay; recurring enrollments (DMA/MLA/loans) → comp/ded; statutory engine →
contributions/tax. When the client later supplies a Sheet2 for audit, the same
`_tmp-full-period-tally-compare-jul.mjs` harness measures drift.

### Period selection honesty (learned live)

Month-wide leave files span two cutoffs; the max-paid-days auto-pick favored the
**prior** cut for this July file (562 vs 555 days). Shipped fix (operator feedback
2026-08-25): the DM3 leave modal has a **payroll-period selector** (default OPEN
period) sending `payrollPeriodId`, and the endpoint **executes on upload** by
default. Summary still returns `periodCandidates[]` (days/emps/chosen) for honesty.

---



| Date | Change |
|---|---|
| 2026-08-13 | Initial session findings write-up: absent policy, basic import/mismatch, TR impact, OT dual path April proof, Admin Rates limits, recommendations |
| 2026-08-13 | FILE_DUAL OT implemented: dailyRate field, rate basis Path A/B, import, backfill script, tests |
| 2026-08-17 | FILE_DUAL Basic Path A: paidDays×dailyRate, suppress Path A full-day absent, register uses computed basicPay; re-tally basic fails 481→1 |
| 2026-08-17/18 | §14c recurring DED mass, Amount vs Payment, multi-cutoff loan horizon, Jul re-tally after loan fix |
| 2026-08-18 | §14d DMA open-horizon EVERY_CUTOFF; Jul DMA fails 332→0; note local DB test-only — brute data fixes replay on VM later |
| 2026-08-25 | §14e period leave import (LVP): Leave (2) feed proven vs Sheet2 (99.2%), DM3 endpoint + UI card, engine Gross now includes leavePay; operator feedback → immediate execute + period selector; executed on local clone 321 created / ₱327,991.84; after-tally pending |

## 14h. Apr 26–May 10 cutoff parity: zero-pay statutory waiver + loan-basis finding (2026-09-15)

- Client pack `PAYROLL 2026/` (registers Dec–Apr, per-cutoff comp/ded uploads, EZ Payroll) +
  `confidential-files/HRIS Payroll Computation April 26 - May 10, 2026.xlsx` (password 9090, auto-unlocked
  via Excel COM by `run-period-tally-compare.mjs`). Full DEV run + comparison report:
  `.wwg/reports/apr26-may10-payroll-parity-20260915.md`.
- **NEW CLIENT RULE — CONFIRMED_BY_CLIENT_FILE_BEHAVIOR: a cutoff that pays zero books NO statutory
  deduction.** Nine client registers (Dec 26–Apr 25, 770–849 rows each) contain 128 zero-GrossPay people and
  **all 128 carry TOTAL DEDN = 0**. The engine already waived loans/benefits on zero gross
  (`applyZeroSalaryGuardrail`) but still charged the Aug-25 salary-based PhilHealth schedule.
- **Engine change (this session):** `waiveZeroPayContributions(grossPayWithSources, periodContributions)`
  applied in BOTH generate + preview twins right after the PH cutoff resolution. Pinned by
  `tests/zero-pay-contribution-waiver.spec.ts` (5/5) incl. a twin-call source contract. Live proof on DEV:
  00091/01303 regenerated `PH=0 totalDedn=0 TR=0`; Apr 26–May 10 tally moved **TALLIED 0 -> 2/834**
  (bands: TALLIED 2, OT_MATCH_ONLY 737, OT_OK_NEAR_50 2, UNMATCH 93; onlyInRegister 16; evidence
  `.runtime/tally-PP-20260426-20260511-2026-09-15T02-58-18/`).
- **Loan-basis finding (hypothesis audited and REJECTED as duplicate):** the RCBC "2x" on 00138
  (app 6,854.26 vs register 3,427.13) is NOT a duplicate schedule — fleet audit over the cutoff window
  found **0 duplicate emp+loanType groups** (1,182 window-covering loans;
  `.runtime/dev-payroll-test-20260914/loan-dup-audit.json`). It is ONE loan whose `monthlyPayment`
  (6,854.26) is being charged whole per cutoff while the client file charges half (3,427.13/cutoff).
  Filed REC-20260915-LOAN-MONTHLY-VS-CUTOFF-AMORTIZATION (Proposed) — needs the client's answer whether
  EmployeeLoan.monthlyPayment is monthly (÷2 per semi-monthly cutoff) or per-cutoff before any engine change.
  Residual loan-column fails stay the §14c client-data class (rcbc -3.9k / hdmfSl -14.3k / sssSl -4.5k net).
- **Unchanged walls this cutoff (measured):** absent +241k app-over-register (268 people), late +95k (262),
  W/Tax cascade -57k, PFA -32.8k not awarded (164 people x 200), day-count 146 fails = §definition,
  15 register-only employees with no app timesheet (00396, 00679, 00782, 00836, 00852, 00985, 00987, 01113,
  01127, 01228, 01370, 01432, 01523, 01730, 01775).
