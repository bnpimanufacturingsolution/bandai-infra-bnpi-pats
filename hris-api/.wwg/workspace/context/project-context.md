# Project Context

## Purpose

Provide concise, actionable context for agents implementing or validating work in `hris-api`.

## Scope

- Backend API and related helpers/utilities.
- Paired frontend integration with `../hris-app`.
- Prisma Mongo/Postgres migration track and operational safeguards.
- WWG governance, validation, and test enforcement surfaces.

## Current State

- Runtime: TypeScript + Express + Prisma.
- Active persistence direction: Mongo Prisma to PostgreSQL Prisma migration.
- Product category: backend API for the HRIS / workforce management system.
- Paired frontend repository: `../hris-app`.
- WWG validation/audit gates are active and required before close-out.
- Test policy now requires at least 5 test cases for each new or modified function unless explicitly waived by the owner.
- Backend authorization, persistence, Prisma schema/model constraints, API contracts, DB invariants, load tests, and soak tests belong in this repo or an approved API harness.

## Canonical Terms

- Source of truth terms: `.wwg/wiki/terminology.md`
- Source of truth product facts: `.wwg/wiki/project-truth.md`
- Binding HR attendance/timesheet/payroll source split: `../docs/attendance-timesheet-payroll-tally-prd.md`

## Decisions

- Keep dual-run migration safety practices during Postgres cutover.
- Keep WWG lifecycle gates (`wwg:task:start` / `wwg:task:end`) for meaningful tasks.
- Enforce function-level test case minimum via governance and automated check script.
- Keep app/API test ownership explicit: `../hris-app` owns UI/client tests; this repo owns API/persistence/invariant/load/soak tests.

## Constraints

- Do not overwrite accepted project truth with inferred/generated text without review.
- Do not mutate `.vorter/`.
- Preserve existing user changes unless explicitly requested otherwise.
- Do not run destructive DB fault-injection, migrations, backfills, repairs, deletion scripts, load tests, or soak tests against shared environments without explicit approval.
- Do not treat frontend visibility as API authorization.

## References

- `AGENTS.md`
- `.wwg/governance/drift-guard.md`
- `.wwg/governance/test-enforcement.md`
- `docs/POSTGRES_MIGRATION_HANDOFF_2026-05-16.md`
- `../hris-app/.wwg/wiki/project-truth.md`
- `../docs/attendance-timesheet-payroll-tally-prd.md`
