# BNPI Automated Period Folder Ingestion Runbook

## Overview

The **Period Folder Ingestion Orchestrator** (`hris-api/scripts/import-period-folder.mjs`, CLI `npm run import:period`) enables complete, one-command ingestion and synchronization of any cutoff period directly from a folder of `.xlsx` files without manual file sorting, renaming, or Sheet2 dependence.

---

## Quick Start

```bash
# In hris-api directory:
npm run import:period -- --dir="confidential-files/june26-july10"
npm run import:period -- --dir="confidential-files/july11-july25"

# Or using relative/absolute paths:
node scripts/import-period-folder.mjs --dir="C:/path/to/cutoff-folder"
```

---

## How It Works

```
                        Input Folder (e.g. confidential-files/july11-july25)
                                              │
                     ┌────────────────────────┴────────────────────────┐
                     ▼                                                 ▼
          [Tier 1: Fuzzy Name Matching]               [Tier 2: Column Header Fingerprint]
          - /biometrics|bio/i                         - Columns: COMCODE, EmployeeID -> COMP
          - /rptOvertimeDetails|overtime/i            - Columns: DEDCODE, Payment -> DED
          - /worksharing/i                            - Sheet: rptOvertimeDetails -> OVERTIME
          - /compensation/i                           - Columns: DateOfLeave, LeaveType -> LEAVE
          - /deduction/i                              - Columns: Employeeid, Shift -> WORKSHARING
          - /leave/i                                  - Columns: Emp No, Punch -> BIOMETRICS
          - /manpower|databank/i                      - Columns: ID No., Employee Name -> DATABANK
                     │                                                 │
                     └────────────────────────┬────────────────────────┘
                                              ▼
                                 Auto-Detected Period Code
                                  (e.g. PP-20260711-20260726)
                                              │
                     ┌────────────────────────┴────────────────────────┐
                     ▼                                                 ▼
        [Sequential File Ingestion]                      [Post-Import Precision Fixes]
        1. Manpower Databank (if present)                1. Universal Meal Allowance (₱500)
        2. WorkSharing Schedule                          2. Active Loan Multi-Cutoff Horizons
        3. Period Leave                                  3. Punch Late & Undertime Precision
        4. Compensation Mass Upload                      4. Sunday & Scheduled Off-Day Rest Days
        5. Deduction Mass Upload
        6. DM4 Biometrics & Overtime
                     │                                                 │
                     └────────────────────────┬────────────────────────┘
                                              ▼
                             ✅ Payroll Preview Ready in UI
```

---

## 2-Tier Fingerprint Engine

| Category | File Examples | Tier 1 Match Rule | Tier 2 Header / Sheet Fingerprint | Target API Endpoint |
|---|---|---|---|---|
| **Manpower Databank** | `2026_07_July Manpower Databank.xlsx` | `/manpower\|databank/i` | `ID No.`, `Employee Name`, `Position` | `/api/migration/dm3/import-manpower-databank` |
| **WorkSharing Schedule** | `WorkSharingSchedule - July 11-25, 2026.xlsx` | `/worksharing\|work.*schedule/i` | `Employeeid`, `Shift`, date columns | `/api/migration/dm3/import-worksharing-schedule` |
| **Period Leave** | `Leave (July 1-31, 2026).xlsx` | `/leave/i` *(excludes balance/awol)* | `DateOfLeave`, `LeaveType`, `Days` | `/api/migration/dm3/import-period-leave` |
| **Compensation Mass** | `Compensation Mass Upload 07.31.26.xlsx` | `/compensation\|comp.*mass/i` | `COMCODE`, `EmployeeID`, `Amount` | `/api/migration/dm3/import-compensation-mass-upload` |
| **Deduction Mass** | `Deduction Mass Upload 07.31.26.xlsx` | `/deduction\|ded.*mass/i` | `DEDCODE`, `EmployeeID`, `Payment` | `/api/migration/dm3/import-deduction-mass-upload` |
| **Biometrics Attendance** | `Biometrics Data_Jul 11 - 25_3.xlsx` | `/biometrics\|bio.*data/i` | `Emp No` / `PIN`, `Punch`, `DateTime` | `/api/migration/runs` (DM4) |
| **Approved Overtime** | `rptOvertimeDetails - July 11 to 25, 2026.xlsx` | `/rptOvertimeDetails\|overtime/i` | Sheet `rptOvertimeDetails` / `Reg OT`, `Spcl OT` | `/api/migration/runs` (DM4) |
| **Historical Register** | `HRIS Payroll Computation July 11 - 25, 2026.xlsx` | `/computation\|payroll register/i` | `Emp. No.`, `Basic Salary`, `GrossPay` | *Audit target only (not ingested)* |

---

## Automated Post-Import Precision Synchronizations

The orchestrator runs 4 automated post-import fixes immediately after ingestion:

1. **Universal Meal Allowance (MLA Guarantee)**:
   - Sets open-horizon ₱500 Meal Allowance `employee_benefits` for all active Bandai employees.
2. **Loan Multi-Cutoff Horizon Extension**:
   - Updates `endDate` on recurring loan records so multi-month amortization plans (RCBC, HDMF, SSS) deduct consistently each cutoff.
3. **Late & Undertime Punch Recalculation**:
   - Re-evaluates exact biometric punch timestamps against the employee's assigned WorkSharing shift start time (`computeDm4BiometricDayMetrics`), writing exact late and undertime minutes.
4. **WorkSharing Off-Days & Sunday Rest Day Alignment**:
   - Reconciles `flag=0` WorkSharing off-days and Sundays to `REST_DAY` so scheduled off-days are not counted as absences.

---

## CLI Options

| Option | Type | Description | Default |
|---|---|---|---|
| `--dir=<path>` | String | Path to the directory containing period Excel files. | *(Required)* |
| `--period=<code>` | String | Explicit Payroll Period code (e.g. `PP-20260711-20260726`). | Auto-detected from folder/filenames |

---

## Verifying Payroll Results

After running the script:
1. Open the HRIS web application $\rightarrow$ **Payroll Management**.
2. Select the Target Period (e.g. `Period 1 - Jul 2026`).
3. Click **Preview Payroll** to view the calculated register.
4. Export or approve the completed payroll.
