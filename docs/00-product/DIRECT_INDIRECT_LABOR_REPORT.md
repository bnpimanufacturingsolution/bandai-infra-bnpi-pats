# Direct vs Indirect Labor Report

HR Workforce report that splits headcount and attendance by **Direct labor** vs **Indirect labor**.

| Field | Value |
|---|---|
| Menu | Reports → **Workforce Analytics** |
| Tab | **Direct vs Indirect** |
| URL | `/hr/reports/workforce?tab=direct-indirect` |
| Title | Direct vs Indirect Labor Report |
| Role | HR manager |
| Git (local proof) | `develop` `6aad83c5` |
| Public DEV | `NEEDS_CONFIRMATION` until that SHA is serving |
| Evidence | `.wwg/reports/direct-indirect-labor-ui-20260820.md` |

## How to open

1. Sign in as HR.
2. Sidebar: **Reports** → **Workforce Analytics**.
3. Click **Direct vs Indirect** (or open the URL above).
4. Default on this page is still **Manpower Distribution**. That is a different report.

## Tabs on Workforce Analytics

| Tab | URL `?tab=` | What it is |
|---|---|---|
| Agency Attendance | `agency` | Agency attendance summary |
| Manpower Distribution | `labor` (default) | Monthly manpower + databank |
| Direct vs Indirect | `direct-indirect` | This report |

Tardiness / undertime / overtime stay under **Reports → Attendance Reports**. They are the other half of Timesheet sheet **2.1.7**, not this tab.

## What the numbers mean

| Label | Meaning |
|---|---|
| Direct labor | `Employee.workforceSource` is **not** `AGENCY` (BNPI / missing source counts as Direct) |
| Indirect labor | `Employee.workforceSource` is `AGENCY` |
| Direct / Indirect Employees (top cards + department table) | From `POST /api/metrics` metric `directIndirectLaborSummary` |
| Scheduled work days / active manpower / no-work / attendance rate | Same metrics API, per department |
| Gender / Agency / Headcount / Total Manpower tables on this page | Client employee roster. They can show **0** even when the Direct/Indirect cards have counts |

Live local snapshot 2026-08-20: Direct labor **872**, Indirect labor **1,355**, 15 departments.

## Residual (honest)

| Item | Now | Do not treat as |
|---|---|---|
| Gender / Agency / Total Manpower = 0 | Client roster gap | “No Direct people” |
| Public `dev.bnpi-hris.tech` | Until `6aad83c5` is serving | Proof this SHA is live |
| No-work / daily manpower tabs | Still not mounted (2.1.9) | Part of this report |

## Hard bans

| Do not say | Because |
|---|---|
| Direct vs Indirect replaced Manpower Distribution | Default is still `?tab=labor` |
| This is the tardiness / OT report | Those stay on `/hr/reports/attendance` |
| Gender/Agency/Total Manpower 0 means nobody is Direct | Those blocks are a client roster, not the metrics API |
| Indirect = employment type | Bucket is `workforceSource === AGENCY` |
| “Direct” here means device SDK evidence | That is **Direct device evidence**, a different term |

## Filters and export

Department, Manager, Labor Type (All / Direct / Indirect), plus the shared report date scope (month / year / range). **Export** is icon + label (XLSX / PDF / CSV).

## API (non-mutating)

```text
POST /api/metrics
{
  "model": "Attendance",
  "data": ["directIndirectLaborSummary"],
  "filter": { "dateFrom": "YYYY-MM-DD", "dateTo": "YYYY-MM-DD" }
}
```

Read `data.metrics.directIndirectLaborSummary.totalDirectEmployees` and `.totalIndirectEmployees`.

Re-prove commands: `.wwg/reports/direct-indirect-labor-ui-20260820.md` (Re-prove section).
