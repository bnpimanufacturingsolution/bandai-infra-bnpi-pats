# Timesheet Management audit

**Date:** 2026-08-18 (UI hop) · **real functional re-test 2026-08-19** · **sheet 2.1.1–2.1.12 recheck 2026-08-20**  
**Sheet:** Timesheet Management (section 2) — claimed Core 100%, Customization 100%, Testing 96.25%  
**Kind:** live Playwright (screens) **plus live API writes/math** (not page-open only)  
**Answer to “is it 100% working?”:** **No.**

---

## Recheck 2026-08-20 on public DEV (`https://dev.bnpi-pats.tech`)

Actor: Maria Santos `hr-manager@seed.local`. CSS `root-CIRKoZkC.css`. Evidence: `.runtime/dev-timesheet-sheet-20260820/`.

| ID | Sheet 100% claim | Live DEV | Proof |
|---|---|---|---|
| 2.1.1 | Attendance / Online | **Yes** | `/hr/attendance` Attendance Overview |
| 2.1.2 | Attendance / Biometrics | **Partial** | Device Events opens (admin). Not an HR Timekeeping page |
| 2.1.3 | Overtime | **Yes (report)** | `/hr/reports/attendance?tab=overtime` |
| 2.1.4 | Undertime | **Yes** | `/hr/reports/attendance?tab=tardiness` |
| 2.1.5 | Adjustments | **Yes** | `/hr/time-corrections` |
| 2.1.6 | Perfect attendance | **Yes** | `/hr/reports/attendance?tab=perfect` |
| 2.1.7 | Tardiness/UT/OT + **direct vs indirect** | **Partial** | Workforce **Manpower Distribution** only. No Direct vs Indirect tab |
| 2.1.8 | Leave tardiness/UT, balance, manhour | **Partial** | Leave Balance tab exists |
| 2.1.9 | No-work, daily manpower, agency | **Partial** | Agency Attendance report exists (5 agencies). No dedicated No-Work / Daily Manpower tabs |
| 2.1.10 | Leave conversion / credit upload | **No** | PAN URL redirects to tickets. `LEAVE_CONVERSION` API **400** |
| 2.1.11 | Disciplinary + late | **Partial** | Late on overview. Disciplinary page opens. API **404** |
| 2.1.12 | Pregnant / no-work lists | **No** | Employee directory has no Pregnant list. `/hr/my-attendance` is **404** |

**DEV verdict:** sheet 100% is still false. Same gaps as local: 2.1.7 labor report, 2.1.10 conversion, 2.1.11 API, 2.1.12 lists.

## Recheck 2026-08-20 vs sheet 2.1.1–2.1.12 (all marked 100%)

The orange box on the sheet (**2.1.7**) and the rest of 2.1 are **not all present as product screens**. Sheet 100% is still wrong.

| ID | Sheet row | Have it? | Where / gap |
|---|---|---|---|
| 2.1.1 | Attendance / Online | **Yes** | `/hr/attendance` |
| 2.1.2 | Attendance / Biometrics | **Partial** | Admin Device Events, not an HR Timekeeping page |
| 2.1.3 | Overtime | **Yes (report + request)** | `/hr/reports/attendance?tab=overtime`; employee OT request exists. Payable OT still needs HR approve |
| 2.1.4 | Undertime | **Yes** | `/hr/reports/attendance?tab=tardiness` |
| 2.1.5 | Adjustments | **Yes (partial)** | `/hr/time-corrections` + employee attendance correction |
| 2.1.6 | Monthly/annual perfect attendance | **Yes** | `/hr/reports/attendance?tab=perfect` |
| 2.1.7 | Tardiness, UT, OT details + **direct vs indirect labor** | **Partial** | Tardiness/OT tabs exist. `DirectIndirectLaborTab.tsx` is **not mounted**. Workforce page is Agency + Manpower Distribution only |
| 2.1.8 | Leave tardiness/UT, leave balance, manhour | **Partial** | Leave Balance tab exists. No separate “leave tardiness” report. Manhour is timesheet hours, not its own report |
| 2.1.9 | No-work, daily manpower, agency summary | **Partial** | Agency Attendance tab works. `NoWorkReportTab` + `DailyManpowerTab` exist as files but **are not routed** |
| 2.1.10 | Leave conversion, annual leave credit uploads | **Missing as timesheet feature** | Live `POST /api/request` type `LEAVE_CONVERSION` → **400 invalid enum** (2026-08-20) |
| 2.1.11 | Disciplinary + late tracking | **Partial** | Late is real on Attendance. `/admin/disciplinary-action` is **mock**. `GET /api/disciplinaryAction` → **404** (2026-08-20) |
| 2.1.12 | Lists of pregnant and no-work employees | **Missing** | Pregnant is a manpower import column, not an HR list. No-work API exists; list tab unwired |

**Score vs sheet:** 4 clearly in (1, 3, 4, 6). Rest split/missing. **Not 100%.**

---

## Real test verdict (2026-08-19)

The sheet 100% is **wrong**. A UI hop only proved screens exist. Today we ran live metrics, punch math on Zen Andrei `00010`, correction write, lock authz, request types, and mocha helpers.

| Bar | Result |
|---|---|
| Screens exist | Most Timekeeping pages open |
| Based on employees **scheduled today** | **Yes** — 866 scheduled; 1360 have no work day |
| Scheduled tally | **Yes** — 2+864 and 864+2 both = 866 on 2026-08-19 |
| Late / UT math on a real punch | **Partial / conflicting** |
| Correction write | **Fail** — validation 400 works; apply **500** |
| Payable overtime | **Policy works as 0** this month (approval required) |
| Every sheet row | **Not 100%** — mock, missing, orphan, or 500 |

Evidence: `.runtime/timesheet-real-test-20260819/` · mocha **26 passing** (`timekeeping` + `employee-schedule` + schedule utilization).

### Real-test matrix (not UI)

| ID | What we executed | Pass? | Proof |
|---|---|---|---|
| 2.1.1 Attendance / Online | Overview 2026-08-19: scheduled **866**, clocked in **2**, not clocked in **864**. Zen 2026-08-17: scheduled 1, clocked in 1, late 1, early-out 1, hours **1:15** (75 min) vs 08:00–17:00, punch 13:40–14:55 Manila | **Pass** for schedule+punch | `overview-2026-08-19.json`, `overview-2026-08-17-zen.json` |
| 2.1.1 late/UT rollup | Same Zen day: **row** late `4:40` / UT `2:05` (125 min); **metrics totals** late 280 min / UT **30** min | **Fail tally** | same file — `totalUndertimeMinutes=30` vs `undertimeHours=2:05` |
| 2.1.2 Biometrics | Device events GET 200. `employeeNo` empty, `attendanceId` null on sample. Device-users without device id = 400 | **Not proven** as punch→attendance | `device-events-zen.json` |
| 2.1.3 Overtime | Aug 1–19 `overtimeMetrics` = **0h / 0 people**. Config `requireManagerApprovedOvertime=true`. Zen flags include `OT_CANDIDATE` but payable OT 0 | **Pass as policy** | `overtime-aug.json`, `timesheet-config.json` |
| 2.1.4 Undertime | Zen is in tardiness report (3 late / 2 UT). Row UT 2:05 is real. Report rollup minutes do not match the row | **Partial** | `tardiness-aug.json` |
| 2.1.5 Adjustments | **App feature added 2026-08-19.** Employee **My Requests → Attendance Adjustment** now files `ATTENDANCE_CORRECTION` with time in/out. My Attendance missed clock-out has **Request clock-out**. HR **Time Adjustments** tab still posted invalid `TIME_ADJUSTMENT` (not wired). Direct HR `/hr/time-corrections` exists. Live Zen 8/18 request `REQ-1786424090598` SUBMITTED waiting HR | **Partial — request UI exists; apply-on-approve not proven in UI this pass** | `.runtime/zen-att-adjust-20260819/` |
| 2.1.6 Perfect attendance | API 200: **36 / 91** (39.56%) Aug 1–19. Not re-checked person-by-person vs punches | **API works; not 100% proven** | `perfect-aug.json` |
| 2.1.7 Direct vs indirect | API 200. **UI mounted 2026-08-20** on `/hr/reports/workforce?tab=direct-indirect` | **Pass UI + API** | `.wwg/reports/direct-indirect-labor-ui-20260820.md`, `.runtime/direct-indirect-2.1.7-20260820-114121/api-direct-indirect.json`, Playwright `hr-workforce-direct-indirect.spec.ts` |
| 2.1.8 Leave balance | Filter `employeeId=Zen` → `totalEmployees=1` | **Pass** | `leave-balance.json` |
| 2.1.9 No-work / manpower | 2026-08-19: no-work **864** + active **2** = **866**. Matches overview. 2026-08-18: 849+17=866. Report tabs still unwired | **Pass math / fail UI** | `nowork-19.json`, `active-19.json` |
| 2.1.10 Leave conversion / credit upload | `LEAVE_CONVERSION` is **not** a request type (400 enum). Allowed: LEAVE, TIMESHEET, OVERTIME, ATTENDANCE_CORRECTION, … | **Missing** | `request-types-probe` 400 |
| 2.1.11 Disciplinary | `GET /api/disciplinaryAction` **404**. Page is mock rules | **Fail** | live 404 |
| 2.1.12 Pregnant / no-work lists | Pregnant filter ignored (returned Zen first). No list API | **Fail** | `pregnant-filter.json` |
| 2.2.1 Lock | Missing periodId → 400. Employee role → **403**. Did **not** lock a fleet period | **Authz pass; no live lock** | `lock-missing`, `lock-forbidden-employee` |
| Timesheet by employee | `GET /api/timesheet?employeeId=Zen` still returns another person. `/view` **500** | **Fail filter** | `zen-ts-query.json` |
| Unit (helpers) | mocha 26/26 on late/UT/schedule denominator | **Pass isolated** | local mocha |

### Residual: Zen 2026-08-17 minutes

| Bucket | Row | Metrics total | Blocker |
|---|---|---|---|
| Hours worked | 1:15 (75) | 75 | matches |
| Late | 4:40 (280) / raw 340 | 280 | raw vs stored |
| Undertime | 2:05 (125) | **30** | `code_defect` rollup |
| OT payable | 0:00 | 0 | matches policy |

Schedule used: Regular Day **08:00–17:00**. Punch: **13:40–14:55** Manila. Late + UT is the correct *kind* of result; the **30 vs 125** undertime total is not.

---

**Kind (older UI hop):** live Playwright feature audit (does the screen exist, and does it open)  
**Not** a UAT sign-off and **not** a 100% coverage claim.

| | |
|---|---|
| Actor | HR `hr-manager@seed.local` · Admin `admin@bandai.local` |
| App | `http://localhost:5175` |
| API | `http://localhost:3001` |
| Spec | `bnpi-pats-app/tests/smoke/hr-timesheet-management-audit.spec.ts` |
| Screenshots / JSON | `.runtime/timesheet-mgmt-audit-20260818/` |

---

## Verdict vs the sheet

The sheet marks Core and Customization **100%**. The live app has **most Timekeeping screens**. It does **not** ship every named report as a routed page, and two “lists” are not product screens.

| Claim on sheet | Live (after real API test 2026-08-19) |
|---|---|
| 2.1 Core 100% | **Not 100%.** Schedule-today tally and online punch math exist. Correction write **500**. Leave conversion / pregnant list / disciplinary API **missing**. UT rollup ≠ row. Biometrics not linked on sample events. |
| 2.2 Customization 100% | Lock authz works (employee 403). No live period lock executed. |
| 2.3 Testing 96.25% | Helper mocha **26 passing**. Repo `npm test` glob is broken (`vitest` missing on a spec). No UAT screen. |

**Not 100% working.** Do not treat the sheet score as a real-test pass.

---

## 2.1 Core

| ID | Sheet row | Route / API | Feature in app? | Live result | What we saw |
|---|---|---|---|---|---|
| 2.1.1 | Attendance / Online | `/hr/attendance` | Yes | **Working** (metrics still painting) | Attendance Overview: utilization, late / undertime / OT cards, clock presence, 7-day trend. Sidebar **Timekeeping → Attendance** |
| 2.1.1b | My Attendance | `/hr/my-attendance` | File exists, **not routed** | **Missing (404)** | `Page not found` |
| 2.1.2 | Attendance / Biometrics | `/admin/configuration/devices/events` · `GET /api/device/events` | Yes (admin ledger) | **Working** | Device Events. Live API 200, Hikvision `EN_HCNETSDK_ALARM` rows. This is **not** a second HR Attendance page |
| 2.1.3 | Overtime | `/hr/reports/attendance?tab=overtime` · `overtimeMetrics` | Yes | **Working (0 OT this window)** | Overtime Report chrome + Export. API Aug 1–18: **0 hours / 0 people**. Payable OT still needs approval / workbook — see `docs/OVERTIME_SOURCE_OF_TRUTH.md` |
| 2.1.4 | Undertime | `/hr/reports/attendance?tab=tardiness` · `tardinessMetrics` | Yes | **Working** | **Tardiness & Undertime** tab. API Aug 1–18: **51** people, **62** late (285.42h), **27** UT (39.25h). Zen 00010 is first row |
| 2.1.5 | Adjustments | `/hr/time-corrections` | Yes | **Working (empty list)** | **Attendance Corrections**. Table chrome; rows still loading / empty on hop |
| 2.1.6 | Monthly/annual perfect attendance | `/hr/reports/attendance?tab=perfect` · `perfectAttendanceMetrics` | Yes | **Working** | Perfect Attendance tab. API Aug 1–18: **31 / 82** perfect (37.8%) |
| 2.1.7 | Tardiness / UT / OT details + **direct vs indirect labor** | tardiness + overtime tabs; labor API `directIndirectLaborSummary` | **Yes (split surfaces)** | **Working** | Tardiness/OT remain on Attendance Reports. Workforce now has a third tab **Direct vs Indirect** (`?tab=direct-indirect`). Live API 2026-08-20: **872** direct / **1355** indirect, 15 departments. Manpower Distribution stays default `labor`. Client gender/agency/total-manpower tables on this tab can still show 0 while API KPIs are filled |
| 2.1.8 | Leave tardiness/UT, leave balance, manhour | `/hr/reports/attendance?tab=leave` · `leaveBalanceMetrics` | Yes (balance) | **Working** | Leave Balance tab. API: 2,226 employees, types include ACL / BEL / BIL / CL. Manhour is timesheet hours, not a separate report |
| 2.1.9 | No-work, daily manpower, agency summary | agency tab + unused tabs + metrics | **Split** | **Partial** | **Agency Attendance** tab works (5 agencies). `NoWorkReportTab` + `DailyManpowerTab` exist but **are not routed**. APIs work: no-work **864**, active manpower **2** (Jhon 01694, Zen 00010) on 2026-08-18 |
| 2.1.10 | Leave conversion, annual leave credit uploads | PAN type + leave-type import | **Split** | **Partial** | `LEAVE_CONVERSION` is an employee PAN option (“convert leave credits to cash”). HR `/hr/requests/personnel-action` **redirects to tickets**. No dedicated “annual leave credit upload” timesheet screen. Leave-type import lives under admin/migration |
| 2.1.11 | Disciplinary + late tracking | `/admin/disciplinary-action` + attendance Late | **Mock + real** | **Partial** | Late tracking is real on Attendance Overview. Disciplinary page opens with Tardiness / Insubordination / Poor Performance — **in-memory `mockRules`**, comment says “replace with actual API calls”. Deletes do not persist |
| 2.1.12 | Lists of pregnant and no-work employees | no list route | **No list page** | **Missing / partial** | Pregnant is a **Manpower Databank import column**, not an HR list. No-work people exist in the metrics payload (864) but the report tab is unwired |

### 2.1 notes

- Online attendance = HR Attendance Overview (punches + schedule). Biometrics = Device Events / Sync logs, not a second “Attendance / Biometrics” HR menu.
- Current Aug timesheet list API has historical DM4 timesheets (`totalOvertimeHours` on old periods). The **active** Timesheets UI said **no payroll period for today**.
- OT report 0 for August is consistent with `requireManagerApprovedOvertime=true` and no approved Aug OT workbook on this clone.

---

## 2.2 Customization

| ID | Sheet row | Route | Feature in app? | Live result | What we saw |
|---|---|---|---|---|---|
| 2.2.1 | Lock Timesheet Correction Request | `/hr/timesheets` Lock Period | Yes | **Working chrome, nothing to lock today** | **Lock Period** button. Cards all **0**. Copy: “No active payroll period found for today.” |
| 2.2.1b | Cutoff lock rule | `/admin/rules-policies/timesheet` · `GET /api/timesheet/config` | Yes | **Working** | Timesheet Rules. Live config: `lockTimesheetOnCutoffFinalization=true`, `enableEditBeforeSubmission=true`, `requireManagerApprovedOvertime=true`, auto-approve **false** |

Lock is a **period freeze** + cutoff rule, not a separate “Lock Correction Request” toggle. Correction requests are blocked when the timesheet is locked (`TIMESHEET_LOCKED` on the correction API). Edit-permission request exists on timesheets (`/api/timesheet/:id/edit-permission/request`).

---

## 2.3 Testing (not a UI section)

| ID | Sheet | Claimed | What exists |
|---|---|---|---|
| 2.3.1 | Unit | 100% | Vitest around attendance template, arrival/status/utilization, timesheet view modal, corrections, payroll-correction form |
| 2.3.2 | Function | 100% | Service/hook tests (`timesheet.service`, `useTimesheets`, attendance correction). Not a function-test pack per sheet row |
| 2.3.3 | E2E | 95% | `hr-attendance-timesheet-end-user.spec.ts` (mocked), `approvals-attendance-correction.spec.ts`, this live audit. Not full-sheet e2e |
| 2.3.4 | UAT | 90% | No UAT product surface in the app |

---

## Does it tally on employees scheduled today?

**Yes — the over is scheduled-today, not all 2,226 people.**  
`totalEmployeesConsidered: 2226` is the fetch pool (everyone not deleted). The counts that matter filter with `isScheduledWorkDay` (embedded schedule / override, not rest, has time slots).

| Pool (2026-08-18 Manila) | Count | What it is |
|---|---:|---|
| All employees in the query | 2,226 | Fetch pool / `totalEmployeesConsidered` |
| Missing a work schedule today | 1,360 | Stay out of utilization |
| **Scheduled to work today** | **866** | The real over |
| Check | 1,360 + 866 | **= 2,226** |

Same 866 from two independent APIs:

| Family | Formula | Live | Sum |
|---|---|---|---:|
| Attendance Overview | clocked in + not clocked in | 2 + 864 | **866** |
| Workforce reports | no-work (no attendance row) + active manpower | 861 + 5 | **866** |

So **scheduled today tallies**. Rest-day / no-schedule people are not in no-work or utilization.

### Residual: clocked-in 2 vs active 5

Both families use the same 866 scheduled people. They do **not** use the same “showed up” test.

| Label | Count | Rule | Blocker |
|---|---:|---|---|
| Overview `totalClockedIn` | 2 | Scheduled + `timeIn` (or PRESENT/INCOMPLETE that schedule-util accepts) | — |
| Overview `totalPresent` | 5 | Still includes PRESENT rows, some **without** `timeIn` | leftover obligation / status-only |
| Workforce `activeManpower` | 5 | Scheduled + (PRESENT or INCOMPLETE or `timeIn`) | same 5 as `totalPresent` |
| Workforce `noWorkCount` | 861 | Scheduled + **zero** attendance rows | — |
| Overview `totalNotClockedIn` | 864 | Scheduled − clocked-in(2) | includes the 3 PRESENT-without-usable-`timeIn` |

`2 + 864 = 866` and `5 + 861 = 866`. The 3-person gap is **definition**, not a broken scheduled-today filter.

Active names on this snapshot: Jhon `01694`, Russel `00536`, Jessica `01640`, Zen `00010`, Angelito `00772`.

---

## API proof (same day)

| Metric | HTTP | Live numbers (Aug 2026 unless noted) |
|---|---|---|
| `GET /api/timesheet?limit=5` | 200 | Historical timesheets present (DM4 demo rows with OT hours) |
| `GET /api/attendance?limit=5` | 200 | Punch ledger present |
| `GET /api/device/events?limit=5` | 200 | Live Hikvision events today |
| `GET /api/timesheet/config` | 200 | OT approval required; lock on cutoff on |
| `perfectAttendanceMetrics` | 200 | 31 / 82 perfect (37.8%) |
| `tardinessMetrics` | 200 | 51 people · 62 late · 27 UT |
| `overtimeMetrics` | 200 | **0 / 0** this window |
| `noWorkReport` (2026-08-18) | 200 | 864 no-work of 2,226 |
| `dailyActiveManpower` (2026-08-18) | 200 | **2** active (01694, 00010) |
| `agencyAttendanceSummary` | 200 | 5 agencies (Avance 433, Cebu 496, …) scheduled days 0 this window |
| `directIndirectLaborSummary` | 200 | 871 direct / 1355 indirect |
| `leaveBalanceMetrics` | 200 | 2,226 employees; ACL 792 avg entitled 6.78 |

---

## Gaps (do not treat as 100%)

| Gap | Class | Detail |
|---|---|---|
| Direct vs indirect labor **page** | **mounted 2026-08-20** | `/hr/reports/workforce?tab=direct-indirect`. Operator: `docs/00-product/DIRECT_INDIRECT_LABOR_REPORT.md`. Remaining honesty: gender/agency/total-manpower on that tab use `useEmployees` roster, not the metrics API |
| Daily manpower + no-work **pages** | orphan UI | Same: tabs exist, APIs 200, not routed. Dashboard hop did not show a no-work report |
| Pregnant employee list | missing product | Import metadata only (`bnpi-manpower-databank-import.helper.ts` column `pregnant`) |
| `/hr/my-attendance` | dead route | 404 |
| Disciplinary cases | mock | Admin rules page, local state, no persistence / no employee case ledger |
| Leave conversion / leave-credit upload | partial | PAN type on employee form; HR personnel-action is a tickets stub; no timesheet credit-upload screen |
| Lock Period today | data | No payroll period covering 2026-08-18 |
| August payable OT | policy + data | Report works; count is 0 until approved OT exists |
| Sheet 100% | overstated | Core screens exist; named lists/reports are incomplete |

---

## How to re-run

```powershell
cd bnpi-pats-app
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:5175'
npx playwright test tests/smoke/hr-timesheet-management-audit.spec.ts --config=playwright.config.ts --reporter=list
```

API probe: `.runtime/run-timesheet-mgmt-api-probe.ps1`  
This file in `audits/` is the human write-up.
