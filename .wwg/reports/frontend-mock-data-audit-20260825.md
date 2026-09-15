# Frontend Mock-Data Audit — bnpi-pats-app (2026-08-25)

Task: find pages that use mock data. Scope: `bnpi-pats-app` only (`emp-app` submodule not checked out locally).
Method: full route inventory from `bnpi-pats-app/app/routes.ts` (registered URLs), then `git grep` sweeps for mock module imports, `MOCK_*`/`mock[A-Z]` identifiers, `Math.random` data generation, and "sample/dummy/fake/hardcoded" markers; every hit opened and read in context before classification.

## Verdict summary

| Class | Count | Items |
|---|---|---|
| LIVE page — full mock | 2 | `/time-logging`, `/employee/benefits` |
| LIVE page — partial / fallback mock | 3 | `/calendar`, `/hr/dashboard`, `/hr/announcements` |
| LIVE dev-tool routes with mock | 2 | `/pdf-mapper`, `/pdf-generator-demo` |
| Production path importing a "mock" module (real data) | 1 | BIR 2316 PDF download chain |
| Orphaned dead code containing mocks | 8 files | see table below |

## A. Live registered pages using mock data

### A1. `/time-logging` — FULL MOCK
- File: `bnpi-pats-app/app/routes/time-logging.tsx` (routes.ts:209)
- Evidence: line 22 `const MOCK_USERS = [...]` (John Doe / Jane Smith / Sarah Johnson, fake faceId/QR); lines 195, 299 clock events picked via `Math.random()`.
- Guarded by `TimeLoggingGuard`; no other file links to it — reachable by URL only.

### A2. `/employee/benefits` — FULL MOCK
- File: `bnpi-pats-app/app/routes/employee/benefits.tsx` (routes.ts:103)
- Evidence: line 5 `const MOCK_PRODUCTS = [...]` — 6 hardcoded Bandai products, `placehold.co` images, ratings/reviews invented; no service/API call anywhere in the 251-line page.

### A3. `/calendar` — PARTIAL MOCK (leave layer)
- File: `bnpi-pats-app/app/routes/calendar.tsx` (routes.ts:232)
- Evidence: line 57 `mockLeaveData` = 2 hardcoded leaves ("Vacation Leave" Jan 2026, "Sick Leave" Feb 2026); line 467 `leavesByDate` built ONLY from this mock.
- `/employee/leave-calendar` (routes.ts:117) redirects here with `type=leave`, inheriting the mock.

### A4. `/hr/dashboard` — PARTIAL MOCK
- File: `bnpi-pats-app/app/routes/hr/dashboard.tsx` (routes.ts:139)
- Evidence: line 275 `// Sample data for company news` → hardcoded "Holiday Party Announcement", "New Benefits Program Starting January 2024", etc. Page has essentially one real query/service touch total.

### A5. `/hr/announcements` — FALLBACK MOCK (dishonest empty state risk)
- File: `bnpi-pats-app/app/routes/hr/announcements.tsx`
- Real API first: `announcementsService.list()` (line 327-330). But lines 332-342: when the list is empty it renders 23 generated `Quarterly Update N` rows (`// Mock data fallback for demo`). An empty real workspace looks fully populated.

## B. Live dev-tool routes (registered, low priority)

- `/pdf-mapper` → `routes/pdf-mapper.tsx` + `components/PdfFieldMapper.tsx` — BIR 2316 field-mapping tool on bundled `assets/forms/2316 Sep 2021 ENCS_Final_corrected.pdf`, renders `getMockBIR2316Data()` (bir-2316-mock-data.ts:118). Internal tooling; mock by design.
- `/pdf-generator-demo` → `routes/pdf-generator-demo.tsx` — demo route with example `FieldMapping[]`.

## C. Production path importing a file named "mock" — NOT a data defect

BIR 2316 document download: `components/molecules/RequestReviewModal.tsx`, `templates/hr/requests/document-requests-template.tsx`, `templates/hr/requests/tickets-template.tsx`, `templates/requests/document-template.tsx`, `routes/employee/approvals*` → `lib/document-request-handler.ts` → `lib/generate-bir2316-pdf.ts`.
- `document-request-handler.ts` fetches REAL employee fields via `employeesService.select(BIR_2316_EMPLOYEE_FIELDS)` and passes them into `mapFieldNameToData(field, data)`.
- `lib/bir-2316-mock-data.ts` supplies mapping/format helpers plus `getMockBIR2316Data()` used only by `/pdf-mapper`. Production PDFs use real employee data. Module name is misleading; rename candidate, not a correctness bug.

## D. Orphaned dead code containing mocks (zero importers, not in routes.ts)

| File | Mock content |
|---|---|
| `routes/hr/approvals/AccessComplianceTab.tsx` | 4 hardcoded access requests (ACCESS001-004, dated 2024) |
| `routes/hr/approvals/CompensationBenefitsTab.tsx` | hardcoded salary-adjustment requests |
| `routes/hr/approvals/EmployeeLifecycleTab.tsx` | hardcoded onboarding/offboarding requests |
| `routes/employee/team/TeamAttendanceTab.tsx` | fetches REAL team roster (`useEmployees`) then fabricates present/leave/OT/approver metrics via `Math.random` (lines 130-168) |
| `routes/employee/attendance-approval.$employeeId.tsx` | whole approval flow on `setTimeout` + sample EMP001-004 records (line 36+) |
| `routes/hr-public/interview-scheduling-page.tsx` | mock interview details/dates + simulated confirm with random failure (line 57) |
| `components/molecules/shared/ScannerInterface.tsx` | fake recognition results (lines 106, 448) |
| `components/templates/my-pages/leave-calendar-template.tsx` | inline `mockLeaveData` |

Dead libs (zero importers): `app/lib/mock-data.ts` (MOCK_APPLICANTS), `app/lib/mock-soa-billings.ts` — billings migrated to real API (`useStatementOfAccounts` + `services/statement-of-account.service.ts`); old WWG docs still list the mock file as part of the billings capability (STALE).

## E. Checked and BENIGN (not page mock data)

- `attendance-management-template.tsx:279` "sample data" = CSV import-template download with example rows (intended UX).
- `Math.random()` id/uid generators in admin/rules-policies/workflows.tsx:149, admin/configuration/workflows.tsx:151, hr/settings/documents.tsx:92,192, migration.tsx:4348, boarding-template-builder.tsx:90.
- `devices.service.ts` `mockHikvisionFingerprintTally` / `mockHikvisionFaceTally` post to REAL endpoints `/api/device/hikvision/mock-fingerprint(-face)` (server-side test-injection API); currently zero UI callers found.
- `Icon.tsx:41` comment "hardcoded SVG paths" is icon art, not data.
- `dev/splash.tsx` explicitly labeled dev preview.
- `site/*`, support, legal, profile, auth routes: no mock hits.

## Recommended follow-ups (candidate RECs, Proposed)

1. REC-20260825-TIME-LOGGING-REAL-API or removal decision for `/time-logging` (full-mock live URL).
2. REC-20260825-EMPLOYEE-BENEFITS-CATALOG-API for `/employee/benefits`.
3. REC-20260825-CALENDAR-REAL-LEAVES — wire `leavesByDate` to leave service instead of `mockLeaveData`.
4. REC-20260825-ANNOUNCEMENTS-HONEST-EMPTY — replace mock fallback with empty state.
5. REC-20260825-MOCK-DEAD-CODE-PURGE — delete/decide the 8 orphaned files + 2 dead libs (TeamAttendanceTab's fabricated KPIs are a trap if ever re-mounted).
6. REC-20260825-BIR2316-MODULE-RENAME — split helpers out of `bir-2316-mock-data.ts`.
7. HR dashboard company-news source decision.

No code changed in this task (audit-only). emp-app audit pending submodule checkout.

## F. Completeness method

- Registered URLs come from `bnpi-pats-app/app/routes.ts` (React Router v7 config, read in full) — file-path-to-URL claims in this report are from that file, not guessed.
- Sweeps run over all of `bnpi-pats-app/app` excluding `*.test.*`: (1) mock module import paths; (2) identifiers `\bMOCK_[A-Z]` and `\bmock[A-Z][A-Za-z]*\b`; (3) `Math.random`; (4) case-insensitive markers `hard-coded|dummy data|fake data|sample data|placeholder data`.
- A final full-app identifier rescan re-confirmed the hit list (17 files incl. the mock modules themselves). Lowercase-comment-only mock code without mock-style identifiers was caught separately via the Math.random and marker sweeps (e.g. `TeamAttendanceTab`, `attendance-management-template`).
- Cross-check against `.wwg/governance/recommendation-registry.md`: REC-20260818-DISCIPLINARY-LIVE-API named `/admin/disciplinary-action` as in-memory `mockRules`; current develop uses real `disciplinaryActionService.list/create/update/remove` — that page is clean today and the old registry row can be promoted to Implemented by its owner.
- Known blind spots: runtime-only mock injection (e.g. MSW/service worker) not present; `emp-app` submodule absent; non-TS assets (storybook stories under `.storybook/`) not audited.

## G. Operator review checklist (work through later)

Priority order = operator-facing dishonesty first.

- [ ] P1 `/hr/announcements` — remove 23-row fake fallback; show honest empty state (`hr/announcements.tsx:332`)
- [ ] P1 `/calendar` — wire `leavesByDate` to leave service; delete `mockLeaveData` (`routes/calendar.tsx:57,467`)
- [ ] P2 `/employee/benefits` — decide product-catalog API vs keep-static-with-label (`employee/benefits.tsx:5`)
- [ ] P2 `/time-logging` — decide real API vs route removal; it is a live full-mock URL (`time-logging.tsx:22`)
- [ ] P2 `/hr/dashboard` — company-news source decision (`hr/dashboard.tsx:275`)
- [ ] P3 purge dead code: hr/approvals/*Tab x3, TeamAttendanceTab, attendance-approval.$employeeId, interview-scheduling-page, ScannerInterface, leave-calendar-template
- [ ] P3 delete dead libs `app/lib/mock-data.ts`, `app/lib/mock-soa-billings.ts`
- [ ] P3 rename/split `bir-2316-mock-data.ts` helpers out of the "mock" module
- [ ] P3 decide fate of dev routes `/pdf-mapper`, `/pdf-generator-demo` (gate behind env/dev-only?)

## H. Re-verification commands (copy-paste later)

```powershell
# All files still carrying mock-style identifiers (expect only the modules/tools you decided to keep)
git grep -n -E "\bMOCK_[A-Z]|\bmock[A-Z][A-Za-z]*\b" -- "bnpi-pats-app/app" ":!*test*"

# Fabricated/random data generators on live pages
git grep -n "Math.random" -- "bnpi-pats-app/app/routes" ":!*test*"

# Confirm dead-code candidates are still unimported (expect no output per file name)
git grep -rln "TeamAttendanceTab" -- "bnpi-pats-app/app"
git grep -rln "ScannerInterface" -- "bnpi-pats-app/app"
git grep -rn "mockLeaveData" -- "bnpi-pats-app/app/routes/calendar.tsx"

# Confirm billings stays on real API (expect useStatementOfAccounts hits)
git grep -n "useStatementOfAccounts" -- "bnpi-pats-app/app/components/templates/common/billings-template.tsx"
```

Each fix should end with: identifier grep for that file returns nothing (or only intended dev-tool mocks), page browser-checked against live API, and this report's checklist box ticked with the commit SHA.
