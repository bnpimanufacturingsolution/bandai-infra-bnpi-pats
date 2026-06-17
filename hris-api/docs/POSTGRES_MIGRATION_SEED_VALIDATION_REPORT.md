# Postgres-First Migration and Seed Validation Report

Date: May 24, 2026

## Scope

This validation pass covered local, disposable execution of the repo's Postgres-first data movement tooling. It included:

- Prisma Postgres schema bootstrap
- Enterprise CSV migration runners
- Seed scripts used to bootstrap defaults and demo data
- Related migration/import/backfill entrypoints declared in `package.json`
- Safety review of destructive or mutation-heavy scripts

This pass did **not** run against production or shared staging.

## Discovered Script Families

### Primary validated commands

- `npm run prisma-postgres:generate`
- `npm run prisma-postgres:push`
- `npm run migrate:enterprise-csv`
- `npm run migrate:enterprise:pre-checks`
- `npm run migrate:enterprise:foundation`
- `npm run migrate:enterprise:core-config`
- `npm run migrate:enterprise:work-pattern`
- `npm run migrate:enterprise:org-structure`
- `npm run migrate:enterprise:identity`
- `npm run migrate:enterprise:employment-base`
- `npm run migrate:enterprise:employment-relationships`
- `npm run migrate:enterprise:attachments`
- `npm run migrate:enterprise:historical-ledger`
- `npm run migrate:enterprise:in-flight`
- `npm run migrate:enterprise:reconciliation`
- `npm run seed:defaults`
- `npm run seed:calculator`
- `npm run seed:holidays`
- `npm run seed:soa`
- `npm run prisma-seed`

### Reviewed but not run by default

- `npm run prisma-reset`
- `npm run delete:employee`
- `npm run delete:all-employees`
- `npm run apply-indexes`
- `npm run migrate:mongo-to-postgres`
- `npm run verify:mongo-postgres-parity`
- `npm run backfill:*`
- `npm run repair:*`
- `npm run qa:migration-post-actions`
- `npm run seed:pan`

### File locations

- Prisma schema: `prisma/schema-postgres/*`
- General Prisma seed entrypoint: `prisma/seed.ts`
- Seed modules: `prisma/seeds/*`
- Enterprise migration runners: `scripts/migration/**/*`
- Standalone migration/import utilities: `scripts/migrate-*.ts`, `scripts/import-migration-csv.ts`

## Repo Mechanics Confirmed

- The repo currently relies on `prisma db push` plus custom script runners. There is no checked-in Prisma migration history folder being used as the main deployment path.
- `prisma-seed` resolves through Prisma to `prisma/seed.ts`, which delegates to `generalEmployeeSeeder`.
- Enterprise CSV migration is orchestrated by `scripts/migration/run-enterprise-csv-migration.ts` and stage-specific `scripts/migration/enterprise/*.ts` entrypoints.
- `migrate:mongo-to-postgres` and `verify:mongo-postgres-parity` currently depend on a generated Prisma client that no longer matches their Mongo source assumptions.

## Local Validation Environment

Disposable local services used:

- `docker compose up -d mongodb mongo-init redis minio minio-init`
- `docker compose -f docker-compose.postgres-rw.yml up -d`

Validation database:

- `PG_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/hris_validation?schema=public`

Migration env:

- `MIGRATION_ORGANIZATION_CODE=bnei`
- `MIGRATION_CSV_DIR=docs/csv`
- `MIGRATION_DRY_RUN=true`

Mongo env used only for backfill/parity checks:

- `DATABASE_URL=mongodb://localhost:27018/hris?replicaSet=rs0`

## Commands Run and Results

### Passed

- `npm ci --no-audit --no-fund --legacy-peer-deps`
- `npm run prisma-postgres:generate`
- `npm run prisma-postgres:push`
- `npm run seed:defaults`
- `npm run seed:defaults` rerun
- `npm run seed:calculator`
- `npm run seed:holidays`
- `npm run seed:soa`
- `npm run seed:soa` rerun
- `npm run prisma-seed`
- `npm run prisma-seed` rerun
- `npm run migrate:enterprise-csv` dry-run
- `npm run migrate:enterprise-csv` dry-run rerun
- `npm run migrate:enterprise:pre-checks`
- `npm run migrate:enterprise:foundation`
- `npm run migrate:enterprise:core-config`
- `npm run migrate:enterprise:work-pattern`
- `npm run migrate:enterprise:identity`
- `npm run migrate:enterprise:reconciliation`

### Expected dry-run blockers found in sample migration pack

These commands executed but reported `NO_GO` blockers because the sample CSV set is internally inconsistent:

- `npm run migrate:enterprise:org-structure`
- `npm run migrate:enterprise:employment-base`
- `npm run migrate:enterprise:employment-relationships`
- `npm run migrate:enterprise:attachments`
- `npm run migrate:enterprise:historical-ledger`
- `npm run migrate:enterprise:in-flight`

### Failed outside the Postgres seed/migration slice

- `npm run typecheck`
- `npm test`
- `npm run migrate:mongo-to-postgres`
- `npm run verify:mongo-postgres-parity`

## Fresh Database Results

### Prisma Postgres bootstrap

- `prisma-postgres:generate` succeeded against the Postgres schema folder.
- `prisma-postgres:push` succeeded on a clean disposable database.
- Re-running `prisma-postgres:push` on a previously used local database surfaced a data-loss warning on `leave_policy_configs`, so the safe validation path is a fresh disposable database.

### Seeds on fresh database

- `seed:defaults` ran cleanly and created the expected local bootstrap organization, payroll periods, document types, benefit types, calculator, holidays, and device defaults.
- `seed:calculator` ran cleanly.
- `seed:holidays` ran cleanly.
- `seed:soa` ran cleanly after fixes.
- `prisma-seed` ran cleanly after fixes and created the seeded employee/demo data set.

## Rerun and Idempotency Results

- `seed:defaults` appears safe to rerun. Existing payroll periods were detected and holidays were skipped.
- `seed:holidays` is idempotent in practice. Rerun created `0` holidays and skipped `19`.
- `seed:soa` completed successfully on rerun and table counts remained stable:
  - `statements_of_account`: `7`
  - `soa_line_items`: `21`
  - `soa_remittances`: `5`
- `prisma-seed` is rerunnable. On rerun it updated the existing seeded employees, reused auth users, and repaired/confirmed existing attendance and timesheet snapshots instead of duplicating the data set.
- Enterprise migration dry-runs were stable across reruns: the same prerequisite blockers were reproduced.

## Key Errors and Risks Found

### Sample CSV dependency mismatches

The sample pack under `docs/csv` is not fully self-consistent. Blockers included:

- positions referencing missing departments such as `ENG`, `HR`, `STRAT-PLAN`, `PROD-ADMIN`, `PROJ-ENG`, `ASM`
- missing position-level mappings
- missing department schedule links
- later-stage files referencing employees, managers, payroll periods, requests, workflow instances, and parent SOAs that earlier stages do not establish

This means the sample pack is suitable for dry-run validation of parser/stage behavior, but not yet for a full successful end-to-end enterprise import.

### Mongo-to-Postgres backfill/parity is currently broken

- `migrate:mongo-to-postgres`
- `verify:mongo-postgres-parity`

Both scripts currently instantiate the Prisma client from `generated/prisma`, but the generated client is now based on the Postgres schema. As a result, those commands fail immediately when pointed at a Mongo URL.

### Quality gate issues outside migration logic

- `npm run typecheck` still fails because of unrelated repo-wide TypeScript issues:
  - missing `attendance-summary.helper`
  - Node16 import-extension errors in `app/status/status.service.ts` and `index.ts`
  - `digest-fetch` CommonJS/ESM mismatch in `lib/hikvision-client.ts`
- `npm test` still fails because the current Mocha + `ts-node/register` test setup does not align with the repo's current module/type configuration.

## Fixes Made

- Fixed the general employee seed catalog validation conflict in `prisma/seeds/generalEmployeeSeeder.shared.ts`.
  - The validator now rejects exact level-name duplicates instead of any position title that merely contains a level token.
  - Exact-collision titles were renamed to avoid ambiguity.
- Restored the missing package target `scripts/backfill-applicant-assigned-hr.ts` with a safe non-mutating placeholder so the declared commands resolve without performing unexpected writes.
- Fixed `scripts/ensure-prisma-client.cjs` so `pretest` and related hooks work when Prisma schema configuration points to a schema directory instead of a single file.
- Fixed enterprise migration leave-policy persistence in `app/migration/enterprise-migration.service.ts` to use `leaveType` records instead of the nonexistent `leavePolicyConfig` Prisma model.
- Fixed `prisma/seeds/soaSeeder.ts` typing and removed its hardcoded organization dependency so it works against the locally seeded organization.
- Added local-only safety guards to:
  - `scripts/delete-employee-with-relations.ts`
  - `scripts/apply-indexes.ts`

## Destructive or Unsafe Behavior Review

### Commands that require extra care

- `npm run prisma-reset`
- `npm run delete:employee`
- `npm run delete:all-employees`
- `npm run apply-indexes` without dry-run behavior
- `npm run qa:migration-post-actions`

### Current guard status

- `delete:*` now requires explicit local-only confirmation env and localhost API targeting.
- `apply-indexes` now requires explicit local-only confirmation env for non-dry-run mutation paths.
- No production or shared-staging execution was performed in this validation pass.

## Recommended Live Run Order

For a real Postgres client-data migration, use this order:

1. Take a verified backup and snapshot the source export set.
2. Validate env points to the intended non-production or production target.
3. Run `npm ci --no-audit --no-fund --legacy-peer-deps`.
4. Run `npm run prisma-postgres:generate`.
5. Run `npm run prisma-postgres:push` against the target database only after confirming schema compatibility and backup availability.
6. Run `npm run seed:defaults`.
7. Run `npm run seed:calculator`.
8. Run `npm run seed:holidays`.
9. If SOA opening balances are part of the cutover, run `npm run seed:soa`.
10. Run `npm run migrate:enterprise-csv` in dry-run mode with the exact client pack.
11. Resolve every blocker reported by dry-run.
12. Run the stage-specific enterprise migration commands or the orchestrator for the real execution.
13. Run reconciliation and post-import QA checks.
14. Run `npm run prisma-seed` only if the target environment is meant to contain the demo/general employee seed dataset. It should not be part of a normal live client import unless explicitly intended.

Important:

- seed scripts are mutation paths, not validation paths
- enterprise migration supports `MIGRATION_DRY_RUN=true`
- package-exposed seed commands now fail fast if dry-run env or flags are present so they are not mistaken for validation-only commands

## Rollback and Backup Checklist

Before live client data import:

- take a full Postgres backup
- keep the exact CSV/input pack under immutable storage
- record the git commit SHA and deployed env configuration
- confirm local/staging dry-run output matches the same input pack
- confirm org code, datasource URLs, and storage endpoints are correct
- disable or isolate any external side effects not needed for import
- define a rollback owner and decision window before the live run starts

Rollback approach:

- restore the database from backup instead of trying to hand-delete partially imported relational data
- preserve import logs and reconciliation output for failure analysis
- do not rerun a partially failed production import until root cause and data state are reviewed

## Remaining Manual Checks Before Production Use

- Repair the `docs/csv` sample pack dependencies if it is meant to serve as a true end-to-end validation fixture.
- Repair the Mongo-source Prisma client strategy used by `migrate:mongo-to-postgres` and `verify:mongo-postgres-parity`.
- Resolve repo-wide `typecheck` failures.
- Resolve the current Mocha/TypeScript test runner configuration issues.
- Review whether `prisma-seed` should ever be allowed in production-like environments, and if not, add an explicit environment guard.
