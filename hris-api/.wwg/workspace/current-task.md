
## Latest Task Addendum - 2026-09-13 Recruitment candidates board grouping/filter repair (model-aware Applicant field selection)

- Operator-reported "filter bug" on `/hr/recruitment` (Sidebar Recruitment -> Candidates) root-caused and fixed backend-side. Symptom: every job kanban/table section rendered empty and "Search applicants..." appeared to match nothing. Cause: `GET /api/applicant?groupBy=job` maps to group key `job.id`, but `buildFindManyQuery`/`getNestedFields` were called with no model name; `job` is an **ambiguous relation name** in the DMMF registry (`Applicant.job -> Job` vs `CredentialRecoveryTask.job -> CredentialRecoveryJob`, added by `58f487dd` credential-recovery pipeline), so the model-free resolver **silently dropped every `job.*` select**; rows lacked `job`, and `groupDataByField` (`helper/dataGrouping.ts`) bucketed all 14 candidates into `"unassigned"` (frontend only consumes the keyed groups, so job sections got `[]` and per-section client-side search looked broken).
- Fix: `app/applicant/applicant.controller.ts` now passes modelName `"Applicant"` to `buildFindManyQuery` (getAll) and `getNestedFields` (getById `fields` select). No frontend change; no schema change; read-path only.
- Tests: new `tests/applicant-grouped-job-fields.spec.ts` (6) pins both the hazard (`job.*` dropped without model) and the repair (job select kept, grouper keys by job id, `unassigned` only for jobless). Full mocha glob green on the applicant surface: 3881 passing / 9 pending; 59 failures are all **pre-existing unrelated classes** (auth-biometric-kiosk missing exports, 22 employee-benefit-schedule, device/hikvision/zkteco, hard-delete contract) and `tests/public-kiosk-feeds.contract.spec.ts` does not even parse at HEAD (esbuild `Unexpected "}"` L306) - both were true before this change and are left flagged, not fixed, here. eslint 0 issues; tsc delta 0 on touched files.
- Live proof: grouped probe returns 8 jobId-keyed groups (sizes 3+2+1+1+1+1+3+2 = 14, no `unassigned`) with `job.position.title`/`job.level.name` present; `getById?fields=...job.position.title` returns `Operator`; Playwright `hris-app/tests/smoke/recruitment-candidates-filter-live-proof.spec.ts` PASSED 27.8s (kanban section "Entry - Operator" shows Angela Garcia / Andrea Ramos / Gabriel Berja; search narrows to the matching first name; nonsense query empties the section; table view shows 3 rows, narrows the same, honest empty state). Evidence `.runtime/recruitment-filter-proof/`.
- Infra notes: the shared `tsx watch` API child was wedged (no restart on save - recurring on this host); killed only the wedged watcher child and re-spawned `tsx watch index.ts` (health green in <1 min; API :3001 back so the existing run-dev-full cloudflared quick tunnel resumed serving). Browser proof used a fresh hris-app dev on :5177 (`VITE_API_BASE_URL=http://localhost:3001/api`; :5176 is another session's hris-emp-app - untouched). Redis `cache:applicant:byId:*` entries written before the fix can serve the old reduced shape for up to 3600s TTL per exact `fields` key.
- Boundary: working tree only, uncommitted/unpushed (no operator request; shared tree still carries the concurrent onboarding session's files).

## Latest Task Addendum - 2026-09-12 Design C promotion gate (backend)

- `syncEmployeeEmploymentStatus` exported + extended: pending = legacy OR dedicated PENDING items (non-deleted rows under active checklists); sign/unsign/delete/create/provision paths in `app/onboarding/onboarding.controller.ts` fire it best-effort via `syncEmploymentForChecklist` and echo `employmentStatus` in sign/unsign responses. Employees without dedicated checklists keep pure legacy behavior. New `tests/onboarding-status-gate.spec.ts` (5) + sign integration (+2 promote/throw-safe); onboarding mocha 56, contract 685, lint/tsc clean. Live gate journey proven on DEV EMP003 + negative Hirotaka case, all artifacts cleaned/statuses restored (`.runtime/onboarding-gate-proof-*/`). Uncommitted.

## Latest Task Addendum - 2026-09-12 Onboarding roster pagination (backend, additive)

- `GET /api/onboarding/employees` now supports `?page` (default 1) + `?limit` (default **10**, max 100, non-numeric/negative clamp to defaults) and returns `pagination {total, page, limit, totalPages}` alongside `employees` (where-clause shared with count; search/departmentId semantics unchanged). +1 mocha spec (skip/take/defaults + clamp), onboarding suite 49 passing, live-verified against DEV (171 total → 18 pages; page 2 differs). Uncommitted per operator.

## Latest Task Addendum - 2026-09-12 Onboarding roster search/filters (backend, additive)

- `GET /api/onboarding/employees` accepts `?search` (multi-term AND; employee number + person first/last name via the JSON `path:["firstName"]/["lastName"] string_contains` pattern) and `?departmentId` (exact; malformed ids ignored, fail-open to unfiltered rather than 400). Powers the new `/hr/onboarding` list page (hris-app). No new endpoints; no other roster behavior changed. +2 mocha cases (whereClause assertions), onboarding suite 48 passing, eslint/tsc clean. Working tree only — uncommitted per operator.

## Latest Task Addendum - 2026-09-12 Onboarding follow-up batch: provision-all + create-on-hire hooks (backend)

- New `app/onboarding/onboardingLifecycle.helper.ts` `ensureOnboardingChecklistForEmployee()` (idempotent exists-noop; auto-resolves the single active OnboardingTemplate; deep copy parents-before-children; `requireTemplate` skip for hire hooks). `POST /checklists` runs through it and `templateId` may be omitted.
- New `POST /api/onboarding/checklists/provision-all` `{dryRun?, employeeIds?}` (admin/HR): dry-run plan first (`wouldCreate`), idempotent execute `{requested, created, skipped, failed}`; for ONBOARDING employees lacking a checklist. No UI button ships (page must stay non-employee; operator runs it when ready).
- Create-on-hire wiring (best-effort try/catch, after commit, never fails the hire): `employee.controller.ts` create Step 8.9 (ONBOARDING-gated) and `reconcileEmployeeOnboardingState` in `boarding-documents.helper.ts` (covers update transitions + import post-actions). All existing endpoints unchanged.
- Tests: `onboarding-lifecycle.spec.ts` (7) + provision-all/auto-resolve additions → onboarding suite 46 passing; 731 with app-module-contract; eslint + tsc clean. Live DEV scoped proof + rollback in `.runtime/onboarding-provision-proof-20260912-173212/`. Branch `feature/onboarding-checklist-signature`, not pushed.

## Latest Task Addendum - 2026-09-12: Dedicated /api/onboarding module (builder + department password sign-off)

New dedicated backend module `app/onboarding/` (26 routes) + `prisma/schema-postgres/onboarding.prisma` (`OnboardingTemplate/Section/Item`, `OnboardingChecklist/Section/Item`, `OnboardingSignature`). Additive `db push` to DEV 55435; generic `boardingProcess`/`checklistItem` stack untouched (offboarding unaffected). Password-as-signature `POST /items/:id/sign` bcrypt-rechecks the caller's own password (no relogin), enforces the role matrix (admin/HR sign any; dept employees sign only own-dept items; no-dept items are context/read-only for them; ONBOARDING employee never signs own checklist), stamps signee server-side, writes an audit row, and auto-advances completion %. Permission matrix + visible-tree builder live in `onboardingAccess.helper.ts`. 37 new mocha specs green (access matrix + supertest/mock-prisma sign 200/401/403/409 + CRUD guards) + existing boarding-title contracts; app-module-contract 688 green; tsc clean for touched files. Live DEV E2E create→tree→deep-copy→sign→unsign→cleanup proven in `.runtime/onboarding-module-proof-20260912-*/`. Docs: `docs/ONBOARDING_CHECKLIST.md`. Not pushed (no operator push request).

## Latest Task Addendum - 2026-09-09: HR direct breakdown edit on APPROVED timesheets

- **Operator request:** HR must be able to update employee timesheets directly — including the 2,235 APPROVED ("Payroll Ready") sheets that were previously hard-blocked (`400 Cannot update timesheet in APPROVED status`) for every non-owner actor.
- **Shipped in `update` controller (`app/timesheet/timesheet.controller.ts`):** role check hoisted above the owner/non-owner branch; HR/admin actors (`hris-admin`, `admin`, `super_admin`, `superadmin`, `hris-hr-manager`, `hris-hr-user`, `hris-timekeeper`) may now apply **breakdown-only** payloads (`breakdown` + `editedDayKeys`) to **APPROVED** sheets — status stays APPROVED. Guardrails retained: payroll-locked 409 first, SUBMITTED breakdown-only rule, leader day-labor-only guard, owner edit-permission flow untouched.
- **Audit:** `isEditAuditEligible` extended so HR APPROVED breakdown edits version changed days (CORRECTION ledger) instead of overwriting effective lines in place; `manualOnly` stays owner-scoped.
- **Tests:** new `tests/timesheet-hr-approved-edit.spec.ts` 6/6 (source-contract style, same pattern as revised-submit-persistence). Regression: revised-submit-persistence 7/7, day-labor-guard + line-version + edited-days 20/20. tsc delta 0 (121 pre-existing errors both sides, none in this file).
- **Docs:** `docs/00-product/HR-TIMESHEET-DIRECT-EDIT-20260909.md` (operator page incl. frontend behavior).
- Boundary: local workspace only (not pushed / not VM-rolled). Paid/locked sheets still require Payroll Correction by design.

## Latest Task Addendum - 2026-09-07: Section Line Leader assignment (option B)

- Shipped: SectionLineLeader M:N join + role derivation (hris-line-leader on membership, HR/manager precedence, auto re-derive on add/remove/section-delete), section CRUD lineLeaderIds reconcile, list/get lineLeaders include, employee hard-delete detach (headId + join rows).
- UI: /admin/configuration/sections Line Leaders chips + add select; table column; view row; CSV.
- Tests: section-line-leaders 15/15, role-derivation 55/55, section.controller 66/66, smoke 2/2; live round-trip incl. delete-demote re-proof; VM promoted (db-init Complete x3, table in DEV/UAT/PROD, Argo six apps Healthy, DEV :3101 serving lineLeaders).
- Known drift (pre-existing, not this work): employee-hard-delete.contract.spec.ts 4/4 static-source-string failures (strings never existed at base e5e51a43).
# Current Task

## Status
done

## Summary
Run-payroll accuracy repair (operator report 2026-09-09: progress modal showed "Processed 693 of 2206 payable" for an 851-person run) + same-day DB-flap recovery of PP-20260826-20260911 to COMPLETED 851/851. Root causes, all proven live: (1) completion-block run totals counted org-wide timesheet rows (2,234 incl. agency/other frequencies) instead of the run universe (DIRECT + semi-monthly = 880); the modal then computed approved(2234) − scoped-excluded(28) = 2206. (2) All-skipped resume early-return never finalized status/totals (period stuck PROCESSING). (3) Single giant candidate findMany died on the flaky Cloudflare-SSH forward while small queries passed (Postgres itself stable since Jul 29) — chunked into 100-id batches.

## Category
bug fix (payroll accuracy + run convergence) / AI-agent

## Packages
- bandai-infra/hris-api
- bandai-infra/hris-app (modal denominator hardening, same task)
- Dual-app: **HR-only (no emp counterpart)**

## Changes
- `helper/payroll-period.helper.ts` — completion-block `payrollRunTotals` now scoped with `buildPayrollPreviewBaseWhere` (DIRECT + period payFrequency + dept/section) instead of org-wide row counts; `timesheetLinesTotalCount` scoped to in-scope approved timesheets. `employeePayroll` count unchanged (job only upserts its own rows).
- Same file — candidate fetch chunked (100 ids/batch, order-preserving + defensive re-sort): identical rows, resilient transport.
- Same file — all-skipped resume falls through to shared completion (was: early success-return leaving status PROCESSING + stale totals).
- Live DB proof: PP-20260826-20260911 COMPLETED 851/851 failed 0; stored totals tsTotal 880 / approved 880 / ready 851 / ep 851; money rows 851 alive / 851 unique employees, all unpaid. (approved counts rows vs metrics eligible employees 879 — one duplicate approved timesheet in scope; pre-existing data shape, not introduced here.)
- Prior task archived: disciplinary consequence-plan work (2026-09-03) below is superseded as current-task content.

## Truth delta
YES — stored `payrollRunTotals` are now run-scope counts (not org-wide rows); an all-skipped resume finalizes COMPLETED; candidate fetch is chunked. Partially implements REC-20260907-PAYROLL-WORKER-TRANSIENT-DB-RETRY (startup resilience; per-row retry still open, REC stays Proposed).

## Drift
LOW — writer semantics changed for future completions only; past COMPLETED metadata keeps old row counts until its period re-runs (only PP-20260826-20260911 was refreshed, by its own completion). No money-formula change; upsert/idempotency untouched.

## Verification
- TS transpile of `payroll-period.helper.ts`: 0 diagnostics.
- No new mocha specs (needs live K3s DEV data; prisma client in this checkout is unusable — `@prisma/client did not initialize`; behavior proven live instead: scoped totals + 851/851 completion + 851 unique money rows, all via direct DB reads).
- Vitest (hris-app): `payroll-preview-modal.test.ts` 7/7 passing after modal edit.
- Evidence: `.runtime/payroll-db-flap-20260909-144803/` (period snapshots, poll log, resume responses).

## Risks
- `PayrollPeriod.updatedAt` does not bump on metadata writes in this runtime (row shows 00:22:31Z despite 08:50Z writes) — suspected stale generated Prisma client re `@updatedAt`; do not rely on row `updatedAt` for run freshness, use `generationMetadata` timestamps. NEEDS_CONFIRMATION.
- List endpoint `GET /api/employeePayroll?payrollPeriodId=` returned 897 rows spanning periods (verified: sample employee rows belong to Jun/Jul/Sep periods) — filter application NEEDS_CONFIRMATION; period truth was proven via direct DB counts instead.
- DB connections server-side climbed 33→61 during the flap day (dead-tunnel orphans); watch `max_connections` on future flap days.
- Prior task notes (disciplinary, 2026-09-03) retained below for history.

---

## Prior task (2026-09-03, archived as current-task content)

Disciplinary review workflow + consequence-plan notifications: `Rule.consequencePlan` JSONB per-severity next steps; DA update notifies employee + manager on DRAFT→OPEN and RESOLVED; offenseType accepts rule codes. Files: `prisma/schema-postgres/rule.prisma` (`consequencePlan Json?`), `zod/rule.zod.ts`, `zod/disciplinaryAction.zod.ts`, `helper/disciplinary-notify.helper.ts` (NEW), `helper/notification-dispatch.helper.ts` (DISCIPLINARY category), `app/disciplinaryAction/disciplinaryAction.controller.ts`, `prisma/seeds/disciplinaryRulesSeeder.ts`, docs `docs/00-product/DISCIPLINARY-AUTO-ESCALATION.md`. Verified then: 19 mocha passing + live notify proof. Risk kept: `prisma db push` wants to drop backup table `requests_type_backup_20260826` — never `--accept-data-loss`.
