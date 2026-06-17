# Employee Migration Endpoint Guide

This document explains how to test and use the migration endpoint in this repo.

## 1. What this endpoint does

Base route: `/api/migration`

Main endpoints:

- `POST /api/migration/dry-run`
- `POST /api/migration/execute`
- `POST /api/migration/upload-csv`
- `GET /api/migration/stats?organizationId=...`
- `GET /api/migration/hierarchy?organizationId=...&departmentCode=...`

Pipeline used by the service (`app/migration/migration.service.ts`):

1. Parse CSV rows (for upload endpoint) or use JSON body
2. Validate each row with Zod
3. Upsert levels (default 5 if not provided)
4. Upsert departments (auto-discovered)
5. Upsert positions (auto-discovered)
6. Build in-memory lookup maps
7. Group employees by department
8. Sort by role level (1 to 5)
9. Batch insert with controlled concurrency
10. Link `reportTo` in a second pass

Indexes relied on (`prisma/schema/employee.prisma`):

- `@@unique([organizationId, employeeId])`
- `@@index([departmentId, levelId])`
- `@@index([organizationId, departmentId])`

## 2. Important behavior: account creation

`/api/migration/*` creates `Person` and `Employee` records, but it does **not** create auth-service user accounts.

If you need an account for every employee:

- Use `/api/employee/import` for account provisioning, or
- Run account provisioning as a separate async job after migration

Do not call external auth-service registration per row inside migration. That is a common performance anti-pattern for large batches.

## 3. Auth requirement

`/api/migration/*` is protected by `verifyToken` middleware.

You can authenticate with:

- cookie: `token=<jwt>`
- header: `Authorization: Bearer <jwt>`

## 4. Prerequisites

From `Hris-Api`:

```bash
npm install
npm run prisma-generate
npx prisma db push
npm run dev
```

Generate your test CSV (you already have this):

```bash
npm run generate:csv
```

Default output from script:

- `prisma/seeds/data/employees-6000.csv`

## 5. Test flow (recommended)

### Step A: Dry run first (JSON)

```bash
curl -X POST http://localhost:3000/api/migration/dry-run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -d '{
    "config": {
      "organizationId": "org-sample-001",
      "batchSize": 500,
      "skipDuplicates": true
    },
    "employees": [
      {
        "employeeId": "EMP-00001",
        "firstName": "Juan",
        "lastName": "Santos",
        "email": "juan.santos@example.com",
        "role": "Tech Lead",
        "departmentCode": "IT",
        "departmentName": "IT Department",
        "positionCode": "IT-TL",
        "positionTitle": "Tech Lead",
        "levelName": "Manager / Lead",
        "levelRank": 2,
        "basicSalary": 120000,
        "currency": "PHP",
        "payFrequency": "SEMI_MONTHLY",
        "employmentType": "REGULAR",
        "employmentStatus": "ACTIVE",
        "workLocation": "HYBRID"
      }
    ]
  }'
```

Expected:

- HTTP `200`
- message: dry run completed
- summary with counts
- no DB write

### Step B: Execute migration (JSON)

Same payload, call `/execute`:

```bash
curl -X POST http://localhost:3000/api/migration/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -d '{ ...same payload as dry-run... }'
```

Expected:

- HTTP `200` when all rows are successful
- HTTP `207` when partial failures happen
- response includes created/skipped/failed summary

### Step C: Execute migration (CSV upload)

```bash
curl -X POST http://localhost:3000/api/migration/upload-csv \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -F "file=@prisma/seeds/data/employees-6000.csv" \
  -F "organizationId=org-sample-001" \
  -F "batchSize=500" \
  -F "skipDuplicates=true" \
  -F "dryRun=false"
```

Notes:

- field name must be `file`
- upload limit is 50MB
- supported import file extensions: `.csv`, `.xlsx`, `.xls`

## 6. Validate result

Check migration stats:

```bash
curl "http://localhost:3000/api/migration/stats?organizationId=org-sample-001" \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

Check hierarchy view:

```bash
curl "http://localhost:3000/api/migration/hierarchy?organizationId=org-sample-001" \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

Optional DB checks:

- verify employee count
- verify `reportToId` links are populated
- verify unique key behavior on re-run

## 7. Performance-safe settings

For 6,000 rows, use:

- `batchSize: 400-500`
- `skipDuplicates: true` for idempotent reruns
- run `dry-run` before `execute`
- avoid account creation calls inside migration transaction path

Why:

- migration service already uses limited write concurrency and cooldowns to avoid connection pool saturation
- external network calls per employee drastically increase latency and failure rate

## 8. Creating accounts for all migrated employees

Recommended sequence:

1. Run `/api/migration/upload-csv` or `/api/migration/execute` first
2. Provision auth accounts in a second phase via `/api/employee/import` or a background worker
3. Reconcile failures and retry only failed account records

This keeps data migration fast and stable while still achieving "one account per employee".

## 9. Common failure cases

- `400 Validation failed`: payload/CSV does not match Zod schema
- `401 Unauthorized`: missing/invalid token
- `207 Multi-Status`: migration partially succeeded; inspect `errors` array
- duplicate employee IDs: skipped when `skipDuplicates=true`

## 10. Code references

- `app/migration/migration.router.ts`
- `app/migration/migration.controller.ts`
- `app/migration/migration.service.ts`
- `zod/migration.zod.ts`
- `middleware/verifyToken.ts`
- `middleware/upload.ts`
- `prisma/schema/employee.prisma`
- `scripts/generate-employee-csv.ts`
