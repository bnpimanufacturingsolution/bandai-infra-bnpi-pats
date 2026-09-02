# WWG Report — BNPI recurring deductions (past mass upload + loan horizon)

**Status:** `DOCUMENTED_IMPLEMENTED_LOCAL`  
**Date:** 2026-08-18  
**Canonical:** `docs/BNPI_PAYROLL_APP_VS_FILE_FINDINGS_20260813.md` **§14c**

## Summary

| Topic | Truth |
|---|---|
| Jul (any single-cut) DED mass alone | **Incomplete** for Sheet2 loan columns |
| Recurring loans | Enrolled in **past** deduction mass uploads; keep charging until paid off |
| **Payment** | This cutoff charge → `monthlyPayment` → Sheet2 tally |
| **Amount** | Still owed at enroll → `principalAmount` / `balance` |
| Multi-cutoff apply | Needs `endDate` horizon (floor 24 mo); was broken when `maxTermMonths=1` |
| Past mass files | Primary source of recurring loan Payment/Amount |
| Fleet Gross/TR | **Not** fixed by this work |

## Jul 11–25 local proof (828 compared)

| Field | Fails before | Fails after |
|---|---:|---:|
| hdmfSl | 353 | **11** |
| sssSl | 300 | **31** |
| rcbc | 132 | **29** |
| gross / absent / late / dma | unchanged | unchanged |
| totalReceivable | ~827 | ~826 |

## Evidence

| Artifact | Path |
|---|---|
| Investigation + FAQ | `.runtime/prior-deduction-recur-20260817/REPORT.md` |
| Full re-tally | `.runtime/tally-after-loan-20260818/COMPARE-BEFORE-AFTER.md` |
| Repair script | `hris-api/scripts/repair-bnpi-loan-multi-cutoff-horizon.mjs` |
| Reimport script | `hris-api/scripts/import-prior-deduction-mass-history.ts` |
| Helpers | `resolveBandaiMassUploadLoanTermMonths`, `resolveBandaiLoanEndDate` |

## Product locks

- Past DED mass is required for true recurrence; cut file alone is not enough.
- Sheet2 loan $ ≠ remaining balance (Payment vs Amount).
- Empty bio = ABSENT unchanged; Gross residual work remains separate.
