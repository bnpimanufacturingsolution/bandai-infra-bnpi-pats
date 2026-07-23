# Current Task

## Status
done

## Summary
Bulk upload benefit enrollments from Excel/CSV: modernized `POST /api/employeeBenefit/import` (RECURRING defaults, fail-on-duplicate, COMCODE aliases) + HR Benefits Management 3-step import modal.

## Category
feature / ui-ux

## Packages
- hris-api
- hris-app
- Dual-app: **HR/emp-only (no counterpart)**

## Code changes
### hris-api
- `helper/employee-benefit-import.helper.ts` — column normalize, date/amount parse, row validate
- `app/employeebenefit/employeeBenefit.controller.ts` — rewrite `importBenefits`
- tests: `employee-benefit-import.helper.spec.ts`, `employee-benefit-import.controller.spec.ts`
- docs: `docs/BENEFIT_SCHEDULE_MODES.md`, CHANGELOG, WWG

### hris-app
- `BenefitEnrollmentImportModal` + parse/map helpers + field constants
- Benefits Management **Bulk upload** button (`data-testid=benefit-bulk-upload-button`)
- service/hook `importEmployeeBenefits`
- `xlsx` dependency for client Excel parse
- tests: `benefit-enrollment-import.test.ts`
- docs/CHANGELOG/WWG

## Truth delta
YES — bulk Excel enrollment import contract (columns, fail-on-duplicate, create-form defaults)

## Drift
LOW

## Follow-ups
- Optional: async job for very large sheets
- Optional: uniqueness by (employee, type, enrollment name) for multi-named DMA lines
