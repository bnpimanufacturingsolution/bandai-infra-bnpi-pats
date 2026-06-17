# hris-app

Working React Router frontend for the HRIS / workforce management system.

Project identity is still under WWG adoption review. The implemented product is an HRIS app; the final product name and package metadata need owner confirmation before broader renaming.

## Scope

This repository owns the frontend app surface:

- HR, admin, manager, employee, and public applicant routes.
- UI behavior, route configuration, client request payloads, and browser workflows.
- App-side tests and deployment quality gates.

The paired backend API lives in `../hris-api` and owns backend authorization, persistence, database invariants, API contracts, load tests, and soak tests.

## Quality Gates

Use the fast deployable gate before merging or deploying app changes:

```bash
npm run quality:ci
```

`quality:ci` runs:

- `npm run test:obligations`
- `npm run test:ci`
- `npm run build`

Use the strict hardening gate for release-candidate review while existing lint/type/route debt is being burned down:

```bash
npm run quality:strict
```

## Development

```bash
npm install
npm run dev
```

Other useful commands:

```bash
npm run test:ci
npm run test:migration:ui-quality
npm run lint
npm run lint:fix
```

## Safety Notes

- Do not test against production employee data.
- Do not run deployment, deletion, migration, credential, or irreversible operations without explicit approval.
- Firebase admin SDK JSON files previously detected in the repository must be treated as exposed until the owner confirms rotation/removal.
- Attendance, timesheet, approved OT, payroll tally, and payroll-history source-of-truth rules are documented in `../docs/attendance-timesheet-payroll-tally-prd.md`.
