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
| Gross package / DMA / loans | Still open (next residual after Basic) |

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

---

## 15. Document history

| Date | Change |
|---|---|
| 2026-08-13 | Initial session findings write-up: absent policy, basic import/mismatch, TR impact, OT dual path April proof, Admin Rates limits, recommendations |
| 2026-08-13 | FILE_DUAL OT implemented: dailyRate field, rate basis Path A/B, import, backfill script, tests |
| 2026-08-17 | FILE_DUAL Basic Path A: paidDays×dailyRate, suppress Path A full-day absent, register uses computed basicPay; re-tally basic fails 481→1 |
