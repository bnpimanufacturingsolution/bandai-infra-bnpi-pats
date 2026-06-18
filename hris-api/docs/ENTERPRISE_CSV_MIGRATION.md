# Enterprise CSV Migration

Run the staged HRIS migration directly from CSV files stored in `docs/csv`.

## Command

```bash
npm run migrate:enterprise-csv
```

Local disposable validation flow:

```bash
npm run migrate:enterprise:validate-local
```

Local disposable mock-pack completion flow:

```bash
npm run migrate:enterprise:complete-local
```

## Client reference normalization

When the client provides workbook/CSV reference exports that do not already use enterprise migration
headers, convert them first with:

```bash
npm run migrate:enterprise:normalize-client-reference
```

This generates a repo-native reference pack under `output/client-reference-pack` that can then be
used as `MIGRATION_CSV_DIR` for the existing staged migration commands.

## Standalone stage commands

Use these when you want to run one enterprise migration stage directly without changing the current
full runner:

```bash
npm run migrate:enterprise:pre-checks
npm run migrate:enterprise:foundation
npm run migrate:enterprise:core-config
npm run migrate:enterprise:work-pattern
npm run migrate:enterprise:org-structure
npm run migrate:enterprise:identity
npm run migrate:enterprise:employment-base
npm run migrate:enterprise:employment-relationships
npm run migrate:enterprise:attachments
npm run migrate:enterprise:historical-ledger
npm run migrate:enterprise:in-flight
npm run migrate:enterprise:reconciliation
```

These stage commands use the same environment variables and CSV loader as
`npm run migrate:enterprise-csv`, but each one forces exactly one
`EnterpriseMigrationStage`.

## Required environment

For a validation-only dry-run, provide an existing target organization:

- `MIGRATION_ORGANIZATION_ID`, or
- `MIGRATION_ORGANIZATION_CODE`

If you pass `MIGRATION_ORGANIZATION_CODE` or `MIGRATION_ORGANIZATION_ID`, the target organization
must already exist or the runner will stop before stage execution.

## Optional environment

- `MIGRATION_DRY_RUN=true|false`
- `MIGRATION_RUN_LABEL=<label>`
- `MIGRATION_SOURCE_SYSTEM=<name>`
- `MIGRATION_CUTOFF_AT=<ISO date>`
- `MIGRATION_BATCH_SIZE=<number>`
- `MIGRATION_MAX_PARALLEL_BATCHES=<number>`
- `MIGRATION_STAGE_BATCH_SIZE=<number>`
- `MIGRATION_STOP_ON_STAGE_FAILURE=true|false`
- `MIGRATION_STRICT_INTEGRITY=true|false`
- `MIGRATION_ALLOW_FALLBACK_SCHEDULE=true|false`
- `MIGRATION_FALLBACK_SHIFT_TYPE_CODE=<code>`
- `MIGRATION_STAGES=PRE_MIGRATION_CONTROLS,ORG_STRUCTURE_SKELETON,EMPLOYMENT_BASE`
- `MIGRATION_LOG_PATH=<path>`
- `MIGRATION_CSV_DIR=<path>`
- `MIGRATION_DEFAULT_PASSWORD=<local-account-password>`
- `MIGRATION_REPORT_ENABLED=true|false`
- `MIGRATION_REPORT_TEMPLATE_PATH=<optional-style-reference.xlsx>`
- `MIGRATION_REPORT_OUTPUT_PATH=<output-file-or-directory>`

`MIGRATION_DRY_RUN` defaults to `true` in the enterprise orchestrator and stage runner. Keep it
explicitly set to `true` when validating a pack so the shell state is obvious.

If you omit both organization env vars, the bootstrap helper can create the organization from
`organization.csv`. That is not recommended for a strict validation-only run because it is a real
database mutation.

## Employee account creation

During real-write `EMPLOYMENT_BASE` runs, the enterprise migration now creates or reuses a local
HRIS user account for each migrated employee when the resolved person record has a valid email.

- created migration accounts always use role `hris-employee`
- the linked `users.email` comes from `person.contactInfo.email`
- the default password is `Password123!`
- set `MIGRATION_DEFAULT_PASSWORD` to override that default
- created or refreshed accounts are marked for first login / password change
- if a person email is missing or invalid, the employee still migrates and the run records a warning instead of failing

Dry-run behavior remains non-persistent: the migration simulates account creation or reuse in the
stage reconciliation output, but does not write `users`, `person.userId`, or `employee.userId`.

## Recommended local validation flow

Use this sequence when you want a clean local validation run with a fresh Postgres database:

1. `npm run prisma-reset`
2. `npm run seed:defaults`
3. `npm run migrate:enterprise-csv` with `MIGRATION_DRY_RUN=true` and report env vars

You can also run the bundled helper:

```bash
npm run migrate:enterprise:validate-local
```

The helper now clears `MIGRATION_DRY_RUN` and `DRY_RUN` for the `prisma-reset` and `seed:defaults`
subprocesses, then applies `MIGRATION_DRY_RUN=true` only to the final `migrate:enterprise-csv`
command. This makes it safe to run even if your current shell still has stale dry-run env vars set
from a previous command.

PowerShell example:

```powershell
Remove-Item Env:MIGRATION_ORGANIZATION_CODE -ErrorAction SilentlyContinue
$env:MIGRATION_DRY_RUN="true"
$env:MIGRATION_CSV_DIR="docs/csv"
$env:MIGRATION_REPORT_ENABLED="true"
$env:MIGRATION_REPORT_OUTPUT_PATH="output\\spreadsheet"
npm run prisma-reset
npm run seed:defaults
npm run migrate:enterprise-csv
```

Important:

- `prisma-reset` mutates the database
- `seed:defaults` mutates the database
- only `migrate:enterprise-csv` is dry-run in this flow

## Recommended mock completion flow

Use this sequence when the goal is a full disposable local run of the mock pack from `DM0` through
`DM7` with real writes:

1. `npm run prisma-reset`
2. `npm run seed:defaults`
3. `npm run seed:calculator`
4. `npm run seed:holidays`
5. `npm run seed:soa`
6. `npm run migrate:enterprise-csv` with `MIGRATION_DRY_RUN=false`

Bundled helper:

```bash
npm run migrate:enterprise:complete-local
```

PowerShell example:

```powershell
Remove-Item Env:MIGRATION_DRY_RUN -ErrorAction SilentlyContinue
Remove-Item Env:DRY_RUN -ErrorAction SilentlyContinue
Remove-Item Env:MIGRATION_STAGES -ErrorAction SilentlyContinue
$env:MIGRATION_ORGANIZATION_CODE="bnei"
$env:MIGRATION_DRY_RUN="false"
$env:MIGRATION_CSV_DIR="docs/csv"
$env:MIGRATION_REPORT_ENABLED="true"
$env:MIGRATION_REPORT_OUTPUT_PATH="output\spreadsheet"
$env:MIGRATION_STOP_ON_STAGE_FAILURE="false"
npm run prisma-reset
npm run seed:defaults
npm run seed:calculator
npm run seed:holidays
npm run seed:soa
npm run migrate:enterprise-csv
```

Acceptance target for the mock completion pack:

- all enterprise stages execute through `POST_MIGRATION_RECONCILIATION`
- `goNoGo.decision` is `GO`
- the generated DM report includes all 43 mapped rows without stage-skipped timing warnings

Important:

- this is not a dry-run path
- use it only against a disposable local database
- dry-run remains useful for parser and stage-selection validation, but not as the completion acceptance path

## Seed scripts are not dry-run

The enterprise migration flow supports `MIGRATION_DRY_RUN=true`. The seed entrypoints do not.

These commands write data and should only be run for real against a disposable or intentionally
prepared environment:

- `npm run prisma-seed`
- `npm run seed:defaults`
- `npm run seed:calculator`
- `npm run seed:holidays`
- `npm run seed:soa`
- `npm run seed:eligibility`
- `npm run seed:pan`
- `npm run seed:bulk-backdated-employees`
- `npm run seed:reset-demo-requests`

If `MIGRATION_DRY_RUN=true`, `DRY_RUN=true`, or `--dry-run` is carried into one of those seed
commands, the script now fails fast with a clear error instead of silently mutating data.

## CSV directory

The script scans `docs/csv` and loads recognized files by filename. Use snake_case filenames:

- `organization.csv`
- `agencies.csv`
- `calendar_items.csv`
- `payroll_cycle_config.csv`
- `calculators.csv`
- `payroll_periods.csv`
- `leave_policies.csv`
- `timesheet_configs.csv`
- `workflow_configs.csv`
- `document_types.csv`
- `benefit_types.csv`
- `loan_types.csv`
- `shift_types.csv`
- `schedule_templates.csv`
- `departments.csv`
- `levels.csv`
- `positions.csv`
- `position_levels.csv`
- `department_schedule_links.csv`
- `persons.csv`
- `employees.csv`
- `reporting_lines.csv`
- `department_managers.csv`
- `schedule_overrides.csv`
- `employee_schedule_histories.csv`
- `document_folders.csv`
- `documents.csv`
- `leave_balances.csv`
- `employee_benefits.csv`
- `employee_benefit_installments.csv`
- `employee_loans.csv`
- `attendances.csv`
- `timesheets.csv`
- `timesheet_lines.csv`
- `employee_payrolls.csv`
- `statements_of_account.csv`
- `soa_remittances.csv`
- `workflow_instances.csv`
- `requests.csv`
- `workflow_step_executions.csv`
- `request_transactions.csv`
- `terminations.csv`

Files prefixed with `sample-` are also recognized.

## DM report layout

When `MIGRATION_REPORT_ENABLED=true`, the generated workbook now creates `DM0` through `DM7`
directly from the current migration pack definition using filename-based row labels:

- `DM0.1 organization.csv`, `DM0.2 agencies.csv`, `DM0.3 calendar_items.csv`
- `DM1.1 calculators.csv`, `DM1.2 payroll_cycle_config.csv`, `DM1.3 payroll_periods.csv`, `DM1.4 leave_policies.csv`, `DM1.5 timesheet_configs.csv`, `DM1.6 workflow_configs.csv`, `DM1.7 document_types.csv`, `DM1.8 benefit_types.csv`, `DM1.9 loan_types.csv`
- `DM2.1 shift_types.csv`, `DM2.2 schedule_templates.csv`
- `DM3.1 departments.csv`, `DM3.2 levels.csv`, `DM3.3 positions.csv`, `DM3.4 position_levels.csv`, `DM3.5 department_schedule_links.csv`
- `DM4.1 persons.csv`, `DM4.2 employees.csv`, `DM4.3 reporting_lines.csv`, `DM4.4 department_managers.csv`, `DM4.5 schedule_overrides.csv`, `DM4.6 employee_schedule_histories.csv`, `DM4.7 terminations.csv`
- `DM5.1 document_folders.csv`, `DM5.2 documents.csv`, `DM5.3 leave_balances.csv`, `DM5.4 employee_benefits.csv`, `DM5.5 employee_benefit_installments.csv`, `DM5.6 employee_loans.csv`
- `DM6.1 attendances.csv`, `DM6.2 timesheets.csv`, `DM6.3 timesheet_lines.csv`, `DM6.4 employee_payrolls.csv`, `DM6.5 statements_of_account.csv`, `DM6.6 soa_remittances.csv`, `DM6.7 workflow_instances.csv`, `DM6.8 requests.csv`, `DM6.9 workflow_step_executions.csv`, `DM6.10 request_transactions.csv`
- `DM7.1 reconciliation`

Each DM sheet keeps the same high-level layout:

- left side: DM label plus lightweight column hints
- right side: `DEV`, `UAT`, and `PROD` metric groups
- local runs populate `DEV` only; `UAT` and `PROD` remain blank placeholders

## Sample pack

`docs/csv` now contains a repo-native enterprise sample pack using `sample-*.csv` filenames and
the current migration schema headers.

The sample pack covers:

- foundation, configuration, work patterns, and org structure
- 100+ employees plus a 1:1 `persons.csv` companion set for realistic dry-run volume
- reporting lines, department manager links, and representative employee-linked downstream fixtures
- multiple attendance -> timesheet -> payroll lineages
- multiple in-flight requests with workflow instances, step executions, and request transactions

Regenerate the checked-in mock pack with:

```bash
npm run migrate:enterprise:generate-sample-pack
```

`docs/csv` is also the repo's local mock completion pack. It should remain internally consistent
enough to support a disposable real run across all enterprise stages.

Use it with:

```bash
MIGRATION_ORGANIZATION_CODE=bnei
MIGRATION_DRY_RUN=true
MIGRATION_CSV_DIR=docs/csv
npm run migrate:enterprise-csv
```

PowerShell:

```powershell
$env:MIGRATION_ORGANIZATION_CODE="bnei"
$env:MIGRATION_DRY_RUN="true"
$env:MIGRATION_CSV_DIR="docs/csv"
npm run migrate:enterprise-csv
```

If `bnei` does not already exist in your target database, seed or create a disposable organization
first, or use an existing organization code instead.

## Stage commands

Run full configuration onward:

```bash
MIGRATION_ORGANIZATION_CODE=bnei
MIGRATION_DRY_RUN=true
MIGRATION_CSV_DIR=docs/csv
MIGRATION_STAGES=CORE_CONFIGURATION,WORK_PATTERN_MASTER,ORG_STRUCTURE_SKELETON,IDENTITY_MASTER,EMPLOYMENT_BASE,EMPLOYMENT_RELATIONSHIP_PATCH,EMPLOYEE_ATTACHMENT_OPENING_BALANCE,CLOSED_HISTORICAL_OPERATIONAL_LEDGER,OPEN_IN_FLIGHT_TRANSACTIONAL_HISTORY,POST_MIGRATION_RECONCILIATION
npm run migrate:enterprise-csv
```

Run workflow history only:

```bash
MIGRATION_ORGANIZATION_CODE=bnei
MIGRATION_DRY_RUN=true
MIGRATION_CSV_DIR=docs/csv
MIGRATION_STAGES=OPEN_IN_FLIGHT_TRANSACTIONAL_HISTORY
npm run migrate:enterprise-csv
```

Run people dependencies:

```bash
MIGRATION_ORGANIZATION_CODE=bnei
MIGRATION_DRY_RUN=true
MIGRATION_CSV_DIR=docs/csv
MIGRATION_STAGES=IDENTITY_MASTER,EMPLOYMENT_BASE,EMPLOYMENT_RELATIONSHIP_PATCH
npm run migrate:enterprise-csv
```

Run narrow stage checks directly:

```powershell
$env:MIGRATION_ORGANIZATION_CODE="bnei"
$env:MIGRATION_DRY_RUN="true"
$env:MIGRATION_CSV_DIR="docs/csv"
npm run migrate:enterprise:pre-checks
npm run migrate:enterprise:org-structure
npm run migrate:enterprise:identity
npm run migrate:enterprise:employment-base
```

## Dry-run caveat

`dryRun=true` validates parsing, stage selection, and database lookups, but it does not persist rows
that would have been created earlier in the same run. On an empty org, a full multi-stage dry-run can
still report dependency blockers for later stages, and even for dependent datasets inside the same
stage, because those prerequisite rows were never written.

For full dependency validation, use one of these approaches:

- run early stages for real against a disposable org, then dry-run later stages
- test stages incrementally against an org that already contains prerequisite data

## Header rules

- Use schema field names as headers.
- Nested objects can use dot notation, for example:
  - `payrollPeriodRange.startDate`
  - `payrollPeriodRange.endDate`
- JSON arrays/objects can be placed in a cell as JSON text.
- Boolean fields should use `true` or `false`.

## Output

The script writes the latest result to:

```text
logs/enterprise-csv-migration-last-run.json
```

If report generation is enabled, it also writes a migration DM workbook under:

```text
output/spreadsheet/
```

`MIGRATION_REPORT_TEMPLATE_PATH` is now optional. If provided, it is treated as a reference path
for the run metadata, but the workbook rows and sheets are generated from code rather than by
filling fixed cells in a prebuilt template.

Stage-specific runs write companion files under `logs/`, for example:

- `logs/enterprise-csv-pre-migration-controls-last-run.json`
- `logs/enterprise-csv-org-structure-skeleton-last-run.json`
- `logs/enterprise-csv-employment-base-last-run.json`
