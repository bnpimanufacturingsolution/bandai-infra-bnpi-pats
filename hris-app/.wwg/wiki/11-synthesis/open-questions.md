# Open Questions

Status: ACTIVE

## Product Identity

- What is the canonical product name: HRIS Workforce System, hris-app, another brand name, or client-specific name?
- Should `package.json` and README be updated away from `react-app-template`?

## Roles And Access

- What are the canonical user-facing role names?
- What is the final permission matrix for admin, HR admin, HR manager, HR user, employee manager, employee, timekeeper, and super admin?
- Which authorization decisions are enforced only by backend APIs, and which are intentionally enforced in frontend routes?

## Employee And HR Policy

- What employee status-change criteria are final policy versus draft guidance?
- What are the leave accrual, carryover, approval, and payroll-impact rules?
- What are the retention rules for employee documents, applicant data, attendance records, and payroll artifacts?

## Payroll And Billing

- Is payroll calculation production-grade, preview-only, or integration support?
- Which statutory deductions, tax rules, and pay-frequency rules apply?
- When does timesheet or attendance approval lock payroll?

## Deployment And Secrets

- Have the tracked Firebase admin SDK JSON credentials already been revoked or rotated?
- Should the tracked Firebase admin SDK JSON files be removed from the repository after owner approval?
- Which Firebase environments are approved for local, CI, UAT, and production deployment?
- Which GitHub secrets are authoritative for deploy workflows?

## Testing And Governance

- Which WWG proposed regression tests should be accepted and implemented first?
- Which critical/high regression gaps can be waived, and by whom?
- Should the context docs added during this review become accepted truth after owner review?
