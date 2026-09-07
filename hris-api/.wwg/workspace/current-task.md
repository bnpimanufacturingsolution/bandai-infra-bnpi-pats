
## Latest Task Addendum - 2026-09-07: Section Line Leader assignment (option B)

- Shipped: SectionLineLeader M:N join + role derivation (hris-line-leader on membership, HR/manager precedence, auto re-derive on add/remove/section-delete), section CRUD lineLeaderIds reconcile, list/get lineLeaders include, employee hard-delete detach (headId + join rows).
- UI: /admin/configuration/sections Line Leaders chips + add select; table column; view row; CSV.
- Tests: section-line-leaders 15/15, role-derivation 55/55, section.controller 66/66, smoke 2/2; live round-trip incl. delete-demote re-proof; VM promoted (db-init Complete x3, table in DEV/UAT/PROD, Argo six apps Healthy, DEV :3101 serving lineLeaders).
- Known drift (pre-existing, not this work): employee-hard-delete.contract.spec.ts 4/4 static-source-string failures (strings never existed at base e5e51a43).
# Current Task

## Status
done

## Summary
Disciplinary review workflow + consequence-plan notifications (operator decisions 2026-09-03): (a) `Rule.consequencePlan` JSONB stores per-severity next steps (action / employeeStep / managerStep / responseWindowDays) seeded from the standard progressive-discipline ladder + PH twin-notice due process; (b) DA update handler notifies employee + manager (reportTo) via `publishNotification` on DRAFT→OPEN and RESOLVED with the matching tier's next step (rule-book plan when offenseType matches a rule code, else standard ladder); (c) offenseType zod loosened to accept Rule Book rule codes; (d) manual filing (hris-app) uses Rule Book rules as the offense select with severity/description prefill.

## Category
feature / mixed

## Packages
- bandai-infra/hris-api
- bandai-infra/hris-app
- Dual-app: **HR-only (no emp counterpart)**

## Changes
- `prisma/schema-postgres/rule.prisma` — `consequencePlan Json?`; column added via additive SQL (`scripts/add-rule-consequence-plan-column.ts`); client regenerated
- `zod/rule.zod.ts` — `ConsequenceStepSchema` / `ConsequencePlanSchema`, create/update accept `consequencePlan`
- `zod/disciplinaryAction.zod.ts` — `offenseType: z.string().trim().min(1).max(120)` (rule codes valid; legacy enum retained for reporting)
- `helper/disciplinary-notify.helper.ts` — NEW: `disciplinaryStepForSeverity` (rule-book plan → standard-ladder fallback) + `notifyDisciplinaryStateChange` (non-blocking, employee + reportTo recipients)
- `helper/notification-dispatch.helper.ts` — added `DISCIPLINARY` to NotificationCategory union
- `app/disciplinaryAction/disciplinaryAction.controller.ts` — update handler dispatches state-change notifications (DRAFT→OPEN, RESOLVED)
- `prisma/seeds/disciplinaryRulesSeeder.ts` — `consequencePlanForSeverity` standard ladder; upserts plans (16 rules updated live)
- Docs: `docs/00-product/DISCIPLINARY-AUTO-ESCALATION.md` — operator decisions 2026-09-03 recorded

## Truth delta
YES — Rule Book rules carry per-severity consequence plans; case confirmation (DRAFT→OPEN) is the notification trigger to employee + manager with next-step per severity; offenseType accepts operator-configured rule codes.

## Drift
LOW — product doc updated with decisions; seeder template-labeled (NEEDS_CONFIRMATION until operator edits official policy)

## Verification
- mocha: disciplinary helper + controller specs (19 passing)
- Live API: Rule API returns consequencePlan; PUT status DRAFT→OPEN on cron-filed case produced `ALERT`/`DISCIPLINARY` notification to 2 recipients with HIGH NTE next-step text
- eslint: new helper + controller clean

## Risks
- `prisma db push` on schema-postgres wants to drop unrelated backup table `requests_type_backup_20260826` — DO NOT run with --accept-data-loss; additive schema changes go through targeted SQL scripts until that table is reconciled
