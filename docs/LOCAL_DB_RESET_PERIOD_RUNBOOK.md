# Local DB Reset & Tallied Period Runbook

How to go from a **fresh local DB** to a payroll period that is **computed in-app
and verifiable against Sheet2**. Engine fixes (special-holiday split, PH schedule,
arp column, leavePay-in-gross, FILE_DUAL rates, Mon–Sat schedule truth) live in **code** — a fresh DB +
current `develop` has them automatically.

---

## Phase 0 — Environment (once per machine)

1. Local clone DB up: docker container `bnpi-pats-local-dev-clone` (Postgres on `127.0.0.1:5433`, db `bnpi-pats`).
2. `bnpi-pats-api/.env.development.local` → `DATABASE_URL/PG_DATABASE_URL/WRITE_DATABASE_URL` = `127.0.0.1:5433/bnpi-pats` plus:
   `BNPI_PATS_SKIP_PREDEV=true`, `BNPI_PATS_SKIP_HIKVISION_REMOTE_DEVICE_TUNNEL=true`, `BNPI_PATS_SKIP_DEVICE_LIVE_PATH=true`
   (no K3s forward / Cloudflare prompts needed for local-DB mode).
3. Start API: `cd bnpi-pats-api && npm run dev` → `http://localhost:3001/health`.
4. Reset DB (when needed): recreate container/volume → `npx prisma db push --force-reset` + seed (`npm run seed:bandai`).

---

## Phase 1 — Master Data Imports (via UI)

Navigate to **Admin → Configuration → Migration** (`/admin/configuration/migration?tab=migration`):
1. **DM1**: Import Org Master (Departments, Sections, Positions, Shift Types).
2. **DM2**: Import Migration Policies, Benefit & Loan Types.
3. **DM3 Employee Databank**: Click **Upload employee databank** (`BNPI_MASTERLIST.xlsx` or `2026_07_July Manpower Databank.xlsx`).

---

## Phase 2 — Cutoff Period Data Imports (via UI)

On the **DM3 & DM4** tabs for the target cutoff (e.g. June 26 – July 10 or July 11 – July 25):
1. **DM3 Upload compensation**: `Compensation Mass Upload MM.DD.YY.xlsx`
2. **DM3 Upload deduction**: `Deduction Mass Upload MM.DD.YY.xlsx`
3. **DM3 Upload leave (period)**: `Leave (July).xlsx` (Select sheet `Leave (2)` or `Paid`, select target cutoff).
4. **DM3 Upload worksharing schedule**: `WorkSharingSchedule - [Period].xlsx` (Assigns period shift rotations, e.g. `06:00 to 14:00`, `06:45 to 15:45`, `18:45 to 03:45`, `20:00 to 05:00`).
5. **DM4 Upload biometrics + OT**: `Biometrics Data_*.xlsx` + `rptOvertimeDetails - *.xlsx`.

---

## Phase 3 — Single Post-Import Tally Fix Command (Canonical for All Agents)

After importing the files for **ANY** period, run the single unified orchestrator command:

```powershell
cd bnpi-pats-api
npm run tally:fix -- --period=PP-20260626-20260711
```
*(For July 11–25, replace `--period=PP-20260711-20260726`).*

### What this single command runs automatically in sequence:

| Step | Action | Description & Scope |
|---|---|---|
| **1** | **Universal MLA Guarantee** | Guarantees open-horizon ₱500/cutoff Meal Allowance for all active Bandai DIRECT employees (`mla` matches 99.9%). |
| **2** | **Jan–Jun Loan History** | Re-imports 14 historical deduction workbooks so recurring loan enrollments carry forward. |
| **3** | **24-Month Loan Horizon** | Extends active loan end-dates to standard 24-month horizon floor (`hdmfSl` 99.5%, `mhdmf2` 98.7%, `sssSl` 98.1%, `rcbc` 97.4%). |
| **4** | **Late & UT Recompute** | Recomputes exact late and early-out minutes from raw biometric punch timestamps against assigned Mon–Sat schedules for that specific period. |
| **5** | **Live Sheet2 Tally Compare** | Unlocks the client's Sheet2 Excel file via Excel COM (`9090`), compares all 22 columns against the live API preview, and generates `REPORT.md` and `summary.json`. |

---

## Phase 4 — Proof & Evidence

Evidence lands in `.runtime/tally-<PERIODCODE>-<stamp>/`:
- `REPORT.md` (Human-readable markdown comparison table)
- `summary.json` (Machine-readable band metrics)
- `all-results.json` (Full 800+ employee row-by-row deltas)
- `compare.csv` (Spreadsheet export for reconciliation)

---

## Multi-Period Rule for Agents

When a user or agent imports another cutoff:
1. Complete the UI mass file imports (Comp, Dedn, Leave, DM4 Bio+OT).
2. Run `npm run tally:fix -- --period=<TARGET_PERIOD_CODE>`.
3. Steps 1, 2, and 3 are idempotent (auto-skip in ~1s if already present).
4. Steps 4 and 5 dynamically execute for the new period's punches and register comparison.
