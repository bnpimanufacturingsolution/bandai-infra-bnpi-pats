# E2E — rptOvertimeDetails vs timesheet lines vs Run Payroll Approved OT

**Status:** `EXECUTE_NOW`  
**Created:** 2026-08-04  
**Fast probe:** `bnpi-pats-api/scripts/probe-ot-truth-fast.ts`  
**Repair apply:** `bnpi-pats-api/scripts/repair-bandai-payroll-source-timesheet-lines.ts`

---

## 0. Paste-ready E2E kickoff

```text
Execute docs/00-product/AGENT-PROMPT-e2e-ot-report-vs-run-payroll.md end-to-end.

Goal: Prove (and keep) Approved OT on Run Payroll equals the two new-cutoff
rptOvertimeDetails workbooks, per employee and per day.

Workbooks (password 9090):
  C:\Users\stari\bandai-infra\docs\new-cutoff\june-11-25\1rptOvertimeDetails - June 11-25, 2026.xlsx
  C:\Users\stari\bandai-infra\docs\new-cutoff\june-26-10\2rptOvertimeDetails - June 26 - July 10, 2026.xlsx

Periods:
  PP-20260611-20260626
  PP-20260626-20260711

Do not invent OT. Probe file → DB → readiness → UI/API.
Use FAST probe (bulk SQL). Fix residuals. Re-prove until EXIT GATE green.
Evidence: .runtime/ot-e2e-<stamp>/
```

---

## 1. Acceptance checklist

- [ ] **P1 file parse** people-with-mapped-OT + total hours recorded
- [ ] **P2 file parse** people-with-mapped-OT + total hours recorded
- [ ] **DB approved-source OT** people + hours for each period
- [ ] **Readiness** `peopleWithApprovedOt` + `totalApprovedLineOtHours` = DB
- [ ] **Per-employee** for every file OT person: match | missing_in_db | mismatch table
- [ ] **Per-day** for mapped people: dayMatch / dayMismatch / dayMissing
- [ ] **Spot 01713 (Felix Aguila)** on P2: **27:00** Reg OT total; day rows match screenshot
- [ ] **Run Payroll UI** (or live API as UI uses): same people count + hours chip
- [ ] **Click detail** TimesheetViewModal: OT days only; hours match file for that employee
- [ ] **No demo OT** (BNPI_DM4_DEMO) in Approved OT panel
- [ ] Evidence written under `.runtime/`

---

## 2. Fast E2E procedure (copy)

```powershell
cd C:\Users\stari\bandai-infra\bnpi-pats-api
$env:FORCE_ENV_DB='1'
$env:PG_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55435/bnpi_pats?schema=public'
$env:DATABASE_URL=$env:PG_DATABASE_URL

# 1) Fast full tally (~5–8s both packs)
npx tsx scripts/probe-ot-truth-fast.ts
# → .runtime/ot-fast-probe-*/INDEX.json

# 2) Optional re-apply if dayMismatch or missing_in_db (timesheets exist)
npx tsx scripts/repair-bandai-payroll-source-timesheet-lines.ts --apply `
  --periodCode=PP-20260611-20260626 `
  --overtime-workbook="..\docs\new-cutoff\june-11-25\1rptOvertimeDetails - June 11-25, 2026.xlsx"

npx tsx scripts/repair-bandai-payroll-source-timesheet-lines.ts --apply `
  --periodCode=PP-20260626-20260711 `
  --overtime-workbook="..\docs\new-cutoff\june-26-10\2rptOvertimeDetails - June 26 - July 10, 2026.xlsx"

# 3) Re-probe
npx tsx scripts/probe-ot-truth-fast.ts

# 4) Live API (Run Payroll source) — admin token
# GET /api/payrollperiod/:id/ot-readiness?page=1&limit=20&onlyWithOt=true
# Compare summary.peopleWithApprovedOt + totalApprovedLineOtHours to INDEX.json
```

---

## 3. Expected residual classes

| Residual | Class | Agent action |
|---|---|---|
| File emp has OT, no timesheet in period | `export_gap` / seed gap | Seed/open timesheet then re-apply repair |
| File emp has OT, lines exist, minutes differ | `code_defect` / apply gap | Re-run repair `--apply`; fix parser columns if systematic |
| DB has approved OT not in file | `CONFLICTING` | Show emp list; do not silently delete |
| Demo 16h one-day OT | `code_defect` (seed) | Must not appear in Approved OT (repair-metadata gate) |
| Readiness ≠ DB | `code_defect` | Fix `payroll-ot-readiness.helper` filter |

---

## 4. Known proven snapshot (re-probe; do not treat as permanent green)

From `.runtime/ot-fast-probe-2026-08-04T06-42-18` (re-run script to refresh):

| Period | File people | DB / readiness people | File hrs | DB / readiness hrs | Emp perfect | Missing in DB | Day mismatch |
|---|---:|---:|---:|---:|---:|---:|---:|
| PP-20260611-20260626 | 712 | **697** | 15425.3 | **15171.8** | 697 | 15 | 0 |
| PP-20260626-20260711 | 743 | **725** | 15627 | **15239** | 725 | 18 | 0 |

| Spot | Period | File | DB | Notes |
|---|---|---:|---:|---|
| 01713 Felix Aguila | P2 June 26–10 | **27:00** | **27:00** | Matches screenshot Reg OTHrs total |
| 01713 | P1 June 11–25 | 22:30 | 22:30 | Different cutoff |

**DB ≡ readiness** on both packs. Residual = file people with OT but no approved-source lines (usually no timesheet for that period).

---

## 5. UI E2E (after API green)

1. Open `/hr/run-payroll?periodCode=PP-20260626-20260711&periodView=past`
2. Expand **Approved OT**
3. Chip people ≈ **725**, hours ≈ **15239** (or current INDEX)
4. Search / scroll to **01713** or **Aguila**
5. Click row → **TimesheetViewModal** (square calendar atoms)
6. OT days show ~3h on OT days; period total **27:00**; not 16:00 demo junk
7. Repeat for `PP-20260611-20260626`

Prefer Playwright headless proof into `.runtime/` when claiming UI green.

---

## 6. EXIT GATE

```text
[ ] probe-ot-truth-fast.ts green tables written
[ ] peopleDbEqReadiness && hoursDbEqReadiness both packs
[ ] dayMismatch == 0 for all mapped employees
[ ] empMissingDb listed with reason (or 0)
[ ] 01713 P2 = 27:00 file=db
[ ] Run Payroll API/UI matches readiness within rounding
[ ] Click detail shows report-backed OT days only
```
