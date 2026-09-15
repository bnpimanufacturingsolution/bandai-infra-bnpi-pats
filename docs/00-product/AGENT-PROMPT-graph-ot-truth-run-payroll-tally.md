# Graph engineering — Approved OT truth (rptOvertimeDetails → lines → Run Payroll)

**Status:** `EXECUTE_NOW`  
**Created:** 2026-08-04  
**Fast probe script:** `bnpi-pats-api/scripts/probe-ot-truth-fast.ts`  
**Latest evidence pattern:** `.runtime/ot-fast-probe-*/`

---

## 0. Paste-ready graph engineer kickoff

```text
Execute docs/00-product/AGENT-PROMPT-graph-ot-truth-run-payroll-tally.md
as ROOT graph engineer for BNPI Approved OT truth.

Non-stop. Agent-owned. Use the FAST probe path (no N+1 hydrates).

Source packs (password 9090):
  docs/new-cutoff/june-11-25/1rptOvertimeDetails - June 11-25, 2026.xlsx
  docs/new-cutoff/june-26-10/2rptOvertimeDetails - June 26 - July 10, 2026.xlsx

Periods:
  PP-20260611-20260626
  PP-20260626-20260711

Every cycle:
  1) Run: cd bnpi-pats-api; npx tsx scripts/probe-ot-truth-fast.ts
  2) Read INDEX.json — people/hours File vs DB vs readiness must table-first
  3) Residual only if file people ≠ readiness people OR dayMismatch > 0
  4) For residual: per-employee table (code, name, fileOt, dbOt, reason)
  5) Fix node only (map | apply | auto-approve | readiness filter) → re-probe
  6) HEARTBEAT | cycle N | checklist X/Y | last_proof | next

EXIT GATE: both packs peopleDbEqReadiness + hoursDbEqReadiness + dayMismatch=0
  + empMissingDb explained (no timesheet / not in org) OR burned to 0
  + click Run Payroll Approved OT sample = readiness sample
Evidence under .runtime/ot-fast-probe-<stamp>/
```

---

## 1. Ordered dependency graph

```text
┌──────────────────────────────────────────┐
│ N0  Freeze periods + workbook paths      │
│     PP-20260611-20260626                 │
│     PP-20260626-20260711                 │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│ N1  FAST Excel parse (dense, once/pack)  │
│     Map employeeNo → date → buckets      │
│     mappedLineOt = RegOT+SpclOT+RHolOT   │
│                   +RDOT (NOT ND, NOT RD) │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│ N2  BULK SQL approved-source lines       │
│     metadata.bandaiPayrollSourceRepair   │
│     one query per period (no N+1)        │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│ N3  In-memory join emp/date              │
│     empPerfect / dayMatch / missing_db   │
└──────────────────┬───────────────────────┘
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
┌─────────────────┐  ┌──────────────────────┐
│ N4 Readiness    │  │ N5 Per-employee      │
│ ot-readiness    │  │ click detail (modal) │
│ = Run Payroll   │  │ TimesheetViewModal   │
│ Approved OT     │  │ OT days only         │
└────────┬────────┘  └──────────┬───────────┘
         │                      │
         └──────────┬───────────┘
                    ▼
┌──────────────────────────────────────────┐
│ N6  Residual burn                        │
│  missing_in_db → seed timesheet + apply  │
│  day_mismatch → re-run repair --apply    │
│  demo_only → exclude from panel (done)   │
└──────────────────────────────────────────┘
```

---

## 2. Fast technique (do not regress to slow loops)

| Need | Do this | Do **not** |
|---|---|---|
| Read Excel | `xlsx` dense + password `9090`, single pass | open every sheet twice; per-row Prisma create |
| Load DB OT | One `$queryRaw` of all period lines with repair metadata | `findMany` timesheet + lines per employee |
| Compare | `Map<code, Map<date, minutes>>` join | Nested awaits in emp loop |
| UI truth | `getPayrollPeriodOtReadiness` or same SQL aggregate | Trust UI screenshot alone |
| Detail click | `useTimesheet` + filter OT days / repair metadata | Custom thin modal inventing hours |

**Host command (~5–8s both packs):**

```powershell
cd bnpi-pats-api
$env:FORCE_ENV_DB='1'
$env:PG_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55435/bnpi_pats?schema=public'
$env:DATABASE_URL=$env:PG_DATABASE_URL
npx tsx scripts/probe-ot-truth-fast.ts
```

---

## 3. Mapping contract (source of truth)

```text
rptOvertimeDetails row
  Reg OTHrs  + Spcl OTHrs + RHol OTHrs + RDOTHrs
       │
       ▼
timesheet_lines.overtimeHours   (HH:MM)
metadata.bandaiPayrollSourceRepair.approvedBuckets = {
  regularDays, regOtHrs, regNdHrs, spclHrs, spclOtHrs,
  rholHrs, rholOtHrs, rdHrs, rdOtHrs
}

NOT stored in overtimeHours:
  Reg NDHrs, Spcl Hrs, RHol Hrs, RDHrs  (premium buckets only in metadata)
```

Apply path:

```powershell
npx tsx scripts/repair-bandai-payroll-source-timesheet-lines.ts --apply `
  --periodCode=PP-20260626-20260711 `
  --overtime-workbook="..\docs\new-cutoff\june-26-10\2rptOvertimeDetails - June 26 - July 10, 2026.xlsx"
# auto-approve ON by default; --no-auto-approve to skip
# --auto-approve-with-ot only flips sheets that already have repair metadata OT
```

---

## 4. Exit gate (table)

| Check | Green when |
|---|---|
| File → DB people | `empMissingDb` explained or 0 |
| File → DB days | `dayMismatch=0` for mapped employees |
| DB → readiness | people and hours equal |
| Run Payroll UI | Approved OT chip = readiness `peopleWithApprovedOt` / `totalApprovedLineOtHours` |
| Click person | TimesheetViewModal OT days match file RegOT (+OT buckets) for that period |
| Felix 01713 P2 | file **27:00** = db **27:00** = screenshot Reg OTHrs total |

---

## 5. HEARTBEAT format

```text
HEARTBEAT | cycle=N | checklist=X/Y | last_proof=.runtime/ot-fast-probe-.../INDEX.json | next=<one action>
```
