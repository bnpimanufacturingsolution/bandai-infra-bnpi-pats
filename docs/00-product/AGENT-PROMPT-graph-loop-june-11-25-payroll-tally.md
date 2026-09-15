# Graph + loop engineering — June 11–25 payroll tally (dry-run until match)

**Status:** `EXECUTE_NOW`  
**Created:** 2026-08-04  
**Truth map:** `docs/BNPI_JUNE11_25_2026_PAYROLL_PARITY_CHECKLIST.md`  
**Overnight ordered sibling:** `docs/00-product/AGENT-PROMPT-overnight-june-11-25-payroll-parity-e2e.md`  
**Non-stop template:** `docs/00-product/AGENT-PROMPT-nonstop-loop-engineering.md`

---

## 0. Paste-ready graph engineer kickoff

```text
Execute docs/00-product/AGENT-PROMPT-graph-loop-june-11-25-payroll-tally.md
as ROOT graph + loop engineer for BNPI June 11–25 2026 payroll parity.

Non-stop. Agent-owned. Probe everything. Dry-run locally until NetPay tallies.

Truth pack:
  docs/new-cutoff/june-11-25/*
  register password 9090
  checklist docs/BNPI_JUNE11_25_2026_PAYROLL_PARITY_CHECKLIST.md

Every cycle:
  1) freeze live payrollPeriod for 2026-06-11..2026-06-25 (periodNumber MUST be 1)
  2) re-probe source files (counts/codes) — do not trust memory
  3) run the active node’s dry-run (source | OT lines | benefits | full compare)
  4) if mismatch: classify node residual → fix that node only → re-clear payroll → re-run → re-compare
  5) HEARTBEAT with residual matrix table

Loop until EXIT GATE or only SOURCE_INCOMPLETE residuals with full per-row table.
Evidence: .runtime/graph-june11-25-payroll-YYYYMMDD-HHMMSS/
```

---

## 1. Ordered dependency graph (do not reorder edges)

```text
                    ┌─────────────────────────────┐
                    │  N0  Freeze period + samples │
                    │  2026-06-11..25 periodNum=1 │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  N1  Unlock register T       │
                    │  parse Sheet2 NetPay truth   │
                    └──────────────┬──────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
     ┌────────────────┐  ┌─────────────────┐  ┌──────────────────┐
     │ N2 DM1/DM2/DM3 │  │ N3 Upload C     │  │ N4 Upload D      │
     │ masters/sal/   │  │ Compensation    │  │ Deduction        │
     │ schedules      │  │ mass upload     │  │ mass upload      │
     └───────┬────────┘  └────────┬────────┘  └────────┬─────────┘
             │                    │                    │
             └────────────────────┼────────────────────┘
                                  ▼
                    ┌─────────────────────────────┐
                    │  N5  DM4 Biometrics B        │
                    │  punches → Attendance        │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  N6  DM4 Approved OT O       │
                    │  → Timesheetline buckets     │
                    │  dry-run until plan=0        │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  N7  Clear unpaid payroll    │
                    │  reopen period if needed     │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  N8  Run Payroll (period 1)  │
                    │  expect SSS/PH/Pagibig > 0   │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  N9  Compare register ↔ BNPI PATS │
                    │  NetPay first, then recv     │
                    └──────────────┬──────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
     mismatch basic/days    mismatch OT/gross     mismatch loan/contrib
     → N2/N5                → N6 (not B alone)    → N4 / engine N8
              │                    │                    │
              └────────────────────┼────────────────────┘
                                   ▼
                    ┌─────────────────────────────┐
                    │  N10 Residual taxonomy       │
                    │  re-enter graph at failing   │
                    │  node only (loop)            │
                    └─────────────────────────────┘
```

### Edge rules

| From → To | Prerequisite |
|---|---|
| N0 → N1 | Period frozen; do not invent periodCode |
| N1 → N2/N3/N4 | Register row count known; sample NetPay known |
| N3/N4 → N5 | Mass uploads applied **or** residual pre-labeled; DM2 codes exist for COMCODE/DEDCODE |
| N5 → N6 | Attendance materialization done (OT without days is false green) |
| N6 → N7 | OT dry-run `plannedLineUpdates=0` |
| N7 → N8 | No stale unpaid rows for period |
| N8 → N9 | Payroll job terminal; contributions non-zero check |
| N9 → N10 | Comparison artifacts written |
| N10 → (N2…N8) | Only re-enter **failing** node; then always N7→N8→N9 again |

---

## 2. Node contracts

### N0 — Freeze

| Field | Value |
|---|---|
| Dates | start `2026-06-11`, end `2026-06-25`, pay ~`2026-06-30` |
| periodNumber | **1** |
| Samples | `01360`, `00032`, `00021`, + ≥2 OT production |
| Primary metric | NetPay |
| Secondary | TotalReceivable (never mixed into NetPay gate) |

### N1 — Register truth

- Unlock with password `9090` (Excel COM via `ensureUnlockedWorkbook` / comparison script).
- Prove ~859 employee rows; Sheet1 receivable list exists.
- Save sample register vectors (basic, OT hrs, gross, contrib, loans, net, receivable).

### N2 — Masters

- Benefit/loan types must resolve C/D codes: LLA, TSA, OAD, INC, MTX, ARP, OBA, ABS, AON, SSSSALLN, HDMFSALLN, HDMFCALLN, BNPISALLN, RCBCLN, …
- `BASIC_SALARY` for samples matches register Basic Salary family for this cut.

### N3 — Compensation (payroll adjustment source)

- File C only for this cut.
- Import API: `POST /api/migration/dm3/import-compensation-mass-upload`
- ~2,027 rows expected; codes LLA/TSA/OAD/INC/MTX/ARP/OBA/ABS/AON.

### N4 — Deduction

- File D only; **~24 rows** expected — incomplete vs full register is **known**.
- Import API: `POST /api/migration/dm3/import-deduction-mass-upload`
- For samples with register loans missing from D → residual `SOURCE_INCOMPLETE`, not engine panic.

### N5 — Biometrics

- File B: columns `No.`, `Date/Time` only.
- Role: attendance evidence → timesheet day shells / present status.
- **Does not** load Reg OT / ND / RD / Hol buckets.

### N6 — Approved OT → timesheet lines

- File O: OVERTIME/ND/HOLIDAY WORK DETAIL REPORT, range 6/11–6/25.
- Dry-run loop:

```text
dry-run timesheet-lines → if plannedLineUpdates>0 → repair --apply → dry-run again
until plannedLineUpdates==0 OR blocker classified (missing employee/day)
```

- Default script periodCode is **May** — always pass June periodCode + `--overtime-workbook` to O.

### N7 — Clear payroll

- Stale `EmployeePayroll` after OT/benefit repair invalidates compare.
- DEV options:
  - Deep link `/settings?debug=true&resetEmployeePayrolls=true` (org-wide debug)
  - `POST /api/employeePayroll/debug/reset-generated-payrolls` + `{ confirm: "DELETE_EMPLOYEE_PAYROLLS" }`
- Prefer DEV org; record delete counts.

### N8 — Run Payroll

- Scope: frozen period only, periodNumber 1.
- Gate: sample employees have **SSS Cont > 0** (unless MWE/explicit exempt proven on register).
- If contributions are 0: stop claiming OT issues — fix period/config first.

### N9 — Compare

```text
npm run dry-run:bandai-payroll-comparison --
  --workbook=<T> --password=9090 --no-default-sources
  --compensation-upload=<C> --deduction-upload=<D>
  --overtime-workbook=<O>
  --output-dir=<stamp>/compare
```

Show problems + repair plan scripts after each full compare.

### N10 — Residual matrix (mandatory shape)

### Residual: NetPay mismatches = N

| Bucket | Count | What it is | Blocker class | Next step |
|---|---:|---|---|---|
| basic_days | | | import_gap / code_defect | |
| ot_hours_pay | | | apply_path / import_gap | re-enter N6 |
| contrib_period1 | | | code_defect / config | re-enter N0/N8 |
| loan_missing_upload | | | export_gap / SOURCE_INCOMPLETE | client file D |
| tax_after_gross_ok | | | engine_rule | only after gross solid |
| receivable_only | | | optional_product | exclude from NetPay gate |

### Per-row (samples ≤30)

| empNo | field | register | bnpi-pats | delta | node to re-enter | class |

---

## 3. Loop engine (state machine)

```text
state = DISCOVER
cycle = 0
while not EXIT_GATE and cycle < MAX:
  cycle += 1
  HEARTBEAT(cycle, state, residual_matrix, next)

  switch state:
    DISCOVER:
      open truth docs; probe runtime; freeze N0
      state = SOURCE_PROBE
    SOURCE_PROBE:
      N1 source-only dry-run
      state = ENSURE_MASTERS
    ENSURE_MASTERS:
      N2 readiness proof
      state = IMPORT_MONEY
    IMPORT_MONEY:
      N3 then N4 (idempotent upsert)
      state = IMPORT_TIME
    IMPORT_TIME:
      N5 then N6 until plan=0
      state = PAYROLL_CLEAN
    PAYROLL_CLEAN:
      N7 then N8
      state = COMPARE
    COMPARE:
      N9
      if samples NetPay green and only SOURCE_INCOMPLETE residuals:
        state = DONE
      else:
        state = REPAIR
    REPAIR:
      N10 classify top residual bucket
      re-enter earliest failing node (N2..N6 or engine)
      ALWAYS return via PAYROLL_CLEAN (clear + run) before COMPARE
    DONE:
      write STATUS.md; exit

MAX default: 40 cycles or wall-clock overnight; never exit on time alone with open gates.
```

### Loop invariants

1. After any change to attendance, OT lines, benefits, or loans → **N7 → N8 → N9** before claiming progress.  
2. Never “fix tax” before GrossPay and contributions classification.  
3. Never treat TotalReceivable miss as NetPay fail.  
4. Never use May default workbooks.  
5. Deduction file thinness is expected — do not infinite-loop inventing loans.

---

## 4. Probe checklist (every cycle can re-run subset)

| Probe | Command / action | Pass signal |
|---|---|---|
| API health | `GET /health` | 200 |
| DB | `55435` listen + prisma period query | period row for 6/11–6/25 |
| Register | unlock + row count | ~859 |
| Comp codes | parse C | codes map non-empty |
| Ded rows | parse D | count ~24 (known) |
| OT header | parse O | Date Range 6/11–6/25 |
| Bio | parse B | punches > 0 |
| OT plan | timesheet-line dry-run | plannedLineUpdates=0 |
| Contrib | sample EmployeePayroll | SSS Cont > 0 |
| Compare | comparison summary | mismatch ↓ or classified |

---

## 5. EXIT GATE

| # | Gate |
|---|---|
| G1 | Graph nodes N0–N9 executed at least once with evidence |
| G2 | OT plannedLineUpdates=0 for period |
| G3 | periodNumber=1 and contributions non-zero on samples |
| G4 | Frozen samples: NetPay match **or** residual only SOURCE_INCOMPLETE with rows |
| G5 | Residual matrix tables present (no bare integers) |
| G6 | ≥20 HEARTBEATs or full green |
| G7 | STATUS.md + compare artifacts under stamp |
| G8 | No recoverable human homework remaining |

---

## 6. Historical May 10 lesson (carry forward)

| May 10 lesson | June 11–25 application |
|---|---|
| Defaults in CLI point at Apr26–May10 | Always `--no-default-sources` + pack paths |
| OT repair default periodCode May | Pass live June periodCode |
| Benefits dated wrong period poison tally | Prefer cutoff mass uploads C/D; supersede old openings |
| Clear unpaid before re-run | Mandatory N7 after every source fix |
| Source-trace roles still useful | Same roles; different files |
| Period 2 contribution zero is **not** this cut | Period 1 must compute full statutory |

---

## 7. Evidence layout

```text
.runtime/graph-june11-25-payroll-YYYYMMDD-HHMMSS/
  STATUS.md
  HEARTBEATS.log
  N0-period.json
  N1-register/
  N3-comp-import.json
  N4-ded-import.json
  N5-dm4-bio.json
  N6-ot-dry-run-*.json
  N7-reset.json
  N8-run-payroll.json
  N9-compare/
  residual-matrix.md
```

---

## 8. Hard bans

- Stopping because “deduction file is short” without labeling SOURCE_INCOMPLETE and finishing NetPay-capable employees.  
- Skipping N6 because biometrics exists.  
- Claiming green on contributions=0 for period 1.  
- Mixing NetPay and TotalReceivable.  
- Editing the client register to force match.  
- Ending with “please open Run Payroll and click generate.”
