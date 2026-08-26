# AGENT PROMPT — Spec Gap Remediation Chain: Modules 1–5

> Source checklist: `docs/00-product/HRIS_KEY_MODULES_FUNCTIONAL_SCOPE_CHECKLIST.md`
> (audit 2026-08-24: 12 PRESENT / 17 PARTIAL / 7 MISSING, ~57% weighted).
> Mission: close the PARTIAL/MISSING gaps for **Modules 1–5 only**, in staged chains,
> with tests + evidence per stage. Modules 6–8 and Technical Requirements are OUT OF SCOPE.

## Global rules (apply to every stage)

1. **NO PUSH.** Commit locally per stage on `feature/spec-gap-remediation`. Push only when the operator explicitly says so.
2. Read before coding: `.wwg/wiki/project-truth-summary.md`, `.wwg/wiki/terminology.md`, this file, the checklist row you are closing, and the target source files.
3. Follow repo standards: `DESIGN.md` (full-height tables + `containedScroll`, count-only column fetches, SHE modals, toasts have NO close button), `docs/LOGGING_STANDARDS.md` (`logActivity` on success, `logAudit` on CUD), admin surfaces = `hris-admin` actor.
4. New Prisma models: use the generator workflow (`npx msa-generate --<model>`, `npx zod-generate --<model>`, `npm run prisma-generate`) before hand-editing scaffolding. Schema SQL apply on shared DB is a separate explicit step — do not run destructive DB ops.
5. Meaningful tests per stage (mocha/tsx for API, vitest for app). No stage closes with failing or skipped tests without a documented reason.
6. Evidence per stage: `.runtime/spec-gap-m1-5/stage-<N>-<name>/` with API proof JSON (Real Endpoint Dry-Run rule: `execute=false`/preview first) and test output.
7. Dual-app parity: these are HR/admin surfaces — state `HR-only (no emp counterpart)` in each close report.
8. Truth-sync at chain end: update the checklist statuses (PARTIAL→PRESENT etc.), add a workspace addendum + handoff entry. Do not rewrite audit history — annotate.
9. STOP and ask the operator at any `DECISION GATE` marker below instead of guessing product truth.

---

## STAGE 0 — Discovery & decision gates (read-only, no code)

Goal: resolve the three unknowns that block later stages. Produce a short findings note in `.runtime/spec-gap-m1-5/stage-0-discovery/FINDINGS.md`.

1. **"Assembly Standing" allowance (M1.2):** search BNPI mass-upload files/codes, `benefitTypeSeeder.ts`, payroll register fields for any variant (AssemblyStanding, ASSEMBLY_STANDING, "Assembly St.", AS). If found under another name → map it and record canonical code. If truly absent → DECISION GATE: ask operator whether to create the benefit type + register field, and under which code.
2. **"Manhour reference" (M2.4):** the term appears only in an audit-sheet label. DECISION GATE: ask operator what it should show (per-employee manhours per cutoff? department manhour totals? rate reference table?). Do not invent.
3. **Statutory remittance formats (M5.1):** confirm with operator which formats are required first (SSS R-3, Pag-ibig MF, PhilHealth RF-1 — xlsx? pdf? gov portal CSV?) and which agency to start with.

Exit gate: FINDINGS.md written; unanswered gates listed as explicit operator questions.

---

## STAGE 1 — Quick win: wire the orphaned workforce tabs (M2.5)

Target: `NoWorkReportTab.tsx` and `DailyManpowerTab.tsx` are fully built (hooks `useMetrics.ts:776,788`, APIs `metrics.controller.ts:1708,:1743`) but mounted nowhere.

- Mount both into `/hr/reports/workforce` tabs registry (`routes/hr/reports/workforce.tsx`) alongside labor/direct-indirect/agency.
- Verify each tab renders live data against the existing APIs (no new backend work expected).
- Tests: extend the workforce tabs route test (mirroring `hr-workforce-direct-indirect.spec.ts` pattern) to assert both tabs render.
- Exit gate: both tabs reachable in browser build, vitest green, screenshot/evidence JSON saved.

## STAGE 2 — OT summary with Agency/Direct split (M1.5)

- Extend `overtimeMetrics` (`metrics.controller.ts:1668`, `helper/overtime-metrics.helper.ts`) to join `Employee.workforceSource` and expose `direct` / `agency` groupings (hours + count), plus an optional `workforceSource` filter.
- Extend `OvertimeTab.tsx` with a Direct/Agency segmented filter (default: All) and two summary chips; keep existing filters intact.
- Follow count-only fetch standard for any aggregate columns.
- Tests: API metrics contract for the new grouping; app tab test for filter render.
- Exit gate: API returns split totals; tab shows them; evidence JSON captured.

## STAGE 3 — Assembly Standing allowance + employee loan application (M1.2)

- If Stage 0 confirmed a name mapping: wire it (seed/benefit type + register field + mass-upload code mapping). If operator approved creating it: add `assemblyStanding` register field mirroring `lineLeaderAllowance` (`employeepayroll.prisma:124` pattern) + seeder entry + payroll UI cell + mass-upload code (coordinate code with operator, e.g. `ASA`).
- Build employee-facing **BNPI salary loan application** flow: request-type or dedicated form (choose the lighter existing pattern — PAN-style request vs dedicated route; state choice in stage notes), listing loan types (`admin/configuration/loan-types.tsx` data), creating `EmployeeLoan` PENDING rows via existing `employeeLoan.router.ts:311` create API. HR approval path = existing loan status flow; do not invent a new approval engine.
- Tests: API create/validate contract + UI form test.
- Exit gate: employee can submit a loan application; HR can see it; register field (if approved) flows through payroll generate.

## STAGE 4 — Labor cost analysis report (M1.4)

- New metrics case `laborCostAnalysis` in `metrics.controller.ts` (pattern: `directIndirectLaborSummary` at `:1821`): per department (and optional cutoff range), sum gross/basic + allowances + OT from `EmployeePayroll` register rows, split by `workforceSource` DIRECT/AGENCY, with headcount beside cost.
- UI: new Workforce tab `Labor Cost` (`/hr/reports/workforce?tab=labor-cost`) using AdminTablePageShell + containedScroll + count-only fetches; PDF/XLSX export via existing `report-export` tri-format helper.
- Tests: metrics helper unit test (rate math), route render test.
- Exit gate: report renders with real register data; exports work.

## STAGE 5 — Leave tardiness/UT columns + manhour reference (M2.4)

- Leave tardiness/UT: extend `leaveBalanceMetrics` (`metrics.controller.ts:2430`) + `LeaveBalanceTab.tsx` with per-employee late-minutes / UT-hours **during approved leave-adjacent days** only if operator confirmed the definition at Stage 0; otherwise implement as columns joining existing `tardinessMetrics` filtered to employees-with-leave-balance rows (state interpretation in notes).
- Manhour reference: implement exactly what the Stage 0 DECISION GATE answer specifies. If unanswered, SKIP and leave the checklist row PARTIAL with a note — do not guess.
- Tests: metrics contract + tab column test.
- Exit gate: columns render with real data; manhour row either implemented per answer or explicitly deferred with operator question recorded.

## STAGE 6 — Leave conversion backend + annual credit upload (M3.1)

- Add `LEAVE_CONVERSION` to `PAN_REQUEST_TYPES` (`request.controller.ts:174`) with a conversion payload (leave type → days → cash-equivalent flag), reusing the PAN request/approval pipeline; HR approval converts credits (decrement `leaveBalances` JSON on Employee, log audit).
- Annual leave credit upload: admin bulk endpoint (xlsx/csv via existing mass-upload patterns, e.g. `bnpi-mass-upload-import.helper.ts` style) that sets per-employee annual leave credits for a year, with dry-run default (`execute=false`), row-level errors, and an import log (mirror `MassUploadImportLog` pattern). UI: button on the existing leave/admin leave surfaces.
- Tests: conversion apply contract (incl. insufficient-balance rejection), upload parser + summary spec (dry-run + execute), UI modal test.
- Exit gate: dry-run then real upload of a small sample file proven; conversion request completes end-to-end.

## STAGE 7 — Disciplinary action backend + wire the mock UI (M3.2)

- New Prisma model `DisciplinaryAction` (employee, offense type/date, description, severity, status, attachment document ref, created by) — generator workflow; uncomment/repair the schema relation (`schema.prisma:2185`).
- API module `app/disciplinaryaction/` (router/controller/zod): CRUD + list with filters (employee, date range, status), org-scoped, `logActivity`/`logAudit`.
- Replace the mock rules in `admin/disciplinary-action.tsx:48-49` with real data (keep the existing page structure; follow DESIGN.md table standards).
- Late-attendance linkage: read-only display of recent tardiness counts per employee on the action form (reuse `tardinessMetrics`), no auto-creation.
- Tests: API CRUD contract + page render test against mocked service.
- Exit gate: create/list disciplinary actions works end-to-end; mock comment removed.

## STAGE 8 — Pregnant employees list + no-work list UI (M3.3)

- Add `pregnant` (or `expectedDueDate`, operator's choice — DECISION GATE if unclear; default: boolean `pregnant` + optional due date) to Employee with a small admin edit affordance, plus list UI (filter chip on the existing no-work/daily-manpower surface or a dedicated tab under workforce reports).
- No-work list UI: covered by Stage 1 tab; cross-link it here (checklist note only if already satisfied).
- Tests: schema/migration contract, list filter test.
- Exit gate: pregnant list renders from real data; privacy note: restrict visibility to `hris-admin`/HR roles.

## STAGE 9 — Org chart builder (M4.2)

- Extend `OrganizationChartTab.tsx` with an HR-only **edit mode**: reassign a node's manager via `Employee.reportToId` (search-select picker), with cycle prevention (cannot report to own descendant), bulk print/export unchanged.
- API: minimal `PATCH /api/employee/:id/report-to` (org-scoped, audit-logged) unless an equivalent update endpoint already exists — reuse if present.
- Tests: cycle-prevention contract + PATCH contract + edit-mode render test.
- Exit gate: HR can restructure the chart in the browser and the change persists.

## STAGE 10 — TIN library (+ 201 filing boundary) (M4.5)

- TIN library: admin page listing employees' TIN (from `Employee.tin`) with search, missing-TIN filter, duplicate-TIN detection, and CSV export. Read-only over existing data + compliance script reuse (`scripts/employee-compliance-metrics.ts`).
- 201 filing: DECISION GATE — confirm scope with operator (likely: a "201 file" document checklist view per employee using existing `tin_id`/documents repository). Implement only the confirmed slice; default proposal: per-employee 201 document checklist tab (required docs vs uploaded), no new doc types unless approved.
- Tests: duplicate/missing detection contract; page render test.
- Exit gate: TIN library live; 201 slice per operator answer or explicitly deferred.

## STAGE 11 — Statutory remittance generators + manpower age slice (M5.1–5.3)

- Build the Stage 0-confirmed remittance generator FIRST (suggested order: PhilHealth RF-1 → SSS R-3 → Pag-ibig MF), sourcing contribution data from existing payroll aggregates (`metrics.controller.ts:3325-3601`, `payroll.config.ts:27-90`), output xlsx via `exceljs` (+pdf if required), endpoint under `report.router.ts` pattern, UI button on `SalaryReportTab`/`BIRReportTab` area.
- Age slice: add age brackets to `ManpowerDistributionTab` (compute from birthdate at query time; drop the unmounted `EmployeeSummaryTab` mock or leave untouched — do not ship hardcoded data).
- Tests: generator unit tests against fixture contribution data; tab column test.
- Exit gate: at least one remittance form downloads with real-period data; age columns render.

---

## CHAIN CLOSE-OUT (after final stage)

1. Run full focused suites: API mocha specs touched + app vitest suites touched; fix or document any red.
2. Update `HRIS_KEY_MODULES_FUNCTIONAL_SCOPE_CHECKLIST.md`: flip closed rows to PRESENT (keep evidence paths, add stage references); recompute the completion-rate table.
3. WWG close gate: workspace addendum + handoff entry (+ terminology rows only if new canonical terms emerged, e.g., manhour reference definition).
4. Recommit checklist + truth surfaces. **NO PUSH** — present the operator a stage-by-stage summary with evidence paths and wait for the push order.
