# DM4 Jan–Jul 2026 Payroll Data Backfill (2026-09-11)

Operator order: "ok do the january to july" — extend the same DM4 biometrics/OT/leave
import coverage already executed for Jun 11–Jul 25 back through January 2026.

## What "timesheet upload" means here

There is no literal timesheet workbook. Timesheets are **materialized** by the DM4
pipeline from two inputs:

1. **Biometrics punch workbooks** (`No. | Date/Time` ledger) → DM4.1 attendance →
   DM4.2 timesheet materialization (idempotent upsert by natural keys + provenance).
2. **Approved OT workbooks** (`rptOvertimeDetails` bucket report) → DM4.3 applied onto
   effective timesheet lines.

## Sources used

| Source | Contents |
|---|---|
| `ATTENDANCE & TIME TRACKING-.../zip-rar/Biometrics Data.rar` → `2026/` folder | Punch-ledger workbooks for every cutoff Dec 26–Jan 10 through May 11–25 (extracted to `.runtime/jan-jul-backfill-20260911/biometrics-2026/`) |
| `ATTENDANCE & TIME TRACKING-.../OT report per employee/2026 rptOvertimeDetails.xlsx` | Yearly OT detail report, **Date Range 1/1/2026–5/31/2026**, 121,422 rows. Split into 11 per-cutoff workbooks (`.runtime/jan-jul-backfill-20260911/ot-splits/`) because the DM4.3 apply resolves ONE payroll period per workbook date range |
| `ATTENDANCE & TIME TRACKING-.../Leave TDUT Monitoring/2026/` monthly bundles (Jan–Apr) | `Final Leave & Awol` sheets, same schema the DM3 period-leave import consumes |
| `confidential-files/` (earlier same-day pass) | Jun 11–25, Jun 26–Jul 10, Jul 11–25 punch + OT workbooks |

The whole archive folder is **git-ignored** (`.gitignore`: `ATTENDANCE & TIME TRACKING*/`
+ `**/ATTENDANCE & TIME TRACKING*/`) alongside the pre-existing `confidential-files/`.

## Executed imports (all dry-run-gated, oldest → newest, all `COMPLETED` / `0 failed`)

### Biometrics (attendance → timesheets), 2,237 employees matched every run

| Cutoff period | Rows | Run note |
|---|---|---|
| PP-20251226-20260111 | 4,153 | 1 STALE refire |
| PP-20260111-20260126 | 8,019 | dry-run: 98.8% specific-schedule coverage |
| PP-20260126-20260211 | 10,630 | +1,338 created lines |
| PP-20260211-20260226 | 9,074 | |
| PP-20260226-20260311 | 8,858 | +1,526 created |
| PP-20260311-20260326 | 10,216 | +1,517 created |
| PP-20260326-20260411 | 8,792 | +1,572 created |
| PP-20260411-20260426 | 10,226 | |
| PP-20260426-20260511 | 10,043 | +1,204 created |
| PP-20260511-20260526 | 5,198 | +427 created |
| (Jun 11–25 / Jun 26–Jul 10 / Jul 11–25 — earlier same-day pass) | 11,745 / 11,258 / 10,714 | see `.runtime/dm4-biometrics-import-20260911-162642/IMPORT-SUMMARY.md` |

### Approved OT (DM4.3), 11 per-cutoff splits, 0 unassigned source rows

Every window dry-run + executed. Most were **idempotent no-ops** (`plannedLineUpdates=0`):
OT was already on the lines from prior import eras and the biometrics refresh preserved
bucket metadata. Sample line verified: employee 01244, 2026-01-12 line carries
`overtimeHours: "2:00"`.

Fleet proof — lines with real OT hours per period:

```
Dec26-Jan10 1,992 | Jan11-25 4,048 | Jan26-Feb10 6,293 | Feb11-25 4,528
Feb26-Mar10 3,615 | Mar11-25 4,812 | Mar26-Apr10 4,959 | Apr11-25 5,621
Apr26-May10 5,681 | May11-25 6,565 | May26-Jun10 850 (odd window, see gaps)
```

### Leave (DM3 period-leave) — honest zeros

Jan–Apr bundles imported against their cutoffs → the 2026 Jan–Apr `Final Leave & Awol`
sheets contain **no PAID leave rows** inside any cutoff window (hundreds of
UNPAID/AWOL rows, correctly skipped — AWOL/unpaid is day-status evidence, not leave
pay). Leave pay for Jan–Apr = zero **per the source data itself**. Nothing fabricated.

## Current period state after the backfill (live DB, 2026-09-11)

All periods PP-20251226-20260111 … PP-20260711-20260726 hold APPROVED timesheets
(736–840 employees per cutoff) built from punch evidence + approved OT on the lines.
The only odd surface is **PP-20260526-20260611** (1,805 APPROVED + 412 DRAFT,
29,268 lines) — see gaps below.

## Known gaps (client data, not agent-fixable)

| Gap | Affected | Needed |
|---|---|---|
| **No punch workbook for May 26–Jun 10** (rar ends May 11–25; confidential-files starts Jun 11) | PP-20260526-20260611 | Biometrics Data_May 26 - Jun 10 from the client |
| **No comp/ded mass uploads for Jan–May windows** | all Jan–May cutoffs except PP-20260426-20260511 (already has 2,249 benefits + 1,182 loans from a prior era) | Compensation/Deduction Mass Upload workbooks per cutoff |
| **No May–Jul leave workbooks** | May 26–Jun 10, Jun–Jul cutoffs | Leave files (combined file when a cutoff spans two months) |

Payroll **generation** for the ready periods is a separate authorized money action.

## Infra notes (recurring truths re-proven)

- The local API died mid-DM4-run 4× this day. Mitigation for the backfill window:
  **supervised no-watch API** (`node $TEMP/supervised-api.cjs`) — runs
  `npx dotenv-cli -o -e .env -e .env.development.local -- npx tsx index.ts` with
  **no file watcher** and 5s auto-respawn; log:
  `.runtime/jan-jul-backfill-20260911/api-supervised.log`. Restore the normal
  `scripts/restart-local-hris-api-dev.ps1` watch flow when done.
- STALE runs (in-memory job lost on restart) were recovered by **fresh idempotent
  runs with new `idempotencyKey`s** — the upsert is proven safe across all refires.
  `/runs/:id/recover` flips status without relaunching the worker (defect, follow-up).
- K3s DEV DB forward (127.0.0.1:55435 via Cloudflare SSH) flapped repeatedly;
  `scripts/start-k8s-dev-db-access.ps1` + the db-access watcher rebuild it; kill any
  stale ssh PID squatting port 55435 first.

## Code change shipped (uncommitted at write time)

`hris-api/app/migration/migration.router.ts` — `/runs/dry-run` and `/runs` wrapped with
`requestTimeout({ timeoutMs: config.heavyRequestTimeoutMs })` (matching the
payroll/timesheet/attendance router pattern). Before this, the 120s server default made
a multi-minute DM4 dry-run impossible over HTTP. `HEAVY_REQUEST_TIMEOUT_MS=900000` used
during the backfill. Follow-up: focused router-contract test + commit/push decision.

## Evidence index

- `.runtime/jan-jul-backfill-20260911/BACKFILL-SUMMARY.md` — run ledger + fleet proof
- `.runtime/jan-jul-backfill-20260911/biometrics-2026/` — extracted punch workbooks
- `.runtime/jan-jul-backfill-20260911/ot-splits/` — 11 per-cutoff OT workbooks
- `.runtime/jan-jul-backfill-20260911/leave-files/` — single-month + combined leave files
- `.runtime/jan-jul-backfill-20260911/api-supervised.log` — supervised API log
- `.runtime/dm4-biometrics-import-20260911-162642/IMPORT-SUMMARY.md` — Jun–Jul pass
- `.runtime/attendance-archive-review-20260911/REVIEW.md` — archive content review
- `.wwg/reports/jan-jul-2026-backfill-20260911.md` — WWG canonical report
