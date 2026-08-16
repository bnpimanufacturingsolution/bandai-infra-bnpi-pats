# WWG Report — BNPI Payroll App vs File Findings (2026-08-13)

**Status:** `DOCUMENTED`  
**Canonical doc:** `docs/BNPI_PAYROLL_APP_VS_FILE_FINDINGS_20260813.md`  
**Period focus:** Jun 26–Jul 10, 2026 (+ April OT dual-path proof)

## Summary table

| Area | Finding | Evidence |
|---|---|---|
| Absent | Keep empty bio = ABSENT; 472 Rio-pattern peers | `.runtime/rio-absent-pattern-peers-20260812/` |
| Basic | **Path A implemented** — fails **481→1** (paidDays×dailyRate) | `.runtime/full-tally-jul11-25-after-basic-path-a-20260817/` |
| Basic import | DM3 `BASIC_SALARY` → `Employee.basicSalary`; Daily Salary → `dailyRate` | `docs/dm-migration-workflow.md` |
| TR if Basic fixed | Still ~fleet unmatched (Gross/TR residual) | after-basic-path-a tally |
| OT hours | ~match | after-otbnpi scan |
| OT pay | **FILE_DUAL implemented** — fails **482→1** | `.runtime/full-tally-after-ot-dual-20260813/` |
| File dual OT | Path A Daily/8; Path B Monthly BNPI 313 | April 545 / 249 + live engine |
| 313 | Hardcoded `BANDAI_DIRECT_ANNUAL_WORK_DAYS` | `payroll-period.helper.ts` |
| Admin Rates | Multipliers only; not base ₱75 | `/admin/rules-policies/payroll?tab=rates` |
| Recommendation | FILE_DUAL OT + Basic Path A | Canonical doc §11 + §14b — **both implemented local** |

## Product locks

- Empty biometrics = ABSENT (kept)
- Do not Path-A-only (breaks monthly Path B)
- FILE_DUAL OT + Basic Path A: **implemented local clone**; VM dailyRate pending

## Full narrative

See `docs/BNPI_PAYROLL_APP_VS_FILE_FINDINGS_20260813.md`.
