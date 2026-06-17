# Reusable Employee Migration Blueprint

This document is a reusable reference for implementing high-volume employee migration with hierarchy-aware logic, B-tree index strategy, and form-data/API support.

Use this guide when you want to replicate the same migration architecture in another project.

## 1. Goals

- Migrate large employee datasets safely (`6k+`, scalable to `50k+`)
- Preserve business hierarchy (department + level + manager chain)
- Keep import fast and resilient (retry/backoff, controlled parallelism)
- Support both:
    - API JSON payload
    - API `multipart/form-data` (CSV upload)
- Avoid duplicate employee creation

## 2. Core Architecture

### 2.1 Pipeline

1. Parse input (`JSON` or `CSV`)
2. Validate rows (Zod schema)
3. Upsert dictionary entities:
    - `Level`
    - `Department`
    - `Position`
4. Build lookup maps (code/name -> ObjectId)
5. Group employees by department
6. Sort by hierarchy level (`1 -> 5`)
7. Insert employees:
    - fast path: `createMany` in parallel windows
    - fallback path: per-row `upsert`
8. Deferred bulk manager linking (`reportToId`) in second pass
9. Return migration summary + errors

### 2.2 Why this works

- Hierarchy consistency: managers are processed before subordinates
- Better throughput: batch windows + limited parallelism
- Better reliability: retries for transient DB/network errors
- Better maintainability: clear separation (validation, dictionaries, insert, link)

## 3. Data Model Requirements

You need these entities:

- `Employee`
- `Department`
- `Position`
- `Level`

Key fields in `Employee`:

- `organizationId`
- `employeeId` (business unique key)
- `departmentId`
- `positionId`
- `levelId`
- `reportToId` (self-reference)

## 4. Index Strategy (B-Tree)

Recommended `Employee` indexes:

- `@@unique([organizationId, employeeId])`
- `@@index([organizationId])`
- `@@index([departmentId, levelId])`
- `@@index([organizationId, departmentId])`
- `@@index([organizationId, departmentId, levelId])`
- `@@index([reportToId])`

Why:

- Unique key enables idempotent migration
- Compound indexes speed hierarchy queries and stats
- `reportToId` index speeds manager/subordinate traversal

## 5. Input Contract

## 5.1 Employee row fields

Required:

- `employeeId`
- `firstName`
- `lastName`
- `email`
- `role`
- `departmentCode`
- `positionCode`
- `basicSalary`

Optional:

- `departmentName`
- `positionTitle`
- `levelName`
- `levelRank`
- `reportToEmployeeId`
- `hireDate`

Enums must be strict and validated.

## 5.2 Migration config

Example:

```json
{
	"organizationId": "org-sample-001",
	"batchSize": 1000,
	"maxParallelBatches": 6,
	"skipDuplicates": true,
	"dryRun": false
}
```

Meaning:

- `batchSize`: records per batch
- `maxParallelBatches`: concurrent batch windows
- `skipDuplicates`: fast insert mode (no update for existing rows)
- `dryRun`: validate/plan only, no DB writes

Optional SSO account provisioning (during migration execution):

- Pass auth token in request (`Authorization: Bearer <token>` or `token` cookie).
- For each new employee, call third-party auth register/login and store returned `userId` in `Person` and `Employee`.
- Use shared default password `Password123!` (or env override `MIGRATION_DEFAULT_PASSWORD`).
- Use env role IDs (`AUTH_ROLE_ID_EMPLOYEE`, `AUTH_ROLE_ID_EMPLOYEE_MANAGER`) to map employee vs manager.
- Keep auth failures non-blocking per row and return them in migration `errors[]`.

## 6. Algorithm Design

### 6.1 Role level inference

If `levelRank` is missing, infer from role text.

Example mapping:

- director/head/chief -> `1`
- manager/lead -> `2`
- senior/officer -> `3`
- default regular -> `4`
- intern/junior/trainee -> `5`

### 6.2 Department-first processing

Group rows by `departmentCode`, then sort each group by `levelRank`.

This enforces top-down hierarchy.

### 6.3 Insert strategy

Use two modes:

1. `skipDuplicates=true`:
    - `createMany` for speed
    - prefilter known IDs (in-memory map/set) to emulate duplicate skip when DB driver lacks `skipDuplicates`
2. `skipDuplicates=false`:
    - `upsert` with controlled concurrency for update behavior

### 6.4 Deferred manager linking

Do not link `reportTo` during initial insert.

After all employees exist:

- build `employeeId -> _id` map
- run bulk updates in batches (raw Mongo update command)

This avoids ordering constraints and reduces write overhead.

## 7. API Design

Endpoints:

- `POST /api/migration/execute` (JSON)
- `POST /api/migration/dry-run` (JSON)
- `POST /api/migration/execute-form` (form-data)
- `POST /api/migration/dry-run-form` (form-data)
- `GET /api/migration/stats`
- `GET /api/migration/hierarchy`

Form-data fields:

- required text: `config` (JSON string)
- optional file: `file` (CSV)
- optional text: `employees` (JSON array string)
- optional text: `departments`, `positions`, `levels` (JSON array strings)

## 8. Performance Tuning

Start with:

- `batchSize=1000`
- `maxParallelBatches=6`

If DB is saturated:

1. lower `maxParallelBatches` first (`6 -> 3`)
2. lower `batchSize` next (`1000 -> 500`)

For small/shared Mongo tiers:

- use `parallel=2..4`
- keep retries and short cooldown between windows

## 9. Reliability Controls

Implement:

- retry with exponential backoff for transient DB errors
- per-batch error collection
- fallback path (batch fail -> row-level upsert)
- dry-run mode
- final summary:
    - created
    - skipped
    - failed
    - errors[]
    - duration

## 10. Optional Index Maintenance for Very Large Imports

For very large imports (`100k+`), optionally:

1. drop secondary indexes temporarily
2. keep only required indexes (`_id`, unique business key)
3. migrate
4. recreate secondary indexes

Do this only in controlled windows and not during heavy live traffic.

## 11. Portability Checklist (Copy to New Project)

1. Copy validation schema (`EmployeeRow`, config)
2. Copy migration service structure:
    - upsert dictionaries
    - build lookups
    - group/sort
    - insert
    - deferred link
3. Copy retry utility
4. Add indexes in new Prisma schema
5. Add API controller/router (JSON + form-data)
6. Add CSV importer script
7. Add docs and sample curl requests
8. Test with:
    - dry-run
    - partial invalid rows
    - duplicate file replay
    - 10k synthetic data

## 12. Reusable Pseudocode

```ts
validate(input)
upsertLevels()
upsertDepartments()
upsertPositions()

lookups = buildLookupMaps()
groups = groupByDepartment(employees)

for each department in groups:
  rows = sortByLevel(rows)
  insertRows(rows, batchSize, parallel)

linkReportToInBulk()
return summary
```

## 13. Security / Operations Notes

- Keep migration endpoints authenticated
- Never commit real secrets in `.env.example`
- Rotate credentials if leaked
- Log migration activity and errors with correlation IDs
- Cap upload size for CSV/form-data

## 14. What to Reuse Directly in This Repository

Main files:

- `server/app/migration/migration.service.ts`
- `server/app/migration/migration.controller.ts`
- `server/app/migration/migration.router.ts`
- `server/zod/migration.zod.ts`
- `server/scripts/import-migration-csv.ts`
- `server/scripts/generate-employee-csv.ts`

Reference docs:

- `server/docs/MIGRATION_GUIDE.md`
- `server/docs/EMPLOYEE_MIGRATION_REUSABLE_GUIDE.md`
