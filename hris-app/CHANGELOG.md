# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- Run Payroll: the Quick Actions entry, results page title, and dialog titles formerly labeled **Preview Payroll** / **Payroll Preview** are now **Payroll Management** (it previews dry-run amounts and manages manual additions/deductions via quick-adjust). URL action (`preview-payroll`), payroll engine, and Start Payroll behavior unchanged.

- HR **Benefits Management** bulk upload enrollments: toolbar **Bulk upload** opens a 3-step modal (Upload → Map columns → Verify) for Excel/CSV; maps sample headers (`COMCODE`, `Amount`, `EmployeeID`, `EmployeeName`, `StartPayDate`) to canonical import fields; posts mapped CSV to `POST /api/employeeBenefit/import`. Components: `BenefitEnrollmentImportModal`, `app/lib/utils/benefit-enrollment-import.ts`.
- Benefits enrollment **Attendance rules**: eligibility mode (`ENROLLED_ALWAYS` / `ATTENDANCE_QUALIFIED`) + disqualify flags beside Compute from attendance. Benefit type admin can set eligibility policy defaults; PFA create prefills classic perfect attendance. Contract: `docs/BENEFIT_SCHEDULE_MODES.md`.
- Payroll benefits on HR detail + HTML payslip: group applied benefits under **Benefits applied → Non-taxable / Taxable** using source `isTaxable` (API freeze/enrich). Helper: `app/lib/utils/payroll-benefit-display.ts`.
- Sidebar scrollbar: hidden by default; thin scrollbar only while the sidebar is hovered (role-aware `Sidebar` and admin configuration shell).
- Payroll adjustment **display names**: employee payroll summary, Payroll Adjustments list, and payslip detail show **enrollment name** as primary and **benefit type** as category when multiple benefits share one type (e.g. Rice Subsidy / Travel Allowance under De Minimis). `TimesheetPayrollSourceDetail` includes `benefitTypeName`. HR past-payroll **View payslip** still opens the API PDF, which expands enrollment breakdown live. Contract: `docs/BENEFIT_SCHEDULE_MODES.md` (backend authority `../hris-api/docs/BENEFIT_SCHEDULE_MODES.md`).
- Attendance-based benefit amounts in HR benefits management: **Compute from attendance** toggle with `PER_DAY` (rate × present days) or `PER_CUTOFF` (full cut-off pro-rated for ABSENT days). Amount labels, preview copy, detail view, and create/update payloads send `attendanceBased` / `attendanceAmountBasis`. Contract: `docs/BENEFIT_SCHEDULE_MODES.md`.
- Employee benefit payroll schedule modes in HR benefits management: explicit `TIME_BOUND`, `FIXED_INSTALLMENTS`, and `RECURRING` schedule selectors with mode-specific fields, amount labeling (total vs per payroll period for recurring), optional open-ended end date for recurring, schedule previews, and API-aligned create/update payloads. Product contract: `docs/BENEFIT_SCHEDULE_MODES.md` (backend authority `../hris-api/docs/BENEFIT_SCHEDULE_MODES.md`).
