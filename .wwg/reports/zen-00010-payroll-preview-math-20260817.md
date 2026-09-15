# Zen Andrei (00010) — Period 1 Aug 2026 payroll preview math

Timezone for this note: **Asia/Manila (UTC+8)**.  
Clock in/out below are converted from stored UTC instants (`…Z`) to Manila.  
Period and timesheet **dates** (11–25 Aug) are the Manila business dates on the row, not a UTC day-shift.

Status: **preview only**. No saved `EmployeePayroll` / payslip yet.

## Who / what

| Item | Value |
|---|---|
| Employee | Zen Andrei |
| Employee no. | 00010 |
| Employee id | `cmspnnxot02s5qw01yk7yy2er` |
| Position / dept | Technician / GA/HR |
| Hire / start | 12 Aug 2026 |
| Period | Period 1 — Aug 2026 (`PP-20260811-20260826`) |
| Cutoff (Manila dates) | **11 Aug 2026 – 25 Aug 2026** |
| Pay date (Manila date) | 31 Aug 2026 |
| Timesheet | `cmswwobaz05mxlp01e8p71f9q` |
| Timesheet status | APPROVED |
| Approved (Manila) | 17 Aug 2026, 3:22:47 PM |
| Pay frequency | SEMI_MONTHLY |
| Period basic | ₱11,000.00 |
| Monthly (engine) | ₱22,000.00 |

Code and git status for this thread: `.wwg/reports/zen-payroll-timesheet-code-20260817.md`.

JSON proof:

- `.runtime/zen-timesheet-payroll-20260817/17-timesheet-for-math.json`
- `.runtime/zen-timesheet-payroll-20260817/18-preview-for-math.json`

---

## Result (preview)

| Line | Amount (PHP) |
|---|---:|
| Period basic | 11,000.00 |
| Absent (3 days) | −2,357.14 |
| Late + undertime | −2,011.76 |
| OT / night diff / holiday pay | 0.00 |
| **Gross** | **6,631.10** |
| SSS | −675.00 |
| PhilHealth | −331.56 |
| Pag-IBIG | −200.00 |
| Tax / loans / MLA | 0.00 |
| **Net** | **5,424.54** |

Register still prints **Basic Pay ₱11,000.00** (period salary). **Gross ₱6,631.10** is after attendance.

---

## 1) Daily / minute rate

Engine counts every timesheet line whose status is **not** `REST_DAY`.

| Input | Value |
|---|---|
| Period basic | ₱11,000.00 |
| Lines counted | **14** (12 Aug–25 Aug; hired 12 Aug so 11 Aug is not on the sheet) |
| Daily rate | 11,000 ÷ 14 = 785.714285… → **₱785.71** |
| Hours per day used | 8 |
| Hourly | 785.714285… ÷ 8 = **₱98.214286** |
| Per minute | 98.214286 ÷ 60 = **₱1.636905** |

The 14 lines include 3 PRESENT, 3 ABSENT, 2 HOLIDAY, and 6 future SCHEDULED days. None are `REST_DAY`.

---

## 2) Timesheet proof (Asia/Manila clocks)

Stored punches are UTC. Display = UTC + 8 hours.

| Date (Manila) | Status | Time in (Manila) | Time out (Manila) | Regular | Late | UT |
|---|---|---|---|---:|---:|---:|
| Wed 12 Aug 2026 | PRESENT | 2:31:48 PM | 2:53:20 PM | 0:22 | 5:16 | 2:07 |
| Thu 13 Aug 2026 | PRESENT | 1:39:22 PM | 3:03:43 PM | 1:24 | 4:24 | 1:57 |
| Fri 14 Aug 2026 | ABSENT | — | — | 0:00 | 0:00 | 0:00 |
| Sat 15 Aug 2026 | ABSENT | — | — | 0:00 | 0:00 | 0:00 |
| Sun 16 Aug 2026 | ABSENT | — | — | 0:00 | 0:00 | 0:00 |
| Mon 17 Aug 2026 | PRESENT | 1:40:36 PM | 2:55:11 PM | 1:15 | 4:40 | 2:05 |
| Tue 18 Aug 2026 | SCHEDULED | — | — | 0:00 | 0:00 | 0:00 |
| Wed 19 Aug 2026 | SCHEDULED | — | — | 0:00 | 0:00 | 0:00 |
| Thu 20 Aug 2026 | SCHEDULED | — | — | 0:00 | 0:00 | 0:00 |
| Fri 21 Aug 2026 | HOLIDAY | — | — | 0:00 | 0:00 | 0:00 |
| Sat 22 Aug 2026 | HOLIDAY | — | — | 0:00 | 0:00 | 0:00 |
| Sun 23 Aug 2026 | SCHEDULED | — | — | 0:00 | 0:00 | 0:00 |
| Mon 24 Aug 2026 | SCHEDULED | — | — | 0:00 | 0:00 | 0:00 |
| Tue 25 Aug 2026 | SCHEDULED | — | — | 0:00 | 0:00 | 0:00 |

Header totals (same sheet):

| Total | Clock | Minutes |
|---|---|---:|
| Regular / hours worked | 3:01 | 181 |
| Late | 14:20 | 860 |
| Undertime / early out | 6:09 | 369 |

Late check: 5:16 + 4:24 + 4:40 = **14:20**.  
UT check: 2:07 + 1:57 + 2:05 = **6:09**.

UTC source of the three punches (for audit only):

| Manila clock | Stored UTC |
|---|---|
| 12 Aug 2:31:48 PM – 2:53:20 PM | `2026-08-12T06:31:48.000Z` – `2026-08-12T06:53:20.000Z` |
| 13 Aug 1:39:22 PM – 3:03:43 PM | `2026-08-13T05:39:22.000Z` – `2026-08-13T07:03:43.000Z` |
| 17 Aug 1:40:36 PM – 2:55:11 PM | `2026-08-17T05:40:36.000Z` – `2026-08-17T06:55:11.000Z` |

Those three PRESENT days match saved attendance for device person `10`.

---

## 3) Attendance money

### Absent

3 ABSENT days (14, 15, 16 Aug 2026, Manila).

```text
3 × (11,000 ÷ 14) = 33,000 ÷ 14 = 2,357.142857… → ₱2,357.14
```

### Late + early-out (shortfall)

Engine: `(late minutes + early-out minutes) × minute rate`

```text
(860 + 369) × (11,000 ÷ 14 ÷ 8 ÷ 60)
= 1,229 × 11,000 ÷ 6,720
= 13,519,000 ÷ 6,720
= 2,011.75595… → ₱2,011.76
```

| Deduction | Qty | Rate | Amount |
|---|---:|---:|---:|
| Absent | 3 days | ₱785.71 / day | ₱2,357.14 |
| Late + UT | 1,229 min | ₱1.6369 / min | ₱2,011.76 |
| **Attendance cut** | | | **₱4,368.90** |

---

## 4) Gross

```text
Period basic                         11,000.00
− Absent                              2,357.14
− Late + undertime                    2,011.76
+ OT / ND / holiday pay                   0.00
─────────────────────────────────────────────
Gross                                 6,631.10
```

---

## 5) Statutory + net

These follow the **reduced gross**, not the original ₱11,000.

| Deduction | Amount | How |
|---|---:|---|
| SSS | ₱675.00 | SSS table on the lower monthly equivalent (was ₱1,100 on ₱22,000) |
| PhilHealth | ₱331.56 | 2.5% × (6,631.10 × 2) = 2.5% × 13,262.20 |
| Pag-IBIG | ₱200.00 | Period HDMF |
| Tax / loans / MLA | ₱0.00 | None on this row |
| **Total statutory** | **₱1,206.56** | 675.00 + 331.56 + 200.00 |

```text
Gross                                 6,631.10
− Statutory                           1,206.56
─────────────────────────────────────────────
Net                                   5,424.54
```

---

## 6) What this is / is not

| Claim | Status |
|---|---|
| Preview uses this timesheet | Yes |
| Punches are saved attendance taps | Yes (12 / 13 / 17 Aug 2026, Manila) |
| Absent / late reduce gross | Yes, after lines were attached |
| Saved payslip exists | No — preview only |
| Daily rate = present days only (3) | No — engine used **14** non-rest lines, including future SCHEDULED and holidays |

Code path: `bnpi-pats-api/helper/payroll-period.helper.ts`  
`dailyRate = periodBasic / totalWorkDays` when Bandai 313 buckets are absent;  
`absentDeduction = daysAbsent × dailyRate`;  
`shortfallDeduction = (lateMinutes + earlyOutMinutes) × minuteRate`;  
`grossPay = periodBasic − absent − shortfall + OT + ND + holiday`.
