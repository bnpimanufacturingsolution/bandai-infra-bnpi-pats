## 2026-09-14 - Job display-code badges on Recruitment board + Manage Jobs (frontend-only, live-proven) - uncommitted

- Operator confirmed the candidates board shows ALL non-deleted applicants (14 today; grouped fetch hardcodes limit 1000, no pager; kanban/table sections are per-Job records so repeat postings are independent pipelines) and asked for a user-visible opening identifier since same-position jobs look duplicated. Design from operator: position initials + createdAt MMDDYYYY (e.g. `SE-01182026`), rendered as a Badge - no schema change.
- Shipped in hris-app: pure helper `app/lib/utils/recruitment-job-code.ts`; SAME-DAY FOLLOW-UP switched the prefix from derived initials to the canonical required `Position.code` (operator: "can we get the job.position.code? so we dont have to make a initial" - verified same Position model as applicants, `code String` required in position.prisma; added `position.code` to the board + Manage Jobs `useJobs` fields, `job.zod` PositionSchema gained optional `code`; initials kept as fallback only). Badge in every Recruitment board section header (covers Kanban AND Table - one header) via `createdAt` + `position.code` in the `useJobs` fields, plus Manage Jobs list Position column and Job Details header share the same codes (`data-testid="job-display-code"`). Verified the suspected dangling " - " level prefix was NOT a UI bug (both label helpers guard missing level; earlier strings were probe-script formatting) - now pinned by assertion instead.
- Proof after the switch: vitest helper 10/10 (code prefix, case/space/punct normalization, numeric `23` kept, missing-code initials fallback, collision suffixes); Playwright smoke re-PASSED 32.0s - all 11 DOM badges equal the canonical map `OPR-08252026 / 17-08252026 / 4-08202026 / JR-SPEC-08202026 / 19-08202026 / SW-MGR-08062026 / TECH-08062026 / 23-07162026 / 23-07022026 / 23-06102026 / 17-06102026` (today's two same-day "Operator" jobs are DIFFERENT positions OPR vs 17, so no `-2` suffix appears live; suffix logic still unit-pinned); Manage Jobs dialog badges asserted; tsc caught + fixed one real type gap (PositionSchema missing `code`), eslint delta 0 vs HEAD baseline. Evidence refreshed in `.runtime/recruitment-filter-proof/`.
- Proof: `recruitment-job-code.test.ts` + extended Playwright smoke green at each step (initials design PASSED 53.4s showing `-2` dedupe working on derived prefixes; after the canonical `Position.code` switch, current results are in the follow-up bullet above - 32.0s green, no suffix needed on live data). Screenshots 01b/05 + jobDisplayCodes JSON in `.runtime/recruitment-filter-proof/`. eslint on both touched components = 0 delta vs HEAD baseline (10 pre-existing error lines); tsc 0 errors in touched files.
- Boundary / next actions: uncommitted, unpushed (no operator push request; shared tree still carries concurrent onboarding WIP). Filed REC-20260914-JOB-CODE-BADGE-DERIVED (codes are display-only; persistent `Job.jobCode` is the upgrade path if openings ever need ticket/API references). Parity: HR-only, no hris-emp-app counterpart.

---
## 2026-09-13 - Recruitment Candidates kanban/table grouping + search-filter repair (backend, live-proven) - uncommitted

- Operator-reported "filter bug on recruitment/candidates kanban/table" confirmed, root-caused with live evidence, and fixed. All candidates landed in a phantom `unassigned` bucket and every job Kanban/Table section rendered empty, so the "Search applicants..." box looked broken. Root cause: `applicant.controller.ts` called `buildFindManyQuery`/`getNestedFields` without a model name, and `job` is now an ambiguous relation name in the DMMF registry (`Applicant.job -> Job` vs `CredentialRecoveryTask.job -> CredentialRecoveryJob`, collision introduced by `58f487dd` credential-recovery pipeline) - the model-free resolver silently dropped every `job.*` select, so `groupBy=job` (server maps to `job.id`) could not key any group.
- Change: hris-api only - pass modelName `"Applicant"` in `getAll` `buildFindManyQuery` + `getById` `getNestedFields` (read-path select construction; no schema/frontend change). New `tests/applicant-grouped-job-fields.spec.ts` (6 passing) pins both the silent-drop hazard and the repaired select/grouping.
- Verification: grouped API probe now returns 8 jobId-keyed groups (14/14 candidates, `job.position.title`/`job.level.name` present, no `unassigned`); `getById?fields=...job...` returns `Operator`; Playwright `hris-app/tests/smoke/recruitment-candidates-filter-live-proof.spec.ts` PASSED (kanban "Entry - Operator" populated with all 3 candidates, kanban + table search narrowing, honest empty state) with screenshots/JSON in `.runtime/recruitment-filter-proof/`. eslint/tsc delta 0 on touched files. Full mocha glob: 3881 passing; the 59 failures + `public-kiosk-feeds.contract.spec.ts` parse error are pre-existing unrelated classes (auth kiosk exports, employee benefit schedule x22, device/hikvision/zkteco, hard-delete contract) - none in the applicant surface.
- Recovery notes: the shared `tsx watch` API child was wedged (did not reload on save - recurring host issue); killed only that child and re-spawned `tsx watch index.ts`, API healthy in <1 min and the existing run-dev-full cloudflared quick tunnel resumed on :3001. Browser proof used a fresh hris-app dev server left running on http://localhost:5177 (`VITE_API_BASE_URL=http://localhost:3001/api`); :5176 is the concurrent session's hris-emp-app - untouched. Pre-fix Redis `cache:applicant:byId:*` entries may serve the reduced shape for up to 3600s TTL per exact `fields` key.
- Next actions / remaining risk: filed REC-20260913-AMBIGUOUS-RELATION-SELECT-HAZARD - other controllers calling `getNestedFields`/`buildFindManyQuery` without a model name share the silent `X.*` drop trap for any ambiguous relation name (worth an audit); identityHistory chips on grouped rows still show `missing_name_or_birthday` even when person data exists (separate defect, not touched here). Boundary: uncommitted, unpushed (no operator push request; shared tree carries the concurrent onboarding session's in-flight files). Parity: HR-only surface, no hris-emp-app counterpart.

---
## 2026-09-13 - Onboarding list moved to shared DataTable (ellipsis pager) + panel skeletons — uncommitted

- Operator asked for "pagination like other pages (1 2 3 … 10, don't list every page)" and "decent loading with skeleton". `hr-onboarding-page.tsx` now renders through the shared `DataTable` atom — identical numbered/ellipsis pager, "Showing X to Y of Z results", and `renderLoadingSkeleton` rows as every other admin/HR list — with `searchValue/onSearch` (debounce kept), department `SearchableSelect` in `customFilters`, and server-side `currentPage/totalItems/totalPages/itemsPerPage/onPageChange` on the existing 10/page roster contract. Row-click inline panel + "Open Profile" preserved. `onboarding-checklist-panel.tsx` loading states replaced with `Skeleton` blocks.
- Test gotcha for future sessions: DataTable rows carry `role="button"` and actions render desktop+mobile duplicates — non-exact `getByRole("button", { name: "Open Profile" })` matches the ROW and clicks selection instead of navigating (silent wrong action). Use `{ name, exact: true }` + `locator("visible=true")`. `searchable-select.tsx` gained optional `triggerAriaLabel`.
- Verification: vitest 40/40 (page suite expanded to 10 incl. ellipsis windowing `1…17`, page forwarding, skeleton-on-load; panel +skeleton case); Playwright 3/3 live green (login wait 30s→90s after recurring DEV-forward spikes; screenshots refreshed in `.runtime/onboarding-list-tab-proof-20260912-214829/`); tsc/eslint delta 0.
- Boundary: uncommitted, unpushed (standing operator instruction).

---

## 2026-09-13 - Design C promotion gate live (dedicated checklist AND legacy both required) — uncommitted

- Operator decision after status-flow Q&A: completing the new checklist alone must NOT graduate an employee, and documents alone must not either. `syncEmployeeEmploymentStatus` (now exported) computes pending = legacy OR dedicated PENDING; the onboarding controller fires it (best-effort, never fails the request) after sign/unsign/item+section deletes/createChecklist/provision-all and echoes `employmentStatus` in sign responses. No dedicated checklist = pure legacy. Auto-sign/bulk-sign declined.
- Verified: mocha 56 (5-case gate truth table + promote/throw-safe integration) + 685 contract; API restarted; 3/3 Playwright smokes green. Live DEV: EMP003 provisioned→stays, signed→ACTIVE, unsigned→ONBOARDING, deleted→legacy-only semantics, status restored; Hirotaka stayed ONBOARDING at 100% dedicated because of one legacy pending item (the exact AND behavior). GATE TEST template + both gate checklists deleted; DEV fixtures unchanged otherwise (signer2 account + KCSSI dept change remain documented in docs/ONBOARDING_CHECKLIST.md).
- Boundary: uncommitted, unpushed (`feature/onboarding-checklist-signature` @ d0d1a7f5 + working tree).

---

## 2026-09-12 - Onboarding employees list + profile tab delivered live (uncommitted working tree)

- Operator flow shipped: `/hr/onboarding` searchable/filterable list of ONBOARDING employees (server `?search`/`?departmentId` added to the roster endpoint — only backend delta), row-click inline checklist panel with sign modal (instruction + password + remarks, inline 401), Open Profile → `/employee/<id>?tab=onboarding&from=hr-onboarding`; profile Onboarding tab exists only while `employmentStatus=ONBOARDING`; legacy boarding tab untouched. Nav: HR Recruitment submenu, employee General, admin "Onboarding Employees".
- Shared `onboarding-checklist-panel.tsx` composes EXISTING endpoints (operator choice: no new route): admin/HR `GET /checklists?employeeId=`, everyone else roster-by-number fallback → `.../visible` (dept-scoped with `canSign`/`isContextOnly`), provision CTA for admin/HR, unsign kept. `retry:false` added to all onboarding mutations (TanStack retries made wrong-password errors land ~3-7s late and timed out the first live run).
- Verification: mocha onboarding 48; vitest 38/8-files; Playwright new list-tab spec with self-healing unsign prelude passed twice consecutively + batch-1/2 smokes green; tsc delta 0; eslint 0 errors (warnings only, codebase-consistent).
- DEV fixtures (documented in docs/ONBOARDING_CHECKLIST.md): signer user e2e-onb-signer2/password123 ↔ KCSSI-BANDAI1129 (dept moved to Software Development, original recorded), Char Aznable checklist left with 6.1 signed "Mae Banaga" as demo. New REC-20260912-SIGNER-ROLE-DRIFT (user.role not reflected in login-derived token role → HR bypass unreachable for created users; dept-match path exercised).
- Boundary: **not committed** this batch (operator has not asked; earlier two commits stay local on `feature/onboarding-checklist-signature`). Concurrent session's cosmetic builder edits coexist green. API restarted for module loads; roster search verified live.
- **Same-day follow-up (also uncommitted):** roster endpoint paginated server-side (`?page`, `?limit` default 10 max 100, `pagination` block; mocha +1, suite 49). List page: pager footer + Prev/Next, filters reset page, department filter now the shared `SearchableSelect` ("All departments" clears; component gained optional `triggerAriaLabel`). New vitest caught a real "Showing 11–2" precedence bug in `rangeStart` (fixed). Playwright list spec asserts the 10-row page + pager and uses `test.slow()` after a DEV-forward slow-spike ate the old 60s budget; all 3 onboarding smokes green (`.runtime/onboarding-list-tab-proof-20260912-214829/` refreshed). vitest 41/41, tsc/eslint delta 0.

---

## 2026-09-12 - Onboarding follow-up batch landed (page-preview, single-template builder + edit/delete, create-on-hire + provision-all)

- Operator's revised page model implemented: `/admin/configuration/onboarding/checklist` is now a **pure full-page preview of the created checklist** (shared `ChecklistPreviewTable` extracted from the builder Preview; nothing employee-related). Builder is a **single-template editor** auto-opening the first template — template `<select>`, "New template…" and all create-another affordances removed; Save always updates the same id.
- Builder edit/delete shipped: inline section rename + delete, item edit (create/edit dual dialog) + subtree delete with confirm; pure state helpers exported. Endpoints unchanged (per operator rule "FOR NOW one checklist, don't change the endpoints") — multi-template capability remains API-side.
- Backend additions: idempotent `ensureOnboardingChecklistForEmployee()` (single-active-template auto-resolve, deep copy), `POST /checklists/provision-all` (admin/HR, dryRun + execute, re-runnable), create-on-hire hooks wired best-effort (employee create Step 8.9 ONBOARDING-gated + `reconcileEmployeeOnboardingState` covering update/import). Generic boarding stack still untouched.
- Verification: hris-api onboarding mocha 46 + app-module-contract → 731 passing; eslint clean (incl. employee.controller/boarding-documents); hris-app vitest 19; Playwright live 2/2 with the REAL operator template visible on both pages; tsc delta 0 (173 pre-existing unrelated, 0 onboarding). Live DEV: scoped provision-all create→idempotent-skip→deep-copy-visible→rollback cleanup (`.runtime/onboarding-provision-proof-20260912-173212/`); 170-employee full run left to operator (dry-run shows 170 wouldCreate).
- Infra: local dev API restarted (tsx watcher had not reloaded the new module); a 55435-adjacent momentary blip did not recur this batch.
- Boundary: branch `feature/onboarding-checklist-signature` (v1 + this batch), **not pushed**; REC-20260912-ONBOARDING-EMPAPP-READ-VIEW updated (the employee-facing roster/sign surface from v1 commit is the prototype to re-mount later); mock-checklist-data.ts now unused (kept); single-app exception unchanged.

---

## 2026-09-12 - Dedicated /api/onboarding module delivered (builder CRUD + department password sign-off), live-proven

- Operator question answered with evidence: the existing generic endpoints support checklist CRUD but NOT password signing, NOT server-stamped signee names, and NOT department-scoped visibility. Operator chose a **full dedicated onboarding module** over retrofitting the scattered boarding stack; role matrix + all open schema decisions confirmed in-session (see current-task addendum + `docs/ONBOARDING_CHECKLIST.md`).
- Delivered: 7 new Prisma models (template/section/item ×2 + signature audit), `app/onboarding/` 26-route module, `onboardingAccess.helper.ts` (single source for sign matrix + visible tree with `canSign`/`isContextOnly`), zod, and frontend live checklist (roster → filtered tree → password modal → sign/unsign) + builder save-all (`POST /templates` + `PUT /templates/:id/tree`). Mock checklist/builder files from the in-flight untracked batch were KEPT and upgraded (mock table stays as labelled demo fallback when the roster API errors).
- Verification: hris-api mocha onboarding specs 37/37 (incl. sign 200/401/403/409 via supertest+mock prisma, guards, structure-only PATCH rejecting client status fields) + 688 app-module-contract green; hris-app vitest onboarding 9/9; Playwright live smoke 2/2; tsc clean in all touched files (backend + frontend) — only pre-existing unrelated errors remain.
- Live DEV E2E with full lifecycle + cleanup: `.runtime/onboarding-module-proof-20260912-*/` (sign stamped `signedByName="Beneficiary Employee"` server-side; wrong pw 401; wrong dept 403; no-dept context 403; admin unsign restores PENDING; audit row kept; 0 rows left behind; e2e signer user deleted, TESTBEN003.userId restored to null via one-off script since employee PATCH zod can't null it).
- Infra notes: local `npm run dev` API tree (PID 6280) stopped to unlock the Prisma engine DLL for regeneration, then crashed-and-restarted twice; fixed one `@openapi` YAML compact-mapping bug it exposed; a transient 55435 forward flap mid-E2E self-healed (watchdog rebuilt). API now healthy on 3001 with the new module mounted. Playwright chromium headless shell was missing on this host; installed via `npx playwright install chromium-headless-shell`.
- Boundary / next actions: **not pushed** (no push request + shared tree carries another session's untracked onboarding mock files — staged selectively when pushed). Single-app exception (admin/HR surface); filed REC-20260912-ONBOARDING-EMPAPP-READ-VIEW (employee-facing view) + REC-20260912-ONBOARDING-CHECKLIST-COMPLETION-NOTIFY (legacy stack emits completion notification; new module does not yet). `prisma/schema/` (legacy mongo) intentionally not mirrored. Pre-existing eslint errors in untouched legacy onboarding components (welcome-screen/profile-completion/company-introduction label+entity) left as-is.
## 2026-09-14 - Agency workspace delivered (operator-ordered, local DEV, no push)

- Agency coordinator login (`hris-agency`, `User.metadata.agencyId`) + `/agency` workspace (Dashboard/Roster/Attendance/Timesheets/Biometrics) + server-enforced own-agency scope + CSV import `POST /api/agency/:id/attendance-import` (dryRun + execute). Backend: `helper/agency-scope.helper.ts`, getAll enforcement, PATCH same-agency gate, import with per-row agency match. Frontend: `AgencyWorkspace`/`BiometricsImport`, Sidebar entry, guards. Single-app exception (no emp-app counterpart).
- **Revision (operator: dedicated pages + chart dashboard, no tabs):** `/agency` → `/agency/dashboard`; 5 real routes + Sidebar Agency section; recharts dashboard (14-day bars, status donut, dept bars) from live rows; real Attendance table; timesheets View/adjust modal. Fixed: modal named import, enabled-in-params, ONBOARDING roster statuses, duplicate testids, client-side day bucketing (DSL ORs same-key date filters), attendance getAll scoped. Proof (3 subjects, reverted): dashboard 3/9/10 consistent, Playwright PASSED. Evidence `hris-app/.runtime/agency-workspace-20260914/`.

- Agency coordinator login (`hris-agency`, `User.metadata.agencyId`) + `/agency` workspace (Dashboard/Roster/Attendance/Timesheets/Biometrics) + server-enforced own-agency scope + CSV import `POST /api/agency/:id/attendance-import` (dryRun + execute). Backend: `helper/agency-scope.helper.ts`, getAll enforcement, PATCH same-agency gate, import with per-row agency match. Frontend: `AgencyWorkspace`/`BiometricsImport`, Sidebar entry, guards. Single-app exception (no emp-app counterpart).
- Live proof as agency-test@test.com: own-only roster, own day-adjust 200 + revert, foreign PATCH 403, dryRun matched 1/rejected 1 zero-write, execute 1 PRESENT row then deleted, both Playwright specs PASSED. Proof subjects reverted; TEST roster 0. Evidence: `.runtime/agency-workspace-proof-20260914-031238/`, `hris-app/.runtime/agency-workspace-20260914/`.
- Tests: api 9/9, app 3/3 + 11/11; tsc/eslint clean on touched scope. 2 RECs Proposed (approve-action + timesheetline PATCH have no role guards). Terminology `Agency (hris-agency)` added. Not pushed.

---

## 2026-09-09 - Line leader timesheet adjustment (leader-filed, manager-final) delivered + concurrent-session recovery

- Operator requirement confirmed and closed: the line leader can now file a **timesheet adjustment (attendance correction)** for led members from the requests hub; the **member's section manager is the final approver** (mirrors OT/early-OT; no HR step on the leader chain); the approval-flow tasks are laid out on a **right panel in the modal before executing**; the manager sees the task in My Approvals / Pending Approvals.
- Backend: `LEADER_FILED_ATTENDANCE_CORRECTION_STEPS` → 3 steps (Leader Submission → Manager Approval final → SYSTEM completion); former HR-review task step removed; DEV org templates re-seeded (22 updated). Frontend: on-behalf adjustment payload (`LINE_LEADER_FILED` / `MANAGER_FINAL`), "For whom" picker on the adjustment branch, right "Approval flow" panel, hub wiring. Stale OT metadata label fixed to `MANAGER_FINAL`.
- Tests: backend 53 passing (line-leader-workflow pins the chain), frontend 26 passing (builder + new modal contract). Live API E2E (`REQ-1786424090647`: leader TESTBEN004 → member 00062 → manager 00021 approved → member attendance backfilled, leader untouched) + browser E2E PASSED (`REQ-1786424090648`, cancelled). Evidence: `.runtime/leader-timesheet-adjustment-20260909-154503/`, `.runtime/leader-timesheet-adjustment-browser-proof/`.
- **Concurrent-session recovery:** mid-task, another session stashed the entire working tree and moved to `feature/profile-account-settings-ui`, wiping this task's uncommitted work from the shared tree. Recovered into isolated worktree `../bandai-infra-leader-adj` (branch `feature/leader-timesheet-adjustment`, off merged develop `f5b1c3f3`) and committed there. Shared tree left with the other session's in-flight files. The stash ("foreign line-leader work + diagnostics") was popped into the worktree and no longer exists — all its content is committed on that branch.
- Also repaired: in-flight Sidebar edit had dropped the `myTeamEntry` render (My Team heading would vanish) — restored at the top of Working Space, contract re-pinned.
- Boundary: nothing pushed; operator to decide merge timing (concurrent session active). Pre-existing failures untouched (hikvision-callback spec, apiActivityLogging tsc, all verified on stashed HEAD). Diagnostic check-*.ts scripts remain untracked (session diagnostics, excluded per repo convention).

---

## 2026-09-09 - OT batch close-out + eslint.config.js malware removal

- Operator approved close-out with docs+tests. Batch = 2026-09-08 line-leader OT journey + timesheet project code, on eature/section-line-leader-requirements (9 commits) + working-tree changes. origin/develop merged in (4919084); duplicate device perf change discarded (byte-identical to 3c2202c6).
- **Malware removed:** hris-app/eslint.config.js carried an obfuscated Ethereum-RPC/remote-eval blob since 3e7a303e (re-added by restore 5e4c3046). Parse-broken as committed (never executed); removed, legit config kept, evidence at .runtime/eslint.config.js.malware-evidence-20260909. Repo-wide grep clean.
- Verification: API specs 37/37, app vitest 15/15, tsc delta 0 (65 pre-existing), targeted ESLint 0 errors (3 label-has-associated-control fixed with htmlFor+id; DatePicker/CalendarDatePicker forward optional id).
- Delivery: push feature branch -> PR -> merge (per 2026-09-08 operator CI decision: automatic runs on merged PRs only). Post-merge VM rollout watch pending at write time.

---
# WWG Agent Handoff

## 2026-09-08 - Timekeeping deep audit (read-only)

- Report: `.wwg/reports/timekeeping-deep-audit-20260908.md`. Scope: every timekeeping surface feeding payroll (attendance ingest, obligations, schedules, pairing, timesheet lifecycle, OT policy, day-status, metrics, generate/preview).
- Headline: core money pipeline verified sound (APPROVED+DIRECT gate, paid/locked skips, OT approval gate, snapshot semantics, Manila-day bounds; core helpers 34/34 + source-truth regression 24/24 passing) â€” **but Start Payroll's 2026-09-04 auto-approval lane upgrades DRAFT/SUBMITTED/REVISED/REJECTED â†’ system-APPROVED unconditionally and never consults `TimesheetConfig.enableAutoApprove`** (`resolveTimesheetAutoApproveEnsureAction` `timesheet.helper.ts:65-76`; sole ensure call site `payroll-period.helper.ts:1634`): manager-rejected sheets get paid. CONFLICTING with the 2026-08-12 "Start Payroll APPROVED-only" product truth; needs operator decision (exclude REJECTED / honor config / relabel toggle).
- Other findings: D2 day-labor guard diffs 11 fields but the write path persists full metadata (breakMinutes/leaveType smuggle possible, rides on `z.array(z.any())`); 13 `@ts-nocheck` files + `payrollperiod.controller.ts` is committed compiled CommonJS; Hikvision callback `?preview=true` dry-run lane regressed (gone) while endpoint stays public; DM4.3 OT apply remains script-only over untyped JSON buckets; import job progress in-memory (restart loses it); ZKTeco live callbacks never create attendance (`not_applied`, NEEDS_CONFIRMATION intent); dual timekeeping math engines; Mongo schema twin + tracked junk.
- RECs registered: REC-20260908-PAYROLL-AUTOAPPROVE-REJECTED-UPGRADE, REC-20260908-DAY-LABOR-GUARD-WRITE-SURFACE, REC-20260908-CALLBACK-PREVIEW-LANE-REGRESSED, REC-20260908-IMPORT-JOB-PROGRESS-DURABILITY (all Proposed).
- No code/config/data changes; audit-only. Next: owner triage of F1 (money-path approval semantics) before any further payroll work touches the lane.

## 2026-09-03 - Payroll domain audit (read-only)

- Report: `.wwg/reports/payroll-audit-20260903.md`. Domain intact post-restore: register rules (Basic Path A/B, 313 basis, FILE_DUAL) verified live in `generatePayrollFromTimesheets`/`previewPayrollFromTimesheets` (`payroll-period.helper.ts:2002/2029/:5091/:5116`); Run Payroll OT readiness wired (`payrollperiod.controller.ts:1079`); **184/184 tests passing** (22 runnable payroll specs, TESTEXIT=0).
- 5 findings (F1 org-policy auto-approve mislabeled as "Manager approved" in OT readiness â€” latent, flag OFF; F2 vitest dead spec for PayrollGenerationJobService; F3 test-only calculator with contradicting rate basis; F4 OT-import auto-approve chain is ops-script-only; F5 hris-api CI scope = source-truth only) â†’ RECs registered: REC-20260903-OT-READINESS-POLICY-AUTOAPPROVE-LABEL, REC-20260903-PAYROLL-GENJOB-VITEST-DEAD-SPEC, REC-20260903-PAYROLL-CALC-HELPER-TEST-ONLY.
- No code/config/data changes; audit-only. Next: owner triage of the 3 Proposed RECs.


## 2026-09-03 - develop gutting incident: RESOLVED

- PR #9 conflict root cause = mass deletion on develop (3,793 files, commits fb326549/653d3c32 by malasaernestdodz). Restored via 5e4c3046 (fast-forward, no force push). Backup: backup/develop-gutted-20260903.
- Feature branch merged restored develop (1d04dd40, zero conflicts); tests green (15 passing). PR head on origin = 1d04dd40.
- Full evidence + rollback path: .wwg/reports/develop-gutted-restore-20260903.md
- PR #9 MERGED into develop (2026-09-03T01:07:35Z, merge commit c2a7d873; verified zero deletions vs 85327bd2; auto-approve tests 15 passing).
- Open next: PR #7 (develop->uat) shows CONFLICTING/DIRTY (develop-vs-uat divergence, separate matter); watch restored-develop CI (pre-existing runner-level 5s-fast failures, unrelated); owner confirmation with malasaernestdodz; project-truth.md conflict-marker housekeeping (pending user decision); backup/develop-gutted-20260903 deletable after team review.

---

## 2026-09-04 - Integration Employee Search API Audit

- **Task**: Audit `GET /api/employee/search` (fuzzy + pagination + X-API-Key auth).
- **Result**: âœ… `CONFIRMED_CODE_AND_LIVE_LOCAL` â€” shipped, tested, documented. No code changes required.
- **Tests**: 22/22 passing (13 search + 8 auth middleware).
- **Live Proof**: `query=z` chain 486â†’455â†’454; `zan andrei` count 1 fuzzy 1; deep pagination honest; `andersen` 0 (distance >2).
- **Evidence**:
  - Audit summary: `.runtime/integration-employee-search-audit-20260904/AUDIT-SUMMARY.md`
  - Live proof: `.runtime/employee-search-proof-20260904-153358/`
  - Consumer doc: `docs/INTEGRATION_EMPLOYEE_SEARCH_API.md`
- **Open Items**:
  1. `hris-api/.env` tracked in git (pre-existing drift) â€” real keys must use VM/K8s secret plumbing.
  2. Activity logging DB errors in tests (pre-existing test infra gap).
  3. Fleet >5000 pool cap â†’ future trigram index.
  4. Key rotation: append â†’ switch â†’ remove (comma-separated = zero downtime).
- **Next**: Provision `INTEGRATION_API_KEYS` in VM DEV/UAT/PROD runtime envs; push `develop`; verify per-environment.

---

## 2026-09-07 - INTEGRATION_API_KEYS provisioned dev/uat/prod (employee-search exposure complete)

- **Status**: `CONFIRMED_RUNTIME_ALL_ENVS`.
- Pushed `4592e75a` (WWG truth-sync + baked conflict-marker repair in project-truth wiki files), `09a12b5a`/`e9bdd119` (GitOps provisioning).
- GitOps: `hris-api-integration-env` Secret (per-env distinct key) + secretKeyRef env on hris-api in all three overlays, following the existing hris-postgres-env in-git appliance-secret precedent (Argo prune:true requires git-tracked secrets).
- VM flow: ansible-pull picked SHA -> Argo auto-applied Secret + Deployment env -> all three hris-api rolled out 1/1 Running.
- Final live proof (.runtime/employee-search-env-probe-20260907-121922/final-key-proof.json):
  - Valid X-API-Key: PROD 200 (483 employees), DEV 200 (486), UAT 200 (483).
  - Invalid key: 401 on all three (was 503 fail-closed before provisioning).
  - JWT path: 200 on all three (unaffected).
- Key custody: keys live in git overlays (private repo) + generated-keys.json (local .runtime evidence only, not committed). Rotation: append new key to comma list -> consumers switch -> remove old (doc: docs/INTEGRATION_EMPLOYEE_SEARCH_API.md).
- Remaining handoff item closed: "Provision INTEGRATION_API_KEYS in VM DEV/UAT/PROD runtime envs; verify per-environment" - DONE 2026-09-07.

## 2026-09-07 - FULL security audit (overall system, read-only)

- Report: `.wwg/reports/security-audit-full-20260907.md` (supersedes/extends `.wwg/reports/security-audit-20260907.md` Phase 1).
- Method: 11 read-only workstreams (secrets, API auth, GitOps/K8s, CI/scripts, device plane, frontend, emp-app, DB/PII/logs, money-path, deps/uploads/socket, public surface) + live VM probes via `ssh project-truth-hris`.
- Headline: 12 CRITICAL / 22 HIGH / ~35 MEDIUM. Top: secrets-in-git (rotate+purge), unauthenticated /hikvision/callback, socket.io no handshake auth, any-user payroll generation (no RBAC), workflow self-approval, xlsx 0.18.5 CVE-2023-30533, imports write into PAID periods, VM SSH password-auth + passwordless sudo chain, no HRIS DB backups, no security headers.
- Live VM evidence: `.runtime/security-audit-full-20260907/vm-probe.txt`, `vm-probe-2.txt` (sshd passwordauthentication=yes, SUDO_NOPASS_OK, fail2ban absent, k3s.yaml 644, device specs 600 OK, tunnel cred 600 OK).
- No changes made. P0 remediation requires operator authorization (secrets rotation + git history rewrite touch PROD runtime).

---

## 2026-09-07 - Section Line Leader assignment implemented (option B)

- `SectionLineLeader` join (`section_line_leaders`, M:N) + role derivation: membership derives `hris-line-leader` (isManager=true), precedence HR > manager level > line leader; add/remove/section-delete re-derive roles (delete-path stale-role gap found by live proof and fixed).
- Admin UI: Line Leaders chips + add-select beside Section Head on /admin/configuration/sections; table column, view row, CSV.
- Tests: section-line-leaders 15/15, role-derivation 55/55, smoke 2/2; live API round-trip incl. upgrade/demote/delete-demote; browser proof on real app. Evidence: hris-api/.runtime/20260907-section-ll-proof/, .runtime/browser-evidence/sections-line-leaders-live/, report .wwg/reports/section-line-leader-assignment-20260907.md.
- Employee hard delete now detaches Section.headId (pre-existing gap) and deletes join rows.
- DEV db-init blocker removed: stale requests_type_backup_20260826 (47 rows) exported to .runtime/dev-dbinit-drift-repair-20260907/ then dropped; local prisma db push now clean. runtime-dev was Synced/Degraded (failed db-init) BEFORE this work; expect green after push + job release.
- Boundary: local DEV proven; VM/GitOps follows push. Day-labor own-section tagging scoping remains candidate REC.
- **VM/GitOps promoted same day**: pushed `2f6aed49`; VM rebuilt/rolled dev+uat+prod; db-init Jobs released and re-ran Complete in all three envs; `section_line_leaders` verified in DEV/UAT/PROD Postgres; all six Argo apps Synced/Healthy (runtime-dev Degradedâ†’Healthy); DEV API `:3101` serves `lineLeaders` enrichment. GitHub Actions blocked by account billing failure (pre-existing, jobs never started; not a test failure). Day-labor scoping registered as REC-20260907-DAY-LABOR-LEADER-SECTION-SCOPING.
- Follow-up verification pass: `section.controller.spec.ts` needed a `sectionLineLeader` mock stub for the new remove() pre-read â€” fixed, now **66/66**. `employee-hard-delete.contract.spec.ts` fails 4/4 statically but is **pre-existing drift** (asserts source strings never present in the controller, verified at pre-work base `e5e51a43`); documented in the report, not caused by this feature.

## 2026-09-07 - Infrastructure-layer security audit (VM + host, read-only)

- Report: `.wwg/reports/security-audit-infra-20260907.md`. Evidence: `.runtime/security-audit-infra-20260907/vm-probe-3-deep-infra.txt` + `host-probe.txt`.
- Headline (infra layer): 4 CRITICAL - IC1 VM LAN-to-root chain confirmed at sudoers level (`infra NOPASSWD:ALL` + password sshd + hardcoded pw + no fail2ban), IC2 Windows host firewall DISABLED on all profiles with RDP enabled, IC3 no encryption at rest (no LUKS, K3s without --secrets-encryption), IC4 unauthenticated observability stack exposed LAN-wide (Prometheus/Loki run as root, UFW Anywhere).
- Highs: auditd inactive, reboot required + 54 pkgs pending, Docker no daemon.json/root containers, dnsmasq on LAN IP, packer bakes weak sshd, k3s.yaml 644, unmapped caddy.service (NEEDS_CONFIRMATION), X11Forwarding, GatewayPorts clientspecified.
- Positives: UFW default-deny + AppArmor enforcing + hardened sysctls + unattended-upgrades + K3s creds locked + no anonymous CRBs + no privileged containers.
- No changes made. P0 infra fixes (SSH keys-only, host firewall, sudoers scoping, obs binding) are additive and tunnel-safe; awaiting operator authorization.

---

## 2026-09-08 - Line leader full journey implemented (branch feature/section-line-leader-requirements)

- Operator-confirmed model (docs/00-product/REQUIREMENT-SECTION-LINE-LEADER-DETAILS.md): leader files ALL core request types (OT incl. early OT, timesheet/attendance adjustments) for own-section members; mandatory chain Leader->Manager->HR (D1: admin-configurable via metadata.workflowCode + per-org workflow config); employee self-service flow unchanged; leader day-labor tagging; D2 timesheet-write security fix; D3 member->leader assignment (Employee.lineLeaderId).
- Implementation: on-behalf guard in request create (membership-based, role-independent); three leader-filed workflow templates + seeds + catalog fallback; THREE normalizer seams exempted (config, runtime template, step-builder getWorkflowStepsForRequestType - root cause of initial flattening); timesheet PATCH identity guard (HR/admin/timekeeper/responsible leader) + day-labor-only diff; assign-members endpoint + admin UI block when section has 2+ leaders; sidebar Approvals/My Team for hris-line-leader.
- Proof: E2E chain to COMPLETED (manager=member's manager Bryan, HR=Maria); plain-employee on-behalf 403; leader tag 200/persisted; non-tag 403; plain timesheet write 403; assignment invalid 400/valid 200. 166 backend tests + 2 smoke. Evidence: hris-api/.runtime/line-leader-e2e-*, -daylabor-*, assign-members-proof.
- Boundary: on-behalf LEAVE rejected (requester-bound validation/side effects) with clear message; team-page section roster + D1 settings panel are follow-ups; NOT merged to develop / NOT deployed until operator approves.

## 2026-09-08 - CI/Observe triggers moved from push to merge-only (operator request)

- `.github/workflows/ci.yml` + `validate.yml`: `push` triggers removed; now run on `pull_request` (opened/synchronize/reopened = pre-merge gate) and on merged closes via job-level `if: ... merged == true` (all 8 CI jobs + validate job). `workflow_dispatch` kept for manual runs.
- `.github/workflows/observe-deploy.yml`: switched from `push: develop` to `pull_request: types:[closed] branches:[develop]` with job-level `if: workflow_dispatch || merged == true`. On merged PRs `github.sha` = merge commit on develop = the SHA ansible-pull reports, so VM-report matching stays correct.
- Pushed to `develop` as `fbc442bf` (cherry-picked via temp worktree to avoid the other session's dirty working tree). Live proof: `gh run list --commit fbc442bf` returns ZERO runs - the push no longer triggers any workflow.
- Boundary to remember: direct pushes to `develop` (agent flow) now run NO CI and NO Observe. Use PRs (or `workflow_dispatch`) for verified changes. Previous push-triggered runs were already failing (CI/Validate/Observe failure on `aa8d8cab`) - pre-existing, worth investigating separately.
- Side note from this change: working tree contains another session's uncommitted work (`login.tsx`, `landing.tsx`, `current-task.md`, `recommendation-registry.md`, timekeeping audit report) - left untouched.

## 2026-09-08 - All automatic Actions disabled except merged-PR runs (operator request follow-up)

- `ci.yml` + `validate.yml` triggers narrowed from `pull_request: [opened, synchronize, reopened, closed]` to `pull_request: types:[closed]` only. Combined with the existing job-level `if: ... merged == true`, nothing runs on PR open/update either.
- Net effect on GitHub Actions: ZERO automatic runs except when a PR is MERGED into develop (CI+Validate+Observe) or a human clicks Run workflow (workflow_dispatch on all four).
- Pushed `0a037a9d` to develop; live proof: `gh run list --commit 0a037a9d` empty (push fired nothing).
- promote-gitops.yml unchanged (manual dispatch-only).

## Latest Task Addendum - 2026-09-08: sync-preview slow API root-caused + fixed (TCP preflight + TTL cache)

- **Operator report**: "an API is too slow". Latency sweep evidence: `.runtime/api-latency-sweep-20260818-181032/` (public) + `after-fix-timing.json`.
- **Sweep findings**: tunnel baseline ~1.2-1.4s for everything (network, not app). Real server-side offenders: `GET /api/device/sync-preview` 5.5-6.3s and `GET /api/device/events` ~2.0s. Single-device preview was 0.24s -> per-device fan-out was the cost.
- **Root cause**: 11 Hikvision device rows, >=7 stale/unreachable (EHOSTUNREACH 10.184.37.21 in API logs; old IPs 192.168.110.24 / 192.168.1.136 / TEST A/B; even 10.184.37.19-as-device). Each preview paid full live-probe timeouts per dead device (per-probe 2.2s, up to 3 sequential attempts, 3.5s budget) + per-device DB aggregation, every request.
- **Fix** (commit `3c2202c6` on origin/develop, VM image rebuilt 10:38Z, DEV pod rolled): bounded TCP preflight (900ms default, env `HIKVISION_FAST_USER_COUNT_PREFLIGHT_TIMEOUT_MS`) resolving the SAME endpoint via buildHikvisionDeviceBaseUrl (tunnel-map safe); 60s TTL cache on the fast user-count probe for preview fan-out only (env `HIKVISION_FAST_USER_COUNT_CACHE_TTL_MS`, 0 disables; negative results cached at half TTL); sync-job decision matrix call site stays UNCACHED (write planning exactness preserved).
- **Proven after deploy (VM loopback)**: 5.5-6.3s -> 1.15-1.56s; warm runs ~1.1s; public path 0.9-2.2s. TTL expiry re-probes by design (bounded).
- **Test**: hikvision-biometric-sync-contract 34/34 passing. Pre-existing full-tsc errors unchanged (device.controller AuditPayload `page` error exists on clean HEAD too).
- **Left open (proposed, not implemented)**: (1) device events list ~2.0s server-side - candidates: 30s facet cache or query trim; (2) stale device rows cleanup is operator data decision (7 rows: old Main Entrance Device, Device 5, Import Target A CSV, TEST A/B); (3) timesheet list payload 1.07MB for 10 rows (page hydration bloat, server-fast).

## 2026-09-08 - Per-day default project code on timesheet lines (operator feature)

- Operator rule: DIRECT day -> `bnpi-dl-<year>`; INDIRECT day -> `bnpi-id-<year>`; per-day (one line per date, so an employee can carry different codes on different days).
- Schema: additive `Timesheetline.projectCode String?` in both `prisma/schema/timesheetline.prisma` and `prisma/schema-postgres/timesheetline.prisma`. Applied to DEV via narrow create-only SQL runner `scripts/migrate-add-timesheet-project-code.ts` (did NOT use `prisma db push --accept-data-loss` - pre-existing `EmployeeApplicationAccess` drop warning avoided).
- Helper `hris-api/helper/timesheet-project-code.helper.ts`: `resolveTimesheetProjectCode` (dayLaborType tag first, else workforceSource AGENCY->INDIRECT / everything else->DIRECT per canonical terminology; year = Asia/Manila year of the line date), `normalizeProjectCodeOverride` (explicit request value wins, max 64 chars), `resolveManilaYearOfDate`.
- Wired all three line-write paths: breakdown save (`timesheet.helper.ts` syncTimesheetLinesFromBreakdown data block), obligation materialization (`attendance-obligation.helper.ts:~1272`), controller normalizeBreakdownForPersistence success+fallback branches. Zod: DailyBreakdownSchema + TimesheetlineSchema + create/update partials accept `projectCode`. Breakdown payload/audit/revision-audit surfaces expose it (label "Project code").
- UI (hris-app): TimesheetDayEditor Project code input (placeholder dl/id per selected labor type; empty = use default), day tooltip shows Project code; timesheet/timesheetline services carry `projectCode`. Dual-app parity: HR-only surface (timesheet day editor has no emp-app counterpart; submodule not checked out).
- Backfill: `scripts/backfill-timesheet-project-codes.ts` dry-run scanned 177,948 effective lines, 0 unclassifiable (dl-2026 173,517 / dl-2025 4,416 / id-2026 15); execute as ONE grouped SQL UPDATE (P1001/P1017 forward flake fixed by single round-trip): 177,942 rows updated, 6 pre-existing explicit codes preserved, verification shows 0 NULL projectCode and employees carrying dl-2025+dl-2026 across days (per-day proof).
- Tests: new `tests/timesheet-project-code.helper.spec.ts` 16/16; regression day-labor-guard 7/7, attendance-obligation 17/17; app vitest TimesheetDayCell 6/6. API typecheck: zero errors in touched files (repo-wide 121 pre-existing drift lines unchanged, none reference touched surfaces).
- Local DEV only (not pushed). Boundary: workers with a dayLaborType tag keep tag-derived code; lines with neither tag nor workforce source classify DIRECT (missing source = DIRECT canonical rule).

### Project code documentation pack (2026-09-08 addendum)

- Canonical spec: `docs/00-product/TIMESHEET_PROJECT_CODE.md` (rule, precedence, data model, all write paths, UI, backfill results + usage, deployment watch-out for the stray `EmployeeApplicationAccess` table, boundaries, and the project-management roadmap: registry -> validation -> hours report -> payroll slice -> leader UX).
- Terminology entries added: root `.wwg/wiki/terminology.md` Observed Terms ("Timesheet project code", CONFIRMED_CODE_AND_LIVE_LOCAL) and `hris-api/.wwg/wiki/terminology.md` Canonical Term Candidates ("per-day project attribution").
- Gap noted (not fixed, out of scope): the hris-api package wiki has no `dayLaborType` / Day labor entry from the 2026-08-20 feature - only the root wiki records it. Backfill opportunity if the package wiki is ever reconciled.
