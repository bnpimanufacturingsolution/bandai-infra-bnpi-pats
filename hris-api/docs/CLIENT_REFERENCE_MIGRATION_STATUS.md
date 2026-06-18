# Data Migration and Seed Script Inventory Report

Report date: May 24, 2026

This report uses the current repository state as the source of truth. It covers:

- `package.json` runnable commands
- underlying files in `prisma/seeds`
- underlying files in `scripts/migration`
- related data-maintenance utilities outside `scripts/migration`

## Executive Summary

- Runnable data-changing commands in scope: `45`
- Seed commands: `10`
- Migration commands: `21`
- Related data-maintenance commands: `14`
- Files in `prisma/seeds`: `18`
- Files in `scripts/migration`: `18`
- Supporting or stray migration-style utilities outside `scripts/migration`: present

Important findings:

- `seed:pan` and `pan-seed` are duplicate aliases to `prisma/seed-pan.ts`.
- `prisma-seed` resolves through Prisma to `prisma/seed.ts`, and that file delegates to `generalEmployeeSeeder`.
- `scripts/migration/enterprise/stage-runner.ts` and `scripts/migration/enterprise-csv-loader.ts` exist as migration support files but are not direct npm commands.
- `prisma/seeds` contains several helper or internal modules that support seeding but are not directly exposed in `package.json`.
- `scripts/migrate-timesheet-codes.ts`, `scripts/import-migration-csv.ts`, and `scripts/backfill-attendance-obligations.ts` look like data-moving utilities that are not currently exposed through `package.json`.
- `backfill:applicant-assigned-hr` and `backfill:applicant-assigned-hr:execute` are still declared in `package.json`, but `scripts/backfill-applicant-assigned-hr.ts` is missing on disk.

## Runnable Commands

Exposure types used below:

- `npm command`: declared in `package.json` and points to a script file
- `file-only`: file exists and is indirectly used, but not directly exposed by its own npm command
- `helper-only`: support module, helper, or catalog file not intended as a direct command entrypoint

### Seed Commands (`10`)

| Name | Category | Target path | Exposure type | Notes |
| --- | --- | --- | --- | --- |
| `prisma-seed` | Seed | `prisma/seed.ts` | `file-only` | Prisma seed entrypoint; delegates to `generalEmployeeSeeder`. |
| `seed:holidays` | Seed | `prisma/seeds/holidaySeeder.ts` | `npm command` | Direct seed script. |
| `seed:calculator` | Seed | `prisma/seeds/calculatorSeeder.ts` | `npm command` | Direct seed script. |
| `seed:defaults` | Seed | `prisma/seeds/defaultProjectSeeder.ts` | `npm command` | Direct defaults/bootstrap seed. |
| `seed:bulk-backdated-employees` | Seed | `prisma/seeds/bulkBackdatedEmployeeSeeder.ts` | `npm command` | Direct seed script. |
| `seed:reset-demo-requests` | Seed | `prisma/seeds/resetDemoRequests.ts` | `npm command` | Demo reset utility exposed as seed. |
| `seed:soa` | Seed | `prisma/seeds/soaSeeder.ts` | `npm command` | Direct seed script. |
| `seed:eligibility` | Seed | `scripts/seed-eligibility.ts` | `npm command` | Seed lives under `scripts`, not `prisma/seeds`. |
| `pan-seed` | Seed | `prisma/seed-pan.ts` | `npm command` | Alias of `seed:pan`. |
| `seed:pan` | Seed | `prisma/seed-pan.ts` | `npm command` | Alias of `pan-seed`. |

### Migration Commands (`21`)

| Name | Category | Target path | Exposure type | Notes |
| --- | --- | --- | --- | --- |
| `migrate:mongo-to-postgres` | Migration | `scripts/migration/mongo-to-postgres-backfill.ts` | `npm command` | Mongo to Postgres backfill entrypoint. |
| `verify:mongo-postgres-parity` | Migration | `scripts/migration/mongo-postgres-parity.ts` | `npm command` | Verification command grouped with migration tooling. |
| `migrate:enterprise:normalize-client-reference` | Migration | `scripts/migration/normalize-client-reference-pack.ts` | `npm command` | Client reference normalization entrypoint. |
| `migrate:enterprise-csv` | Migration | `scripts/migration/run-enterprise-csv-migration.ts` | `npm command` | Enterprise CSV orchestrator. |
| `migrate:enterprise:pre-checks` | Migration | `scripts/migration/enterprise/pre-migration-controls.ts` | `npm command` | Enterprise staged migration step. |
| `migrate:enterprise:foundation` | Migration | `scripts/migration/enterprise/foundation-master.ts` | `npm command` | Enterprise staged migration step. |
| `migrate:enterprise:core-config` | Migration | `scripts/migration/enterprise/core-configuration.ts` | `npm command` | Enterprise staged migration step. |
| `migrate:enterprise:work-pattern` | Migration | `scripts/migration/enterprise/work-pattern-master.ts` | `npm command` | Enterprise staged migration step. |
| `migrate:enterprise:org-structure` | Migration | `scripts/migration/enterprise/org-structure-skeleton.ts` | `npm command` | Enterprise staged migration step. |
| `migrate:enterprise:identity` | Migration | `scripts/migration/enterprise/identity-master.ts` | `npm command` | Enterprise staged migration step. |
| `migrate:enterprise:employment-base` | Migration | `scripts/migration/enterprise/employment-base.ts` | `npm command` | Enterprise staged migration step. |
| `migrate:enterprise:employment-relationships` | Migration | `scripts/migration/enterprise/employment-relationship-patch.ts` | `npm command` | Enterprise staged migration step. |
| `migrate:enterprise:attachments` | Migration | `scripts/migration/enterprise/employee-attachment-opening-balance.ts` | `npm command` | Enterprise staged migration step. |
| `migrate:enterprise:historical-ledger` | Migration | `scripts/migration/enterprise/closed-historical-operational-ledger.ts` | `npm command` | Enterprise staged migration step. |
| `migrate:enterprise:in-flight` | Migration | `scripts/migration/enterprise/open-in-flight-transactional-history.ts` | `npm command` | Enterprise staged migration step. |
| `migrate:enterprise:reconciliation` | Migration | `scripts/migration/enterprise/post-migration-reconciliation.ts` | `npm command` | Enterprise staged migration step. |
| `migrate:documents` | Migration | `scripts/migrate-document-dates.ts` | `npm command` | Standalone migration utility outside `scripts/migration`. |
| `migrate:attendance-schedule` | Migration | `scripts/migrate-attendance-schedule.ts` | `npm command` | Standalone migration utility outside `scripts/migration`. |
| `migrate:attendance-undertime-status` | Migration | `scripts/migrate-attendance-undertime-status.ts` | `npm command` | Standalone migration utility outside `scripts/migration`. |
| `migrate:attendance-status-flags` | Migration | `scripts/migrate-attendance-status-and-flags.ts` | `npm command` | Standalone migration utility outside `scripts/migration`. |
| `migrate:payroll-cycle-rules` | Migration | `scripts/migrate-payroll-cycle-rules.ts` | `npm command` | Standalone migration utility outside `scripts/migration`. |

### Related Data-Maintenance Commands (`14`)

| Name | Category | Target path | Exposure type | Notes |
| --- | --- | --- | --- | --- |
| `backfill:employee-documents` | Maintenance | `scripts/backfill-employee-documents.ts` | `npm command` | Existing file. |
| `backfill:applicant-assigned-hr` | Maintenance | `scripts/backfill-applicant-assigned-hr.ts` | `npm command` | Declared, but target file is missing. |
| `backfill:applicant-assigned-hr:execute` | Maintenance | `scripts/backfill-applicant-assigned-hr.ts` | `npm command` | Declared, but target file is missing. |
| `repair:schedule-change-hr-approval` | Maintenance | `scripts/repair-schedule-change-hr-approval.ts` | `npm command` | Existing file. |
| `repair:schedule-override-schema` | Maintenance | `scripts/repair-schedule-override-schema.ts` | `npm command` | Existing file. |
| `repair:schedule-change-overrides` | Maintenance | `scripts/repair-completed-schedule-change-overrides.ts` | `npm command` | Existing file. |
| `delete:employee` | Maintenance | `scripts/delete-employee-with-relations.ts` | `npm command` | Destructive utility. |
| `delete:all-employees` | Maintenance | `scripts/delete-employee-with-relations.ts` | `npm command` | Destructive alias/variant of the same file. |
| `backfill:timesheet-lines` | Maintenance | `scripts/backfill-timesheet-lines.ts` | `npm command` | Existing file. |
| `recalculate:attendance` | Maintenance | `scripts/recalculate-attendance-metrics.ts` | `npm command` | Existing file. |
| `backfill:demo-attendance-window` | Maintenance | `scripts/backfill-demo-attendance-window.ts` | `npm command` | Existing file. |
| `backfill:attendance-computed` | Maintenance | `scripts/materialize-computed-attendance.ts` | `npm command` | Existing file. |
| `backfill:attendance-computed:execute` | Maintenance | `scripts/materialize-computed-attendance.ts` | `npm command` | Execute variant of the same file. |
| `qa:migration-post-actions` | Maintenance | `scripts/qa-migration-post-actions.ts` | `npm command` | QA/post-run utility. |

## Underlying Files

### `prisma/seeds` Inventory (`18`)

| Name | Category | Target path | Exposure type | Notes |
| --- | --- | --- | --- | --- |
| `addReportToId.ts` | Seed | `prisma/seeds/addReportToId.ts` | `helper-only` | Post-seed data adjustment utility. |
| `benefitTypeSeeder.ts` | Seed | `prisma/seeds/benefitTypeSeeder.ts` | `helper-only` | Seeder file not exposed in `package.json`. |
| `bulkBackdatedEmployeeSeeder.ts` | Seed | `prisma/seeds/bulkBackdatedEmployeeSeeder.ts` | `npm command` | Used by `seed:bulk-backdated-employees`. |
| `calculatorSeeder.ts` | Seed | `prisma/seeds/calculatorSeeder.ts` | `npm command` | Used by `seed:calculator`. |
| `checkReportToId.ts` | Seed | `prisma/seeds/checkReportToId.ts` | `helper-only` | Validation/check utility. |
| `defaultProjectSeeder.ts` | Seed | `prisma/seeds/defaultProjectSeeder.ts` | `npm command` | Used by `seed:defaults`. |
| `deviceSeeder.ts` | Seed | `prisma/seeds/deviceSeeder.ts` | `helper-only` | Seeder file not exposed in `package.json`. |
| `generalEmployeeSeeder.shared.ts` | Seed | `prisma/seeds/generalEmployeeSeeder.shared.ts` | `helper-only` | Main shared employee seed implementation. |
| `generalEmployeeSeeder.ts` | Seed | `prisma/seeds/generalEmployeeSeeder.ts` | `helper-only` | Delegated to by `prisma/seed.ts`. |
| `holidaySeeder.ts` | Seed | `prisma/seeds/holidaySeeder.ts` | `npm command` | Used by `seed:holidays`. |
| `jobSeed.ts` | Seed | `prisma/seeds/jobSeed.ts` | `helper-only` | Seeder file not exposed in `package.json`. |
| `payrollPeriodSeeder.ts` | Seed | `prisma/seeds/payrollPeriodSeeder.ts` | `helper-only` | Seeder file not exposed in `package.json`. |
| `requestWorkflowCatalog.ts` | Seed | `prisma/seeds/requestWorkflowCatalog.ts` | `helper-only` | Seed catalog/support module. |
| `resetDemoRequests.ts` | Seed | `prisma/seeds/resetDemoRequests.ts` | `npm command` | Used by `seed:reset-demo-requests`. |
| `seedAuthModeAdapter.ts` | Seed | `prisma/seeds/seedAuthModeAdapter.ts` | `helper-only` | Seed support module. |
| `seedOrganizationResolver.ts` | Seed | `prisma/seeds/seedOrganizationResolver.ts` | `helper-only` | Seed support module. |
| `soaSeeder.ts` | Seed | `prisma/seeds/soaSeeder.ts` | `npm command` | Used by `seed:soa`. |
| `workflowInstanceTemplateSeeder.ts` | Seed | `prisma/seeds/workflowInstanceTemplateSeeder.ts` | `helper-only` | Seeder/support module not exposed directly. |

### `scripts/migration` Inventory (`18`)

| Name | Category | Target path | Exposure type | Notes |
| --- | --- | --- | --- | --- |
| `enterprise-csv-loader.ts` | Migration | `scripts/migration/enterprise-csv-loader.ts` | `file-only` | Support loader for enterprise CSV migration flow. |
| `closed-historical-operational-ledger.ts` | Migration | `scripts/migration/enterprise/closed-historical-operational-ledger.ts` | `npm command` | Used by `migrate:enterprise:historical-ledger`. |
| `core-configuration.ts` | Migration | `scripts/migration/enterprise/core-configuration.ts` | `npm command` | Used by `migrate:enterprise:core-config`. |
| `employee-attachment-opening-balance.ts` | Migration | `scripts/migration/enterprise/employee-attachment-opening-balance.ts` | `npm command` | Used by `migrate:enterprise:attachments`. |
| `employment-base.ts` | Migration | `scripts/migration/enterprise/employment-base.ts` | `npm command` | Used by `migrate:enterprise:employment-base`. |
| `employment-relationship-patch.ts` | Migration | `scripts/migration/enterprise/employment-relationship-patch.ts` | `npm command` | Used by `migrate:enterprise:employment-relationships`. |
| `foundation-master.ts` | Migration | `scripts/migration/enterprise/foundation-master.ts` | `npm command` | Used by `migrate:enterprise:foundation`. |
| `identity-master.ts` | Migration | `scripts/migration/enterprise/identity-master.ts` | `npm command` | Used by `migrate:enterprise:identity`. |
| `open-in-flight-transactional-history.ts` | Migration | `scripts/migration/enterprise/open-in-flight-transactional-history.ts` | `npm command` | Used by `migrate:enterprise:in-flight`. |
| `org-structure-skeleton.ts` | Migration | `scripts/migration/enterprise/org-structure-skeleton.ts` | `npm command` | Used by `migrate:enterprise:org-structure`. |
| `post-migration-reconciliation.ts` | Migration | `scripts/migration/enterprise/post-migration-reconciliation.ts` | `npm command` | Used by `migrate:enterprise:reconciliation`. |
| `pre-migration-controls.ts` | Migration | `scripts/migration/enterprise/pre-migration-controls.ts` | `npm command` | Used by `migrate:enterprise:pre-checks`. |
| `stage-runner.ts` | Migration | `scripts/migration/enterprise/stage-runner.ts` | `file-only` | Stage orchestration support file, not directly exposed in `package.json`. |
| `work-pattern-master.ts` | Migration | `scripts/migration/enterprise/work-pattern-master.ts` | `npm command` | Used by `migrate:enterprise:work-pattern`. |
| `mongo-postgres-parity.ts` | Migration | `scripts/migration/mongo-postgres-parity.ts` | `npm command` | Used by `verify:mongo-postgres-parity`. |
| `mongo-to-postgres-backfill.ts` | Migration | `scripts/migration/mongo-to-postgres-backfill.ts` | `npm command` | Used by `migrate:mongo-to-postgres`. |
| `normalize-client-reference-pack.ts` | Migration | `scripts/migration/normalize-client-reference-pack.ts` | `npm command` | Used by `migrate:enterprise:normalize-client-reference`. |
| `run-enterprise-csv-migration.ts` | Migration | `scripts/migration/run-enterprise-csv-migration.ts` | `npm command` | Used by `migrate:enterprise-csv`. |

### Additional Migration-Style Utilities Outside `scripts/migration`

| Name | Category | Target path | Exposure type | Notes |
| --- | --- | --- | --- | --- |
| `seed-eligibility.ts` | Seed | `scripts/seed-eligibility.ts` | `npm command` | Seed entrypoint outside `prisma/seeds`. |
| `migrate-document-dates.ts` | Migration | `scripts/migrate-document-dates.ts` | `npm command` | Standalone migration utility. |
| `migrate-attendance-schedule.ts` | Migration | `scripts/migrate-attendance-schedule.ts` | `npm command` | Standalone migration utility. |
| `migrate-attendance-undertime-status.ts` | Migration | `scripts/migrate-attendance-undertime-status.ts` | `npm command` | Standalone migration utility. |
| `migrate-attendance-status-and-flags.ts` | Migration | `scripts/migrate-attendance-status-and-flags.ts` | `npm command` | Standalone migration utility. |
| `migrate-payroll-cycle-rules.ts` | Migration | `scripts/migrate-payroll-cycle-rules.ts` | `npm command` | Standalone migration utility. |
| `migrate-timesheet-codes.ts` | Migration | `scripts/migrate-timesheet-codes.ts` | `file-only` | Present on disk but not exposed in `package.json`. |
| `import-migration-csv.ts` | Migration | `scripts/import-migration-csv.ts` | `file-only` | Present on disk but not exposed in `package.json`. |
| `backfill-attendance-obligations.ts` | Maintenance | `scripts/backfill-attendance-obligations.ts` | `file-only` | Present on disk but not exposed in `package.json`. |
| `backfill-demo-attendance-window.ts` | Maintenance | `scripts/backfill-demo-attendance-window.ts` | `npm command` | Exposed in `package.json`. |
| `backfill-employee-documents.ts` | Maintenance | `scripts/backfill-employee-documents.ts` | `npm command` | Exposed in `package.json`. |
| `backfill-timesheet-lines.ts` | Maintenance | `scripts/backfill-timesheet-lines.ts` | `npm command` | Exposed in `package.json`. |
| `delete-employee-with-relations.ts` | Maintenance | `scripts/delete-employee-with-relations.ts` | `npm command` | Shared by `delete:employee` and `delete:all-employees`. |
| `qa-migration-post-actions.ts` | Maintenance | `scripts/qa-migration-post-actions.ts` | `npm command` | Exposed in `package.json`. |
| `recalculate-attendance-metrics.ts` | Maintenance | `scripts/recalculate-attendance-metrics.ts` | `npm command` | Exposed in `package.json`. |
| `repair-completed-schedule-change-overrides.ts` | Maintenance | `scripts/repair-completed-schedule-change-overrides.ts` | `npm command` | Exposed in `package.json`. |
| `repair-schedule-change-hr-approval.ts` | Maintenance | `scripts/repair-schedule-change-hr-approval.ts` | `npm command` | Exposed in `package.json`. |
| `repair-schedule-override-schema.ts` | Maintenance | `scripts/repair-schedule-override-schema.ts` | `npm command` | Exposed in `package.json`. |

## Coverage Gaps and Overlaps

### Overlaps and aliases

- `seed:pan` and `pan-seed` point to the same file: `prisma/seed-pan.ts`.
- `delete:employee` and `delete:all-employees` point to the same file: `scripts/delete-employee-with-relations.ts`.
- `backfill:attendance-computed` and `backfill:attendance-computed:execute` point to the same file: `scripts/materialize-computed-attendance.ts`.
- `prisma-seed` is declared as a Prisma command, but the effective entrypoint on disk is `prisma/seed.ts`.

### Support files not directly exposed as npm commands

- `scripts/migration/enterprise/stage-runner.ts`
- `scripts/migration/enterprise-csv-loader.ts`
- `prisma/seeds/generalEmployeeSeeder.ts`
- `prisma/seeds/generalEmployeeSeeder.shared.ts`
- `prisma/seeds/requestWorkflowCatalog.ts`
- `prisma/seeds/seedAuthModeAdapter.ts`
- `prisma/seeds/seedOrganizationResolver.ts`

### Files present on disk but not exposed in `package.json`

- `scripts/migrate-timesheet-codes.ts`
- `scripts/import-migration-csv.ts`
- `scripts/backfill-attendance-obligations.ts`
- `prisma/seeds/benefitTypeSeeder.ts`
- `prisma/seeds/deviceSeeder.ts`
- `prisma/seeds/jobSeed.ts`
- `prisma/seeds/payrollPeriodSeeder.ts`
- `prisma/seeds/workflowInstanceTemplateSeeder.ts`

### Declared commands with missing file targets

- `backfill:applicant-assigned-hr`
- `backfill:applicant-assigned-hr:execute`

Both still point to `scripts/backfill-applicant-assigned-hr.ts`, which is not present in the repository as of May 24, 2026.

## Recommended Cleanup

1. Remove or restore the missing `backfill:applicant-assigned-hr` script so `package.json` matches the filesystem.
2. Decide whether both `seed:pan` and `pan-seed` are still needed, or keep one alias as the canonical name.
3. Consider adding `package.json` entries for:
   - `scripts/migrate-timesheet-codes.ts`
   - `scripts/import-migration-csv.ts`
   - `scripts/backfill-attendance-obligations.ts`
4. Consider exposing selected seeders if they are meant to be reusable operational scripts:
   - `benefitTypeSeeder.ts`
   - `deviceSeeder.ts`
   - `jobSeed.ts`
   - `payrollPeriodSeeder.ts`
5. Keep `stage-runner.ts` and `enterprise-csv-loader.ts` as support modules unless there is a clear operational need to run them directly.

## Verification Notes

This report was verified by:

- re-deriving command counts from `package.json` using prefix-based filtering
- re-scanning `prisma/seeds`
- re-scanning `scripts/migration`
- re-scanning `scripts` for stray `seed|migrate|migration|backfill|repair|recalculate|delete` files
- checking that each command target path exists on disk

## Client Reference Normalization Context

The original client-reference status is still valid as background context:

- the enterprise migration engine is usable, but client reference files are not directly loadable without normalization
- the normalization entrypoint remains `npm run migrate:enterprise:normalize-client-reference`
- generated output still targets `output/client-reference-pack`
- full migration readiness is still blocked on employee, person, schedule-template, and employee-to-shift source data
