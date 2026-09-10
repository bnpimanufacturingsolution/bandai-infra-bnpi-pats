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
