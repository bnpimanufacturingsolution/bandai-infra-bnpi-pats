# Current Task

## Status
done

## Summary
Disciplinary Action review workflow (operator decisions 2026-09-03): row actions now include status transitions (DRAFT→Confirm/OPEN, OPEN→Ongoing/Dismiss, ONGOING→Resolved/Dismiss; terminal states locked), status filter and badges include DRAFT, and the File/Edit offense select is driven by the Disciplinary Rule Book (rule code = offenseType, severity prefilled from rule with CRITICAL→HIGH mapping, description prefilled, consequences hint shown). View modal shows the rule-book next step (employee/manager steps + response window) for the case severity. Backend notifications (hris-api) fire on DRAFT→OPEN and RESOLVED to employee + manager.

## Category
feature / mixed

## Packages
- bandai-infra/hris-app
- bandai-infra/hris-api
- Dual-app: **HR-only (no emp counterpart)**

## Changes
- `app/routes/hr/disciplinary-action.tsx` — `STATUS_TRANSITIONS` map + `handleStatusChange` (confirm dialogs for OPEN/DISMISSED), dropdown workflow items, DRAFT status option/badge, rule-book-driven offense select (`onOffenseTypeChange`, severity prefill `normalizeSeverity`), view-modal next-step card
- `app/services/disciplinaryAction.service.ts` — `DisciplinaryActionStatus` now includes `DRAFT`
- `app/services/disciplinaryRules.service.ts` — `DisciplinaryConsequenceStep` / `DisciplinaryConsequencePlan` types, payload accepts `consequencePlan`
- `app/routes/admin/rules-policies/disciplinary.tsx` — consequence-plan editor (per-severity action/employee step/manager step/response window, "Insert standard" prefill from the standard ladder), view modal renders plan tiers
- Backend counterpart: see `../hris-api/.wwg/workspace/current-task.md`

## Truth delta
YES — case confirmation (DRAFT→OPEN) is the review gate that triggers employee + manager notifications with the rule-book next step; Rule Book rules are the source of offense types when filing.

## Drift
LOW — contract tests updated; backend workspace synced

## Verification
- vitest: `hr/disciplinary-action.contract.test.ts` + `rules-policies/disciplinary.contract.test.ts` (9 passing, incl. new rule-book-driven offense contract)
- esbuild parse OK for both pages
- mocha (hris-api): disciplinary specs 19 passing; live API proof of DRAFT→OPEN notification

## Risks
- Rule-book consequence plans for seeded rules are template/standard-ladder drafts (NEEDS_CONFIRMATION until operator edits official policy)
