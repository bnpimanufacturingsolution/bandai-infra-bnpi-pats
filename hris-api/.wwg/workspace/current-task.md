# Current Task

## Status
done

## Summary
Fixed Special Payroll mass-upload / preview 403 `"HR access required"` on `/hr/run-payroll` import preview.

## Category
bugfix | security (auth context read)

## Packages
- `bandai-infra/hris-api`
- Dual-app: **HR/emp-only (no counterpart)** — Special Payroll HR run surfaces; emp-app only consumes released payslips via separate endpoints that do not use the broken HR gate the same way for import

## Root cause (CONFIRMED)
`specialPayroll.controller.ts` `getAuthContext` read only `req.user.role` / `req.user.*`.

`verifyToken` attaches JWT claims on the request itself:
- `req.role`
- `req.userId`
- `req.organizationId`
- `req.metadata.employee.id`

`organizationId` had a fallback so the org check often passed, but `role` was always `null` → `isHr` always `false` → every HR Special Payroll mutation/list (including `POST /api/special-payroll/import/preview`) returned **403 HR access required**.

## Code changes
- `app/specialPayroll/specialPayroll.controller.ts` — read verifyToken fields first; keep `req.user` fallback; export `getAuthContext`; align allowed roles with payroll-period managers (`admin` / `super_admin` / `superadmin`)
- `tests/special-payroll.auth-context.spec.ts` — regression coverage

## Truth delta
NO durable product-truth change. Auth middleware contract was already known (`req.role`); controller was wrong.

## Drift
NONE (docs did not claim the broken `req.user` shape for this controller)

## Follow-ups
- Retry mass upload Preview on `/hr/run-payroll?periodCode=...&periodView=past` after API restart/reload
- Optional: extend same auth-context pattern audit to any other new controllers that read `req.user` only
