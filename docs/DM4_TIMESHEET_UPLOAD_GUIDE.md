# DM4 Timesheet Upload — Operator Guide

How to import timesheet source data (biometrics punches, approved overtime, period
leave) into HRIS with one script — no agent session required.

Script: `scripts/run-dm4-timesheet-upload.mjs`
Journey background: `docs/DM4_JAN_JUL_2026_BACKFILL.md`

---

## What this script does

HRIS has no literal "timesheet workbook". The DM4 pipeline **materializes** timesheets:

```text
Biometrics punch workbook (No. | Date/Time)   -> DM4.1 attendance -> DM4.2 timesheets
Approved OT workbook (rptOvertimeDetails)     -> DM4.3 OT buckets on timesheet lines
Leave workbook (Final Leave & Awol)           -> DM3 period-leave (leave-pay rows)
```

The script runs that journey for you:

1. Health-checks the local API, logs in.
2. Finds every `.xlsx` in your folder(s), sorts cutoffs oldest → newest.
3. **Dry-run gates every file** — a workbook whose plan has blockers or rows with no
   schedule coverage is skipped and reported, never written.
4. With `--execute`, starts the real import per file with a fresh `idempotencyKey`
   (re-runs are safe: the pipeline is idempotent upsert).
5. Watches every run to terminal state; **auto-refires STALE runs** (API restarts)
   with a new key, up to `--max-refires`.
6. Saves every request/response to `.runtime/dm4-upload-<timestamp>/` and prints a
   final `OK x/y` summary.

**Safety default: without `--execute` nothing is ever written** — you get a pure plan.

---

## Prerequisites

| Need | Check / fix |
|---|---|
| Local API on `http://localhost:3001` | down → `powershell -File scripts\restart-local-hris-api-dev.ps1` |
| DEV DB forward on `127.0.0.1:55435` | script fails at login if dead → `powershell -File scripts\start-k8s-dev-db-access.ps1` (kill any stale ssh PID squatting 55435 first) |
| `curl.exe` on PATH | standard on Windows 10+ |
| Node 18+ | `node --version` |
| Login | defaults `admin@bandai.local` / `password123` (override: `--email/--password` or env `HRIS_UPLOAD_EMAIL`/`HRIS_UPLOAD_PASSWORD`) |

Workbooks must use the proven formats: punch ledger (`No. | Date/Time`), Bandai
`rptOvertimeDetails` bucket report, `Final Leave & Awol` leave ledger. Files ending in
`.xlsx`/`.xls` in the given folders are picked up automatically (Excel temp `~$` files
are ignored).

---

## Quickstart

```powershell
# 1) PLAN ONLY — see what every workbook would do (no writes):
node scripts\run-dm4-timesheet-upload.mjs --files "C:\path\to\biometrics-folder" --ot "C:\path\to\ot-folder"

# 2) Read the plan output. Every file should say "dry-run clean".
#    If a file was skipped, fix the data or investigate before forcing anything.

# 3) EXECUTE the same pass (still plan-gated per file):
node scripts\run-dm4-timesheet-upload.mjs --files "C:\path\to\biometrics-folder" --ot "C:\path\to\ot-folder" --execute
```

Expected output per file:

```text
[dm4:Biometrics Data_Jan 11 - 25.xlsx] dry-run gating...
[dm4:Biometrics Data_Jan 11 - 25.xlsx] dry-run clean.
[dm4:Biometrics Data_Jan 11 - 25.xlsx] accepted cmtwz3xm30003vx441vo0g7tq
[dm4:Biometrics Data_Jan 11 - 25.xlsx]: IMPORTING
[dm4:Biometrics Data_Jan 11 - 25.xlsx]: COMPLETED
[dm4:...] TERMINAL COMPLETED | rows=8019 failed=0 updated=9443 recalculated=1484
DONE: 12/12 OK. Evidence: .runtime/dm4-upload-2026-09-11T23-52-52
```

---

## All flags

| Flag | Meaning | Default |
|---|---|---|
| `--files <dir-or-file>` | Folder (or single file) of **biometrics punch workbooks** | required unless `--ot`/`--leave` given |
| `--ot <dir-or-file>` | Folder of **approved-OT workbooks** (must be per-cutoff files) | optional |
| `--leave "<file>=<PP-CODE>"` | Leave workbook + its payroll period (repeatable) | optional |
| `--execute` | Actually import. Without it: plan-only | off |
| `--api <url>` | HRIS API base | `http://localhost:3001` |
| `--org <id>` | Organization id | BNEI org `cmpxw0mfe00007zws3iypuu9d` |
| `--email` / `--password` | Login credentials | admin defaults (env overridable) |
| `--max-refires <n>` | STALE-run refire attempts per file | 3 |
| `--only <substring>` | Process only files whose name contains this | all |
| `--skip-dry-run` | Skip the plan gate — **not recommended** | off |

---

## Real scenarios

### New cutoff workbooks arrive (the normal monthly case)
```powershell
node scripts\run-dm4-timesheet-upload.mjs --files "confidential-files\new-cutoff\aug-11-25" --execute
```
(Put the client's `Biometrics Data_*.xlsx` and, when supplied, its `rptOvertimeDetails`
in the folder; the script auto-detects which is which by filename.)

### The client sent a YEARLY OT report again
DM4.3 resolves **one payroll period per workbook date range**, so a yearly
`2026 rptOvertimeDetails.xlsx` must be split into per-cutoff files first (header rows
kept, rows assigned by `Attdate`, the `Date Range:` line rewritten per split). The
splitter used for the Jan–Jul backfill is preserved in
`.runtime/jan-jul-backfill-20260911/` — copy that pattern, or ask an agent to fold it
into the script as a `--split-yearly-ot` mode.

### Leave for a cutoff
```powershell
node scripts\run-dm4-timesheet-upload.mjs --execute --leave "Leave (July 1-31, 2026).xlsx=PP-20260711-20260726"
```
- A cutoff that **spans two calendar months** needs the two months **combined into one
  workbook** (one data table) — importing month files sequentially overwrites
  per-employee. 
- Rows marked Unpaid/AWOL are intentionally skipped (they are day-status evidence,
  not leave pay). A summary of `created=0` with `skippedUnpaidRows` high means the
  source really has no paid leave in that window — that is an honest zero.

### Re-running / recovering
- **Same file twice?** Safe — idempotent upsert refreshes existing rows (`created=0`,
  everything `updated`).
- **API died mid-run** (run shows `STALE`)? The script refires automatically with a new
  key. If you see `STALE_EXHAUSTED`, just re-run the same command — it continues cleanly.
- **DB forward flap** (`Can't reach database server at 127.0.0.1:55435` in responses)?
  Rebuild the forward (`scripts\start-k8s-dev-db-access.ps1`) and re-run; partial work
  is preserved by the idempotent upsert.

---

## Reading the results

- `rows` — employee-day source rows selected from the workbook
- `failed` — must be `0`; anything else, check the run's `errorJson` in evidence
- `updated` / `created` — idempotent upsert counters (re-imports: `created=0`)
- `timesheetsRecalculated` — sheets whose lines the import touched
- `materializedMissingLines` — timesheet lines newly filled from punches
- OT runs report `DM4.3: parsed / missing / touched / plannedLineUpdates` —
  `planned=0` usually means OT was already on the lines (no-op), not a failure
- Post-write verify: the run record's `attendanceRowsFound` / `timesheetlineRowsFound`
  are fresh DB reread counts

Evidence per pass lives in `.runtime/dm4-upload-<timestamp>/`:
`dryrun-*.json`, `exec-*.json`, `leave-resp-*.json`, `SUMMARY.json`.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `API not healthy` at start | Start/restart the API (`scripts\restart-local-hris-api-dev.ps1`) |
| Login fails | DB forward down → rebuild (`scripts\start-k8s-dev-db-access.ps1`) |
| `DRY-RUN NOT CLEAN` | The workbook plan has blockers — open the run's `errorJson` in `dryrun-*.json`; fix source data, never force |
| `rowsWithoutAnySchedulePlan > 0` | Some punch dates have no employee schedule coverage — import the DM3 schedule assignments for that window first |
| `STALE_EXHAUSTED` | API restarted more than `--max-refires` times mid-run — re-run the command (safe) |
| `MulterError: Unexpected field` | (old manual-calls era issue) — the script already uses the correct multipart field names |
| Poll errors then recovery | Transient forward/API gaps; the script tolerates up to 14 consecutive poll errors before giving up on a run |

## Current-state reminders (2026-09-11)

- Punch coverage is continuous **Dec 26 → Jul 25 except May 26–Jun 10** (no punch
  workbook exists anywhere — client gap).
- Comp/ded mass uploads for Jan–May windows were never provided; generating payroll for
  those periods before they arrive would pay incomplete money.
- Jul 11–25 is COMPLETED/paid — its payroll snapshot is locked; do not regenerate.
