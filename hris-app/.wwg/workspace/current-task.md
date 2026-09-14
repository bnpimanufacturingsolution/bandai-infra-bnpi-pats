## Latest Task Addendum - 2026-09-14 Onboarding panel: section rows render without checkbox

- Follows the backend "no responsible = section" gate rule (root current-task 2026-09-14 addendum): `onboarding-checklist-panel.tsx` renders PENDING no-department rows as plain section rows with BLANK Responsible/Completed cells — no checkbox for any role (server `canSign` is now false for them, single source) and per the same-day operator follow-up no "unassigned" label and no "—" placeholder; historically signed section rows keep the completed indicator + manager unsign. Department-view footer copy now says unassigned rows are sections, not counted.
- Tests: onboarding-checklist-panel vitest replaced the old "disabled context tooltip" case with the no-checkbox/section-hint contract (onboarding vitest 31 green); Playwright `onboarding-list-tab-live-proof.spec.ts` updated (`sign item 6` must have count 0) and re-passed live after a DEV e2e-signer fixture repair (bare `employee` role -> /403; restored `hris-employee` + SW-Dev; REC filed). Single-app exception (no hris-emp-app counterpart). tsc/eslint delta 0.

## Latest Task Addendum - 2026-09-14 Job display-code badges (Recruitment board + Manage Jobs)

- Operator design: frontend-only opening identifier rendered as `<Badge variant="outline" data-testid="job-display-code">`. Same-day follow-up switched the prefix from derived initials to the canonical **`Position.code`** (added `position.code` to both job-query `fields` strings; `job.zod` PositionSchema gained optional `code`; Job Details `useJob()` is unfields = full doc) with initials (multi-word max 3, single word first two letters, `JOB`) ONLY as fallback for missing/unusable codes; sample `SE-01182026` now `OPR-08252026`-style + createdAt MMDDYYYY, same code+day collisions ordered `-2`/`-3`. Helper `app/lib/utils/recruitment-job-code.ts` (10-case test); section header covers Kanban AND Table; badge also in Manage Jobs Position column + Job Details header. Confirmed no-UI-bug: level-less labels were already guarded (probe-script artifact) - now pinned by the smoke assertion; no dangling " - " exists.
- Proof: vitest helper 10/10; Playwright smoke green 53.4s (initials design, `-2` dedupe) then re-run 32.0s after the switch - all 11 DOM badges equal canonical map (`OPR-08252026`, `17-08252026`, `23-07162026/23-07022026/23-06102026`, etc.; no suffix needed on live data); Manage Jobs badges asserted; screenshots 01b/05 in `.runtime/recruitment-filter-proof/`. eslint/tsc delta 0 vs HEAD baseline (tsc required + got `code` added to job.zod PositionSchema). HR-only (no hris-emp-app counterpart); uncommitted, unpushed.

## Latest Task Addendum - 2026-09-13 Recruitment candidates filter live-proof spec (frontend test only; fix was backend)

- Operator-reported "filter bug" on `/hr/recruitment` (Candidates) confirmed: root cause was in hris-api (ambiguous `job` relation name silently dropping `job.*` selects -> grouped response keyed everything `unassigned` -> every job kanban/table section empty + search appearing broken). No hris-app code change needed; added regression proof `tests/smoke/recruitment-candidates-filter-live-proof.spec.ts` (run via `PLAYWRIGHT_BASE_URL=http://localhost:5177 npx playwright test -c playwright.smoke.config.ts tests/smoke/recruitment-candidates-filter-live-proof.spec.ts`, PASSED 27.8s): asserts grouped API has no `unassigned`, opens the target job section ("Entry - Operator", Angela Garcia/Andrea Ramos/Gabriel Berja), narrows by first name in Kanban AND Table, nonsense query -> empty section / "No applicants in this workflow yet." Evidence `.runtime/recruitment-filter-proof/` (4 screenshots + api-grouped-proof.json + browser-proof-summary.json). Details in root + hris-api current-task 2026-09-13 addenda. Uncommitted, unpushed.

## Latest Task Addendum - 2026-09-12 Onboarding list pagination + SearchableSelect dept filter

- `hr-onboarding-page.tsx`: server-paginated 10/page with pager footer ("Showing X–Y of Z onboarding employees", "Page n / m", aria-labelled Prev/Next disabled at bounds, filters reset page to 1); department filter swapped from native `<select>` to shared `SearchableSelect` (options from `useDepartments({limit:100})`, prepended `{value:"",label:"All departments"}`). `searchable-select.tsx` gained an optional `triggerAriaLabel` prop (additive; existing callers untouched). Service/hook carry `page` param + `pagination` type. Caught+fixed `rangeStart` precedence bug via new vitest (page tests 5→8; onboarding-related 41/41). Playwright list spec asserts 10-row page/pagination/pager + `test.slow()` for DEV slow-spikes; 3/3 smokes live green. Uncommitted per operator.

## Latest Task Addendum - 2026-09-13 Onboarding list → shared DataTable (ellipsis pager) + skeletons

- `hr-onboarding-page.tsx` now renders through `DataTable` (numbered pager with `…` windowing, "Showing X to Y of Z results", skeleton `loadingRows` — parity with all other admin/HR lists), wiring `searchValue/onSearch` (debounce kept), `customFilters` = department `SearchableSelect`, server `currentPage/totalItems/totalPages/itemsPerPage/onPageChange` against the existing 10/page roster contract; row-click panel + Open Profile preserved. `onboarding-checklist-panel.tsx` loading states are `Skeleton` blocks now. Selector gotcha documented: rows are role=button with duplicates — use exact name + visible=true. vitest 40 (page 10 cases incl. ellipsis windowing + skeletons), Playwright 3/3 live. Uncommitted.

## Latest Task Addendum - 2026-09-12 Onboarding employees list + profile tab + sign modal (live-proven)

- `/hr/onboarding` (`routes/hr/onboarding.tsx` + `hr-onboarding-page.tsx`): searchable/filterable ONBOARDING-employee list for ALL roles (server `?search`/`?departmentId` now wired); row click mounts shared `onboarding-checklist-panel.tsx` inline; Open Profile → `/employee/<id>?tab=onboarding&from=hr-onboarding` (Back returns).
- `employee.$id.tsx`: Onboarding tab ONLY when `employmentStatus === "ONBOARDING"`, renders the same panel (legacy boarding tab untouched).
- Panel: composes existing endpoints to resolve the instance (admin/HR list-checklists, else roster-by-number), `.../visible` tree with disabled context/non-dept rows, progress, admin/HR provision CTA, unsign for admin/HR; **sign modal** = short instruction + password + optional remarks, inline 401 error kept open. `retry:false` on all onboarding mutations (default retries delayed error display ~3s and nearly timed out the live test).
- Nav: Recruitment submenu "Onboarding" (HR), General "Onboarding" (non-HR employees), admin nav "Onboarding Employees" → `/hr/onboarding`.
- Tests: vitest 38/38 across 8 files; new `onboarding-list-tab-live-proof.spec.ts` with self-healing unsign prelude — 2 consecutive live passes ("Mae Banaga" server-stamped on Char Aznable 6.1, remarks + 14%). DEV fixture + signer-role observation documented in `docs/ONBOARDING_CHECKLIST.md` and REC-20260912-SIGNER-ROLE-DRIFT. Working tree only, uncommitted (operator). Dual-app: hris-app unified-layout surface; emp-app parity stays a recommendation.

## Latest Task Addendum - 2026-09-12 Onboarding follow-up batch: page-preview checklist + single-template builder + edit/delete

- **checklist.tsx rewritten** as a pure page preview of THE created checklist (single active template) via new shared `checklist-preview-table.tsx` (extracted from BuilderPreview — one source for modal + page; #/Task/Responsible/Completed/Date/Remarks-Signature, disabled checkboxes). NO roster picker/sign modal/provisioning widgets; empty state "No checklist has been built yet." + Build CTA. (v1's roster/sign UI intentionally moved off this admin page; roster/visible/sign hooks + service stay exported for the future employee surface; `mock-checklist-data.ts` now unused.)
- **builder.tsx = single-template editor:** auto-loads the FIRST created template (effect), template `<select>` + "New template…" REMOVED, button relabeled "Save" (always PUTs the same id). Sections: inline rename (Enter/Escape/blur) + DeleteConfirm delete. Items: edit via `add-item.tsx` (create+edit modes; department stays optional) + subtree delete (warns children removed). Pure helpers `updateSectionName/removeSectionById/updateItemInItems/removeItemFromItems` exported.
- Tests: vitest 19 (new `checklist.test.tsx` page contract incl. zero-combobox; builder hidden-affordance + edit/delete UI tests; pure helpers; tree payload) — all passing; eslint 0 errors on touched files; tsc delta 0. Playwright smoke rewritten + 2/2 live PASSED (page renders the real "Standard Onboarding Checklist" preview; builder auto-loads it, selector absent). Single-app exception (admin/HR configuration surface). Branch `feature/onboarding-checklist-signature`, not pushed.

## Latest Task Addendum - 2026-09-12: Live onboarding checklist + template builder against /api/onboarding

`app/components/organisms/onboarding/checklist.tsx` rewritten to LIVE data: onboarding-employee roster picker (`GET /api/onboarding/employees`), department-filtered tree (`GET /checklists/:id/visible` with per-item `canSign`/`isContextOnly`), password sign modal (no relogin) → `POST /items/:id/sign`, admin/HR unsign, and an admin/HR empty-state "Create Checklist from template" panel. The original mock table remains as a labelled demo fallback ONLY when the roster endpoint errors (coexist per operator). `builder.tsx` now loads existing templates, edits the template name, and Save-all via `POST /api/onboarding/templates` + `PUT /templates/:id/tree` (sections, nested items ≤3 deep, optional responsible-department picker). New `onboarding.service.ts`, `useOnboarding.ts` hooks, `app/zod/onboarding.ts` types. Fixed pre-existing red `builder.test.tsx` href pin (actual route `/admin/configuration/onboarding/checklist`) and a TS5097 `.tsx` import extension in `routes/admin/onboarding/builder.tsx`. Vitest onboarding suite 9 passing (incl. new tree-payload round-trip + service contract); Playwright `tests/smoke/admin-onboarding-checklist-live-proof.spec.ts` 2/2 PASSED live (screenshots in root `.runtime/onboarding-module-proof-20260912-*/`). Single-app exception: admin/HR configuration surface, no hris-emp-app counterpart. Not pushed.

# Current Task

## Latest Task Addendum - 2026-09-14: Agency workspace mirrors the Agency Daily Report pack (overview summary + report detail)

- **Source:** operator folder `Agency Daily Report/` (7 agencies × 6-file pack: Manpower Databank, Time Entries, Daily Absentee Report, Attendance Summary, Daily Inactive Agency Operators, Disciplinary Action Databank). Audited CGSI set for columns (`dump` evidence via local xlsx read, not committed).
- **Overview (`routes/agency/dashboard.tsx`) = summary:** new `Absent (14d)` card (ABSENT rows in window) + `Inactive operators` card (all-status roster minus `ACTIVE/ONBOARDING/ON_LEAVE` via new `isActiveAgencyMember` in `agency-shared.tsx`). Agency scope (`agencyId` match, no status restriction — proven in `hris-api/helper/agency-scope.helper.ts`) returns inactive members too.
- **Reports (`routes/agency/reports.tsx`) = detail:** new Time Entries table (date/code/name/time in-out/status), Daily Absentee table (absent rows), Manpower databank table (code/name/dept/section/status, section falls back to —), Inactive operators table; each capped at first 100 rows with honest totals. Export workbook gains Time entries, Absentee, Inactive sheets (Roster sheet gains Section column).
- **Boundary:** DA databank omitted — `GET /api/disciplinaryAction` has no agency filter (single-`employeeId` only); filed REC-20260914-AGENCY-DA-DATABANK-NO-SCOPE (Proposed). Absence reasons/DA status from the xlsx have no HRIS field and are not invented.
- **Proof:** contract spec 7/7, eslint 0 errors, live browser probe (agency-test) PASSED — overview cards + all 4 report tables visible, screenshots `.runtime/agency-pack-proof/`. TEST-agency data is thin (zeros are honest, not stubs). Not pushed.
- **Dual-app:** single-app exception (no emp-app agency counterpart).

## Latest Task Addendum - 2026-09-09: HR direct timesheet edit on APPROVED sheets (TimesheetViewModal)

- **Operator request:** HR must be able to update employee timesheets directly. All 2,235 sheets on the current period are APPROVED ("Payroll Ready"), and APPROVED sheets were previously read-only for everyone — the HR page's view modal had no save path at all.
- **Shipped in `app/components/organisms/TimesheetViewModal.tsx`:** (a) `isHrApprovedEdit` (HR role + APPROVED + not payroll-locked) now unlocks day clicking via `canEditDays`; (b) `isHrRole` declaration moved above `canEditDays` (no duplicate); (c) built-in `useUpdateTimesheet` save — `saveHrEditedDays()` PATCHes `PATCH /api/timesheet/:id` with the **full** breakdown + `editedDayKeys` (same contract as employee resubmit; backend recomputes summaries and versions changed days), resets dirty state on success; (d) orange **HR edit mode** banner independent of `showActions` (HR page opens modal with `showActions={false}`); (e) footer **Save changes (N)** CTA shown only when HR-edited days exist.
- **Employee/manager flows unchanged:** REVISED/permission resubmit, approval mode, payroll-correction path all untouched; non-HR roles see no banner/CTA on APPROVED.
- **Tests:** `TimesheetViewModal.test.tsx` 16/16 — added HR CTA gating, HR banner, non-HR isolation; also **repaired 8 pre-existing baseline failures** (the `useTimesheets` mock lacked `useCreatePayrollCorrection`/`useTimesheetPayrollCorrections` exports; auth mock made mutable). Page `timesheets.view-modal.test.tsx` + preview-modal 8/8. Targeted ESLint: 0 new errors (1 pre-existing a11y label error at line 2693 unchanged from baseline).
- **Dual-app:** HR-only exception — `/hr/timesheets` has no emp-app counterpart and the change is HR-role-gated (`HR-only (no emp counterpart)`).
- **Docs:** `docs/00-product/HR-TIMESHEET-DIRECT-EDIT-20260909.md`. Backend counterpart: hris-api addendum 2026-09-09.
- Boundary: local workspace only (not pushed / not VM-rolled). Pre-existing a11y error + 121 api tsc errors unchanged.

## Status
done

## Summary
Operator request 2026-09-10: the quick-adjust **Payroll period must be fixed to the period HR entered from** — the dropdown sat on an empty `Select period` even though the entry period was known.

## Category
bug fix (prefill race) + small UX (period lock) / AI-agent delivery.

## Packages
- bandai-infra/hris-app
- Dual-app: **HR-only (no emp counterpart)**.

## Changes
- `quick-payroll-adjustment-modal.tsx` — new `defaultPayrollPeriodLabel` prop; period renders as locked text (`Fixed to this payroll period`) whenever the entry id is provided and resolvable (caller label, periods-list match, or list still loading); dropdown stays only for context-free entry (header bulk) or unresolvable ids. Reset effect seeds the id directly from the prop (fixes the old list-gated prefill race); a second effect keeps the latest-period fallback for the no-id flow. Footnote now says `for this period` when locked.
- `employee-benefit.service.ts` — additive `isQuickAdjustPeriodLocked` helper (unit-tested); validation/submit/result contract untouched.
- Callers pass labels: run-payroll (preview Adjust → `selectedPeriodCard` name/range) and register (`quickAdjustState.periodLabel` from the row's `payrollPeriod`).
- Backend untouched.

## Truth delta
YES — quick-adjust period is entry-fixed, not chosen, on row-level entry. One-cutoff/carrier semantics unchanged.

## Drift
LOW — modal + 2 call-site props + additive helper + tests + docs.

## Verification
- vitest: 22/22 (10 quick-adjust incl. 5 new lock cases + 5 row cases, 7 preview-modal, 5 single-row legacy).
- `tsc --noEmit` filtered to all touched files (modal, both templates, service, tests): zero diagnostics.
- Byte-level checks: no BOM, LF intact, no mojibake markers, exact tab structure on edited regions (console decoding artifacts disregarded after byte proof).
- Browser proof NEEDS_CONFIRMATION.

## Risks
- A stale entry id that matches neither caller label nor the fetched list falls back to the editable dropdown (honest, unchanged behavior).
