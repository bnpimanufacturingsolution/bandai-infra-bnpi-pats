# Overnight ordered prompt — June 11–25 2026 payroll parity E2E

**Status:** `EXECUTE_NOW`  
**Created:** 2026-08-04  
**Truth map (read first):** `docs/BNPI_JUNE11_25_2026_PAYROLL_PARITY_CHECKLIST.md`  
**Companion graph loop:** `docs/00-product/AGENT-PROMPT-graph-loop-june-11-25-payroll-tally.md`  
**Target pack:** `docs/new-cutoff/june-11-25/`  
**Register password:** `9090`

---

## 0. Paste-ready root kickoff

```text
================================================================
PROJECT TRUTH — OVERNIGHT JUNE 11–25 PAYROLL PARITY E2E
================================================================

You are the owner-operator agent. Obey AGENTS.md + Agent-Meta-Prompt-Template.md.
Open WWG with tools before planning. Non-stop. Agent-owned. No human homework.

PRIMARY DOCS (open with tools, do not invent):
1. docs/BNPI_JUNE11_25_2026_PAYROLL_PARITY_CHECKLIST.md
2. docs/00-product/AGENT-PROMPT-graph-loop-june-11-25-payroll-tally.md
3. docs/dm-migration-workflow.md (DM3 mass upload + DM4 bio/OT sections)
4. docs/BNPI_JUNE26_JULY10_2026_PAYROLL_PARITY_CHECKLIST.md (sibling; period-2 zeros — DO NOT copy contribution zeros)
5. Historical May path awareness only: bnpi-pats-api/scripts/validate-bandai-payroll-source-trace.ts defaults are Apr26–May10 — OVERRIDE all paths

GOAL:
  Dry-run and execute the local/DEV import → timesheet → Run Payroll pipeline
  for BNPI cutoff 2026-06-11..2026-06-25 until BNPI PATS EmployeePayroll NetPay
  (and documented TotalReceivable secondaries) tallies to
  docs/new-cutoff/june-11-25/BNPI PATS Payroll Computation June 11 - 25, 2026.xlsx
  (password 9090) for the frozen sample set, then expand coverage.

SOURCE PACK (only these cutoff files for money/attendance this cut):
  T = docs/new-cutoff/june-11-25/BNPI PATS Payroll Computation June 11 - 25, 2026.xlsx
  B = docs/new-cutoff/june-11-25/Biometrics Data_Jun 11 - 25.xlsx
  O = docs/new-cutoff/june-11-25/1rptOvertimeDetails - June 11-25, 2026.xlsx
  C = docs/new-cutoff/june-11-25/Compensation Mass Upload 06.30.26.xlsx
  D = docs/new-cutoff/june-11-25/Deduction Mass Upload 06.30.26.xlsx

PIPELINE ORDER (do not reorder):
  masters/setup (if needed)
  → compensation mass upload (C)
  → deduction mass upload (D)
  → DM4 biometrics (B)
  → DM4 approved OT (O) + timesheet-line dry-run until plannedLineUpdates=0
  → clear unpaid/stale EmployeePayroll for period (or DEV debug reset)
  → Run Payroll periodNumber=1
  → compare NetPay vs register Sheet2
  → classify residual → fix SOURCE/import/code → re-clear → re-run → re-compare

CRITICAL PERIOD TRUTH:
  June 11–25 = BNPI period 1 → SSS Cont / PhilHealth / Pagibig MUST be non-zero
  for normal employees. Zero contributions = wrong period or engine bug.
  (June 26–July 10 is period 2 with zeros — different cut.)

HARD BANS:
  - Do not use May 15 / Apr26–May10 default CLI paths without --no-default-sources
  - Do not skip OT upload (“biometrics has OT” is FALSE)
  - Do not compare NetPay to TotalReceivable
  - Do not invent loan rows; mark SOURCE_INCOMPLETE when D is short (~24 rows)
  - Do not stop after one dry-run green without full pipeline re-compare
  - Do not leave “you should upload / re-run payroll” for the human

RUNTIME:
  Prefer local Windows hot-reload: API :3001, app :5175, DB 127.0.0.1:55435
  Admin: admin@bandai.local / password123 / appCode=bnpi-pats (or bnpi-pats-hr-manager where payroll UI requires)
  Recover DB/API yourself (npm.cmd, start-k8s-dev-db-access, 3 tries)

EVIDENCE ROOT:
  .runtime/june-11-25-payroll-parity-YYYYMMDD-HHMMSS/

HEARTBEAT every cycle:
  HEARTBEAT | cycle=N | phase=P | checklist=X/Y | last_proof=path|fail | next=one action

EXIT GATE: every box in section 2 green or Real Stop Condition with evidence.
Min cycles: 15 productive heartbeats or full green — do not self-stop at 10 minutes.
================================================================
```

---

## 1. Ordered phases (agent must follow)

| Phase | Name | Done when |
|---:|---|---|
| 0 | Bootstrap + freeze period | WWG report; period dates; periodNumber=1 proven; sample list frozen |
| 1 | Source probe | Register unlocked; row counts; C/D/O/B headers; source-only dry-run artifacts |
| 2 | Masters readiness | DM1/2/3 present enough for codes + salaries + schedules (or documented gap) |
| 3 | Upload C + D | Import job success; spot enrollments for samples |
| 4 | DM4 B + O | Attendance + OT lines; `plannedLineUpdates=0` after repair |
| 5 | Clean payroll | Unpaid cleared; period OPEN; Run Payroll completed |
| 6 | Compare loop | NetPay mismatch table; residuals classified; re-run until sample gate |
| 7 | Expand + sign-off | Broader coverage stats; STATUS.md; optional commit of tooling/docs only |

---

## 2. EXIT GATE (acceptance)

Stamp: `.runtime/june-11-25-payroll-parity-YYYYMMDD-HHMMSS/`

| # | Gate | Pass proof |
|---|---|---|
| G0 | Truth docs opened; Current-State Report posted | chat or STATUS.md |
| G1 | Register unlock + structure | unlocked xlsx or structure JSON; ~859 employees; period 6/11–6/25 pay 6/30 |
| G2 | Source-only dry-run with **this pack only** | `payroll-source-evidence.md` under stamp |
| G3 | Compensation import applied (C) | API/job JSON |
| G4 | Deduction import applied (D) | API/job JSON + honesty table if rows << register loans |
| G5 | Biometrics DM4 applied (B) | run summary / timesheet presence for samples |
| G6 | Approved OT applied (O); timesheet-line dry-run `plannedLineUpdates=0` | dry-run + repair logs |
| G7 | Sample OT hours / days close to register **before** accepting gross | sample table |
| G8 | Clean Run Payroll period 1 | job/result JSON; **SSS Cont non-zero** on samples |
| G9 | Comparison dry-run against DB | comparison summary md/json |
| G10 | Frozen samples NetPay match (or residual only `SOURCE_INCOMPLETE` with table) | per-employee table |
| G11 | Residual taxonomy complete | bucket table per AGENTS residual rules |
| G12 | ≥15 HEARTBEATs or full green; no human homework left | HEARTBEATS.log |

**Sample freeze (minimum):** `01360`, `00032`, `00021`, plus ≥2 production OT rows from register.

**Match rule:** NetPay within ₱0.01 (or document engine rounding if ₱1 class and proven).

---

## 3. Canonical commands (copy; fix periodCode from live DB)

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$root = Join-Path '.runtime' "june-11-25-payroll-parity-$stamp"
New-Item -ItemType Directory -Force -Path $root | Out-Null
$pack = 'docs/new-cutoff/june-11-25'
$T = "$pack/BNPI PATS Payroll Computation June 11 - 25, 2026.xlsx"
$B = "$pack/Biometrics Data_Jun 11 - 25.xlsx"
$O = "$pack/1rptOvertimeDetails - June 11-25, 2026.xlsx"
$C = "$pack/Compensation Mass Upload 06.30.26.xlsx"
$D = "$pack/Deduction Mass Upload 06.30.26.xlsx"

# 0) Health
# recover 55435 + API 3001 if needed; login admin; save token proof

# 1) Source-only
cd bnpi-pats-api
npm.cmd run dry-run:bandai-payroll-source -- `
  --workbook="../$T" --password=9090 --no-default-sources `
  --compensation-upload="../$C" --deduction-upload="../$D" `
  --overtime-workbook="../$O" --output-dir="../$root/source"

# 2) Discover live periodCode for 2026-06-11..2026-06-25 (do not invent)
# Prisma/API query → save period.json

# 3) Mass uploads via API (multipart) or migration UI automation — prove JSON
# POST /api/migration/dm3/import-compensation-mass-upload
# POST /api/migration/dm3/import-deduction-mass-upload

# 4) DM4 bio + OT (migration durable run or documented script path)
# then:
npm.cmd run dry-run:bandai-payroll-timesheet-lines -- `
  --periodCode=<FROM_DB> --overtime-workbook="../$O" --password=9090
npm.cmd run repair:bandai-payroll-timesheet-lines -- `
  --periodCode=<FROM_DB> --overtime-workbook="../$O" --password=9090
# re-dry-run until plannedLineUpdates=0

# 5) Clear generated payroll (DEV):
# Browser deep link while logged in:
#   /settings?debug=true&resetEmployeePayrolls=true
# OR POST /api/employeePayroll/debug/reset-generated-payrolls
#   body: { "confirm": "DELETE_EMPLOYEE_PAYROLLS" }
# Prefer period-scoped clear if available; if org-wide reset, confirm DEV org only.

# 6) Run Payroll for period 1 (API/UI) — save response

# 7) Compare
npm.cmd run dry-run:bandai-payroll-comparison -- `
  --workbook="../$T" --password=9090 --no-default-sources `
  --compensation-upload="../$C" --deduction-upload="../$D" `
  --overtime-workbook="../$O" --output-dir="../$root/compare"

npm.cmd run show:bandai-payroll-problems -- --limit=50
npm.cmd run show:bandai-payroll-repair-plan -- --top=20
```

---

## 4. Mismatch decision tree (ordered)

```text
NetPay mismatch for emp X
  ├─ Basic/days wrong → salary/master or attendance/schedule (B + DM3)
  ├─ OT pay wrong → O not on Timesheetline / repair incomplete
  ├─ Gross missing allowance → C missing code/row or benefit type missing in DM2
  ├─ Contributions 0 on period 1 → WRONG periodNumber or calculator config (CODE/CONFIG)
  ├─ Loan missing → D incomplete (SOURCE_INCOMPLETE) or wrong DEDCODE mapping
  ├─ Tax wrong after gross match → tax engine (only after gross+deductions solid)
  └─ Receivable-only gap → document under TotalReceivable; do not fail NetPay gate
```

Every residual answer **must** use table form (bucket / count / blocker class / next step).

---

## 5. Operator deep links (agent executes)

| Action | Where |
|---|---|
| Debug wipe generated payrolls | `/settings?debug=true&resetEmployeePayrolls=true` |
| DM3 migration + mass uploads | `/admin/configuration/migration?workbook=dm3` |
| DM4 | `/admin/configuration/migration?workbook=dm4` (or durable run path in docs) |
| Run Payroll | HR payroll run surface for the frozen period |

---

## 6. Output contract before idle

1. `STATUS.md` with checklist G0–G12  
2. Sample NetPay table (register vs BNPI PATS)  
3. Residual taxonomy table  
4. Artifact paths under stamp  
5. If code/import bug fixed: commit/push `develop` when green  
6. No “please re-run payroll yourself” leftovers  

---

## 7. Real stop conditions

Only per `AGENTS.md`: 3 failed distinct recoveries with evidence; irreversible data risk without backup; missing irrecoverable access; would invent secrets/evidence.

Missing client loan rows in file D is **not** a stop — mark `SOURCE_INCOMPLETE` and continue all other employees/gates.
