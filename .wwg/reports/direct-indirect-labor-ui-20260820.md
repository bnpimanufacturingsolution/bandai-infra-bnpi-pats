# Direct vs Indirect labor UI — 2026-08-20

| Field | Value |
|---|---|
| Status | `IMPLEMENTED_LOCAL_BROWSER_PROOF` |
| Operator assignment | Timesheet Management **2.1.7** (split) |
| Operator doc | `docs/00-product/DIRECT_INDIRECT_LABOR_REPORT.md` |
| Audit | `audits/timesheet-management-2026-08-18.md` |
| Git | `develop` `6aad83c5` |
| Public DEV | `NEEDS_CONFIRMATION` until that SHA is serving |

## Answer

Tardiness / overtime reports were already on Attendance Reports. Direct vs Indirect labor was **API-only**. It is now a third Workforce Analytics tab. Manpower Distribution was **not** replaced.

## Done vs not done

| Claim | Status | Evidence | UI still shows |
|---|---|---|---|
| Tardiness & Undertime report | Done (pre-existing) | `/hr/reports/attendance?tab=tardiness` | Same tab |
| Overtime report | Done (pre-existing) | `/hr/reports/attendance?tab=overtime` | Same tab |
| Direct vs Indirect **tab** | Done 2026-08-20 | `/hr/reports/workforce?tab=direct-indirect` | **Direct vs Indirect Labor Report** |
| Manpower Distribution still default | Done | `?tab=labor` default | Monthly Manpower Distribution |
| API KPI Direct / Indirect | Done | 872 / 1355 | Cards 872 / 1,355 |
| Department labor table | Done | 15 departments | Administration, Production, … |
| Gender / Agency / Total Manpower on this tab | Open | Client `useEmployees` roster | Can show **0** while API KPIs are filled |
| 2.1.9 No-work / daily manpower tabs | Out of scope | Still unmounted | Not on this page |

## Residual

| Bucket | Count | What it is | Blocker class | Next |
|---|---:|---|---|---|
| Direct vs Indirect tab missing | 0 | Mounted as `direct-indirect` | — | — |
| API vs client roster | 4 blocks | Gender, Agency, Headcount, Total Manpower use employee list, not metrics | `code_defect` | REC-20260820-DIRECT-INDIRECT-ROSTER-VS-API |
| 2.1.9 orphan tabs | 2 | `NoWorkReportTab`, `DailyManpowerTab` | `optional_product` this pass | REC-20260818-TIMESHEET-ORPHAN-REPORT-TABS |
| Public GitOps SHA | 1 | Local Vite proven; public DEV until `6aad83c5` | `apply_path` | ansible-pull / Observe |

## What HR opens

| Step | Where |
|---|---|
| Menu | Reports → **Workforce Analytics** |
| Default tab | **Manpower Distribution** (`tab=labor`) |
| This report | **Direct vs Indirect** (`tab=direct-indirect`) |
| Title | Direct vs Indirect Labor Report |
| Actor | HR (`hris-hr-manager`) |

## DIRECT vs INDIRECT

| Bucket | Rule | Not used |
|---|---|---|
| **INDIRECT** | `Employee.workforceSource === AGENCY` | employment type, agency name, section |
| **DIRECT** | everything else (including missing source) | — |

API does **not** filter `employmentStatus`. The tab’s extra gender/agency tables **do** filter ACTIVE / ONBOARDING / ON_LEAVE. Those two headcounts can disagree.

## API contract

| Item | Value |
|---|---|
| Method / URL | `POST /api/metrics` |
| Body `model` | `Attendance` |
| Body `data` | `["directIndirectLaborSummary"]` |
| Filter | `dateFrom`, `dateTo`, optional `departmentId`, `reportToId`, `laborType` (`DIRECT` \| `INDIRECT`) |
| Default range | Controller: today Asia/Manila if both dates omitted |
| Tab reads | `data.metrics.directIndirectLaborSummary` |

Live probe 2026-08-20 (admin, local `:3001`, month-to-date):

| Field | Value |
|---|---|
| HTTP / status | 200 / `success` |
| Elapsed | 3.87s |
| `totalDirectEmployees` | **872** |
| `totalIndirectEmployees` | **1355** |
| `items` | **15** departments |
| Sample | Administration, Business Strategy, Executive, Facilities/Warehouse, GA/HR |
| JSON | `.runtime/direct-indirect-2.1.7-20260820-114121/api-direct-indirect.json` |

## Code

| Layer | Path |
|---|---|
| Page tabs | `hris-app/app/routes/hr/reports/workforce.tsx` |
| Report body | `hris-app/app/routes/hr/reports/tabs/DirectIndirectLaborTab.tsx` |
| Hook | `useDirectIndirectLaborSummary` |
| Helper | `hris-api/helper/workforce-metrics.helper.ts` `calculateDirectIndirectLaborSummary` / `getLaborBucket` |

`visibleTabs` = `agency` \| `labor` \| `direct-indirect`. Unknown `tab` remaps to `labor`.

## Tests

| Suite | Result |
|---|---|
| `hris-app` vitest `workforce.test.tsx` | 3 passed |
| `ManpowerDistributionTab.test.tsx` | 3 passed (regression) |
| Playwright `tests/smoke/hr-workforce-direct-indirect.spec.ts` | 1 passed (1.1m) |
| Audit smoke 2.1.7b | Route now `?tab=direct-indirect`; requires report title + Labor Type + tab `active` |

Browser shots: `.runtime/direct-indirect-2.1.7-browser/` (`workforce-direct-indirect.png`, `workforce-default-manpower.png`, `attendance-tardiness.png`).

## Re-prove

```powershell
# API
$loginBody = @{ email='admin@bandai.local'; password='password123'; appCode='hris' } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post 'http://localhost:3001/api/auth/login' -ContentType 'application/json' -Body $loginBody
$headers = @{ Authorization = "Bearer $($login.data.token)" }
$body = @{
  model = 'Attendance'
  data  = @('directIndirectLaborSummary')
  filter = @{
    dateFrom = (Get-Date).ToString('yyyy-MM-01')
    dateTo   = (Get-Date).ToString('yyyy-MM-dd')
  }
} | ConvertTo-Json -Depth 6
Invoke-RestMethod -Method Post 'http://localhost:3001/api/metrics' -Headers $headers -ContentType 'application/json' -Body $body |
  ConvertTo-Json -Depth 8

# UI tests (hris-app)
npm.cmd exec -- vitest run app/routes/hr/reports/workforce.test.tsx
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:5175'
npx.cmd playwright test tests/smoke/hr-workforce-direct-indirect.spec.ts --config=playwright.config.ts --reporter=list
```

## Related

- Operator page: `docs/00-product/DIRECT_INDIRECT_LABOR_REPORT.md`
- Audit 2.1.7: `audits/timesheet-management-2026-08-18.md`
- REC-20260820-DIRECT-INDIRECT-ROSTER-VS-API
- REC-20260818-TIMESHEET-ORPHAN-REPORT-TABS (no-work / daily manpower still open)
