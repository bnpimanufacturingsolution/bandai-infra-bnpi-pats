# HRIS Migration Guide (Detailed Runtime Behavior)

This guide explains exactly how migration works in this codebase, including whether user accounts are created and how batching/errors are handled.

## 1. Short answer to your main question

`/api/migration/*` can create user accounts in your third-party auth service when an auth token is present.

It creates:
- `Person` record
- `Employee` record
- and links hierarchy (`reportTo`)
- and can create SSO auth user accounts (`/api/auth/register` with fallback `/api/auth/login`)

Default migration SSO password is `Password123!` (configurable via `MIGRATION_DEFAULT_PASSWORD`).

## 2. Endpoints and what each does

Base: `/api/migration`

- `POST /execute`
  - Runs full migration and writes to DB
- `POST /dry-run`
  - Forces `dryRun=true`, validates/processes flow without DB writes
- `POST /upload-csv`
  - Accepts multipart form-data (`file` + config fields), parses CSV, runs same migration service
- `GET /stats?organizationId=...`
  - Returns counts/grouping summaries
- `GET /hierarchy?organizationId=...&departmentCode=...`
  - Returns department -> level -> employees tree

## 3. Upload CSV form-data contract

For `POST /api/migration/upload-csv`:

- `file` (File) required
- `organizationId` (Text) required
- `batchSize` (Text/Number) optional, default `500`
- `skipDuplicates` (Text/Boolean) optional, default `true`
- `dryRun` (Text/Boolean) optional, default `false`

Example values:
- `organizationId=org-sample-001`
- `batchSize=500`
- `skipDuplicates=true`
- `dryRun=true` (first run), then `false` for real insert

## 4. Behind-the-scenes runtime flow

Source: `app/migration/migration.service.ts`

1. Validate payload (already done in controller with Zod)
2. Upsert levels (default 5 levels when not provided)
3. Upsert departments (explicit + auto-discovered from employees)
4. Upsert positions (explicit + auto-discovered from employees)
5. Build lookup maps in memory for fast ID resolution
6. Group employees by department
7. Sort each group by hierarchy level (`levelRank` or inferred role level)
8. Process each department in chunks (`batchSize`)
9. Inside each chunk, process with limited concurrency (windowed writes)
10. Second pass links `reportToId`

Important tuning constants:
- `MAX_WRITE_CONCURRENCY = 5`
- `BATCH_COOLDOWN_MS = 300`
- retry with exponential backoff for transient Prisma/Mongo errors

## 5. Is it "400 by batch"?

No.

`400` is for request/config validation problems, like:
- missing/invalid fields
- missing file in upload-csv

During migration, row failures are handled per employee and collected in `errors[]`.

Response behavior:
- `200`: all good (`result.success === true`)
- `207`: partial success (`result.success === false`, some rows failed)
- `500`: critical/uncaught error

So batch/row issues do **not** usually return `400`; they return `207` with details.

## 6. Duplicate behavior

Duplicate key basis:
- `@@unique([organizationId, employeeId])`

If employee already exists:
- `skipDuplicates=true` -> employee is skipped
- `skipDuplicates=false` -> existing employee is updated

## 7. Transaction and partial-failure behavior

Current implementation is **not atomic per whole batch**.

- Each employee create/update is handled independently inside the concurrency worker
- A failed row does not rollback successful rows in that chunk
- Migration continues and returns aggregate summary + error list

This is intentional for large imports where best-effort progress is preferred.

## 8. Where third-party account creation happens

Sources:
- `app/migration/migration.service.ts` (for `/api/migration/*`, when token is present)
- `app/employee/employee-import.service.ts` (for `/api/employee/import`)

Both flows:
- creates/finds person
- calls auth service register/login
- stores returned `userId`
- creates/updates employee with `userId`

Endpoints using it:
- `POST /api/migration/execute`
- `POST /api/migration/dry-run` (dry-run validates flow only, no DB writes)
- `POST /api/migration/upload-csv`
- `POST /api/employee/import`

`importEmployees()` currently loops rows sequentially (`for ... of`), so auth calls are row-by-row in that endpoint.

## 9. Recommended production flow

If you need both migration + user accounts:

1. Use migration endpoint with auth token so SSO accounts are created inline.
2. If external auth is unstable, use two-phase flow (`/api/migration/*` then `/api/employee/import`) for retries.
3. Retry only failed account creations.

Why:
- keeps migration fast/stable
- avoids coupling DB import with external auth latency/failures

## 10. Key file references

- `app/migration/migration.controller.ts`
- `app/migration/migration.service.ts`
- `app/migration/migration.router.ts`
- `zod/migration.zod.ts`
- `app/employee/employee-import.service.ts`
- `app/employee/employee.controller.ts`
- `prisma/schema/employee.prisma`
