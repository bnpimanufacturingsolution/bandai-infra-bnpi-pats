# E2E — New-cutoff payroll tally (dry-run → Run Payroll → register)

**Status:** `EXECUTE_NOW`  
**Created:** 2026-08-04  
**Assumes:** new-cutoff packs already imported (comp/ded/OT/biometrics/workshare as available).  
**Do not invent pay.** Probe → table numbers → fix residual class → re-probe until EXIT GATE.

Related:
- OT-only: `docs/00-product/AGENT-PROMPT-e2e-ot-report-vs-run-payroll.md`
- OT graph: `docs/00-product/AGENT-PROMPT-graph-ot-truth-run-payroll-tally.md`
- Column map / sources: `docs/BNPI_JUNE11_25_2026_PAYROLL_PARITY_CHECKLIST.md`
- Comparison engine: `hris-api/scripts/dry-run-bandai-payroll-comparison.ts`
- Preview engine (same as Run Payroll preview): `previewPayrollFromTimesheets` in `payroll-period.helper.ts`
  - **2026-08-12:** Preview dry-run may include non-APPROVED timesheets
    (`DRAFT`/`SUBMITTED`/`REJECTED`/`REVISED`) as **estimate-only** rows when
    salary+schedule exist. Money uses lines/benefits (status alone does not
    change pay). **Start Payroll** still counts only
    `summary.includedEmployeesCount` (APPROVED ready). Prefer
    `previewComputableEmployeesCount` + row `isPayrollReady` when classifying
    readiness vs dry-run coverage.

---

## 0. Paste-ready kickoff (copy whole block)

```text
Execute docs/00-product/AGENT-PROMPT-e2e-new-cutoff-payroll-tally-dryrun-to-run.md end-to-end.

Context: new-cutoff files are ALREADY imported. Do not re-upload blindly unless
probe shows SOURCE_INCOMPLETE / missing enrollment. Prefer probe → repair →
dry-run comparison → preview → (only if authorized) re-generate payroll.

Primary period: PP-20260611-20260626 (June 11–25)
Secondary:     PP-20260626-20260711 (June 26–July 10)
Optional:      PP-20260711-20260726 (July 11–25)

Register workbooks (password 9090):
  docs/new-cutoff/june-11-25/HRIS Payroll Computation June 11 - 25, 2026.xlsx
  docs/new-cutoff/june-26-10/HRIS Payroll Computation June_26 - July 10, 2026.xlsx

Frozen sample (must always report):
  Emp 01360 Rio Jane Marasigan — June 11–25

Column rules (HARD — never mix):
  NetPay  ↔ register NetPay only
  Incentive 2025 / ARP / PFA / LLA  ↔ TotalReceivable / receivable-only (NOT NetPay)
  OT payable hours = RegOT+SpclOT+RHolOT+RDOT (NOT ND, NOT plain RD)

DB: FORCE_ENV_DB=1
    DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55435/hris?schema=public
    Forward if needed: ssh project-truth-hris -L 127.0.0.1:55435:10.43.130.9:5432

Every phase MUST print a NUMBER table (counts, ₱, hours). HEARTBEAT each cycle.
Non-stop until EXIT GATE green or real residual classes only.
Evidence: .runtime/payroll-tally-e2e-<stamp>/
```

---

## 1. Source of truth map (what beats what)

| Rank | Source | Role |
|---:|---|---|
| 1 | BNPI **register** `.xlsx` for that cutoff (password **9090**) | Target money columns |
| 2 | `previewPayrollFromTimesheets` / Run Payroll **preview** | Live engine truth before/after re-gen. May include estimate-only non-APPROVED rows; filter `isPayrollReady===true` when tallying “payable” only |
| 3 | `EmployeePayroll` stored row | Only after successful generate; may be **STALE** if period COMPLETED before source fix |
| 4 | `EmployeeBenefit` + `reconciliationAction` | INC/ARP/PFA = **RECEIVABLE_ONLY**; AON/TSA/OBA = **GROSS_INCLUDED** |
| 5 | Timesheet lines + `bandaiPayrollSourceRepair` | Approved OT hours |
| 6 | `EmployeeScheduleHistory` (WorkSharing reason/metadata) | Schedule deltas (not pay math by itself) |
| 7 | Run Payroll UI chips | Must match API readiness / preview summary within rounding |

**Hard ban:** Comparing UI **NetPay** to register **Incentive** column.  
**Hard ban:** Inventing loan rows when deduction mass upload is short → label `SOURCE_INCOMPLETE`.

---

## 2. Expected numbers (proven baseline — re-probe; do not treat as permanent)

### 2.1 Rio `01360` · `PP-20260611-20260626` (after INC RECEIVABLE_ONLY fix)

| Metric | Preview / engine | Stored row may be | Register anchor |
|---|---:|---:|---:|
| basicPay / period basic | 9,500 | 9,500 | 9,500 |
| Reg OT hrs | **25** | 25 | 25 |
| OT pay | **2,845.45** | 2,845.45 | 2,845.45 |
| grossPay | **12,345.45** | 12,345.45 | register Gross may differ if extra gross lines |
| netPay | **10,303.18** | 10,303.18 | register NetPay (e.g. ~7,269.50 if loans present) |
| receivable INC | **25,922.41** | may be 0 if stale | Incentive 25,922.41 |
| receivable ARP | **500** | may be partial | Attendance Recognition 500 |
| **totalReceivable** | **36,725.59** | often **stale** (e.g. 10,803) | Net + Incentive + ARP |

```text
expectedReceivable = netPay + 25922.41 + 500 = 36725.59  (when net=10303.18)
```

If register NetPay is **7,269.50** and TOTAL DEDN **5,325.95** (SSS/RCBC loans), residual class is often **`SOURCE_INCOMPLETE`** (deduction file ~24 rows) or loan installments not resolved — **not** Incentive.

### 2.2 Period scope chips (June 11–25, unscoped)

| Metric | Expect ~ |
|---|---:|
| Scope employees | ~870 |
| Approved timesheets | ~834 |
| Payable / included | ~820–821 |
| Approved OT people | ~697 |
| Approved OT hours | ~15,171.8 |

(Re-probe with `probe-ot-truth-fast.ts` + metrics/preview; table must use live numbers.)

### 2.3 WorkSharing history

| Metric | Expect |
|---|---|
| History rows with WorkSharing reason/metadata | large (thousands after successful apply) |
| Run Payroll **Schedule changes** accordion | `workshareDeltas`, `uniqueEmployees`, before→after template codes |
| API | `GET /api/payrollperiod/:id/schedule-deltas?onlyWorkshare=true&limit=30` |

---

## 3. Ordered execution phases (do in order)

### Phase A — Bootstrap + health (numbers)

```powershell
# HEARTBEAT | phase=A
cd C:\Users\stari\bandai-infra
# DB forward if needed
# ssh project-truth-hris -N -L 127.0.0.1:55435:10.43.130.9:5432
$env:FORCE_ENV_DB='1'
$env:PG_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55435/hris?schema=public'
$env:DATABASE_URL=$env:PG_DATABASE_URL
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dir = ".runtime\payroll-tally-e2e-$stamp"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

# Expect: TCP 55435 up; API :3001 /health 200 (restart npm.cmd run dev in hris-api if down)
```

**Pass:** DB ping OK + API health OK. Write `A-health.json`.

---

### Phase B — OT truth (file ↔ DB ↔ readiness)

```powershell
cd hris-api
npx tsx scripts/probe-ot-truth-fast.ts
# Copy INDEX.json into $dir
```

| Gate | Pass condition |
|---|---|
| peopleDbEqReadiness | both packs |
| hoursDbEqReadiness | both packs |
| dayMismatch | **0** |
| empMissingDb | all explained (`no_employee_record` / no timesheet) |

If fail: `repair-bandai-payroll-source-timesheet-lines.ts --apply --periodCode=... --overtime-workbook=...` then re-probe.

**Companion:** `docs/00-product/AGENT-PROMPT-e2e-ot-report-vs-run-payroll.md`

---

### Phase C — Benefit type + money source (no blind re-import)

1. Probe `BenefitType` for codes: INC, ARP, PFA, LLA, AON, TSA, OBA  
   - **Expect:** INC/ARP/PFA/LLA → `RECEIVABLE_ONLY`; AON/TSA/OBA → `GROSS_INCLUDED`
2. If INC is null: set RECEIVABLE_ONLY (product: post-net). Heal via mass-upload helper path already in `bnpi-mass-upload-import.service.ts`.
3. Only re-run money import if enrollments missing for sample set:

```powershell
$env:PACK_DIR='docs/new-cutoff/june-11-25'
$env:COMP_FILE='Compensation Mass Upload 06.30.26.xlsx'
$env:DED_FILE='Deduction Mass Upload 06.30.26.xlsx'
$env:EVIDENCE_DIR="../$dir/money-j11"
$env:SAMPLES='01360,01713,01791'
npx tsx scripts/fast-import-cutoff-money.ts
# Print: comp total/updated/failed, ded total/updated/failed
```

**Pass:** Rio has period-scoped INC ≈ 25922.41 and ARP 500; no double open-horizon + period INC.

---

### Phase D — Schedule Truth (Mon–Sat Universal Schedule Active; WorkSharing Retired)

> [!NOTE]
> WorkSharing schedule upload is **retired** (REC-20260826-DAY-STATUS-REVIEW-QUEUE). Default Monday–Saturday schedule templates apply directly without period-specific WorkSharing `0` flags (which were confirmed ambiguous between Rest, Absent, and Leave). Schedule deltas and ambiguities are reviewed in Day-Status Review (`/hr/day-status-review`).

**Pass table:**

| Pack | matched | updated | alreadyTally | history rows (sample) |
|---|---:|---:|---:|---|

**UI:** Run Payroll → accordion **Schedule deltas** (under Approved OT stack).  
**API:** `GET .../schedule-deltas`

---

### Phase E — Engine dry-run preview (before any re-generate)

For frozen samples at least **01360**:

```text
Call previewPayrollFromTimesheets (periodId, orgId, employeeId=internal id, calculateRows=true)
OR Run Payroll → Preview Payroll → open employee detail
```

**Must print:**

| Emp | netPay | grossPay | otHrs | otPay | receivableOnly | totalReceivable |
|---|---:|---:|---:|---:|---:|---:|

**Pass for Rio after source fix:**

- totalReceivable = netPay + INC + ARP (within ₱0.02)
- otHrs = 25, otPay = 2845.45
- INC not inside netPay

---

### Phase F — Register comparison (existing scripts)

```powershell
cd hris-api
npx tsx scripts/dry-run-bandai-payroll-comparison.ts `
  --workbook="..\docs\new-cutoff\june-11-25\HRIS Payroll Computation June 11 - 25, 2026.xlsx" `
  --password=9090 `
  --organizationId=cmpxw0mfe00007zws3iypuu9d `
  --overtime-workbook="..\docs\new-cutoff\june-11-25\1rptOvertimeDetails - June 11-25, 2026.xlsx" `
  --compensation-upload="..\docs\new-cutoff\june-11-25\Compensation Mass Upload 06.30.26.xlsx" `
  --deduction-upload="..\docs\new-cutoff\june-11-25\Deduction Mass Upload 06.30.26.xlsx" `
  --no-default-sources `
  --output-dir="../$dir/compare-j11"

npx tsx scripts/show-bandai-payroll-comparison.ts --show=mismatches --limit=50
npx tsx scripts/show-bandai-payroll-comparison.ts --repair-plan --top=15
```

**Pass:** For each frozen sample, mismatches classified:

| residual_class | meaning | agent action |
|---|---|---|
| `SOURCE_INCOMPLETE` | loan/allowance not in mass upload | document only |
| `COLUMN_MIX` | Net vs Incentive confused | fix comparison / UI label |
| `STALE_PAYROLL` | preview green, stored red | re-generate |
| `ENGINE_RULE` | calculator/days/contrib | fix helper + re-preview |
| `CODE_DEFECT` | wrong reconciliationAction / double benefit | fix type/enrollment |
| `export_gap` | no employee 018xx | manpower import |

---

### Phase G — Stored payroll vs preview (stale detection)

| Check | Pass |
|---|---|
| preview.totalReceivable ≈ expectedReceivable | yes |
| stored.totalReceivable ≈ preview | if no → **STALE_PAYROLL** |
| period.status | OPEN/PROCESSING for re-gen; COMPLETED blocks generate |

If STALE and user authorized write:

1. Clear unpaid `EmployeePayroll` for period (or org policy)  
2. `POST generate-timesheet` **All departments** (no sticky empty dept filter)  
3. Poll progress until completed  
4. Re-read stored Rio row — totalReceivable must match preview  

**Never** leave sticky `departmentId` that zeros scope (e.g. empty GA/HR).

---

### Phase H — Run Payroll UI / API e2e proof

| Surface | Expect (June 11–25, unscoped) |
|---|---|
| Payable Now / Scope | ~825/870 (live) |
| Approved OT people / hrs | ~697 / ~15171.8 |
| Schedule changes deltas | ≥ 0; if workshare applied, non-zero unique emps or “already tally” explained |
| Click OT row 01360 | OT matrix; payable OT hours consistent |
| Preview / payslip | NetPay + TotalReceivable columns not mixed |

Write screenshots/API JSON under `$dir/ui-api/`.

---

## 4. Multi-agent fan-out (optional parallel)

| Agent | Owns | Deliverable |
|---|---|---|
| **A-OT** | probe-ot-truth-fast + repair | INDEX.json + dayMismatch=0 |
| **A-MONEY** | benefit types + spot enrollments | INC/ARP table for samples |
| **A-WS** | workshare execute 3 packs | matched/updated/alreadyTally counts |
| **A-COMPARE** | dry-run-bandai-payroll-comparison | mismatch buckets + repair plan |
| **A-RUN** | preview + optional re-gen | stored vs preview convergence |
| **ROOT** | EXIT GATE merge | single REPORT.md with numbers only |

ROOT does not declare green until A-COMPARE + A-RUN tables agree on frozen samples.

---

## 5. HEARTBEAT format (every cycle)

```text
HEARTBEAT | cycle=<N> | phase=<A-H> | checklist=<done>/<total>
  | ot_people=<n> ot_hrs=<n> | rio_net=<n> rio_tr=<n>
  | ws_deltas=<n> | mismatches=<n> | next=<one action>
  | proof=<path>
```

---

## 6. EXIT GATE (all required)

```text
[ ] A  health: DB 55435 + API /health
[ ] B  OT: peopleDbEqReadiness + hoursDbEqReadiness + dayMismatch=0 (both June packs)
[ ] C  BenefitType INC/ARP RECEIVABLE_ONLY; Rio INC+ARP present once (no double open-horizon)
[ ] D  Workshare: per-pack stats printed; schedule-deltas API returns coherent summary
[ ] E  Preview Rio: totalReceivable = net + 25922.41 + 500 (±0.02) OR residual class documented
[ ] F  dry-run-bandai-payroll-comparison artifacts under .runtime/; frozen samples classified
[ ] G  If re-gen authorized: stored Rio totalReceivable ≈ preview; period not stuck paused/COMPLETED conflict
[ ] H  Run Payroll UI/API chips match readiness/preview within rounding (unscoped)
[ ] REPORT.md table-first: before/after numbers + residual table only
```

**GREEN definition for “tally e2e”:**

1. **Preview/engine** matches register **column map** for frozen samples (Net vs Net, receivable vs Incentive/ARP).  
2. **Stored** payroll matches preview after generate (or explicitly STALE with blocker).  
3. **OT people/hours** match workbook→lines→readiness.  
4. Residuals only `SOURCE_INCOMPLETE` / explained `export_gap` / documented `ENGINE_RULE` — no silent null.

---

## 7. Ordered command cheat-sheet

```powershell
cd C:\Users\stari\bandai-infra\hris-api
$env:FORCE_ENV_DB='1'
$env:PG_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55435/hris?schema=public'
$env:DATABASE_URL=$env:PG_DATABASE_URL

# OT
npx tsx scripts/probe-ot-truth-fast.ts
npx tsx scripts/repair-bandai-payroll-source-timesheet-lines.ts --apply `
  --periodCode=PP-20260611-20260626 `
  --overtime-workbook="..\docs\new-cutoff\june-11-25\1rptOvertimeDetails - June 11-25, 2026.xlsx"

# Money (only if needed)
$env:PACK_DIR='docs/new-cutoff/june-11-25'
$env:COMP_FILE='Compensation Mass Upload 06.30.26.xlsx'
$env:DED_FILE='Deduction Mass Upload 06.30.26.xlsx'
npx tsx scripts/fast-import-cutoff-money.ts

# Workshare
# Register comparison
npx tsx scripts/dry-run-bandai-payroll-comparison.ts `
  --workbook="..\docs\new-cutoff\june-11-25\HRIS Payroll Computation June 11 - 25, 2026.xlsx" `
  --password=9090 --organizationId=cmpxw0mfe00007zws3iypuu9d `
  --no-default-sources `
  --overtime-workbook="..\docs\new-cutoff\june-11-25\1rptOvertimeDetails - June 11-25, 2026.xlsx" `
  --compensation-upload="..\docs\new-cutoff\june-11-25\Compensation Mass Upload 06.30.26.xlsx" `
  --deduction-upload="..\docs\new-cutoff\june-11-25\Deduction Mass Upload 06.30.26.xlsx" `
  --output-dir=../.runtime/payroll-tally-compare-j11

npx tsx scripts/show-bandai-payroll-comparison.ts --show=mismatches --limit=30
npx tsx scripts/show-bandai-payroll-comparison.ts --repair-plan --top=10
```

---

## 8. What “success” looks like in the UI

| Screen | Expect |
|---|---|
| Run Payroll June 11–25 unscoped | Payable ~820+/870; OT ~697 / ~15k hrs — **not** 0/0 from empty dept filter |
| Approved OT | List of people with line OT; click → day matrix |
| Schedule changes (under OT stack) | Counts + before→after template codes from WorkSharing history |
| Preview / payslip Rio | NetPay **10,303.18**; TotalReceivable **36,725.59** (after re-gen if stored was stale) |
| May 26–Jun 10 or empty cutoffs | 0 OT / 0 adjustments can be **correct** if no workbook applied for that period |

---

## 9. Non-stop rules

- Print **numbers every phase** (never “looks fine”).  
- Recover DB tunnel / API restart yourself (3 tries).  
- Do not stop at import success alone — **preview + comparison + (stored if generated)** required.  
- Real stop only: missing irrecoverable access, or only documented SOURCE_INCOMPLETE residuals after EXIT GATE review.
