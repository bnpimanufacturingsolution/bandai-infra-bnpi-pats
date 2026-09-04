# Timekeeper Seed Users - Prompt for Another Model

## Context
Project: Bandai HRIS (monorepo: `hris-api` + `hris-app`)
Role: `hris-timekeeper` — kiosk biometric time logging (`/time-logging`)

## What Was Done
Added 2 timekeeper seed users to `hris-api/prisma/seeds/generalEmployeeSeeder.shared.ts` (lines 936-958):

```typescript
{
  firstName: "Rosa",
  lastName: "Aquino",
  email: "timekeeper1@seed.local",
  employeeCode: "EMP-HR-TK-001",
  role: "hris-timekeeper",
  departmentCode: "HR",
  sectionCode: "HR-OPS",
  positionCode: "HR-GEN",
  levelName: "Entry",
  salary: 18000,
  reportsToEmail: "hr-manager@seed.local",
  includeOvertime: true,
},
{
  firstName: "Pedro",
  lastName: "Castro",
  email: "timekeeper2@seed.local",
  employeeCode: "EMP-HR-TK-002",
  role: "hris-timekeeper",
  departmentCode: "HR",
  sectionCode: "HR-OPS",
  positionCode: "HR-GEN",
  levelName: "Entry",
  salary: 18000,
  reportsToEmail: "hr-manager@seed.local",
  includeOvertime: true,
}
```

## Verification Needed

**Do NOT run `npm run prisma-seed` against a runtime DB** (DEV/UAT/PROD): the GitOps db-init Job is schema-only and full seeding on runtime data is banned (it can reset timesheet/attendance rows).

Use the scoped, idempotent provisioning script instead (creates only the two kiosk accounts):

```bash
cd hris-api
npx tsx scripts/provision-timekeeper-accounts.ts                       # dry-run plan
npx tsx scripts/provision-timekeeper-accounts.ts --execute             # apply (default K3s DEV forward 127.0.0.1:55435)
npx tsx scripts/provision-timekeeper-accounts.ts --execute --reset-password  # also reset existing accounts' password
```

Full `prisma-seed` is only for disposable local DBs.

## Test Login
After provisioning, access `/time-logging` with:
- `timekeeper1@seed.local` / `password123`
- `timekeeper2@seed.local` / `password123`

Proven live on public DEV 2026-09-04: login 200 + `/auth/me` role `hris-timekeeper` + kiosk renders. UAT/PROD still need provisioning (operator approval pending).

## Existing Guard
`hris-app/app/guard/TimeLoggingGuard.tsx` requires `hris-timekeeper` role — already configured.

## Reporting Hierarchy
`hris-api/prisma/seeds/addReportToId.ts:20` maps `hris-timekeeper` → `hris-hr-manager` (already wired).

---

## Prompt for Next Model
> "Verify the timekeeper seed users exist in the database after running `npm run prisma-seed` inside the VM. Confirm they can log into `/time-logging` and the kiosk screen loads. Check that the reporting line (timekeeper → HR manager) is correct in the org chart."