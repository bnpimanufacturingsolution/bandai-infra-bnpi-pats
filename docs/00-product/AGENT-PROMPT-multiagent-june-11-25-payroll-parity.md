# Multi-agent job card — June 11–25 2026 payroll parity E2E

**Mode:** multi-agent · owner-operator · non-stop until EXIT GATE  
**Created:** 2026-08-04  
**Agents:** **6** parallel roles + ROOT (you can run 5–6 children at once)  
**Target pack:** `docs/new-cutoff/june-11-25/`  
**Register password:** `9090`  
**Primary tally:** **NetPay** (TotalReceivable secondary only)

### Companion docs (open with tools — do not invent)

| Doc | Role |
|---|---|
| `docs/BNPI_JUNE11_25_2026_PAYROLL_PARITY_CHECKLIST.md` | Source truth + phases |
| `docs/00-product/AGENT-PROMPT-graph-loop-june-11-25-payroll-tally.md` | Node graph N0–N10 |
| `docs/00-product/AGENT-PROMPT-overnight-june-11-25-payroll-parity-e2e.md` | Ordered solo overnight |
| `docs/dm-migration-workflow.md` | DM3 mass upload + DM4 bio/OT |
| `docs/BNPI_JUNE26_JULY10_2026_PAYROLL_PARITY_CHECKLIST.md` | Sibling only — period **2** zeros; **do not copy** |

---

## 0. Paste-ready ROOT kickoff (start here)

```text
================================================================
PROJECT TRUTH — MULTI-AGENT JUNE 11–25 PAYROLL PARITY
================================================================

You are ROOT. Obey AGENTS.md. Open WWG with tools first.
Spawn 6 child agents (or 5 if combining PROBE+COMPARE). Non-stop.

GOAL:
  HRIS processed payroll for 2026-06-11..2026-06-25 (periodNumber=1)
  tallies to docs/new-cutoff/june-11-25/HRIS Payroll Computation June 11 - 25, 2026.xlsx
  password 9090 — NetPay first for frozen samples, then expand.

PACK:
  T = docs/new-cutoff/june-11-25/HRIS Payroll Computation June 11 - 25, 2026.xlsx
  B = docs/new-cutoff/june-11-25/Biometrics Data_Jun 11 - 25.xlsx
  O = docs/new-cutoff/june-11-25/1rptOvertimeDetails - June 11-25, 2026.xlsx
  C = docs/new-cutoff/june-11-25/Compensation Mass Upload 06.30.26.xlsx
  D = docs/new-cutoff/june-11-25/Deduction Mass Upload 06.30.26.xlsx

MUST in cycle 1:
  1) Create stamp .runtime/multi-june11-25-payroll-YYYYMMDD-HHMMSS/
  2) Write LATEST pointer + SHARED/period.json skeleton
  3) Spawn in parallel (same turn): A-RUNTIME, A-PROBE, A-API-MONEY, A-API-TIME, A-COMPARE, A-UI
  4) Write MULTI-AGENT-MANIFEST.json
  5) Print SPAWNED lines for every child in chat

HARD TRUTH:
  period 1 → SSS/PH/Pagibig NON-ZERO expected
  OT requires file O (biometrics alone is NOT OT)
  Deduction file D has ~24 rows only → SOURCE_INCOMPLETE ok for missing loans
  Never compare NetPay to TotalReceivable
  Never use May CLI defaults without --no-default-sources

SHARED LOCKS (ROOT enforces — children wait on lock files):
  LOCK_IMPORT_MONEY  — only A-API-MONEY may upload C/D
  LOCK_IMPORT_TIME   — only A-API-TIME may run DM4 / OT repair
  LOCK_PAYROLL_MUTATE — only ONE of: clear payroll OR run payroll OR debug reset
  LOCK_DB_WRITE      — held by whoever is mutating enrollments/payroll
  A-PROBE and A-COMPARE are read-mostly; they never reset payroll or upload

PIPELINE (serial spine ROOT owns; agents prepare in parallel):
  N0 freeze period → N1 register probe → N2 masters ready
  → N3 C + N4 D (A-API-MONEY) → N5 B + N6 O (A-API-TIME)
  → N7 clear unpaid (A-API-PAYROLL or A-UI) → N8 run payroll
  → N9 compare (A-COMPARE) + N10 residual → loop failing node

Admin: admin@bandai.local / password123 / appCode=hris
Local: API :3001 app :5175 DB 127.0.0.1:55435
Recover runtime yourself. Min 20 HEARTBEATs or EXIT GATE green.
================================================================
```

---

## 1. Six agents — distribution map

| Agent | Focus | Parallel with | Serial / waits on | Primary deliverables under stamp |
|---|---|---|---|---|
| **ROOT** | Orchestration, locks, merge residuals, commit | always | owns EXIT GATE | `STATUS.md`, `HEARTBEATS.log`, `MANIFEST`, `LATEST` |
| **A-RUNTIME** | Stack health, DB, freeze period, env | all | unblocks everyone | `00-runtime.md`, `SHARED/period.json`, `SHARED/auth.json` (token not committed raw if policy; prefer local only) |
| **A-PROBE** | Unlock T, file shapes, source-only dry-run, sample vectors | all (read) | needs period hint from RUNTIME | `01-probe/`, register unlocked, source-evidence |
| **A-API-MONEY** | Compensation + deduction import APIs | A-PROBE, A-UI (read) | after RUNTIME green; **LOCK_IMPORT_MONEY** | `02-api-money/*.json` |
| **A-API-TIME** | DM4 biometrics + OT + timesheet-line dry-run/repair | A-PROBE | after MONEY green (or parallel only if masters already ok); **LOCK_IMPORT_TIME** | `03-api-time/*.json` |
| **A-COMPARE** | Comparison CLI, residual tables, repair plan | always after payroll exists; can run source-only early | never mutates payroll | `04-compare/`, `residual-matrix.md` |
| **A-UI** | Migration UI, Run Payroll UI, settings debug reset, Playwright | A-PROBE | mutates only under **LOCK_PAYROLL_MUTATE** | `05-ui/`, screenshots, playwright json |

> **5-agent mode:** merge **A-PROBE + A-COMPARE** into one `A-PROBE-COMPARE` if you only have 5 slots. Keep UI and two API lanes separate.

Optional 7th (spawn when code defects block tally):

| Agent | When | Owns |
|---|---|---|
| **A-FIX** | residual class `code_defect` / `engine_rule` after gross solid | code + unit tests + push develop |

---

## 2. Parallelism timeline (how 6 run at once without trampling)

```text
CYCLE 1 (all parallel — discovery only)
  A-RUNTIME ── health, DB, find/create payroll period 6/11-6/25 periodNum=1
  A-PROBE   ── unlock T, parse B/O/C/D, source-only dry-run (no DB mutate)
  A-UI      ── login Playwright, screenshot migration + payroll pages (no upload yet)
  A-COMPARE ── can pre-parse register fields; full DB compare WAIT
  A-API-MONEY ── dry-run code paths / dry endpoints if any; WAIT lock for real upload
  A-API-TIME   ── inventory DM4 resolve endpoints; WAIT lock for real import

CYCLE 2 (parallel prep + serial money)
  A-API-MONEY holds LOCK_IMPORT_MONEY → upload C then D → release
  A-PROBE re-probes enrollments for samples (read)
  A-UI can open DM3 upload UI as alternate path ONLY if API-MONEY failed
  A-RUNTIME keeps stack alive

CYCLE 3 (time spine)
  A-API-TIME holds LOCK_IMPORT_TIME → DM4 B → DM4 O → timesheet-line dry-run/repair until plan=0
  A-COMPARE watches OT hours for samples vs register (read)
  A-UI proves DM4 progress in browser (read/poll)

CYCLE 4 (payroll spine — SINGLE WRITER)
  ROOT assigns LOCK_PAYROLL_MUTATE to either A-UI or A-API-MONEY/A-RUNTIME helper:
    clear unpaid OR debug reset (DEV only)
    Run Payroll period 1
  Everyone else READ ONLY

CYCLE 5+ (compare + repair fan-out)
  A-COMPARE full comparison → residual matrix
  ROOT fans residuals:
    money codes → A-API-MONEY
    OT/days → A-API-TIME
    UI path proof → A-UI
    engine/tax after gross ok → A-FIX
  After ANY write: re-enter CYCLE 4 then A-COMPARE again
```

### Shared files (single source of coordination)

```text
.runtime/multi-june11-25-payroll-<stamp>/
  LATEST                          # text path to this stamp (repo-relative)
  MULTI-AGENT-MANIFEST.json
  HEARTBEATS.log
  STATUS.md
  SHARED/
    period.json                   # { id, code, start, end, periodNumber, payDate }
    samples.json                  # [ "01360", "00032", "00021", ... ]
    locks/
      LOCK_IMPORT_MONEY           # content: agentId + iso or empty
      LOCK_IMPORT_TIME
      LOCK_PAYROLL_MUTATE
    handoff-board.md              # latest residual buckets for all agents
  00-runtime/
  01-probe/
  02-api-money/
  03-api-time/
  04-compare/
  05-ui/
```

**Lock protocol:** create lock file with `{ "owner": "A-API-MONEY", "since": "<iso>" }`. If lock age > 20 minutes and no heartbeat, ROOT steals lock after writing reason. Never two writers on payroll reset + run.

---

## 3. EXIT GATE (ROOT owns)

| # | Gate | Who primarily proves |
|---|---|---|
| G0 | Manifest + 6 SPAWNED in cycle 1 | ROOT |
| G1 | API health + DB 55435 + login | A-RUNTIME |
| G2 | period.json periodNumber=**1**, dates 6/11–6/25 | A-RUNTIME |
| G3 | Register unlocked + ~859 rows + sample NetPay vectors | A-PROBE |
| G4 | Source-only dry-run this pack only (`--no-default-sources`) | A-PROBE |
| G5 | Compensation C imported | A-API-MONEY (+ A-UI backup) |
| G6 | Deduction D imported + honesty if loans thin | A-API-MONEY |
| G7 | Biometrics B applied | A-API-TIME |
| G8 | OT O applied; timesheet-line `plannedLineUpdates=0` | A-API-TIME |
| G9 | Sample days/OT hours vs register before accepting gross | A-COMPARE + A-PROBE |
| G10 | Clean payroll clear + Run Payroll period 1 | A-UI or API under lock |
| G11 | Samples SSS Cont **> 0** (normal emps) | A-COMPARE |
| G12 | Frozen samples NetPay match **or** residual only `SOURCE_INCOMPLETE` with rows | A-COMPARE |
| G13 | Residual matrix table-first | A-COMPARE + ROOT |
| G14 | UI journey proof (migration/run/compare surfaces) | A-UI |
| G15 | ≥20 HEARTBEATs; no human homework | ROOT |

**Sample freeze (write `SHARED/samples.json`):** `01360`, `00032`, `00021`, + ≥2 high-OT production emps from register.

---

## 4. Hard bans (all agents)

| Ban | Why |
|---|---|
| May/Apr CLI default paths without override | Wrong cutoff |
| Skip OT file O | Biometrics has no OT buckets |
| Expect contribution zeros | That is **period 2**, not this cut |
| NetPay vs TotalReceivable | False fails |
| Invent missing loans from thin D | `SOURCE_INCOMPLETE` only |
| Two agents clear/run payroll at once | Corrupts snapshot |
| Solo ROOT doing all roles silently | Multi-agent violation unless tool outage logged |
| Human homework endings | Agent-owned |

---

## 5. Child paste prompts (spawn each as separate agent)

### 5.1 A-RUNTIME

```text
ROLE: A-RUNTIME for multi-agent June 11–25 payroll parity.
Stamp: use ROOT stamp path from MULTI-AGENT-MANIFEST / LATEST.
Read: docs/BNPI_JUNE11_25_2026_PAYROLL_PARITY_CHECKLIST.md section period truth.

DO:
1) Prove DB 127.0.0.1:55435, API :3001 /health, app :5175 (recover with npm.cmd / start-k8s-dev-db-access; 3 tries).
2) Login admin@bandai.local password123 appCode=hris; save non-secret proof (role, org id) under 00-runtime/.
3) Find or create PayrollPeriod start 2026-06-11 end 2026-06-25 periodNumber=1 payDate ~2026-06-30.
4) Write SHARED/period.json and SHARED/samples.json (default 01360,00032,00021 + note to expand).
5) Keep stack alive; re-probe every ROOT cycle if asked.
6) NEVER upload files, NEVER reset payroll unless ROOT assigns LOCK_PAYROLL_MUTATE to you.

DELIVERABLE: 00-runtime/REPORT.md + period.json
HEARTBEAT each major step. Return when G1/G2 proven or blocked with 3 recoveries.
```

### 5.2 A-PROBE

```text
ROLE: A-PROBE (source truth + file probe). READ-MOSTLY.
Stamp from LATEST. Password for register: 9090.
Pack under docs/new-cutoff/june-11-25/ (T,B,O,C,D).

DO:
1) Unlock T (Excel COM / ensureUnlockedWorkbook path via comparison helper).
2) Parse headers/counts: Sheet2 ~859, B punches, O date range 6/11-6/25, C codes, D row count (~24).
3) Extract sample vectors for SHARED/samples.json: Basic, OT hrs, Gross, SSS Cont, loans, NetPay, TotalReceivable.
4) Run source-only:
   cd hris-api
   npm.cmd run dry-run:bandai-payroll-source -- --workbook=../docs/new-cutoff/june-11-25/HRIS Payroll Computation June 11 - 25, 2026.xlsx --password=9090 --no-default-sources --compensation-upload=../docs/new-cutoff/june-11-25/Compensation\ Mass\ Upload\ 06.30.26.xlsx --deduction-upload=../docs/new-cutoff/june-11-25/Deduction\ Mass\ Upload\ 06.30.26.xlsx --overtime-workbook=../docs/new-cutoff/june-11-25/1rptOvertimeDetails\ -\ June\ 11-25,\ 2026.xlsx --output-dir=../<stamp>/01-probe/source
5) Write 01-probe/REPORT.md tables. Do NOT mutate DB payroll. Do NOT use May defaults.

DELIVERABLE: 01-probe/* including sample-register.json
```

### 5.3 A-API-MONEY

```text
ROLE: A-API-MONEY (compensation + deduction imports).
Stamp from LATEST. Wait for SHARED/period.json and LOCK_IMPORT_MONEY from ROOT.

DO:
1) Acquire LOCK_IMPORT_MONEY.
2) POST multipart compensation: /api/migration/dm3/import-compensation-mass-upload file C.
3) POST multipart deduction: /api/migration/dm3/import-deduction-mass-upload file D.
4) Spot-check DB/API enrollments for samples 01360,00032 (what codes landed).
5) Write honesty table: register loans missing from D → SOURCE_INCOMPLETE (D has ~24 rows).
6) Release lock. Never Run Payroll. Never OT import.

DELIVERABLE: 02-api-money/import-comp.json, import-ded.json, enrollment-spotcheck.md
```

### 5.4 A-API-TIME

```text
ROLE: A-API-TIME (biometrics + approved OT + timesheet lines).
Stamp from LATEST. Wait LOCK_IMPORT_TIME. Prefer after money imports unless ROOT says parallel.

DO:
1) Acquire LOCK_IMPORT_TIME.
2) DM4 path: biometrics file B then OT file O (migration APIs / durable DM4 run per dm-migration-workflow.md).
3) Resolve periodCode from SHARED/period.json (NOT May default PP-20260426-20260511).
4) Loop:
   npm.cmd run dry-run:bandai-payroll-timesheet-lines -- --periodCode=<FROM_SHARED> --overtime-workbook=../docs/new-cutoff/june-11-25/1rptOvertimeDetails - June 11-25, 2026.xlsx --password=9090
   if plannedLineUpdates>0: repair:bandai-payroll-timesheet-lines --apply (same args)
   until plannedLineUpdates=0 or residual classified
5) Report sample OT hours vs register (from 01-probe vectors).
6) Release lock. Never debug-reset all payrolls.

DELIVERABLE: 03-api-time/dm4-*.json, ot-dry-run-final.json, ot-sample-table.md
```

### 5.5 A-COMPARE

```text
ROLE: A-COMPARE (tally engine + residual taxonomy). Prefer read-only.
Stamp from LATEST.

EARLY (parallel): build field maps from unlocked register; prepare empty residual skeleton.
AFTER Run Payroll exists:
1) npm.cmd run dry-run:bandai-payroll-comparison -- workbook T password 9090 --no-default-sources + C/D/O paths --output-dir=<stamp>/04-compare
2) show:bandai-payroll-problems and show:bandai-payroll-repair-plan
3) Per-sample table: emp | field | register | hris | delta | node to re-enter | class
4) Residual MUST use buckets (not bare N):
   basic_days | ot_hours_pay | contrib_period1 | loan_missing_upload | tax_after_gross | receivable_only
5) Write SHARED/handoff-board.md for ROOT fan-out.
6) NEVER upload. NEVER reset payroll. NEVER invent loan amounts.

DELIVERABLE: 04-compare/*, residual-matrix.md, handoff-board.md
```

### 5.6 A-UI

```text
ROLE: A-UI (Playwright / browser journeys). Agent-owned clicks.
Stamp from LATEST. Local app http://localhost:5175 (or DEV URL if ROOT says).
Login admin@bandai.local / password123.

DO (read-first cycles):
1) Open /admin/configuration/migration?workbook=dm3 — document compensation/deduction upload controls.
2) Open DM4 migration surface — document bio/OT upload.
3) Open Run Payroll / period list — find 2026-06-11..2026-06-25.
4) Screenshots under 05-ui/screens/.

MUTATE only when ROOT grants LOCK_PAYROLL_MUTATE:
5) Clear path: /settings?debug=true&resetEmployeePayrolls=true  (DEV org only; capture toast counts)
   OR call API reset with confirm DELETE_EMPLOYEE_PAYROLLS
6) Run Payroll for frozen period in UI; wait terminal; screenshot.
7) Open employee payroll / payslip for samples; NetPay visible.
8) Zero console errors preferred; network proof for failed uploads.

DELIVERABLE: 05-ui/playwright-report.json, screenshots, UI-REPORT.md
Do not fight A-API-* for the same upload if API already succeeded — verify UI reflects it.
```

### 5.7 A-FIX (optional, spawn on defect)

```text
ROLE: A-FIX. Only when residual class is code_defect/engine_rule after sources proven.
Read residual-matrix.md. Fix mapper/import/calculator/periodNumber bug with regression test.
Prove via re-run path through ROOT (clear → run → compare). Commit/push develop when green.
No scope creep into device/biometric merge work.
```

---

## 6. ROOT loop (coordination)

```text
cycle = 0
while not EXIT_GATE:
  cycle += 1
  HEARTBEAT | multi | cycle=N | agents=states | gate=X/15 | next=

  # parallel refresh
  ensure A-RUNTIME green
  ensure A-PROBE artifacts current

  if money not done: assign LOCK_IMPORT_MONEY → A-API-MONEY
  elif time not done: assign LOCK_IMPORT_TIME → A-API-TIME
  elif payroll not clean: LOCK_PAYROLL_MUTATE → A-UI or API clear+run
  else: A-COMPARE full

  read residual-matrix / handoff-board
  fan-out re-entry:
    SOURCE_INCOMPLETE loans → document only (do not infinite loop)
    ot_hours_pay → re-spawn A-API-TIME
    basic_days → A-API-TIME + masters note
    contrib_period1 zero → A-RUNTIME periodNumber + A-FIX
    code_defect → A-FIX
  after any mutation → payroll clear+run again → compare

  update STATUS.md checklist G0–G15
  if all green: stop
```

### Operator visibility (print in chat)

```text
SPAWNED | role=A-RUNTIME | id=... | deliverable=00-runtime/
SPAWNED | role=A-PROBE | id=... | deliverable=01-probe/
...
AGENT_DONE | role=A-PROBE | status=ok|blocked | evidence=path
HEARTBEAT | multi | cycle=3 | money=done | time=ot_plan=12 | payroll=pending | compare=wait
```

If spawn tools unavailable: write `ROOT_FALLBACK` in MANIFEST with reason and continue solo **but still write per-role folders as if agents existed**.

---

## 7. Residual fan-out matrix (ROOT uses this)

| Residual bucket | Owner agent | Next action |
|---|---|---|
| basic_days | A-API-TIME + masters | schedules/bio/salary |
| ot_hours_pay | A-API-TIME | OT repair loop |
| allowance_gross | A-API-MONEY | re-import C / DM2 codes |
| loan_missing_upload | A-COMPARE (label) | SOURCE_INCOMPLETE — not fake rows |
| contrib_period1 | A-RUNTIME / A-FIX | periodNumber=1 / calculator |
| tax_after_gross_ok | A-FIX | only after gross match |
| receivable_only | A-COMPARE | secondary; not NetPay gate |
| ui_stale_snapshot | A-UI + LOCK_PAYROLL | clear + re-run + hard refresh process |

Every residual answer must be a **table** (count, samples, class, next) per project residual rules.

---

## 8. Canonical CLI (all agents share; override May defaults)

```powershell
$pack = "docs/new-cutoff/june-11-25"
$T = "$pack/HRIS Payroll Computation June 11 - 25, 2026.xlsx"
$C = "$pack/Compensation Mass Upload 06.30.26.xlsx"
$D = "$pack/Deduction Mass Upload 06.30.26.xlsx"
$O = "$pack/1rptOvertimeDetails - June 11-25, 2026.xlsx"
# periodCode from SHARED/period.json only
```

---

## 9. 5-agent vs 6-agent cheat sheet

| Slots | Mapping |
|---:|---|
| **6** | RUNTIME, PROBE, API-MONEY, API-TIME, COMPARE, UI |
| **5** | RUNTIME, PROBE+COMPARE, API-MONEY, API-TIME, UI |
| **4** | RUNTIME+PROBE, API-MONEY, API-TIME, UI+COMPARE (COMPARE after payroll) |

Never drop **API-TIME** or **COMPARE** — OT and NetPay tally are the critical path.

---

## 10. Short launcher (if you only want one paste)

```text
Execute docs/00-product/AGENT-PROMPT-multiagent-june-11-25-payroll-parity.md as ROOT.
Spawn 6 agents: A-RUNTIME, A-PROBE, A-API-MONEY, A-API-TIME, A-COMPARE, A-UI.
Shared stamp + locks. Pipeline money → time → clear → run → compare until NetPay tallies
to docs/new-cutoff/june-11-25 register (password 9090). Period 1 contributions non-zero.
No May defaults. No human homework. HEARTBEAT multi. EXIT GATE G0–G15.
```

---

## 11. Change log

| Date | Note |
|---|---|
| 2026-08-04 | Initial 6-agent distribution for June 11–25 payroll parity E2E |
