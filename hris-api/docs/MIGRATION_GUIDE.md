# Employee Migration Guide — Complete Testing Guide

This guide explains how to test the full migration flow end-to-end: generate test data, run via CLI or API, and verify the results in MongoDB.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites & Setup](#2-prerequisites--setup)
3. [Quick Start (5 min)](#3-quick-start-5-min)
4. [Test Method A — CLI Script (no auth needed)](#4-test-method-a--cli-script-no-auth-needed)
5. [Test Method B — API Endpoints with Postman/curl](#5-test-method-b--api-endpoints-with-postmancurl)
6. [Test Method C — Prisma Seeder](#6-test-method-c--prisma-seeder)
7. [Verifying Results](#7-verifying-results)
8. [Troubleshooting](#8-troubleshooting)
9. [Performance Tuning](#9-performance-tuning)
10. [Data Contract Reference](#10-data-contract-reference)

---

## 1. Architecture Overview

```
                        ┌─────────────────────────────────────────────┐
                        │              Migration Pipeline             │
                        │                                             │
  CSV File ───────────> │  1. Parse CSV rows                         │
       or               │  2. Zod-validate every row                 │
  JSON Body ──────────> │  3. Upsert Levels (5 default)              │
                        │  4. Upsert Departments (auto-discovered)   │
                        │  5. Upsert Positions (auto-discovered)     │
                        │  6. Build in-memory lookup maps (O(1))     │
                        │  7. Group employees by department           │
                        │  8. Sort each group by role level (1→5)    │
                        │  9. Batch insert (400–500/batch)           │
                        │ 10. Link reportTo in second pass           │
                        │                                             │
                        │  B-tree indexes used:                       │
                        │  @@unique([organizationId, employeeId])     │
                        │  @@index([departmentId, levelId])           │
                        │  @@index([organizationId, departmentId])    │
                        └─────────────────────────────────────────────┘
```

**Three ways to test:**

| Method            | Auth Required      | Input               | Best For                    |
| ----------------- | ------------------ | ------------------- | --------------------------- |
| **CLI Script**    | No (direct Prisma) | CSV file            | Quick local testing         |
| **API Endpoints** | Yes (JWT cookie)   | JSON body           | Integration/Postman testing |
| **Prisma Seeder** | No (direct Prisma) | In-memory generated | Automated seeding           |

---

## 2. Prerequisites & Setup

### 2.1 Install dependencies

```bash
cd server
npm install
```

### 2.2 Configure environment

Create or update `.env` in the `server/` directory:

```env
DATABASE_URL="mongodb+srv://<user>:<password>@<cluster>/<dbname>?retryWrites=true&w=majority"
JWT_SECRET="your-jwt-secret-here"
PORT=3000
```

> **Tip:** For local MongoDB, use `mongodb://localhost:27017/btree-indexing`

### 2.3 Generate Prisma client & push schema

```bash
npm run prisma-generate
npx prisma db push
```

This creates all collections and applies the B-tree indexes defined in `prisma/schema/employee.prisma`.

### 2.4 Verify indexes were created

Open Prisma Studio to visually inspect your DB:

```bash
npm run prisma-docs
```

Or check indexes directly in MongoDB shell:

```js
db.employees.getIndexes();
// Should show: organizationId_employeeId (unique), departmentId_levelId, etc.
```

### 2.5 Start the server (only needed for API testing)

```bash
npm run dev
```

Server runs on `http://localhost:3000` by default.

---

## 3. Quick Start (5 min)

If you just want to run it and see results immediately:

```bash
cd server

# Step 1: Generate the 6,000-row test CSV
npm run migration:csv:generate

# Step 2: Dry-run (validates everything, writes nothing)
npm run migration:csv:import -- --dry-run

# Step 3: Real import
npm run migration:csv:import
```

That's it. Check the console output for the summary.

---

## 4. Test Method A — CLI Script (no auth needed)

This bypasses the HTTP layer and auth middleware entirely. Uses Prisma directly.

### 4.1 Generate the test CSV

```bash
npm run migration:csv:generate
```

Output: `server/prisma/seeds/data/employees-6000.csv`

The CSV contains 6,000 employees across 6 departments (IT, Sales, HR, Marketing, Finance, Operations), with a realistic hierarchy distribution:

| Level | Name            | Count per Dept | Total |
| ----- | --------------- | -------------- | ----- |
| 1     | Director / Head | 20             | 120   |
| 2     | Manager / Lead  | 80             | 480   |
| 3     | Senior          | 200            | 1,200 |
| 4     | Regular         | 500            | 3,000 |
| 5     | Intern / Junior | 200            | 1,200 |

### 4.2 Dry-run first (recommended)

```bash
npx ts-node scripts/import-migration-csv.ts \
  --file prisma/seeds/data/employees-6000.csv \
  --org org-sample-001 \
  --batch 500 \
  --dry-run
```

**Expected output:**

```
Starting migration from CSV: employees=6000, depts=6, positions=30, batch=500, dryRun=true
Migration result summary:
- departments: created=6, existing=0
- positions: created=30, existing=0
- levels: created=5, existing=0
- employees: created=6000, skipped=0, failed=0
- durationMs=<few hundred ms>
```

If you see errors here, fix your CSV or schema before proceeding.

### 4.3 Execute real import

```bash
npx ts-node scripts/import-migration-csv.ts \
  --file prisma/seeds/data/employees-6000.csv \
  --org org-sample-001 \
  --batch 500
```

**Expected output:**

```
Starting migration from CSV: employees=6000, depts=6, positions=30, batch=500, dryRun=false
  Grouped employees into 6 departments
  Processing department=IT: 1000 employees, sorted by hierarchy
    Batch 1/2 (500 records)
    Batch 2/2 (500 records)
  Processing department=SALES: 1000 employees, sorted by hierarchy
    ...
  Linking 5880 reportTo references...
  Linked 5880 reportTo references
Migration result summary:
- departments: created=6, existing=0
- positions: created=30, existing=0
- levels: created=5, existing=0
- employees: created=6000, skipped=0, failed=0
- durationMs=<seconds to tens of seconds>
```

### 4.4 CLI flags reference

| Flag                   | Default                                | Description                                   |
| ---------------------- | -------------------------------------- | --------------------------------------------- |
| `--file <path>`        | `prisma/seeds/data/employees-6000.csv` | CSV file to import                            |
| `--org <id>`           | `org-sample-001`                       | Organization ID                               |
| `--batch <size>`       | `500`                                  | Batch size (50–2000)                          |
| `--dry-run`            | `false`                                | Validate only, no DB writes                   |
| `--no-skip-duplicates` | skip enabled                           | Update existing employees instead of skipping |

### 4.5 Re-run idempotently

Running the same import again will **skip** all 6,000 employees (because `skipDuplicates` defaults to `true` and the `@@unique([organizationId, employeeId])` index catches them):

```bash
npx ts-node scripts/import-migration-csv.ts --org org-sample-001
# employees: created=0, skipped=6000, failed=0
```

To update existing records instead:

```bash
npx ts-node scripts/import-migration-csv.ts --org org-sample-001 --no-skip-duplicates
# employees: created=0, skipped=6000(updated), failed=0
```

---

## 5. Test Method B — API Endpoints with Postman/curl

Migration API routes are protected by JWT cookie authentication. You need a valid `token` cookie.

### 5.1 Get a JWT token

**Option A — Login through your auth endpoint:**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "your-password"}' \
  -c cookies.txt
```

**Option B — Generate a token manually (for local testing):**

```bash
node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { userId: 'test-user-001', role: 'admin', organizationId: 'org-sample-001' },
  process.env.JWT_SECRET || 'your-jwt-secret-here',
  { expiresIn: '24h' }
);
console.log(token);
"
```

Copy the token output. Use it as the `token` cookie in subsequent requests.

### 5.2 API Endpoints

#### POST /api/migration/dry-run — Validate without inserting

```bash
curl -X POST http://localhost:3000/api/migration/dry-run \
  -H "Content-Type: application/json" \
  --cookie "token=<YOUR_JWT_TOKEN>" \
  -d '{
    "config": {
      "organizationId": "org-sample-001",
      "batchSize": 1000,
		"maxParallelBatches": 6,
      "skipDuplicates": true,
      "dryRun": true
    },
    "employees": [
      {
        "employeeId": "EMP-00001",
        "firstName": "Juan",
        "lastName": "Santos",
        "email": "juan.santos@example.com",
        "role": "Tech Lead",
        "departmentCode": "IT",
        "departmentName": "Information Technology",
        "positionCode": "IT-TL",
        "positionTitle": "Tech Lead",
        "basicSalary": 120000
      },
      {
        "employeeId": "EMP-00002",
        "firstName": "Maria",
        "lastName": "Cruz",
        "email": "maria.cruz@example.com",
        "role": "Senior Developer",
        "departmentCode": "IT",
        "departmentName": "Information Technology",
        "positionCode": "IT-SD",
        "positionTitle": "Senior Developer",
        "basicSalary": 85000,
        "reportToEmployeeId": "EMP-00001"
      }
    ]
  }'
```

**Expected response (200):**

```json
{
	"success": true,
	"message": "Dry run completed. No data was modified.",
	"data": {
		"success": true,
		"summary": {
			"departments": { "created": 1, "existing": 0 },
			"positions": { "created": 2, "existing": 0 },
			"levels": { "created": 5, "existing": 0 },
			"employees": { "created": 2, "skipped": 0, "failed": 0 },
			"totalDurationMs": 12
		},
		"errors": [],
		"dryRun": true
	}
}
```

#### POST /api/migration/execute — Real insert

Same body as above but change `"dryRun": false` (or remove it — defaults to `false`):

```bash
curl -X POST http://localhost:3000/api/migration/execute \
  -H "Content-Type: application/json" \
  --cookie "token=<YOUR_JWT_TOKEN>" \
  -d '{
    "config": {
      "organizationId": "org-sample-001",
      "batchSize": 500
    },
    "employees": [
      {
        "employeeId": "EMP-00001",
        "firstName": "Juan",
        "lastName": "Santos",
        "email": "juan.santos@example.com",
        "role": "Tech Lead",
        "departmentCode": "IT",
        "positionCode": "IT-TL",
        "basicSalary": 120000
      }
    ]
  }'
```

**Expected response (200):**

```json
{
	"success": true,
	"message": "Migration completed successfully. 1 employees created.",
	"data": {
		"success": true,
		"summary": {
			"departments": { "created": 1, "existing": 0 },
			"positions": { "created": 1, "existing": 0 },
			"levels": { "created": 5, "existing": 0 },
			"employees": { "created": 1, "skipped": 0, "failed": 0 },
			"totalDurationMs": 850
		},
		"errors": [],
		"dryRun": false
	}
}
```

#### GET /api/migration/stats — Check counts

```bash
curl "http://localhost:3000/api/migration/stats?organizationId=org-sample-001" \
  --cookie "token=<YOUR_JWT_TOKEN>"
```

**Expected response:**

```json
{
	"success": true,
	"data": {
		"totals": {
			"departments": 6,
			"positions": 30,
			"levels": 5,
			"employees": 6000
		},
		"hierarchy": {
			"byDepartment": [
				{
					"department": { "name": "Information Technology", "code": "IT" },
					"employeeCount": 1000
				},
				{ "department": { "name": "Sales", "code": "SALES" }, "employeeCount": 1000 }
			],
			"byLevel": [
				{ "level": { "name": "Director / Head", "rank": 1 }, "employeeCount": 120 },
				{ "level": { "name": "Regular", "rank": 4 }, "employeeCount": 3000 }
			]
		}
	}
}
```

#### GET /api/migration/hierarchy — View department tree

```bash
# All departments
curl "http://localhost:3000/api/migration/hierarchy?organizationId=org-sample-001" \
  --cookie "token=<YOUR_JWT_TOKEN>"

# Single department
curl "http://localhost:3000/api/migration/hierarchy?organizationId=org-sample-001&departmentCode=IT" \
  --cookie "token=<YOUR_JWT_TOKEN>"
```

**Expected response (single department):**

```json
{
  "success": true,
  "data": {
    "Information Technology": {
      "Director / Head": [
        { "employeeId": "IT-001", "role": "CTO", "position": "Chief Technology Officer", "levelRank": 1 }
      ],
      "Manager / Lead": [
        { "employeeId": "IT-021", "role": "Tech Lead", "position": "Technical Lead", "levelRank": 2 }
      ],
      "Senior": [ ... ],
      "Regular": [ ... ],
      "Intern / Junior": [ ... ]
    }
  }
}
```

### 5.3 Postman Setup

1. Import the collection from `server/docs/generated/postman.collection.json` (if generated)
2. Or create requests manually using the curl examples above
3. **Set cookie:** In Postman, go to Cookies (under Send button) → Add `token=<YOUR_JWT>` for domain `localhost`
4. Or add header: `Cookie: token=<YOUR_JWT_TOKEN>`

### 5.4 Testing the full 6K via API

The API accepts JSON, not CSV directly. To test 6K records via API, use this helper script:

```bash
# Convert CSV to JSON and POST it
node -e "
const fs = require('fs');
const csv = fs.readFileSync('prisma/seeds/data/employees-6000.csv', 'utf-8');
const lines = csv.replace(/\r/g, '').split('\n').filter(l => l.trim());
const headers = lines[0].split(',').map(h => h.trim());
const employees = lines.slice(1).map(line => {
  const vals = line.split(',').map(v => v.trim());
  const obj = {};
  headers.forEach((h, i) => { if (vals[i]) obj[h] = vals[i]; });
  if (obj.basicSalary) obj.basicSalary = Number(obj.basicSalary);
  if (obj.levelRank) obj.levelRank = Number(obj.levelRank);
  return obj;
});
const payload = JSON.stringify({
  config: { organizationId: 'org-sample-001', batchSize: 500 },
  employees
});
fs.writeFileSync('_migration-payload.json', payload);
console.log('Wrote ' + employees.length + ' employees to _migration-payload.json');
"

# Now POST it (warning: large payload ~3-5MB)
curl -X POST http://localhost:3000/api/migration/execute \
  -H "Content-Type: application/json" \
  --cookie "token=<YOUR_JWT_TOKEN>" \
  -d @_migration-payload.json
```

---

## 6. Test Method C — Prisma Seeder

The seeder generates 6,000 employees in-memory (no CSV needed) and calls the migration service directly.

```bash
# Run the seed
npx prisma db seed
```

Or run the migration seeder directly:

```bash
npx ts-node prisma/seeds/employeeMigrationSeeder.ts
```

---

## 7. Verifying Results

### 7.1 Prisma Studio (visual)

```bash
npm run prisma-docs
```

Opens `http://localhost:5555`. Check these collections:

| Collection    | Expected Count (after 6K import) |
| ------------- | -------------------------------- |
| `employees`   | 6,000                            |
| `departments` | 6                                |
| `positions`   | ~30                              |
| `levels`      | 5                                |

### 7.2 MongoDB Shell / Compass

```js
// Total employees
db.employees.countDocuments({ organizationId: "org-sample-001" });
// → 6000

// By department (uses @@index([organizationId, departmentId]))
db.employees.aggregate([
	{ $match: { organizationId: "org-sample-001" } },
	{ $group: { _id: "$departmentId", count: { $sum: 1 } } },
]);

// Check reporting hierarchy (uses @@index([reportToId]))
db.employees.countDocuments({
	organizationId: "org-sample-001",
	reportToId: { $ne: null },
});
// → ~5880 (everyone except level-1 directors)

// Verify B-tree indexes are being used
db.employees
	.find({
		organizationId: "org-sample-001",
		departmentId: "<some-dept-id>",
	})
	.explain("executionStats");
// Look for "stage": "IXSCAN" (index scan, not COLLSCAN)
```

### 7.3 API verification

```bash
# Quick count check
curl "http://localhost:3000/api/migration/stats?organizationId=org-sample-001" \
  --cookie "token=<YOUR_JWT_TOKEN>" | jq '.data.totals'

# Hierarchy structure check
curl "http://localhost:3000/api/migration/hierarchy?organizationId=org-sample-001&departmentCode=IT" \
  --cookie "token=<YOUR_JWT_TOKEN>" | jq 'keys'
```

### 7.4 Clean up / Reset

To wipe all data and re-test from scratch:

```bash
# Option 1: Drop all collections via Prisma
npx prisma db push --force-reset

# Option 2: Drop specific collections in MongoDB shell
db.employees.drop()
db.departments.drop()
db.positions.drop()
db.levels.drop()
db.position_levels.drop()

# Then re-push schema (recreates indexes)
npx prisma db push
```

---

## 8. Troubleshooting

### "Unauthorized" (401)

```
{ "message": "Unauthorized" }
```

**Cause:** Missing or expired JWT cookie.
**Fix (CLI):** Use the CLI script instead — it bypasses auth entirely.
**Fix (API):** Generate a fresh token:

```bash
node -e "
const jwt = require('jsonwebtoken');
console.log(jwt.sign(
  { userId: 'test', role: 'admin', organizationId: 'org-sample-001' },
  process.env.JWT_SECRET || 'your-jwt-secret',
  { expiresIn: '24h' }
));
"
```

### "Validation failed" (400)

**Cause:** Employee rows have invalid values.
**Fix:** Check that enum values match exactly:

| Field              | Valid Values                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `employmentType`   | `REGULAR`, `PROBATIONARY`, `CONTRACTUAL`, `PART_TIME`, `CONSULTANT`, `INTERN`                                                                                    |
| `employmentStatus` | `ACTIVE`, `INACTIVE`, `TERMINATED`, `RESIGNED`, `ON_LEAVE`, `ONBOARDING`, `OFFBOARDING`, `SERVING_NOTICE`, `RESIGNATION_REQUESTED`, `FORMER_EMPLOYEE`, `RETIRED` |
| `payFrequency`     | `DAILY`, `WEEKLY`, `BIWEEKLY`, `SEMI_MONTHLY`, `MONTHLY`, `QUARTERLY`, `ANNUALLY`                                                                                |
| `workLocation`     | `ONSITE`, `REMOTE`, `HYBRID`                                                                                                                                     |

### "RetryableWriteError" / Timeouts

**Cause:** MongoDB connection under load or free-tier rate limits.
**Fix:** Reduce batch size:

```bash
npx ts-node scripts/import-migration-csv.ts --batch 200
```

### "Missing references: dept=missing"

**Cause:** Employee references a `departmentCode` that wasn't created.
**Fix:** The service auto-discovers departments from employee rows. This error usually means the department upsert failed silently — check server logs.

### Prisma client not generated

```
Error: @prisma/client did not initialize yet
```

```bash
npm run prisma-generate
```

### Schema out of sync

```
The database schema is not in sync with the Prisma schema
```

```bash
npx prisma db push
```

---

## 9. Performance Tuning

### Index strategy (in `prisma/schema/employee.prisma`)

```prisma
@@unique([organizationId, employeeId])              // Deduplicate upserts — O(log n)
@@index([organizationId])                            // Org-scoped queries
@@index([departmentId, levelId])                     // Hierarchy traversal (compound B-tree)
@@index([organizationId, departmentId])              // Org + department lookup
@@index([organizationId, departmentId, levelId])     // Full hierarchy path
@@index([role])                                      // Role-based filtering
@@index([levelId])                                   // Level-based filtering
@@index([reportToId])                                // Manager → direct reports
```

### Batch size recommendations

| Scenario                | Batch Size      | Why                   |
| ----------------------- | --------------- | --------------------- |
| MongoDB Atlas Free Tier | `200–300`       | Rate limits, low IOPS |
| MongoDB Atlas M10+      | `500` (default) | Balanced throughput   |
| Local MongoDB           | `500–1000`      | No network latency    |
| Seeing timeouts         | `100–200`       | Reduce per-batch load |

### Expected performance (6,000 employees)

| Phase                                    | Approximate Time           |
| ---------------------------------------- | -------------------------- |
| CSV parsing + validation                 | < 500ms                    |
| Upsert levels/depts/positions            | < 2s                       |
| Employee batch insert (12 batches × 500) | 5–30s (depends on DB tier) |
| reportTo linking                         | 3–15s                      |
| **Total**                                | **~10–50s**                |

### Complexity

- Department grouping: `O(n)`
- In-group sort by level: `O(n log n)` per department
- Upsert with unique index: `O(log n)` per record (B-tree lookup)
- reportTo linking: `O(n)` with O(1) map lookups + `O(log n)` indexed update

---

## 10. Data Contract Reference

### Minimum required fields

```json
{
	"employeeId": "EMP-00001",
	"firstName": "Juan",
	"lastName": "Santos",
	"email": "juan.santos@example.com",
	"role": "Tech Lead",
	"departmentCode": "IT",
	"positionCode": "IT-TL",
	"basicSalary": 120000
}
```

### Full field list

| Field                | Type   | Required | Default            | Notes                                      |
| -------------------- | ------ | -------- | ------------------ | ------------------------------------------ |
| `employeeId`         | string | Yes      | —                  | Unique per org                             |
| `firstName`          | string | Yes      | —                  |                                            |
| `lastName`           | string | Yes      | —                  |                                            |
| `middleName`         | string | No       | —                  |                                            |
| `email`              | string | Yes      | —                  | Must be valid email                        |
| `role`               | string | Yes      | —                  | Used to infer level if `levelRank` missing |
| `departmentCode`     | string | Yes      | —                  | Auto-creates department                    |
| `departmentName`     | string | No       | = departmentCode   |                                            |
| `positionCode`       | string | Yes      | —                  | Auto-creates position                      |
| `positionTitle`      | string | No       | = positionCode     |                                            |
| `levelName`          | string | No       | —                  | Must match a Level name                    |
| `levelRank`          | number | No       | inferred from role | 1=Director, 5=Intern                       |
| `basicSalary`        | number | Yes      | —                  |                                            |
| `currency`           | string | No       | `PHP`              |                                            |
| `payFrequency`       | enum   | No       | `SEMI_MONTHLY`     |                                            |
| `employmentType`     | enum   | No       | `REGULAR`          |                                            |
| `employmentStatus`   | enum   | No       | `ACTIVE`           |                                            |
| `workLocation`       | enum   | No       | `ONSITE`           |                                            |
| `hireDate`           | string | No       | —                  | ISO date format                            |
| `reportToEmployeeId` | string | No       | —                  | Must reference another employeeId          |

### Migration config

```json
{
	"config": {
		"organizationId": "org-sample-001",
		"batchSize": 1000,
		"maxParallelBatches": 6,
		"skipDuplicates": true,
		"dryRun": false
	}
}
```

SSO provisioning behavior in migration execute/upload-csv:

- If request has auth token (`Authorization: Bearer <token>` or `token` cookie), migration also calls third-party auth register/login for each new employee.
- Default password strategy is `lastnameLowerNoSpaces + employeeId + !<currentYear>` (with legacy fallback candidate kept for compatibility during login-link).
- Role IDs are resolved from env (`AUTH_ROLE_ID_EMPLOYEE`, `AUTH_ROLE_ID_EMPLOYEE_MANAGER`) with defaults for employee/manager.
- For employees successfully provisioned in auth, migration also sends credentials email (email + password) using SMTP config (`EMPLOYEE_EMAIL_*`, fallback `EMAIL_*`, fallback `SMTP_USER/APP_PASSWORD`).
- Email send counters are returned under `postActions.summary.credentialsEmailSent` and `postActions.summary.credentialsEmailFailed`.
- `POST /api/migration/upload-csv` now runs strict post-actions:
  - row is successful only when auth create/link succeeds and credentials email is sent
  - strict failures are returned in `postActions.failures[]`
  - failed strict rows are rolled back locally (employee/person + related calendar/boarding/checklist data)
  - final `summary.employees.created` excludes rolled-back strict rows
- No auth password reset API is available in current integration; for existing auth accounts with unknown password, failure code `AUTH_EXISTING_ACCOUNT_PASSWORD_UNKNOWN` is returned.

| Field                | Type    | Default  | Range   |
| -------------------- | ------- | -------- | ------- |
| `organizationId`     | string  | required | —       |
| `batchSize`          | number  | `1000`   | 50–5000 |
| `maxParallelBatches` | number  | `6`      | 1–20    |
| `skipDuplicates`     | boolean | `true`   | —       |
| `dryRun`             | boolean | `false`  | —       |


Strict failure codes returned by upload-csv in `postActions.failures[].code`:

- `AUTH_REGISTER_FAILED`
- `AUTH_EXISTING_ACCOUNT_PASSWORD_UNKNOWN`
- `AUTH_LINK_FAILED`
- `EMAIL_SEND_FAILED`
- `EMAIL_CONFIG_MISSING`

---
## 11. High-Throughput Mode (Deferred reportTo updates)

The migration service now uses:

1. createMany for primary employee insert (fast path)
2. deferred bulk reportToId updates via Mongo update command ($runCommandRaw)

Recommended run command:

```bash
npx ts-node scripts/import-migration-csv.ts \
  --file prisma/seeds/data/employees-6000.csv \
  --org org-sample-001 \
  --batch 1000 \
  --parallel 6
```

This is optimized for:

- large employee inserts
- reduced transaction aborts
- fewer DB round-trips in second-pass hierarchy linking

### Optional index maintenance script

List indexes:

```bash
npm run migration:indexes -- --action list
```

Drop secondary indexes (keeps \_id and unique organizationId+employeeId):

```bash
npm run migration:indexes -- --action drop
```

Recreate recommended secondary indexes after migration:

```bash
npm run migration:indexes -- --action create
```

---

## 12. Test via API Form-Data

You can now test migration with `multipart/form-data` directly.

New endpoints:

- `POST /api/migration/execute-form`
- `POST /api/migration/dry-run-form`

Auth requirement is unchanged: include valid `token` cookie.

### 12.1 Form-data fields

Required:

- `config` (JSON string)

Provide one of:

- `file` (CSV file, field name must be `file`)
- `employees` (JSON array string)

Optional:

- `departments` (JSON array string)
- `positions` (JSON array string)
- `levels` (JSON array string)

### 12.2 Dry-run with CSV file (curl)

```bash
curl -X POST "http://localhost:3000/api/migration/dry-run-form" \
  --cookie "token=<YOUR_JWT_TOKEN>" \
  -F "config={\"organizationId\":\"org-sample-001\",\"batchSize\":1000,\"maxParallelBatches\":6,\"skipDuplicates\":true}" \
  -F "file=@prisma/seeds/data/employees-6000.csv;type=text/csv"
```

### 12.3 Execute with CSV file (curl)

```bash
curl -X POST "http://localhost:3000/api/migration/execute-form" \
  --cookie "token=<YOUR_JWT_TOKEN>" \
  -F "config={\"organizationId\":\"org-sample-001\",\"batchSize\":1000,\"maxParallelBatches\":6,\"skipDuplicates\":true}" \
  -F "file=@prisma/seeds/data/employees-6000.csv;type=text/csv"
```

### 12.4 Execute with JSON employees in form-data (no file)

```bash
curl -X POST "http://localhost:3000/api/migration/execute-form" \
  --cookie "token=<YOUR_JWT_TOKEN>" \
  -F "config={\"organizationId\":\"org-sample-001\",\"batchSize\":1000,\"maxParallelBatches\":6,\"skipDuplicates\":true}" \
  -F 'employees=[{"employeeId":"EMP-00001","firstName":"Juan","lastName":"Santos","email":"juan.santos@example.com","role":"Tech Lead","departmentCode":"IT","positionCode":"IT-TL","basicSalary":120000}]'
```

### 12.5 Postman setup

1. Method: `POST`
2. URL: `http://localhost:3000/api/migration/execute-form`
3. Body tab ? `form-data`
4. Add key `config` (Text), value as JSON string
5. Add key `file` (File), select `employees-6000.csv`
6. Add cookie `token=<JWT>`
7. Send request

If you upload a CSV file, `employees` form field is optional.

---

## 13. Test Credentials Email via Postman

Use this endpoint when you want to verify SMTP delivery and payload rendering without running import/migration.

### 13.1 Endpoint

- `POST /api/migration/test-credentials-email`

### 13.2 Authorization and roles

- Requires bearer token (`Authorization: Bearer <token>`)
- Allowed roles:
  - `hris-hr-manager`
  - `hris-hr-user`
  - `hris-admin`
  - `admin`
  - `superadmin`
  - `super_admin`

### 13.3 Request body

```json
{
	"to": "qa.receiver@example.com",
	"employeeId": "EMP-TEST-001",
	"email": "employee.login@example.com",
	"userName": "JuanEMP-TEST-001",
	"password": "delacruzEMP-TEST-001!2026",
	"fullName": "Juan Dela Cruz",
	"dryRun": false
}
```

Fields:

- `to` recipient mailbox for test
- `employeeId` display value in template
- `email` credential email shown in template
- `userName` credential username shown in template
- `password` credential password shown in template
- `fullName` optional greeting name
- `dryRun` optional, defaults to `false`

### 13.4 Postman steps

1. Method: `POST`
2. URL: `http://localhost:3001/api/migration/test-credentials-email`
3. Headers:
   - `Authorization: Bearer <token>`
   - `Content-Type: application/json`
4. Body: `raw` + `JSON` and paste request payload
5. Send request

### 13.5 Dry-run config check

Set `dryRun: true` to verify endpoint + SMTP configuration without sending an email.

Expected:

- `200` response
- `data.configured` indicates whether SMTP/email credentials are configured

### 13.6 Expected responses

- `200` sent successfully (or dry-run completed)
- `400` invalid payload
- `401` missing/invalid token
- `403` role not allowed
- `503` SMTP/email configuration missing (non-dry-run)
- `500` provider/send failure

### 13.7 SMTP environment variables

Preferred:

- `EMPLOYEE_EMAIL_USER`
- `EMPLOYEE_EMAIL_PASS`

Fallbacks:

- `EMAIL_USER` + `EMAIL_PASS`
- `SMTP_USER` + `APP_PASSWORD`


