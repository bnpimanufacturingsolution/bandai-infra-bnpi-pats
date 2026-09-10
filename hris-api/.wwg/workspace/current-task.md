
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
