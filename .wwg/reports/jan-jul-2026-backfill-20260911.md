# Jan–Jul 2026 payroll data backfill (2026-09-11)

Status: `CONFIRMED_CODE_AND_LIVE_LOCAL` (local DEV hot-reload runtime, K3s DEV DB via 127.0.0.1:55435).

## What happened

Operator ordered ("ok do the january to july") extension of the same-day Jun 11–Jul 25
DM4 biometrics import back through the December 26 → June 10 windows. All imports were
dry-run-gated then executed oldest→newest against the canonical K3s DEV database.

## Confirmed truths

- **Punch-ledger source discovery:** the client archive
  `ATTENDANCE & TIME TRACKING-20260911T114912Z-1-001/` contains, inside
  `zip-rar/Biometrics Data.rar → 2026/`, the punch workbooks for every cutoff
  Dec 26–Jan 10 through May 11–25, in the exact DM4 format. Folder is now git-ignored
  (`ATTENDANCE & TIME TRACKING*/` + `**/ATTENDANCE & TIME TRACKING*/`).
- **Biometrics backfill complete:** 11 windows executed, all `COMPLETED`, `0 failed`,
  2,237 employees matched every run, rows per window 4,153–10,630 (full ledger in
  `docs/DM4_JAN_JUL_2026_BACKFILL.md`). Combined with the earlier Jun–Jul pass
  (33,717 rows), punch coverage is continuous **Dec 26 → Jul 25 except May 26–Jun 10
  which has no punch workbook anywhere** (`NEEDS_CONFIRMATION` with the client).
- **OT backfill complete:** the yearly `2026 rptOvertimeDetails.xlsx`
  (Date Range 1/1–5/31/2026, 121,422 rows) was split into 11 per-cutoff workbooks
  (0 unassigned rows) because DM4.3 resolves one period per workbook date range. All
  11 windows executed; mostly idempotent no-ops — OT was already on lines from prior
  eras and bucket metadata survived the biometrics refresh. Fleet proof per period:
  850–6,565 lines with real OT hours.
- **Leave for Jan–Apr = zero by source:** the 2026 Jan–Apr monthly `Final Leave & Awol`
  bundles contain no PAID leave rows inside any cutoff window; the import honestly
  reported zeros (UNPAID/AWOL rows are day-status evidence, not leave pay). May–Jul
  leave files remain missing everywhere.
- **Comp/ded for Jan–May never provided** (no workbooks exist in any supplied folder);
  only PP-20260426-20260511 carries prior-era benefits/loans (2,249 + 1,182).
- **API hardening defect fixed (code, uncommitted):** `migration.router.ts`
  `/runs/dry-run` + `/runs` now carry the heavy request-timeout tier
  (`requestTimeout(config.heavyRequestTimeoutMs)`); the 120s server default previously
  made multi-minute DM4 dry-runs impossible over HTTP.
- **Runtime stability pattern:** the tsx-watch API died mid-import 4×; the backfill ran
  under a supervised no-watch API (auto-respawn) with STALE runs recovered by fresh
  idempotent runs (new `idempotencyKey`). `/runs/:id/recover` remains a no-op repair
  candidate (status flips, worker never relaunches).
- **Gitignore hardening:** the client attendance archive (and any future timestamped
  re-export of it) cannot enter git.

## Boundaries

- No payroll generation was run for the backfilled periods (money is a separate
  authorized action). Jul 11–25 stays COMPLETED/paid and untouched by the refresh.
- No biometric bytes or leave money were fabricated; every zero is source-backed.
- Local DEV runtime proof only; VM/UAT/PROD promotion is not part of this pass.

## Evidence

- `docs/DM4_JAN_JUL_2026_BACKFILL.md` (operator page, full tables + gap list)
- `.runtime/jan-jul-backfill-20260911/BACKFILL-SUMMARY.md` (+ per-run JSON, supervised
  API log, extracted sources, OT splits, leave files)
- `.runtime/dm4-biometrics-import-20260911-162642/IMPORT-SUMMARY.md` (Jun–Jul pass)
- `.runtime/attendance-archive-review-20260911/REVIEW.md` (archive review)
- `.wwg/workspace/current-task.md` (2026-09-11 addenda)
