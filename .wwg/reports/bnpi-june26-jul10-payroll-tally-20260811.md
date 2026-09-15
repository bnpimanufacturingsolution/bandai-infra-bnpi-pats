# BNPI payroll tally investigation — Jun 26–Jul 10, 2026

**Status:** `INVESTIGATED_NOT_FLEET_TALLIED`  
**Date:** 2026-08-11  
**Period:** `PP-20260626-20260711`  
**Runtime used:** host-local API + local DB clone (`dev:local`, `127.0.0.1:5433`)

## Canonical evidence pack

| Path | Contents |
|---|---|
| `.runtime/full-tally-20260811/FINDINGS.md` | **Master findings log** (read this first) |
| `.runtime/full-tally-20260811/summary.json` | Machine summary, bands, samples |
| `.runtime/full-tally-20260811/compare.csv` | All employees Δ fields |
| `.runtime/full-tally-20260811/all-results.json` | Full per-row compare |
| `.runtime/full-tally-20260811/REPORT.md` | Auto band/field report |
| `.runtime/rio-tally-20260811/REPORT.md` | Rio Marasigan (01360) deep dive |
| `.runtime/payroll-tally-fix-20260811-021155/` | Alexa OT/late/BNPI 313 repair path |
| `.runtime/alexa-gap-20260811/` | Alexa residual notes |

## Headline truth

1. **Fleet is not tallied.** Of 818 compared employees: **4** exact money-core tallied, **1** Alexa-near (Δ Total −₱0.77), most off by hundreds–thousands of pesos.
2. **Alexa-era code fixes partially apply fleet-wide:** OT **hours** nearly universal; BNPI 313 rate path active when buckets present; WorkSharing **overrides** may exist but **line schedule rebuild** incomplete; DMA/loan period pins still fail at scale.
3. **`No. of Days` always fails (818/818) because of a code definition mismatch**, not because biometrics are universally wrong:
   - Target col I ≈ sum `approvedBuckets.regularDays` (paid regular days).
   - App `numberOfDays` = count of non-`REST_DAY` timesheet lines (includes ABSENT).
   - Live proof: Alexa target 9 = bucket regularDays 9, app days 13; Rio target 12 = buckets 12, app days 13.
4. **Fixing day-count alone will not make payroll tally.** Day column is largely display for BNPI allocation basic; money residuals are absent/late/OT pay/loans/DMA/tax.

## Money bands (818 compared)

| Band | Count |
|---|---:|
| TALLIED | 4 |
| ALEXA_NEAR | 1 |
| OT_OK_NEAR_50 | 4 |
| OT_MATCH_ONLY | 346 |
| UNMATCH | 463 |

Tallied codes: `00269`, `00344`, `01687`, `01729`.  
Alexa-near: `01792`.  
Rio `01360`: OT match only; Δ TotalReceivable +₱2,195.73.

## Product / engineering implications (not implemented)

| Priority | Action | Class |
|---|---|---|
| P2 optional | Map register `numberOfDays` → Bandai `sourceRegularDays` when buckets exist | code_defect (display definition) |
| P1 | Rebuild timesheet line schedules from day WorkSharing overrides; re-late whole period | apply_path |
| P1 | Period-pin DMA / MHDMF2 / RCBC / SSS for this cut | export_gap |
| P1 | Attendance truth for false ABSENT (e.g. Rio Jul 4) | export_gap / data |
| P0 after fixes | Re-run bulk compare script and update this report | verification |

## Related product truth already in wiki

- BNPI compensation/deduction source ownership (mass upload vs recurring enrollment vs engine vs OT/attendance): `project-truth.md` / summary 2026-08-05.
- Do not invent lines missing from mass upload without enrollment classification.

## Re-run

```text
bnpi-pats-api: node scripts/_tmp-full-period-tally-compare.mjs
→ .runtime/full-tally-20260811/
```
