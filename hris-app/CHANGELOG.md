# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- Payroll adjustment **display names**: employee payroll summary, Payroll Adjustments list, and payslip detail show **enrollment name** as primary and **benefit type** as category when multiple benefits share one type (e.g. Rice Subsidy / Travel Allowance under De Minimis). `TimesheetPayrollSourceDetail` includes `benefitTypeName`. HR past-payroll **View payslip** still opens the API PDF, which expands enrollment breakdown live. Contract: `docs/BENEFIT_SCHEDULE_MODES.md` (backend authority `../hris-api/docs/BENEFIT_SCHEDULE_MODES.md`).
- Attendance-based benefit amounts in HR benefits management: **Compute from attendance** toggle with `PER_DAY` (rate × present days) or `PER_CUTOFF` (full cut-off pro-rated for ABSENT days). Amount labels, preview copy, detail view, and create/update payloads send `attendanceBased` / `attendanceAmountBasis`. Contract: `docs/BENEFIT_SCHEDULE_MODES.md`.
- Employee benefit payroll schedule modes in HR benefits management: explicit `TIME_BOUND`, `FIXED_INSTALLMENTS`, and `RECURRING` schedule selectors with mode-specific fields, amount labeling (total vs per payroll period for recurring), optional open-ended end date for recurring, schedule previews, and API-aligned create/update payloads. Product contract: `docs/BENEFIT_SCHEDULE_MODES.md` (backend authority `../hris-api/docs/BENEFIT_SCHEDULE_MODES.md`).
