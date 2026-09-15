# Payroll Audit — PP-20260826-20260911 (Aug 26–Sep 10, 2026): why only ~851 payable, and why hundreds show ₱0 / No salary

Date: 2026-09-10
Period: `PP-20260826-20260911` (`cmpxw13bf001h7zwsyy6k976f`), `SEMI_MONTHLY`, Period 2 - Aug 2026
DB audited: local DEV K3s forward `127.0.0.1:55435` (`bnpi-pats`), direct SQL via `pg`
Status at audit: `PROCESSING` (see §6 CONFLICTING note)
Scope note: request said "employee dorm Aug 26 to Sep 10". No `BenefitType.code=DORM` and no dorm/housing/accommodation field exists in schema (live codes §7). Audited as **all employees, Aug 26–Sep 10**. If "dorm" means a dormitory-fee code or a dorm-resident roster, that input is `NEEDS_CONFIRMATION`.

## 1. Headline

* Only ~851 `EmployeePayroll` rows exist because Start Payroll only writes the **DIRECT + SEMI_MONTHLY + APPROVED + basicSalary>0 + embeddedSchedule** universe (`bnpi-pats-api/helper/payroll-period.helper.ts:3964-3998`, `:4001-4016`, `:4018-4088`; candidate gate `:616-642`).
* The 1,355 AGENCY employees are excluded **by design** from this BNPI direct run — they hold APPROVED timesheets but never enter `includedEmployeesCount`.
* Correction to the interim "1 employee has no timesheet" claim: that was **header-level only** (`EMP3336`). At **day-line level**, **2,047 of 2,236 timesheet headers have zero `timesheet_lines`**, and **675 of 851 EP rows pay ₱0 gross/₱0 net** (665 of the 675 sit on 0-line timesheets). The operator screenshot (01770–01774, `No salary` + ₱0.00) is this population, not the 1-header case.
* The 5 screenshot employees **do** have APPROVED timesheet headers + EP rows + salary + schedule — they pay zero because their timesheets carry **0 day-lines** and their snapshots are `totalDays:0 / breakdown:[]`.

## 2. Bucket table (no bare integers)

| Bucket | n | How proven | Blocker class |
|---|---|---|---|
| Active employees | 2,237 | `employees isDeleted=false` | — |
| In-scope DIRECT+SEMI_MONTHLY | 882 | `workforceSource='DIRECT' AND payFrequency='SEMI_MONTHLY'` | — |
| Out-of-scope AGENCY+SEMI_MONTHLY | 1,355 | same table | `apply_path` (by-design scope; separate agency run, not a fix to this period) |
| Timesheet headers in period | 2,236 | `timesheets payrollPeriodId + isDeleted=false` | — |
| Headers APPROVED | 2,236 (DIRECT 881 / AGENCY 1,355) | `status='APPROVED'` | — |
| DIRECT headers missing entirely | 1 (`EMP3336`, ₱40k, has schedule) | left join employees→timesheets | `export_gap` (no header, no EP) |
| DIRECT APPROVED but missing payroll inputs | 29 | `basicSalary<=0 OR embeddedSchedule IS NULL` on APPROVED DIRECT | `missing_basic_salary` / `missing_schedule` |
| Payroll-ready (APPROVED + inputs) | 852 headers / 852 employees | live recompute of `buildPayrollPreviewIncludedWhere` | — |
| `EmployeePayroll` rows (all `isPaid=false`, all DIRECT) | 851 / 851 unique / 851 distinct `timesheetId`, 0 with null snapshot, 0 with null `timesheetId` | `employee_payrolls payrollPeriodId + isDeleted=false` | — |
| Ready but no EP | 1 (`EMP3338`, ₱30k, has schedule, APPROVED header `cmtuf097o00jjvxygb8vnd6fj`) | `NOT EXISTS employee_payrolls` | recoverable infra (last job flapped; resume, §6) |
| Timesheet headers with ≥1 line | 189 | `EXISTS timesheet_lines isDeleted=false` | — |
| Timesheet headers with 0 lines | 2,047 | `NOT EXISTS timesheet_lines` | `apply_path` (lines never materialized for this cut) |
| EP zero-pay (`gross=0 AND net=0`) | 675 | EP pay bands | consequence of 0-line timesheets, not salary edits |
| Zero-pay EP on 0-line timesheet | 665 | EP→timesheet→lines join | same as above |
| EP pay bands (rest) | 0–5k: 10 / 5k+: 12 / other (negross et al): 154 | `CASE` on `grossPay` | see §5 |

Stored `generationMetadata.payrollRunTotals` (`savedAt 2026-09-09T11:54:28Z`: tsTotal 880 / approved 880 / ready 851 / EP 851 / lines 1052) is `STALE` vs live (881 / 852 / 851).

## 3. Per-row samples

### 3a. Screenshot rows — have headers, pay zero for lack of days
| employeeId | source/freq | basicSalary | sched? | timesheet (APPROVED) | EP | EP.basic/gross/net | snapshot | lines |
|---|---|---|---|---|---|---|---|---|
| 01770 | DIRECT/SEMI | 5,400 | yes | `cmtmolp7100wn8hh8053oga5w` | `cmtr9j351000t8hcoelix2ddg` | 0/0/0 | totalDays 0, present 0, absent 0, `0:00`, breakdown [] | 0 |
| 01771 | DIRECT/SEMI | 6,600 | yes | `cmtmolof800wh8hh8ffrq4yvh` | `cmtr9j9gt000x8hcoze2ge6wd` | 0/0/0 | same 0-day shape | 0 |
| 01772 | DIRECT/SEMI | 3,900 | yes | `cmtmolo8w00wf8hh80pxfbfwi` | `cmtr9jefk000z8hcor4p5pqr8` | 0/0/0 | same 0-day shape | 0 |
| 01773 | DIRECT/SEMI | 6,600 | yes | `cmtmologl00wj8hh89rtak5bt` | `cmtr9jl1y00118hcotle4264m` | 0/0/0 | same 0-day shape | 0 |
| 01774 | DIRECT/SEMI | 6,600 | yes | `cmtmom5dm00wp8hh8dl5d89fu` | `cmtr9jw9000158hcohijos59s` | 0/0/0 | same 0-day shape | 0 |

UI source: payroll register (`bnpi-pats-app/app/components/templates/common/payroll-management-template.tsx:788-800` fetches `timesheetSnapshot`, not the `timesheet` relation; `:1836` `resolvePayrollRowStatus`). Status helper: `bnpi-pats-app/app/lib/utils/payroll-row-status.ts:45-99`.

### 3b. The 29 DIRECT APPROVED-but-excluded (have headers, correctly yield no EP)
24 with `basicSalary=0` (incl. `00679,00836,00852,00985,01113,01127,01212,01370,01426,01500,01520,01523,01538,01539,01598,01795,01825,01826,EMP004`), 5 of those also schedule-null (`00987,01109,01423,01425,LMS-E2E-EMP-A`), plus 5 with salary but no schedule (`01432 ₱8,500; EMP-HR-TK-001 ₱18k; EMP-HR-TK-002 ₱18k; TESTBEN003 ₱25k; TESTBEN004 ₱25k`). Full list §2 query `DIRECT_APPROVED_BUT_EXCLUDED`.

### 3c. Header-missing / EP-missing edges
* `EMP3336` (DIRECT/SEMI, ₱40k, has schedule): no timesheet header, no EP.
* `EMP3338` (DIRECT/SEMI, ₱30k, has schedule): APPROVED header, no EP — the single ready-without-payroll gap.

### 3d. Zero-pay fleet sample (first 30 of 675)
`00021,00024,00032,00050,00062,00065,00073,00088,00092,00093,00094,00098,00104,00105,00111,00115,00121,00138,00143,00147,00150,00151,00153,00156,00157,00163,00164,00166,00168,00198…`

## 4. Why the register shows ₱0.00 + No salary for people who HAVE a salary

* Register BASIC/ABSENT/GROSS/DEDUCT/NET columns render the **EP money snapshot** (`basicPay`, `grossPay`, …), not `Employee.basicSalary`. EP money is zero when the timesheet contributed zero days.
* The `No salary` badge is the zero-pay catch-all (`payroll-row-status.ts:45-99`): paid→`Paid`; any pay→`Unpaid`; else `No salary` + reason chain (no basic → no timesheet → no days → all-absent → computed-zero).
* Local DEV snapshots for 01770–01774 exist with `totalDays:0`, which maps to reason `Timesheet has no days` (`:76-82`), **not** `No timesheet for this period` (`:69-75`, requires both `row.timesheet` and snapshot null — and the register fetch never selects the `timesheet` relation). The screenshot tooltip reading `No timesheet for this period` is therefore `CONFLICTING` with local DEV row content: candidate causes are (a) hovered row above the crop with null snapshot, (b) different env/URL (VM DEV `:3101` / PROD `:3001` / public) where snapshots differ, or (c) older app bundle. `NEEDS_CONFIRMATION`: which host/URL the screenshot came from — re-prove against that DB before treating tooltip text as defect.

## 5. Money-shape note (do not misread 851 = 851 paid)

EP 851 ≠ 851 people paid. Live bands: zero 675 / 0–5k 10 / 5k+ 12 / other (includes negative-gross rows e.g. `00010 gross -11,667.13`) 154. Only ~22 rows carry material positive gross. "800+ payable" in Run Payroll means **in-scope for the job**, not take-home > 0.

## 6. Run-state conflict (do not reopen)

* `.wwg/workspace/current-task.md` records this period `COMPLETED 851/851`.
* Live DB: `status=PROCESSING`, `payrollGeneration.jobId e702b423 … started 2026-09-09T12:09:14Z … failed 649 / success 202`, per-row error `prisma.employeePayroll.findUnique() … Can't reach database server at 127.0.0.1:55435` (`payroll-period.helper.ts:1959`). The Sep-9 11:54 totals predate that failed job.
* No duplicate EP: `count = uniq = distinct timesheetId = 851`; no employee holds 2 headers in this period (`HAVING count>1` → 0 rows).

## 7. Dorm term

Live `benefit_types` (grouped): `ABS, AON, ARP, ASA, DMA, HYS, INC, LLA, LVP, MHDMF2, MLA, MTX, NDA, NEGADJ, NPA, OAD, OBA, OTM, PFA, TSA, UFD, UNIDED` (+ directions in §1 query `BENEFIT_CODES`). No `DORM`. No employee dormitory/accommodation column matched in schema search. Treated as "from". If dormitory fee or dorm-resident list exists under another name, supply the code/field and this report re-slices.

## 8. Next agent steps (not executed)

1. Confirm screenshot env/URL (local `127.0.0.1` vs VM `10.184.37.19` DEV/UAT/PROD vs public `*.bnpi-pats.tech`) and re-run §2 counts there — do not assume env parity.
2. Materialize missing day-lines for the period (`POST /api/timesheet/:id/sync-obligation-lines`, fills missing dates only; proven payroll-lock safe Sep 8 Whilma recovery) — fleet scope, then verify `TS_ZERO_LINES → ~0` and snapshots gain days.
3. Resume `POST /api/payrollperiod/:id/generate-timesheet` (skips paid/locked, upserts rest) until `COMPLETED`; prove `EP = ready` and zero-pay band collapses for worked days. `EMP3338` should appear; `EMP3336` needs a header first (`ensure-period-drafts`).
4. Do NOT `Reopen` the period (would clear good EP state). Agency coverage, if wanted, is a separate scoped run.
5. Optional UI honesty follow-up: register reason relies on a `timesheet` relation the query never fetches — either fetch it or remap the `No timesheet` reason to snapshot-days wording so headers-with-zero-days stop reading as missing headers.

## 9. Evidence & provenance

* Direct SQL scripts (local, read-only): `audit-dorm.js` (period + scope + EP + benefit codes), `audit-dorm2/3/4/5.js` (29-excluded list, EMP3336/3338 edges, dup checks), `audit-missing.js` (01770–01774 + EP source/snapshot null checks), `audit-zero.js` (snapshots + line counts + 675 zero-EP), `audit-fleet.js` / `audit-fleet2.js` (2,047 zero-line / 189 with lines / 665 zero-EP-on-zero-lines). Temp scripts under `%LOCALAPPDATA%\Temp\opencode\`, not committed.
* API: `GET /api/payrollperiod?document=true&pagination=false` (period identity + PROCESSING + failed job payload); preview endpoint not used for counts (heavy; DB used instead).
* Code: scope gates `bnpi-pats-api/helper/payroll-period.helper.ts:616-642, 3964-3998, 4001-4016, 4018-4116`; status UI `bnpi-pats-app/app/components/templates/common/payroll-management-template.tsx:770-804,1836`, `bnpi-pats-app/app/lib/utils/payroll-row-status.ts:1-100`; schemas `bnpi-pats-api/prisma/schema/payrollperiod.prisma`, `employeepayroll.prisma:1-12,250-286`, `benefittype.prisma`.
* Prior truth: `.wwg/workspace/current-task.md` (COMPLETED claim, Whilma Sep-3 materialization note, 880/851 totals); `.wwg/wiki/project-truth.md` + `terminology.md` (preview vs Start Payroll payable contract); `.wwg/reports/wwg-agent-handoff.md`, `payroll-audit-20260903.md`, `timekeeping-deep-audit-20260908.md`.

No code, data, or status changed in this audit. No new recommendations beyond §8.5 (candidate).

## 10. Addendum 2026-09-10 — EMP3338 ₱180,000 absent autopsy (operator payslip proof)

Row: `EMP3338` (Char Aznable, GA/HR Management Trainee), `basicPay ₱30,000`, `absentDeduction ₱180,000`, `gross −₱150,000`, `totalDeductions ₱1,500` (PhilHealth only; SSS/Pag-IBIG ₱0), `net ₱0`. EP created `2026-09-10T02:17:47Z` — after the §2 count, which resolves the "ready but no EP" line: that gap is now closed by this (bad-math) row.

Tenure (the operator's "you should check" — confirmed): `employmentHireDate = employmentStartDate = 2026-09-08T16:00Z` (Sep 9 Manila), `employmentStatus ONBOARDING`, created Sep 9. In-period tenure = Sep 9–10 only → 2 `attendance_obligations` (both `EXPECTED/PAID`), 0 `attendances`, 0 `device_events`, 2 `timesheet_lines` (Sep 9 `ABSENT`, Sep 10 `NOT_CLOCKED_IN`). Pre-Sep-9 days are `OUT_OF_TENURE`, correctly unobligated. So `totalWorkDays=2` and the 2-line timesheet are **correct**; the money is not.

Mechanism (`bnpi-pats-api/helper/payroll-period.helper.ts:2052-2067` divisor, `:2153-2158` Path-B base): `dailyRate = 30,000/2 = ₱15,000` (`metadata.dailyRate`, `rateBreakdown "PHP 30000.00 / 2 days"`), then `pathBDaysAbsent = max(0, 12 − 0 worked) = 12`, `absent = 12 × 15,000 = ₱180,000`. The counted absent days (1–2) never enter the charge. Correct per the operator's rule: in-tenure scheduled 2, present 0 → absent **2**; cutoff-divisor absent `2 × 15,000 = ₱30,000`, gross `₱0`, net `₱0` (same take-home, honest magnitudes); BNPI-313 variant `2 × 2,300.32 ≈ ₱4,601`. Fictitious magnitude `6× basic` for a 2-day tenure is impossible.

Secondary defects on the same row: (a) payslip daily table shows `−₱15,000`/day (sums to `−₱30k`) while the header carries `−₱180k/−₱150k` — display vs header inconsistent; (b) snapshot says `absent 1` while both daily rows render `ABSENT` (line `NOT_CLOCKED_IN` vs snapshot count mismatch); (c) PhilHealth `₱1,500` (= 60k monthly × 2.5%) charged on a negative gross while SSS/Pag-IBIG are ₱0 — contributions on a negative base need a floor; (d) `basicPay` keeps the full ₱30,000 for 2 days' tenure — pro-rata policy `NEEDS_CONFIRMATION`. Gross must never go negative: clamp `absentDeduction ≤ basicPay`.

Proposed fix (not implemented — payroll money, needs operator order): cap Path-B base at in-tenure scheduled days (`min(12, tenureScheduled)`), charge counted absent days instead of `12 − worked`, and clamp `absentDeduction ≤ basicPay` + zero contributions on `gross ≤ 0`. Then re-materialize + resume this period (no `Reopen`).

## 11. Fix implemented 2026-09-10 (operator-ordered) + resume running

Cohort pattern (all five blowup rows fit `absent = 12 × basic/tenureWorkDays`):

| employee | basic | hire (Manila) | lines | counted ABSENT | charged (old) | correct (new) |
|---|---|---|---|---|---|---|
| EMP3333 | 15,000 | Aug 20 (full tenure, 16 lines: 5 ABSENT, 1 NCI, 2 HOLIDAY, 4 REST, 4 SCHEDULED) | 16 | 5 | 12×1,250=15,000 (net ₱250) | 9×1,250=11,250 (net ≈₱9,000; +₱8,750 correction) |
| EMP3334 | 40,000 | Aug 22 (1 line: Sep-10 SCHEDULED, shift still open) | 1 | 0 | 12×40,000=480,000 | 0 |
| EMP3335 | 25,000 | Aug 25 (6 SCHEDULED Sep 5–10) | 6 | 0 | 12×4,166.67=50,000 | 5×4,166.67=20,833 |
| EMP3337 | 30,000 | Sep 4 (3 SCHEDULED Sep 8–10) | 3 | 0 | 12×10,000=120,000 | 2×10,000=20,000 |
| EMP3338 | 30,000 | Sep 9 (ABSENT Sep 9 + NCI Sep 10 open) | 2 | 1 | 12×15,000=180,000 | 1×15,000=15,000 |

SCHEDULED-line dates are all past (stale unprocessed) except Sep-10-today lines, whose shift was still open at generation — those stay open for the next run.

Code (`bnpi-pats-api/helper/payroll-period.helper.ts`): new exported `resolvePathBAbsentDays()` + `PAYROLL_PATH_B_CUTOFF_BASE_DAYS=12`, wired into both generate (`pathBDaysAbsent`) and preview (`pathBDaysAbsentPreview`) twins. Rule: `absent = min(evidencedPool, min(12, totalWorkDays) − worked − openToday)`, where pool = ABSENT (any date) + past NOT_CLOCKED_IN/SCHEDULED/INCOMPLETE + past PRESENT-with-no-usable-pair (missing-punch no-pay preserved); LEAVE/HOLIDAY/REST never charged; today-or-later (Manila) lines stay open. Fully-materialized full-period timesheets resolve identically to legacy `12 − worked`, except LEAVE/HOLIDAY lines are no longer double-charged as absent (Path-A parity; tally will move on leave rows — flagged). Boundedness is structural: `absent ≤ min(12, total) − worked − open` with `dailyRate = basic/total` ⇒ `absentDeduction ≤ basicPay`, gross can no longer go negative from absent alone.

Tests: `bnpi-pats-api/tests/path-b-absent-days.spec.ts` 7/7 (legacy parity, EMP3338/3337/3334/3333 shapes, missing-punch PRESENT still charged, usable PRESENT never charged). Neighbors 42/42 green (register-basic-pay, 313 daily rate, hourly snapshot, missing-punch ×2, special-holiday split). `tsc` on touched regions clean (2× TS1117 `notes` duplicates proven pre-existing on HEAD).

Live preview proof (no writes): `GET .../PP-20260826-20260911/generate-timesheet/preview?calculateRows=true&employeeId=<EMP3338>` → basicPay 30,000 / absent **15,000** (was 180,000) / gross 15,000 / net 13,037.55. Summary now reads scope 882 / approved 881 / ready **852** (stored 851 totals confirmed stale).

Write path: rollback snapshot of the 5 cohort EP rows saved to `%LOCALAPPDATA%\Temp\opencode\rollback-cohort-20260910.json` (pre-fix money preserved). Resume fired `POST /api/payrollperiod/:id/generate-timesheet` → job `3ed1551b`, total **852**, `resumeFromExistingPayrolls` (all rows unpaid → all recomputed with fixed code). Progress at +2 min: 19/852, failed 0. Watch to COMPLETED; then re-read cohort rows + fleet zero-band as convergence proof (badge alone is not proof).

NOT pushed: `develop` push would auto-roll DEV/UAT/PROD API with new money math — production-adjacent, needs explicit operator order. VM replay of this fix is also pending that order.

## 12. Second fix pass 2026-09-10 — pro-rata basic + operator-600 gate + generate/preview parity (operator-ordered)

Operator rule: mid-period hires/exits get schedule-based pro-rata basic (never full cutoff), for hires AND terminations, based on THEIR schedule — not materialized days. Tenure source verified: `attendance_obligations` exist only in-tenure (0 `OUT_OF_TENURE` rows stored this period).

(a) `resolveTenureProRata()` (`bnpi-pats-api/helper/payroll-period.helper.ts`): in-tenure scheduled workdays over schedule-derived monthly days (weekly pattern × 52/12; Mon–Sat fallback with flag; 1969 sentinel termination ignored). Full tenure → factor 1, basic untouched (zero tally impact). Wired into generate + preview: Path-B basic input, 313/cutoff daily override (schedule daily), tenure fields stamped on EP metadata. EMP3337 (stored 7-day pattern): basic 30,000 → **5,934.07**, daily 1,978.02; with HR-corrected Mon–Sat pattern it becomes 6,923.08 / 2,307.69. HR action still open: her pattern says Sunday-work vs week-view Monday-off vs Mon–Sat standard; Sep 4–7 pre-start stay `OUT_OF_TENURE` unless HR moves the start date.

(b) Operator-600 fallback gate: `resolveEmployeeDailyRate` 600-default now skipped when semi-monthly basic ≥ ₱15,000 (≈ a full month of 600/day — monthly contract, not daily-rated). Fleet proof: 1,931 operator-titled staff, clean split — legacy daily cohort tops at 6,600, monthly hires at 25–40k (incl. EMP3336, the header-missing hire starting Sep 14, i.e. next cutoff — explains the "1 missing timesheet"). Explicit Daily Salary still wins first; true daily operators unchanged.

(c) Generate/preview parity defect (found live): generate's chunk select lacked `position`, so generate NEVER applied the title sniff while preview did — same employee priced two ways (EMP3335/3337 generated Path-B −50k/−120k, previewed Path-A 0/0). `position.title` added to the generate select. Preview zeros for 3335/3337 are now explained (Path-A 600 × 0 paid days, pre-gate).

Live preview proof (post-reload): EMP3335 basic **9,890.11** / absent **8,241.75** / gross 1,648.36 / net 398.36 (was 25k/50k/−25k); EMP3337 **5,934.07** / **3,956.04** / 1,978.03 / 478.03 (was 30k/120k/−90k); EMP3333 15,000 / 11,250 / 6,000 / 5,250 (was net 250); EMP3334 3,692.31 / 0 / 3,692.31 / 1,692.31 (5-day pattern, Sep-10 open); EMP3338 5,538.46 / 2,769.23 / 2,769.23 / 1,269.23 (was 30k/180k/−150k). Note: PhilHealth still full-cutoff salary-schedule (1,250/1,500/2,000) on pro-rata gross — policy question for HR, not changed.

Tests: 7 path-B + 7 tenure + 4 daily-gate + 8 neighbors = 26/26 green. tsc: only the 2 pre-existing TS1117 `notes` duplicates (proven on HEAD).

Ops lessons: (1) tsx-watch reloads orphan in-process runs — first resume (job `3ed1551b`, fix-A only) died at ~64–86 rows with no active worker; batch code before firing. (2) DB forward died mid-session (`ECONNREFUSED 55435`, stale ssh PID 27176); rebuilt same-command forward, TCP verified — second resume (job `37022f23`, final code, fresh pool) fired 03:20:32Z. Rollback snapshot: `%LOCALAPPDATA%\Temp\opencode\rollback-cohort-20260910.json`.

## 13. Lock-gated recompute 2026-09-10 — targeted cohort rewrite (operator-ordered fix)
Second resume (`37022f23`) went `COMPLETED 852/852 failed 0` in ~3 min with **zero row writes** (`updatedAt` untouched): the Sep-4 bulk timesheet locks make every row resume-skipped, so the shared completion path finalizes status/totals without recomputing. Stale locks predate correct math; nothing is paid. Recovery: verified none of the 5 cohort rows `isPaid`, saved lock before-image (`unlock-cohort-before.json`), cleared `lockedAt` on exactly those 5 timesheets, re-fired resume (job `d18650ca`, total 852 — recomputes only unlocked rows, rest skipped). Fleet-wide fix-A re-touch (leave double-charge etc. on locked rows) is a separate unlock decision — proposed after cohort proof, not executed.

## 14. Convergence proof 2026-09-10 — cohort rewritten, mop-up running

Job `d18650ca` reached the cohort (sorted last) and rewrote all five (live DB read-back):

| employee | basic | absent | gross | deduct | net | before |
|---|---|---|---|---|---|---|
| EMP3333 | 15,000 | 11,250 (9×1,250) | 6,000 | 750 | 5,250 | net 250 |
| EMP3334 | 3,692.31 | 0 (Sep-10 open) | 3,692.31 | 2,000 | 1,692.31 | −440,000 |
| EMP3335 | 9,890.11 | 8,241.75 (5×1,648.35) | 1,648.36 | 1,250 | 398.36 | −25,000 |
| EMP3337 | 5,934.07 | 3,956.04 (2×1,978.02) | 1,978.03 | 1,500 | 478.03 | −90,000 |
| EMP3338 | 5,538.46 | 2,769.23 (1×2,769.23) | 2,769.23 | 1,500 | 1,269.23 | −150,000 |

No negative gross remains in the cohort. Residual notes: PhilHealth stays full-cutoff salary-schedule on pro-rata gross (policy question for HR); EMP3337's exact pesos move to 6,923.08/2,307.69 once HR corrects her Sunday-work pattern to Mon–Sat.

Same job took 44 transient DB-flap failures (all `Can't reach database server`, flap windows between healthy polls) and `COMPLETED 852/808/44`. Failed-code read-back: 11 of the 44 still carry negative gross old math (`01454,01456,01462,01463,01464,01465,01638,01641,01642,01643,01645`). Mop-up re-run fired on the COMPLETED period (job `e957bb27`, full recompute — resume-skip does not apply post-completion). Monitoring to failed=0; will finalize totals + fleet zero/negative bands here.
