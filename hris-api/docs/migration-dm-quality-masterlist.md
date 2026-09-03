# Enterprise Data Migration Quality Masterlist

Status: ACTIVE_DRAFT
Last reviewed: 2026-05-26

## Purpose

This document records the executable technical DM masterlist and the minimum QA evidence required before enterprise data migration sign-off.

This is not approval to run migrations against shared or production data. Migration, backfill, repair, deletion, load, soak, and destructive DB tests remain approval-gated.

## Audience

This document is for data migration implementers, QA reviewers, HRIS product owners, and agents changing enterprise migration scripts or tests.

## Summary

Use the technical DM codes below as the executable source of truth for migration testing. Business-facing migration plans can use friendlier phase labels, but code, reports, and tests must stay aligned with this DM0-DM7 map unless the taxonomy is deliberately migrated.

## How It Works

The migration report definitions identify the DM rows used in generated Excel evidence. The masterlist module enriches those rows with business names, target models, key fields, dependencies, and required quality gates. The migration quality tests compare the report definitions, CSV loader filename map, sample pack, timesheet source-of-truth rules, and actual enterprise migration service dry-run execution so a missing/mismatched DM row or broken migration code path fails in CI.

## Canonical Technical DM Map

The executable masterlist lives in `scripts/migration/migration-dm-masterlist.ts` and is checked by `tests/enterprise-migration-dm-masterlist.spec.ts`.

| DM | Business group | Dataset / stage | Business name | Primary target |
|---|---|---|---|---|
| DM0.1 | Foundation master | organization.csv | Company profile | Organization |
| DM0.2 | Foundation master | agencies.csv | Agencies | Agency |
| DM0.3 | Foundation master | calendar_items.csv | Holidays and calendar items | CalendarItem |
| DM1.1 | Core configuration | calculators.csv | Payroll calculators | Calculator |
| DM1.2 | Core configuration | payroll_cycle_config.csv | Payroll rules and cycle | PayrollCycleConfig |
| DM1.3 | Core configuration | payroll_periods.csv | Payroll periods | PayrollPeriod |
| DM1.4 | Core configuration | leave_policies.csv | Leave policies | LeaveType / branding policy |
| DM1.5 | Core configuration | timesheet_configs.csv | Timesheet rules | TimesheetConfig |
| DM1.6 | Core configuration | workflow_configs.csv | Workflow templates | WorkflowConfig / branding policy |
| DM1.7 | Core configuration | document_types.csv | 201 document types | DocumentType |
| DM1.8 | Core configuration | benefit_types.csv | Benefit types | BenefitType |
| DM1.9 | Core configuration | loan_types.csv | Loan types | LoanType |
| DM2.1 | Work pattern master | shift_types.csv | Shift types | ShiftType |
| DM2.2 | Work pattern master | schedule_templates.csv | Schedule templates | ScheduleTemplate |
| DM3.1 | Organization structure | departments.csv | Departments and sections | Department |
| DM3.2 | Organization structure | levels.csv | Levels | Level |
| DM3.3 | Organization structure | positions.csv | Positions | Position |
| DM3.4 | Organization structure | position_levels.csv | Position-level mappings | PositionLevel |
| DM3.5 | Organization structure | department_schedule_links.csv | Department schedule links | DepartmentScheduleTemplate |
| DM4.1 | Identity and employment | persons.csv | Person identity master | Person |
| DM4.2 | Identity and employment | employees.csv | Employees | Employee / User |
| DM4.3 | Identity and employment | reporting_lines.csv | Reporting lines | Employee.reportToId |
| DM4.4 | Identity and employment | department_managers.csv | Department managers | Department.managerId |
| DM4.5 | Identity and employment | schedule_overrides.csv | Schedule overrides | ScheduleOverride |
| DM4.6 | Identity and employment | employee_schedule_histories.csv | Employee schedule assignments | EmployeeScheduleHistory |
| DM4.7 | Identity and employment | terminations.csv | Terminations | Termination |
| DM5.1 | Employee attachments and openings | document_folders.csv | Employee document folders | DocumentFolder |
| DM5.2 | Employee attachments and openings | documents.csv | Employee documents and 201 files | Document |
| DM5.3 | Employee attachments and openings | leave_balances.csv | Opening leave balances | EmployeeLeaveBalance |
| DM5.4 | Employee attachments and openings | employee_benefits.csv | Employee benefits | EmployeeBenefit |
| DM5.5 | Employee attachments and openings | employee_benefit_installments.csv | Employee benefit installments | EmployeeBenefitInstallment |
| DM5.6 | Employee attachments and openings | employee_loans.csv | Employee loans | EmployeeLoan |
| DM6.1 | Historical operational ledger | attendances.csv | Attendance history | Attendance |
| DM6.2 | Historical operational ledger | timesheets.csv | Timesheet headers | Timesheet |
| DM6.3 | Historical operational ledger | timesheet_lines.csv | Effective timesheet lines | Timesheetline |
| DM6.4 | Historical operational ledger | employee_payrolls.csv | Payroll history | EmployeePayroll |
| DM6.5 | Historical operational ledger | statements_of_account.csv | Statements of account | StatementOfAccount / SOALineItem |
| DM6.6 | Historical operational ledger | soa_remittances.csv | SOA remittances | SOARemittance |
| DM6.7 | Historical operational ledger | workflow_instances.csv | Workflow instances | WorkflowInstance |
| DM6.8 | Historical operational ledger | requests.csv | Requests and approval history | Request |
| DM6.9 | Historical operational ledger | workflow_step_executions.csv | Workflow step executions | WorkflowStepExecution |
| DM6.10 | Historical operational ledger | request_transactions.csv | Request transactions | RequestTransaction |
| DM7.1 | Post-migration reconciliation | reconciliation | Reconciliation and sign-off | PostMigrationReconciliation |

## Required Quality Gates

Every DM row requires:

- Mapping coverage: source file, source key, target model, key fields, dependencies, and transforms are documented.
- Schema validation: invalid rows fail before write execution and preserve CSV row provenance.
- Dry run: execution can produce counts, warnings, errors, start time, end time, and elapsed time without writes.
- Idempotency: repeated runs report deterministic created, updated, skipped, and failed counts.
- Count reconciliation: source row counts and accepted target counts reconcile, or approved variance is recorded.
- Timing capture: DM reports include start, end, elapsed, and rows/sec metadata.
- Go/no-go reporting: blockers are visible in the migration result and DM report.

Rows with dependencies also require referential integrity checks.

## Timesheet Quality Focus

Timesheets are higher risk than ordinary reference data. `DM6.2 timesheets.csv`, `DM6.3 timesheet_lines.csv`, and `DM6.4 employee_payrolls.csv` must preserve the source-of-truth split from `../docs/attendance-timesheet-payroll-tally-prd.md`:

- `Attendance` remains the biometric/raw/effective clock ledger.
- Effective `Timesheetline` rows are the source for submitted, approved, payroll-ready, and approved OT totals.
- Paid payroll history reads `EmployeePayroll.timesheetSnapshot`.
- Paid payroll snapshots must not be silently recomputed from mutable attendance or timesheet rows.

The focused test is `tests/enterprise-migration-timesheet-quality.spec.ts`.

## Validation Commands

Fast source-truth gate:

```bash
npm run test:ci:source-truth
```

Migration quality slice:

```bash
npm run test:migration:quality
```

This command prints the full DM masterlist mapping and the test evidence mapping in the terminal before running the suite. After the suite finishes, it prints:

- DM scope elapsed-time breakdown.
- Test file elapsed-time breakdown.
- Individual test elapsed-time breakdown.
- Total Mocha elapsed time and total command elapsed time.
- JSON and Markdown artifact paths.

Retained artifacts:

- `output/reports/migration-quality-test-breakdown.json`
- `output/reports/migration-quality-test-breakdown.md`

Report generation remains controlled by the existing migration report environment flags. Do not run write-mode migrations without explicit approval.

## Examples

- Employee master data is technically `DM4.2 employees.csv`, even if a business-facing rollout calls the employee phase "DM2".
- Timesheet headers are `DM6.2 timesheets.csv`; effective historical totals are `DM6.3 timesheet_lines.csv`.
- Paid payroll history is `DM6.4 employee_payrolls.csv` and must preserve `EmployeePayroll.timesheetSnapshot`.

## Related Commands or Files

- `scripts/migration/migration-dm-masterlist.ts`
- `scripts/migration/migration-dm-report.ts`
- `scripts/migration/run-dm-quality-tests.ts`
- `tests/enterprise-migration-dm-masterlist.spec.ts`
- `tests/enterprise-migration-dm-report.spec.ts`
- `tests/enterprise-migration-timesheet-quality.spec.ts`
- `tests/enterprise-csv-sample-pack.spec.ts`
- `npm run test:migration:quality`
- `npm run test:ci:source-truth`

## References

- `../docs/attendance-timesheet-payroll-tally-prd.md`
- `docs/testing-strategy.md`
- `.wwg/wiki/project-truth.md`
- `.wwg/wiki/terminology.md`
