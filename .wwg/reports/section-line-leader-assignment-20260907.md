# Section Line Leader Assignment — Implementation (2026-09-07)

Status: `CONFIRMED_CODE_AND_LIVE_LOCAL`

## What was built

Operator chose **option B**: a section can have **multiple line leaders**; an employee can
lead many sections. Many-to-many join model `SectionLineLeader` (table
`section_line_leaders`). This activates the previously dormant `hris-line-leader` role:
assignment now derives the role automatically, and removal deletes membership and
re-derives the role back down.

## Schema

- `hris-api/prisma/schema/sectionlineleader.prisma` (Mongo variant, ObjectId)
- `hris-api/prisma/schema-postgres/sectionlineleader.prisma` (Postgres variant)
- Reverse relations: `Section.lineLeaders`, `Employee.lineLeaderSections`
- Migration: `hris-api/prisma/schema-postgres/migrations/20260907 applied to local DEV (K3s forward 55435).
- `bootstrap.sql` mirror updated (table + FKs + indexes).

## Backend

- `hris-api/helper/section-line-leaders.helper.ts` — `resolveLineLeaderIds`
  (same-org validation, dedupe) + `reconcileSectionLineLeaders` (transactional diff:
  delete removed / create added with `skipDuplicates`), returns changed employee ids.
- `app/section/section.controller.ts`:
  - create/update accept `lineLeaderIds` (zod-validated); reconcile after write;
    response re-reads with `lineLeaders` include (employee + person identity).
  - list GET batches memberships for the page.
  - **delete** captures former leader ids before cascade and re-derives their roles
    after delete (gap found by live proof and fixed).
- `helper/employee-role-sync.helper.ts`:
  - `deriveEmployeeRoleFromOrgLinks(employee, { isLineLeader })`.
  - `syncEmployeeRolesFromOrgStructure` counts `lineLeaderSections` membership.
  - New `syncLineLeaderRolesForEmployees` wrapper.
- `utils/role-derivation.ts`: new `isLineLeader` input; precedence
  HR > manager level > line leader > plain employee; `withFlags` unchanged
  (`hris-line-leader` was already treated as manager class).
- Employee hard delete (`app/employee/employee.controller.ts`): now detaches
  `Section.headId` (pre-existing gap fixed) and deletes `sectionLineLeader` rows
  before delete.

## Frontend

- `hris-app/app/routes/admin/configuration/sections.tsx`:
  - Line Leaders **column** in the sections table (first 2 names + "+N").
  - Edit form: removable chips + "Add line leader..." single-select that clears
    after each add; honest "Loading employees..." placeholder while roster loads.
  - View modal: Line leaders row.
  - CSV export includes Line Leaders column.
- `hris-app/app/services/sections.service.ts`: `SectionLineLeaderMembership`,
  `lineLeaders`, `lineLeaderIds` on create/update requests.

## Tests

- `hris-api/tests/section-line-leaders.spec.ts` — **15/15 passing** (resolve
  dedupe/missing, reconcile diff/idempotent/no-op, role derivation precedence incl.
  manager/HR wins and legacy-path no-grant).
- `hris-api/tests/role-derivation.spec.ts` — 55/55 still passing (no regression).
- `hris-app/tests/smoke/admin-config-sections-line-leaders.spec.ts` — **2/2 passing**
  (column render; edit modal chips load + remove).

## Live API round-trip proof (K3s DEV forward, admin actor)

Evidence: `hris-api/.runtime/20260907-section-ll-proof/` +
`.runtime/browser-evidence/sections-line-leaders-live/proof.json` + screenshot.

1. CREATE section with 1 leader → 201, membership row + `lineLeaders` include.
2. Role auto-upgrade: TESTBEN004 → `hris-line-leader`, `isManager=true`.
3. UPDATE adds second leader → both leaders upgraded.
4. UPDATE removing one leader → removed employee auto-demoted
   (`hris-employee`/`isManager=false`); kept leader unchanged.
5. DELETE section → join rows cascade; **initially ex-leader role stayed stale**
   → controller fixed → re-proved: ex-leader auto-demoted after section delete.
6. Browser proof on real app (5175→3001→DEV DB): LINE LEADERS column renders;
   edit modal shows "Line Leaders (optional)" + chip/remove UI + add select.

All temp proof sections deleted; TESTBEN004/TESTBEN003 back to `hris-employee`.

## DEV db-init drift repair (push blocker removed)

- K3s DEV held stale `requests_type_backup_20260826` (47 rows, backup of
  requests_type from the 2026-08-26 day-status repair) which would make the
  schema-only GitOps `prisma-postgres:push` demand `--accept-data-loss` and fail
  `hris-api-db-init` (runtime-dev was already `Synced/Degraded` before this work).
- Read-only export first: `hris-api/scripts/export-dev-requests-type-backup.ts` →
  `.runtime/dev-dbinit-drift-repair-20260907/requests_type_backup_20260826.export.json`
  (47 rows, full JSON).
- Then `DROP TABLE` on DEV. Local `prisma db push` now syncs clean (9.44s).

## Boundary

- Local DEV proven. VM/GitOps promotion follows the develop push + ansible-pull
  rebuild; DEV db-init should turn green after the failed Job is released by the
  new schema-only revision.
- LLA money remains enrollment-driven (`EmployeeBenefit` code `LLA`); no
  auto-award from assignment (Project Truth doctrine unchanged).
- Day-labor tagging scope (leader tags only own-section people) remains a
  candidate recommendation, not implemented.
