# Employee Migration CSV Upload Testing Guide

This guide is for testing employee migration via CSV upload using your current `Hris-Api` implementation.

Important note: `docs/csv/sample-employees.csv` is the canonical enterprise mock migration pack
fixture and is intentionally paired with the rest of the `docs/csv/sample-*.csv` files. It is not
the direct file contract for `/api/migration/upload-csv`, which still expects the
enterprise/canonical employee columns documented below.

Important: migration creates/updates HRIS data only. It does **not** create SSO/auth users in this flow.

## Endpoint

- Method: `POST`
- URL: `/api/migration/upload-csv`
- Full local URL: `http://localhost:3000/api/migration/upload-csv`
- Content type: `multipart/form-data`
- Auth: required (`Authorization: Bearer <token>` or `token` cookie)

## Required form-data fields

- `file` (required): CSV file
- `organizationId` (required): organization id string

## Optional form-data fields

- `batchSize` (number, default `500`, min `50`, max `2000`)
- `maxParallelBatches` (number, default `6`, min `1`, max `20`)
- `skipDuplicates` (`true|false`, default `true`)
- `dryRun` (`true|false`, default `false`)

## CSV columns

Required columns:

- `employeeId`
- `firstName`
- `lastName`
- `email`
- `role`
- `departmentCode`
- `positionCode`
- `basicSalary`

Recommended/optional columns:

- `middleName`
- `departmentName`
- `positionTitle`
- `levelName`
- `levelRank`
- `currency`
- `payFrequency`
- `employmentType`
- `employmentStatus`
- `workLocation`
- `employmentHireDate` (or `hireDate`)
- `reportToEmployeeId`

### Enum values

- `payFrequency`: `DAILY`, `WEEKLY`, `BIWEEKLY`, `SEMI_MONTHLY`, `MONTHLY`, `QUARTERLY`, `ANNUALLY`
- `employmentType`: `REGULAR`, `PROBATIONARY`, `CONTRACTUAL`, `PART_TIME`, `CONSULTANT`, `INTERN`
- `employmentStatus`: `ACTIVE`, `RESIGNATION_REQUESTED`, `SERVING_NOTICE`, `OFFBOARDING`, `ONBOARDING`, `INACTIVE`, `TERMINATED`, `RESIGNED`, `FORMER_EMPLOYEE`, `RETIRED`, `ON_LEAVE`
- `workLocation`: `ONSITE`, `REMOTE`, `HYBRID`

## Enterprise Upload Example CSV

```csv
employeeId,firstName,lastName,middleName,email,role,departmentCode,departmentName,positionCode,positionTitle,levelName,levelRank,basicSalary,currency,payFrequency,employmentType,employmentStatus,workLocation,employmentHireDate,reportToEmployeeId
EMP-0001,Juan,Santos,R,juan.santos@example.com,Tech Lead,IT,Information Technology,IT-TL,Tech Lead,Manager / Lead,2,120000,PHP,SEMI_MONTHLY,REGULAR,ACTIVE,ONSITE,2025-01-15,
EMP-0002,Maria,Cruz,,maria.cruz@example.com,Senior Developer,IT,Information Technology,IT-SD,Senior Developer,Senior,3,85000,PHP,SEMI_MONTHLY,REGULAR,ACTIVE,HYBRID,2025-02-01,EMP-0001
```

## Test with curl

### 1) Dry run first

```bash
curl -X POST "http://localhost:3000/api/migration/upload-csv" \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -F "file=@./employee-upload-enterprise.csv" \
  -F "organizationId=org-sample-001" \
  -F "batchSize=500" \
  -F "maxParallelBatches=6" \
  -F "skipDuplicates=true" \
  -F "dryRun=true"
```

### 2) Execute real migration

```bash
curl -X POST "http://localhost:3000/api/migration/upload-csv" \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -F "file=@./employee-upload-enterprise.csv" \
  -F "organizationId=org-sample-001" \
  -F "batchSize=500" \
  -F "maxParallelBatches=6" \
  -F "skipDuplicates=true" \
  -F "dryRun=false"
```

## Test with Postman

1. Create `POST http://localhost:3000/api/migration/upload-csv`
2. In Headers, add `Authorization: Bearer <YOUR_TOKEN>`
3. Body -> `form-data`
4. Add key `file`, type `File`, choose your CSV
5. Add text keys:
- `organizationId`
- `batchSize`
- `maxParallelBatches`
- `skipDuplicates`
- `dryRun`
6. Send

## Expected responses

- `200`: migration completed successfully
- `207`: partial success (some rows failed)
- `400`: validation/config/file issue
- `500`: internal server error

Response contains summary like:

- `departments.created/existing`
- `positions.created/existing`
- `levels.created/existing`
- `employees.created/skipped/failed`
- `errors[]`

## Verify results after execution

Use these endpoints:

1. `GET /api/migration/stats?organizationId=<orgId>`
2. `GET /api/migration/hierarchy?organizationId=<orgId>`

Example:

```bash
curl -H "Authorization: Bearer <YOUR_TOKEN>" \
  "http://localhost:3000/api/migration/stats?organizationId=org-sample-001"
```

## Common failures and fixes

- `CSV file is required...`
  - Ensure form-data key name is exactly `file`.
- `Validation failed`
  - Check required columns and enum values.
- `expected X columns but got Y`
  - Fix malformed CSV rows/commas/quotes.
- duplicate employees on replay
  - keep `skipDuplicates=true` for idempotent re-run.
- missing manager links
  - ensure `reportToEmployeeId` references a valid `employeeId` in the same org.

