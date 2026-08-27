# Local DB Reset → Tallied Period Runbook (Jul 11–25 proven)

How to go from a **fresh local DB** to a payroll period that is **computed in-app
and verifiable against Sheet2**. Engine fixes (special-holiday split, PH schedule,
arp column, leavePay-in-gross, FILE_DUAL rates) live in **code** — a fresh DB +
current `develop` has them automatically. Only **data** needs replay.

## Phase 0 — Environment (once per machine)

1. Local clone DB up: docker container `hris-local-dev-clone` (Postgres on `127.0.0.1:5433`, db `hris`).
2. `hris-api/.env.development.local` → `DATABASE_URL/PG_DATABASE_URL/WRITE_DATABASE_URL` = `127.0.0.1:5433/hris` plus:
   `HRIS_SKIP_PREDEV=true`, `HRIS_SKIP_HIKVISION_REMOTE_DEVICE_TUNNEL=true`, `HRIS_SKIP_DEVICE_LIVE_PATH=true`
   (no K3s forward / Cloudflare prompts needed for local-DB mode).
3. Start API: `cd hris-api && npm run dev` → `http://localhost:3001/health`.
4. Reset DB (when needed): recreate container/volume → `npx prisma-postgres:push` + org/user/period seed
   (Bandai org `cmryhwpv70000vgaktlmrubmx`; periods incl. `PP-20260711-20260726` id `cmryhzl500032vgakz1uy1k7l`).

## Phase 1 — Master data (once per fresh DB)

Via **Admin → Configuration → Migration**:
1. DM1 (departments/sections/positions/levels)
2. DM2 (policies, benefit/loan types)
3. DM3 employees workbook (`BASIC_SALARY`, statutory IDs, schedules)

## Phase 2 — Period pack (one command)

```powershell
cd hris-api
node scripts/run-jul1125-tally-fix-pack.mjs --execute
```

Runs, with per-step proof under `.runtime/jul1125-tally-fix-<stamp>/`:

| # | Step | Source file(s) |
|---|---|---|
| 1 | DM4 attendance + approved OT buckets | `Biometrics Data_Jul 11 - 25_3.xlsx` + `rptOvertimeDetails - July 11 to 25, 2026.xlsx` |
| 2 | WorkSharing schedules + OFF flags | `WorkSharingSchedule - July 11-25, 2026.xlsx` |
| 3 | Late/UT recompute from punches | engine repair |
| 4 | dailyRate backfill (Path A basis) | Sheet2 `Daily Salary` |
| 5 | **Compensation from Sheet2** (DMA/MLA open-horizon recurring + period codes ARP/PFA/AON/LLA/TSA/OBA/OAD/HYS/ABS/MTX) | unlocked Sheet2 |
| 6 | Jul DED mass | `Deduction Mass Upload 07.31.26.xlsx` |
| 7 | Prior DED history Jan→Jun (recurring loans) | `deduction mass upload/` |
| 8 | Loan 24-month horizon repair | engine repair |
| 9 | Proof tally vs Sheet2 | `REPORT.md` |

Note: DM4's strict OT verify gate can report FAILED while the apply landed —
check the preview (Reg OT > 0) before re-running (known flap, documented).

## Phase 3 — Leave (Sheet2 mode)

Admin → Migration → DM3 → **Upload leave (period)** → pick the cutoff → import
(sheet `Leave (2)`, `PaidUnpaid=Paid`, dates in window). API equivalent:
`POST /api/migration/dm3/import-period-leave` (`payrollPeriodId` explicit).

## Phase 4 — Proof

```powershell
node scripts/run-payroll-tally-matrix.mjs        # E2E matrix (DB+API+unit+tally+recurrence)
```

Per-cutoff register tally (works for ANY period; auto-resolves period from DB,
auto-unlocks the client Sheet2 via Excel COM password 9090):

```powershell
cd hris-api
npm run tally:period -- --period=PP-20260626-20260711
# or by id / custom workbook:
npx tsx scripts/run-period-tally-compare.mjs --period=cmryhzl4d0030vgaka9dd2v99 --target-xlsx="...unlocked.xlsx"
```

Evidence lands in `.runtime/tally-<PERIODCODE>-<stamp>/`
(`REPORT.md`, `summary.json`, `all-results.json`, `compare.csv`).
Known built-in registers: Apr 26–May 10, Jun 26–Jul 10, Jul 11–25
(other cutoffs need `--target-xlsx` until added to `KNOWN_TARGETS`).
Tally report lands in `.runtime/tally-jul1125-after-repairs-<stamp>/REPORT.md`.

**Proven result for Jul 11–25 (this exact path):** TALLIED **67** / 828, UNMATCH 2,
OT_OK_NEAR_50 187, ALEXA 12, matrix 26 PASS / 0 FAIL.

## App-native mode (future periods, no Sheet2)

Skip steps 4, 5, 3-leave and the tally:
- Cut-specific comp/ded → that period's COMP/DED mass upload (same DM3 cards)
- **MLA → universal: every Bandai (DIRECT) employee gets ₱500 every cutoff automatically** (engine guarantee + `repair-bnpi-mla-universal.ts` backfill; agency excluded)
- Recurring DMA/loans → already open-horizon, apply automatically
- Leave → HR leave module (app-native)
- Attendance/late → biometrics + schedules (native)
- OT → still needs the client's `rptOvertimeDetails` until in-app approved OT fully replaces it

Sheet2, when provided later, is only an audit: re-run the tally compare for drift.

## Boundary

Local clone = testing only. Before treating any of this as runtime truth, replay
the data pack on the VM DB (and snapshot after — REC-20260825-LOCAL-CLONE-SNAPSHOT-BRUTE-REPAIRS).
