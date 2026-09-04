## Latest Task Addendum - 2026-09-04: Employee-search integration endpoint upgraded (fuzzy + pagination + X-API-Key auth)

- **X-API-Key auth shipped** for `GET /api/employee/search`: `middleware/integrationApiKey.ts` (fail-closed 503 when `INTEGRATION_API_KEYS` unset, 401 on missing/invalid key, timing-safe compare, JWT-context skip). Wired in `index.ts` before `verifyToken` for `X-API-Key`-bearing requests to `/employee/search` only; JWT Bearer path unchanged. `config.integrationApiKeys` from env `INTEGRATION_API_KEYS` (comma-separated). Local dev key generated in `hris-api/.env` (git-tracked env files are pre-existing drift — flagged; do not commit real keys). `.env.example` documents the var.
- **Search upgraded:** fuzzy typo-tolerant ranking (Damerau-Levenshtein OSA, per-word, distance cap 1 for terms of 3–6 chars, 2 for 7+; 1–2 char terms exact-only), exact-substring rows always rank before fuzzy rows, `page`/`limit` (cap 100) with honest `pagination {total,page,limit,totalPages,hasNext,hasPrev}` computed from matched rows, `sort=relevance|employeeId|employeeId:desc|fullName|fullName:desc`, extra exact filters `employmentType`/`departmentId`/`positionId`, plus `middleName` in haystack and a `fuzzy` counter in the response.
- **Fuzzy prefilter bug found+fixed via live proof:** unit tests (fake prisma ignores where) masked that the old DB AND-of-subterms prefilter excluded typo-only candidates before scoring. Handler now fetches the filter-scoped pool (take 5000) without text matching and does AND-of-terms matching in app. Live proof: `zan andrei` → count 1 fuzzy 1; `query=z` → total 486; page 2 → 00212; `sort=employeeId:desc` → TESTBEN004; `andersen` → 0 (correct: distance >2 from Andrei).
- **Tests:** `tests/employee-integration-search.spec.ts` 13 + `tests/integration-api-key.spec.ts` 8 = 21 passing (exit 0). Typecheck clean for touched files (pre-existing unrelated errors unchanged).
- **Curl for the other team (local):** `curl --location 'http://localhost:3001/api/employee/search?query=z&limit=10' --header 'X-API-Key: <key from INTEGRATION_API_KEYS>'`. JWT path: login then `Authorization: Bearer <token>`. Environment ports: PROD 3001 / DEV 3101 / UAT 3201 on VM 10.184.37.19; public `api|dev-api|uat-api.bnpi-hris.tech`. Runtime envs need `INTEGRATION_API_KEYS` set or API-key auth returns 503 (fail-closed by design).
- **Docs before develop push (operator request):** canonical consumer/operator doc added at `docs/INTEGRATION_EMPLOYEE_SEARCH_API.md` (auth both modes, key rotation, full param table, matching semantics, response schema, error codes, env URL matrix, JS/Python/cURL samples, ops notes, changelog); OpenAPI block in `employee.router.ts` feeds `/docs`; `docs/`-style integration URL matrix mirrored in `.wwg/wiki/project-truth.md` (appended section avoids the pre-existing head conflict markers).


- **Shipped:** `GET /api/employee/search` in `hris-api` — lightweight, integration-friendly employee search. JWT-protected like all employee routes (other apps use the standard login Bearer token; no new API-key mechanism was invented). Registered in `employee.router.ts` BEFORE the `/:id` catch-all.
- **Contract:** `?query=<text>` (aliases `q`, `search`; required, 400 when missing), `limit` (default 10, cap 50), optional `employmentStatus` exact filter. Multi-word terms are AND-matched case-insensitively across `employeeId`, `person.personalInfo.firstName/lastName`, `person.contactInfo.email` (same semantics as the list `query` param). Response is the standard success envelope with `data.employees[]` flat rows (`id`, `employeeId`, `firstName`, `middleName`, `lastName`, `fullName`, `email`, `employmentStatus`, `employmentType`, `department {id,name}`, `position {id,title}`) plus `count`, `query`, `limit`. No salary/payroll fields are exposed. 30s response cache keyed on the query string. Activity-logged (`SEARCH_EMPLOYEES`).
- **Code:** handler `searchEmployees` in `hris-api/app/employee/employee.controller.ts` (exported in the controller return object); route + OpenAPI block in `hris-api/app/employee/employee.router.ts`; constants `EMPLOYEES_SEARCHED` / `SEARCH_EMPLOYEES` / `EMPLOYEES_SEARCHED` (success message / action / description) in `config/constant.ts`.
- **Tests:** `hris-api/tests/employee-integration-search.spec.ts` — 7 passing (real controller + fake prisma; covers 400 guidance, q/search aliases, AND-of-OR term building, status filter, limit clamp, flat mapping without payroll fields, middleName omission). `tsc --noEmit` clean for all touched files (pre-existing unrelated errors remain documented).
- **Live proof (local `localhost:3001`, admin@bandai.local, .runtime/employee-search-proof-20260904-153358/):** `?query=zen&limit=5` → 200, count 5, 2.0s; `?q=zen%20andrei` → count 1 (Zen Andrei); `?query=zen&employmentStatus=TERMINATED` → count 0; missing query → 400; unauthenticated → 401. JSON captures saved. (Superseded by the fuzzy/pagination/X-API-Key addendum at the top of this file.)

## Latest Task Addendum - 2026-09-04: Timekeeper accounts missing from runtime DB — diagnosed + provisioned on DEV

- **Operator symptom:** cannot open any timekeeper account on BNPI Bandai. Login with `timekeeper1/2@seed.local` returned 401 on `localhost:3001`, `dev-api.bnpi-hris.tech`, AND `api.bnpi-hris.tech` (probe evidence `.runtime/timekeeper-login-probe-20260904-112100/login-probe.json`).
- **Root cause (DB-proven):** K3s DEV `users` table had **zero** `hris-timekeeper` rows (role counts: employee 2025, hr-user 17, employee-manager 6, admin 2, hr-manager 2, super_admin 1). The two timekeeper definitions existed ONLY as an uncommitted local edit to `hris-api/prisma/seeds/generalEmployeeSeeder.shared.ts` (documented in `TIMEKEEPER_SEED_PROMPT.md`) and were never materialized in any runtime DB. Runtime DBs are never seeded by design (GitOps `hris-api-db-init` Job is schema-only `prisma-postgres:push`; full `prisma-seed` on runtime DBs is banned — it can reset timesheet/attendance data). The prompt file's original "run `npm run prisma-seed` inside the VM" instruction was UNSAFE and has been rewritten to point at the scoped script.
- **Fix shipped:** new idempotent ops script `hris-api/scripts/provision-timekeeper-accounts.ts` (dry-run default, `--execute` + optional `--reset-password`, `--database-url` override; imports repo-generated client from `../generated/prisma`). It creates ONLY the missing Person/User/Employee rows for the two kiosk accounts, cloning org refs (HR dept / HR-OPS section / HR-GEN position / Entry level / reports-to seed HR manager) from the existing seed HR manager row. No attendance/timesheet/payroll data touched.
- **Executed on K3s DEV (`127.0.0.1:55435`):** dry-run plan → execute, both accounts `created` (user `cmtmedw4v…`/`cmtmee87n…`). Password `password123`, bcrypt 10, role `hris-timekeeper`, status active. Note: host env `PROJECT_TRUTH_DEV_PG_DATABASE_URL` points at unreachable compose DEV `10.184.37.19:15433` — script was forced to the canonical K3s forward via `--database-url`.
- **Live proof (public DEV):** login 200 for both accounts on `dev-api.bnpi-hris.tech`; `/auth/me` role = `hris-timekeeper`. Headless Playwright on `https://dev.bnpi-hris.tech`: both accounts redirect to `/time-logging` and the BIOMETRIC TIME SYSTEM kiosk renders (camera denial is headless-only noise; pre-login `/auth/me` 401 console noise is known). Evidence: `.runtime/timekeeper-kiosk-proof-20260904/` (results.json, results-tk2.json, screenshots, scripts), `.runtime/timekeeper-postfix-proof-20260904-113225/`.
- **NOT done (needs operator approval — production mutation):** UAT (`uat-api.bnpi-hris.tech`) and PROD (`api.bnpi-hris.tech`) still have no timekeeper accounts (PROD 401 proven pre-fix; UAT untested). Run the same script against the VM-forwarded UAT/PROD DBs (15434/15432 via SSH tunnel) on explicit approval.

## Latest Task Addendum - 2026-09-03: Stray ssh/cloudflared console windows during npm run dev (fixed)

- **Symptom:** on a desktop session, `npm run dev` left two stray console windows on the taskbar: `C:\Windows\System32\OpenSSH\ssh.exe` and `C:\Program Files (x86)\cloudflared\cloudflared.exe`.
- **Root cause:** `scripts/start-hikvision-remote-device-tunnel.ps1` created its detached long-lived ssh.exe via WMI `Win32_Process.Create` without `CREATE_NO_WINDOW` — WMI-created console processes get a brand-new VISIBLE console on interactive desktop sessions; the cloudflared `access ssh` ProxyCommand child rides beside it. The DB-forward and vm-bridge ssh paths were already `Start-Process -WindowStyle Hidden`, which is why only this pair appeared.
- **Fix (`a2e0eb15`):** build the tunnel ssh through `Start-Process -WindowStyle Hidden` (same proven detached pattern as `start-k8s-dev-db-access.ps1`). Start-Process children are not in the caller's Job Object, so the tunnel still survives predev/npm exiting. First attempt with `Win32_ProcessStartup` via `Invoke-CimMethod` failed (ReturnValue=21, invalid embedded CIM instance) — abandoned for the Start-Process path.
- **Live proof:** tunnel restarted via `project-truth-hris` → status `running`, all 18 forwards `TcpOk=true` (10080-10085/10443-10448/18000-18005), new ssh PID 14440 `MainWindowHandle=0`, survived launcher shell exit with listeners still bound. Pushed to `origin/develop`.
- No new recommendations identified.

## Latest Task Addendum - 2026-09-03: Dev workstation onboarding automation (SSH + DEV DB access)

- **Problem:** a second dev machine (`C:\Users\Argel`) running `npm run dev` hard-failed at predev step 4/9 `ensure-bnpi-db-access`: `scripts/start-k8s-dev-db-access.ps1` throws `SSH key not found at %USERPROFILE%\.ssh\node-health-appliance_ed25519` (workstation-only file, never committed), then predev mislabeled the failure as `ensure-dev-port-ownership` (parallel-phase reporting bug).
- **Shipped:** `scripts/setup-dev-ssh-access.ps1` — interactive, idempotent one-time onboarding: generates the ed25519 key only when missing (recovers lost `.pub` via `ssh-keygen -y`), appends `Host project-truth-lan` + `Host project-truth-hris` (cloudflared ProxyCommand) to `%USERPROFILE%\.ssh\config` with backup, installs the pubkey into VM `infra` authorized_keys (LAN-first; Cloudflare Access browser sign-in — 1bis.solutions.tech — fallback, then one interactive `infra` password prompt; VM sshd `PasswordAuthentication yes` verified live 2026-09-03 via `sshd -T`), verifies with BatchMode SSH, offers winget cloudflared install when LAN closed + cloudflared missing. `-VerifyOnly` read-only mode. Evidence: `.runtime/dev-ssh-setup-<stamp>/`.
- **Wired into `npm run dev`:** `hris-api/scripts/ensure-bnpi-db-access.cjs` now diagnoses blockers (missing key / ssh.exe), prints exact fix commands, and on a TTY asks `Run the one-time workstation SSH setup now? [Y/n]` — yes runs the setup then retries the forward. Non-TTY (CI/agents) never prompts: `HRIS_SKIP_DEV_SSH_SETUP=true` suppresses; final error carries the full guidance. Compose-DEV fallback refusal unchanged (explicit opt-in only). `PROJECT_TRUTH_SSH_KEY` env override added to both scripts.
- **predev-run.cjs fix:** parallel phases now report the ACTUAL failing step (`failedId` per spawn) instead of the first step of the phase.
- **Tests:** `hris-api/tests/ensure-bnpi-db-access.spec.ts` extended — 5/5 passing (exit 0), covering prompt-suppression matrix and guidance copy (script path, key name, 1bis.solutions.tech sign-in, dev:local alternative).
- **Live proof on this host:** setup `-VerifyOnly` → LAN SSH OK + Cloudflare alias SSH OK (exit 0); full idempotent run → "key already present", config backup + additive `project-truth-lan` entry, "ALREADY authorized", exit 0; warm-path probe `ensure-bnpi-db-access.cjs` → `Resolved DEV datasource to 127.0.0.1:55435` in 0.02s; missing-key failure probe (port 55499, bogus key, non-TTY) → blocker diagnosis + onboarding commands + exit 1 with compose guard intact.
- **Docs:** new `docs/DEV_WORKSTATION_ONBOARDING.md`; `docs/LOCAL_WINDOWS_REMOTE_DEV_BOOTSTRAP_20260720.md` points to the automated path. npm alias `hris-api`: `npm run setup:ssh`.
- **No new recommendations** beyond this delivery.

## Latest Task Addendum - 2026-09-03: Payroll domain audit (read-only)

- **Audited the payroll domain on restored `develop` (`d78afe29`) — read-only, no code/config/data changes.** Report: `.wwg/reports/payroll-audit-20260903.md`.
- **Healthy:** BNPI register rules live in production paths (Basic Path A `FILE_PAID_DAYS_X_DAILY` / Path B `PERIOD_BASIC`, 313 daily-rate basis `BANDAI_DIRECT_ANNUAL_WORK_DAYS`, FILE_DUAL OT; `payroll-period.helper.ts:2002/2029` generate + `:5091/:5116` preview); Run Payroll OT readiness wired (`payrollperiod.controller.ts:1079-1080`); generation job observability honest (heartbeat/pause/cancel/orphan fields). **Tests: 184 passing / 0 failing (TESTEXIT=0)** across all 22 runnable payroll specs.
- **5 findings:** F1 (P2 latent) org-policy auto-approve stamped `approvedBy = employeeId` (`timesheet.controller.ts:4676`) and `resolveOtApprovalMeta` ignores the `ORG_POLICY_ENABLE_AUTO_APPROVE` marker → Run Payroll would show submitter's self-approval as "Manager approved" once flag flips ON; F2 (P2) `tests/unit/payroll-generation-job.service.test.ts` is vitest-based in a mocha repo and never runs (`.test.ts` outside `tests/**/*.spec.ts` glob; vitest not installed) → PayrollGenerationJobService has zero executed coverage; F3 (P3) `calculatePayrollBreakdown` (`payroll-calculator.helper.ts`) is test-only with a rate basis contradicting the register (basicSalary/scheduleWorkDays vs ×12/313) — drift risk if ever wired; F4 (P3) the OT-import auto-approve chain (`bandai-payroll-ot-auto-approve.helper.ts` + `bandai-ot-line-patch.helper.ts`) is only consumed by ops script `repair-bandai-payroll-source-timesheet-lines.ts`; F5 (P3) hris-api CI runs only `test:regression:payroll-source-truth`, payroll specs not CI-enforced.
- **Registered:** `REC-20260903-OT-READINESS-POLICY-AUTOAPPROVE-LABEL`, `REC-20260903-PAYROLL-GENJOB-VITEST-DEAD-SPEC`, `REC-20260903-PAYROLL-CALC-HELPER-TEST-ONLY` (all Proposed, owner triage pending). Prior truth (2026-08-13 app-vs-file findings, 2026-08-11 tally, 2026-08-18 loans) re-verified intact and not superseded.

## Latest Task Addendum - 2026-09-03: develop mass-deletion incident + restore (PR #9 conflict root cause)

- PR #9 was reported CONFLICTING. Root cause was NOT the feature branch: two "save" commits by malasaernestdodz pushed to origin/develop on Sep 2 (`fb326549` then `653d3c32`, 7s apart) deleted **3,793 tracked files** (all of `hris-app/`, most of `hris-api/`, `scripts/`, `gitops/`, `appliance/`, `installer/`, `README.md`, `.github/` workflows) and added zero content. Verified `653d3c32`'s tree is a strict subset of last-good `85327bd2` (only `.gitignore` EOL change, then deletion). PR #9's 3-file conflicts were modify/delete artifacts of that gutting. Full report: `.wwg/reports/develop-gutted-restore-20260903.md`.
- Restore: gutted tip preserved at `backup/develop-gutted-20260903`; restore commit `5e4c3046` built via `git commit-tree` (tree of `85327bd2`, parent `653d3c32`) and fast-forward pushed — **no force push**, both "save" commits remain in history. Remote develop verified at `5e4c3046` via `git ls-remote`.
- Local: a concurrent/background `git pull` merged the gutted develop (`653d3c32`) into `feature/attendance-per-section` mid-operation (MERGE_MSG: "Merge branch 'develop' of https://... into feature/attendance-per-section"); aborted cleanly (`git merge --abort`, working tree verified intact). Then merged restored develop → merge commit `1d04dd40`, **zero conflicts** (develop side == merge-base tree, so the feature's versions of the 3 conflicted files survive). Merge commit reached origin via the same background sync (push showed "Everything up-to-date"; PR headRefOid = 1d04dd40). Avoid parallel git operations in this worktree while agents work.
- Verification evidence: PR files all present post-merge (`docs/OVERTIME_SOURCE_OF_TRUTH.md`, `hris-api/app/timesheet/timesheet.controller.ts` with `resolveTimesheetSubmissionOutcome` at :170/:3410, `hris-app/app/routes/admin/rules-policies/timesheet.tsx`, `hris-api/tests/timesheet-auto-approve.spec.ts`); `git diff --stat 8c4d2d29 HEAD` empty (merge added zero content); `git diff --name-only --diff-filter=D 85327bd2 HEAD` count = 0; `tests/timesheet-auto-approve.spec.ts` passed (TESTEXIT=0, 15 passing; DB logger noise from offline `10.184.37.19:15433` is known non-fatal).
- CI note: develop CI was already failing 5s-fast BEFORE the gutting (runner-level, unrelated). Watch restored develop CI separately.
- REC-20260902 wiki merge-conflict finding: superseded by this addendum's restore record — PR #9 conflict = develop gutting, resolved.
- Housekeeping still pending user decision: `project-truth.md` conflict-marker cleanup (pre-existing, untouched).

## Latest Task Addendum - 2026-09-02 Auto-approve regression tests: direct-invocation coverage (15 tests)

- `hris-api/tests/timesheet-auto-approve.spec.ts` extended from 6 helper-level tests to **15 passing (exit 0)** by adding 9 direct-invocation integration tests that call the real controller handlers (`controller(prisma).action/submit/getConfig/updateConfig`) against a recording fake prisma — no DB, no Redis, no mocks of house code.
- Coverage now spans all 3 submission paths × flag ON/OFF: action `SUBMIT` (OFF × false/null/undefined + ON), `submit()` resubmit branch (OFF/ON), `submit()` auto-generate branch (OFF/ON), plus controller-level proof that auto-approve **never bypasses the edit-permission correction gate** (403 even with flag ON), and the `getConfig`/`updateConfig` derivation `approvalRequired = !enableAutoApprove` (flag false/null/undefined/true).
- Key fake-prisma mechanics (reusable pattern): mutation recorder with **last-match** lookup (helper-internal summary updates precede the controller's status/metadata update); `$transaction` callbacks receive the **proxy itself** (a raw literal hides fallback models like `requestTransaction` inside `createOrReuseTimesheetSubmissionRequest`); `WF-TIMESHEET-DEFAULT` workflow template seeded so OFF flows exercise the REAL request-creation chain (`request.create` → step executions → notification no-op via missing `currentStepExecution`); `payrollPeriod.findMany → []` short-circuits obligation recompute.
- New implementation truth proven by the run: the **auto-generate branch responds 201** (not 200) on success — `submit()` tail L4943 — and its error path returns 400 with `error.message`; OFF flows create the TIMESHEET approval request with `metadata.timesheetAction: "SUBMISSION"`, ON flows create no request.
- Run evidence: `.runtime/auto-approve-test-run3.log` (15 passing scoped), `.runtime/auto-approve-test-combined.log` (26 passing incl. getById + submit-eligibility specs). Floating real-prisma logger noise (`Can't reach database server at 10.184.37.19:15433` from `logActivity`/`logAudit`) is expected in offline test runs — caught internally, non-fatal.
- Housekeeping still pending user decision: `project-truth.md` merge conflict, hris-app `tsc --noEmit`, pushing local commits `5f47e115` + `e5dfafe5`.


## Latest Task Addendum - 2026-09-02 Auto Approve Timesheet made functional (submit paths + UI toggle)

- **Enabled the admin "Auto Approve Timesheet" toggle end-to-end**: when `TimesheetConfig.enableAutoApprove` is ON, timesheet submissions now land directly as `APPROVED` with no approval Request created and no review step (Bandai requirement: automatic approval on submission). When OFF, behavior is unchanged (SUBMITTED + approval request). Already-SUBMITTED timesheets keep requiring manual approval — the flag affects future submissions only.
- **Implementation (`hris-api/app/timesheet/timesheet.controller.ts`)**:
  - New pure helpers exported next to `evaluateTimesheetSubmitEligibility`: `resolveTimesheetSubmissionOutcome(enableAutoApprove)` → `{ status, autoApproved }` and `buildAutoApprovedSubmissionMetadata(existingMetadata, submittedAt, submittedBy)` (mirrors the manual APPROVE snapshot shape: `snapshotState: "APPROVED"`, `snapshotLockedAt/LockedBy`, plus `autoApproved: true` and `autoApprovedReason: "ORG_POLICY_ENABLE_AUTO_APPROVE"` for audit).
  - All 3 submission paths honor the policy: action `SUBMIT` case (~3410/3478, request creation guarded at ~3633), employee `submit` resubmit branch (~4588/4664, request guarded at ~4769), and new-timesheet auto-generate branch (~4836 passes `submissionOutcome.status` to `generateTimesheetForEmployee`, ~4860 stamps auto-approve metadata / skips request).
  - `getConfig`/`updateConfig` now return `approvalRequired: !enableAutoApprove` (was hardcoded `true`).
- **UI (`hris-app/app/routes/admin/rules-policies/timesheet.tsx`)**: removed `disabled` from the Auto Approve toggle (page already persisted the field) and added an "Auto approve: Approved on submit / Manual review" chip to the Source Of Truth Snapshot grid.
- **Tests**: new `hris-api/tests/timesheet-auto-approve.spec.ts` (6 tests: OFF keeps SUBMITTED flow incl. undefined/null, ON lands APPROVED, auto-approve never bypasses the edit-permission resubmission gate, metadata shape + no mutation). Scoped run: 15 passing (6 new + 9 existing eligibility/refresh), exit 0.
- **Endpoint proof**: admin login → `GET /api/timesheet/config` → `PATCH { enableAutoApprove: true }` → GET shows `enableAutoApprove: true, approvalRequired: false` → restored to `false/true`. Evidence: `.runtime/endpoint-proof-auto-approve-20260902-144020/` (4 JSON captures).
- **Typecheck**: `tsc --noEmit` on hris-api reports zero errors mentioning timesheet files (pre-existing errors in unrelated files remain, e.g. statutory-remittance.generator.ts, apiActivityLogging.ts). Note: hris-app ESLint is broken at tool level on this host (`createRequire` redeclaration crash before any file is linted — reproduced on untouched `setup.tsx`; pre-existing, not caused by this task).
- **Not touched**: workflow engine, request-runtime, notifications, payroll, device code. No Prisma migration (column already existed, `timesheet.prisma:34`).
- **Frontend admin browser proof (headless Playwright, exit 0)**: real UI login as `admin@bandai.local` → `/admin/rules-policies/timesheet`. "Auto Approve Timesheet" switch found among 7 page switches with `disabled:false`, hydrated from live `GET /api/timesheet/config` (200: `enableAutoApprove=false`, `approvalRequired=true`); click flips `unchecked→checked` (local draft only — NOT saved, org config unchanged); "Auto approve → Manual review" snapshot chip renders. 6 console errors are pre-login `/auth/me` 401 bootstrap noise, unrelated. Evidence: `.runtime/browser-evidence/auto-approve-admin-2026-09-02T07-07-46/` (results.json + 2 screenshots).
- **Doc truth-sync**: `docs/OVERTIME_SOURCE_OF_TRUTH.md` §3 `enableAutoApprove` row updated with the now-functional policy and `approvalRequired = !enableAutoApprove` derivation. Save-path wiring verified in `timesheet.tsx` (L85 hydrate, L121 save payload includes `enableAutoApprove`).
- **CONFLICTING (pre-existing, committed)**: `.wwg/wiki/project-truth.md` carries merge-conflict markers at L1-6 plus a duplicated `# Project Truth` H1 (L3 vs L464) — broken state is committed at HEAD on `feature/attendance-per-section`. Durable wiki section for this feature deferred; registered `REC-20260902-WIKI-PROJECT-TRUTH-MERGE-CONFLICT` (Proposed).


## Latest Task Addendum - 2026-08-31 Beneficiaries (children) persistence fix — controller schema bypass + default fields query

- **Diagnosed and Fixed persistence issue**: The employee composite PATCH route was crashing with a `PrismaClientValidationError` because the raw `children` array was passed directly into `prisma.person.update()`. We updated the controller to strip `children` before updating the `Person` record and to use the `syncPersonBeneficiaries()` utility to handle relation syncing.
- **Fixed missing imports**: Imported `syncPersonBeneficiaries` from `employee.helper.ts` in `employee.controller.ts`.
- **Restored deleted controller code**: Discarded accidental working copy modifications that had removed variable declarations (`personId`, `userId`, `uploadedAvatarUrl`) which caused a `ReferenceError` on update.
- **Resolved query defaults & soft-delete filtering**:
  - Frontend: Added `"person.children"` to default fields query in `useEmployees.ts` so that beneficiaries are requested and loaded.
  - Backend: Added `applyEmployeePersonChildrenSelectionDefaults()` to `employee.controller.ts` to filter out soft-deleted children when `person.children` fields are selected in list or single employee queries.
- **Enforced Beneficiary Age Limit for Birthday Gifts**: Enforced a rule in `payroll-period.helper.ts` restricting child beneficiary birthday gifts to children who are 12 years old or under in the payroll period year. Also fixed a bug in the employee birthday matching logic that compared birth year to the payroll period year.

## Latest Task Addendum - 2026-08-31 Beneficiaries (children) feature — backend CRUD + frontend form + display

### Naming Convention (Important)
- **User-facing term**: "Beneficiaries" (used in UI labels, section headers, button text, comments)
- **Prisma relation**: `person.children` (cannot change without a migration — this is the schema-defined relation name)
- **API payload key**: `person.children` (must match the Prisma relation for the API to work)
- **Backend function/variable names**: `syncPersonBeneficiaries`, `beneficiaries` (not `children`)
- **Frontend local variable names**: `beneficiaries`, `addBeneficiary`, `removeBeneficiary` (not `children`, `addChild`, `removeChild`)
- **Exception**: Form field paths like `person.children.${index}.firstName` must use `children` to match the API payload structure

This convention ensures the user sees "Beneficiaries" everywhere in the UI while the backend code maintains clean, consistent naming that matches the domain language. The Prisma relation name is a technical constraint that cannot be changed without a database migration.

### What was built
- **Backend**: `syncPersonBeneficiaries()` function in `hris-api/helper/employee.helper.ts` handles upsert/delete of beneficiary records
- **Backend**: Employee controller create/update flows call `syncPersonBeneficiaries` after person creation/update
- **Backend**: Employee GET endpoint includes beneficiaries in the person response (where `isDeleted=false`)
- **Frontend**: Beneficiaries section added to `PersonalDetailsForm.tsx` with dynamic add/remove rows (firstName, middleName, lastName, dateOfBirth, gender, isDependent toggle)
- **Frontend**: Read-only beneficiaries display added to `personal-info-tab.tsx` using `Baby` icon
- **Frontend**: Employee form types and API service types updated with `children` array (matching API payload)

### Purpose
Beneficiaries (children/dependents) are tracked for birthday gift eligibility during payroll generation — ₱300 per birthday per person (employee + each dependent beneficiary with birthday in the payroll month).

## Latest Task Addendum - 2026-08-31 April 26–May 10 tally: 0/830 tallied — absent policy wall (same as Jul periods)

- Ran `npm run tally:period -- --period=PP-20260426-20260511` against client Sheet2 register (830 employees, 850 in register).
- **Result: 0 TALLIED.** OT_MATCH_ONLY 826, OT_OK_NEAR_50 2, UNMATCH 2.
- **Absent wall (dominant):** 268 people charged ₱218,467 absent in app vs ₱0 in Sheet2. App follows Mon-Sat schedule truth; client does not charge those same days. Same root cause as Jun26–Jul10 and Jul11–25.
- **PFA mismatch:** 164 people, -₱32,800 — separate data issue (contribution basis or rate).
- **Loan differences:** hdmfSl 21/-₱12.6k, rcbc 14/₱-8.5k, sssSl 6/-₱3.8k.
- **Late:** 31 people, -₱9,066.
- Cascade: absent → gross (-₱351k) → tax (-₱44k) → deductions (+₱215k) → net (-₱566k) → totalReceivable (-₱1.02M).
- Evidence: `.runtime/tally-PP-20260426-20260511-2026-08-31T03-10-16/`
- Status: Documented, awaiting absent policy ruling before repair.

## Latest Task Addendum - 2026-08-29 One-Command Period Folder Ingestion & July 11–25 Parity Proof

- **Delivered**: `hris-api/scripts/import-period-folder.mjs` (CLI: `npm run import:period -- --dir="<folder>"`).
- **Features**:
  - **2-Tier Classifier**: Tier 1 fuzzy filename matching + Tier 2 sheet & column header fingerprinting.
  - **Dependency Ingestion**: Automatically ingests Manpower Databank, WorkSharing Schedule, Period Leave, Compensation, Deduction, Biometrics Attendance, and Approved Overtime Details.
  - **Automated Post-Import Synchronizations**: Runs Universal MLA guarantee, Active Loan Horizon extensions, Punch Late/UT recalculation, and WorkSharing off-day & Sunday rest-day alignment.
  - **Zero Sheet2 Dependency**: Production execution operates 100% on uploaded files and database records.
- **Multi-Period Parity Proof (July 11–25 `PP-20260711-20260726`)**:
  - `regOtHrs`: **818 / 818 (100.0% Exact Match)** — `0.00 hrs` delta across whole company.
  - `aon` / `pfa`: **818 / 818 (100.0% Exact Match)**.
  - `monthlySalary` / `basicPay`: **817 / 818 (99.9% Match)** — `₱150.00` total delta.
  - `ot` Pay: **816 / 818 (99.8% Match)**.
  - `mla`: **816 / 818 (99.8% Match)**.
  - `arp`: **817 / 818 (99.9% Match)**.
  - `numberOfDays`: **813 / 818 (99.4% Match, 100.0% within 1 day)**.
  - `leavePay`: **813 / 818 (99.4% Match)**.
  - `late` & UT: **763 / 818 (93.3% Match)** — improved from 78.1% in June to 93.3% in July.
  - Loans (`rcbc`, `hdmfSl`, `sssSl`, `mhdmf2`): **96.6% – 99.3% Match**.
- **Documentation**: Added `docs/02-engineering/PERIOD_FOLDER_INGESTION_RUNBOOK.md` and updated `docs/dm-migration-workflow.md`.

## Latest Task Addendum - 2026-08-27 Day-status review UI & workbook refinement endpoints delivered and proven

- **Delivered**: Read-only day-status resolution pipeline under Mon–Sat schedule truth (Sunday REST).
- **Precedence**: `OUT_OF_TENURE` > `REST_SUNDAY` > `PRESENT_PUNCH` > `PRESENT_SCHEDULE_POSITIVE` > `ABSENT_AWOL_EVIDENCED` > `LEAVE_PAID` > `LEAVE_UNPAID` > `REVIEW_NO_EVIDENCE`.
- **API**:
  - `GET /api/payrollperiod/:id/day-status-review` — DB-only buckets + review queue.
  - `POST /api/payrollperiod/:id/day-status-review/workbook` — multipart in-memory refinement with `leaveFile` and `awolFile`.
- **Helper**: `hris-api/helper/day-status-resolution.helper.ts` (12/12 unit tests passing).
- **Frontend**: `/hr/day-status-review` (service, spec, route, sidebar entry, period selector, bucket chips, weekday histogram, DataTable with pagination, CSV export, in-memory workbook refinement).
- **Live Endpoint Proof**:
  - Jun26–Jul10: DB-only review queue 18,889; Refined with combined June+July leave workbook + AWOL workbook: LEAVE_PAID 657 (+115 days recovered), LEAVE_UNPAID 208, AWOL_EVIDENCED 244, REVIEW_NO_EVIDENCE 18,322.
  - Jul11–Jul25: DB-only review queue 19,093; Refined: LEAVE_PAID 607, LEAVE_UNPAID 209, AWOL_EVIDENCED 186, REVIEW_NO_EVIDENCE 18,698.
- **Playwright Proof**: Headless browser test verified login as `admin@bandai.local`, navigation to `/hr/day-status-review`, period selection, bucket chips rendering, workbook refinement, and DataTable pagination. Screenshots and JSONs in `.runtime/browser-evidence/day-status-review/` and `.runtime/day-status-live/`.
- **Governance**: `REC-20260826-DAY-STATUS-REVIEW-QUEUE` flipped to Implemented in `.wwg/governance/recommendation-registry.md`.

## Latest Task Addendum - 2026-08-26i Mon–Sat + Leave/AWOL tally simulation: charged cohort improves, fleet net worse; AWOL adds zero matches

- Operator asked whether dropping WS entirely (universal Mon–Sat schedule, Sunday rest) + Leave + Awol files tallies better. READ-ONLY simulation over register∩DB scope for both July cutoffs (`monsat-tally-sim.ts`, evidence `.runtime/monsat-tally-sim-2026-08-26T11-16/REPORT-MONSAT-TALLY.md`).
- **Sunday REST proven safe**: 0 Sunday punches in 19,507 punch cells across both windows; client WS marks Sundays worked 1,453× with zero biometric support. Future real Sunday work auto-classifies PRESENT via punch.
- **Mon–Sat helps the charged cohort**: exact-day match vs register Absent-Amt jumps from ~0 today to **56/172** (Jun26–Jul10) and **50/174** (Jul11–25); best config V2 (+unpaid-ledger-as-absent) cuts charged-cohort money error ₱298.7k→₱165.7k and ₱270.1k→₱139.0k.
- **But fleet-net WORSE**: bare no-evidence days auto-charged as absent create **₱462.8k–573.5k/window of new false charges on 405–494 uncharged people, 72–84% Saturdays**. Weekday no-evidence days collapse to 83/13 fleet-wide — everyone punches or has evidence Mon–Fri; ambiguity lives almost entirely on person-specific Saturdays (the signal the WS file carried).
- **AWOL file ablation-proved zero tally contribution**: V1≡V6 identical matches; as sole source 0/172 & 0/174. Stays DA/disciplinary evidence labels only (244/186 days relabeled inside the absence pool).
- **Leave ledger structurally essential under Mon–Sat**: resolves 859/1,629 (53%) and 816/1,888 (43%) of missed scheduled days into leave classes instead of absences.
- Ceiling violations persist (18/5 people charged more absences than they have missed days) → client charging remains partially manual regardless of schedule model.
- Recommendation (Proposed, REC-20260826-DAY-STATUS-REVIEW-QUEUE): adopt Mon–Sat+Sun-rest schedule truth + day-status pipeline (punch>WS1>ledger/AWOL), bare no-evidence days → REVIEW QUEUE not silent ABSENT; client questions sharpened (Saturday policy, precedence, roster hygiene). No engine/DB writes this pass.

## Latest Task Addendum - 2026-08-26h Universal MLA shipped: all Bandai (DIRECT) employees, every cutoff, forever

- Operator directive: MLA = all Bandai employees FOREVER; docs + engine + script.
- Engine: `applyUniversalBandaiMlaSources` (payroll-benefit-source.helper.ts) wired into `buildPayrollSourceAmountsByEmployeeId` → injects ₱500 RECEIVABLE_ONLY non-taxable MLA for DIRECT employees lacking a resolving source; agency excluded. Covers preview + generate via single seam.
- Backfill executed locally: `repair-bnpi-mla-universal.ts --execute` → 846 DIRECT actives / 824 covered / **+23 created** (open-horizon RECURRING EVERY_CUTOFF).
- Proof: Jun26–Jul10 tally register MLA fails **818 → 0**; Alexa appMLA=500/dMLA=0 (her residual Δ+1,434.98 = absent policy ₱1,834.50 − PH basis +₱398.75 walls). Tests 37 passing (`bnpi-universal-mla.spec.ts` new). Docs: project-truth-summary, findings §14g MLA row, runbook app-native bullet.
- Ops note: `tsx watch` reload proved unreliable during verification — after engine edits restart API and confirm via live response before measuring (cost: two false-negative tally runs).

## Latest Task Addendum - 2026-08-26g AWOL workbook evaluated: DA-tracker, partial silent-zero resolver, NOT the payroll-absence source

- New file `confidential-files/Awol (July 1-31, 2026).xlsx`: 157 ppl / 726 day-rows Jul 1–31, LeaveType=AWOL, all Unpaid, "For DA Issuance", same ledger schema (existing helper parses it). Remarks provenance: blank 433 / RD 152 / "no file" 115 / AWOL 24 / Resigned 2.
- Coverage: Jun26–Jul10 → **347 day-rows / 114 people**; Jul11–25 → 257 / 92. Resolves **101 of 799** silent zeros (Jun window) as ABSENT.
- **NOT** the Sheet2 Absent-Amt source: 0/177 register-charged people match (top absent cohort has zero AWOL rows). Conflicts needing precedence ruling: 172 punched-on-AWOL days, 92 on WS=1, 152 marked RD. Alexa not in file despite 3 register-charged absences.
- Value: day-status evidence feed for part of WS-zero ambiguity + proof client tracks daily absences; future ingest needs order + precedence rules; never LVP pay (Unpaid). Evidence: `.runtime/verify-period-leave-20260826/awol-*-proof.txt`, REPORT-WS-ZERO-FINDING.md addendum.

## Latest Task Addendum - 2026-08-26f WS `0` is ambiguous per client (Rest|Absent|Leave) — investigation only, no writes

- Client: WS `1`=worked; `0` = Rest OR Absent OR Leave, no discriminator; client has no basis either.
- **Resolves prior "client contradiction" classification** (Absent-173/Alexa): Sheet2 absence charges are compatible with WS=0; discriminator data was never in the file.
- Triangulated all 3,437 register-scoped zero-days (Jun26–Jul09; file lacks Jul 10 col + has duplicate employee rows, merged): punched-anyway **2,151 (63%)** (corroborated by RD Hrs Pay>0 on 224 people), leave-ledger **487**, silent zeros **799**. App currently marks 432 of them REST_DAY with only 11 ABSENT lines vs register charging 175 people / ₱628,413.64.
- No mechanical rule reproduces client absent charges: silent-zeros==implied matches only **53/175** (+WS1-no-shows variant 30/175). Alexa day-grid shows her own 4 sources disagreeing per-day (punches ON unpaid-'A' ledger days).
- Lacking (ranked): day-level absence ground truth from client, conflict-priority ruling, UNPAID type-A taxonomy, holiday calendar, half-day convention, manual-exclusion list.
- Report (read-only): `.runtime/verify-period-leave-20260826/REPORT-WS-ZERO-FINDING.md` + triangulation proofs.

## Latest Task Addendum - 2026-08-26e All-period tally script shipped: import → `npm run tally:period` → REPORT

- Operator asked for one tally script usable for ALL periods after imports.
- Shipped: `scripts/run-period-tally-compare.mjs` (`npm run tally:period -- --period=<CODE|id>`), helper `helper/tally-compare.helper.ts` (money/normCode/classifyTally, 22 fields incl. Leave/leavePay non-core), spec `tests/tally-compare.helper.spec.ts` **8/8**.
- Auto-resolves period from DB; built-in register map (Apr/Jun26–Jul10/Jul11–25) + `--target-xlsx`; **auto-unlocks password 9090 registers via Excel COM** (`ensureUnlockedWorkbook`); read-only vs HRIS; evidence to `.runtime/tally-<PERIODCODE>-<stamp>/`.
- Proof run 1 (parity): PP-20260626-20260711 → 818 compared, TALLIED 0 / MATCH_ONLY 813 / NEAR_50 4 / UNMATCH 1; Alexa dTotal +934.98 — identical to morning `_tmp` baseline. Proof run 2 (multi-period): PP-20260711-20260726 → 828 compared, TALLIED 22 / ALEXA_NEAR 10 / NEAR_50 49 / MATCH_ONLY 388 / UNMATCH 359.
- Runbook Phase 4 updated. Delivery+proof: `.runtime/verify-period-leave-20260826/TALLY-SCRIPT-DELIVERY.md`.

## Latest Task Addendum - 2026-08-26d Folder-imports alone ≠ tally (proven): fleet 0/818 TALLIED after Jun26–Jul10 uploads

- Operator asked whether reset + importing all `confidential-files/june26-july10/` files yields a tally / Alexa tally / which scripts first.
- Empirical: TODAY'S post-upload harness run IS that state → bands OT_MATCH_ONLY 813 / OT_OK_NEAR_50 4 / UNMATCH 1 / **TALLIED 0**. Field fails: totalDedn 818/818, mla 818/818 (MLA seam covers nobody in window), gross 676, monthlySalary 556, late 388, tax 331, absent 167, days 100. TR app-under 758 / over 60 / exact 0.
- Alexa verdict: NO until (a) absent policy ruling (−1834.50 REST-vs-absent), (b) MLA source covering ≤2026-07-10, (c) PH-vs-register decision (+398.75). OT/days/basic/late(±0.77) match.
- Script path exists but NO jun26–jul10 orchestrator yet; steps are env-parameterized: late-UT recompute, dailyRate backfill, comp-from-Sheet2 (PERIOD_* env → seeds DMA/period codes + MLA for THIS window), prior-DED history oldest→newest, LEAVE merged workbook BEFORE generate; then `_tmp-full-period-tally-compare.mjs`. Even full pipeline ⇒ Jul-class outcome (~TALLIED 67/828 + NEAR bands; rest = client contradictions).
- Evidence: `.runtime/verify-period-leave-20260826/fleet-field-fails-proof.txt` + `tally-rerun-stdout.txt`.

## Latest Task Addendum - 2026-08-26c Reset replay order proven: oldest→newest for recurring continuity; payroll-run is NOT an import guard

- Operator asked whether reset requires import-old → run payroll (lock) → import-new to avoid mixing.
- **Mixing impossible**: all mass/leave writes keyed `payrollPeriodId` or explicit open-horizon; today's imports touched only PP-20260626-20260711 (Apr=1261 / Jun26–Jul10=1694 / Jul11–25=1473 rows intact).
- **Lock ≠ guard**: migration services never check isPaid — imports write into generated/paid periods freely; only the stored EmployeePayroll snapshot is locked (PATCH 409 spec; generate skips paid, controller:1865). Late imports after generate = stale register until regenerate.
- **Oldest→newest matters for recurring seeding**: live seam proof — 824 active MLA ALL start >Jul10; ZERO cover Jun26–Jul10; 831 legacy ended exactly 07-10 (Alexa-class fleet gap). Precedent script `import-prior-deduction-mass-history.mjs` line 2 "oldest → newest". Loans order-safe via never-shrink endDate (1,356 overlap both future cutoffs). Supersede auto-ran 1,094×.
- Canonical sequence written in `.runtime/verify-period-leave-20260826/RESET-ORDER-PROOF.md` (DM4→WS→COMP+recurring→DED cumulative→LEAVE combined-file→THEN generate, per cutoff oldest-first).

## Latest Task Addendum - 2026-08-26b Alexa 01792 tally break root-caused: NOT the leave import

- Operator: Alexa tallied before on Jun26–Jul10; after today's leave imports she doesn't.
- **Leave import innocent**: all her ledger rows UNPAID type A → zero LVP rows (incl deleted), leavePay=0 both eras; Sheet2 Leave col `-`. Band ALEXA_NEAR ±0.77 → OT_MATCH_ONLY +934.98 via three other deltas:
- (1) **Absent −₱1,834.50**: today's DM4 re-upload rebuilt her timesheet to 9 PRESENT + 6 REST_DAY / ZERO ABSENT; Sheet2 charges 3 × 611.50 absent — same WS-vs-Sheet2 class as Absent-173. numberOfDays side-win 13→9 (matches).
- (2) **MLA −₱500**: legacy MLA (→2026-07-10) superseded COMPLETED by Aug-25 comp replay; open-horizon replacement starts 2026-07-11 → Jun26–Jul10 seam has no active MLA. Fleet seam audit recommended around 2026-07-10/11.
- (3) **Dedn +₱398.75** = 15,950×2.5% exact — new salary-based PH cutoff schedule charges per law; client file shows 0 for her (policy/contradiction class).
- Reconcile: +1833.73 − 500 − 398.75 = +934.98 TR ✓. No money mutations executed (need operator order). Evidence: `.runtime/verify-period-leave-20260826/ALEXA-FORENSICS.md`; prior harness evidence backed up to `.runtime/full-tally-20260811-before-recheck-20260826/`.

## Latest Task Addendum - 2026-08-26 Period leave import verification: DB persistence proven; sequential month-file imports OVERWRITE (Jun26–Jul10 damaged)

- Operator asked: does DM3 leave import save to DB, and do June+July month files cover a Jun 26–Jul 10 cutoff?
- **Persistence YES**: LVP `EmployeeBenefit` rows period-pinned + durable `period-leave` log (live fetch `cmt86rh9b00s8vgewuoj41i4j`); engine consumes via resolvePayrollBenefitSources → leavePay → GrossPay.
- **Coverage PARTIAL**: window filter proven (dry-runs vs real workbooks: Jun file 287.5 in-window days / 1161 skipped; Jul file 453 / 1022), but upsert overwrites per employee — no merge. Live damage: PP-20260626-20260711 has **101/387 rows underpaid, 136 lost days ≈ ₱90,377.61** (00922 stored 0.5d vs correct 4.5d). Last-imported file wins per employee.
- Operator workaround until merge ships: combine both months' sheets into ONE workbook for a two-month-spanning cutoff. REC-20260826-PERIOD-LEAVE-MULTI-FILE-MERGE (Proposed).
- Evidence: `.runtime/verify-period-leave-20260826/REPORT.md`; handoff 2026-08-26.

## Latest Task Addendum - 2026-08-25 Final tally classification: no engine faults remain — absent wall = client file contradiction

- **Absent-173 root cause PROVEN as client data contradiction**: 00573's own WorkSharing row flags 7/11, 7/18, 7/25 (Sats) = 0/OFF with shift 07:15-15:15; app correctly built 10 PRESENT + 5 REST (zero ABSENT lines); client Sheet2 still charges 1 absent day × monthly×12/313 (=611.5 exact). Their WS file and their Sheet2 disagree — app followed the operational file.
- **Post-PH-fix deductions decomposed**: contributions now near-match (SSS ₱4.0k, PH ₱7.1k, PagIBIG ₱5.8k — engine bracket/rounding class); WTax app over ₱13.6k (cascade of absent/loan bases); **loans ₱41.4k = client data** (Payment amounts differ 00374 510 vs 645.69; paid-off loans still active 01202 s2=0 vs app 695.36; TALLIED people show s2=0 loans with dedn matching → client internal regrouping).
- **Classification: zero remaining engine faults.** All open gaps = client data contradictions (absent ₱263k), client loan data (₱41.4k), client manual leave adjustments (5 rows/₱3.6k), statutory bracket config (₱16.9k), rounding (2 UNMATCH, days ₱235, OT ₱1).
- Final: TALLIED 67, UNMATCH 2, OT_OK_NEAR_50 187, ALEXA 12 (828 compared). Evidence: `.runtime/tally-jul1125-after-repairs-2026082517362/` + GAP-ELABORATION files.

## Latest Task Addendum - 2026-08-25 PhilHealth schedule fix — TALLIED 10 → 67 + reset runbook

- **PH schedule proven & implemented**: Sheet2 PH = monthly × 2.5% per cutoff (277/277 exact, no cap ≤85k); daily-rated ₱600 cohort = flat ₱390/cutoff (573/573). New `resolveBandaiPhilHealthCutoffContribution` overrides the gross-based PH in generate+preview (`bandai-philhealth-schedule.spec.ts`). Deductions gap −188k → −98,790.
- **TALLIED 10 → 67** (828 compared), OT_OK_NEAR_50 187, ALEXA 12. Remaining: absent/Saturday policy ₱263k, deductions ₱99k, leave ₱64k, ND ₱49.5k, gross ₱227k (absent-driven).
- **TZ bug fixed**: SheetJS local-midnight dates on UTC+8 shifted leave dates −1 day — re-import recovered 50 people / ₱375k→₱444k; leavePay fails → 5. TZ regression test added.
- **E2E matrix runner**: `run-payroll-tally-matrix.mjs` — 26 PASS / 0 FAIL (DB, API pins, unit specs, tally, recurrence, pending decisions).
- **Runbook**: `docs/LOCAL_DB_RESET_PERIOD_RUNBOOK.md` — fresh DB → tallied period (pack + leave + proof), app-native mode for future periods without Sheet2.
- Pushed: 5a5dd05c (pack), dd16ebfd (TZ + matrix), PH fix + runbook this push.

## Latest Task Addendum - 2026-08-25 Careful remaining-gap investigation (post-pack)

- **Stale-import found & fixed**: the operator's earlier UI leave execute ran while the watcher served old parser code — LVP rows had shifted dates/wrong days (00032 1.5 days vs file 2.5; 00342 dates −1 day). Re-ran import with current code: 321 updated, ₱375,187.78 (was ₱327,991.84). **leavePay fails 254 → 111, gap ₱106,320 → ₱63,924; net gap +₱51,767 → +₱15,811** (from −₱423k session start). ALEXA_NEAR 6, NEAR_10 10, OT_OK_NEAR_50 80.
- **Leave rule proven**: Sheet2 pays ALL paid types in-window incl. rest days (BEL/BIL/VL/ACL/CL/SL all confirmed; 00032 Sat 7/11 paid). Only ~4-5 people have manual client exclusions (00342 excl BEL etc.) — not mechanically fixable. Rest of the 111 fails: ~51 sheet-leave people whose employee codes don't exist in DB + 01624 (app-only).
- **Absent-173 mechanics proven**: 00573-class = 10 PRESENT + 5 REST (Sats/Sun), zero ABSENT lines; Sheet2 charges 1 absent day × **monthly×12/313** (611.5 exact) — client expects Mon–Sat work at BNPI daily regardless of app REST schedule. Policy decision needed (Saturday expectation) before charging.
- **Deductions −₱176,651 decomposed**: **PhilHealth app over ₱86,821** (engine bases PH on gross; Sheet2 = salary-based — PH law basis), loans ₱41.4k (RCBC 29/HDMF 11/SSS 31 amount residuals), SSS under ₱10.3k, PagIBIG under ₱5.8k, tax ₱9.2k, rest ≈ ₱55k other/rounding.
- Remaining walls ranked: PH basis (policy), absent/Saturday (policy), leave residual ₱64k (mostly unfixable data), ND ₱49.5k (line-level buckets), RD 13 (₱13k).
- Final: `.runtime/tally-jul1125-after-repairs-2026082513565/REPORT.md` — TALLIED 10, UNMATCH 2, ALEXA 6, NEAR_10 10, OT_OK_NEAR_50 80.

## Latest Task Addendum - 2026-08-25 Recurring comp/ded proven for NEXT period (no Sheet2) + MLA flipped recurring

- Operator directives: recurring comp/ded must keep recurring (no re-fix next period); Sheet2 won't always exist — future periods compute in-app.
- **MLA flipped to open-horizon EVERY_CUTOFF** (824 rows; old 831 superseded set stays ended; a future period-scoped COMP mass supersedes automatically). Repair script MLA mode → "open" for idempotent reruns.
- **Recurrence proof for PP-20260726-20260811 (Sheet2 NOT used)**: DMA 335/₱110,300 + MLA 824/₱412,000 via the engine's own `resolvePayrollBenefitSources`; loans 1,356/₱831,766 overlapping via EmployeeLoan window SQL. Evidence: `.runtime/recurring-next-period-proof-20260825/proof.json`.
- Doctrine written: findings **§14g** — Sheet2 = parity harness only; app-native map (attendance/late/absent/leave/statutory/recurring comp+loans native; OT still needs the cut's rptOvertimeDetails until in-app approved-OT covers it).

## Latest Task Addendum - 2026-08-25 Jul 11-25 tally fix pack (comp from Sheet2 + full replay) — 802/828 improved

- Operator directive: recurring comp/ded cannot rely on the single cut file — fix compensation FROM Sheet2, always with proof.
- Discovery: local clone had LOST all earlier brute repairs (DB refresh) — Jul COMP/DED mass, WS, OT buckets, prior-DED loans, DMA, dailyRate all absent (import history proved it).
- New scripts: `repair-bnpi-comp-from-sheet2.mjs` (12 codes; DMA open-horizon; others period-pinned + supersede; canonical register labels) and orchestrator `run-jul1125-tally-fix-pack.mjs` (9 steps, dry-run default, `--execute`, `--step=N`, proof JSON per step).
- Replayed: DM4 Jul bio+OT (OT landed; strict verify gate non-convergent flap = known, documented), WS Jul (841 upd), late recompute re-run AFTER final materialization (sequencing matters), dailyRate 569 Path A, comp-from-Sheet2 (DMA 329+6, MLA 824+831 superseded, ARP 673, AON 33, LLA 65, TSA 10, OBA 33, OAD 5, HYS 66, ABS 48, MTX 153, PFA 1), Jul DED mass, prior DED Jan-Jun, loan horizon 24mo.
- Engine fixes: (1) register **arp** column was missing — added; (2) **special-holiday premium split proven from Sheet2** — Path A work premium = **1.3 full** (was wrongly 0.3 via stale always-false `useSourceDailyRate`), Path B = 0.3; excess spclOtHrs × 1.69 moved to its own register column **Sun/Spc Hol OT Exc** (new `resolveBandaiSpecialHolidayWorkMultiplier` exported + pinned by `bandai-special-holiday-split.spec.ts`).
- **Final proof (828 compared, true July Sheet2)**: UNMATCH **694 → 2**; TALLIED **0 → 10**; NEAR_10 9; OT_OK_NEAR_50 **76**; **802/828 improved** (top: 00835 +₱39,392, 01049 +₱34,096, 00021 +₱26,795); gross fails 826→**554**, gross gap −₱324k→−₱117k; **net gap −₱423k→+₱52k**; late fails 322→**55** (₱109k recovered). MATCH: OT ₱1.33M, DMA, MLA, ARP ₱335.5k, PFA, AON, LLA, TSA, OBA, OAD, HYS, ABS, MTX, basicPay, numberOfDays. Loans: RCBC 29 / HDMF 11 / SSS 31.
- Still open: absent policy 173 (Sheet2 ₱269k vs app ₱6k), deductions over ₱170k (contrib/loan/tax cascade), leave day-count 201 (₱106k), ND ₱49.5k (needs line-level bucket analysis), RD Hrs Pay 13 (₱13k).
- Evidence: `.runtime/jul1125-tally-fix-*/` + `.runtime/tally-jul1125-after-repairs-2026082512195/REPORT.md`. Local clone only — VM replay still required.

## Latest Task Addendum - 2026-08-25 BNPI period leave import (LVP) closes Sheet2 Leave gap

- Feed proven: `Leave (July 1-31, 2026).xlsx` sheet **Leave (2)** covers **376/376** Sheet2 Jul 11–25 leave people; money reproduces **99.2%** via dual basis (Path A `days×dailySalary` 217; Path B `days×monthly×12/313` 156).
- Shipped: helper+service (`bnpi-period-leave-import.*`), `POST /api/migration/dm3/import-period-leave`, DM3 card **Upload leave (period)**, durable log kind `period-leave`.
- Engine truth change: **GrossPay now includes `leavePay`** at both generate+preview sites. Net/TR/tax follow.
- Operator feedback applied (same day): upload now **imports immediately** like other DM3 uploads (default execute; preview only via `dryRun=true`); amber preview/Confirm step removed; **payroll-period selector** added to the modal (default OPEN period, sends `payrollPeriodId`) so month-wide files cannot silently land in the prior cutoff (REC-20260825-PERIOD-LEAVE-EXPLICIT-PERIOD **Implemented**).
- Tests: backend spec **9/9** (incl. default-executes contract); app migration route tests 20/20. Pre-existing fails documented separately (6 app-lib vitest; 2 migration.tsx tsc).
- Live local DB (5433) execute proof: window `2026-07-11..25`, **321 created / 0 updated / 6 failed** (missing emps 01827/01834/01835/01836/01838/01841), **₱327,991.84**, log `cmt86rh9b00s8vgewuoj41i4j` retrievable via `GET /dm3/mass-upload-imports/:id` (summary+importLog → activity click-through works). Opt-in preview: 0 writes.
- Infra fix: `hris-app/app/services/payroll-periods.service.ts` was **UTF-16 LE** (broke vitest oxc transform when the leave modal's period hook pulled it in) → converted to UTF-8, no content change.
- Baseline (pre-leave, true July Sheet2): `.runtime/tally-jul1125-before-leave-julysheet2/` — 828 compared, TALLIED 0, OT_MATCH_ONLY 134, UNMATCH 694, leavePay fails 366. **After-leave tally done**: `.runtime/tally-jul1125-after-leave-julysheet2/REPORT.md` — 283 improved / 23 worsened; leave exact 113/366, 201 underpaid (rest-day/day-count residual), app-only 1; Σ Sheet2 ₱434,311.72 vs app ₱327,991.84 (gap ₱106,319.88); bands still TALLIED 0 — deductions/tax wall dominates (worst-now ΔGross −36k class). First tally attempts had compared JUNE Sheet2 by mistake (hardcoded target) → superseded notes in old dirs; jul script now honors `TARGET_XLSX`. Canonical: findings §14e.

## Latest Task Addendum - 2026-08-24 Fleet Hikvision time sync button + live clock snap

- Operator authorized live write on A/B/D/E, then asked for an HRIS button to trigger fleet time sync.
- Live snap done twice via SDK STDXML; final state skew A -2s/B +8s->-19s/D -3s/E 0s before second pass -> all within ~19s latency residual after writes. C/F unreachable (C known down; F ECONNRESET open), TEST A/B + Device 5 lanes down as expected.
- NEW: POST /api/device/time-sync-all (preview-first, execute=false default, deviceIds scope, concurrency 2, honest aggregate) sharing 
unHikvisionTimeSyncCore with the per-device route.
- App: **Sync device time** button on Devices page (/admin/configuration/devices) opens preview-first modal with per-device clock/drift/path/status and scoped **Update N clocks**.
- Tests: api contract 8 passing; app UI contract 2 passing. Live smoke: preview 11/4 readable; scoped execute 4/4 written. Evidence: .runtime/time-sync-all-smoke-20260824-151249/smoke.json.
- Push af6d607. Dual-app parity exception: admin-only surface.

## Latest Task Addendum - 2026-08-24 Toast X removal canonized

- Operator: X on success/error toasts was supposed to be gone; it reappeared on the fleet clock-sync toast.
- Cause: sonner closeButton on global Toaster since standalone-era import 4ce3712d (2026-06-17); the no-X memory was the custom toms/Toast surface.
- Fixed root.tsx; canonized in DESIGN.md (Toasts), terminology (Toast close button), pinned by 	oast-ux-contract.test.ts. emp-app check pending (submodule not checked out locally).

## Latest Task Addendum - 2026-08-24 Whole-codebase WWG alignment audit + non-breaking drift repair

- Operator asked to audit the whole codebase against WWG using 10 parallel sub-agents, then approved all **non-breaking** fixes with documentation.
- Verdict ~90% ALIGNED. Fixed: AlarmDemo launcher scripts deleted; stale TEST A `.102` -> live `.109` across postman env/collection, ensure-device-live-path.ps1, verify-hikvision-isapi-postman.ps1, vm-bridge cjs+spec; activity title + saved-events Playwright proof now Device events; ZKTeco Linux-bridge naming; employee.controller.ts mojibake comments cleaned; docs/HIKVISION_ENROLLMENT_IDENTITY_FLOW.md got a .102 STALE banner; device-health fixture IP hygiene.
- Deferred as behavior changes (RECs): compose seed push-only, emp-app namespaces override. Wiki conflation notes (execute=false is API-layer, callback Employee-vs-DeviceUser order per path, Observe wait 20 min) recorded in the report.
- Canonical: `.wwg/reports/codebase-wwg-alignment-audit-20260824.md`.

## Latest Task Addendum - 2026-08-22 Hire keeps applicant public-apply name

- Operator: Yan Rubio card opened as Joshua Rodriguez EMP3334. Adding employee must not change the applicant name.
- Source of identity is the public job application person (first name, last name, email). Add Employee from recruitment reuses that Person and locks those fields.
- Drawer shows the applicant name if the linked employee is a different person.


## Latest Task Addendum - 2026-08-22 db-init repair (push authorized)

- Operator authorized **push**. SHA `4f978c0a`. Jobs Complete; Argo runtime **Healthy**; UAT/PROD counts unchanged.
- Operator page: `docs/DB_INIT_JOB.md`. Evidence: `.wwg/reports/db-init-repair-20260821.md`.


## Latest Task Addendum - 2026-08-22 Recruitment previous-application history

- Operator: first name + last name + birthday is only the validation to see if the applicant already exists in applicants or employees, so recruitment can show history (rejected, resigned, etc.).
- Implemented: identity match helper; `identityHistory` on applicant GET/create; public apply collects DOB; recruiter drawer **Previous Bandai record** + full history accordion.
- Not a hire block. Employee create still has its own name+birthday 409 for active employees.
- Board: amber **History** chip on the kanban card and table row when first+last+birthday matched. Click the person for full history in the right drawer. No chip if birthday is missing.


## Latest Task Addendum - 2026-08-21 Dedicated employee schedule page

- Operator: dedicated page to change employee time schedules without opening each profile.
- HR `/hr/employee-schedules` (Timekeeping G�� Schedules) and admin `/admin/configuration/employee-schedules`.
- Table of active employees, current week hours, department/section filter, click row to preview then Change schedule (same Days/Dates modal).


## Latest Task Addendum - 2026-08-20 Document on-prem port access

- Operator: document that on-prem ports still exist; this PC cannot reach them; Cloudflare is the same VM.
- Canonical operator page: `docs/ONPREM_PORT_ACCESS.md`. Evidence: `.wwg/reports/onprem-port-access-20260820.md`.
- Live: VM six binds 200; this PC six LAN tcp=false; public APIs 200; Observe onprem jobs green.


## Latest Task Addendum - 2026-08-20 Lead 2.1.7 meaning vs shipped

- Lead: Tardiness/OT = actual TI/TO vs sched. Direct vs Indirect = Line Leader **per-day** work tag on timesheet.
- Validation: tardiness **partial**; OT **not** raw extra (approval). Direct vs Indirect in app = **BNPI vs Agency person**, not daily work. Line Leader tagging **MISSING**.
- Canonical: `.wwg/reports/direct-indirect-lead-claim-validation-20260820.md`. REC-20260820-DAILY-LABOR-TYPE-TIMESHEET.


## Latest Task Addendum - 2026-08-20 UAT/PROD app+API auto-roll

- Operator: no auto-deploy for UAT/PROD app/API; asked if we can do it and document well.
- Yes: ansible-pull restart loop is `dev uat prod` for existing Deployments (`hris-api`, `hris-app`, callback-outbox only where present). Still triggered by **`develop` push + image rebuild**, not GitHub `uat`/`prod` branches.
- Revert env: `PROJECT_TRUTH_ROLLOUT_NAMESPACES=dev`.
- Canonical: `.wwg/reports/uat-prod-app-api-auto-roll-20260820.md` + `docs/ONPREM_PORT_ACCESS.md` + `docs/DEVOPS_RUNBOOK.md`.


## Latest Task Addendum - 2026-08-20 Timesheet 2.1.7 Direct vs Indirect UI

- Operator assigned Timesheet Management **2.1.7** (split): tardiness/OT reports already existed; Direct vs Indirect labor was API-only.
- Mounted existing `DirectIndirectLaborTab` on `/hr/reports/workforce?tab=direct-indirect`. Did **not** replace Manpower Distribution (`tab=labor` remains default).
- Live API `POST /api/metrics` `directIndirectLaborSummary`: **872** direct / **1355** indirect, 15 departments.
- Playwright: tab chrome + report title + Labor Type; tardiness tab still present.
- Remaining honesty: gender/agency/total-manpower blocks on that tab still use client employee roster (can show 0 while API KPIs are filled). REC-20260820-DIRECT-INDIRECT-ROSTER-VS-API.
- Canonical: `docs/00-product/DIRECT_INDIRECT_LABOR_REPORT.md` + `.wwg/reports/direct-indirect-labor-ui-20260820.md`.


## Latest Task Addendum - 2026-08-20 On-prem DEV/UAT/PROD port Observe

- Operator: Observe should cover **on-premise port access** of the instance for DEV/UAT/PROD app+API, not only GitHub unit tests / Cloudflare.
- GitHub runners cannot reach `10.184.37.19`. VM reporter curls `127.0.0.1` after ansible-pull.
- Live VM bind proof: prod/dev/uat API `:3001/:3101/:3201` and app `:3000/:3100/:3200` all HTTP 200.
- Observe matrix adds `onprem-{prod,dev,uat}-{api,app}`. Down port posts GitHub Deployment **failure** (fail-fast false).


## Latest Task Addendum - 2026-08-20 Document CI/Observe/Validate (no push)

- Operator: document DevOps CI well; **do not deploy**; **do not push** until ordered.
- Canonical: `.wwg/reports/devops-ci-observe-validate-20260819.md`.
- Live tip at proof: `efc86c56` G�� CI + Observe + Validate success; VM pull match; images `services=none`; runtime Argo **Degraded** (`hris-api-db-init` Failed).
- Observe success G�� live pod SHA. `/health` has no `buildSha`. Nested Cloud Run/Firebase workflows do not run on this repo.


## Latest Task Addendum - 2026-08-20 Attendance list filters return to overview

- Operator: `/hr/attendance` overview; click Clocked In (or any metric) G�� URL becomes `?status=CLOCKED_IN&view=list`. No way back to the clean attendance route.
- Fix: Back link is a real `/hr/attendance` Link (keeps date/period). Clicking the same metric again returns to overview. Sidebar Attendance resets list query params on the same path.
- Tests: attendance-management 19; Sidebar 4. Browser: `.runtime/attendance-overview-return-20260820/`.


## Latest Task Addendum - 2026-08-20 Non-breaking DevOps CI/Observe harden (push authorized)

- Operator: improve without breaking, then **do it** (push `develop`). VM ansible-pull will pick up the SHA.
- CI adds `zkteco` unittest + `ansible` syntax-check. Existing jobs unchanged.
- Observe still succeeds on `services=none`. Summary now prints VM description; public URL GET is informational (`continue-on-error`).
- Reporter descriptions add `outcome=pulled|rebuilt|not_rebuilt|pull_only` and match `hris-api-local:develop` (not db-init substring). Still never posts `failure`.
- Emp-app skip stays green, with a GitHub notice that it is not test proof.


## Latest Task Addendum - 2026-08-20 Attendance records compact + sticky employee

- Operator: Attendance Records list needs smaller type and a frozen employee name when scrolling right.
- Fix: compact DataTable density; smaller employee/time/status cells; Employee column `pin: left`.
- Tests: DataTable 9; EmployeeTableCell 3; attendance 19. Browser: `.runtime/attendance-records-compact-20260820/`.


## Latest Task Addendum - 2026-08-20 Day labor timesheet property (NO PUSH)

- Operator: implement the lead requirement; **stop pushing to develop until they say so**.
- Added `Timesheetline.dayLaborType` / `AttendanceObligation.dayLaborType` (`DIRECT` \| `INDIRECT`, nullable).
- Timesheet day editor: **Day labor** select. Persist via existing breakdown save. Distinct from hire-source report.
- Operator later: audit then push if sure. Audit: persist is PATCH breakdown on Submit/Approve (day Save is preview, same as clocks). Prisma generate includes `DayLaborType`. SQL still must be applied on DB.


## Latest Task Addendum - 2026-08-20 Dates calendar multi-select + break

- Dates tab is a clickable calendar (multiple days). Hours + break apply to every selected date.
- Changing the date no longer resets start/end back to 08:00G��17:00.
- Break start/end optional (default 12:00G��13:00). Days tab unchanged.


## Latest Task Addendum - 2026-08-20 durable WS-off vs OT ABSENT revive

- Task mode: bug fix (OT apply ignored schedule OFF overrides).
- Operator proof: 01116 Jul 21 showed ABSENT despite WS flag=0 after rebuild.
- Fix: OT patch honors effective OFF override; stamps scheduleSnapshot; re-repair 1715.
- Proof: 01116 REST_DAY; OT dry-run does not force ABSENT; absent app-over 505?0.
- Local test DB only � VM replay later.
- Evidence: `.runtime/reverse-reinvestigate-20260820/PROOF-01116.md`


## Latest Task Addendum - 2026-08-20 Timesheet G�� schedule connection audit

- Operator: audit timesheet vs schedule because schedule can change (that is the process).
- Three layers: live schedule G�� obligation expected windows G�� punches/timesheet snapshots.
- Schedule change **does** recompute obligations. **Does not** rewrite punches or timesheet lines or stored late/OT.
- **Days** tab = weekly pattern (next Monday). **Dates** tab = that calendar day (`ScheduleOverride`).
- Canonical: `.wwg/reports/timesheet-schedule-connection-20260820.md`.


## Latest Task Addendum - 2026-08-20 10-agent DevOps audit

- Operator: audit DevOps with 10 subagents. Audit only (no playbook/workflow/Job edits).
- Tip SHA `37b443a`: CI+Validate green; Observe waiting VM reporter; last apply `885c331` `services=none`.
- Runtime Argo still Synced/Degraded on failed `hris-api-db-init` (dev/uat/prod).
- Canonical: `.wwg/reports/devops-audit-20260820.md`.


## Latest Task Addendum - 2026-08-20 Employee weekly hours (Mon 6G��3, Tue 7G��4)

- Operator asked where to change one employeeG��s shift (Zen Monday 6G��3, Tuesday 7G��4). Admin Schedule Templates already exist as reusable patterns.
- Per-person weekly hours already lived on HR/Admin employee edit G�� Active Schedule. Work Schedule tab was view-only.
- Added **Change schedule** on the employee Work Schedule tab: 7 weekday start/end/off editor. Saves `POST /api/employee-schedules` with a `pattern`. Takes effect next Monday.
- Tests: mocha helper 6; vitest 6 (helper + modal + tab).
- 2026-08-20: landed on `origin/develop` so VM ansible-pull / Docker can deploy DEV.


## Latest Task Addendum - 2026-08-20 Change schedule Days vs Dates

- Operator: weekly hours modal should also set hours on a real calendar date, not only next Monday.
- Keep **Days** tab (weekday pattern) unchanged. Add **Dates** tab: calendar date + start/end. Saves `ScheduleOverride` for that date.
- Tests: weekly helper date mapping; modal Days vs Dates payloads.


## Latest Task Addendum - 2026-08-19 Hikvision C++ real compilation units

- Operator: leftover foldered `.inc.cpp` dumps were still confusing. Split into maintainable real `.cpp` / `.hpp` units.
- Layout: `include/hikvision_bio/` (`types.hpp`, `common.hpp`, `time.hpp`, `runtime.hpp`, `prelude.hpp`, `acs.hpp`, `identity.hpp`, `fingerprint.hpp`, `face.hpp`, `copy.hpp`, `spool.hpp`) + `src/hikvision_bio/` (`common.cpp`, `time.cpp`, `acs.cpp`, `identity.cpp`, `fingerprint.cpp`, `face.cpp`, `copy.cpp`, `spool.cpp`, `runtime.cpp`, `main.cpp`).
- Fingerprint vs face are separate units. Leftover `.inc.cpp` dumps removed.
- Goal: easy to maintain. Non-breaking: same binary `hikvision-biometric-service`, same CLI/JSONL. Wrapper still syncs whole include/ + src/.
- Time still SDK STDXML GET/PUT `/ISAPI/System/time`, `CST-8:00:00`, `execute=false` default. No NTP enable.
- Previous 2026-08-19 foldered `.inc.cpp` addendum is superseded.


## Latest Task Addendum - 2026-08-19 Hikvision C++ rollback docs

- Operator: document the real-TU split so a failure is easy to roll back.
- Report: `.wwg/reports/hikvision-cpp-maintainable-units-20260819.md`.
- Last good unity source: `6b670a4`. Hard rollback: `git revert --no-edit 301ebb5` then `66868a2`.
- Soft: wrapper keeps last ELF if `g++` fails.
- Live VM rebuild still `NEEDS_CONFIRMATION`.


## Latest Task Addendum - 2026-08-19 Hikvision C++ include/src split

- Status: `SUPERSEDED` by **2026-08-19 Hikvision C++ real compilation units**.
- Operator: folder layout was still two confusing files. Removed `hikvision_biometric_service.cpp` and `runtime_service.cpp`.
- Layout (superseded): `include/hikvision_bio/` + `src/hikvision_bio/{common.cpp,main.cpp,time/,acs/,identity/,biometric/,copy/,spool/,runtime/}`.
- One binary, same CLI/JSONL. Wrapper syncs whole include/src trees.


## Latest Task Addendum - 2026-08-19 HRIS Hikvision Update time button

- Operator: add an HRIS button that does the Hikvision time update (Manila). Then: do not stop; check/update must use SDK.
- Check + update now go through **HCNetSDK STDXML** first: C++ `--get-time` / `--set-time` via `NET_DVR_STDXMLConfig` GET/PUT `/ISAPI/System/time` (same SDK session as FP/face).
- HRIS: `runHikvisionDeviceTimeOnVm` then ISAPI HTTP fallback if VM SDK command cannot arm.
- API: `POST /api/device/:id/time-sync` (`execute=false` default). Response `transport=sdk_stdxml|isapi_http`.
- UI: Preview time G�� confirm Update time. Modal shows check path.
- Does not enable NTP. Listener binary on the VM must rebuild from this C++ before SDK path is live.


## Latest Task Addendum - 2026-08-19 Absent-day correction must create a punch

- Operator: `REQ-1786424090600` completed for Zen Aug 14 (8:00G��16:00 Manila) but My Attendance still showed **Absent / no record**.
- Cause: that day is a virtual `absent-2026-08-14` row. Apply required a real Attendance and failed. Completing a missed whole day must **backfill**.
- Fix: completed `ATTENDANCE_CORRECTION` now backfills when attendanceId is virtual/missing. Live apply created PRESENT `cmszhlo6a00018h4sy78fjinn` 08:00G��16:00 Manila.
- Tests: apply-request + backfill 5 passing; payload + modal 19 passing.


## Latest Task Addendum - 2026-08-19 Attendance correction HR Review must finish

- Operator: Maria Santos (`hr-manager@seed.local`) approved Zen's Aug 18 missed clock-out, but Zen's request stayed **Approved / HR Review pending**.
- Cause: manager approval flipped the request to APPROVED while HR Review is a TASK. My Approvals hid Complete Task (`stepType !== TASK`). Apply also 500'd (`deriveBehaviorFlags` missing) and missed Manila-day rows (`2026-08-17T16:00Z`).
- Fix: HR actors can complete HR Review; if the manager who approved is HR, HR Review + SYSTEM auto-complete. Apply uses Manila day bounds. Live `REQ-1786424090599` is **COMPLETED**; Zen Aug 18 effective row is PRESENT 08:00G��17:00 Manila.
- Tests: workflow helper 2 passing; request-approval-action + RequestReviewModal 15 passing.


## Latest Task Addendum - 2026-08-19 EmployeePayroll.hourlySalary snapshot

- Operator: add hourly on the payroll snapshot; auto-compute; document; do not add other features.
- Field: `EmployeePayroll.hourlySalary` Float default 0. Generate/preview persist via `computeEmployeePayrollHourlySalarySnapshot`.
- Employee still has only `basicSalary` + `currency` + `payFrequency`. No hire/edit hourly. No Sheet2 Hourly column.
- Tests: `hris-api/tests/employee-payroll-hourly-salary-snapshot.spec.ts` (5 green).
- Canonical: `.wwg/reports/employee-payroll-hourly-salary-snapshot-20260819.md`.


## Latest Task Addendum - 2026-08-19 Hikvision bio time / Manila sync research

- Operator: can Hikvision biometric terminals set time manually, and can we sync all devices together to Manila time?
- Verdict: **Yes** on the device (panel / web / Hik-Connect / iVMS Batch Time Sync / ISAPI PUT / NTP). **HRIS does not SET** today G�� GET `/ISAPI/System/time` only.
- Manila mapping: device `timeZone=CST-8:00:00`, DST off, `localTime` `+08:00`. Same offset as `Asia/Manila`. Do not send IANA names to the panel.
- Live BNPI XML (stale 2026-08-17 and earlier): always `timeMode=manual`. Clocks already +08 but **not** fleet-NTP; B/D/E differed by ~40s. TodayG��s clocks `NEEDS_CONFIRMATION` (localhost:3001 down; VM ping false).
- Attendance uses **device punch time**, not `receivedAt`. Aligning clocks is required for Time In/Out.
- Report: `.wwg/reports/hikvision-biometric-time-manila-20260819.md`.
- Boundary: research only. No PUT. No NTP write. No clock-writer feature this pass.


## Latest Task Addendum - 2026-08-19 hourlySalary backfill script

- Operator: backfill current EmployeePayroll rows for the new `hourlySalary` snapshot. Dry-run default. Does **not** change payroll computation.
- Commands (`hris-api`):
  - `npm run backfill:employee-payroll-hourly-salary` G�� dry-run (default; no writes)
  - `npm run backfill:employee-payroll-hourly-salary:execute` G�� write `hourlySalary` only
- Derive: prefer metadata `hourlyRate`, else `dailySalary` (or metadata daily) ++ `workingHoursPerDay` (BNPI 313 uses 8). Same helper as generate: `computeEmployeePayrollHourlySalarySnapshot`.
- Does **not** rewrite money (OT/late/UT/absent/gross/net), Employee input, Sheet2 columns, or paid/published/lock flags.
- WWG: project-truth + summary + this addendum + handoff + snapshot report Backfill section.
- Boundary: no product compute edits; no commit/push this pass.


## Latest Task Addendum - 2026-08-19 GitHub Action observe VM deploy

- Operator: no GitHub Actions observation of whether a SHA is deploying or already pulled.
- Add workflow `observe-deploy.yml` (push `develop` + dispatch). Creates GitHub Deployment `vm-gitops` `in_progress`, waits up to 10 min for VM success.
- VM `project-truth-report-github-deploy` runs after ansible-pull records state (does not fail the pull).
- Validate workflow is not deploy proof.


## Latest Task Addendum - 2026-08-19 infra git login on VM

- Operator: git was not interactively logged in for `infra` (no `gh`, no `~/.git-credentials`; ansible-pull still used Argo secret).
- Fix: `infra` git `credential.helper=store` from `argocd/project-truth-repo-creds` (`x-access-token` / GitHub `g-zenr`). Mode 0600.
- Proof: `git ls-remote` as `infra` G�� `6f973877ca13` `refs/heads/develop`.
- LAN `ssh infra@10.184.37.19` still times out from this PC (Wi-Fi `192.168.1.26`, no `10.184.37.x`). Use `ssh project-truth-hris`.
- Evidence: `.runtime/vm-git-login-20260819/infra-git-login-proof.txt`.


## Latest Task Addendum - 2026-08-19 Promote attendance request UI to develop

- Local Vite on `bryan-task` showed **Request time** / attendance request. Public DEV `https://dev.bnpi-hris.tech` did not.
- Cause: GitOps DEV serves `develop` `b409ca4`. The attendance request work lived only on `bryan-task` `3bad2d1`. Merging `develop` into `bryan-task` does not deploy the feature.
- Layout (Today left / log right) was still uncommitted local CSS. Promote the committed attendance request + related API/UI from `3bad2d1` onto `develop`.


## Latest Task Addendum - 2026-08-19 CI checks per deploy type

- Operator: GitHub Actions should show checks per deployment type (hris-app, hris-api, others).
- Workflow **CI**: jobs `hris-api`, `hris-app`, `hris-emp-app`, `hikvision`, `callback-outbox`, `gitops`.
- Observe VM GitOps deploy is now a matrix: `ansible-pull`, `hris-api`, `hris-app`, `hris-emp-app`, `callback-outbox`.
- VM reporter posts success per GitHub environment. Docs-only SHA reports image jobs as not rebuilt.


## Latest Task Addendum - 2026-08-19 Payroll Management sheet live audit

- Operator asked to audit sheet **3 Payroll Management** (claimed 98.08%) with actual users, and whether generate payslip / payroll creates records.
- Report: `audits/payroll-management-2026-08-19.md`. Evidence: `.runtime/payroll-mgmt-audit-20260819-204314/`.
- **Not 100%.** `EmployeePayroll` rows exist (**46** = 35 Jun P1 + 11 Jul P1). **No payslip PDFs.** Current Aug cut: 0 approved timesheets; Zen `00010` timesheet `cmswwobaz05mxlp01e8p71f9q` is **404**.
- Actors: Maria Santos `hr-manager@seed.local`, Juan Mendoza `employee@seed.local`, Zen via HR API.


## Latest Task Addendum - 2026-08-19 DEV pull/push GitOps operator report

- Operator asked how to pull latest (VM / `https://dev.bnpi-hris.tech` / `develop`) and how a push to `develop` shows on DEV.
- Report: `audits/dev-bnpi-hris-pull-push-gitops-2026-08-19.md`. Indexed in `audits/README.md`.
- Truth: do not pull code from the website. Pull `origin/develop`. DEV updates only after `git push origin develop` and VM ansible-pull rebuilds `hris-*-local:develop`.


## Latest Task Addendum - 2026-08-19 Period overview totals, not duplicate days

- Operator: Active Timesheet 8/11G��8/25 repeated Zen five times (PRES 1/1/1). Clocked In list said no records.
- Cause: department expand previewed 5 **days**. Clocked In scanned 5000 obligation rows (~67s) so the page timed out empty.
- Fix: multi-day expand is **one row per employee** with SCHED/PRES/LATE/UT/ABS day totals. View days opens that person's daily list. Clocked In pages from scheduled punches (live 122 rows in 1.3s).
- Live GA/HR Zen: 14 scheduled, 6 present, 4 late, 4 undertime, 8 absent.
- Tests: schedule helper 13 passing; attendance template 16 passing.


## Latest Task Addendum - 2026-08-19 Overtime request date + 2h 50m + HR payable OT

- Operator: OT form used a number spinner; 2 hours 50 minutes could not be entered. Workflow was manager-first. Approved employee OT did not write payable hours.
- Fix: DatePicker; Hours + Minutes (example 2:50). Workflow is employee G�� HR G�� system. HR approve writes `timesheetline.overtimeHours` (`2:50` / 170 min).
- Tests: payload vitest 7; overtime workflow/apply mocha 3.


## Latest Task Addendum - 2026-08-18 Overview PRES collapsed vs expand

- Operator: department rows showed PRES 6 / 3 / 2, but expanding Production listed Aileen/Alberto with PRES 0.
- Collapsed PRES was leftover AttendanceObligation PRESENT/INCOMPLETE (`_isClockedIn`). Expand is a 5-name preview, not those punchers.
- API now overwrites department `present` from scheduled punches and ranks clocked-in first. Live 2026-08-17: Production present=1, first preview = Joys `00680`. Live 2026-08-18: present=0.
- Overview person PRES = has `timeIn`. Expand sorts clocked-in first so the department total and the open list use the same punch definition.


## Latest Task Addendum - 2026-08-18 OT is not automatic payroll

- Operator asked if overtime auto-pays or needs approval.
- Live TimesheetConfig: `requireManagerApprovedOvertime=true`, `enableAutoApprove=false`, OT flag threshold 60 minutes.
- Extra punch hours become OT candidates. They do **not** write payable `overtimeHours` until a manager OT request is approved, or the approved OT workbook (DM4.3) is applied to timesheet lines.
- Run Payroll only uses **APPROVED** timesheets. Payable OT is `timesheet_lines.overtimeHours` / Bandai `approvedBuckets`, not raw attendance.
- Live: Jun 26G��Jul 10 has 725 people / 15,239 hrs payable line OT (workbook path). Current Aug 11G��26 has 0 line OT. OVERTIME request type is unused in this clone.
- Evidence: `.runtime/ot-audit/`.


## Latest Task Addendum - 2026-08-18 DMA open-horizon recurring

- Task mode: data + import fix (DMA recurring) for Jul 11�25 tally.
- Request: fix DMA for recurring; amounts = latest Sheet2 Jul per employee.
- Finding: expired period-scoped workbook DMA + no Jul COMP DMA rows ? app 0.
- Done:
  1. `isOpenHorizonCompensationCode(DMA)` + COMP mass + workbook apply open-horizon.
  2. Local repair from Jul Sheet2 (335 apply Jul; 2 missing emps).
  3. Re-tally: DMA fails **332?0**.
- Evidence: `.runtime/tally-after-dma-repair-20260818/DMA-REPORT.md`
- Docs: canonical �14d + handoff.
- **Local DB = testing only.** Brute/data fixes proved locally must be replayed on
  **VM DB later** (DMA, loans, WS-off, late/EO, prior DED, dailyRate, etc.).
- Still open: Gross/absent reverse/late/TR; VM data replay.


## Latest Task Addendum - 2026-08-18 document recurring DED / Amount vs Payment

- Task mode: docs / truth-sync.
- Documented in canonical �14c + WWG report:
  past deduction mass uploads as primary recurring source;
  Payment (this cutoff) vs Amount (still owed);
  multi-cutoff horizon; Jul re-tally after loan fix; operator FAQ.
- Paths: `docs/BNPI_PAYROLL_APP_VS_FILE_FINDINGS_20260813.md` �14c,
  `.wwg/reports/bnpi-recurring-deduction-mass-loans-20260818.md`.


## Latest Task Addendum - 2026-08-17 Overview cards use schedule late/UT

- Operator: 1 clock-in is late + undertime, but overview Late/UT cards stayed 0 and utilization looked like 0%.
- Cards were counting stored obligation lateHours (still 0:00). Table computes from schedule + punches.
- Metrics now use the same scheduled-day timekeeping: Late 1, On time 0, Undertime 1 for Zen.
- Late/On time rate is among clocked-in; Undertime among clocked-out. Utilization shows `<1%` when 1/866.


## Latest Task Addendum - 2026-08-17 multi-cutoff loans + prior DED mass

- Task mode: data + engine fix (loan horizon) for Jul 11�25 deduction tally.
- Request: use prior deduction mass (recurring) to improve Jul tally.
- Finding: Jul cut mass incomplete; main blocker was short `endDate` on loans.
- Done:
  1. Multi-cutoff term + never-shrink endDate in mass import.
  2. Local repair: 1280 loans overlap Jul (was 88).
  3. Reimport prior+cut DED mass oldest?newest (Bandai org).
  4. Preview proof: loan apply fleet improved (HDMF/SSS/SSSELN app-zero?0).
  5. Full re-tally 2026-08-18: hdmfSl 353?11, sssSl 300?31, rcbc 132?29.
- Evidence: `.runtime/prior-deduction-recur-20260817/`,
  `.runtime/tally-after-loan-20260818/`.
- Still open: Gross/absent/late/DMA; TOTAL DEDN package beyond loans.
- Docs: canonical �14c (2026-08-18).


## Latest Task Addendum - 2026-08-17 FILE_DUAL Basic Path A

- Task mode: engine fix (FILE_DUAL Basic) + local proof.
- Request: proceed with Path A Basic recommendation
  (`basicPay = paidDays � dailyRate`, no Absent double-count on Path A).
- Implementation:
  1. `resolveBandaiRegisterBasicPay` � Path A paidDays�dailyRate; Path B periodBasic.
  2. Full-day Absent-Amt suppressed when Path A (`suppressFullDayAbsentDeduction`).
  3. Register uses computed `basicPay` + Path A paid regular days (not non-REST line count).
  4. Wired in generate + preview paths in `payroll-period.helper.ts`.
- Proof (local clone `5433`, period Jun 26�Jul 10): basicPay **481?1**, absent **603?222**,
  numberOfDays **818?263**; OT still 1; Gross/TR still fleet-unmatched.
- Evidence: `.runtime/full-tally-jul11-25-after-basic-path-a-20260817/`
- Tests: 11 green (basic 5 + OT dual 6).
- Next residual: absent residual, DMA, late, loans � not Basic formula.


## Latest Task Addendum - 2026-08-17 Same table + Late/UT/Hours columns

- Operator: Clocked In vs All Statuses tables looked different; LATE/UT in Indicators felt wrong.
- One Attendance Records DataTable for every status filter (Image #1 chrome).
- Indicators = HOL/LEAVE/REST/ACTION/+EX only.
- New columns: Late (next to Clock In), UT (next to Clock Out), Hours.
- All Statuses now applies the same schedule arrival as Clocked In, so Zen is not a dash.


## Latest Task Addendum - 2026-08-17 Clocked-in table shows schedule punches

- Card showed Clocked in 1/866; table filter Clocked in was empty.
- Count comes from Attendance punches on scheduled people; table only listed AttendanceObligation PRESENT/INCOMPLETE (Zen has a punch, no obligation row).
- Fix: CLOCKED_IN filter merges scheduled+clocked-in attendance rows. Live: 1 row **Zen Andrei** INCOMPLETE 1:40 PM.
- Tests: schedule helper 7 passing.


## Latest Task Addendum - 2026-08-17 Include Zen Andrei in scheduled today

- Zen Andrei `00010` / device 10 is a real DIRECT employee with `REGULAR_14DAY_ROTATION`.
- Was excluded by (1) `employmentTerminationDate=1970-01-01` treated as terminated, (2) missing `cycleAnchorDate` so Mon 8/17 mapped to rotation day 6 OFF.
- Fix: ignore non-final + year<=1971 termination; week-align 14-day templates when anchor is missing (same as assign path).
- Live after fix: Zen `inScheduledToday=true`; scheduled count 853G��866.
- Tests: schedule + employee-schedule + obligation 27 passing.


## Latest Task Addendum - 2026-08-17 Not clocked in uses scheduled over

- Operator: 0 clock-ins but UI showed **76 / 1706** not clocked in. 1700+ employees are scheduled.
- Cause: utilization denominator is `Employee.embeddedSchedule` (1706); not-clocked-in still counted leftover AttendanceObligation rows (76).
- Fix: `notClockedIn = scheduled G�� clockedIn G�� absent` on the same 1706. Zero punches G�� 1706 / 1706.
- API overwrites `totalNotClockedIn` from `attendance-schedule-utilization`. UI derives the same if API is stale.
- Table: `MISSING_CLOCK_IN` / `NOT_CLOCKED_IN` merges virtual scheduled rows so the list matches the card, not 76 leftover obligation rows.
- Also: 1706 was Mon+Tue (UTC 23:59 spilling into Manila 8/18). Today is one calendar day (~853 scheduled, 0 punches G�� 853 not clocked in).
- Tests: schedule helper + attendance-utilization display.


## Latest Task Addendum - 2026-08-17 Clock-out UT + Hours column

- Operator: after LATE appeared, also want ON TIME/LATE, undertime on clock-out, and total hours that day.
- Indicators: LATE / ON TIME / GRACE on clock-in; UT on early clock-out. New Hours column = worked time.
- API arrival now fills earlyOutHours / undertimeHours / hoursWorked when timeOut exists.
- Example: Zen 1:40 PMG��2:55 PM vs 08:00G��17:00 G�� LATE + UT + Hours 1h 15m.


## Latest Task Addendum - 2026-08-17 Clock-in Indicators LATE / ON TIME

- Operator: Attendance Records showed Zen Andrei Clocked In 1:40 PM with Indicators `-`.
- Cause: Indicators only painted LATE after stored `lateHours`, and clock-in rows (virtual or obligation without clock-out) hardcoded `0:00`. A stale rest-day snapshot also hid the current Regular Day start.
- Fix: compute arrival from scheduled start vs Manila clock-in immediately. Table shows LATE, GRACE, or ON TIME. Persist no longer lets `attendance.lateHours="0:00"` mask calculated late.
- Tests: timekeeping + schedule utilization + arrival util 38 passing focused.


## Latest Task Addendum - 2026-08-17 Zen Monday is a work day

- Operator: Rest Day should not sit in Gǣscheduled to workGǥ; update Zen today; clock showed 5:40 AM.
- DB: Regular Day override 2026-08-17 + cycleAnchorDate this Monday; obligation REST_DAY G�� INCOMPLETE with punch.
- Clock: table used browser TZ; 05:40Z is 1:40 PM Manila. `renderClockValue` / `format12HourTime` now use Asia/Manila.
- Rest days stay out of the 866; Zen is a work-day clock-in.


## Latest Task Addendum - 2026-08-17 Encoding pack documented + push

- Operator: document the encoding/schedule-hook changes and push `develop`.
- Canonical: `.wwg/reports/mojibake-encoding-20260817.md` + project-truth.
- Device event details accordion / payload-grid UI in `events.tsx` is **not** in this push (separate local addendum).


## Latest Task Addendum - 2026-08-17 Device event details raw payload accordion

- Task mode: UI. **Do not push** unless asked.
- Operator: Device event details raw JSON is always open; put it in an accordion, closed by default.
- `events.tsx` details modal: `Accordion type=single collapsible`, no `defaultValue`.


## Latest Task Addendum - 2026-08-17 SHE uses icon + label

- Operator: when making UI, full use of icons and button labels.
- Details modal: outline buttons with UserRound + full labels; fact rows icon+label; Raw payload Braces + label.
- Doctrine: Shrink G�� strip icons. SHE + DESIGN.md + grok rule 06.


## Latest Task Addendum - 2026-08-17 Device Event other-info TAP display

- Task mode: bug fix + truth sync. **Do not push** unless asked (`a6dce32` already on origin from earlier).
- Operator tap Device D person 10 serial 9652: attendance updated; UI still showed Unknown Vendor / Unknown evidence.
- Cause: GET copied stale stored UNKNOWN taxonomy; payload lacked evidenceSource on old rows.
- Fix: GET reclassifies stale UNKNOWN to TAP for major=5 punches; stamp SDK_CALLBACK + direct evidence; UI prefers live taxonomy; callback matches employee by pad/deviceEmpId/employeeId and links DeviceUser on next tap.
- Live local GET `cmsr688py002xvxwwttxhdsal` now `ATTENDANCE` / `TAP` / `SDK_CALLBACK` / `direct=true`.
- DeviceUser 10 on B/D/E linked ACTIVE to `00010` Zen Andrei. Did not auto-link the other 50 unmatched (no HRIS employee).
- Full write-up: `.wwg/reports/device-event-tap-display-20260817.md`.


## Latest Task Addendum - 2026-08-17 Dup updates documented + live skip proof

- Operator: confirm we are on the updates; document them.
- Local `:3001` **is** on `935963a` skip: smoke `GROK-DOC-M2-38-20260817` G�� `acs_exception_not_punch`, DB 0 rows.
- Git: `a801c4b` + `935963a` (+ later `a6dce32` TAP display).
- CONFLICTING: live B `2/38` serial 8564 still saved `02:51:12Z` after this API start G�� possible second writer. Not pushed this pass.
- Canonical report: `.wwg/reports/device-events-dup-20260817.md`.


## Latest Task Addendum - 2026-08-17 Utilization rate lives in the circle

- Operator: `<1%` sat in the header while the circle said `0% CLOCKED IN`.
- Removed the duplicate header percent. Circle shows the clock-in rate (`<1%` when 1/866) with label clocked in.


## Latest Task Addendum - 2026-08-17 Document all code changes

- Operator: make sure all code changes are well documented.
- Canonical: `.wwg/reports/zen-payroll-timesheet-code-20260817.md` (this threadG��s code + live DEV).
- Math (Manila): `.wwg/reports/zen-00010-payroll-preview-math-20260817.md`.
- Encoding pack already documented + pushed `7b5030b`.
- Operator then asked to push every leftover change. Pack: timesheet `sync-obligation-lines` + `ensure-period-drafts` `employeeIds` + WWG reports.


## Latest Task Addendum - 2026-08-17 Persist SHE design doctrine

- Operator: always be able to pull Shrink / Hide / Embody.
- Active principle: `.wwg/wiki/principles/shrink-hide-embody.md`
- Always-on reminder: `.grok/rules/06-shrink-hide-embody.md`
- Also: `DESIGN.md`, terminology **SHE**.


## Latest Task Addendum - 2026-08-17 Device event details drop payload grid

- UI: remove Device payload field grid from details modal. Keep Terminal; Device status stays on that card. Raw payload remains a closed accordion.


## Latest Task Addendum - 2026-08-17 Device event details SHE cleanup

- Operator: clean details modal; remembered Shrink + Embody, forgot Hide (Maeda SHE).
- Shrink: `max-w-lg`, one definition list, no 4-card grid.
- Hide: raw payload stays a quiet closed accordion.
- Embody: person, event, time, result, source, terminal, device status only.


## Latest Task Addendum - 2026-08-17 Device Events look duplicated on Sync

- Task mode: bug fix (DeviceEvent persist + Sync skip + UI honesty).
- Operator: Saved events 63,933; rows look unknown / no person id; CUID device names; thought Sync duplicated logs.
- Live: 63,940 rows. Screenshot is live SDK fingerprint taps with empty `dwEmployeeNo`, not four copies of one tap. CUIDs are Main D/E.
- True extra rows: C++ `identity_repost` + dedupe key includes `employeeNo` (serial 5560 = empty + 1838 + 320 + 186). 963 serial groups / 1,992 rows.
- Fix: serial-only collapse (any source / empty person), Sync skip by serial, one ACS `searchID` per job, persist taxonomy + evidence, socket device name, banner **Listener save**.
- Evidence: `.runtime/device-event-dup-20260817/FINDINGS.md`.
- REC: `REC-20260817-DEVICEEVENT-SERIAL-COLLAPSE` (C++ multi-guess + SYNC_SIGNAL vs logSearch leftover).


## Latest Task Addendum - 2026-08-17 Duplicate per active device

- Operator: extras appear on each **active** device.
- Live: only armed B/D/E. Each emits `major=2`/`minor=38` empty-person every **301s**. IPs and serials are per panel. Not one tap cloned.
- Real taps are `major=5`/`minor=38` and always have person id (590 SDK + 788 callback).
- Noise: **4,541** SDK exception rows mislabeled fingerprint pass.
- Fix: do not persist that exception; taxonomy is device health; C++ classify requires major=5.
- Evidence: `.runtime/device-event-dup-20260817/per-active-device/FINDINGS.md`.


## Latest Task Addendum - 2026-08-17 Device Events view-event deeplink

- Task mode: bug fix + document (no push).
- Operator deep link `page=116&action=view-event&id=cmsr688py002xvxwwttxhdsal`
  opened **Device event details** empty (first Gǣnot on this pageGǥ, then Gǣnot foundGǥ).
- Cause: modal used current table page only; `page` goes stale; then local API `:3001` was down while Vite `:5175` still showed cached rows.
- Fix: `GET /api/device/events/item/:eventId` + `useDeviceEvent`; modal no longer requires the row on the page.
- Spec: `docs/00-product/DEVICE-EVENTS-SAVED-EVENT-DEEPLINK.md`.
- Live: item route returns TAP / person `10`. Did not push.


## Latest Task Addendum - 2026-08-13 Attendance Utilization obligated-to-work

- Task mode: bug fix / product meaning.
- Problem: Attendance Utilization `0 of 33 work days` grew to 34 when someone clocked in.
- Fix: numerator = clocked in among people obligated to work; denominator = scheduled-to-work obligations for the selected dates. Rest-day / unscheduled / leave punches no longer inflate the 33.
- UI label: `of N scheduled to work`.
- Tests: API obligation helper 16 passing; app utilization + template 15 passing.


## Latest Task Addendum - 2026-08-13 Utilization over = regular-day schedules

- Operator: 42 grew on clock-in; wants all employees with a regular work schedule today (~2000), not obligation rows.
- Denominator now comes from `Employee.embeddedSchedule` regular (not off) days. Live: **11 clocked in / 1706 scheduled**, 1%. Clock-in does not add to 1706.
- 1360 remain Missing schedule (no embedded schedule). Those are not in the over.
- Helper: `attendance-schedule-utilization.helper.ts`. Tests: 4 passing.


## Latest Task Addendum - 2026-08-13 Device status column (display only)

- Task mode: UI display of already-stored ISAPI Select Status. No pairing. No C++. **Do not push.**
- Device Events saved/live rows show **Device status** from `AcsEventInfo.attendanceStatus` + `label`.
- Missing field = `Not sent` / `Not on wire`. Device sent `undefined` = `Unset`.
- Helper: `hris-app/app/lib/hikvision-panel-select-status.ts`.
- Time In/Out still first/later punch.


## Latest Task Addendum - 2026-08-13 BNPI app vs file findings documented

- Task mode: docs / investigation close-out (no engine change in this addendum).
- Canonical write-up: `docs/BNPI_PAYROLL_APP_VS_FILE_FINDINGS_20260813.md`
- WWG: `.wwg/reports/bnpi-payroll-app-vs-file-findings-20260813.md` + handoff entry.
- Locks: empty bio = ABSENT; OT dual file formula recommended (Path A Daily/8 + Path B BNPI).
- Next if requested: implement FILE_DUAL OT + Daily Salary import; rescan OT pay.


## Latest Task Addendum - 2026-08-13 Device status on biometric APIs

- Task mode: API + UI display. No pairing. No C++. **Do not push.**
- `GET /api/device/events` now returns `panelSelectStatus` from payload/AcsEventInfo.
- Live `POST .../acs-events` InfoList items get `hrisPanelSelectStatus`.
- Callback/sync persist stamps `payload.panelSelectStatus` when present.
- Pairing still first/later punch.


## Latest Task Addendum - 2026-08-13 Timesheet uses panel Check In/Out

- Task mode: pairing fix after live status copy.
- `selectHikvisionPunchPair` mode `panel`: Time In = earliest Check In, Time Out = latest Check Out. Later Check In is not out.
- Unsigned punches keep first/last pairing.
- Spec + REC-20260813-HIKVISION-SELECT-STATUS-HRIS-MAP Implemented.


## Latest Task Addendum - 2026-08-13 Select Status copy (ready to push)

- Task mode: implement + document + push `develop`.
- C++ copies `byAttendanceStatus`; API extract copies `AcsEventInfo.attendanceStatus`; UI **Device status**.
- Pairing unchanged. Live proof: Device D serial 9619 ISAPI `checkIn`; rebuilt listener logs `attendanceStatusPresent`.
- Spec: `docs/HIKVISION_SELECT_STATUS_MAPPING.md`.


## Latest Task Addendum - 2026-08-13 Hikvision Select Status audit

- Task mode: deep audit only (no mapping implementation).
- Operator: Hikvision **Select Status** (Check In / Out, Break In / Out, Overtime In / Out); users Check In on all devices; suspect status is not on the mapped device response.
- Result: live SDK callback never sends it; ISAPI Sync can store unused `AcsEventInfo.attendanceStatus`; HRIS pairs first tap = in, later = out.
- Live DEV residual: 689 nested statuses (678 checkIn, 6 checkOut, 2 undefined, 1 overtimeOut, 1 breakOut, 1 breakIn).
- Documented (not committed): spec `docs/HIKVISION_SELECT_STATUS_MAPPING.md`, WWG report `.wwg/reports/hikvision-select-status-audit-20260813.md`, architecture `.wwg/wiki/05-architecture/hikvision-select-status-attendance.md`.
- Evidence: `.runtime/hikvision-status-audit-20260813/` (10 agent reports + lead synthesis).
- Next only if operator asks: wire C++ `byAttendanceStatus` and/or honor panel status in pairing. Do not commit this pack unless asked.


## Latest Task Addendum - 2026-08-13 Device 5 reverse on host WiG��Fi

- Task mode: live runtime + truth sync (no code feature).
- Operator: Windows PC `192.168.1.116`, biometric `192.168.1.136` (Device 5).
- Device 5 `cmsq47r9t0039vxbwt9rfxk68` saved `ssh-reverse-forward`, runtime `https://127.0.0.1:59443`, SDK `127.0.0.1:59000`.
- Host TCP `80`/`443`/`8000` open; VM listeners `59443`/`59000` (plus leftover `58480`/`58400`); pack-captured ISAPI `401` is on `58480`.
- Live TEST A/B remain `.109`/`.110` on `58080`/`58180`. Do not reuse wiki `.102` or claim `59000`/`59443` belong to TEST A.
- Evidence: `.runtime/device5-reverse-20260813-005641/`.
- WWG: project-truth + summary + terminology reverse-tunnel term + this addendum.


## Latest Task Addendum - 2026-08-13 Vendor SDK setup vs byAttendanceStatus

- Task mode: investigation. No C++. Not pushed.
- Listener setup **does** use vendor HCNetSDK 6.1.9.48 on the VM.
- That header **has** `NET_DVR_ACS_EVENT_INFO_EXTEND.byAttendanceStatus` (0G��6 = panel six).
- C++ already opens that struct for `byEmployeeNo` and does not copy the status byte.
- HRIS setup does not configure panel T&A mode.
- Evidence: `.runtime/hikvision-status-audit-20260813/16-vendor-sdk-setup-investigation.md`.


## Latest Task Addendum - 2026-08-12 Preview Payroll without submitted timesheet

- Task mode: product feature (Run Payroll Preview only).
- Request: allow viewing payroll preview money when timesheet is not submitted,
  with clear not-submitted indication, because status does not change money when
  lines are unchanged.
- Implementation:
  1. API `previewPayrollFromTimesheets` lists statuses
     APPROVED|DRAFT|SUBMITTED|REJECTED|REVISED with salary+schedule.
  2. Keeps `includedEmployeesCount` = APPROVED ready (Start Payroll contract).
  3. Adds `previewComputableEmployeesCount`, `estimatedIncludesNonApproved`,
     row `timesheetStatus` / `isPayrollReady` / readiness labels.
  4. UI badges + copy; Run Preview enabled when computable &gt; 0 even if payable=0.
- Start Payroll / generate path **unchanged** (APPROVED only).
- Tests: `hris-api/tests/payroll-preview-readiness.spec.ts` (mocha 4);
  `hris-app/.../payroll-preview-modal.test.ts` (6).
- Live: `PP-20260711-20260726` ready 641 / preview 834 /
  `estimatedIncludesNonApproved=true`.
- Evidence: `.runtime/preview-non-submitted-20260812/`.
- Docs: project-truth, summary, terminology, handoff, e2e agent prompt,
  logging-audit note.


## Latest Task Addendum - 2026-08-12 Preview Payroll results on page

- Task mode: product UX (Run Payroll Preview).
- Request: loading/confirm may stay in modal; after processing, results must
  render on the page (not in the modal), e.g.
  `/hr/run-payroll?�&action=preview-payroll&previewStep=results&page=1&limit=10`.
- Implementation:
  1. Modal open only for `previewStep` confirm | progress.
  2. `previewStep=results` replaces Run Payroll main body with page table
     (search/pagination/scope filters + View Details).
  3. Helpers: `isPreviewPayrollModalStep`, `isPreviewPayrollResultsPage`.
- Tests: `payroll-preview-modal.test.ts` (includes page vs modal contract).
- Code: `run-payroll-template.tsx`, `payroll-preview-modal.ts`.


## Latest Task Addendum - 2026-08-11 BNPI Jun 26�Jul 10 full payroll tally log

- Task mode: investigation / evidence log (no fleet money repair claimed).
- Compared live preview vs target Sheet2 for period `PP-20260626-20260711`.
- **Result:** 4 exact tallied; Alexa near (-?0.77); Rio and most employees not tallied.
- **Day-count 818/818 fail:** code definition (non-rest lines vs paid regularDays buckets),
  not universal biometrics failure. Fixing day-count alone will not tally payroll.
- Master log: `.runtime/full-tally-20260811/FINDINGS.md`
- WWG: `.wwg/reports/bnpi-june26-jul10-payroll-tally-20260811.md`
- Handoff entry + RECs: numberOfDays buckets, WS line rebuild, period-pin enrollments.
- Next if requested: implement day-count mapping and/or WS line rebuild + re-run bulk compare.


## Latest Task Addendum - 2026-08-11 BNPI Jun 26G��Jul 10 full payroll tally log

- Task mode: investigation / evidence log (no fleet money repair claimed).
- Compared live preview vs target Sheet2 for period `PP-20260626-20260711`.
- **Result:** 4 exact tallied; Alexa near (G��G�0.77); Rio and most employees not tallied.
- **Day-count 818/818 fail:** code definition (non-rest lines vs paid regularDays buckets),
  not universal biometrics failure. Fixing day-count alone will not tally payroll.
- Master log: `.runtime/full-tally-20260811/FINDINGS.md`
- WWG: `.wwg/reports/bnpi-june26-jul10-payroll-tally-20260811.md`
- Handoff entry + RECs: numberOfDays buckets, WS line rebuild, period-pin enrollments.
- Next if requested: implement day-count mapping and/or WS line rebuild + re-run bulk compare.


## Latest Task Addendum - 2026-08-07 Benefits enroll Select employees from drawer

- Task mode: bug fix (UX + picker reliability).
- Symptom: drawer **Enroll employees** only navigated to `/hr/benefits-management/new`
  form; Select employees modal did not open reliably with `action=select-employees`.
- Fixes:
  1. Drawer / toolbar / row enroll CTAs open `?action=select-employees` so the picker
     opens immediately with benefit type preselected.
  2. `EmployeeBenefitForm` keeps local picker open state (URL is mirror, not sole gate).
  3. `Modal` portals to `document.body` at `z-[100]` so layout overflow cannot clip it.
  4. Employee picker uses **server-side search** + structural filters; shows
     GǣShowing N of M G�� search to find othersGǥ (was silent first-1000 client-only).
- Proof: `.runtime/benefits-enroll-fix-20260807-121034/report.json` pass.
- Tests: `EmployeeMultiSelectModal.test.tsx` green.


## Latest Task Addendum - 2026-08-07 Preview Payroll modal parity with Start Payroll

- Task mode: product UX feature (Run Payroll).
- Request: Preview Payroll must use the same screen journey as Start Payroll,
  with clear preview-only differentiation, then show computed list + details.
- Implementation:
  1. **Preview Payroll** opens a modal (no full-page swap of Run Payroll body).
  2. Steps: **Start Payroll Preview** (confirm) G�� **Preview running** G�� **Payroll Preview** results.
  3. Dry-run only via `GET GǪ/generate-timesheet/preview?calculateRows=true` (API param added).
  4. Results table: Basic / Gross / Deduct. / Net + **View Details**.
  5. Detail modal: **Payroll summary (Preview)** + PREVIEW banner; no payslips.
  6. Footer: Close | optional **Start real payrollGǪ**
- Code: `run-payroll-template.tsx`, `payroll-preview-modal.ts`, payrollperiod controller
  `calculateRows`, service/hook param pass-through.
- Tests: `payroll-preview-modal.test.ts` (4) green.
- Live API: period `PP-20260726-20260811` reachable; local DB had 0 approved TS in
  sample so amounts empty G�� endpoint accepts `calculateRows` without period mutation.
- Evidence: `.runtime/preview-payroll-modal-20260807-140641/`.


## Latest Task Addendum - 2026-08-05 Benefits Management enrolled count under-report

- Task mode: bug fix.
- Symptom: Meal Allowance **Enrolled = 0** in table, drawer listed ~500 people.
- Root cause: table counted client-side from a global `limit=1000` `isActive`
  sample sorted by `createdAt desc`. MLA has **831** enrollments but **0** in
  that sample window (live API proof).
- Fix: per-type API count via `countByBenefitTypeId` +
  `useEmployeeBenefitCountsByTypeIds`; drawer uses accurate total and shows
  GǣShowing N of MGǥ when list is capped.
- Tests: `employee-benefit-count.test.ts` green.
- Live: MLA `pagination.total=831`.


## Latest Task Addendum - 2026-08-05 Benefits Management full-height table standard

- Task mode: UI standard + bug fix (layout).
- Problem: `/hr/benefits-management` table was content-height only (`space-y-6` +
  no `containedScroll`); did not fill main pane like admin list tables.
- Standard (always for list DataTables):
  1. Layout viewport-fill (`isAdminViewportFillPath` / `isUnifiedViewportFillPath`)
  2. `AdminTablePageShell` (or equivalent flex height chain)
  3. `DataTable` `containedScroll`
- Code:
  - `benefits-management-template.tsx` G�� shell + `containedScroll`
  - `unified-layout.tsx` + `unified-viewport-fill.ts` G�� HR viewport-fill mode
  - `DESIGN.md`, `.grok/rules/05-datatable-full-height.md`, terminology
- Tests: `unified-viewport-fill.test.ts`


## Latest Task Addendum - 2026-08-05 Count-only DataTable column standard

- Task mode: performance + standard.
- Enrolled column must not hydrate documents: `document=false&pagination=false&count=true`
  G�� payload `{ count }` only.
- Encoded in DESIGN.md, `.grok/rules/05-datatable-full-height.md` (section B),
  terminology, DataTable/AdminTablePageShell docs.
- Service: `countByBenefitTypeId` / `countByBenefitTypeIds`.
- Tests: `employee-benefit-count.test.ts` assert count-only URL shape.


## Latest Task Addendum - 2026-08-05 Payroll tally: mass upload ? sole money source

- Operator clarification ? Project Truth **CONFIRMED**.
- Not all compensation/deduction comes from cutoff mass-upload files; recurring
  / standing enrollments apply when they resolve for the period.
- Agents must classify each line: `mass_upload` | `recurring_enrollment` |
  `engine` | `ot_attendance` | `missing_enrollment`.
- Truth: `.wwg/wiki/project-truth.md`, summary, terminology; parity checklist +
  `docs/dm-migration-workflow.md` corrected (mass upload is additive, not sole).


## Latest Task Addendum - 2026-08-05 Fix invisible View Payroll Report on completed period

- Task mode: bug fix (UI visibility).
- Symptom: on `/hr/run-payroll?periodView=past` for a COMPLETED period, the
  **View Payroll Report** control above Special Payroll looked missing.
- Root cause: button used `bg-emerald-700` / `hover:bg-emerald-800`, which are
  not present in the compiled Tailwind CSS for this app G�� transparent
  background + white text = invisible. DOM still had the button.
- Fix: `hris-app/.../run-payroll-template.tsx` G�� use `bg-emerald-600
  hover:bg-emerald-500` (proven to resolve) for View Payroll Report and current
  period month chip.
- Proof: Playwright `.runtime/view-payroll-btn-*/after-fix.{png,json}` G��
  computed bg `oklch(...)` non-transparent; green button visible above Special
  Payroll.


## Latest Task Addendum - 2026-08-05 Payroll tally: mass upload G�� sole money source

- Operator clarification G�� Project Truth **CONFIRMED**.
- Not all compensation/deduction comes from cutoff mass-upload files; recurring
  / standing enrollments apply when they resolve for the period.
- Agents must classify each line: `mass_upload` | `recurring_enrollment` |
  `engine` | `ot_attendance` | `missing_enrollment`.
- Truth: `.wwg/wiki/project-truth.md`, summary, terminology; parity checklist +
  `docs/dm-migration-workflow.md` corrected (mass upload is additive, not sole).


## Latest Task Addendum - 2026-08-04 Harden mass-upload / payroll resolve anti-stack

- Task mode: bug fix / regression guard (double ARP open-horizon + period-scoped).
- Finish line: Run Payroll cannot stack open-horizon + period-scoped same COMCODE;
  re-import of period-scoped mass upload supersedes open-horizon peers.
- Code:
  - `hris-api/helper/payroll-benefit-source.helper.ts` G��
    `preferPeriodScopedPayrollBenefitSources` in `resolvePayrollBenefitSources`
  - `hris-api/app/migration/bnpi-mass-upload-import.service.ts` G��
    `supersedeOpenHorizonBenefitsForPeriodScoped` after compensation/deduction benefit write
- Tests: payroll-benefit-source + mass-upload summary specs green (stack + supersede cases).
- Operator note: existing dirty open-horizon rows still need one regenerate (resolve now
  prefers period-scoped); re-import mass upload also completes open-horizon peers.


## Latest Task Addendum - 2026-08-04 DM3 mass upload detailed results + history

- Task mode: product UX + API observability for DM3 compensation/deduction imports.
- Finish line: after compensation/deduction upload, operator sees row-level failure
  reasons and success actions; durable **Import history** lists past imports.
- Surfaces:
  - API: enrich `import-*-mass-upload` summary (`errors` + `results` + truncation flags)
  - Persist `mass_upload_import_logs` (local clone applied on `127.0.0.1:5433`)
  - `GET /api/migration/dm3/mass-upload-imports` list/detail/CSV
  - UI: keep modal open with result tables; history table on DM3 page
- Local runtime: `npm run dev:local` G�� `.env.local-clone` G�� container
  `hris-local-dev-clone` port `5433` (not shared VM `15433`/`55435`).
- Proof: import of 2 failing rows returned per-row messages + `importLogId`;
  history listed log linked to run `cmryj0vpm00huvgaks2t2js57`.
- Tests: `bnpi-mass-upload-import.helper.spec.ts` +
  `bnpi-mass-upload-import.summary.spec.ts` (8 passing).


## Latest Task Addendum - 2026-07-29 Special Payroll one-time compensation

- Task mode: product feature (dedicated Special Payroll, separate from regular).
- Plan: `docs/00-product/AGENT-PROMPT-special-payroll-one-time.md` (`PLAN_ACCEPTED`).
- Finish line: dedicated `SpecialPayrollRun` / `Line` / `Payslip` records; preview G��
  create G�� release/cancel; manual + `.xlsx` mass upload; separate employee payslips
  with Special Payroll badge; regular payroll generation unchanged.
- Code surfaces:
  - API: `hris-api/app/specialPayroll/*`, helper/zod, additive SQL migration
    `20260729_add_special_payroll_tables.sql`
  - App: Special Payroll button/modal on Run Payroll, history chip, employee
    payroll history badge + `/employee/:id/special-payslip/:payslipId`
- Boundary: production migration application is out of scope for this pass; local
  DEV DB `55435` was not reachable at implement time so table apply is deferred.
- Tests: `tests/special-payroll.helper.spec.ts`, `tests/special-payroll.service.spec.ts`
  (10 passing).


# Latest Task Addendum - 2026-07-28 SDK Device-User Export / Import

- Status: `PARTIALLY_FULFILLED`; implementation and source export proof are complete, while physical import is gated on the user's future compatible target device.
- Existing schema/endpoints remain in use. CSV/Excel now contain exactly seven SDK columns, package users omit duplicate HRIS identity/link data, and model/firmware are read once into device-manifest metadata.
- Fresh Main Entrance Device B proof confirmed 874 unique IDs and 0 duplicates. Protected row validation decoded 1,634 fingerprint slots and 313 faces across all 874 rows with 0 invalid rows.
- Explicit residuals: fingerprint `not_enrolled=46`, `missing_raw_blob=9`; face `not_enrolled=68`, `missing_raw_blob=493`.
- Main Entrance A import preview returned 0 new / 873 match / 1 conflict. All five inventory-readable Main Entrance panels already have 874 users; offline C/TEST A/TEST B cannot pass backup/read gates. No physical write was started.
- The existing import path now surfaces conflicts first, rejects conflict execution, and cannot hide a requested face failure behind fingerprint success.
- Evidence: `.runtime/sdk-export-import-20260728-152250/`; report: `.wwg/reports/sdk-device-user-export-import-20260728.md`.

# 2026-07-28 G�� Hikvision UserInfo pagination concurrency proof

- Read-only Main B benchmark proved one stable `searchID` can serve bounded
  concurrent `UserInfo/Search` positions without losing snapshot consistency.
- Main B concurrency 1/2/4/6/8 all returned 874 unique IDs, identical sorted
  row hash, 825 FP users / 1,646 FP slots, and 806 face users. Concurrency 8
  averaged 5.417s versus 21.993s sequential.
- Main A/F/D also matched sequential hashes at concurrency 8. Main E showed
  intermittent 401/502 page failures at both sequential and parallel levels,
  proving incomplete reads must be rejected rather than deduplicated into a
  smaller result.
- Implementation now defaults read-only UserInfo pages to concurrency 8,
  retries each failed page three times with a serialized final attempt, requires
  rows and unique IDs to equal `totalMatches`, and discards/falls back to a new
  serialized search when validation fails. Physical writes remain serialized.
- Evidence/report:
  `.runtime/hikvision-pagination-benchmark-20260728/` and
  `.wwg/reports/hikvision-userinfo-pagination-benchmark-20260728.md`.


# Latest Task Addendum - 2026-07-28 DEV/UAT/PROD Employee Portal Recovery

- Status: `FULFILLED`; evidence root `.runtime/employee-portals-recovery-20260728-122800/`.
- Root cause: all three `hris-emp-app` pods were `ErrImageNeverPull`; the employee image was absent from K3s, leaving host ports `3300/3310/3320` closed and causing the named Cloudflare connector's exact origin dial `connection refused` errors.
- Durable repair: governed VM ansible-pull now detects, builds, imports, and restarts the employee image in PROD/DEV/UAT; GitOps image tags and promotion coverage include the employee app; public unauthenticated employee calendar/birthday routes are exact-match guarded; biometric kiosk polling is fail-closed unless explicitly enabled.
- Runtime schema drift in the three employee databases was repaired only after fresh full backups. PROD/DEV/UAT now expose the required benefit and payroll columns.
- Final proof: all three VM-local origins, paired APIs, public login pages, same-host API routes, valid linked-employee logins, authenticated refresh, and logout pass. Playwright recorded zero unexpected page, console, request, CORS, mixed-content, or HTTP 5xx errors.
- The VM-managed Cloudflare service remained enabled and active. All six Argo applications were `Synced/Healthy` at the deployed revision. Direct LAN SSH/HTTP from this Windows host timed out; the documented `ssh project-truth-hris` fallback passed and all VM-local plus public paths were independently proven.



# 2026-07-28 G�� Five-device raw SDK package completion

- Status: `PACKAGES_AND_PREVIEWS_FULFILLED_PHYSICAL_IMPORT_BLOCKED_BY_MISSING_TARGET_DEVICE`.
- B/A/F/D/E each have two agreeing final 874-user inventories with 825
  fingerprint users / 1,646 slots and 806 face users. Main E's incomplete
  parallel read was discarded and replaced by two agreeing serialized reads.
- Five independent schema-v1 JSON packages and exact seven-column CSV
  projections passed full row-by-row decode/reparse audit.
- Final raw custody: all devices have 1,646 FP slots; A/F/D/E have all 806 face
  blobs; B has 711 readable faces and 95 explicit physical-404 face gaps.
- All five existing-path import previews parsed the full packages. No physical
  write ran because every compatible available target is populated with 874 users.
- Full evidence/report:
  `.wwg/reports/sdk-device-user-export-import-20260728.md`.

# 2026-07-28 � Five-device raw SDK package completion

- Status: `PACKAGES_AND_PREVIEWS_FULFILLED_PHYSICAL_IMPORT_BLOCKED_BY_MISSING_TARGET_DEVICE`.
- B/A/F/D/E each have two agreeing final 874-user inventories with 825
  fingerprint users / 1,646 slots and 806 face users. Main E's incomplete
  parallel read was discarded and replaced by two agreeing serialized reads.
- Five independent schema-v1 JSON packages and exact seven-column CSV
  projections passed full row-by-row decode/reparse audit.
- Final raw custody: all devices have 1,646 FP slots; A/F/D/E have all 806 face
  blobs; B has 711 readable faces and 95 explicit physical-404 face gaps.
- All five existing-path import previews parsed the full packages. No physical
  write ran because every compatible available target is populated with 874 users.
- Full evidence/report:
  `.wwg/reports/sdk-device-user-export-import-20260728.md`.

# 2026-07-28 � Hikvision UserInfo pagination concurrency proof

- Read-only Main B benchmark proved one stable `searchID` can serve bounded
  concurrent `UserInfo/Search` positions without losing snapshot consistency.
- Main B concurrency 1/2/4/6/8 all returned 874 unique IDs, identical sorted
  row hash, 825 FP users / 1,646 FP slots, and 806 face users. Concurrency 8
  averaged 5.417s versus 21.993s sequential.
- Main A/F/D also matched sequential hashes at concurrency 8. Main E showed
  intermittent 401/502 page failures at both sequential and parallel levels,
  proving incomplete reads must be rejected rather than deduplicated into a
  smaller result.
- Implementation now defaults read-only UserInfo pages to concurrency 8,
  retries each failed page three times with a serialized final attempt, requires
  rows and unique IDs to equal `totalMatches`, and discards/falls back to a new
  serialized search when validation fails. Physical writes remain serialized.
- Evidence/report:
  `.runtime/hikvision-pagination-benchmark-20260728/` and
  `.wwg/reports/hikvision-userinfo-pagination-benchmark-20260728.md`.


## Latest Task Addendum - 2026-07-28 shared observability recovery

- Task mode: production/runtime regression repair and audit.
- PROD/DEV/UAT app, API, and employee targets are explicitly monitored and
  healthy; environment-scoped metrics, logs, and traces are queryable.
- Public Grafana login and four dashboards pass authenticated Playwright
  without unexpected application or HTTP 5xx errors.
- Backup changed from inconsistent live telemetry tar archives to atomic,
  checksum-validated Grafana PostgreSQL custom dumps with bounded retention.
  Invalid legacy archives were removed after validating replacements; root
  usage fell from 81% to 53%.
- Tempo was upgraded from 2.6.1 to 2.10.5 to repair recurring local-backend
  poller/compactor races.
- Runtime revision: `c0c00ee`; evidence:
  `.runtime/observability-audit-20260728-142401/`.


## Latest Task Addendum - 2026-07-27 Remove DM3 statutory benefits upload

- Task mode: product UX + docs truth sync (DM3 migration).
- Finish line: `/admin/configuration/migration?workbook=dm3` no longer offers
  **Upload statutory benefits**. Operator path for cutoff benefits/deductions is
  compensation mass upload + deduction mass upload only.
- Code: removed `upload=statutory` kind, UI button/step/modal copy, and
  `POST /api/migration/dm3/import-statutory-benefits-upload` route/controller.
- Offline parser/service retained for scripts/tests only
  (`bnpi-statutory-benefits-import.helper.ts`, `importStatutoryBenefitsUpload`).
- Docs: `docs/dm-migration-workflow.md`,
  `docs/BNPI_JUNE26_JULY10_2026_PAYROLL_PARITY_CHECKLIST.md`.


## Latest Task Addendum - 2026-07-27 Confirm DM4 OT upload still required

- Operator hypothesis: overtime upload can be removed because OT is already in
  biometrics raw data.
- **Verdict: FALSE G�� do not remove DM4 overtime upload.**
- Evidence:
  - Biometrics `Biometrics Data_Jun 26 - Jul 10.xlsx` = punch ledger only
    (`No.`, `Date/Time`; 23,255 rows, 877 device nos).
  - Approved OT `2rptOvertimeDetails - June 26 - July 10, 2026.xlsx` =
    OVERTIME/ND/HOLIDAY WORK DETAIL REPORT with Reg OTHrs / ND / Spcl / RHol /
    RD buckets (DM4.3 G�� effective Timesheetline).
  - Source-trace guardrail: raw biometrics = attendance evidence, not payroll
    OT truth (`validate-bandai-payroll-source-trace.ts`).
- Docs/UI truth sync (kept OT upload): `docs/dm-migration-workflow.md`,
  `docs/BNPI_JUNE26_JULY10_2026_PAYROLL_PARITY_CHECKLIST.md`, DM4 copy in
  `hris-app/.../migration.tsx`.


## Latest Task Addendum - 2026-07-27 DM3 Upload employee databank

- Task mode: product feature (DM3 migration UX + import service).
- Finish line: `/admin/configuration/migration?workbook=dm3` has
  **Upload employee databank** that create/updates employees from BNPI
  Manpower Databank `.xlsx` without requiring a full DM3 re-upload.
- Behavior: auto-pick latest day sheet (or sheet named Manpower Databank);
  match `ID No.` G�� `EMP_ID`; create missing + update existing; preserve
  `basicSalary` / email / statutory IDs; no delete of missing IDs.
- Code: helper/service/API + DM3 UI button/modal; docs in
  `docs/dm-migration-workflow.md`.


## Latest Task Addendum - 2026-07-25 Stable overnight gap-convergence job card

- Companion card (still valid):
  `docs/00-product/AGENT-PROMPT-overnight-five-device-gap-convergence-stable-job.md`


## Latest Task Addendum - 2026-07-25 Multi-agent overnight gap loop

- Companion prompt:
  `docs/00-product/AGENT-PROMPT-overnight-multiagent-gap-loop-with-execution-preview.md`


## Latest Task Addendum - 2026-07-25 Agent-owned blocker fix + gap burn (primary)

- **Primary paste prompt:**
  `docs/00-product/AGENT-PROMPT-overnight-agent-owned-blocker-fix-and-gap-burn.md`
- Companions:
  - `docs/00-product/AGENT-PROMPT-overnight-multiagent-gap-loop-with-execution-preview.md`
  - `docs/00-product/AGENT-PROMPT-overnight-five-device-gap-convergence-stable-job.md`
- Treat UI GǣExporting source credentialGǥ / owner scan incomplete as **agent-owned
  export/gate code work**, not physical enroll. PreviewG��dryRunG��execute match.
- Live progress: residual 2813G��~19xxG��22xx; unique face 690G��~48xG��51x; faceReady
  burning on A/D/E/F; fpReady still 0 until unlock. Fix budget burn + unique-person
  selection (`39d5a7d`).
- Evidence: `.runtime/overnight-gap-loop-20260725-075850/`.


## Latest Task Addendum - 2026-07-24 Credential recovery architecture handoff

- Task mode: docs-only architecture truth and ordered execution handoff. No
  physical credential write or runtime mutation was authorized for this
  documentation turn.
- Confirmed defect: `Recovery queued` is currently a planner/UI classification,
  not a durable worker-owned queue. `Ready now 0` means no selectable reviewed
  operation in that plan; it does not prove recovery is running.
- Historical screenshot baseline: 3,257 potential operations, 505 fingerprint,
  2,630 face, 122 card, ready 0, recovery queued 3,237, and headline physical
  action 20. Backend stage physical identity action was 18; this classification
  disagreement remains `CONFLICTING`. These counts must be refreshed before
  implementation or writes.
- Architecture record:
  `docs/00-product/HIKVISION_CREDENTIAL_RECOVERY_ARCHITECTURE.md`.
- Ordered owner prompt for the later implementation/write run:
  `docs/00-product/AGENT-PROMPT-durable-credential-recovery-and-live-gap-convergence.md`.
- Finish line for that later run: durable restart-safe recovery tasks,
  deduplicated source custody, honest live counters, bounded multi-target
  concurrency, physical-reread-owned fingerprint/face gap reductions, focused
  tests, browser proof, GitOps exact-SHA deployment, and truth sync.


## Latest Task Addendum - 2026-07-24 Overnight five-device biometric convergence

- Task mode: authorized durable credential recovery writes on five Main
  Entrance devices (A/B/D/E/F). Exclude Main C and TEST A/B.
- Proven session: ~429 face + ~12 FP verified mostly **G�� B**; residual non-B
  blocked by face attestation + FP owner scan. Grafana/Loki used.
- Evidence:
  `.runtime/overnight-biometric-convergence-20260724-230000/STATUS.md`.


## Latest Task Addendum - 2026-07-24 DEV data clone to UAT and PROD

- Task mode: authorized high-risk K3s PostgreSQL and upload-volume migration.
- Status: `FULFILLED_WITH_PUBLIC_NETWORK_WARNING`.
- SHA-256-verified DEV/UAT/PROD pre-clone database dumps and upload archives
  are retained on the VM under
  `/var/lib/project-truth/backups/dev-to-uat-prod-20260724-144222`.
- The same DEV custom dump was restored independently into UAT and PROD while
  each target API writer was stopped. DEV uploads were mirrored into both
  target upload volumes; shared DM import/source host paths and Kubernetes
  environment secrets/config were left unchanged.
- Business parity proof: 75 public tables, 2,225 employees, 2,048 users, 8,680
  documents, 42 workflow instances, 87,217 attendances, 10,965 timesheets,
  129,255 timesheet lines, 5,692 device users, and 20,374 device events in
  DEV/UAT/PROD. All three upload volumes have 71 files and the same content-set
  SHA-256.
- PROD/DEV/UAT LAN app/API HTTP, admin login, `/api/auth/me`, and headless
  dashboard entry passed. Argo CD reports all six environment/runtime apps
  `Synced/Healthy`; the VM-managed Cloudflare service remained active.
- Boundary: public HTTPS resets from the BNPI workstation remain a documented
  network-vantage issue. This does not contradict the green LAN origins, but
  public reachability is `NEEDS_CONFIRMATION` from an unfiltered vantage.
- Evidence: `.runtime/dev-to-uat-prod-20260724-144222/REPORT.md`.
- No new recommendations were identified.


# Latest Task Addendum - 2026-07-23 Agent-Owned Fresh Revalidation

- Status: `PARTIALLY FULFILLED`; new evidence root `.runtime/merge-device-users-overnight-20260723-050702/`.
- The earlier five-device clean plan is now `STALE` for execution. Four new read-only plans never produced a stable zero-error scope: validity shifted across 4/5, 1/2, 1/5, and 3/5 devices. The latest plan `39f0ab6c-5cf6-443d-888a-51a3ef9f75fb` had 865 unique IDs, 1,081 conflicts, 186 missing target records, and E/A Unauthorized reads.
- No new merge job, canary, or physical write was started. Automatic source selection remains prohibited while read errors and conflicts exist.
- Runtime repairs made in this pass: bounded optional TEST bridge bootstrap; canonical DB watcher log contention tolerance; transient Prisma transport retry; direct-LAN-to-Cloudflare SSH fallback hardening; reverse API port `53001`; listener spool replay moved after SDK arm; bounded listener log scan.
- Fresh listener execution armed Main Entrance A/B/D/E/F while C returned HCNetSDK error 7. Final SSH status became unavailable after three direct-LAN timeouts and repeated Cloudflare Access banner timeouts, so final armed state is `NEEDS_CONFIRMATION` rather than green.
- Final Playwright truth: admin login and Sync Center render, but Merge reports 0/8 available and Listener reports status unreachable. This is a failed exit gate, not a completed merge.
- Focused validation: 37 API Hikvision contracts, 13 frontend device UI/events contracts, the PowerShell bridge contract, and API TypeScript typecheck passed.


# Latest Task Addendum - 2026-07-23 Overnight Merge Device Users Closeout

- Status: `PARTIALLY FULFILLED`; evidence root `.runtime/merge-device-users-overnight-20260722-205845/`; wakeup report `WAKEUP-REPORT.md`.
- Accepted live scope: Main Entrance B/A/D/E/F. Main Entrance C and TEST A/B are excluded from completion claims.
- Fresh physical records increased from 3,583 to 4,044 while the unique union stayed 865. Final peer gaps are 281, all on 205 unresolved-conflict IDs; zero conflict-free rows remain.
- No readable raw fingerprint or face custody existed. Count-only enrollment remains explicitly unresolved and was not fabricated or called synced.
- Code repairs through `fb8750e` are pushed to `develop` and deployed to the DEV VM runtime. Runtime DB/API/app/AG��F tunnels and focused API/UI/browser validation are green at close.
- Remaining boundary requires new physical connectivity evidence for excluded devices or human conflict adjudication; automatic source guessing is prohibited.


## Latest Task Addendum - 2026-07-23 Local DEV + Sync Center green owner loop

- Task mode: mixed runtime regression repair, backend timeout/partial-result hardening, and admin Sync Center UX repair.
- Current local runtime: `127.0.0.1:55435`, API `:3001`, and app `:5175` are healthy; one frontend dev process owns `5175`; all 18 A-F host tunnel ports carry TCP; VM `53001 -> host 3001` is healthy; the named Cloudflare service stayed active.
- Superseded/conflicting device claim: bounded quick health reported Main Entrance A-F transport-positive while the operator reports exactly five physically online and Main C down. Do not call this six online; root cause remains open.
- Merge truth: the final read-only browser plan settled in 142 seconds with 865 union IDs from 4 readable A-F devices, 2 exact live inventory failures, and 2 offline TEST devices. The review blocked writes until read failures are resolved and issued zero merge apply/job requests.
- UI truth: Sync Center keeps saved counts visible while refreshing, no longer derives availability from quick-preview `vendorUserCount`, exposes Retry/Refresh recovery controls, and distinguishes readable inventory from transport availability. Saved Events rendered 18,803+ persisted rows independently of listener status.
- Evidence root: `.runtime/sync-center-dev-green-20260723-114317/`.
- Validation: API typecheck passed; 30 focused backend contracts passed; 31 Device Users/Device Events frontend contracts passed; targeted ESLint has zero errors; Playwright critical and merge paths have zero console errors/failed requests; `git diff --check` passed.
- Implementation commit: `59be99dff6e2acefce007c4c3ca07c3abad20967` (already on `origin/develop` during validation).
- Remaining real boundary: Main A-F all pass transport health, but the full live inventory endpoint is currently reliable for four devices in one bounded plan; the other two return exact `Unauthorized`/transport failures and are not treated as readable. No physical write was attempted.


## Latest Task Addendum - 2026-07-23 Five-device truth and actual merge execution

- Operator evidence: exactly five Main Entrance biometric devices are currently online; Main Entrance Device C is not. Any API/UI claim of six online is `CONFLICTING` until its cache/mapping/probe semantics are root-caused.
- Prior loop boundary: it stopped at a read-only partial merge plan and issued zero write requests. That did not fulfill the requested merge.
- Active execution contract: `docs/00-product/AGENT-PROMPT-five-device-live-merge-root-cause-owner-loop.md`.
- Finish line: reconcile the five-versus-six conflict, prove exactly five authenticated/full-readable devices excluding Main C, validate the frozen five-device plan, start the authorized physical merge job, monitor and repair it to terminal state, reread all five targets, prove convergence, then truth-sync/push/exact-SHA CI.
- Unknown errors are open defects. Logs must identify device, target, request/stage, duration, and underlying API/SDK/tunnel cause; insufficient observability must be repaired.


# Latest Task Addendum - 2026-07-22 Main Entrance A-F Health and Local Bootstrap Repair

- Task mode: runtime diagnosis, focused bootstrap regression repair, API/browser proof, and public-ingress boundary audit. Status: `FULFILLED_WITH_WARNING`.
- Canonical DEV DB truth: six active Hikvision rows exist on B `.20`, A `.21`, C `.22`, D `.23`, E `.24`, and F `.25`; all use HTTPS `443` and SDK `8000`. No device row needed mutation.
- Root cause: Windows `npm run dev` and the active local SSH tunnel mapped only `.20-.23`. `.24/.25` therefore bypassed `PROJECT_TRUTH_HIKVISION_TUNNEL_MAP`, fell back to direct Windows routing, and rendered offline even though the VM and K3s runtime could reach them.
- Repair: default tunnel/predev/restart labels and the tunnel contract now cover `.20-.25`. The regenerated tunnel exposes all 18 HTTP/HTTPS/SDK forwards and local API reloads the six-device map.
- Proof: VM `nc` and ISAPI unauthenticated probes reached all six; K3s DEV quick health reported all six online; local quick health reported all six online via `env_tunnel_map`; full authenticated `.24/.25` health returned `systemTime=readable` and `deviceApi=online`; Playwright found every address and six online API responses. Focused test passed 11/11, API typecheck passed, Node syntax and PowerShell parse passed.
- Public boundary: LAN app/API `10.184.37.19:3100/3101` return 200 and `cloudflared-bnpi-hris.service` remains active, but public `bnpi-hris.tech` hosts return Cloudflare 503/TLS resets. Existing QUIC plus additive HTTP/2 connector probes from VM source `.19` and `.78` all failed at Cloudflare edge TLS/control streams. The named service was not stopped or reconfigured.
- Evidence root: `.runtime/hikvision-six-device-20260722-143712/`.


# Latest Task Addendum - 2026-07-22 Merge Listener Truth and Active Progress UI

- Task mode: mixed live runtime ownership, merge-plan truth inspection, listener UI polish/hardening, and evidence handoff.
- Original merge job truth: job `a9d3acf7-7dee-406a-9198-c413fbd699d4` is still not pollable after local API restart; latest poll saved under `.runtime/merge-users-final-run-20260722-042955/poll-loop-20260722-152326/` returned 404 `SDK user merge job not found or expired`. Do not claim it completed.
- TEST B recovery: rebuilt the TEST B reverse bridge for `192.168.254.110` on VM/host ports `58180/58100`; evidence `.runtime/hikvision-vm-ssh-bridge/20260722-151306/`. SDK TCP connects on `58100`, but HTTP/ISAPI through `58180` still times out, so TEST B remains unreliable for final reread truth.
- Fresh original-six plan after TEST B bridge is still invalid for final counts: `.runtime/merge-users-final-run-20260722-042955/fresh-original-six-plan-after-testb-bridge-20260722-151423/operator-summary.json` shows `validForFinalCounts=false`, `unionUsers=694`, `sourceRows=1381`, `plannedWrites=3470`, and 4 errors: Main Entrance D `Unauthorized`, TEST B `fetch failed`, Main Entrance C `Unauthorized`, TEST A `fetch failed`.
- Focused Main A-D reread narrowed the LAN issue: `.runtime/merge-users-final-run-20260722-042955/fresh-main-a-d-plan-after-cd-unauthorized-20260722-151915/operator-summary.json` shows A/B/C read and Main Entrance D `Unauthorized`; separate D health proof `.runtime/merge-users-final-run-20260722-042955/device-d-health-20260722-152010/` shows D online with `userRead.count=744`, so the D plan failure is endpoint/path-specific or transient, not general reachability.
- Live listener/progress truth: latest poll `.runtime/merge-users-final-run-20260722-042955/poll-loop-20260722-152326/operator-progress.json` shows `sdkState=receiving`, `callbacks=true`, `armed=true`, device summary `receiving=6`, and active SDK inventory reads from Main Entrance Device E `cmriu5ab102goi001x9o7nfct` through `totalMatches=740`. This is live listener/background SDK work, not the expired merge job.
- Frontend listener modal polish/hardening: `events.tsx` now distinguishes callback receiving from armed/listening state and surfaces an `Active SDK work` strip parsed from real listener JSONL rows. Browser proof `.runtime/merge-users-final-run-20260722-042955/browser-listener-active-work-20260722-151819/operator-proof.json` shows the modal, raw log tail, `0 callbacks / 6 armed/listening / 0 login failed / SDK work active`, and `Active SDK work`.
- Validation: `hris-api npx tsc --noEmit --pretty false --incremental false --listFiles false` passed; `hris-app npm exec -- vitest run app/routes/admin/devices/device-user-ui-contract.test.ts` passed; targeted frontend ESLint for `events.tsx` and `enroll.tsx` passed with 0 errors and existing warnings only.
- Remaining gaps: no safe merge retry has been started; TEST A/B final reread remains blocked by fetch failures/TEST A SDK-login boundary, Main D plan path needs a clean reread after health proof, the API restarted during one A-D plan attempt, and listener logs show some invalid biometric reconcile retries with empty `sourceDeviceId`/`employeeNo` rejected by API 400. No SDK files were deleted and Cloudflare was not disabled.
- Final non-mutating poll in this turn: `.runtime/merge-users-final-run-20260722-042955/fresh-main-a-d-plan-after-d-live-read-20260722-152629/operator-summary.json` still returned `validForFinalCounts=false`, `unionUsers=748`, `sourceRows=1435`, `plannedWrites=2244`, with Main Entrance D `Unauthorized` and Main Entrance B `Unauthorized`. This reinforces the no-write boundary: listener receiving does not equal merge-plan final-count readiness.


# Latest Task Addendum - 2026-07-22 Active Merge Job 77df35c4 Live Watch

- Task mode: mixed live-device operations, running-job observability, frontend polish/hardening, and evidence capture.
- Original requested job `a9d3acf7-7dee-406a-9198-c413fbd699d4` remains expired/404 and must not be marked complete.
- A new live merge job appeared in the API and is being watched: `77df35c4-6c9b-4a68-9201-8ffc71fcb14b`, plan `328f5da4-71bd-4619-a281-05aaac6329e5`, started `2026-07-22T07:34:04.123Z`. This job was not started by this agent turn.
- Scope warning: backend `writeMatrix` for the active job says `selectedUniqueIds=852` and `totalWrites=2551`, not the earlier intended `569 selected needs-decision IDs / 2845 peer copy attempts`. Treat this as a real scope mismatch requiring final documentation, not as corrected truth.
- Live progress proof is saved continuously under `.runtime/merge-users-final-run-20260722-042955/active-job-77df35c4-6c9b-4a68-9201-8ffc71fcb14b/` (`poll-*.json` and `polls-robust.jsonl`). Polls expose current employee, source, target(s), credential stages, backend stage, `updatedAt`, applied writes, and failed writes.
- Current observed trajectory during this handoff window: job advanced through employees including `469`, `1340`, `7`, `9`, `927`, `1615`, and `11`; failures increased from timeout/circuit-skip paths such as `Main Entrance Device E -> Main Entrance Device C/F`. Do not hide these as success.
- Frontend polish/hardening: running merge modal now shows a `Live copy now` block from backend `progressEvents` with Employee now, Source, Targets, Credential stage, and a `Latest backend events` list. Browser proof `.runtime/merge-users-final-run-20260722-042955/browser-merge-live-work-20260722-1545/operator-proof.json` proves the modal shows running job state, locked scope, selected unique IDs, peer copy attempts, live event rows, and no editable pre-run review controls.
- Validation after patches: `hris-app npm exec -- vitest run app/routes/admin/devices/device-user-ui-contract.test.ts` passed; targeted frontend ESLint for `events.tsx`/`enroll.tsx` passed with 0 errors and existing warnings; `hris-api npx tsc --noEmit --pretty false --incremental false --listFiles false` passed after literal biometric-status hardening in `device.controller.ts`.
- Runtime health: API health stayed green, DB forward was checked on `127.0.0.1:55435`, and Cloudflare was not disabled. A transient watcher 503 and one DB-forward blip were recorded; subsequent polls recovered.
- Finish line remains open: keep polling until job terminal, then run fresh non-mutating reread/merge plan for the same devices and document remaining conflicts, missing users, fingerprint gaps, face gaps, failed rows, and any no-raw/device limitations without invented completion.


# Latest Task Addendum - 2026-07-22 Merge Users Selected-ID Matrix Review

- Task mode: mixed admin UX hardening, backend job-contract hardening, non-mutating endpoint proof, and Playwright verification.
- Product truth: merge users must be reviewed as one row per unique device/vendor person ID, not one row per raw issue/detail. A selected unique ID writes from one shown physical source device to peer target devices; fingerprint and face are included only when the shown source record exposes usable biometric data. Missing raw blobs/count-only claims must not be fabricated.
- Frontend repair: `Needs review IDs` now uses unique-ID rows, not duplicate issue rows. The final review modal is a wider operational matrix with selected unique IDs, peer copy attempts, fingerprint gaps, face gaps, conflicts resolved, per-target writes, per-source writes, and a full selected-ID matrix with physical source, targets, biometric source evidence, selected-device coverage/gaps, copy count, and an Edit action back to the row.
- Backend repair: merge job progress now carries a `writeMatrix` snapshot with selected unique IDs, total writes, fingerprint gaps, face gaps, per-target/per-source summaries, and per-row source/target/coverage data. Job `totalWrites` is aligned to that matrix so polling does not disagree with the review.
- Live browser proof: Playwright opened the admin Device Users merge flow on `localhost:5175`, authenticated as admin, hit `POST /api/device/hikvision/sdk-users/merge/plan`, used recommended sources, and opened the final review without starting the real job. The modal showed `754` selected unique IDs, `3,770` peer copy attempts, `3,493` fingerprint gaps, `3,655` face gaps, and `1093/1093` conflicts resolved. Row proof showed ID `1` as fingerprint `Source 2`, `5/6 devices; 1 gap`, face `Source 1`, `6/6 devices; aligned`, and `5` peer copy attempts.
- Validation: focused frontend UI contract passed; targeted frontend ESLint had 0 errors with existing warnings only; backend merge-helper tests passed 12/12; backend typecheck passed; `git diff --check` passed with only CRLF notices.
- Evidence root: `.runtime/merge-users-ui-proof-20260722-035213/`.


# Latest Task Addendum - 2026-07-22 Merge Users Running-State Stage Repair

- Task mode: admin UX regression repair and job-state truth hardening.
- Problem: after the real merge job started, the main merge modal still rendered the pre-run review/editor controls (`Review merge by unique ID`, select/deselect scope, recommended sources, per-device impact, editable rows) underneath the running progress card. That was misleading because the selected scope/source matrix is already frozen once the backend job exists.
- Repair: while `hasSdkMergeJob` is true, the modal now hides the review/editor surface and shows only the job monitor. The monitor includes progress, terminal retry/dismiss actions, and a `Locked job scope` panel from backend `writeMatrix` with selected unique IDs, peer copy attempts, biometric gaps at start, targets receiving copies, and physical sources used.
- Boundary: this pass did not start another real merge job. The fix is validated by source contract and build/lint checks; a browser proof against the exact operator job requires the active `mergeJobId` from that browser/session or a fresh approved job run.


# Latest Task Addendum - 2026-07-22 Merge Users Live Progress Truth Repair

- Task mode: live job truth inspection plus admin running-state UX repair.
- Live truth checked from local API: job `d4fe5561-64f7-4349-b53e-922486c7436b` still returned `status=processing`, `totalWrites=3770`, `processedWrites=565`, `successfulWrites=0`, `failedWrites=0`, `results=[]`, and `startedAt=2026-07-21T19:54:47.863Z`. This means no actual per-target write results had returned yet; `565` was only the backend's initial progress marker.
- Repair: the running job card now labels the `565` style number as `Progress estimate` while processing, not `Completed`. It adds `Current phase`, `Elapsed`, `UI polling`, and `Backend update` heartbeat fields, and explains that actual `Applied` / `Needs attention` counts remain zero until per-target results return and devices are reread.
- Backend contract repair: merge job updates now stamp `updatedAt`, and the frontend job-progress type includes `updatedAt`, so future polls can separate stale backend state from active UI polling.


## Latest Task Addendum - 2026-07-22 Main Entrance A-F six-device tunnel repair

- Task mode: live runtime reachability + tunnel bootstrap.
- Proven: VM reaches `.20-.25` on 80/443/8000; host does not (tunnel required for local API).
- Root cause of E/F offline locally: stale four-device tunnel map missing `.24/.25`.
- Fixed: six-device SSH tunnel running; local + K3s DEV health online for A-F.
- Evidence: `.runtime/device-a-f-reach-20260722-143906/`.
- Boundary: do not treat TEST A/B reverse bridge as this tunnel; Cloudflare remains active.

## Latest Task Addendum - 2026-07-22 Merge Users Overnight Loop Terminal Evidence

- Task mode: mixed live runtime ownership, backend merge-job repair, admin UX hardening, and evidence handoff.
- Runtime status:
  - Local API `http://localhost:3001` is healthy after restart and admin login works.
  - DEV Postgres forward remains on `127.0.0.1:55435`.
  - Hikvision local tunnels for `.20/.21/.22/.23` remain active; Cloudflare was not disabled.
  - The original in-memory job `a9d3acf7-7dee-406a-9198-c413fbd699d4` and fast retry job `8498a8cf-81a8-42b1-b836-6f77ca9323ca` are no longer pollable after API restart, so completion was not invented.
- Job/run truth:
  - Fast retry job `8498a8cf-81a8-42b1-b836-6f77ca9323ca` processed `2813/2813` observed writes before terminal `failed` at reread/finalize with `Cannot read properties of undefined (reading 'counts')`.
  - Last honest live processing evidence before failure showed `successfulWrites=366` and `failedWrites=2447`; the terminal failed response collapsed failed writes and is not copy-row truth.
  - Fresh six-device plan after restart returned `852` unique IDs, `3715` source/device records, `needsDecisionIds=0`, `4260` all planned writes, `1235` conflicts, `1397` missing, and `51` missing HRIS links. This proves the original selected Needs-decision scope was consumed/resolved, but it does not prove all devices are synced.
  - Fresh four-device plan for the VM-reachable `.20/.21/.22/.23` devices returned `687` unique IDs, `2748` source/device records, `needsDecisionIds=0`, `2061` all planned writes, `952` conflicts, `0` missing, and `47` missing HRIS links.
- Backend repair:
  - Reread finalization now accepts both plan shapes (`reread.counts` or `reread.plan.counts`) instead of crashing on `counts`.
  - Merge job failure catch now preserves latest processed/success/failed write counts instead of resetting to one failed row.
  - Merge job progress/list responses now expose grouped copy failure summary by source/target and error family.
  - VM manual-copy SDK preflight/spec generation now bypasses the Windows-local tunnel map and uses physical saved endpoints for the VM-side SDK copy lane.
- UI repair:
  - Failed merge monitor shows grouped `Copy failures by path`.
  - Locked monitor remains non-editable when a job exists and keeps selected unique IDs separate from peer copy attempts.
- Evidence:
  - Evidence root: `.runtime/merge-users-final-run-20260722-042955/`.
  - Fresh plan summary: `fresh-plan-after-restart-corrected-summary-20260721235344.json`.
  - Four-device plan summary: `fresh-four-direct-plan-summary-20260722-080903.json`.
  - Failure grouping: `copy-failure-latest-events-summary-20260722-075633.json`.
  - VM physical SDK proof: `vm-physical-sdk-preflight-simple-20260722-075847.json` (`.20-.23` OK, TEST A/B `.109/.110` failed).
  - Browser proof: `browser-merge-monitor-proof/summary.json` and `merge-monitor-proof.png`.
- Validation:
  - `hris-api`: `npx.cmd tsc --noEmit --pretty false --incremental false --listFiles false` passed.
  - `hris-api`: `npx.cmd tsx node_modules/mocha/bin/mocha --no-config tests/hikvision-biometric-sync-contract.spec.ts` passed (`16` passing).
  - `hris-app`: `npm exec -- vitest run app/routes/admin/devices/device-user-ui-contract.test.ts` passed.
  - `hris-app`: `npx.cmd eslint app/routes/admin/devices/enroll.tsx --max-warnings=999` had `0` errors with existing warnings only.
- Boundary:
  - Do not claim all `852` unique IDs are fully synced.
  - Do not claim fingerprint/face bytes are fixed from counts.
  - Do not start a blind six-device retry: current plan has `needsDecisionIds=0`, remaining conflicts/missing require targeted repair, and TEST A/B SDK ports are not reachable from the VM manual-copy lane.


## Latest Task Addendum - 2026-07-22 Merge users unique-row frontend drift repair

- Task mode: Focused admin UX truth repair.
- Implemented:
  - The Merge device users modal now keeps `mergeList=issues` and issue-filter views (`Needs decision`, fingerprint gaps, face gaps, missing) to one selectable row per unique device/vendor ID instead of repeating the same ID once per issue/conflict row.
  - Issue filter chips and per-device impact counts now count unique IDs, not raw issue rows.
  - Raw issue/conflict details remain available through the per-row Review sources drilldown.
  - The dead `Preview only` execution gate was replaced with a separate `Review selected merge` confirmation modal before starting the real merge job.
- Runtime/API proof:
  - Evidence root: `.runtime/merge-users-review-confirm-20260722-032110/`.
  - Non-mutating merge-plan endpoint returned four selected Hikvision devices, 687 unique IDs, 2,748 device ID records, zero duplicate unique keys, zero blocking errors, and 2,061 potential device writes.
- Validation:
  - Frontend focused Device Users UI contract passed.
  - Backend merge helper tests passed (12 passing).
  - `npx eslint app/routes/admin/devices/enroll.tsx --max-warnings=999` parsed the file with zero errors; existing warnings remain.
  - App-wide frontend typecheck remains blocked by unrelated existing drift outside this device surface.
- Recommendation capture: No new recommendations were identified.


# Latest Task Addendum - 2026-07-22 Merge Job 77df35c4 Terminal Failed-Stale

- Terminal status: live job `77df35c4-6c9b-4a68-9201-8ffc71fcb14b` reached `status=failed`, `currentStage=failed_stale`, `processedWrites=428`, `successfulWrites=361`, `failedWrites=67`, `totalWrites=2551`. Evidence: `.runtime/merge-users-final-run-20260722-042955/active-job-77df35c4-6c9b-4a68-9201-8ffc71fcb14b/terminal-poll-20260722-155537.json`.
- Failure reason from backend: `Merge job interrupted (stale processing snapshot). Worker not active in this API process.` The API had restarted; do not claim completion.
- Failure grouping from merge ledger: 67 failures = 56 circuit skips, 9 timeouts, 2 other errors. By pair: E -> F 31, E -> C 31, B -> E 3, B -> C 1, B -> F 1. Evidence: `.runtime/merge-ledger/77df35c4-6c9b-4a68-9201-8ffc71fcb14b/failure.jsonl`.
- Fresh non-mutating post-failure rereads were run by pair because the four-device plan exceeded/closed the request boundary. Evidence root: `.runtime/merge-users-final-run-20260722-042955/pair-rereads-after-77df35c4-failed-stale-20260722-1559/`.
- Post-failure pair truth:
  - E-C: both devices read `740`, `missing=0`, `plannedWrites=0`; aligned for presence, conflicts remain `588`.
  - E-F: E `740`, F `687`, `unionUsers=852`, `missing=277`, `plannedWrites=277`.
  - B-E: B `687`, E `740`, `missing=53`, `plannedWrites=53`.
  - B-C: B `687`, C `740`, `missing=53`, `plannedWrites=53`.
  - B-F: B `687`, F `687`, `unionUsers=837`, `missing=300`, `plannedWrites=300`.
- Safe retry boundary: backend provided no `retryPlanId`; the running job scope was already a mismatch (`852/2551` vs intended `569/2845`), and fresh plans still include conflicts/source-choice decisions. Do not start a new write retry automatically from guessed choices. A safe retry needs a reviewed remaining-scope plan or backend-generated retry plan.


## Latest Task Addendum - 2026-07-22 Overnight local dev stack recovery (login + DB + device health)

- Task mode: recoverable overnight loop for host-local `npm run dev` stack.
- Job card: `docs/00-product/AGENT-PROMPT-overnight-local-dev-stack-recovery.md`
- **Live snapshot at task open (re-probe; do not treat as done):**
  - `3001` API **CLOSED** G�� cannot login (no API process).
  - `5175` app **LISTEN** G�� frontend up alone does not equal working login.
  - `55435` DEV DB forward **CLOSED** G�� Prisma cannot reach K3s DEV Postgres.
  - Hikvision tunnel ports `10080/10081/18000` **CLOSED** G�� local device health via tunnel map cannot be green.
  - Host Wi-Fi `192.168.1.110`; `ping 10.184.37.19` **False** G�� use `ssh project-truth-hris` for DB/device tunnels, not direct LAN.
- **Why login fails (causal chain, evidence-backed):**
  1. Login requires API on `:3001` + Prisma G�� `DATABASE_URL` `@127.0.0.1:55435`.
  2. When `55435` is down, login returns 500 with `Can't reach database server at 127.0.0.1:55435` (seen in `.runtime/local-api-watch/latest.log`).
  3. `/health` can still say healthy while DB is down G�� health alone is not acceptance.
- **Device health (from WWG handoff, mark STALE until re-proven):**
  - Earlier same-day: Main Entrance AG��F online after six-device tunnel (`.runtime/device-a-f-reach-20260722-143906/`).
  - TEST A/B separate boundary; not part of `.20-.25` tunnel map.
  - Current host probe: tunnels down G�� local device health **NEEDS_CONFIRMATION** / expected offline until tunnels restored.
- Finish line: EXIT GATE in overnight job card (DB + API health + login token + me + app + tunnel proof + device JSON + WWG stamp).
- Evidence root: `.runtime/overnight-dev-stack-recovery-20260722-200655/`
- Boundary: no merge completion claims; no inventing device online counts.

## Latest Task Addendum - 2026-07-22 Merge listener truth and TEST A/B boundary

- Task mode: mixed live runtime recovery, listener-status UX hardening, and merge-plan evidence.
- Runtime status:
  - Local API `http://localhost:3001` was recovered after it dropped; health and admin login passed again.
  - Frontend `http://localhost:5175` was restarted and browser-proven after the listener modal patch.
  - DEV DB forward `127.0.0.1:55435` stayed open.
  - `.20/.21/.22/.23` Hikvision host tunnels stayed active; Cloudflare was not disabled.
- Merge/run truth:
  - Original job `a9d3acf7-7dee-406a-9198-c413fbd699d4` is not pollable after API restart, so completion was not invented.
  - Current valid four-device reread for `.20/.21/.22/.23`: `validForFinalCounts=true`, `unionUsers=698`, `sourceRows=2759`, `dedupedDeviceRecords=2759`, `conflicts=862`, `missing=33`, `missingHrisLinks=47`, `plannedWrites=2094`.
  - Current six-device reread after TEST A/B host-local forward remains `validForFinalCounts=false`; TEST A and TEST B still fail HTTP user reread with `fetch failed`, and one run also saw Main Entrance Device A `Unauthorized`. These six-device counts are diagnostic only and must not be used as final truth.
  - TEST B isolated peer copy for employee `9` succeeded earlier with `fingerprintCount=2`, `faceCount=0`; TEST A clean retry remains deterministic SDK login failure `lastError=9`.
- Listener/UI truth:
  - Backend listener endpoint currently reports Main Entrance Device B armed and TEST A login failed on SDK `58000`.
  - The listener modal now waits long enough for the VM status call and distinguishes HRIS post failure from SDK login failure. Browser proof shows `0 receiving / 1 armed / 1 login failed`, Main B `Armed, waiting for tap`, TEST A `Login failed (9)`, and `HRIS callback post failed after reading 10.184.37.20`.
- Evidence:
  - Browser: `.runtime/merge-users-final-run-20260722-042955/browser-listener-modal-live-20260722-145705/`.
  - Valid four-device plan: `.runtime/merge-users-final-run-20260722-042955/fresh-four-device-plan-current-20260722-144103/`.
  - Invalid six-device diagnostic plan: `.runtime/merge-users-final-run-20260722-042955/fresh-six-device-plan-after-host-forward-20260722-143756/`.
  - TEST A/B host-local forward proof: `.runtime/merge-users-final-run-20260722-042955/testab-host-local-forward-20260722-143736/`.
- Validation:
  - `hris-api`: typecheck passed.
  - `hris-api`: Hikvision biometric sync contract passed (`16` passing).
  - `hris-app`: Device Users UI contract passed.
  - `hris-app`: targeted ESLint for `events.tsx` and `enroll.tsx` exited `0` with existing warnings only.
- Boundary:
  - Do not claim all `852` or current six-device unique IDs are fully synced.
  - Do not claim fingerprint/face bytes are repaired from counts alone.
  - Do not start a blind six-device retry while TEST A/B cannot provide reliable HTTP reread and TEST A still has SDK login `9`.


# Latest Task Addendum - 2026-07-21 Sync Center DB/Live Gate Removal + Four Device Proof

- Task mode: mixed live runtime repair, admin UX/performance regression repair, predev/bridge guard repair, and same-environment browser/API validation.
- Final status for this run: `FULFILLED_WITH_WARNINGS`.
- Runtime truth: direct LAN SSH to `infra@10.184.37.19` timed out from the Windows host; fallback `ssh project-truth-hris` worked. `cloudflared-bnpi-hris.service` remained active. Fast VM reachability proved `.20`, `.21`, `.22`, `.23` reachable on device ports `80`, `443`, and `8000` (ICMP for `.20` missed once, but all required TCP ports were open).
- Bridge/predev truth: host-local Hikvision SSH tunnel now maps all four devices (`.20-.23`) to local HTTP/HTTPS/SDK ports, and the generated `PROJECT_TRUTH_HIKVISION_TUNNEL_MAP` is a single-line env value. Local API quick health proved all four devices `online` through `env_tunnel_map`.
- Sync Center UX repair: removed the Sync Center `Checking DB + live path` / Keep Ready / Prove-fix blocking strip from `enroll.tsx`. Sync Center preview now requests `quick=true`, treats skipped live source counts as neutral `saved_preview`, and does not block on DB/live/source readiness before rendering HRIS DeviceUser counts.
- Device proof: API health final showed all four target devices online in 404ms-1777ms. Quick Sync Center preview returned target HRIS user counts `.20=459`, `.21=687`, `.22=416`, `.23=399` in 2454ms with neutral saved-preview status. Separate live source-count endpoint succeeded for all four in 1574ms-4784ms. Device Users endpoint returned saved totals for all four in about 2.5s-2.7s.
- Listener proof: local API listener endpoint returned running/armed/receiving overall with four SDK device rows; `.20` was receiving and `.21-.23` were armed.
- Browser proof: Playwright against `http://127.0.0.1:5175` proved `/admin/configuration/devices`, Sync Center, and Device Users visible for `.20-.23`; no `Checking DB + live path`, `Prove / fix now`, or `Keep ready ON` text was present. Network trace showed `sync-preview?quick=true`, quick per-device health, and listener status; screenshots and trace are under `.runtime/sync-center-four-hikvision-20260721-090712/`.
- Validation: backend focused contracts passed 17/17; frontend focused Sync Center/Device Users contract passed 1/1; API typecheck passed. Frontend `typecheck:test` still fails outside touched device scope at `app/routes/employee/dashboard/TimesheetsTab.test.tsx(54,46)`, already covered by existing recommendation `REC-20260706-TEST-TYPECHECK-MOCKS`.
- Boundary/warning: stale non-target Hikvision devices remain in saved config/list results, but they no longer block the four target devices in the same local testing journey. No biometric bytes were fabricated from counts.
- Evidence root: `.runtime/sync-center-four-hikvision-20260721-090712/`.


# Latest Task Addendum - 2026-07-21 Overnight Hikvision Listener Green Loop

- Task mode: mixed admin runtime repair, Hikvision listener/device-event proof, API/UI validation, and focused code repair.
- Final status for this run: `GREEN_WITH_BOUNDARY`.
- Runtime truth: direct LAN SSH to `infra@10.184.37.19` timed out from the Windows host, but fallback `ssh project-truth-hris` worked. `cloudflared-bnpi-hris.service` stayed active. VM reverse/API ports `53001`, `59000`, and `59443` were proven listening.
- Listener truth: `project-truth-hikvision-hot-reload-listener.service` is active/running with PID `2912473`. Final logs show four intended Hikvision devices A/B/C/D logged in, SDK-armed, and free of unhandled login failures. Final UI/API state is truthful `Ready for tap proof` after callback freshness aged out.
- Callback truth: HRIS post path through `http://127.0.0.1:53001` is proven by successful `hikvision_callback_post_result` and `hris_contract_post ok=true` logs. Fresh physical tap proof remains the boundary for changing quiet devices from armed to receiving.
- Code truth: `hris-api/app/device/device.controller.ts` restored `summaryScope=facets` handling for saved Device Events facet counts. The VM listener source/binary contains a session-list concurrency repair, but this checkout has no tracked C++ diff for `vendor/hikvision-linux/hikvision_biometric_service.cpp`; review durable source promotion before claiming repo-level C++ completion.
- Validation: API typecheck passed; focused API contracts passed 32/32; focused frontend contracts passed 31/31; live API/browser proof passed. Evidence root: `.runtime/overnight-hikvision-listener-green-20260721-065548/`.


# Latest Task Addendum - 2026-07-21 New Cutoff Payroll Dry-Run/Seed Proof

- Task mode: mixed payroll source-truth dry-run, local DEV data seeding, and reconciliation evidence. Status: `PARTIALLY_FULFILLED`.
- Same testing lane was used: local API `127.0.0.1:3001`, app `127.0.0.1:5175`, and DEV Postgres through `127.0.0.1:55435`. Cloudflare tunnel/runtime controls were not touched.
- Workbook intake completed for all provided new-cutoff XLSX files. Passworded HRIS Payroll Computation workbooks were decrypted with `officecrypto-tool` into the evidence folder after SheetJS/ExcelJS limitations were verified.
- July 15 period (`2026-06-26` to `2026-07-10`) was seeded in DEV after dry-run proof:
  - Biometrics attendance: 9,811 importable employee-days; 517 grouped unmatched rows; applied into effective attendance.
  - Approved timesheets: 812 new timesheets and 9,603 lines created from seeded attendance; final period state had 832 approved timesheets and 9,860 effective lines.
  - OT repair: applied scoped source-bucket metadata to 9,773 timesheet lines; 87 OT workbook rows remained missing from effective source lines.
  - Mass uploads: applied 1,307 EmployeeBenefit rows and 65 EmployeeLoan rows from the July 15 compensation/deduction uploads. Nineteen employee IDs remained unmatched and were not fabricated.
- July 15 comparison after attendance/OT/mass-upload seed still had severe source gaps, so payroll generation was intentionally not run. Summary: 859 workbook rows, 838 employees matched, 824 approved timesheets found, 0 exact/tolerance row matches; categories included `SOURCE_MISSING_APPROVED_OT=553`, `SOURCE_MISSING_ALLOWANCE=124`, `SOURCE_MISSING_MANUAL_ADJUSTMENT=73`, `SOURCE_MISSING_DEDUCTION_OR_LOAN=43`, `TIMESHEET_NOT_FOUND=14`, `EMPLOYEE_NOT_FOUND=21`, and `SOURCE_MISSING_STATUTORY_CONFIG=6`.
- June 30 period (`2026-06-11` to `2026-06-25`) remained dry-run only: no biometrics workbook was provided, DEV has no attendance/timesheets for the period, and compensation code `INC` covered 816 rows / about PHP 9.9M without a governed payroll classification. No June 30 payroll generation was attempted.
- July 30 period (`2026-07-11` to `2026-07-25`) has biometrics evidence only and no comparator workbook in `docs/new-cutoff`; payroll tally remains `NEEDS_CONFIRMATION`.
- Validation: `hris-api npm run test:regression:payroll-source-truth` passed 52 specs; `hris-api npm run typecheck` passed.
- Evidence root: `.runtime/overnight-payroll-new-cutoff-20260721-144322/`.


# Latest Task Addendum - 2026-07-21 Device C DeviceUser Gap Repair

- Task mode: mixed backend truth repair, admin UI wording repair, real endpoint execution, and local API restart.
- Root cause: bulk DeviceUser sync job planning built the decision matrix with `vendorUserCount: null`, so `needs_attention_only` trusted saved HRIS DeviceUser rows and skipped live source identity reads even when Sync Center preview proved Device C had `687` physical users and only `416` saved HRIS rows.
- Backend repair: `buildDeviceUserSyncJobDecisionMatrix` now reads the fast Hikvision source user count before deciding whether missing DeviceUser records are zero. If the live device count shows missing source IDs, the job marks `sourceReadRequired=true` and includes `Reading source users needed for identity gaps`.
- UI repair: live job cards no longer label failed raw capture attempts as honest remaining HRIS "raw gaps"; they show `Device no-data` / `raw reads failed` because Device C returned 404/no-data for face raw reads.
- Runtime proof: after API restart, dry-run for Device C showed `missingDeviceUsers=271`, `sourceReadRequired=true`, `sourceReadSkipped=false`. Real job `690dbe6d-c751-4dc3-9dff-f1f70738012a` completed with `totalSourceRecords=687`, `created=271`, `updated=416`, `linked=640`, `unmatched=46`.
- Final endpoint proof: fresh `GET /api/device/sync-preview?deviceId=cmripjwbx00ewl001ihcke210&quick=true` returned Main Entrance Device C `fromDevice=687`, `savedInHris=687`, `gap=0`, `missingDeviceUsers=0`, `needsLink=46`, `alreadyPresent=641`.
- Merge proof: fresh merge plan returned `687` unique IDs and no duplicate unique IDs for the checked scope.
- Boundary: 118 face raw reads failed because the device returned 404/no-data. HRIS did not fabricate biometric bytes from counts.
- Evidence root: `.runtime/device-c-repaired-sync-20260721-1153/`.


## Latest Task Addendum - 2026-07-21 Sync Center missing-record decision matrix

- Task mode: Mixed admin UX/performance feature and backend fast-path repair.
- Implemented:
  - Sync Center now builds a `syncDecisionMatrix` before starting a Device Users sync job.
  - The matrix classifies `missing_device_user_record`, `missing_employee_link`, `missing_raw_fingerprint_blob`, `missing_raw_face_blob`, `already_present`, `stale_count_only_or_live_no_data`, and `unsupported_by_sync`.
  - Default Device Users sync mode is now `needs_attention_only`; the job skips source-device rereads when the matrix says saved HRIS state is enough, and raw-custody capture returns from saved state when no missing raw blobs exist.
  - The review modal shows `What Sync can fix`, bucket counts, bucket filters, selected fastest valid plan, and truthful stage copy.
- Evidence:
  - API proof: `.runtime/sync-center-decision-matrix-20260721-110520/api-sync-preview-decision-matrix-final.json`.
  - Browser proof: `.runtime/sync-center-decision-matrix-20260721-110520/browser-sync-center-review-modal.json` and `.runtime/sync-center-decision-matrix-20260721-110520/browser-sync-center-review-modal.png`.
- Validation:
  - Backend contract: `hris-api/tests/hikvision-biometric-sync-contract.spec.ts` passed (`15` passing).
  - Backend typecheck: `npx tsc --noEmit --pretty false` passed.
  - Frontend contract: `hris-app/app/routes/admin/devices/device-user-ui-contract.test.ts` passed (`1` passing).
  - Frontend broad `tsconfig.test` typecheck still fails outside this scope at `app/routes/employee/dashboard/TimesheetsTab.test.tsx(54,46)`, covered by existing `REC-20260706-TEST-TYPECHECK-MOCKS`.
- Recommendation capture: No new recommendations were identified.


## Latest Task Addendum - 2026-07-21 Four Hikvision devices online/armed

- Task mode: Mixed live runtime repair, native listener regression repair, and evidence closeout.
- Evidence: `.runtime/hikvision-four-device-online-20260721-064751/`.
- Runtime repaired:
  - Canonical VM access used `ssh project-truth-hris` after direct LAN SSH to `10.184.37.19` timed out from the Windows host.
  - VM direct TCP to `10.184.37.20`, `.21`, `.22`, and `.23` passed on ports `80`, `443`, and `8000`; no extra device bridge was required for the VM listener.
  - Host local API reverse `VM 127.0.0.1:53001 -> Windows 127.0.0.1:3001` was restored; VM `/health` through `53001` returned healthy.
  - The managed `project-truth-hikvision-hot-reload-listener.service` was rebuilt/restarted after deploying the fixed native listener source.
- Device proof:
  - HRIS config contains the four target Hikvision rows only as saved addresses `10.184.37.20`, `.21`, `.22`, `.23`, all HTTPS `443` with SDK `8000`.
  - Final API health returned `online` for all four target devices using the local tunnel map while preserving saved addresses.
  - Final listener/readiness API returned green readiness and all four listener devices with `lastLoginOk=true`, `armed=true`, and `receivingCallbacks=true`.
  - Raw VM logs show fresh `sdk_login`, `sdk_alarm_arm`, `device_armed`, `acs_alarm_received`, and successful callback post results for the target devices in this run.
  - Playwright against `http://127.0.0.1:5175/admin/configuration/devices` found all four target IPs present with online/ready/armed text nearby.
- Validation:
  - VM native build passed: `HIKVISION_LINUX_SDK_ROOT=... bash scripts/build-hikvision-biometric-service.sh`.
  - Focused backend contract passed: `hris-api/tests/hikvision-biometric-sync-contract.spec.ts` (`14` passing).
  - Focused listener-status helper passed: `hris-api/tests/hikvision-listener-status.helper.spec.ts` (`10` passing).
  - Broad `npm --prefix hris-api test -- ...` was accidentally expansive and failed on unrelated existing suite drift plus stale compose DB `10.184.37.19:15433`; focused reruns above passed.
- Boundary:
  - Cloudflare tunnel remained active.
  - No stale `.167`, `.168`, `.102`, or old rows were used as the four-device proof.
  - A recommendation was added for the `ensure-device-live-path.ps1` API reverse bridge argument-list bug discovered during recovery.


## Latest Task Addendum - 2026-07-21 Sync Center Needs link click rows

- Task mode: Focused admin UX regression repair.
- Implemented:
  - The Device Users `Needs link` metric now sets `deviceUserStatus=UNMATCHED` when clicked, so the table requests saved HRIS rows that actually need employee links.
  - The source-scoped optimization now applies only to `shown` and `source` views; saved truth views such as `open` and `linked` use HRIS `DeviceUser` rows.
- Runtime/browser proof:
  - Evidence root: `.runtime/sync-center-needs-link-click-browser-20260721T053934Z/`.
  - Clicking Device C `Needs link: 46` produced URL `deviceUserView=open&deviceUserStatus=UNMATCHED`, requested `/api/device/cmripjwbx00ewl001ihcke210/users?limit=50&status=UNMATCHED`, and showed `1 - 8 of 46` without the empty-state copy.
  - API proof in `.runtime/sync-center-needs-link-click-20260721-133728/` returned 46 `UNMATCHED` rows for Device C.
- Validation:
  - Frontend focused Device Users UI contract passed.
  - `git diff --check` passed with CRLF normalization warnings only.
- Recommendation capture: No new recommendations were identified.


## Latest Task Addendum - 2026-07-21 Hikvision faceURL 404 raw-custody sanitization

- Task mode: Bug fix with backend custody safety and admin UX repair.
- Implemented:
  - Hikvision face raw-capture now treats HTML/XML/non-image faceURL responses as missing raw custody, not captured biometric bytes.
  - Face URL failures are classified as short reasons such as `face_image_not_found_on_device`, `face_image_unauthorized`, `face_binary_not_image`, or `face_binary_empty`.
  - Device-user sync job summaries, persisted result rows, and recent failure logs sanitize raw-custody reasons before storage/response.
  - The Sync Center status modal renders friendly labels such as `Face image not found on device` and sanitizes legacy persisted aggregate messages so raw device HTML/XML is not shown.
- Runtime/browser proof:
  - Evidence root: `.runtime/hikvision-face-404-sanitize-20260721-121324/`.
  - Current Main Entrance Device C job `1e7d9de2-7be8-460d-a031-d9fb3b0735b1` reopened in the Device-user sync status modal.
  - Final modal proof showed completed status with `262` captured raw payloads and `270` missing raw reads, preserved as review/repair items.
  - Final browser proof confirmed friendly missing-face labels and no `<!DOCTYPE html>`, `<html>`, `Access Error: 404`, or `can't locate document` text in the modal.
- Validation:
  - `hris-api` focused raw biometric + Hikvision sync contracts passed (`24` passing).
  - `hris-api` typecheck passed.
  - `hris-app` focused Device Users UI contract passed (`1` passing).
- Recommendation capture: No new recommendations were identified.


## Latest Task Addendum - 2026-07-21 Device-user merge unique-ID truth repair

- Task mode: Mixed backend correctness and admin UX truth repair.
- Implemented:
  - Hikvision device-user merge planning now counts strict unique device/vendor person IDs from live selected-device reads. The same `vendorUserId` cannot split into separate selectable unique-ID rows just because one source row is manually/HRIS-linked and another is not.
  - Saved HRIS `DeviceUser` rows attach link/status/manual-link context only; they do not drive the unique-ID count and no longer collapse two different vendor IDs into one selectable unique-ID row.
  - Duplicate source rows for the same device/user ID are collapsed before unique-ID counting, with `sourceRows`, `dedupedDeviceRecords`, and `duplicateSourceRows` reported in the plan.
  - The merge modal now labels the record count as `Device ID records`, reports unique-list counts as IDs, and can disclose when duplicate source rows were collapsed into matching unique IDs.
- Runtime/API proof after API restart:
  - Evidence root: `.runtime/merge-strict-device-id-truth-20260721-113511/`.
  - Local API restarted to listener PID `9228`; `/health` returned `healthy`.
  - Non-mutating admin merge-plan endpoint returned `uniqueDeviceIdCount=687`, `apiCountUnionUsers=687`, `sourceRowsFromDevice=2748`, `dedupedDeviceRecords=2748`, `duplicateSourceRows=0`, `hasDuplicateUniqueIdsShown=false`, and zero groups with more than one vendor ID for the four current Hikvision target devices.
- Validation:
  - `hris-api` focused merge helper tests passed (`12` passing).
  - `hris-api` typecheck passed.
- Boundary:
  - Browser automation against `http://127.0.0.1:5175/auth/login` could not complete login because the current frontend dev server rendered no login input elements in headless DOM; API proof and source/UI contracts were used as the closeout evidence.
- Recommendation capture: No new recommendations were identified.


## Latest Task Addendum - 2026-07-21 Sync Center dry-run planner scope correction

- Task mode: Mixed admin UX truth repair, backend dry-run safety, and regression proof.
- Implemented:
  - `POST /api/device/users/sync-jobs` now accepts `dryRun=true` and returns the missing-record decision matrix plus execution plan without creating a job.
  - The Device Users `Review sync` modal now calls the same dry-run planner used by execution, so review counts no longer drift from the job start path.
  - Persisted `processing` device-user jobs are marked stale after API restart instead of being revived as active background work.
  - Status/review copy now says scoped missing work when `sourceReadRequired=false`; it does not claim a broad source-user read for saved-state fast plans.
- Runtime/API proof:
  - Evidence root: `.runtime/sync-center-dry-run-scope-20260721-112157/`.
  - Non-mutating admin dry-run for Main Entrance Device B (`cmpxw13hx002h7zwso7dyedrn`) returned `mode=dry_run`, `willCreateJob=false`, `jobId=null`, `selectedFastPlan=needs_attention_only`, `sourceReadRequired=false`, and `sourceReadSkipped=true` in `7.586s`.
  - Matrix counts: `missing_device_user_record=0`, `missing_employee_link=49`, `missing_raw_fingerprint_blob=106`, `missing_raw_face_blob=65`, `already_present=741`, `stale_count_only_or_live_no_data=0`, `unsupported_by_sync=0`.
  - Execution steps explicitly include `Skip source user reread because saved HRIS state scopes the actionable work`, raw capture only for fingerprint/face candidates, and skipping already-present rows.
- Browser proof:
  - `.runtime/sync-center-dry-run-scope-20260721-112157/browser-sync-center-scoped-review-final.json`.
  - `.runtime/sync-center-dry-run-scope-20260721-112157/browser-sync-center-scoped-review-final.png`.
  - Browser verified the review modal shows the dry-run planner counts (`49`, `106`, `65`, `741`), `Fastest valid plan: needs_attention_only`, `Saved-state first`, and no old `Reading source device users` copy.
- Validation:
  - Backend contract: `hris-api/tests/hikvision-biometric-sync-contract.spec.ts` passed (`15` passing).
  - Backend typecheck: `npx tsc --noEmit --pretty false` passed.
  - Frontend focused contract: `hris-app/app/routes/admin/devices/device-user-ui-contract.test.ts` passed (`1` passing).
  - Frontend broad `npx tsc --noEmit --pretty false` still fails on unrelated existing app-wide type drift outside Device Users.
- Recommendation capture: No new recommendations were identified.


## Latest Task Addendum - 2026-07-21 Device-user link employee picker and padded-ID proof

- Task mode: Mixed admin UX regression repair and device-user/employee matching proof.
- Implemented:
  - The Link device user modal now uses the async `EmployeePickerSelect` instead of a preloaded 1000-row `SearchableSelect`, so employee search runs through the employee API and can find codes beyond the initial slice.
  - Shared popover content now renders above the custom modal shell/backdrop, fixing the dropdown opening behind the modal.
  - Employee picker fields/details include `deviceEmpId`, so the admin can search and see device IDs while linking.
  - Backend helper regression coverage explicitly proves numeric vendor IDs link to five-digit padded `Employee.employeeId` records when no direct `deviceEmpId` match is present (`21 -> 00021`, `989 -> 00989`).
- Runtime/API proof:
  - Evidence root: `.runtime/device-user-link-selector-20260721-123032/`.
  - Admin employee search endpoint returned `00021` for query `21` and `00989` for query `989` through the same API path the picker uses.
  - Saved DeviceUser lookups on current Hikvision devices showed vendor `21` linked to employee code `00021` and vendor `989` linked to employee code `00989`.
- Browser proof:
  - Evidence root: `.runtime/device-user-link-selector-playwright-20260721-043453/`.
  - Headless Playwright opened Device Users for vendor user `989`, opened the Link device user modal, opened the employee picker, typed `989`, and verified employee `00989` was visible with no failed requests.
- Validation:
  - Backend focused helper tests passed (`11` passing).
  - Frontend focused Device Users UI contract passed.
  - API typecheck passed.
  - `git diff --check` passed.
  - Frontend broad `tsconfig.test` typecheck still fails on unrelated existing `TimesheetsTab.test.tsx` React Query fixture drift, already covered by `REC-20260706-TEST-TYPECHECK-MOCKS`.
- Recommendation capture: No new recommendations were identified.


## Latest Task Addendum - 2026-07-20 Local Windows remote-dev CF SSH / DB tunnel bootstrap

- Task mode: Regression repair + workstation bootstrap (docs + scripts).
- Problem: Remote Windows host could not complete `hris-api` `npm run dev` / login because LAN SSH to `10.184.37.19` is closed, K3s DEV ClusterIP `10.43.130.9:5432` refused Postgres, local `55435` tunnel half-died, and Hikvision reverse port `59443` was held by stale VM `sshd`.
- Repo changes:
  - `scripts/start-k8s-dev-db-access.ps1` G�� Postgres wire check + compose DEV `127.0.0.1:15433` fallback for SSH `-L` to local `55435`.
  - `scripts/start-host-hikvision-vm-ssh-bridge.ps1` G�� clear reverse ports with `fuser -k`.
  - `docs/LOCAL_WINDOWS_REMOTE_DEV_BOOTSTRAP_20260720.md` G�� operator log.
- Workstation-only (not git): `node-health-appliance_ed25519`, SSH config `project-truth-hris`, cloudflared install, VM `authorized_keys` public key append.
- Operator recipe for API-only local dev: `HIKVISION_VM_BRIDGE_ENABLED=false`, `HRIS_SKIP_DEVICE_LIVE_PATH=true`, `npm.cmd run dev`; success = `Server running at http://localhost:3001`.
- Evidence: `.runtime/local-dev-cf-ssh-db-tunnel-20260720/`.
- Boundary: not a push to `origin/develop`; not a K3s health claim; UI "Unable to connect" was empty `:3001`, not auth body.


## Latest Task Addendum - 2026-07-20 Raw biometric package export/import alignment

- Task mode: Mixed owner-requirement correction across Device Users export/import API, admin UI, contracts, and WWG truth.
- Owner correction: the active Hikvision Device Users sync/export/import journey must not require encrypted bundles or passphrases. It must copy/export evidenced raw fingerprint `fingerData` blobs and raw face/image blobs when present.
- Required custody behavior:
  - DeviceUser remains the durable current raw biometric custody plane.
  - Matching DeviceEvent payloads can provide fallback raw custody for lifecycle ledger journeys.
  - CSV/Excel/Package JSON use raw blob columns/statuses, not `encrypted:v2` envelope cells.
  - Missing bytes stay explicit as `not_enrolled`, `missing_raw_blob`, or `not_requested`; no values are fabricated from credential counts.
- Stale context: 2026-07-14/2026-07-15 encrypted envelope/passphrase export proof is historical for this journey and must not drive current modal copy, API requirements, or tests.


## Latest Task Addendum - 2026-07-20 Remote local-dev Hikvision tunnel proof

- Task mode: Focused local-dev runtime access repair for far-away work against a LAN-only Hikvision device.
- Goal: Keep the saved HRIS device row visible as `10.184.37.21:443` / SDK `8000`, while allowing a Windows localhost API launched by `npm run dev` to reach the device through SSH forwards.
- Implemented:
  - Added `PROJECT_TRUTH_HIKVISION_TUNNEL_MAP` support for Hikvision HTTP/ISAPI base URL resolution, device health network probes, and SDK endpoint selection.
  - Added `scripts/start-hikvision-remote-device-tunnel.ps1`, which starts `127.0.0.1:10080 -> 10.184.37.21:80`, `127.0.0.1:10443 -> 10.184.37.21:443`, and `127.0.0.1:18000 -> 10.184.37.21:8000`, then writes the ignored local API env line.
  - Preserved the tunnel-map line when `hris-api/scripts/ensure-bnpi-db-access.cjs` regenerates `hris-api/.env.development.local`.
- Proof:
  - Tunnel helper returned `running`, PID `17684`, with TCP OK for `127.0.0.1:10080`, `:10443`, and `:18000`.
  - Local API `GET /api/device/cmrht5s2w00ei7zgsre8y3o5n/health` returned `summary.status=online` for Main Entrance Device A, while the response still showed saved device address `10.184.37.21` and `checks.network.source=env_tunnel_map`.
  - Playwright against `http://localhost:5175/admin/configuration/devices` found Main Entrance Device A and `Online`; all seven device health calls returned HTTP 200.
- Evidence:
  - `.runtime/hikvision-remote-device-tunnel-last.json`
  - `.runtime/remote-device-tunnel-proof-20260720-161455/device-a-health-with-tunnel-map.json`
  - `.runtime/remote-device-browser-proof-20260720082234/summary.json`
- Boundary:
  - On the current LAN, `ssh project-truth-hris` through Cloudflare still reset at the edge, so the helper used direct LAN fallback `infra@10.184.37.19` for this proof. Far-away work should use `project-truth-hris` when Cloudflare Access is reachable from that network.


## Latest Task Addendum - 2026-07-20 Device Events saved view fast/truthful listener UX

- Task mode: Mixed admin UX/performance regression repair.
- Implemented:
  - Saved Device Events row/facet loading remains separate from listener/live-proof and quick device-health checks.
  - Hikvision listener status now uses direct LAN SSH before Cloudflare fallback and a short cache so readiness/listener UI do not stack repeated VM reads.
  - Device health `quick=true` now uses bounded TCP reachability (`tcpReachability`) and skips slow Hikvision system-time/source-count reads; full health can still perform deeper reads.
  - Armed-but-quiet live proof copy now says `Ready for tap proof` / `listener armed, waiting for a fresh tap` instead of stale/broken wording.
  - Saved Events UI now shows a separate `Device health` line and explicitly states reachability is separate from listener armed state and tap proof.
- Evidence:
  - API timing proof: `.runtime/device-events-stale-fast-20260720-211150/summary.json`.
  - Browser proof: `.runtime/device-events-stale-fast-20260720-211150/browser/playwright-settled-clean-result.json` and `saved-events-settled-clean.png`.
- Proof highlights:
  - Saved rows endpoint returned in `2.629s`; facets in `1.924s`.
  - Listener status repeat call used the short cache; listener/readiness no longer blocks the saved ledger render.
  - Quick health server durations for sampled devices were `0ms`, `1ms`, `1214ms`, and `1327ms`, all with `provenBy=tcpReachability` and `Skipped in quick health mode`.
  - Browser settled text showed `Ready for tap proof`, `4 online / 0 degraded / 3 offline`, the clean `/` health separator, and saved rows; it did not contain `Live path needs proof` or `not checked for a long time`.
- Validation:
  - `hris-api` `npx tsc --noEmit --pretty false --incremental false --listFiles false` passed.
  - Backend focused tests passed: `25` passing for listener-status helper, readiness, listener fast-path, and quick-health contracts.
  - Frontend focused contract passed: `12` passing for `app/lib/device-events-page-contract.test.ts`.
  - Frontend `typecheck:test` remains blocked by unrelated existing `TimesheetsTab.test.tsx` `UseQueryResult` fixture drift.
- Recommendation capture: No new recommendations were identified.


## Latest Task Addendum - 2026-07-20 TEST A zero-missing recovery boundary

- Task mode: Agent-owned live recovery attempt, root-cause classification, and UI clarity repair.
- Evidence: `.runtime/test-a-zero-missing-raw-recovery-20260720-113320/`.
- Runtime/API proof:
  - Local API was restarted with `HIKVISION_RAW_BIOMETRIC_SYNC_CONCURRENCY=1` and proven healthy.
  - Raw-only sync job `48f654ff-8ed0-4ccb-8470-8f51d9654dbb` completed for TEST A in `biometrics_only` mode.
  - Job processed `136` missing biometric credentials, captured `0`, cached `938`, and failed `136` because the live panel read returned no raw bytes.
  - Failure log groups: `45` `no_face_on_device` row failures and `46` `no_fingerprint_data_from_device` row failures; fingerprint credential-slot missing remains `91`.
- SQL custody after recovery is unchanged: `394` DeviceUser rows; `348` raw-ok/not-enrolled rows; `45` rows missing both fingerprint and face raw; `1` row missing fingerprint raw only; fingerprint `718` inventory slots / `628` raw stored / `91` raw missing; face `356` inventory / `311` raw stored / `45` raw missing.
- Direct capture proof for rows `83`, `839`, `984`, `1008`, `1076`, and `1143`: all six fingerprint captures returned compact HTTP `422` with `no_fingerprint_data_from_device`; all six face captures returned compact HTTP `422` with `no_face_on_device`.
- Deep ISAPI probe proof: control user `1004` returned fingerprint bytes in `13` probe shapes, proving the read path/parser can still retrieve raw data; missing users `8`, `83`, and `984` returned `0` hits across `54` probe attempts each.
- Classification: remaining gaps are live no-data/stale-count inventory claims, not recoverable raw blobs in current evidence. Counts are not bytes, and no blob was fabricated from `numOfFP`, `numOfFace`, or stored inventory metadata.
- UI clarity repair: the Sync device users review modal now labels counts as `Fingerprint inventory vs raw bytes` and `Face inventory vs raw bytes`, with `inventory enrolled / raw stored / raw no-data/missing` wording and explicit copy that no blobs are fabricated.
- Same-environment Playwright proof: local app `http://127.0.0.1:5175` opened TEST A Sync Center and verified the clarified modal copy (`playwright-modal-copy-proof.png`, `.txt`, `.json`).


## Latest Task Addendum - 2026-07-20 `npm run dev:local` one-shot local clone

- Task mode: Dev ergonomics G�� one command for isolated local API.
- `npm run dev` G�� unchanged shared DEV tunnel path.
- `npm run dev:local` G�� single script `scripts/run-dev-local.cjs`: ensure env file, start Docker clone container, predev skips, API watch on `5433`.
- Boundary: empty new container still needs prior dump/restore for real data.


## Latest Task Addendum - 2026-07-20 TEST A raw biometric repair loop

- Task mode: Mixed biometric custody repair, API/UI regression repair, and live device proof.
- Device truth: TEST A was identified by API/DB as `cmrlgqsjv000oob01165tbd8n` (`192.168.254.102:443`, Hikvision). DeviceUser remains the durable current raw biometric custody plane; plain device person id is `DeviceUser.vendorUserId` / `employeeNo`.
- Root cause repaired: Hikvision bulk `FingerPrintUpload` can return only one template while `UserInfo.numOfFP=2`; the helper now probes per-finger when raw stored count is below reported template slots and merges prior + newly fetched templates without fabricating bytes.
- Raw-only sync proof:
  - Before focused repair: source users `314`, HRIS DeviceUsers `394`, fingerprint slots `718`, fingerprint raw `325`, fingerprint missing `393`, face reported `356`, face raw `311`, face missing `45`.
  - Job `bbccf2b6-75be-4e78-a7fa-e1a683149c02` captured `266` additional raw payloads and reduced fingerprint missing to `120`.
  - Local recovery setting `HIKVISION_RAW_BIOMETRIC_SYNC_CONCURRENCY=2` removed transient `Unauthorized` failures; job `834d6273-74d8-416f-aecf-8fd92430a062` captured `29` more and reduced fingerprint missing to `91`.
  - Final preview: source users `314`, HRIS DeviceUsers `394`, fingerprint slots `718`, fingerprint raw `627`, fingerprint missing `91`; face reported `356`, face raw `311`, face missing `45`.
- Remaining boundary: per-row sample repair for users `1008`, `1076`, and `1143` returned HTTP `422` with exact bodies `no_fingerprint_data_from_device` and `no_face_on_device`. These rows remain `missing_raw_blob`; no raw blobs were fabricated.
- UI proof: Sync review modal shows raw custody counts (`718 enrolled +�-+ 627 raw +�-+ 91 missing_raw_blob`, `356 enrolled +�-+ 311 raw +�-+ 45 missing_raw_blob`) and details modal shows `2 of 2 stored` for repaired user `1004`; user `1008` shows `2 missing_raw_blob`, `Repair: capture raw`, face count-only raw missing, and `Repair: capture face`.
- Evidence: `.runtime/test-a-raw-repair-loop-20260720-103434/`.


## Latest Task Addendum - 2026-07-20 TEST A missing raw root-cause follow-up

- Task mode: Focused biometric custody root-cause repair with raw SQL, direct live device/API proof, backend contract tests, and same-environment Playwright proof.
- Evidence: `.runtime/test-a-missing-raw-root-cause-20260720-111215/`.
- Current TEST A SQL custody aggregate:
  - `394` DeviceUser rows.
  - `348` rows are raw-ok or not enrolled.
  - `45` rows are missing both fingerprint and face raw blobs.
  - `1` row is missing fingerprint raw only.
  - Fingerprint slots: `718` reported, `628` stored raw templates, `91` missing raw blobs.
  - Face slots: `356` reported, `311` stored raw faces, `45` missing raw blobs.
- Live capture classification for visible/sample rows `83`, `839`, `984`, `1008`, `1076`, and `1143`: all six are stale/count-only inventory rows where `UserInfo` reports enrolled counts/face URL but live raw endpoints return `no_fingerprint_data_from_device` and `no_face_on_device`. No parser/merge/probe code bug was proven for these rows, and no raw blob was fabricated.
- Code bug repaired in this pass: manual raw fingerprint/face capture endpoints no longer return HTTP `422` with a `status: "success"` body on no-data. They now return compact `status: "error"` bodies with `capture.reason`, preserving truthful no-data classification for UI/API consumers and avoiding large stale metadata payloads on failure.
- Validation: focused backend helper/contract tests passed (`20` passing), and `hris-api` `tsc --noEmit --pretty false` passed.
- Browser proof: local Playwright against `http://127.0.0.1:5175` opened TEST A Device Users Sync Center and issued the same local API calls through the authenticated browser context. All twelve sample capture calls returned compact HTTP `422` / `status: "error"` bodies with exact no-data reasons.


# Latest Task Addendum - 2026-07-20 DeviceUser Raw Biometric Export/Import Proof

- Task mode: mixed biometric custody repair, export/import correctness, and admin modal UX hardening.
- Current TEST A runtime truth from the completed proof: 394 exported DeviceUser rows, 338 linked, 56 unlinked; 361 rows report fingerprints and 316 rows carry raw fingerprint blobs; the latest package preview carries 628 raw fingerprint templates against the previously proven 718 enrolled template slots; 356 rows report face and 311 carry raw face blobs.
- Sync recovery loop: TEST A biometrics-only jobs `e692290a-1d4f-4965-887f-c107bd473992` and `8d3a48df-a85e-44e2-abd3-3120d21e046f` completed with zero new captures and cached existing custody; all-Hikvision recovery job `6c7e3e4c-f722-4b00-a57c-81e06ab709d4` remained stalled on Main Entrance Device B fetch failures and is not proof that TEST A is incomplete.
- Export proof: real browser downloads for CSV, Excel, and Package JSON have 394 rows/users, no duplicate columns, no encrypted/passphrase copy, explicit `not_enrolled` / `missing_raw_blob` statuses, and multi-fingerprint cells using the `FPn("...")` pattern.
- Import proof: full 22,968,896-byte Package JSON preview succeeded non-mutating on a proof API with `HRIS_API_BODY_LIMIT=75mb`; matching users 394, conflicts 0, missing HRIS employees 55; execute without `confirmation="IMPORT DEVICE USERS"` was rejected with HTTP 400.
- UI proof: export modal shows the current action, scope, row count, and biometric readiness while preview/export is running; CSV import modal shows preview-first wording and package-data status without raw/developer copy.
- Remaining boundary: 46 rows still have `Reported biometric enrollment exists but no evidenced raw blob is stored`; this is retained as `partial_missing_requested_raw_blobs`, not fabricated from counts.
- Evidence: `.runtime/device-user-raw-export-proof-20260720-110129/final-evidence-summary.json`, `browser-export-download-proof.json`, `api-import-proof-3002-summary.json`, and screenshots in the same directory.


# Latest Task Addendum - 2026-07-19 Raw fingerprint callback/UserInfo race repair

- Task mode: Biometric persistence regression repair plus operator-journey hardening.
- Root cause: the C++ listener successfully read and posted the raw template, and the enrollment DeviceEvent retained it, but a slower UserInfo enrichment could overwrite DeviceUser with metadata read before the callback completed.
- Repair: DeviceUser UserInfo enrichment now uses an `updatedAt` optimistic merge/retry and preserves current raw fingerprint/face custody across a concurrent callback write.
- User journey: the Device Users details modal refetches the saved HRIS row and shows `Checking saved templates+�G�-�` during that read; it does not show `Not captured yet` until absence is confirmed.
- Live TEST A proof: exact event `cmrrwqkpc009l7zaogna1hbkd` for person `18` replayed successfully; after 20 seconds DeviceUser retained one 684-character raw template from `cpp_sdk_callback_raw`. Users `15` and `18` both rendered `1 stored` in headless browser proof.
- Verification: 22 focused backend tests, 14 C++ source-contract tests, and 1 modal Playwright regression passed. The current C++ source also built/linked against the VM HCNetSDK in an isolated output path.
- Evidence: `.runtime/fingerprint-enroll-raw-race-20260719/summary.md` and screenshots in the same directory.
- Boundary: do not infer a person id from an empty first major=3 callback; raw capture starts after plain device-person identity is evidenced.


## Latest Task Addendum - 2026-07-19 Device Events saved filter facets

- Task mode: Admin UI/data-truth regression repair.
- Operator correction: Category and Action dropdowns on `/admin/configuration/devices/events?view=saved` must come from the saved `DeviceEvent` ledger/schema truth, not a guessed hard-coded action-to-category map.
- Implemented:
  - Saved events API summary now returns `byActionCategory`, grouped from persisted `device_events.eventAction + eventCategory`.
  - Device Events UI loads a separate saved-ledger facet query for the current device/time/search/status/source scope, excluding Category/Action filters, so dropdown choices reflect the whole saved row set for that scope.
  - Selecting an action now uses the saved-row action/category aggregate when it has one real parent category. Live proof showed `SYNC_SIGNAL -> RUNTIME`, so the UI no longer forces the stale `DEVICE_HEALTH` mapping.
- Proof:
  - API contract: `tests/device-events-api-contract.spec.ts` passed 6/6.
  - Live endpoint: `.runtime/device-events-filter-facets-20260719-192707/saved-events-facets-proof.json` showed total `9,759`, `SYNC_SIGNAL: { RUNTIME: 6,344 }`, and real category/action counts.
  - Headless browser: `.runtime/device-events-filter-ui-20260719-192858/ui-proof.json` showed Category options from saved rows (`Attendance`, `Enrollment`, `Runtime`, `Unknown vendor`, `User management`) and no empty `Device health`; Action options included `Sync signal`.
  - Headless browser selection: `.runtime/device-events-filter-select-20260719-193038/select-proof.json` showed selecting `Sync signal` sets `eventAction=SYNC_SIGNAL&eventCategory=RUNTIME`.
- Existing unrelated validation drift:
  - `hris-app` focused lint still fails on the two pre-existing `jsx-a11y/label-has-associated-control` errors in Device Events and many existing warnings.
  - `hris-app` source-contract test still fails on a pre-existing expectation that `events.tsx` contains `useDeviceHealthMap`.
  - `hris-api` typecheck remains blocked by pre-existing missing module `../../helper/device-user-raw-fingerprint.helper` and existing helper type errors.
- Recommendation capture: No new recommendations were identified.


## Latest Task Addendum - 2026-07-19 Backend helper module resolution repair

- Task mode: Backend TypeScript regression repair.
- Reported symptom: VS Code/TypeScript showed `TS2307` in `hris-api/app/device/device.controller.ts` for dynamic imports of `device-user-raw-fingerprint.helper` and `hikvision-event-contract.helper`.
- Root cause: `hris-api` uses `module: Node16` / `moduleResolution: node16`; dynamic imports need the emitted `.js` specifier. Static imports in the same tree remained resolvable, but the extensionless dynamic imports failed.
- Implemented:
  - Changed the three dynamic helper imports in `device.controller.ts` to `.helper.js`, matching existing project import style.
  - Added a narrow local type for recent lifecycle event backfill rows in `device-person-token.helper.ts`, clearing the strict type errors exposed after the missing modules were fixed.
- Proof:
  - `npx tsc --noEmit --pretty false` passed in `hris-api`.
  - Focused backend tests passed 63/63: `device-events-api-contract`, `device-person-token.helper`, `device-user-raw-fingerprint.helper`, and `hikvision-event-contract.helper`.
  - Focused backend lint passed for `device.controller.ts` and the three helper files.
- Recommendation capture: No new recommendations were identified.


## 2026-07-19 Hikvision Storage And Network Visualization Addendum

- Task mode: docs-only architecture clarification from operator runtime evidence.
- Observed network evidence:
  - From `project-truth-db-access` / `infra@project-truth-node`, `ping 192.168.254.102` returned `Time to live exceeded` from `61.245.16.174`.
  - Interpretation: the shell does not have a direct ICMP/L3 route to the private Hikvision device LAN. This is not proof that the panel is down and not proof that HRIS model storage failed.
  - Architecture boundary: Cloudflare DB/SSH access is not a general LAN route; use selected TCP reverse forwards or a site agent on the device LAN for HCNetSDK/ISAPI evidence.
- Storage documentation updated:
  - `docs/HIKVISION_ENROLLMENT_IDENTITY_FLOW.md` now documents what is created/updated on panel user create and fingerprint enroll:
    - `DeviceEvent` rows for `USER_CREATED` and `FINGERPRINT_ENROLLED`.
    - one `DeviceUser` row for the current physical user identity (`vendorUserId=15`).
    - actual fingerprint template custody belongs to encrypted `DeviceUser.vendorMetadata.biometricBundle` / `_hrisDeviceMetadata.biometricExport` after the SDK biometric export worker reads template bytes; `DeviceEvent` stores proof/evidence only.
    - optional `DevicePersonToken` when Hikvision operation logs expose only an opaque token.
    - optional `Employee` link when an existing HRIS employee safely matches.
- Architecture twin updated:
  - `.wwg/wiki/05-architecture/hikvision-enrollment-identity-architecture.md` now records that `Employee.deviceEmpId` is plain for device matching, while `Employee.employeeId` may be padded/display-coded.


## 2026-07-19 Device Person 15 Architecture Documentation Addendum

- Task mode: docs-only architecture clarification following the Device Events / Device Users `15` vs `00015` identity repair.
- Operator intent documented:
  - Device user/person `15` created on the physical Hikvision device must appear as DeviceUser `vendorUserId=15`.
  - Device Events should resolve to the plain device person id `15` when DeviceUser or callback evidence exists.
  - Clicking `Device user` must navigate to Device User `15`, not a padded HRIS employee code.
  - Clicking an employee record may show the HRIS-padded code/device id `00015` when that employee is safely linked.
- Architecture verdict: the three-plane model remains correct: `DeviceUser` is physical-device identity/current inventory, `DeviceEvent` is saved event/history evidence, and `Employee` is the HRIS person record. Padding belongs only to HRIS employee matching/display; it must not rewrite `DeviceUser.vendorUserId`.
- Documentation updated:
  - `docs/HIKVISION_ENROLLMENT_IDENTITY_FLOW.md` now includes a modal/click flowchart, ER diagram, decision table, and implementation-owner map for this contract.


## 2026-07-19 Reverse Tunnel Stability Hardening Addendum

- Task mode: focused runtime hardening for Device Events Keep Ready / predev live path.
- Root cause identified:
  - The reverse tunnel itself can be healthy while the UI still shows six direct off-LAN device SDK login failures.
  - The older Keep Ready proof could also trust a stale Windows `ssh.exe` process or host-local `127.0.0.1:59000` instead of proving the VM-side reverse listener ports actually exist.
- Implemented hardening:
  - `scripts/ensure-device-live-path.ps1` now proves VM-side `127.0.0.1:59000` and `127.0.0.1:59443` before treating the Hikvision reverse bridge as healthy.
  - If a local SSH bridge process exists but VM reverse ports are not proven, Keep Ready records `reverse_bridge_stale` and rebinds the bridge.
  - `hris-api/scripts/ensure-device-live-path.cjs` fast path now requires VM SDK reverse proof instead of accepting a host-local SDK port as enough.
- Runtime proof after hardening:
  - `node hris-api/scripts/ensure-device-live-path.cjs` fast-passed with VM `53001=true` and VM `59000=true`, and listener `service_started` showed `hrisApiBase=http://127.0.0.1:53001`.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ensure-device-live-path.ps1` returned `ok=true`, DB tunnel open, VM reverse ports open, API reverse open, and listener API base already host-aligned.
  - Listener status after hardening showed TEST A on `127.0.0.1:59000` with `lastLoginOk=true`, `armed=true`, `receivingCallbacks=true`, and `postingToHris=true`.

## Latest Task Addendum - 2026-07-19 Create+Enroll flow C++ EXIT GATE

- Task mode: Meaningful C++ fix + live synthetic proof.
- Commit: `05f4320` on `develop`.
- Evidence: `.runtime/create-enroll-flow-proof-20260719-181730/summary.json`
- C++: full inventory (319 users), delayed identity re-POST, ISAPI FP fallback, arm baseline seed.
- Live G6 quote: `callback_identity_inventory_delta employeeNo=99182448` then `post_result employeeNo=99182448` with `identitySource=inventory_delta`.
- G3+�G�GǣG5: create/enroll plain DeviceUser+events + raw 684-char template (API). Device synthetic FP re-read may still show numOfFP=0 (labeled donor blob path).
- Recommendation capture: Device FP write stickiness after FingerPrintDownload.


## Latest Task Addendum - 2026-07-19 Create+Enroll architecture reality marathon

- Task mode: Meaningful feature / wire-path harden + live proof (non-stop marathon).
- Evidence: `.runtime/create-enroll-arch-reality-20260719-183434/summary.json`
- Exit: `GREEN_WITH_REAL_BLOCKER` (not donor fake-green).
- **Root cause of synthetic FP stickiness:** `FingerPrintDownload` HTTP OK but `FingerPrintProgress` `cardReaderRecvStatus=5` `errorMsg=15` when cloning person-15 template onto a new employeeNo (device anti-dupe). Re-read stays `numOfFP=0`.
- **Code:**
  - C++: template enrich after inventory_delta/op-sync; ISAPI write verifies Progress + re-read fingerData
  - HRIS: `writeAndVerifyFingerprintOnDevice` / `parseFingerPrintProgress`; device.controller uses verify path
  - Proof scripts: ban donor-as-success
- **Proven green:** create plain + inventory_delta; person-15 device-owned raw 684; unit 6/6; reverse ports; rebuilt listener with `progressRecvOk`
- **Still open:** physical unique panel enroll for new person sticky F8; live C++ `fingerprintCount>=1` on ACS for person already having FP
- Job card: `docs/00-product/AGENT-PROMPT-create-enroll-architecture-reality-marathon.md`
- Recommendation capture: Physical panel enroll proof for F8 sticky on new person (Proposed).


## Latest Task Addendum - 2026-07-19 Keep-ready reverse-tunnel stability

- Task mode: Regression repair + live VM/API proof.
- Reported symptom: TEST A repeatedly appeared to lose its reverse tunnel while the VM-side `ping 192.168.254.102` hung and the listener modal alternated between armed and login-failed states.
- Root cause:
  - SSH reverse forwarding exposes selected TCP ports on VM loopback; it does not route ICMP or make `192.168.254.102` pingable from the VM.
  - Listener status read only 80 JSONL lines. One seven-device SDK cycle can exceed that window, so working TEST A evidence scrolled out while later off-LAN login failures remained.
  - `Keep ready ON` treated every armed-but-quiet period as a forced re-arm condition, restarting a healthy listener every two minutes.
- Implemented:
  - Listener status summarizes a 400-line evidence window (while returning only 80 recent lines) and resets per-device sticky state at each new `device_config_loaded` attempt.
  - Keep-ready decision logic preserves a running armed listener while quiet and force-rearms only a stopped, unarmed, or genuinely login-failed listener. Database-only repair does not restart an armed listener.
  - Armed/quiet readiness copy now asks for one physical tap to refresh receiving proof instead of instructing repeated re-arms.
- Live proof:
  - Windows reached TEST A `192.168.254.102` on TCP `8000` and `443`.
  - VM loopback `53001`, `59000`, and `59443` stayed open; listener and VM-managed Cloudflare services stayed active.
  - Listener PID `2458362` remained unchanged from `11:04:27Z` through `11:09:55Z`, beyond the former two-minute restart cycle.
  - Admin status returned running/armed, safe-to-tap, and fresh successful HRIS callback posts; quiet remained yellow rather than being misreported as tunnel failure.
  - Focused tests: Keep-ready 3/3, listener/readiness 17/17, listener-modal Playwright 1/1.
- Existing unrelated validation drift: Full backend typecheck is blocked by the pre-existing missing module `helper/device-user-raw-fingerprint.helper`; targeted lint reaches two pre-existing empty-label accessibility errors in Device Events. Focused changed behavior is green.
- Recommendation capture: No new recommendations were identified.


## Latest Task Addendum - 2026-07-19 Device Events no-person sync signal copy

- Task mode: Admin UX regression repair + focused smoke proof.
- Operator correction: Saved runtime rows with no person id must not say `Resolving person id...` unless there is actual resolving/pending identity evidence. A Hikvision `SYNC_SIGNAL` can be live capture proof while carrying no person identity.
- Implemented:
  - Device Events table now labels no-id `SYNC_SIGNAL` rows as `No person id on SDK signal`.
  - No-id rows no longer create a Device user deep link/button or show the `Device user` badge; that shortcut appears only when a readable plain device person id exists.
  - Plain device-user navigation remains intact for real ids such as `15`.
- Proof:
  - Focused Playwright: `admin device events labels sync signals without implying person resolution` passed 1/1.
  - Focused Playwright: `admin device events keeps plain device user id separate from padded employee code` passed 1/1.
- Recommendation capture: No new recommendations were identified.


## Latest Task Addendum - 2026-07-19 Raw fingerprint template on DeviceUser (not AES)

- Task mode: Bug fix / product expectation correction + live proof.
- Operator correction: on fingerprint enroll, store **raw** base64 fingerData on DeviceUser +�G�Gǥ do **not** default to encrypted-only custody.
- Implemented:
  - `hris-api/helper/device-user-raw-fingerprint.helper.ts` +�G�Gǥ ISAPI FingerPrintUpload read, proven TEST A `FingerPrintInfo.FingerPrintList[]` parser, persist to `vendorMetadata.rawFingerprints.templates[].data` (and rawPayload mirror).
  - `enrichEnrollmentLifecycleEvent` schedules raw capture after FINGERPRINT_ENROLLED / USER_CREATED / USER_UPDATED when plain person id is known.
  - DeviceEvent gets pointer/status only (`rawFingerprintCustody`, `raw_on_device_user`); full blobs stay on DeviceUser.
  - Device user details UI shows raw present + first 120 chars preview.
- Live proof (TEST A person `15`, device `192.168.254.102`):
  - `rawPresent=true`, `fingerprintCount=1`, `firstTemplateChars=684`, `isAesEnvelope=false`
  - API `GET /api/device/<TEST A>/users?vendorUserId=15` returns raw templates under vendorMetadata + rawPayload
  - Evidence: `.runtime/raw-fp-live-2026-07-19T09-39-38-797Z/`, `.runtime/user15-raw-fp-viewable.json`
- Focused tests: raw-fingerprint helper + person-token 18/18 pass.
- Recommendation capture: No new recommendations were identified.


## Latest Task Addendum - 2026-07-19 C++ plain-id enrich + raw templates + anti-assumption WWG

- Task mode: Regression repair + governance + C++ wire-path harden.
- Operator pushback: stop assuming first socket always has plain id; **trace** C++ ACS +�G��G�� POST +�G��G�� socket. Proven: major=3 often empty `dwEmployeeNo`; major=5 taps often plain; logSearch often opaque.
- Governance:
  - `.grok/rules/02-sdk-callback-wire-truth.md` (always-on)
  - `AGENTS.md` hard ban on inventing callback person id
  - principle `evidence-over-assumption.md` Hikvision wire-truth section
- C++ (`hikvision_biometric_service.cpp`):
  - `enrich_hris_job_before_post` before POST: inventory delta multipass when ACS person empty; attach raw FP templates (+ face when card known)
  - Callback JSON: `identitySource`, `fingerprints[]` raw base64, `faceTemplate`/`facePicture`, `fingerprintCount`
- HRIS:
  - Accept callback fingerprints/face +�G��G�� DeviceUser raw store immediately
  - Socket: plain-only `employeeNo`; include deviceUser; UI +�G�+�Resolving person id+�G�-�+�G�-� when empty/resolving
- Rebuild/redeploy listener binary on VM still required for C++ path to run live.
- Recommendation capture: No new recommendations were identified.


## Latest Task Addendum - 2026-07-19 Live proof EXIT GATE (C++ enrich + synthetic enroll)

- Task mode: Live proof / evidence closeout.
- Evidence dir: `.runtime/live-cpp-enroll-proof-20260719-180128/summary.json`
- Proven green: host TCP/API, reverse :59000/:59443/:53001, rebuilt binary with enrich, listener armed/receiving, synthetic create `99180240` on device, DeviceUser raw template 684 chars (not AES), plain employeeNo on USER_CREATED/FINGERPRINT_ENROLLED ledger rows, API users returns raw.
- ACS live truth: major=3 still often `employeeNo=""`; enrich ran; inventory delta did not always attach plain in-window (`no_new_plain` / baseline). Do not claim ACS first packet always plain.
- Device FP write returned OK but `numOfFP` stayed 0 on re-read (3 retries); raw custody used donor-15 template path with explicit source label.
- Recommendation capture: Investigate C++ inventory pagination / delta when pageEmployees stuck at 30; improve FingerPrintDownload+�G��G��Upload re-read for synthetic write.


## Latest Task Addendum - 2026-07-19 Create+Enroll raw blob ledger journey

- Task mode: Meaningful feature / journey truth + live proof.
- Evidence: `.runtime/create-enroll-raw-ledger-journey-20260719-194709/summary.json`
- Exit: `GREEN_WITH_REAL_BLOCKER` (synthetic sticky clone still device anti-dupe; physical unique enroll out of scope).
- Proven:
  - Ledger: `USER_CREATED` + `FINGERPRINT_ENROLLED` plain `16` same DeviceUser
  - DeviceUser raw FP: persons `15`/`16`/`1` with 684-char base64 (not AES)
  - DeviceUser raw face: person `1` 14019-byte JPEG when `numOfFace=1`; `15`/`16` honest no-face
  - Capture API works with `req.organizationId`
  - UI: always refetch DeviceUser on details open; raw FP + face sections
- Auto path: schedule raw FP (+ face when present) after plain identity; enrich preserves raw
- Recommendation: Physical panel unique FP enroll for new person sticky (Proposed +�G�Gǥ prior REC).


## Latest Task Addendum - 2026-07-19 SDK enrollment plain person id on callback

- Task mode: Bug fix / runtime identity path + unit proof.
- Goal: When an SDK user create/update (or enroll) callback already carries a plain device person id, apply it on the callback path immediately, socket identity quickly, and always land raw UserInfo metadata on `DeviceUser` +�G�Gǥ without treating multipass logSearch as the only path.
- Clarified architecture (not a secret second poller inventing people):
  - Live path is still the HCNetSDK ACS alarm callback +�G��G�� `/api/hikvision/callback`.
  - When `dwEmployeeNo` / plain `employeeNo` is present on that callback, HRIS now runs the fast identity path.
  - When the callback is only a major=3 opaque SYNC_SIGNAL (empty person), multipass ISAPI `ContentMgmt/logSearch` still resolves typed USER_CREATED / FP leaves and may map opaque tokens +�G��G�� plain via inventory delta / `DevicePersonToken`. That is follow-up evidence, not a replacement for the SDK callback.
- Implemented:
  - `applyFastEnrollmentIdentityOnSdkCallback` / `isHikvisionEnrollmentLifecycleCallback` in `hris-api/helper/device-person-token.helper.ts`.
  - Immediate `DeviceUser` upsert (stub + HRIS link via `deviceEmpId` / `employeeId` code match), `DeviceEvent` MATCHED/UNMATCHED with plain `employeeNo`, first `device-event:saved` socket.
  - Background `enrichEnrollmentLifecycleEvent` still pulls full UserInfo into `DeviceUser.rawPayload` / `vendorMetadata` and re-sockets.
  - `callback.controller.ts` non-attendance enrollment path uses the fast path and no longer forces `IGNORED` over identity when plain id is applied.
- Proof:
  - Focused Mocha: `tests/device-person-token.helper.spec.ts` + `tests/hikvision-callback.controller.spec.ts` +�G��G�� 17/17 pass.
- Boundary:
  - Plain device person id +�GǦ-� HRIS `Employee.employeeId` code unless already linked via DeviceUser / `deviceEmpId`.
  - Empty-person major=3 signals still need logSearch / inventory delta for plain id; we do not invent person numbers.
- Recommendation capture: No new recommendations were identified.


## Latest Task Addendum - 2026-07-19 Hikvision bridge follows DB device address

- Task mode: Bug fix + runtime proof.
- Goal: Stop local predev/Keep-ready from reusing a stale TEST A reverse-tunnel IP when the HRIS Device row already has the current Hikvision address.
- Implemented:
  - Added a DB-backed resolver for host-side Hikvision VM bridge targets.
  - `ensure-hikvision-vm-bridge.cjs` now resolves reverse-bridge devices from HRIS Device rows, prefers rows configured with `ssh-reverse-forward`, and restarts stale tunnels instead of accepting an open SDK port pointed at an old IP.
  - `ensure-device-live-path.ps1` and `restart-local-hris-api-dev.ps1` now follow the same DB-resolved target unless an explicit operator override is supplied.
- Proof:
  - Resolver selected `TEST A` at `192.168.254.102` from the DB.
  - Host live-path ensure reported DB tunnel, SDK reverse, and API reverse all ready for `192.168.254.102`.
  - Prove endpoint returned `proven=true`, listener `armed=true`, `receiving=true`, and fresh SDK event proof.
- Truth sync: Existing Hikvision runtime truth already says the HRIS Device row is the source of configuration truth; this repair aligns predev/Keep-ready scripts with that truth.
- Recommendation capture: No new recommendations were identified.


## Latest Task Addendum - 2026-07-19 Local API predev DB fast path

- Task mode: Focused startup performance repair + regression proof.
- Goal: Make `hris-api` DEV startup claim `127.0.0.1:55435` quickly without changing the VM/K3s database architecture or disabling the VM-managed Cloudflare tunnel.
- Implemented:
  - The DB preflight now checks only the canonical localhost Prisma forward instead of also probing a LAN-bound alias that cannot satisfy the datasource contract.
  - The broad multi-port remote-LAN forward is opt-in and no longer blocks the default DB-specific cold path.
  - Direct LAN SSH is gated by a 600 ms TCP reachability check before SSH authentication; Cloudflare SSH remains the fallback.
  - Forward startup uses readiness polling instead of a fixed multi-second sleep.
  - Port 3001 ownership and DB access checks now run concurrently because they are independent.
- Proof:
  - Focused `ensure-bnpi-db-access` Mocha tests pass 2/2.
  - PowerShell and Node syntax parsing pass.
  - Warm real predev proof completed the DB step in 0.3 seconds and all seven predev steps in 8.9 seconds; the remaining dominant cost was the separate device-live-path check at 6.5 seconds.
  - Controlled cold proof through the Cloudflare SSH fallback opened a replacement Postgres forward in 3.18 seconds and returned a valid Postgres SSL negotiation reply; the replacement forward remains active.
- 2026-07-20 follow-up: `dev.bnpi-hris.tech` and K3s DEV proved the correct local DEV runtime: 7 active devices including `TEST A` (`cmrlgqsjv000oob01165tbd8n`, `192.168.254.102:443`), 394 TEST A DeviceUser rows, and 1924 TEST A DeviceEvent rows. Compose DEV at `10.184.37.19:15433` proved stale/drifted with only one old `192.168.18.39` device. Localhost hot reload must point at the K3s DEV forward `127.0.0.1:55435`; compose DEV `15433` is diagnostic-only unless explicitly requested.
- Recovery evidence: K3s was blocked by `DiskPressure=True` because old retained VHDX snapshots under `/var/lib/project-truth/retained-vhdx` consumed about 194 GB. Removing those retained snapshots increased free space from about 28 GB to about 193 GB; after K3s restart, node `DiskPressure=False`, and DEV `hris-postgres-0`, `hris-api`, `hris-app`, and `hris-hikvision-watcher` returned to `Running`.
- Truth sync: Architecture clarification; canonical DEV datasource remains `127.0.0.1:55435` backed by the VM/K3s database forward. Compose DEV `10.184.37.19:15433` must not be silently selected for normal localhost hot reload because it is a duplicate drift-prone runtime.
- Recommendation capture: No new recommendations were identified.


## Latest Task Addendum - 2026-07-19 Device Events plain DeviceUser navigation

- Task mode: Bug fix + focused admin UX regression proof.
- Goal: In Device Events, keep the physical device user ID (`DeviceUser.vendorUserId` / `employeeNo`, e.g. `15`) separate from the HRIS employee code display/link (`Employee.employeeId`, e.g. `00015`) so admins can open the Device user details quickly from rows and the details modal.
- Implemented:
  - Saved Device Events API now falls back from `device_events.deviceUserId` to `organizationId + deviceId + employeeNo = device_users.vendorUserId`, so older/healed rows can still return the matching `deviceUser` object when the event has a plain person ID.
  - Device Events UI now carries `deviceUserVendorUserId` separately and uses it for Sync Center deep links (`deviceUserSearch=15&deviceUserDetails=15`) while preserving the Employee record link for matched employees.
  - Device Users panel row type now declares `employeeNo` for the existing deep-link lookup path.
- Proof:
  - Direct local API: `GET /api/device/events?...&query=15` returned rows where `deviceUserId` was `null` but `deviceUser.vendorUserId` was recovered from the plain saved `employeeNo`.
  - Direct local API: `GET /api/device/<TEST A id>/users?vendorUserId=15` returned one TEST A DeviceUser with `vendorUserId=15` and `employeeNo=15`.
  - Focused Playwright: `admin device events keeps plain device user id separate from padded employee code` passed 1/1.
  - Focused backend Mocha: `tests/device-person-token.helper.spec.ts` + `tests/hikvision-callback.controller.spec.ts` passed 17/17.
- Existing unrelated validation drift:
  - Full `hris-app` typecheck remains red on many historical errors outside this Device Events fix; one local Device Users type hole surfaced by the run was fixed.
  - Full `admin-device-events-sync-modal.spec.ts` still has an older Sync logs assertion expecting a `Category` column while the current UI renders `Business area`; the new `15`/`00015` regression passes by name.
- Recommendation capture: No new recommendations were identified.


## Latest Task Addendum - 2026-07-19 Restart-safe Hikvision reverse tunnel + in-app repair

- Task mode: Regression repair + focused admin UX.
- Goal: Recover the Hikvision reverse path after a host/VM restart without requiring the operator to rerun the full API predev sequence or manually choose a device IP.
- Root cause: The device SDK/HTTP reverse forwards and the VM-to-host API callback reverse were bundled into one SSH command. A stale VM `:53001` API listener therefore made the entire command fail before device ports `:59000` / `:59443` could bind.
- Implemented:
  - The host device bridge now owns only DB-resolved device HTTP/SDK forwards; `ensure-device-live-path.ps1` separately owns the API callback reverse.
  - Stale-port recovery inspects privileged `sshd` ownership, kills only the exact stale `infra` SSH session holding the requested ports, and sends multiline repair scripts over `bash -s` to avoid Windows SSH quoting drift.
  - The listener modal shows a compact `Check tunnel` / `Repair tunnel` action only for devices configured to use a reverse path. It calls the existing host-owned prove/repair endpoint and refreshes listener truth; it does not rerun all predev steps.
- Live proof (this host/VM):
  - Host can reach DB device `TEST A` at `192.168.254.102` on `:8000` and `:443`.
  - Device and API reverse paths run as separate SSH sessions; VM loopback listeners `:59000`, `:59443`, and `:53001` are present.
  - Admin prove endpoint returned `proven=true`, readiness green, listener `receiving=true`, and a fresh saved SDK event.
  - Focused Playwright listener-modal smoke passed 1/1; bridge contract passed 4/4; PowerShell parsing passed.
- Boundary: `ping 192.168.254.102` from the VM is not reverse-tunnel proof. SSH reverse forwarding exposes selected TCP ports on VM loopback; it does not route ICMP or the device subnet.
- Existing validation drift: Full `hris-app` typecheck remains red on numerous unrelated historical errors outside the touched Device Events surface; the focused Playwright regression is green.
- Recommendation capture: No new recommendations were identified.


## Latest Task Addendum - 2026-07-19 Smart reverse-bridge IP after reboot

- Task mode: Bug fix + host runtime proof.
- Goal: After PC reboot, `npm run dev` / predev / Keep-ready must auto-pick the reverse-capable Hikvision IP (currently `192.168.254.102` for TEST A) without a manual `HIKVISION_VM_BRIDGE_DEVICE_IP` override, while staying fast.
- Root causes fixed:
  - Fast path accepted any open VM `:59000` even when the local SSH process did not target the resolved device IP (stale after reboot / thrash).
  - Legacy fallback still preferred historical `192.168.254.189`.
  - Resolver ranked DB reverse rows but did not probe which candidate the **host** can reach right now.
- Implemented:
  - `resolve-hikvision-vm-bridge-targets.cjs` now probes host TCP (sdk/http/443/80, ~300+�G�Gǣ400ms) and ranks `reverseBridge + hostReachable` first. Source becomes `db-reverse-bridge-host-reachable` when LIVE.
  - Fallback order when DB is down: `192.168.254.102` then `192.168.254.189`.
  - `ensure-hikvision-vm-bridge.cjs` fast-paths only when **local bridge matches resolved IPs AND VM :59000 is open**; otherwise stop + rebind.
  - `ensure-device-live-path.ps1` prefers host-reachable targets from the same resolver.
- Proof (this host):
  - Resolver: `TEST A` / `192.168.254.102` / `hostReachable=true` / openPorts `8000,443,80` / score 188.
  - Ensure: detected stale local match, rebound tunnel to `192.168.254.102`, ready in 13.6s.
  - Unit: `tests/resolve-hikvision-vm-bridge-targets.spec.cjs` 3/3.
- Operator note: still no need to set the IP manually for the normal case; optional override remains `HIKVISION_VM_BRIDGE_DEVICE_IP`. After ensure, restart Hikvision listener once if UI still shows pre-reboot arm state.
- Recommendation capture: No new recommendations were identified.


## Latest Task Addendum - 2026-07-19 Enrollment identity architecture docs

- Task mode: Docs / architecture sync.
- Goal: Capture operator vision for panel/SDK user create + enroll identity, verify architecture correctness, document exact flows, and provide diagrams so agents stay synced to the spec.
- Written:
  - `docs/HIKVISION_ENROLLMENT_IDENTITY_FLOW.md` +�G�Gǥ full spec, identity planes, Flow A/B/C/D, mermaid sequence, acceptance, gaps.
  - `.wwg/wiki/05-architecture/hikvision-enrollment-identity-architecture.md` +�G�Gǥ WWG architecture twin.
  - Pointer in `docs/HIKVISION_RUNTIME_TRUTH.md`.
- Architecture verdict: Operator vision is correct; implementation is aligned with the happy path and panel-opaque path, with explicit boundary that plain person id may trail the first socket by a few seconds when major=3 has empty `dwEmployeeNo`.
- Recommendation capture: No new recommendations were identified.


## Latest Task Addendum - 2026-07-19 C++-first create/enroll raw wire truth

- Task mode: Mixed regression repair across C++ listener identity enrichment, biometric custody, realtime, and admin UI truth.
- Evidence: `.runtime/cpp-first-create-enroll-raw-20260719-200043/`.
- Listener truth: major=3 create/enroll ACS may carry empty `dwEmployeeNo`; do not claim first-callback plain identity. Serialized, completion-checked UserInfo inventory scans now prevent interleaved partial baselines from producing false deltas. A post-rebuild create of `99200129` resolved through a one-person inventory delta and posted plain identity; that new user honestly had `numOfFP=0` and no face.
- Enrollment truth: TEST A person `15` has `numOfFP=1`, `numOfFace=0`. Rewriting person 15's own template (donor=false) proved status 6, sticky read-back, and one 684-character raw template. Existing-person ACS remained empty/zero-template, then HRIS logSearch resolved plain `15` and automatic ISAPI capture stored the raw template on DeviceUser and FINGERPRINT_ENROLLED DeviceEvent payloads without manual Capture.
- Realtime/UI truth: `device-event:saved` delivered saved lifecycle rows with plain `employeeNo=15`; opaque tokens stayed only in payload evidence. Device user details renders stored raw fingerprint data and labels manual capture as repair-only.
- Face boundary: person `15` has no face on the device, so raw face remains honestly absent. Earlier person `1` face proof is historical and is not reused as proof for this path.


## Latest Task Addendum - 2026-07-17 Device-user sync stale processing truth

- Task mode: Regression repair + Playwright-first proof + API contract guard.
- Goal: A 35-hour stale Device-user sync status must not be displayed as live processing after app/dev-server startup. Sync device users remains admin-triggered; persisted status may reopen only when the job has recent progress evidence.
- Implemented:
  - `hris-app/app/routes/admin/devices/enroll.tsx` now treats processing sync-job progress without a recent `updatedAt`/progress timestamp as stale and clears the active startup status instead of showing a live Sync status badge/modal.
  - `hris-api/app/device/device.controller.ts` now stamps device-user sync jobs with `updatedAt`, updates it on progress writes, and marks stale persisted processing snapshots as failed/stopped on job lookup.
  - `hris-app/app/services/devices.service.ts` exposes optional `updatedAt` on `DeviceUserSyncJobProgress`.
  - Playwright regression coverage added for stale startup state while preserving the fresh live-status toolbar path.
- Proof:
  - Failing-first Playwright reproduced the stale startup bug before the fix.
  - `npm run test:e2e:smoke -- tests/smoke/admin-device-user-summary-toolbar.spec.ts` passed 2/2 after the fix.
  - `npx tsx node_modules/mocha/bin/mocha --no-config tests/device-user-api-contract.spec.ts --grep "expires stale processing"` passed 1/1.
  - `npm run typecheck` in `hris-api` passed.
- Existing unrelated validation drift:
  - `npm run typecheck:test` in `hris-app` still fails in `app/routes/employee/dashboard/TimesheetsTab.test.tsx` with a pre-existing `UseQueryResult` mock-shape type error.
  - `npm test -- tests/device-user-api-contract.spec.ts` in `hris-api` runs the full backend suite because the script already includes `tests/**/*.spec.ts`; that broader run still has unrelated historical failures, and the focused Mocha command above was used for this contract.
- Truth sync: Project Truth and Project Truth summary now state that processing device-user sync snapshots older than 30 minutes without progress evidence are stale and require a fresh admin-triggered run.
- Recommendation capture: No new recommendations were identified.

Status: IMPLEMENTED + PROVEN +�G�Gǥ Device admin UX clarity (friendly status, slim Sync logs, no VM primary jargon)


## Latest Task Addendum - 2026-07-16 Device admin UX clarity pass

- Task mode: Meaningful UX feature + contract tests + Playwright journey proof.
- Goal: Device management / Device events / Sync logs / Sync users journey is admin-friendly, not engineer-verbose; loading is honest; Sync logs not repeated/noisy; no redundant filter columns; no primary VM jargon.
- Implemented:
  - `hris-app/app/routes/admin/devices/events.tsx` +�G�Gǥ Live capture status copy; Saved event ledger strip; Sync logs slim summary + blocked collapse + 4-column table; loading/empty honesty.
  - `hris-app/app/routes/admin/devices/manage.tsx` +�G�Gǥ +�G�+�Checking device connection+�G�-�+�G�-� / +�G�+�Reading users from device+�G�-�+�G�-�.
  - Contract + Playwright smoke (3 tests) updated and green.
  - Non-stop agent loop prompt: `docs/00-product/AGENT-PROMPT-device-admin-ux-clarity-loop.md`
- Evidence: `.runtime/device-ux-clarity-20260716-221328/`, screenshots under `.runtime/device-ux-clarity-proof/screenshots/`
- Proof: vitest 12/12; playwright 3/3.
- Residual (not UX-contract blockers): physical Hikvision reachability, public GitOps image lag until promote, host LAN SSH timeout from some agent hosts.


## Latest Task Addendum - 2026-07-16 Hikvision Device Events Source Truth

- Task mode: Mixed runtime repair, meaningful feature, persistence cleanup, tests, and UI verification.
- Completed:
  - Repaired Windows port 3001 ownership/exclusion drift and the local restart helper's false-negative health timeout.
  - Directly proved Main Entrance Device A inventory, ACS pagination, logSearch availability/pagination/raw metaIds, and selected-window serial parity.
  - Enforced the `DeviceEvent` evidence contract, saved-row filters/summaries, SDK/logSearch taxonomy, runtime correlation, and deduplication.
  - Exported and removed 219 proven fake lifecycle rows with zero attendance deletion.
  - Refined the saved-only Device Events UI and passed live Playwright ledger/details proof.
- Evidence: `.wwg/reports/hikvision-device-events-sync-center-current-state-20260716.md` and `.runtime/device-events-sync-center-20260716-160910/`.
- Boundary: full historical ACS serial reconciliation and GitOps/public promotion were not performed in this local implementation pass.


## Latest Task Addendum - 2026-07-16 Sync logs live residual unblocked (Cloudflare)

- Task mode: Runtime proof / residual close-out (no code change).
- Trigger: operator `ssh project-truth-hris` succeeded after Cloudflare Access browser login; public client screens stayed up.
- Evidence: `.runtime/vm-sync-logs-continue-20260716-220308/`
- Proven:
  - Host LAN to `10.184.37.19` still times out from this agent host; Cloudflare SSH + public origins work.
  - Argo apps at revision `7309928` (includes event-first `ee42f4a`); PROD/DEV/UAT `hris-api`/`hris-app` Running on `hris-api-local:develop` / app images; tunnel active.
  - `GET https://api.bnpi-hris.tech/api/device/sync-preview` returns per-device `eventRows[]` + `sources[]` with live ZKTeco Ready rows (e.g. `.235` willAdd `2035` / already `20267`).
  - `GET https://dev-api.bnpi-hris.tech/api/device/sync-preview` returns Hikvision 16-row event catalogs with already-in-HRIS by action even when sources unavailable.
  - Public browser: admin login +�G��G�� Device events +�G��G�� Sync logs (`action=sync-logs`); UI shows Event to add / Will add / Already in HRIS / Source proof; network `sync-preview` HTTP 200.
- Residual still open:
  - Hikvision TCP from VM fail for configured addresses; PROD Main Entrance Device missing access credentials in preview error.
  - ZKTeco `.234` preview still source_unavailable while later TCP `4370` OK +�G�Gǥ investigate bridge/read path, not modal contract.
  - `project-truth-runtime-dev` Argo app Synced/Degraded.
  - Per-type operation **willAdd** precision still needs per-action logSearch classification when Hikvision sources are reachable.
  - ansible-pull commit `e156c70` lags Argo serving revision `7309928`.


## Latest Task Addendum - 2026-07-16 Sync logs event-first modal

- Task mode: Meaningful feature + API contract + UI + tests + Playwright proof.
- Commit: `ee42f4a` on `develop`.
- Evidence: `.runtime/sync-logs-event-first-20260716-215712/`
- Goal: Sync logs modal is event-first +�G�Gǥ per Hikvision device show what will be added to Device Events (not inventory-first On device / In HRIS / Can import as the main story).
- Implemented:
  - `hris-api/helper/sync-logs-event-rows.helper.ts` catalog + dual-source builders.
  - `GET /api/device/sync-preview` now returns `eventRows[]`, `sources[]`, operation log total probe (`ContentMgmt/logSearch`), attendance total (`AccessControl/AcsEvent`), and already-in-HRIS by `eventAction`.
  - UI summary uses Ready source checks X of Y from source probes; per-device table remains Event to add | Will add | Already in HRIS | Source proof | Filter after sync | Status.
  - Focused mocha + vitest + Playwright headless smoke (ZKTeco + Hikvision event-first) with screenshots.
- Boundary / residual (updated by live proof above):
  - Live DB/API preview residual closed via Cloudflare public + CF SSH path.
  - Per-type operation **willAdd** precision and Hikvision physical source reachability remain open.
  - Full historical ACS serial reconciliation still out of scope.


## 2026-07-15 Main Entrance Device C Export Accuracy Addendum

- Status: `COMPLETE` for the bounded current-page Excel/Package JSON export and import-preview journey; physical target-device restore remains explicitly unclaimed.
- The export modal now loads the source page while open, shows `Current page: 8 rows`, validates a separate v2 envelope for each device/user/modality, and refuses to create a biometric file when requested positive-count credentials are missing. The existing resumable background capture job is opened instead.
- Final headless Playwright downloads contained eight valid fingerprint envelopes for eight reported fingerprint users and seven valid face envelopes for seven reported face users. Vendor user 8 reports no face and correctly exports an empty face field with `not_enrolled` status.
- The real `.xlsx` had 28 required headers, zero placeholder cells, and safe hash parity with the separately downloaded Package JSON. Correct-passphrase import preview unlocked all 15 envelopes without plaintext exposure; an incorrect passphrase was rejected.
- Evidence: `.runtime/biometric-excel-proof-20260715-162935/`.


## 2026-07-15 Device Sync Progress And Bounded Preflight Addendum

- Status: `IN_PROGRESS` for the wider biometric portability finish line; the requested background-progress and bounded offline-device UX is implemented and locally proven.
- Device-user biometric capture is resumable and visible through an orange status modal and reopenable status badge. Main Entrance Device C job `d3a6f6f8-d16c-4919-b65e-e0b7a54502be` completed 537 modality tasks: 531 captured, 22 already present/cached, and 6 failed. The six failures remain explicit and are not treated as portable credentials.
- Merge preview reads independent devices concurrently and excludes devices that the bounded availability preview marks unavailable. Sync Logs preserves its last usable rows while its 15-second quiet refresh runs.
- Headless Playwright measured merge UI readiness at 3.369 seconds, merge API completion at 2.939 seconds, and sync preview refreshes at 4.406-4.677 seconds, with no console errors and no refresh skeleton replacing rows.
- CI passed at `f57d45e`. After repairing the npm 10 lockfile contract, VM reconciliation completed with zero failures, DEV Argo CD returned `Synced/Healthy`, new app/API pods were running, LAN app/API returned HTTP 200, and `cloudflared-bnpi-hris.service` remained active. The deployed merge dry-run completed in 3.781 seconds.
- Evidence: `.runtime/device-preflight-latency-20260715-151721/`, `.runtime/biometric-portability-proof-20260715-114841/playwright-main-c-background/`, and `.runtime/device-user-sync-jobs/d3a6f6f8-d16c-4919-b65e-e0b7a54502be.json`.


## Latest Task Addendum - 2026-07-14 Multi-User Biometric Export Custody

- Task mode: mixed meaningful feature and regression repair with real-device,
  API, and Playwright proof.
- Main Entrance Device E current local snapshot contains 239 DeviceUser rows.
- Separate encrypted biometric custody is proven:
  - 217 rows contain a real fingerprint AES-256-GCM envelope.
  - 103 rows contain a real face AES-256-GCM envelope.
  - Fingerprint and face use separate envelope/key-source/blob columns.
  - No row reuses one encrypted ciphertext for both modalities.
- Twenty rows remained SDK-empty after combined, fingerprint-only, and
  face-only attempts. They remain explicit export errors/empty cells; no raw or
  encrypted value was fabricated from stale enrollment counts.
- Cached export proof through the real admin UI:
  - CSV download: 3.759 seconds.
  - Excel download: 3.655 seconds.
  - Package JSON download: 3.137 seconds.
  - All export POSTs and downloads were below 10 seconds.
- Full-package import readiness:
  - Portable JSON compaction removed duplicate encrypted objects and reduced
    the 239-user file from 11.9 MB to 4.98 MB without removing the visible
    fingerprint/face key/blob columns.
  - Package import preview: 239 matches, zero conflicts, `unlockable=true`,
    `plaintextExposed=false`.
  - Playwright CSV import preview: 239 matches, zero conflicts,
    `unlockable=true`, `plaintextExposed=false`, 2.578 seconds, no console
    errors.
- Local testing alignment:
  - The port 5175 frontend was restarted with a local API override so the
    current browser testing journey uses `http://localhost:3001/api` rather
    than the older VM API image.
  - The VM-managed Cloudflare Tunnel and Hikvision listener remained active.
- Remaining boundary:
  - Encrypted export and non-mutating import preview are proven.
  - Physical offline restore still needs the reviewed C++ SDK write-from-bundle
    path; direct HTTP write-back is not accepted as complete.
- Evidence: `.runtime/multi-user-biometric-export-proof-20260714-182917/`.


## Latest Task Addendum - 2026-07-13 Device User Vendor Metadata Tooltip

- Task mode: Meaningful feature with additive persistence and admin UI display.
- User goal:
  - Add a non-destructive `DeviceUser` metadata field for vendor SDK/ISAPI
    user payloads, including fingerprint/image-related vendor metadata when
    available, so HR/admin journeys can recover per-device user context.
  - Make the saved value visible in the Sync Center device-user row details
    modal through a tooltip/preview without replacing the raw source payload.
- Implemented local behavior:
  - Added additive `DeviceUser.vendorMetadata` JSON/JSONB schema support while
    preserving existing `rawPayload`.
  - Hikvision user sync now prepares structured vendor metadata from
    `UserInfo/Search` payloads and the API guards selects/writes so older local
    databases do not fail before the migration is applied.
  - Sync Center user details now shows a `Vendor metadata` preview with a
    tooltip plus an expandable `Vendor metadata JSON` section; raw source
    payload remains available separately.
- Validation:
  - Local migration was applied and Prisma Client regenerated.
  - Local API endpoint proof for a real device-user list showed
    `vendorMetadata` in the response, falling back from `rawPayload` for rows
    synced before the new column existed.
  - Focused backend sync/API contract tests and the Sync Center UI contract
    test passed.
- Boundary:
  - Existing rows may show fallback vendor metadata from `rawPayload` until a
    fresh user sync persists structured `vendorMetadata`.
  - This does not approve raw biometric template custody beyond the existing
    admin device-user/vendor metadata surface.


## Latest Task Addendum - 2026-07-12 Hikvision Listener VM Runtime Reachability And Live DEV Status Repair

- Task mode: VM listener/runtime repair, K3s DEV API promotion, and live
  endpoint proof.
- User goal:
  - Fix the Hikvision Linux listener path so the managed VM service is running
    and so the DEV API/UI can read truthful listener status from the same VM.
- Current-state finding before the fix:
  - The VM service could be started manually over `ssh project-truth-hris`,
    but the live DEV `hris-api` pod still used stale listener code that pointed
    at `10.184.37.241`.
  - After the first controller patch, the live DEV API still could not expose
    status/control because it ran inside a container without `ssh`, without a
    mounted VM key, and therefore could not reach the host-managed systemd
    service honestly.
- Implemented repair:
  - `scripts/project-truth-hikvision-hot-reload-listener.sh` now rebuilds from
    `/opt/project-truth/vendor/hikvision-linux` and defaults HRIS posts to
    `http://localhost:3101`.
  - Added managed VM daemon wrapper
    `scripts/project-truth-hikvision-hot-reload-daemon.sh` and managed unit
    `appliance/systemd/project-truth-hikvision-hot-reload-listener.service`.
  - `hris-api/app/device/device.controller.ts` now installs the wrapper,
    daemon, and systemd unit together and exposes corrected VM target logic for
    the managed listener controls.
  - `ansible/project-truth-pull.yml` and
    `appliance/bin/project-truth-os-sync.sh` now install the managed listener
    scripts/unit so the repair survives VM self-heal.
  - `hris-api/Dockerfile` now installs `openssh-client`, and
    `gitops/runtime-k8s/overlays/dev/runtime.yaml` now mounts
    `/var/lib/project-truth/ssh` plus `PROJECT_TRUTH_VM_HOST`,
    `PROJECT_TRUTH_VM_USER`, and `PROJECT_TRUTH_VM_SSH_KEY` env so the DEV API
    pod can SSH back to the VM host truthfully.
  - Provisioned VM-local SSH key
    `/var/lib/project-truth/ssh/node-health-appliance_ed25519`, authorized it
    for `infra`, rebuilt `hris-api-local:develop`, imported it into K3s, and
    rolled the DEV `hris-api` deployment after temporarily pausing
    `project-truth-ansible-pull.timer` to avoid stale checkout drift during the
    rebuild. The timer was restarted after the rollout.
- Proven live truth:
  - VM systemd now reports
    `project-truth-hikvision-hot-reload-listener.service` as
    `ActiveState=active`, `SubState=running`, `Result=success`.
  - The live DEV authenticated endpoint
    `GET /api/device/hikvision/listener` now returns:
    - `vm.host=10.184.37.19`
    - `running=true`
    - `status=running`
    - `control.available=true`
    - `logs.available=true`
    - `sdk.state=login_failed`
    - `lastLoginError=7`
  - The DEV pod now has `/usr/bin/ssh` and mounted key files at
    `/var/run/project-truth/ssh/node-health-appliance_ed25519`.
- Remaining blocker:
  - The listener runtime and API/UI visibility are repaired, but the physical
    device itself is still not armable from the VM today. Journals and live API
    logs show repeated `sdk_login host=10.184.37.139 lastError=7 ok=false` and
    `service_start_failed reason=no_armed_devices`, so endpoint truth now
    accurately reports a real device/network/credential failure instead of an
    opaque unknown state.


## Latest Task Addendum - 2026-07-12 Hikvision Remote-Site Agent And Local Dev Tunnel Proof


## Latest Task Addendum - 2026-07-12 HRIS Employee App Submodule And Runtime Integration

- Task mode: Mixed repo-structure integration plus runtime/GitOps sync.
- User goal:
  - Bring `https://github.com/hrisworkforcesystem-coder/hris-emp-app/tree/develop` into this Project Truth workspace as a visible/editable root folder while preserving the upstream repo relationship.
  - Align it with the existing `hris-api` / `hris-app` repo shape and extend Project Truth runtime/GitOps evidence so DEV/UAT/PROD are not implicit.
- Implemented integration:
  - Added root git submodule `hris-emp-app` on upstream branch `develop`.
  - Added parent-owned container wrapper `appliance/dockerfiles/hris-emp-app.Dockerfile` plus Nginx proxy template so the employee app can stay a clean upstream checkout while runtime-specific `/api` and `socket.io` proxy behavior lives in Project Truth.
  - Added Compose services:
    - PROD `hris-emp-app` on port `3300`
    - DEV `hris-emp-app-dev` on port `3310`
    - UAT `hris-emp-app-uat` on port `3320`
  - Added matching K3s runtime Deployments/Services in `gitops/runtime-k8s/overlays/{prod,dev,uat}/runtime.yaml`.
  - Extended image staging/import and verification scripts so Project Truth now treats `hris-emp-app` as part of the runtime surface, not an orphan checkout.
- Truth/docs sync:
  - Updated Project Truth summary, Project Truth wiki, README verification targets, and local port config to include `hris-emp-app`.
  - Reserved employee-app public hostnames `emp.bnpi-hris.tech`, `dev-emp.bnpi-hris.tech`, and `uat-emp.bnpi-hris.tech` in both host-managed and VM-managed tunnel configs plus runtime CORS surfaces.
- Validation target:
  - Focused config verification only in this pass; runtime bring-up/probe is still required before claiming live VM proof for the new employee-app ports.

- Task mode: Cross-network Hikvision runtime repair plus local-dev remote test path.
- User goal:
  - Keep the listener truth accurate while making the currently running local
    dev stack reachable from a remote device-side network for tomorrow's test.
- Confirmed listener/runtime truth:
  - Local `GET /api/device/hikvision/listener` now returns truthful diagnosis
    fields from the live VM log:
    - `sdk.lastTargetHost=10.184.38.137`
    - `sdk.lastLoginError=7`
    - `sdk.lastFailureReason=no_armed_devices`
    - diagnosis text explicitly says the VM is healthy but device login/network
      reachability is still failing.
  - Live browser proof in the separate headed Chrome window, after reload, now
    shows the same truthful state in the Hikvision listener modal instead of
    the earlier stale "status check has not completed" view.
- Cross-network architecture hardening:
  - `appliance/systemd/project-truth-hikvision-hot-reload-listener.service`
    now reads optional override env from
    `/etc/project-truth/hikvision-hot-reload.env`, so a Linux host beside the
    devices can run the same managed listener in site-agent mode without
    editing the unit itself.
  - Added `scripts/start-local-hikvision-remote-test.ps1` to expose the local
    dev API/app through additive temporary trycloudflare URLs and generate a
    ready-to-use remote site-agent env file.
  - `docs/HIKVISION_RUNTIME_TRUTH.md` now documents the temporary remote-dev
    tunnel path as a dev-only bridge, with the Linux site agent beside the
    device remaining the durable architecture.
- Proven remote-dev tunnel path:
  - Temporary public API URL:
    `https://trim-attached-hiring-hart.trycloudflare.com`
  - Temporary public app URL:
    `https://constant-scholar-handbook-learners.trycloudflare.com`
  - Public API health returned HTTP 200.
  - Public app `/auth/login` returned HTTP 200 after allowing
    `*.trycloudflare.com` in `hris-app/vite.config.ts`.
  - Public API login with `admin@bandai.local` / `password123` succeeded and a
    subsequent public `GET /api/device?page=1&limit=10&document=true` returned
    the live local `Main Entrance Device` row, proving the exact remote
    site-agent fetch path against the user's current local dev API.
- Remaining truth:
  - The remote path for tomorrow is now viable:
    remote Linux site agent on the device LAN -> public tunneled local API.
  - The central VM still cannot directly reach `10.184.38.137:80` or `:8000`,
    so direct central-VM HCNetSDK login remains blocked by device-side
    reachability/network path, not by the local browser/API plumbing.
- Evidence:
  - `.runtime/listener-proof-20260712-163353/`
  - `.runtime/local-hikvision-remote-test/20260712-163759/`


## Latest Task Addendum - 2026-07-12 Local Postgres Device Tables Drift Fallback Repair

- Task mode: Local API regression repair while the user exercises admin device
  journeys.
- User goal:
  - Stop local admin device pages from throwing repeated 500s while the current
    localhost runtime uses an older Postgres shape without `device_users` and
    without newer `device_events` taxonomy columns.
- Current-state finding before repair:
  - Local `localhost:3001` returned 500 for
    `GET /api/device/events?page=1&limit=10&sort=eventTime&order=desc&dateField=eventTime`
    because the raw SQL assumed:
    - `public.device_users` exists,
    - `device_events.deviceUserId` exists,
    - and taxonomy columns `eventCategory`, `eventAction`, `eventLabel`,
      `eventConfidence` exist.
  - The same local runtime returned 500 for `GET /api/device/sync-preview`
    because it called `prisma.deviceUser.findMany()` directly while
    `public.device_users` was absent.
- Implemented repair:
  - `hris-api/app/device/device.controller.ts` now detects local
    `device_events` column presence through `information_schema` and degrades
    raw SQL to safe defaults when older columns are missing.
  - The device-events query now:
    - avoids joining `device_users` when either the table or the
      `device_events.deviceUserId` column is missing,
    - substitutes safe fallback values for missing taxonomy columns,
    - and keeps response shape stable for the frontend.
  - `GET /api/device/sync-preview` now treats missing `device_users` as an
    empty per-device user inventory instead of crashing.
  - Device-user list retrieval now returns an empty success payload with
    `migrationState=device_users_table_missing` instead of a 500 when the table
    is absent.
  - `hris-api/tests/hikvision-biometric-sync-contract.spec.ts` now includes the
    contract coverage for these fallback paths.
- Proven local truth:
  - After restarting the local `tsx watch` API process, direct authenticated
    local endpoint proof succeeded:
    - `GET /api/device/events?...dateField=eventTime` returned HTTP 200 with
      populated saved-event rows.
    - `GET /api/device/sync-preview` returned HTTP 200 with device preview data
      and zeroed user summary values where `device_users` truth is unavailable.
  - The local DB truth probe showed the current `device_events` table is
    missing:
    - `deviceUserId`
    - `eventCategory`
    - `eventAction`
    - `eventLabel`
    - `eventConfidence`
  - Current behavior is now truthful: older local DB shape still works for read
    journeys, but richer device-user features remain naturally empty until the
    table is migrated.


## Latest Task Addendum - 2026-07-12 Cross-Network Hikvision Agent Mode

- Task mode: Architecture repair for deployments where the browser/admin user
  and central HRIS runtime are not on the same LAN as the Hikvision terminal.
- Research-backed conclusion:
  - For direct HCNetSDK/ISAPI control, some runtime still needs LAN adjacency
    to the physical device.
  - The correct cross-network pattern is not "make the browser share the
    device LAN"; it is "run an outbound agent on the device LAN and let that
    agent post back to HRIS."
- Implemented runtime change:
  - `scripts/project-truth-hikvision-hot-reload-listener.sh` now supports:
    - `HIKVISION_HOT_RELOAD_DEVICE_SOURCE=postgres` for the VM-local mode
      already in use
    - `HIKVISION_HOT_RELOAD_DEVICE_SOURCE=api` for a remote site-agent mode
  - In `api` mode, the wrapper:
    - authenticates to the configured HRIS API base,
    - fetches active Hikvision `Device` rows and credentials from
      `/api/device?...document=true`,
    - prepares the SDK spec locally on the site host,
    - then runs the same HCNetSDK listener and callback-post pipeline.
  - Added `scripts/hikvision-remote-site-agent.env.example` as the minimal env
    example for that mode.
- Proven contract:
  - `hris-api` Hikvision biometric sync contract tests still pass after the
    wrapper change.
- Architectural implication:
  - This enables the same Project Truth Hikvision listener runtime to be placed
    beside the remote device tomorrow, while still using central/public HRIS
    as the source of truth and callback sink.


## Latest Task Addendum - 2026-07-12 Dev Reset and VM Device Target Alignment

- Task mode: Live dev cleanup plus VM listener target correction while the user
  validates Hikvision LAN behavior before on-site work.
- User-requested cleanup completed:
  - Executed full saved device-event reset through the admin endpoint with
    built-in backup export.
  - Result:
    - `deleted.deviceEvents=173744`
    - `deleted.linkedAttendance=12`
    - `countsAfter.deviceEvents=0`
    - `countsAfter.linkedAttendance=0`
  - Backup evidence directory:
    - `.runtime/backups/device-events-reset-2026-07-12T08-15-43-135Z`
- Local host runtime corrected:
  - Local device row now uses the SADP-discovered address `10.184.38.137`
    instead of stale `10.184.37.137`.
  - Post-reset local proof now shows:
    - `GET /api/device/events?...` => `total=0`
    - `GET /api/device/sync-preview` => device address `10.184.38.137`,
      `hrisSavedCount=0`, `status=source_unavailable`
- VM listener truth corrected:
  - The VM runtime had a separate source of truth and was still targeting
    `10.184.37.139`.
  - Updated the VM-side `hris-postgres-dev` device row to
    `10.184.38.137`, verified `/run/project-truth/hikvision-hot-reload-device.spec`
    reflects that address, and restarted
    `project-truth-hikvision-hot-reload-listener.service`.
  - Live listener logs now show the listener attempting:
    - `sdk_login host=10.184.38.137`
    - `lastError=7`
    - `service_start_failed reason=no_armed_devices`
- Current final truth:
  - App/browser -> local API -> VM listener control path is working.
  - Local dev saved device events are cleared.
  - Local device configuration and VM listener target are aligned on
    `10.184.38.137`.
  - The remaining blocker is physical Hikvision reachability/auth behavior from
    the VM to the actual device LAN target, not stale app state or stale
    listener target selection.


## Latest Task Addendum - 2026-07-12 Listener Fallback and Cross-LAN Truth

- Task mode: Device listener runtime truth repair while the user continues the
  admin Sync Center journey from a host that is not currently on the VM's
  direct LAN path.
- Current-state finding before repair:
  - Local `GET /api/device/hikvision/listener` still returned HTTP 200 but with
    misleading degraded truth:
    - `running=false`
    - `status=unknown`
    - `control.available=false`
    - `error=ssh: connect to host 10.184.37.19 port 22: Connection timed out`
  - The admin Sync Center therefore rendered `VM stopped` even though the VM
    listener service was actually healthy when reached through the prepared
    Cloudflare SSH alias.
- Implemented repair:
  - `hris-api/app/device/device.controller.ts` now tries Hikvision VM commands
    against multiple targets in order:
    - direct LAN SSH to `infra@10.184.37.19`
    - fallback SSH alias `project-truth-hris`
  - The same fallback logic now applies to remote command execution and file
    copy operations used by listener status/control/runtime install flows.
  - Listener status payloads now expose the resolved path through
    `vm.path`, for example `alias:project-truth-hris`.
  - `hris-app/app/routes/admin/devices/enroll.tsx` now distinguishes
    `status unreachable` from `VM stopped` so the Sync Center stops claiming a
    healthy remote listener is down when only the local LAN probe failed.
  - `hris-app/app/routes/admin/devices/events.tsx` now treats
    `control.available=false` and endpoint-level listener errors as status
    unavailability, not just transport exceptions.
- Proven local truth after restart:
  - After restarting the local `tsx watch` API runtime, direct authenticated
    local endpoint proof now returns:
    - `running=true`
    - `status=running`
    - `control.available=true`
    - `vm.path=alias:project-truth-hris`
    - `sdk.state=login_failed`
    - `sdk.lastLoginError=7`
  - This confirms the cross-LAN admin/browser path is now repaired: the host
    can interrogate the VM listener through the prepared fallback route even
    when direct LAN SSH to `10.184.37.19` is unavailable from the workstation.
- Remaining blocker now isolated:
  - From the VM itself, direct probes show the physical device path is broken:
    - `10.184.37.139:8000` -> `No route to host`
    - `10.184.37.137:80` -> timed out
  - `GET /api/device/sync-preview` therefore still correctly reports
    `status=source_unavailable` with
    `error=Hikvision event total unavailable (code 20)`.
  - Current truth:
    - remote admin-to-VM listener visibility is repaired,
    - VM-managed listener service is running,
    - but VM-to-device network reachability still blocks real device user/tap
      acquisition.


## Latest Task Addendum - 2026-07-10 Hikvision Fast User Delta Path

- Task mode: Local runtime refactor, device-to-device latency reduction, and
  real-device evidence.
- User goal:
  - Reduce the perceived Hikvision cross-device user-copy delay from about
    60 seconds to about 3-5 seconds in local dev mode.
- Current-state finding before the refactor:
  - Live VM listener logs showed generic Hikvision operation-sync callbacks
    (`OBSERVED_OPERATION_MINOR_112/121/122`) were triggering sequential
    full-mirror reconciles.
  - One observed 4-user mirror blocked the single worker from about
    `07:48:32Z` to `07:50:00Z`, with per-user fingerprint read/write waits
    dominating the latency.
- Change:
  - `vendor/hikvision-linux/hikvision_biometric_service.cpp` now routes
    generic operation-sync callbacks with no `employeeNo` through a fast
    inventory-delta path first.
  - The fast path reads source and peer employee inventories, computes missing
    employee numbers per peer, and writes only the missing user records
    immediately, without blocking on fingerprint reads/writes.
  - Manual full mirror behavior remains available for explicit/manual runs.
- Runtime proof:
  - After rebuilding on the VM and restarting
    `project-truth-hikvision-hot-reload-listener.service`, live callbacks at
    `07:57:03Z` showed `reconcile_fast_path_inventory_delta` and
    `reconcile_fast_path_completed` instead of the earlier long-running
    full-mirror pattern.
  - A real temp user `9012` was created on source device `AAA`
    (`10.184.38.86`) by ISAPI.
  - A one-off real-device reconcile using the patched binary then copied
    `9012` from `AAA` to `Main Entrance Device` in the same second:
    `reconcile_queued`, `source_user_read ok=true`, `peer_user_write ok=true`,
    and `reconcile_completed` all logged at `2026-07-10T07:59:44Z`.
  - A later live-listener proof with the polling fallback created temp user
    `9013` on `AAA`; the running service detected the missing peer user at
    `08:11:37Z`, queued `poll_missing_user`, wrote the peer user at
    `08:11:38Z`, and completed the reconcile at `08:11:38Z`.
  - A one-off single-user fingerprint mirror for existing employee `1`
    completed in about one second: `source_user_read` at `08:11:58Z`,
    `source_fingerprint_read`, `peer_user_write`, `peer_fingerprint_write`,
    and `reconcile_completed` all landed by `08:11:59Z`.
  - Direct current-device truth check for employee `21` then showed:
    `AAA -> numOfFP=0, numOfFace=0` and
    `Main Entrance Device A -> numOfFP=1, numOfFace=1, faceURL present`.
  - A local `POST /api/device/cmpxw13hx002h7zwso7dyedrn/users/sync` refresh
    updated the saved `DeviceUser` row for vendor user `21` so the API now
    returns `numOfFP=1`, `numOfFace=1`, and `faceURL` for
    `Main Entrance Device A`.
  - Cleanup delete calls for `9012` returned `statusString=OK` on both
    devices.
  - Cleanup delete calls for `9013` also returned `statusString=OK` on both
    devices.
- Remaining truth:
  - The user-copy path itself is now fast when driven through the user-only
    reconcile flow.
  - The fingerprint copy path itself is now fast when driven through the
    single-user reconcile flow.
  - Direct ISAPI create of `9012` on `AAA` still did not produce a usable
    user-management callback in the next 15 seconds, so automatic propagation
    for API-created users remains gated by device callback behavior unless the
    new poll fallback detects the missing peer user.
- Evidence:
  - `.runtime/hikvision-fast-path-20260710-155617/listener-fast-path-after-restart.log`
  - `.runtime/hikvision-fast-path-20260710-155617/temp-create-9012-proof.txt`
  - `.runtime/hikvision-fast-path-20260710-155617/listener-since-create-9012.log`
  - `.runtime/hikvision-fast-path-20260710-155617/manual-single-user-9012.jsonl`
  - `.runtime/hikvision-fast-path-20260710-155617/delete-9012-proof.txt`
  - `.runtime/hikvision-under5-proof-20260710-161015/auto-create-9013-journal.txt`
  - `.runtime/hikvision-under5-proof-20260710-161015/fingerprint-single-user-1.jsonl`
  - `.runtime/hikvision-under5-proof-20260710-161015/delete-9013.txt`
  - `.runtime/hikvision-ui-truth-20260710-161529/user21-both-devices.json`
  - `.runtime/hikvision-ui-truth-20260710-161529/main-user21-after-sync.json`


## Latest Task Addendum - 2026-07-10 VM Static IP 10.184.37.241 Host Route Repair

- Task mode: Runtime/network drift repair with local host evidence.
- User goal:
  - The running Hyper-V VM should be reachable from the Windows host at static
    `10.184.37.241`, not only through the transient `192.168.*` Default Switch
    address.
  - Local HRIS API/database access should work when the app/browser is
    refreshed.
- Current-state finding:
  - Hyper-V reported `project-truth-local-vhdx-proof` running on
    `Default Switch` with guest IPs `10.184.37.241`,
    `192.168.237.193`, and link-local IPv6.
  - Inside the VM, `eth0` had `10.184.37.241/24` and
    `192.168.237.193/20`; DB/API ports were listening on `0.0.0.0`.
  - Windows could reach the transient `192.168.237.193` address, but could not
    reach `10.184.37.241` because `vEthernet (Default Switch)` only had
    `192.168.224.1/20`, so Windows routed `10.184.37.241` through Wi-Fi.
- Repair:
  - Added host-side `10.184.37.250/24` to `vEthernet (Default Switch)`.
  - Added idempotent recovery script:
    `scripts/ensure-project-truth-vm-241-host-route.ps1`.
  - The script verifies the named VM, ensures the host-side Default Switch
    address exists, and probes `10.184.37.241` ports `22`, `3000`, `3001`,
    `15432`, `15433`, and `15434`.
- Validation:
  - Windows TCP probes to `10.184.37.241` passed for SSH, app/API, and
    PROD/DEV/UAT DB ports.
  - SSH to `infra@10.184.37.241` returned hostname `project-truth-node` and
    `eth0` with `10.184.37.241/24`.
  - Prisma from Windows to
    `postgresql://postgres:postgres@10.184.37.241:15433/hris?schema=public`
    returned `db=hris`, `user=postgres`, server port `5432`, and
    `public_tables=73`.
  - `http://10.184.37.241:3001/health`, `http://localhost:3001/health`, and
    admin login through both API paths passed.
  - Headless browser refresh/login at `http://localhost:5175/auth/login`
    reached `http://localhost:5175/admin/dashboard`.
- Evidence:
  - `.runtime/vm-static-ip-241-repair-20260710-075945/`
  - Screenshot proof:
    `.runtime/vm-static-ip-241-repair-20260710-075945/vm-10.184.37.241-proof.png`
    and
    `.runtime/vm-static-ip-241-repair-20260710-075945/localhost-app-refresh-login-proof.png`


## Latest Task Addendum - 2026-07-10 Hikvision Synthetic Fingerprint Tally And Live Device Reachability Blocker

- Task mode: Local API/UI truth repair plus runtime blocker isolation.
- User goal:
  - Prove whether fingerprint tally can be tested honestly when a temp
    Hikvision user has no real template bytes, and keep the Device Users modal
    truthful instead of pretending a synthetic count is a physical device
    fingerprint.
- Confirmed SDK truth:
  - Local HCNetSDK headers and Hikvision demo code confirm
    `NET_DVR_FINGER_PRINT_CFG_V50` requires real `dwFingerPrintLen` plus
    `byFingerData` blob content.
  - A temp or copied user with `numOfFP=0` cannot honestly become
    `fingerprintCount=1` at the physical-device truth layer unless a real
    template is read from a source device and written back through the SDK.
- Implemented change:
  - `hris-api/app/device/device.controller.ts` now exposes
    `POST /api/device/hikvision/mock-fingerprint` for a clearly labeled
    dev-only synthetic fingerprint tally on an existing HRIS `DeviceUser` row.
  - The same controller now carries that synthetic tally to the peer HRIS row
    during `POST /api/device/hikvision/copy-user` only when the source user has
    no real fingerprint templates to send, so the FE journey can be tested
    without claiming physical device truth.
  - `hris-app/app/routes/admin/devices/enroll.tsx`,
    `hris-app/app/lib/hooks/useDevices.ts`, and
    `hris-app/app/services/devices.service.ts` now expose the synthetic tally
    state separately from the real fingerprint truth in the Device Users modal.
- Proven local UI/API truth:
  - The exact screenshot row `vendorUserId=9023` on `Main Entrance Device A`
    was confirmed before the patch as:
    - `rawPayload.numOfFP=0`
    - `_hrisDeviceMetadata.credentialSummary.fingerprintCount=0`
  - After restarting the local API, `POST /api/device/hikvision/mock-fingerprint`
    with `fingerprintCount=1` wrote only
    `_hrisDeviceMetadata.syntheticCredentialSummary.fingerprintCount=1` while
    leaving the physical-device truth at `numOfFP=0`.
  - Clearing the same synthetic tally removed
    `_hrisDeviceMetadata.syntheticCredentialSummary` and returned the row to
    pure zero-truth state.
- Live blocker isolated with proof:
  - As of `2026-07-10T09:50Z`, both Hikvision devices were unreachable from
    the VM on both TCP `80` and `8000`.
  - The running VM listener journal simultaneously showed repeated
    `source_user_inventory_read ok=false lastError=7` for both device IDs.
  - Because of that reachability loss, I could not honestly complete a fresh
    real temp-user physical copy/delete pass in this slice even though the
    earlier under-5-second peer-copy proof remains recorded.
- Evidence:
  - `.runtime/hikvision-synth-proof-20260710-165311/mock-fingerprint-9023-proof.json`
  - `.runtime/hikvision-synth-proof-20260710-165311/vm-device-port-check.txt`
  - `.runtime/hikvision-synth-proof-20260710-165311/listener-device-failures.log`


## Latest Task Addendum - 2026-07-10 Hikvision FE To SDK Peer Copy Journey Under 5 Seconds

- Task mode: Local frontend/backend/runtime repair with real-device proof.
- User goal:
  - Make the admin device-user journey tell the truth and physically copy the
    selected Hikvision user to the peer device quickly enough that the flow
    feels under 5 seconds.
- Current-state finding before the final pass:
  - The new `POST /api/device/hikvision/copy-user` path existed, but the local
    API process at `localhost:3001` was stale and did not expose the route
    until the local dev API was restarted.
  - The first working API copy pass still felt slow because it waited on a
    scoped VM run window plus a full target-device user reread; real timings
    were about `10.4s`, then about `6.4s` after removing the whole-device
    source refresh.
- Final change:
  - `scripts/project-truth-hikvision-hot-reload-listener.sh` now supports
    scoped one-off runs with device filtering and a short run window intended
    for a single user-copy request.
  - `hris-api/app/device/device.controller.ts` now exposes a real
    admin-only `POST /api/device/hikvision/copy-user` path that:
    - runs a scoped VM SDK copy from a chosen source device to a chosen target
      device,
    - confirms the peer write from SDK evidence,
    - refreshes only the copied target user into HRIS truth instead of
      rereading the entire target device,
    - and reuses the same copy helper during Hikvision enrollment when the
      target device does not yet physically contain the requested vendor user.
  - `hris-app/app/routes/admin/devices/enroll.tsx`,
    `hris-app/app/lib/hooks/useDevices.ts`, and
    `hris-app/app/services/devices.service.ts` now expose a real
    `Copy to peer device` action in the Device Users panel instead of forcing
    the journey through metadata-only sync assumptions.
- Runtime proof:
  - Temp user `9022` proved the route after the stale API restart; the physical
    peer write landed immediately, but the old endpoint shape still returned in
    about `10.4s`.
  - Temp user `9025` proved the scoped single-user target refresh was active:
    the API response returned `targetSyncTotalSourceRecords=1` and the full
    copy request completed in about `6.392s`.
  - Temp user `9026` reduced the same end-to-end API call to about `5.601s`
    with the shorter VM run window.
  - Temp user `9027` completed the same real device-to-device copy in about
    `2.910s` end to end through the local API route, with
    `beforeTargetStatus=NO MATCH`, `targetSyncTotalSourceRecords=1`, and
    `targetAfterCopyStatus=OK`.
  - Cleanup then deleted temp users `9022` through `9027` from both devices;
    post-delete searches returned `NO MATCH` on `10.184.38.86` and
    `10.184.38.136`.
- Remaining truth:
  - The admin Device Users page now has a real FE-to-SDK copy action in code,
    and the backing API/runtime path is proven under 5 seconds by direct
    endpoint plus device truth.
  - I did not run a final browser-rendered click proof against the new modal in
    this pass; the FE code is wired, but the proof here is API plus direct
    device SDK truth.
- Evidence:
  - `.runtime/hikvision-peer-copy-proof-20260710-163204/copy-9022-proof.json`
  - `.runtime/hikvision-peer-copy-proof-20260710-163204/copy-9022-after-api-restart.json`
  - `.runtime/hikvision-peer-copy-proof-20260710-163204/copy-9023-summary.json`
  - `.runtime/hikvision-peer-copy-proof-20260710-163204/copy-9024-summary.json`
  - `.runtime/hikvision-peer-copy-proof-20260710-163204/copy-9025-summary.json`
  - `.runtime/hikvision-peer-copy-proof-20260710-163204/copy-9026-summary.json`
  - `.runtime/hikvision-peer-copy-proof-20260710-163204/copy-9027-summary.json`
  - `.runtime/hikvision-peer-copy-proof-20260710-163204/cleanup-9022-9027.json`


## Latest Task Addendum - 2026-07-09 Hikvision Hot-Reload Listener Truth UI

- Task mode: Mixed local runtime repair, UI truth repair, and operator
  evidence.
- User goal:
  - The Device attendance page must not show a green/live state merely because
    the browser socket is connected when the VM Hikvision SDK listener is not
    actually receiving/posting tap events.
  - Local hot reload should keep receiving taps without an agent manually
    starting a one-off listener.
- Runtime repair:
  - Installed and enabled VM systemd service
    `project-truth-hikvision-hot-reload-listener.service`.
  - The service runs the rebuilt Linux HCNetSDK listener continuously against
    live Hikvision `192.168.254.189:8000` and posts to the Windows host local
    hot-reload API at `http://10.184.37.248:3001`.
  - The service uses `--device-file
    /run/project-truth/hikvision-hot-reload-device.spec` so the device password
    does not appear in process arguments.
  - Service status was active/running, posted callback results with `ok=true`,
    and local API showed recent rows including serial `1613` mapped to
    `Ernst tey Malasa`.
- UI repair:
  - Saved Hikvision/HCNetSDK views now poll saved rows every 2 seconds even
    when the browser socket is connected.
  - The page now distinguishes browser socket connectivity from fresh SDK
    listener evidence.
  - The prior green labels are replaced for SDK alarm scopes with:
    `SDK listener recent`, `SDK listener receiving taps`, and
    `SDK alarm rows fresh` only when recent `EN_HCNETSDK_ALARM` rows exist.
  - When no recent SDK row exists, the page shows SDK idle/not-recent wording
    instead of implying the physical tap path is live.
- Validation:
  - `npm test -- --grep "Hikvision biometric sync contract"` passed in
    `hris-api`.
  - `npm test -- app/lib/device-events-page-contract.test.ts` passed in
    `hris-app`.
  - Headless browser proof showed the localhost page contains
    `SDK listener recent`, `SDK listener receiving taps`, and no old
    `Saved rows live` / `Saved rows update live` wording.
- Evidence:
  - `.runtime/hikvision-hot-reload-daemon-20260709-213948/`
  - `.runtime/hikvision-hot-reload-service-20260709-214733/`


## Latest Task Addendum - 2026-07-09 Hikvision Credential Repair Success

- Task mode: Mixed credential repair, local hot-reload proof, VM SDK proof,
  and evidence.
- User supplied a new Digest Auth credential for `admin` on the live Hikvision
  terminal at `192.168.254.189`.
- Host direct credential proof:
  - `GET http://192.168.254.189:80/ISAPI/Security/userCheck` with Digest Auth
    returned HTTP `200`, `statusValue=200`, and `statusString=OK`.
- VM/PROD runtime repair:
  - Updated PROD `Main Entrance Device` `Device.access` in VM Postgres with
    username `admin` and a redacted 16-character password.
  - VM-backed `GET /api/device/:id/health` now reports network `reachable`,
    device API `online`, and reads terminal time from `192.168.254.189`.
  - Current PROD `sync-preview` still reports event-total unavailable
    (`code 1073741828`), which is now separate from credential auth because
    device health succeeds.
- Local hot-reload repair:
  - Local hot-reload API/app were already running at `localhost:3001` and
    `localhost:5175`.
  - Local API points at VM DEV Postgres on `10.184.37.241:15433`, so the DEV
    `Main Entrance Device` row was updated to `192.168.254.189:80`, protocol
    `http`, model `DS-K1T341CMFW`, SDK port `8000`, source
    `vendor/hikvision-linux`, callback path `/api/hikvision/callback`, and the
    same redacted credential.
  - Local `GET /api/device/:id/health` now reports `online`.
  - Local `GET /api/device/sync-preview?deviceId=cmpxw13hx002h7zwso7dyedrn`
    now reports `vendorEventCount=1518`, `vendorUserCount=7`,
    `canStartSync=true`, and `status=needs_sync`.
  - Local Playwright proof opened
    `http://localhost:5175/admin/configuration/devices/events?view=saved&deviceId=cmpxw13hx002h7zwso7dyedrn&source=EN_HCNETSDK_ALARM`
    and rendered the saved-events page with `Main Entrance Device`,
    `Ernst tey Malasa`, live-row text, and the updated configured address.
- VM HCNetSDK proof:
  - Current `vendor/hikvision-linux/hikvision_biometric_service.cpp` built and
    ran from the VM against `192.168.254.189:8000`.
  - SDK init succeeded, callback registration succeeded, SDK login succeeded
    with `lastError=0`, and alarm arm succeeded with `lastError=0`.
  - The listener received live ACS/fingerprint events, posted them to
    `/api/hikvision/callback`, and HRIS persisted 74 recent
    `EN_HCNETSDK_ALARM` rows for `Main Entrance Device`.
  - Recent saved rows include fingerprint pass events for `employeeNo=1`; they
    currently persist as `UNMATCHED` where employee mapping is not resolved in
    the PROD data.
- Evidence:
  - `.runtime/hikvision-credential-local-hotreload-20260709-210645/`
- Remaining boundary:
  - Credential auth and real SDK event delivery are no longer blocked.
  - Remaining work is product/data follow-up: reconcile employee/device-user
    mapping and classify why PROD sync-preview event-total still reports
    `code 1073741828` while health and SDK listener succeed.


## Latest Task Addendum - 2026-07-09 Hyper-V Default Switch Route Repair

- Task mode: Mixed VM route repair, credential boundary, SDK proof, and
  evidence.
- User goal:
  - Continue local Hyper-V plus Hikvision repair with Project Truth runtime
    inside `project-truth-local-vhdx-proof`, Docker inside the VM, and no new
    Hyper-V switch unless `Default Switch` is disproven.
  - First repair boot-time route drift, then repair live Hikvision credentials
    for `Main Entrance Device` at `192.168.254.189`, then rerun HRIS and SDK
    proof.
- Runtime result:
  - VM remains attached to `Default Switch`.
  - VM host-access IP remains `10.184.37.241/24`.
  - Boot-time LAN owner config was changed from stale static
    `172.31.99.250/23` plus default route `172.31.98.1` to
    `/etc/project-truth/lan.env` DHCP mode with pinned
    `PROJECT_TRUTH_LAN_DHCP_ADDRESSES=10.184.37.241/24`.
  - After reboot, netplan kept `dhcp4: true` plus `10.184.37.241/24`, the VM
    received `Default Switch` DHCP/NAT address `172.26.59.137/20`, defaulted
    through `172.26.48.1`, and reached `192.168.254.189:80` and `:8000`.
  - Stale failed `project-truth-hikvision-route.service` was disabled. The
    normal `project-truth-ansible-pull.timer` was re-enabled.
- HRIS/API proof:
  - `http://10.184.37.241:3001/health` returned healthy after reboot.
  - Admin login to the VM-backed API succeeded.
  - `/api/device/:id/health` for `Main Entrance Device` reported network
    `reachable` and device API `Unauthorized`.
  - `/api/device/sync-preview?deviceId=cmqq3ho8c002eti3dzzk94z1w` returned
    `source_unavailable` with error `Unauthorized`.
- Credential boundary:
  - The runtime `Device.access` source has username `admin` and a present
    9-character password, but direct digest auth to
    `http://192.168.254.189/ISAPI/System/time?format=json` returned HTTP `401`
    and the device reported `lockStatus=lock`.
  - Redacted credential-source search found no alternate documented runtime
    credential. Historical `AlarmDemo.config` matches the current 9-character
    credential hash; other hits are examples, tests, or placeholders.
- SDK proof:
  - Current `vendor/hikvision-linux/hikvision_biometric_service.cpp` was copied
    to the VM and built against the Linux HCNetSDK under
    `~/project-truth-hcnetsdk/EN-HCNetSDKV6.1.9.48_build20230410_linux64`.
  - SDK init and callback registration succeeded.
  - SDK login to `192.168.254.189:8000` failed with HCNetSDK error `153` while
    the device was locked, so no alarm channel was armed.
- Evidence:
  - `.runtime/hikvision-route-credential-repair-20260709-204243/`
- Remaining boundary:
  - Real tap proof is still missing. Route drift is repaired; the active
    blocker is credential custody/rotation for the live Hikvision terminal.
    Continuing without a verified credential would mean guessing an unknown
    device secret and can prolong terminal lockout.


## Latest Task Addendum - 2026-07-09 Device UX And Employee Hard Delete

- Task mode: Mixed UI/UX hardening, admin destructive-action safety, API
  contract repair, and local evidence.
- User goal:
  - Verify and clarify Add/Edit Device, device list event journeys, Device
    events modals/details, and responsive behavior for a normal HRIS admin.
  - Keep the Device events model truth centered on `eventCategory` and
    `eventAction`, with `source` only as Runtime path/debug and `status` only
    as HRIS result.
  - Add an admin-only Employee hard delete dropdown journey that previews
    relation blockers before any destructive execute path can run.
- UI result:
  - Add/Edit Device now groups adapter/callback fields under
    `Vendor and runtime routing`, while retaining `Runtime adapter`,
    `Internal adapter key`, and `Callback path` as intended terms with clearer
    helper copy.
  - Device events copy no longer presents browser socket connectivity as SDK
    tap truth. The page uses clearer labels such as
    `Browser connected; no recent SDK tap`,
    `No saved device event has arrived in this view yet`,
    `No recent SDK tap saved`, `Any event category`, and `Any event action`.
  - Employee admin rows expose `Preview hard delete` only for admin
    configuration users. The modal shows blocker, delete, detach, and archive
    counts, relation details, typed confirmation only when safe, and specific
    toasts.
- API result:
  - Added `POST /api/employee/:id/hard-delete-preview`.
  - Preview mode is non-mutating and returns the exact blocker/delete/detach
    plan.
  - Execute mode requires an admin actor, a safe preview with no blockers, and
    typed `DELETE <employeeId>` confirmation. Device events/users and audit
    references are detached rather than deleted; legal/payroll/attendance/time
    history blockers stop hard delete.
- Validation:
  - `hris-app` focused tests passed:
    `npm test -- app/lib/device-events-page-contract.test.ts app/lib/employee-hard-delete-ui-contract.test.ts app/services/employees.service.test.ts`.
  - `hris-api` focused direct Mocha tests passed:
    `npx tsx node_modules/mocha/bin/mocha --no-config tests/employee-hard-delete.contract.spec.ts tests/device-events-api-contract.spec.ts tests/device-event-taxonomy.helper.spec.ts`.
  - `hris-api npm run typecheck` passed.
  - `hris-app npm run typecheck:test` still fails only on the pre-existing
    `TimesheetsTab.test.tsx` React Query mock typing issue already tracked as
    `REC-20260706-TEST-TYPECHECK-MOCKS`.
  - Real local API dry-run as `admin@bandai.local` returned HTTP 200 with
    `blockerCount=2`, `deleteCount=2`, `detachCount=13`, and
    `archiveCount=0`; no execute call was made against live employee data.
  - Headless Playwright verified admin login, Add Device desktop/narrow,
    Edit Device from list, device list `View all events`, row
    `View Device Events`, Device events page desktop/narrow, Sync logs modal,
    Listener modal, event details modal, and employee hard-delete preview
    blocker modal.
- Evidence:
  - `.runtime/device-ui-ux-employee-delete-20260709-231712/`
  - API dry-run:
    `.runtime/device-ui-ux-employee-delete-20260709-231712/employee-hard-delete-preview-dry-run.json`
  - Browser proof:
    `.runtime/device-ui-ux-employee-delete-20260709-231712/playwright-verification.json`
    and screenshots under
    `.runtime/device-ui-ux-employee-delete-20260709-231712/screenshots/`


## Latest Task Addendum - 2026-07-09 Hikvision Listener Admin Control

- Task mode: Mixed UI/UX hardening, local runtime control, and operator
  evidence.
- User goal:
  - The Device attendance page should show the real VM listener heartbeat, not
    only recent tap evidence.
  - Admin should have a clean control journey to check, start/stop, and restart
    the local VM hot-reload Hikvision listener if it stops.
- Backend result:
  - Added admin-only fixed endpoints:
    `GET /api/device/hikvision/listener` and
    `POST /api/device/hikvision/listener`.
  - The API controls only the fixed VM systemd service
    `project-truth-hikvision-hot-reload-listener.service` over SSH to
    `10.184.37.241`; allowed actions are `start`, `stop`, and `restart`.
  - The implementation uses `execFile` with fixed arguments and an action
    allowlist, not arbitrary shell command input.
- UI result:
  - The header separates saved-row proof from VM listener heartbeat:
    `SDK listener recent` / `VM listener running`.
  - The status strip now treats a running VM service as healthy heartbeat and
    uses `Waiting for next tap` when no fresh tap has arrived yet.
  - Added a `Hikvision listener` modal with service status, enabled toggle,
    non-mutating `Check status`, restart action, runtime target, and recent
    listener log tail.
  - The shared modal component now wires its visible title into
    `aria-labelledby` and description into `aria-describedby`.
- Validation:
  - `npm test -- app/lib/device-events-page-contract.test.ts` passed in
    `hris-app`.
  - `npm test -- --grep "Hikvision biometric sync contract"` passed in
    `hris-api`.
  - Playwright proof logged in locally, opened the listener modal, refreshed
    status, closed/reopened, closed with Escape, and captured screenshots.
  - Admin API restart proof restarted the VM service from PID `129398` to
    `192455`, then returned `active/running`; SDK init/login/alarm arm and
    callback posts were `ok=true`.
- Evidence:
  - `.runtime/hikvision-listener-modal-playwright-20260709-221455/`
  - `.runtime/hikvision-listener-api-restart-20260709-221703/`


## Latest Task Addendum - 2026-07-09 Hikvision Live Listener Execute Default

- Task mode: Bug fix / operator workflow repair for local hot-reload tap
  debugging.
- User goal:
  - Live taps should save into the hot-reload HRIS path by default instead of
    silently running preview-only.
- Change:
  - `vendor/hikvision-linux/hikvision_biometric_service.cpp` now defaults
    `execute_mode` to `true`.
  - `--execute` remains accepted and idempotent.
  - New `--dry-run` flag restores preview-only behavior when intentionally
    needed.
  - `vendor/hikvision-linux/README.md` now documents execute as the live
    listener default.
- Validation:
  - Focused contract test passed:
    `npm test -- --grep "Hikvision biometric sync contract"` in `hris-api`.
  - The VM copy under
    `/tmp/project-truth-hikvision-live-20260709-credential-repair/vendor-hikvision-linux`
    was rebuilt.
  - Default-mode smoke ran without `--execute`, reported `mode=execute`,
    `sdk_alarm_arm ok true`, posted callback results with `ok=true`, and
    cleaned up the alarm channel.
- Evidence:
  - `.runtime/hikvision-default-execute-smoke-20260709-213551/`


## Latest Task Addendum - 2026-07-09 Hikvision Biometric Sync Architecture

- Task mode: Docs-only architecture intake with code-discovery evidence.
- Latest user request:
  - Document the Hikvision Linux HCNetSDK alarm-callback biometric sync
    architecture in WWG.
  - Use the existing Windows HCNetSDK reference under
    `C:\Users\anoni\OneDrive\Desktop\HRIS-PROJECT\EN-HCNetSDKV6.1.9.4_build20220412_win64`
    as behavior evidence.
  - Make the future Linux runtime copy/refactor the callback/user/fingerprint
    sync behavior without preserving demo names such as `AlarmDemo`.
- Current-state finding:
  - The Windows reference `AlarmDemo.cpp` includes multi-device SDK login,
    `NET_DVR_SetDVRMessageCallBack_V51`, alarm arming, ACS event
    classification, user sync, fingerprint read/write, broker enrollment,
    queued employee sync, and event-triggered reconcile.
  - The Project Truth Linux scaffold already has a bounded
    `hcnetsdk_alarm_probe.cpp`, but Linux SDK login/alarm callback remains
    unproven from the VM because the earlier SDK login returned
    `NET_DVR_PASSWORD_ERROR (1)`.
- Documentation result:
  - Added `.wwg/wiki/05-architecture/hikvision-biometric-sync-architecture.md`
    as target architecture.
  - Synced Project Truth, Project Truth Summary, terminology, runtime truth,
    and recommendation registry with the target architecture and boundaries.
- Boundaries:
  - Raw fingerprint template storage in normal `User` records is not approved
    without encryption, access-control, and retention design.
  - Device writes/deletes and template propagation require dry-run, audit,
    backup/recovery, and rollback evidence before production use.
  - The running VM-managed Cloudflare Tunnel must remain active during future
    VM/GitOps/runtime proof.


## Latest Task Addendum - 2026-07-09 Real Endpoint Dry-Run Pattern

- User standardized the preferred investigation pattern: authenticate as the
  correct local actor, call the exact endpoint used by the page in dry-run or
  preview mode, time it with `Measure-Command`, and capture full JSON/API
  evidence before browser/UI diagnosis.
- `AGENTS.md` now records this as the Project Truth Real Endpoint Dry-Run Rule.
- `.wwg/governance/drift-guard.md` now enforces direct API/network endpoint
  proof before screenshots or code guessing, with `.runtime/<task-stamp>/`
  evidence capture.
- Browser verification remains Playwright-first for the current local
  environment, but browser proof follows endpoint proof for runtime regressions.


## Latest Task Addendum - 2026-07-09

- Task mode: Mixed governance update, runtime schema repair, and admin UI regression repair.
- Latest user request:
  - Prefer headless Playwright over Vercel `agent-browser` for current Project Truth browser verification because `agent-browser` is unreliable on this Windows host.
  - Use dry-run/API evidence against the actual page endpoint before guessing from the UI.
  - Repair `/admin/configuration/devices/events?view=saved&action=sync-logs` so the Sync device logs modal can find configured sync-capable devices.
- Local evidence:
  - Direct API proof hit the real frontend endpoint `GET http://localhost:3001/api/device/sync-preview`.
  - Initial API proof failed with HTTP 500 because local DEV Postgres was missing `public.device_sync_runs`.
  - Full `npm run prisma-postgres:push` was not applied because Prisma warned it would drop populated `benefit_types.sourceCode`, `sourceFrequency`, and `sourceSchedule` columns.
  - A narrow create-only SQL repair created `DeviceSyncRunType`, `DeviceSyncRunStatus`, `device_sync_runs`, its foreign key, and indexes without dropping data. Evidence: `.runtime/device-sync-preview-20260709-080841-db-repair/db-repair-output-split.json`.
  - After repair, `GET /api/device/sync-preview` returned HTTP 200 in about `0.075s` with one `Main Entrance Device` row. Evidence: `.runtime/device-sync-preview-20260709-080841/api-sync-preview-evidence.json`.
  - Headless Playwright against `http://localhost:5175/admin/configuration/devices/events?view=saved&action=sync-logs` captured one preview row, no "No sync-capable devices", and no "No device preview rows returned". Evidence: `.runtime/device-sync-preview-20260709-081043-playwright/playwright-sync-logs-evidence.json` and `.runtime/device-sync-preview-20260709-081043-playwright/sync-logs-modal.png`.
- Code/test result:
  - The sync preview path now tolerates a missing `device_sync_runs` table by continuing without latest skipped-run counts instead of blanking/failing the modal.
  - Focused backend regression passed: `npm test -- --grep "sync preview"`.
  - Focused Playwright smoke passed: `npx playwright test -c playwright.smoke.config.ts tests/smoke/admin-device-events-sync-modal.spec.ts`.
- Remaining drift:
  - Hikvision source-count and SDK proof must be rerun against the current
    `Main Entrance Device` row `10.184.37.139:80` with SDK port `8000` from
    device config. Older `10.184.38.x` Hikvision targets are historical only.
  - GitOps/K3s/public DEV promotion remains open before treating this local fix as production runtime proof.


## Latest Task Addendum - 2026-07-09 Hikvision Real-Tap Pipeline Continuation

- Task mode: Mixed runtime proof, credential boundary, callback/realtime
  simulation, tests, and evidence.
- User goal:
  - Continue the previously blocked real physical Hikvision tap pipeline now
    that host-test VM `10.184.37.241` can reach `10.184.37.139`.
  - Prove the path from Linux HCNetSDK alarm callback through
    `/api/hikvision/callback`, `DeviceEvent`, socket emit, and local saved-events
    UI when real tap evidence is available.
- Current-state result:
  - Local API dry-run proof passed. `http://localhost:3001/health` was healthy,
    admin login succeeded, `/api/hikvision/callback?preview=true` matched
    `Main Entrance Device` id `cmpxw13hx002h7zwso7dyedrn` at
    `10.184.37.139:80`, used source `EN_HCNETSDK_ALARM`, and saved zero rows
    for the preview marker.
  - Host-test VM `10.184.37.241` reached the Hikvision physical device:
    `ping 10.184.37.139` passed with 0% loss, TCP `80` passed, and TCP `8000`
    passed.
  - Docker is running on the host-test VM; PROD/DEV/UAT app/API containers are
    present. A stale existing `hris-hikvision-watcher` process was observed
    using old `10.184.38.215`, so it is drift and not current device proof.
  - Current local `vendor/hikvision-linux` source was copied to a task-scoped
    VM temp folder and built with
    `vendor/hikvision-linux/scripts/build-hikvision-biometric-service.sh`
    against Linux HCNetSDK.
  - Bounded SDK run proved `NET_DVR_Init` and
    `NET_DVR_SetDVRMessageCallBack_V51`; `NET_DVR_Login_V40` failed with
    HCNetSDK error `1` because no real Hikvision device credential pair was
    available from documented local config, VM env, Docker env, Kubernetes env,
    or previous evidence searched in this pass. `NET_DVR_SetupAlarmChan_V50`
    could not be reached without login.
- Simulation evidence, explicitly not real-tap proof:
  - Non-production SDK-shaped callback saved `DeviceEvent`
    `cmrd1gb4900347zk0v59jp7e6`, returned through the saved-events API, and
    emitted one `device-event:saved` socket payload.
  - Browser proof opened
    `http://localhost:5175/admin/configuration/devices/events?deviceId=cmpxw13hx002h7zwso7dyedrn&source=EN_HCNETSDK_ALARM`
    first, waited for "Saved rows update live", then a simulated callback made
    marker `CODEX-UI-LIVE-HCNETSDK-READY-1783573373427` appear with
    "Socket received" and no manual refresh.
- Evidence directory:
  - `.runtime/hikvision-real-tap-pipeline-20260709-125441/`
- Validation:
  - `python -m unittest vendor.hikvision-linux.tests.test_probe` passed
    11 tests.
  - `npm test -- --grep "Hikvision callback controller|Hikvision biometric sync contract|device event realtime helper"`
    in `hris-api` passed 7 tests.
  - `npm run typecheck` in `hris-api` passed.
  - `npm test -- app/lib/device-events-realtime-ui.test.ts` in `hris-app`
    passed 16 tests.
- Remaining boundary:
  - Real physical tap proof is still missing. The current blocker is not
    host-test VM reachability; it is absence of a documented real Hikvision
    credential source for SDK login/alarm arm. Once credentials are supplied,
    rerun the service, prove `NET_DVR_Login_V40`,
    `NET_DVR_SetupAlarmChan_V50`, capture real JSONL callback output, and then
    verify real saved row, attendance/timesheet projection where applicable,
    socket emit, and browser live-row update.


## Latest Task Addendum - 2026-07-09 Hikvision HCNetSDK Single Source

- Task mode: Mixed runtime path repair, API contract, tests, and evidence.
- User goal:
  - Make the Linux HCNetSDK path the clean single source of truth for live
    Hikvision tap events.
  - Keep HRIS `Device` row truth at `Main Entrance Device`,
    `10.184.37.139:80`, protocol `http`, model `DS-K1T341CMFW`, SDK port
    `8000`.
- Implementation result:
  - `vendor/hikvision-linux/hikvision_biometric_service.cpp` is now the only
    active C++ HCNetSDK runtime source.
  - Removed the old active `hcnetsdk_alarm_probe` build path and replaced it
    with `scripts/build-hikvision-biometric-service.sh`.
  - SDK callback work stays minimal: parse ACS alarm, emit JSONL evidence,
    queue HRIS callback posting, and queue biometric reconcile only for
    user/fingerprint management events.
  - Worker posts SDK alarm events to `/api/hikvision/callback` with source
    `EN_HCNETSDK_ALARM`, so existing callback logic owns `DeviceEvent`
    persistence, attendance/timesheet projection, cache invalidation, and
    `device-event:saved` socket emission.
  - Added `/api/hikvision/callback?preview=true` / `dryRun=true` as a
    non-mutating proof path before persistence.
  - DEV seed defaults and Hikvision tests now use `10.184.37.139` instead of
    stale Hikvision addresses.
- Evidence:
  - Endpoint/API proof:
    `.runtime/hikvision-hcnetsdk-single-source-20260709-100621/local-api-callback-preview-proof-after-restart.json`.
    Admin login passed, callback preview matched `Main Entrance Device`,
    no preview row was saved, and biometric reconcile dry-run returned planned
    changes with `rawFingerprintTemplateStored=false`.
  - Accidental stale-API preview row cleanup:
    `.runtime/hikvision-hcnetsdk-single-source-20260709-100621/accidental-preview-row-cleanup.json`
    deleted only `employeeNo=CODEX-PREVIEW` row
    `cmrcvgud903247zb8zk9bt6e4` after the stale API saved it before restart.
  - Network/runtime proof:
    `.runtime/hikvision-hcnetsdk-single-source-20260709-100621/network-runtime-owner-proof.json`
    and `vm-network-cloudflared-proof-clean.json`.
    Windows host reached `10.184.37.139:80` and `:8000`; direct VM at
    `10.184.37.19` failed both with `No route to host`.
  - SDK/build proof:
    `.runtime/hikvision-hcnetsdk-single-source-20260709-100621/vm-hikvision-biometric-service-build-proof-after-fix.json`
    compiled and linked `hikvision-biometric-service` against VM
    `libhcnetsdk.so`.
    `.runtime/hikvision-hcnetsdk-single-source-20260709-100621/vm-hikvision-biometric-service-bounded-run.json`
    proved `NET_DVR_Init` and callback registration, then `NET_DVR_Login_V40`
    failed with SDK error `7` before arm because the VM cannot route to the
    device.
  - Host-local Linux owner check:
    `.runtime/hikvision-hcnetsdk-single-source-20260709-100621/wsl-runtime-owner-proof.json`
    found only `docker-desktop` WSL and no usable bash userland; Docker Linux
    engine was not running.
- Validation:
  - `python -m unittest vendor.hikvision-linux.tests.test_probe` passed.
  - `npm test -- --grep "Hikvision callback controller|Hikvision biometric sync contract|Hikvision device seed defaults|Hikvision endpoint config|device event realtime helper|DEV Hikvision watcher runtime manifest"` passed.
  - `npm run typecheck` in `hris-api` passed.
  - `npm test -- app/lib/device-events-realtime-ui.test.ts` in `hris-app`
    passed.
- Remaining boundary:
  - Real SDK login, alarm arm, physical tap callback, saved row existence,
    socket delivery to `localhost:5175`, and browser live-row proof remain
    unproven until either VM-to-device routing is repaired or a real
    host-local Linux runtime with device reachability is prepared and supplied
    valid Hikvision credentials.


## Latest Task Addendum - 2026-07-09 Hikvision Device Row Drift Correction

- User clarified current Hikvision config truth from the admin UI:
  `Main Entrance Device`, `Hikvision` / `DS-K1T341CMFW`, address
  `10.184.37.139`, HTTP port `80`, protocol `HTTP`.
- Drift correction:
  - Hikvision Linux probe defaults, README examples, and discovery wrapper now
    use `10.184.37.139` instead of historical `192.168.254.181` /
    `10.184.38.215` candidates.
  - The discovery wrapper now uses direct LAN SSH `10.184.37.19` with
    `node-health-appliance_ed25519` and no longer defaults Hikvision username
    to HRIS `admin@bandai.local`.
  - Historical `.234/.235` references are ZKTeco evidence, not Hikvision
    config truth, and must not be copied into the Hikvision runtime path.


## Latest Task Addendum - 2026-07-06

- Task mode: Mixed meaningful feature, persistence, admin UX, and local runtime verification.
- Latest user request:
  - Add Device Users as a clear row dropdown destination from `/admin/configuration/devices`.
  - Replace immediate user sync with a review-first flow and a final `Sync device users` confirmation inside the modal.
  - Keep the flow visually consistent with the existing Sync Logs modal while using distinct terminology so admins do not confuse identity records with attendance logs.
- Local decision:
  - `DeviceUser` is the durable device identity/enrollment record.
  - `EmployeeDeviceEnrollment` was avoided because current evidence supports direct optional `DeviceUser.employeeId` plus status/source metadata.
  - `Sync device users` and `Sync logs` remain separate admin actions.
  - Biometric template transfer was not implemented because safe vendor read/write plus backup/restore capability was not proven.
- Local evidence:
  - API and frontend hot reload used `localhost:3001` and `localhost:5175`.
  - Physical Hikvision `UserInfo/Search` sync created 6 physical-source `DeviceUser` rows; 4 were auto-linked and 2 remained `UNMATCHED`.
  - Legacy backfill from `Employee.deviceEmpId` created 2,213 additional rows, leaving 2,219 total `DeviceUser` rows and 2,217 linked rows.
  - Hikvision log sync processed 982 source rows, saved 376, classified 606 as known skipped, failed 0, and left 0 truly missing.
  - Browser proof exists at `.runtime/browser-evidence/screenshots/device-users-review-sync-modal.png` and `.runtime/browser-evidence/device-users-review-sync-evidence.json`.
- Remaining drift:
  - Promote and verify the implementation through VM/GitOps/public DEV before calling it production runtime truth.


# Current Task



## Follow-Up Needed

- Decide whether VM-managed Cloudflare should become the canonical fresh-import path; this requires an explicit secure credential handoff procedure and must not bake credentials into images.
- Define the retained-client-VHDX artifact flow: host export/copy remains the
  reliable Hyper-V artifact, and any in-VM copy should be secondary evidence or
  staging only unless proven bootable/importable from Windows Hyper-V.
- Decide whether the internal `ProjectTruth-HostTest-10-184-37` switch should
  remain the standard local VHDX validation path when the Wi-Fi-backed
  `ProjectTruth-External` switch cannot route from the Windows host to the
  guest's static `10.184.37.x` addresses.
- Repair or classify the DEV `400 action metrics` console warning if future
  Playwright gates require zero console errors for DEV HR manager dashboard
  login. The dashboard renders and the warning is already documented as
  non-blocking in V6 evidence, but the strict smoke assertion still fails.
- Fix observability backup source/retention before re-enabling backup and
  replicator containers; the current backup loop generated about `161G` of
  rolling archives and logged stale `/data/grafana` archive errors.
- Keep Cloudflare Access SSH policy in the `933c5547e32839d664d155ce8a7424d5` Zero Trust account aligned with the allowed operator email.
- Replace shared Postgres superuser teammate URLs with limited per-environment
  database users before broadening DB Access TCP use beyond trusted operators.
- Enable and verify browser-rendered SSH for `https://ssh.bnpi-hris.tech` so
  remote admins can access the VM from unprepared browsers without configuring
  BNPI Windows host SSH or per-PC `.ssh/config`.
- Reconcile whether Docker Compose is the intended serving runtime for this V6
  appliance profile or tune K3s memory/capacity until Argo/K3s health matches
  the actually served HRIS app/API.
- Resolve existing WWG generated-report validation findings before release/commit claims that require a fully green WWG gate.


# Current Task


# Current Task


## Current Decision

- Current tunnel bootstrap ownership: host-managed on the Windows host.
- Current proof VM also has a VM-managed connector active after deliberate root-only credential import.
- Running-server Cloudflare access must remain active by default. Agents must
  not disable, stop, mask, remove, or toggle off `cloudflared-bnpi-hris.service`
  on the live VM, and must not add a default-local/cloud-mode guard, unless the
  user explicitly requests a time-bounded outage and a verified recovery path is
  already documented.
- Preferred BNPI remote-admin journey is VM-managed Cloudflare Tunnel plus
  browser-rendered SSH at `https://ssh.bnpi-hris.tech`; the BNPI Windows Server
  should remain Hyper-V-only with no inbound ports, no Windows SSH setup, and no
  `.ssh/config` dependency.
- Canonical startup/repair command:

```powershell
.\scripts\project-truth.ps1 ensure-bnpi-cloudflare-host -ProvisionDns -StartTunnel -VerifyPublic
```

- Fresh/final images must not contain Cloudflare tunnel credentials.
- TryCloudflare is disabled by default and remains only a deprecated manual proof tool.
- Public SSH through `ssh.bnpi-hris.tech` is verified through Cloudflare Access and the host-managed named tunnel.
- Public SSH through `ssh.bnpi-hris.tech` is also verified through the VM-side connector using `ssh://localhost:22`.
- Postgres Cloudflare Access TCP hostnames are configured as client-forwarding targets: `db.bnpi-hris.tech` for PROD, `dev-db.bnpi-hris.tech` for DEV, and `uat-db.bnpi-hris.tech` for UAT. These require client-side `cloudflared access tcp` and produce local DB URLs such as `postgresql://postgres:postgres@localhost:55432/hris`; they are not raw public Postgres URLs through normal Cloudflare Tunnel.
- Local `npm run dev` for HRIS API/app is configured to use the deployed DEV
  VM-backed Postgres through the Cloudflare Access TCP helper on
  `localhost:55433`; PROD and UAT helper URLs are documented beside it.
- Browser-rendered SSH is the desired clean journey for unprepared office or
  remote PCs; it still needs Cloudflare Access browser-rendering proof after the
  Zero Trust application setting is enabled.
- V6 packaging should preserve the V2 one-click extracted-zip shape: a small
  zip with a double-click `.cmd`, public bucket VHDX download, SHA-256
  verification, Hyper-V import/start, visible log window, and then V6 runtime
  proof. The Cloudflare tunnel credential must come from ProgramData at runtime,
  not from the zip, bucket image, repo, or baked VM.
- V7 is the current public package lane. It promotes the known clean V5 base
  image into `hyperv/v7/latest`, then keeps the V6 runtime proof/import path so
  the latest scripts, Cloudflare VM connector setup, and public checks run after
  import. The live proof VM disk was not published because it has contained
  root-only Cloudflare runtime credentials.
- A compact in-VM retained current-state VHDX now exists for the live proof VM
  after pruning development-stage observability rolling backups. It is retained
  evidence/staging only until Windows Hyper-V boot/import validation passes.
- Client/local VHDX retention is intentional: the host/client live VHDX may
  differ from the reusable public image and must not be overwritten or promoted
  by default. If a host-side or in-VM retained copy is needed, create it as a
  separate retained artifact with hash/manifest evidence, while keeping the
  clean public V7 package lane separate from any credential-bearing or
  client-specific disk.
- Current V6 proof serves public/LAN HRIS through healthy Docker Compose
  containers and VM-side Cloudflare. K3s/Argo still needs follow-up because many
  pods remain Pending/Evicted under memory pressure even when Argo Applications
  summarize as Synced/Healthy.
- 2026-07-01 incident correction: the current public HRIS path for PROD, UAT,
  and DEV is Docker Compose app/API containers behind the `bnpi-hris` named
  Cloudflare Tunnel. Do not treat K3s HRIS pods as the active public serving
  path until K3s/Argo is deliberately re-enabled and proven end-to-end.
- 2026-07-01 incident correction: K3s HRIS deployments/statefulsets are paused
  at zero replicas for DEV/UAT/PROD to avoid runtime contention while Docker
  Compose serves public HRIS. PVCs and data were not deleted.
- 2026-07-01 incident correction: public browser traffic must not call
  `https://*.bnpi-hris.tech:3001`. The working public pattern is same-origin
  `/api` through the app proxy/tunnel for app hostnames, with API hostnames
  available for direct health and API checks.


## Task Summary

- Task mode: Mixed docs/config/runtime drift repair after Existing Project Adoption
- Existing Project Adoption context:
  - This repo was adopted into WWG from existing code/docs/config.
  - Code/docs/config remain evidence of operational reality.
  - Inferred or stale adoption truth must stay labeled and reconciled instead of silently overwritten.
- User request:
  - Make the `bnpi-hris.tech` named Cloudflare Tunnel the first-class public path.
  - Remove normal TryCloudflare usage from Project Truth, VM login, SSH login, visual proof, image/bootstrap, and WWG truth surfaces.
  - Clarify whether SSH can be accessed through the domain.
  - Clarify how fresh/final images work on another device.


## Validation Notes

- LAN SSH and LAN HRIS endpoints passed.
- Public app/API/dev/uat/Grafana checks passed after connector warmup.
- CORS preflight returned HTTP 204.
- Wrong-password auth probe returned HTTP 401.
- `ssh.bnpi-hris.tech` DNS route and tunnel ingress were provisioned; LAN SSH passed; after Cloudflare Access policy allowed `1bis.solutions.tech@gmail.com`, SSH through `cloudflared access ssh --hostname %h` returned `SSH_ACCESS_OK`.
- On 2026-06-29, the named tunnel credential was imported into the proof VM as root-only runtime state, `cloudflared-bnpi-hris.service` was enabled and active, `cloudflared tunnel info bnpi-hris` showed a `linux_amd64` connector, and SSH through `ssh.bnpi-hris.tech` returned `SSH_DOMAIN_OK`.
- On 2026-07-03, live VM banner evidence after `sudo project-truth-ansible-pull`
  reported `Cloudflare named tunnel mode: VM-managed active`, public HRIS/API,
  Grafana, SSH browser, and `ssh project-truth-hris` targets, plus `OS pull
  last: develop@75e7c1d845df` and sync time `2026-07-03T04:40:53Z`.
- On 2026-06-30, V6 one-shot proof passed LAN PROD/DEV/UAT app/API health,
  public PROD/DEV/UAT app/API/Grafana health, public CORS, VM-side Cloudflare
  ingress validation, and CLI SSH through `ssh.bnpi-hris.tech`.
- On 2026-06-30, a V2-style V6 one-click zip was generated and uploaded as a
  tiny package under `hyperv/v6/latest`; public URL checks returned HTTP 200 for
  the zip, installer script, README, and manifest. The package contains no VHDX
  and no Cloudflare credential.
- On 2026-06-30, V7 was published under `hyperv/v7/latest`: GCS metadata showed
  the VHDX at `75635884032` bytes, all V7 sidecar and installer URLs returned
  HTTP 200, the downloaded public V7 zip matched SHA-256
  `4534136199EEBA85FFAFBF08C8EAFEEDA1BBC784D9F4D3A269F30D9F95D75088`, and a
  V7 installer dry run targeted the V7 VHDX/manifest paths while preserving the
  runtime-only Cloudflare credential import.
- On 2026-07-01, PROD and UAT app containers were recreated from
  `hris-app-local:develop` image
  `sha256:fa41efd235cbb372b7b9c2cd631081d8f7a6738af464b7ca67a0dcf47cdd83c5`.
  Browser verification for `https://bnpi-hris.tech/` loaded the HR login screen,
  requested `https://bnpi-hris.tech/api/system-provisioning/status` with HTTP
  200, and showed no public `:3001` browser request.
- On 2026-07-01, DEV Docker Compose API/app containers were restored without
  rebuilding or touching the DEV Postgres volume. VM origin checks passed:
  `http://localhost:3100/auth/login` HTTP 200,
  `http://localhost:3100/api/auth/me` HTTP 401, and
  `http://localhost:3101/health` HTTP 200. Browser verification for
  `https://dev.bnpi-hris.tech/` loaded the HR login screen, requested
  `https://dev.bnpi-hris.tech/api/system-provisioning/status` with HTTP 200,
  and showed no public `:3001` browser request.
- Earlier on 2026-07-02, `10.184.38.138` no longer answered SSH or HRIS port
  probes from the Windows host. The VM was temporarily reached through DHCP
  transient address `10.184.38.144`, and host-managed `cloudflared-bnpi-hris.yml` was
  temporarily corrected to that DHCP address. This was superseded by stable
  secondary address `10.184.37.19`.
- Public verification from the client LAN is currently blocked by network
  policy: plain HTTP returns a company-policy block page and HTTPS resets
  during TLS for `bnpi-hris.tech` hostnames, while general Cloudflare/Google
  HTTPS works.
- On 2026-07-03, after the LAN config drift follow-up, the VM was hard-cut over to
  pure static LAN addressing on `eth0`. The accepted canonical runtime target is
  now `10.184.37.19/24`; `10.184.37.78/24` is retained as a secondary transition
  address/TLS SAN. DHCP is disabled, the default route is static via
  `10.184.38.254`, and read-only VM probes proved ping, SSH, and PROD/DEV/UAT
  API health on `10.184.37.19`.
- On 2026-07-03, Postgres Access TCP DNS routes for `db.bnpi-hris.tech`,
  `dev-db.bnpi-hris.tech`, and `uat-db.bnpi-hris.tech` were provisioned to the
  named tunnel and resolved to Cloudflare A records. The host-managed connector
  was started with DB TCP ingress, and the live VM-side `/etc/cloudflared/config.yml`
  was updated with matching DB TCP ingress while preserving existing SSH routes.
  A client-side `cloudflared access tcp --hostname db.bnpi-hris.tech --url localhost:55432`
  smoke test opened the local listener but Postgres protocol probing failed with
  `websocket: bad handshake`, and a read-only Access API list returned HTTP 403.
  Treat DNS/tunnel ingress as applied, but teammate DB access is not fully
  verified until Cloudflare Access applications/policies are created for the DB
  hostnames.
- Later on 2026-07-03, after Access browser success and token return, real
  Postgres query proof passed through Cloudflare Access TCP for all three DB
  hostnames using a temporary Node `pg` probe under `.runtime/pg-probe`:
  `db.bnpi-hris.tech` via local `56532`, `dev-db.bnpi-hris.tech` via local
  `56533`, and `uat-db.bnpi-hris.tech` via local `56534` each returned
  `current_database=hris`, `current_user=postgres`, server port `5432`, and
  `public_tables=70`. The wrapper command timed out during cleanup, but no
  temporary test forwards remained afterward; only the intentional PROD helper
  forward on `localhost:55432` remained active.
- Later on 2026-07-03, local dev verification kept the stable DB helper
  forwards active on PROD `localhost:55432`, DEV `localhost:55433`, and UAT
  `localhost:55434`. `hris-api/.env` defaulted `npm run dev` to the DEV forward
  on `localhost:55433`, `http://localhost:3001/health` returned HTTP 200, direct
  API login for `admin@bandai.local` returned HTTP 200, and Playwright login
  through the local app at `http://localhost:5175/auth/login` reached
  `http://localhost:5175/admin/dashboard`. DEV DB snapshot and UI counts
  matched: `users=2039`, `employees=2217`, `departments=12`. Evidence:
  `.runtime/local-dev/20260703-verify/db-snapshot-dev-active.json`,
  `.runtime/local-dev/20260703-verify/api-auth-login-proof.json`, and
  `.runtime/local-dev/20260703-verify/browser/playwright-login-proof.json`.
- Later on 2026-07-03, development-stage observability rolling backups were
  hard-deleted as approved: `/srv/hris/observability/backups/rolling` dropped
  from about `161G` to zero files, `/srv/hris/observability/backups` was about
  `28K`, and `/srv/hris/observability` was about `8.2G`. Backup and replicator
  containers were intentionally left stopped to prevent immediate archive
  regeneration.
- Later on 2026-07-03, a compact retained current-state VHDX was built inside
  the VM after the prune. `qemu-img info` reported VHDX format, virtual size
  `500 GiB`, file length about `92.6 GiB`, and disk size about `83.2 GiB`;
  SHA-256 was
  `486378d08bb76cde3716f3f9d4a24fc02c15636b2e39e895b0c59fba1d8a9a1c`;
  `qemu-img check -f vhdx` reported no errors. Final local VM checks returned
  HTTP 200 for PROD/DEV/UAT app/API, Grafana, Prometheus, Loki, and Tempo.
- Later on 2026-07-03, the host-test copy of the retained current-state VHDX
  completed on the Windows host at
  `C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx`, with
  SHA-256
  `b1274ae7b50214b0888cd97aa43a79b0e901c19c4ebce1824923778a0a77a8aa`.
  Hyper-V `Get-VHD` read it as a dynamic VHDX with `500 GiB` virtual size,
  `88.32 GiB` file size, and `0` fragmentation. The
  `project-truth-local-vhdx-proof` VM started successfully from the image,
  Hyper-V Worker/Admin event `18601` reported that it successfully booted an
  operating system, heartbeat was OK, and KVP reported guest IPs
  `10.184.37.78` and `10.184.37.19`. Direct Windows host probes to SSH and
  HRIS ports still failed because the current `ProjectTruth-External`
  host/vSwitch path is on `192.168.254.149/24` and did not route to the guest's
  static `10.184.37.x` addresses, even after a temporary additive host
  `10.184.37.250/24` test address.
- The host-tested VHDX became fully reachable after moving
  `project-truth-local-vhdx-proof` to internal switch
  `ProjectTruth-HostTest-10-184-37` and setting the Windows host-side vEthernet
  to `10.184.37.250/24` with `SkipAsSource=False`. SSH and PROD/DEV/UAT
  app/API ports passed on both `10.184.37.19` and `10.184.37.78`; HTTP probes
  returned `200` for PROD/DEV/UAT login and health URLs on `10.184.37.19`;
  SSH to `infra@10.184.37.19` returned hostname `project-truth-node`; and
  Docker showed healthy PROD/DEV/UAT app/API containers.
- Playwright VM login smoke against `PROJECT_TRUTH_GUEST_IP=10.184.37.19`
  passed for PROD and UAT. DEV reached the dashboard and captured screenshots,
  but the strict console-health assertion failed on the already-known
  non-blocking DEV `400 action metrics` warning: `Employee context is required
  for action metrics`. Screenshot evidence was captured under
  `.runtime/browser-evidence/screenshots/host-test-vhdx/`.
- `git diff --check` passed.
- `wwg test-check --format plain` passes after the stable `10.184.37.19`
  runtime/config drift repair because the Cloudflare config regression guard was
  updated with the active SSH origin.
- `wwg validate` passes after the stable LAN target drift repair.
- On 2026-07-09, the local HRIS device-event model was hard-cut over from
  attendance/source/status-led UI language to persisted `DeviceEvent`
  taxonomy fields: `eventCategory`, `eventAction`, `eventLabel`, and
  `eventConfidence`. A narrow SQL migration/backfill preserved all 96 existing
  `device_events` rows, created backup table
  `device_events_backup_20260709_225223`, and backfilled:
  `ATTENDANCE/TAP/PROVEN=32`, `ACCESS_CONTROL/UNKNOWN/UNKNOWN=62`, and
  `UNKNOWN_VENDOR/LISTENER_RECEIVED/UNKNOWN=2`. The admin route now presents
  `Device events`, category/action filters, `HRIS result`, and debug-only
  runtime path wording while retaining raw `source` and processing `status`
  compatibility fields. Evidence:
  `.runtime/device-event-model-hardcutover-20260709-225223/`.


## Evidence

- Runtime VM: `project-truth-local-vhdx-proof`
- Canonical Project Truth LAN/runtime IP: `10.184.37.19` (pure static)
- Retained secondary transition IP/TLS SAN: `10.184.37.78` (pure static)
- LAN SSH: `ssh -i %USERPROFILE%\.ssh\node-health-appliance_ed25519 infra@10.184.37.19`
- Named tunnel: `bnpi-hris`
- Named tunnel ID: `e3486f00-f974-46d3-9e11-911266749d00`
- Public verification artifact: `.runtime/cloudflare-drift-proof/20260629-220610/public-verification-final.json`
- VM text proof: `.runtime/cloudflare-drift-proof/20260629-220610/screen-overview.txt`, `.runtime/cloudflare-drift-proof/20260629-220610/screen-tunnels.txt`, `.runtime/cloudflare-drift-proof/20260629-220610/vm-text-surfaces.txt`
- Named tunnel wrapper evidence: `.runtime/cloudflare-named-tunnel/20260629-220627/bnpi-cloudflare-tunnel.json`
- Latest host readiness/provision evidence: `.runtime/cloudflare-host-readiness/20260629-223648/bnpi-cloudflare-host-readiness.json`
- Latest SSH DNS/ingress evidence: `.runtime/cloudflare-named-tunnel/20260629-223910/bnpi-cloudflare-tunnel.json`
- V2 packaging reference: `.runtime/gcp-v2-format/ProjectTruth-Install-HyperV-v2.cmd`,
  `.runtime/gcp-v2-format/ProjectTruth-Install-HyperV-v2.ps1`, and
  `.runtime/gcp-v2-format/README-v2.txt`
- Latest V6 one-shot proof:
  `.runtime/v6-one-shot/20260630-112256/v6-one-shot-result.json`
- V6 one-click zip artifact:
  `C:\ProgramData\ProjectTruth\exports\hyperv-v6\20260630-115040\project-truth-hyperv-one-click-installer-v6.zip`
- Published V6 tiny package path:
  `gs://project-truth-image-export-hris-492904-161377059311/public/project-truth/hyperv/v6/latest/project-truth-hyperv-one-click-installer-v6.zip`
- V7 one-click zip artifact:
  `C:\ProgramData\ProjectTruth\exports\hyperv-v7\20260630-161359\project-truth-hyperv-one-click-installer-v7.zip`
- Published V7 package path:
  `gs://project-truth-image-export-hris-492904-161377059311/public/project-truth/hyperv/v7/latest/project-truth-hyperv-one-click-installer-v7.zip`
- Published V7 VHDX path:
  `gs://project-truth-image-export-hris-492904-161377059311/public/project-truth/hyperv/v7/latest/project-truth-node-local-hyperv-v7-current-state.vhdx`
- Retained in-VM compact current-state VHDX:
  `/var/lib/project-truth/retained-vhdx/20260703-102324/project-truth-node-current-state-20260703-102324.vhdx`
- Retained current-state VHDX evidence:
  `.runtime/in-vm-vhdx-build/20260703-102324/current-state-vhdx-report.md`,
  `.runtime/in-vm-vhdx-build/20260703-102324/manifest.txt`,
  `.runtime/in-vm-vhdx-build/20260703-102324/project-truth-node-current-state-20260703-102324.vhdx.sha256`,
  `.runtime/in-vm-vhdx-build/20260703-102324/project-truth-node-current-state-20260703-102324.vhdx.qemu-img-info.json`,
  and
  `.runtime/in-vm-vhdx-build/20260703-102324/host-hyperv-boot-validation.md`
- 2026-07-01 public app restore evidence:
  `/var/lib/project-truth/backups/public-app-session-restore-20260701-061721`
- 2026-07-01 DEV public origin restore evidence:
  `/var/lib/project-truth/backups/dev-public-origin-restore-20260701-062006`
- Browser evidence screenshots:
  `.runtime/browser-evidence/screenshots/bnpi-public-after-restore.png`
  and `.runtime/browser-evidence/screenshots/dev-public-after-restore.png`


