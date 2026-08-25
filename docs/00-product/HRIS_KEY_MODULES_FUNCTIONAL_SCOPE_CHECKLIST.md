# HRIS Spec-vs-App Presence Checklist

> Audit date: 2026-08-24 · Method: 6 parallel read-only agents, code-level presence only (no live runtime checks).
> Spec source: `docs/00-product/HRIS_KEY_MODULES_FUNCTIONAL_SCOPE.md` (36 items).
> Verdicts: PRESENT / PARTIAL / MISSING / NEEDS_LIVE_CHECK — each with file:line evidence.
> Score: **15 PRESENT · 14 PARTIAL · 7 MISSING** (updated 2026-08-25: M1.4 labor cost closed — chain Stage 4)
> Weighted rate: **(15 + 14×0.5) / 36 = 22/36 ≈ 61%**

## Module 1 — Payroll & Compensation

| # | Spec item | Status | Evidence |
|---|---|---|---|
| 1.1 | Payroll processing, payslip generation, last pay computation | PARTIAL | Processing: `hris-app/app/routes/hr/run-payroll.tsx` + `run-payroll-template.tsx`; API `hris-api/app/payrollperiod/payrollperiod.router.ts:388,436-510`. Payslips: `employeepayroll.router.ts:504,602` + `helper/payslip-pdf.helper.ts`. **Last pay computation MISSING** — only `finalPayCalculated` flag (`termination.controller.ts:1179`), no engine |
| 1.2 | BNPI salary loan application, allowance tracking (Line Leader, OB, Assembly Standing) | PARTIAL | `bnpiSalaryLoan` field `employeepayroll.prisma:109`; loan CRUD `employeeLoan.router.ts:311`; LLA `employeepayroll.prisma:124` + `benefitTypeSeeder.ts:43`; OB `:71`. **"Assembly Standing" zero repo hits**; no loan-application UI (only `admin/configuration/loan-types.tsx`) |
| 1.3 | Mass uploading of compensation and deductions | PRESENT | `app/migration/bnpi-mass-upload-import.service.ts` + helper (LLA/OBA/UFD codes); DM3 UI |
| 1.4 | Uniform deduction, loan reports, payroll summary, labor cost analysis | PARTIAL (labor cost CLOSED 2026-08-25) | Uniform + payroll summary ✅; loan report still partial; **labor cost analysis now PRESENT**: `labor-cost-analysis.helper.ts` + `metrics.controller.ts case "laborCostAnalysis"` + Workforce tab `labor-cost` (chips + per-dept table + exports). Live: Jun20–Jul20 → 2 periods, 35 emp, gross ₱668,470.64, 8 dept rows. Evidence `.runtime/spec-gap-m1-5/stage-4-labor-cost/` |
| 1.5 | Overtime summary (Agency & Direct) | PRESENT (2026-08-24) | `OvertimeTab.tsx` Labor Type filter (All/Direct/Agency) + Direct/Agency OT chips; `overtime-metrics.helper.ts` `split` computed over unfiltered set, optional `workforceSource` filter (DIRECT = not-AGENCY incl. missing). Live smoke: Jun 26–Jul 10 → all 99,075.36h/830 emp; AGENCY filter 0/0. Evidence `.runtime/spec-gap-m1-5/stage-2-ot-split/` |

**Why (gaps):**
- 1.1 Last pay: never built — termination flow only flips a `finalPayCalculated` boolean; no computation engine was ever scoped.
- 1.2 Assembly Standing: the allowance name appears nowhere (schema, seeds, mass-upload codes LLA/OBA/UFD only) — either named differently in BNPI files or never in scope. Loan application UI: admin loan-types page exists, but an employee-facing application flow was never built.
- 1.4 Labor cost analysis: RESOLVED 2026-08-25 (chain Stage 4) — money dimension added via payroll-register aggregation per department with Direct/Agency split.
- 1.5 Agency/Direct OT: RESOLVED 2026-08-24 (chain Stage 2) — `workforceSource` joined into overtime metrics with always-on split + filter.

## Module 2 — Attendance & Timekeeping

| # | Spec item | Status | Evidence |
|---|---|---|---|
| 2.1 | Daily attendance summary, cut-off encoding | PRESENT | `/hr/attendance` (`attendance-management-template.tsx:1197-1264,1425-1450`); cut-off via `/hr/timesheets` (`timesheets.tsx:244-286`, Lock Period `:1720`) |
| 2.2 | Monthly/annual perfect attendance reports | PRESENT | `PerfectAttendanceTab.tsx` at `/hr/reports/attendance?tab=perfect`; `metrics.controller.ts:1577` + `perfect-attendance-metrics.helper.ts` |
| 2.3 | Tardiness/UT/OT details, direct vs indirect labor | PRESENT | `TardinessUndetimeTab.tsx`, `OvertimeTab.tsx`, `/hr/reports/workforce?tab=direct-indirect`; APIs `:1628,:1668,:1821` |
| 2.4 | Leave tardiness/UT monitoring, leave balance, manhour reference | PARTIAL | `LeaveBalanceTab.tsx` + `leaveBalanceMetrics` (`:2430`) ✅; **leave-tardiness columns MISSING**; **manhour reference MISSING** (only audit-sheet label hit) |
| 2.5 | No work report, daily active manpower, agency attendance | PRESENT (2026-08-24) | Agency `AgencyAttendanceTab.tsx`; **`NoWorkReportTab` + `DailyManpowerTab` now wired** into `/hr/reports/workforce` (tabs `no-work`, `daily-manpower`; hooks `useNoWorkReport` `useMetrics.ts:778`, `useDailyActiveManpower`). Pin: `workforce-tabs.contract.test.ts` |

**Why (gaps):**
- 2.4 Leave tardiness/UT: `LeaveBalanceTab` was built around balances only — late/UT columns were never added. Manhour reference: appears only as a label in an audit-sheet spec test; the feature was never implemented anywhere.
- 2.5 No-work/Daily-manpower: RESOLVED 2026-08-24 (chain Stage 1) — both tabs wired into the workforce registry; root cause was a lost route-mount during an earlier refactor.

## Module 3 — Leave & Disciplinary Management

| # | Spec item | Status | Evidence |
|---|---|---|---|
| 3.1 | Leave conversion, annual leave credit uploads | PARTIAL | UI option `employee/requests/pan.tsx:44` ("Leave Conversion") but `request.controller.ts:174` PAN_REQUEST_TYPES **excludes LEAVE_CONVERSION**; OT-comp-leave path exists (`approved-overtime-comp-leave.service.spec.ts`); **no bulk annual-credit upload endpoint** |
| 3.2 | Disciplinary action monitoring, late attendance tracking | PARTIAL | `admin/disciplinary-action.tsx:48-49` is **mock UI ("replace with actual API calls")**; no `disciplinaryaction` API dir; schema relation commented (`schema.prisma:2185`). Late tracking ✅ via `tardiness-metrics.helper.ts:41` |
| 3.3 | Lists of pregnant and no-work employees | PARTIAL | No-work: `workforce-metrics.helper.ts:4` + `metrics.service.ts:2068` ✅; pregnant: import column only (`bnpi-manpower-databank-import.helper.ts:74`), no list UI/model |

**Why (gaps):**
- 3.1 Leave conversion: the UI offers a "Leave Conversion" PAN type, but the backend `PAN_REQUEST_TYPES` was never extended to accept it — request would be rejected. Annual credit bulk upload: only an OT-to-comp-leave path and seed hints exist; no upload endpoint was ever created.
- 3.2 Disciplinary: the admin page was imported as a mock template (its own comment says "replace with actual API calls"); the Prisma relation is commented out and the backend module was never generated — UI-first scaffolding that stalled.
- 3.3 Pregnant list: "pregnant" exists only as a databank import column; no employee field flag, model, or list feature was built. No-work backend exists but has no dedicated list UI.

## Module 4 — Employee Records & Lifecycle

| # | Spec item | Status | Evidence |
|---|---|---|---|
| 4.1 | Certificate of employment generation | PRESENT | `request.controller.ts:4545-4610` (COE PDF) + `generate-document.helper.ts:172`; UI `resignation-requests-template.tsx:267,763` |
| 4.2 | Organizational chart builder | PARTIAL | `OrganizationChartTab.tsx:162,1763` (view/print/fullscreen; drag = pan only); `Employee.reportToId` hierarchy — **no edit/build/save** |
| 4.3 | Monthly birthday celebrants (employees and kids) | PRESENT | `celebrations/celebrations.controller.ts:10-47` (EMPLOYEE_BIRTHDAY \| CHILD_BIRTHDAY); `celebrations/birthdays.tsx:149,340` + admin twin |
| 4.4 | PAN, regularization, exit clearance | PRESENT | PAN `PANRequestModal.tsx:99-105` + `request.controller.ts:174,1378`; regularization `hr/employee-status-changes.tsx:168,441`; exit clearance `ExitClearanceSection.tsx` + OFFBOARDING flow |
| 4.5 | TIN library, 201 filing | PARTIAL | `Employee.tin` `employee.prisma:65`; `tin_id` doc type `documents-tab.tsx:50`; **no TIN library page; no 201-filing module** (nearest: BIR 2316 + document repository) |

**Why (gaps):**
- 4.2 Org chart builder: current component renders/prints the `reportToId` tree; editing, drag-restructure, and save-back were never implemented — it is a viewer mislabeled as a builder.
- 4.5 TIN/201: TIN is a plain employee field + a document type; nobody built a library surface (search/validate/report over TINs) or a named 201-filing module — the document repository partially covers the intent.

## Module 5 — Manpower & Statutory Reports

| # | Spec item | Status | Evidence |
|---|---|---|---|
| 5.1 | Mandatory reports (SSS, Pag-ibig, PhilHealth) | PARTIAL | Contribution tables `config/payroll.config.ts:27-90`; totals `metrics.controller.ts:3325-3341,3561-3601`; UI `payroll.tsx:512-514` + `SalaryReportTab.tsx:15-51`. **No R-3/MF/RF-1 remittance-form generators** |
| 5.2 | Statutory report generator | PARTIAL | BIR 2316 only: `helper/bir-2316.generator.ts` + `report.router.ts:44` + `BIRReportTab.tsx`. No SSS/HDMF/PHIC statutory pages |
| 5.3 | Monthly manpower report (gender, age, headcount, averages) | PRESENT | `ManpowerDistributionTab.tsx` (gender `:32-41,601-653`; headcount `:197-320`; averages `:382-388` + `manpower-distribution-reference.helper.ts:137-193`; exports `:404-489`). Age brackets exist only in unmounted mock `EmployeeSummaryTab.tsx:22-55` |
| 5.4 | BNPI and agency manpower databanks, turnover rate analysis | PRESENT | Databank import `bnpi-manpower-databank-import.service.ts` + wizard `migration.tsx:9782`; split views `ManpowerDatabankSection.tsx` + `ManpowerDistributionTab.tsx:43-51,656-713`; turnover live `turnover-attrition.tsx:127-233` ↔ `metrics.controller.ts:1889-1925` |

**Why (gaps):**
- 5.1/5.2 Statutory outputs: contributions are computed as payroll totals for summary cards; actual remittance-form generators (SSS R-3, Pag-ibig MF, PhilHealth RF-1) were never built — BIR 2316 is the only true statutory generator so far.
- 5.3 Age slice: age brackets exist in a hardcoded, unmounted mock tab (`EmployeeSummaryTab`); the live Manpower Distribution tab never gained an age dimension.

## Module 6 — Training & Performance

| # | Spec item | Status | Evidence |
|---|---|---|---|
| 6.1 | Annual training plan and summary | MISSING | No Training model in `prisma/schema/*.prisma`; no module in `hris-api/app/` |
| 6.2 | Training attendance databank | MISSING | Same absence — no model/routes/service |
| 6.3 | Post-training evaluation and performance summaries | MISSING (mock-only) | `DevelopmentTab.tsx:38-120`, `OverviewTab.tsx:38`, `GoalsTab.tsx:30`, `FeedbackTab.tsx:38` — hardcoded literals, zero data calls |

**Why (gaps):**
- 6.1–6.3 The entire Training domain was never modeled — no Prisma model, no API module, no service. The visible "Development/Goals/Feedback" tabs are template scaffolding with hardcoded sample data (no `useQuery`/service calls), so they look present in UI but hold no real feature. This is the single largest spec-vs-app gap.

## Module 7 — Recruitment & Onboarding

| # | Spec item | Status | Evidence |
|---|---|---|---|
| 7.1 | Recruitment tracker and updates | PARTIAL | `RecruitmentActivity` model `applicant.prisma:100` + `applicant.router.ts:14-15` (activities feed, 7 event types); pipeline board fills tracker role — no artifact literally named "tracker" |
| 7.2 | Candidate profile screening | PARTIAL | Screening stage + reject actions `recruitment-page.tsx:2955,3585-3586`; `INITIAL_SCREENING` `types/application.ts:50`. **No scorecard/assessment engine** |
| 7.3 | Recruitment pipeline (application to onboarding) | PRESENT | Stage board `recruitment-page.tsx:941-1067` (single-step drag, signed-contract gate, progress %); hire keeps public-apply name (`applicant-hire-identity.helper.ts`); onboarding `routes/onboarding.tsx`, `hr/onboarding-setup.tsx` |

**Why (gaps):**
- 7.1 Tracker: activity updates are fully modeled (7 event types) but nothing is literally named "tracker" — the pipeline board serves that role; verdict reflects naming/scope, not missing function.
- 7.2 Screening: exists as a workflow stage with reject-at-screening actions; a dedicated scorecard/assessment engine was never built.

## Module 8 — Accounting & Compliance

| # | Spec item | Status | Evidence |
|---|---|---|---|
| 8.1 | Monthly: Terminal pay computation with BIR Form 2316, withholding tax (BIR Form 1604-C) | MIXED | **Terminal pay computation MISSING** (zero engine hits); BIR 2316 PRESENT (`bir-2316.generator.ts`, `report.router.ts:44`, UI `BIRReportTab.tsx`); withholding engine PRESENT (`tax-calculator.helper.ts:395-408` + `bir-1601c-metrics.helper.ts`); **BIR 1604-C generator MISSING** (zero `1604` code hits) |
| 8.2 | Annual: Alphabetical list of employees with BIR documents, BIR Form 1604-CF, BIR Form 2316 | MISSING | No alphalist report anywhere; **no 1604-CF generator/endpoint**; 2316 exists per 8.1 |

**Why (gaps):**
- 8.1 Terminal pay: no computation engine exists — only incidental comments and the `finalPayCalculated` flag; the monthly compliance form 1604-C has zero code hits (1601-C *metrics* exist, but that is a different form).
- 8.2 Annual compliance outputs (alphalist, 1604-CF) were never scoped — likely because 2316 (the per-employee half) shipped first and the annual batch forms were deferred.

## Technical Requirements

| # | Spec item | Status | Evidence |
|---|---|---|---|
| T.1 | Web-based, mobile-responsive interface | PRESENT | viewport meta `public/client/index.html:5`; responsive grids `admin-layout.tsx:107`, `unified-layout.tsx:72-89`, `DataTable.tsx:384-441` |
| T.2 | Role-based access control with 2FA | PARTIAL | RBAC `middleware/verifyRole.ts:19-65` + role guards across controllers ✅; **2FA MISSING** — unwired stub `my-settings-section.tsx:7` only, zero totp/mfa in hris-api |
| T.3 | Secure data encryption and audit logging | PARTIAL | Audit ✅ `utils/activityLogger.ts`/`auditLogger.ts` + ActivityLogging module + `docs/LOGGING_STANDARDS.md` + admin UI. Encryption = biometric AES-256-GCM only (`biometric-envelope.helper.ts:23,112,150`); no field-level PII encryption; DB-at-rest/TLS NEEDS_LIVE_CHECK |
| T.4 | Integration with government APIs (SSS, Pag-ibig, PhilHealth, BIR) | MISSING | No HTTP clients to gov endpoints; only local rate tables (`SSS_CONFIG`, `pagibigRates`) + file-based PDFs — reports ≠ API integration |
| T.5 | Export formats: PDF, Excel, CSV | PRESENT | CSV `csv-export.ts:11` + server `migration.controller.ts:3741`; Excel xlsx/exceljs (`database-backup.helper.ts:574`, `specialPayroll.controller.ts:471-485`); PDF pdfkit `generate-document.helper.ts:2`; unified tri-format `report-export.ts:4` |
| T.6 | Daily automated backups with cloud redundancy | PARTIAL | Manual app-DB script `run-database-backup.ts` → `database-backup.helper.ts:416` (pg_dump, retention `:665`); **cron container daily job is an empty placeholder** (`cron.service.ts:63-71`); Grafana-PG automated+validated locally only; **no offsite/cloud copy of HRIS DB dumps** (minio-backup GCS mirror `docker-compose.yml:179-206` covers images bucket only, `MINIO_BACKUP_ENABLED=false`) |

**Why (gaps):**
- T.2 2FA: a settings toggle stub exists (`useState(true)`, no backend); no totp/mfa library or routes in hris-api — checkbox UI shipped, feature never implemented.
- T.3 Encryption: AES-256-GCM was built specifically for biometric custody; general field-level PII encryption was never added. Database-at-rest/TLS depends on infra config and was not verifiable from code alone.
- T.4 Gov APIs: only local rate tables (SSS_CONFIG, pagibigRates) and PDF outputs exist — no HTTP client to any agency endpoint was ever written; "reports" satisfy the letter of outputs, not integration.
- T.6 Backups: the app-DB backup is a manual script; the cron container's daily job is placeholder example code that was never wired; the only offsite mirror is disabled by default and covers the images bucket, not database dumps.

## Completion rate

**Scoring:** PRESENT = 1.0 · PARTIAL = 0.5 · MISSING = 0

| Measure | Result |
|---|---|
| Fully present | **14/36 = 39%** |
| Weighted score | (14 + 15×0.5) / 36 = 21.5/36 = **~60%** |
| Missing outright | 7/36 = 19% |

### Per-module rates (updated 2026-08-24 after Stages 1–2)

| Module | Weighted | Rate |
|---|---|---|
| M2 Attendance & Timekeeping | 4.5/5 | 90% |
| M4 Employee Records & Lifecycle | 4.0/5 | 80% |
| M5 Manpower & Statutory Reports | 3.0/4 | 75% |
| M7 Recruitment & Onboarding | 2.0/3 | 67% |
| M1 Payroll & Compensation | 4.0/5 | 80% |
| Technical Requirements | 3.5/6 | 58% |
| M3 Leave & Disciplinary Management | 1.5/3 | 50% |
| M8 Accounting & Compliance | 0.5/2 | 25% |
| M6 Training & Performance | 0.0/3 | 0% |

**Honesty caveat:** PARTIAL = 0.5 is blunt; the true weighted range is roughly **50–62%**. Item 2.5 (orphaned tabs) is ~90% done while 6.3 (mock-only tabs) is ~10%. Weighted by build effort rather than item count, the overall rate drops slightly — the MISSING items (Training module, gov APIs, terminal pay/annual BIR forms) are large builds while many PARTIALs are small wiring jobs.

## Top gaps (recommended next-work order)

1. **Training & Performance module** — entirely absent (model, API, UI)
2. **Government API integrations** — absent; file-based reports only
3. **2FA** — stub only
4. **Terminal pay computation + BIR 1604-C / 1604-CF + annual alphalist** — compliance-critical, absent
5. **Disciplinary action backend** — UI is a mock with zero API/model
6. **Labor cost analysis + Agency/Direct OT split + Assembly Standing allowance** — payroll reporting gaps
7. **Leave conversion backend + annual credit bulk upload** — UI exists, backend refuses
8. **Quick win:** wire the two orphaned built tabs (`NoWorkReportTab`, `DailyManpowerTab`) into `/hr/reports/workforce`
9. **Backup automation** — wire the empty cron placeholder + offsite copy of HRIS DB dumps
10. **Last pay computation engine** — flag-only today
