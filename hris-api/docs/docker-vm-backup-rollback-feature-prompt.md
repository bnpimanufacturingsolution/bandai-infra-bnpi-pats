# Docker/VM Backup And Rollback Feature Prompt

Use this prompt to implement the HRIS Docker/VM-safe backup and rollback feature.

```text
You are working in `c:\uzaro\bandai-infra`.

Goal:
Implement a Docker/VM-safe HRIS backup and rollback system.

The app runs in Docker on a VM. The backup job must run daily at 12:00 midnight Philippine time. The system must create a real rollback backup using PostgreSQL-native dump format, plus Excel, JSON/NDJSON, XML, and YAML exports for audit/readable recovery evidence.

Important:
This is not Liquibase. Liquibase is for schema migrations. This feature is for database backup and restore.

Primary rollback format:
Use PostgreSQL `pg_dump -Fc` custom archive format.

Readable evidence formats:
Also export:
1. JSON or NDJSON for every Prisma model/table in the database
2. Excel workbook with one sheet for every Prisma model/table in the database
3. XML for every Prisma model/table in the database
4. YAML for every Prisma model/table in the database

Repo context:
- API: `hris-api`
- Frontend: `hris-app`
- Cron worker: `hris-api/cron-entry.ts`
- Cron service: `hris-api/app/cron/cron.service.ts`
- Prisma schema: `hris-api/prisma/schema-postgres`
- Generated Prisma client: `hris-api/generated/prisma`
- Infra: `terraform-hyperv`, `hris-api/infrastructure/onprem`
- DB connection uses `PG_DATABASE_URL`

Required backup artifacts per run:

`/var/backups/hris/`
- `2026-06-18T000000+0800/`
- `hris-postgres.dump`
- `manifest.json`
- `json/<EveryPrismaModel>.ndjson`
- `xml/<EveryPrismaModel>.xml`
- `yaml/<EveryPrismaModel>.yml`
- `excel/hris-readable.xlsx`

The file names above are patterns. Do not limit export to User, Employee, or Attendance. Export all database-backed Prisma models/tables discovered from `hris-api/prisma/schema-postgres`.

Environment variables:

```env
BACKUP_ENABLED=true
BACKUP_TIMEZONE=Asia/Manila
BACKUP_CRON=0 0 * * *
BACKUP_DIR=/var/backups/hris
BACKUP_RETENTION_DAYS=0
POSTGRES_CONTAINER_NAME=
POSTGRES_DB=
POSTGRES_USER=
```

Docker/VM requirements:
- Backups must be written to a persistent mounted directory.
- Do not store backups only inside the container filesystem.
- Docker Compose or VM deployment should mount:
  - host: `/srv/hris/backups`
  - container: `/var/backups/hris`
- Backup folder must survive container rebuilds/restarts.

Backup behavior:
1. Run daily at `00:00` Asia/Manila.
2. Also provide manual commands:
   - dry run: `npm run backup:dry-run`
   - real backup: `npm run backup:run`
3. Create a unique folder per run.
4. Do not overwrite previous backups.
5. Use atomic writes:
   - write temp files first
   - verify non-empty/checksum
   - rename to final path only after success
6. If any step fails, do not write a completed manifest.
7. Never log database passwords.
8. Each run must export the full current database state for every model/table, not only newly created rows.
9. Example cumulative snapshot behavior:
   - Day 1: `User` table has 100 rows. Day 1 JSON/Excel `User` export contains 100 rows.
   - Day 2: 200 new `User` rows are added, so the database now has 300 `User` rows. Day 2 JSON/Excel `User` export contains 300 rows.
   - Do not modify the Day 1 files. Day 1 remains a 100-row point-in-time backup, and Day 2 is a new 300-row point-in-time backup.
   - The readable exports are cumulative by snapshot, not by editing old files.

PostgreSQL dump:
- Create `hris-postgres.dump` using `pg_dump -Fc`.
- Prefer running `pg_dump` from the Postgres container or backup utility container with matching Postgres client version.
- Example concept:

```bash
docker exec <postgres-container> pg_dump -U <user> -d <db> -Fc > /var/backups/hris/<run>/hris-postgres.dump
```

- The `.dump` file is the primary rollback artifact.

JSON/NDJSON, XML, and YAML exports:
- Export all database-backed Prisma models/tables discovered from `hris-api/prisma/schema-postgres`.
- Do not hard-code only User, Employee, Attendance, or other sample models.
- If a model exists in the schema and has a generated Prisma delegate, it must have JSON/NDJSON, XML, YAML, and Excel coverage.
- Export the full current row set for each model on every run. Do not export only the delta/new rows unless a separate optional delta report is added later.
- Preserve:
  - IDs
  - foreign keys
  - scalar fields
  - enum fields
  - JSON fields
  - timestamps
  - null values
  - soft-delete flags
  - metadata fields
- Prefer NDJSON for large tables.
- One file per model/table for each enabled readable format.
- XML must escape values correctly and represent null values explicitly.
- YAML must use a safe serializer and must not emit executable/custom YAML tags.
- These formats are readable/selective recovery evidence only, not the primary full rollback source.

Excel export:
- Create one workbook per run.
- One worksheet per database-backed Prisma model/table.
- Each worksheet must contain the full current row set for that model at the time of the backup.
- Include all scalar/enum/JSON fields and FK IDs.
- Include metadata columns:
  - `__backupRunId`
  - `__backupStartedAt`
  - `__backupTimezone`
  - `__model`
- Excel is for human-readable inspection only, not the primary restore source.

Manifest:
Create `manifest.json` with:
- backupRunId
- startedAt
- completedAt
- timezone
- status
- app version/commit if available
- database name
- backup directory
- artifact list
- SHA256 checksum per artifact
- row counts per model
- dump file size
- error message if failed

Restore documentation:
Add a rollback guide explaining:

Full rollback:
1. Put app in maintenance mode or stop API/app containers.
2. Create a pre-rollback backup of the current DB.
3. Restore `hris-postgres.dump` into a clean database.
4. Use:

```bash
pg_restore --clean --if-exists --no-owner --dbname=<target_db> hris-postgres.dump
```

5. Restart app containers.
6. Validate login, employees, attendance, payroll, reports.

Selective rollback:
- Use Excel, JSON/NDJSON, XML, and YAML only for investigation.
- If row-level repair is needed, create a controlled Prisma/SQL restore script.
- Do not manually edit Excel/XML/YAML and import directly into production.

Retention:
- `BACKUP_RETENTION_DAYS=0` means keep forever.
- If retention is positive:
  - delete only complete backup folders
  - never delete the latest successful backup
  - do not delete folders with failed/incomplete manifest unless explicitly configured

Testing requirements:
1. Verify every Prisma model is covered by JSON and Excel export.
2. Verify every Prisma model is covered by XML and YAML export when those formats are enabled.
3. Verify `pg_dump` artifact is created and non-empty.
4. Verify manifest includes checksums and row counts.
5. Verify failed backup does not create a completed manifest.
6. Verify backup directory is writable.
7. Verify previous backups are not overwritten.
8. Verify Docker-mounted path is used.
9. Verify restore command is documented.
10. Verify cumulative snapshot behavior with a sample `User` model:
    - Day 1 backup exports 100 `User` rows.
    - Day 2 backup exports 300 `User` rows after 200 new users are added.
    - Day 1 files are not modified.
11. Run typecheck and focused tests.

Acceptance criteria:
- Daily backup runs at midnight Philippine time.
- Manual backup command works.
- Each run creates:
  - `hris-postgres.dump`
  - `manifest.json`
  - JSON/NDJSON exports
  - XML exports
  - YAML exports
  - Excel workbook
- Backups are stored in persistent Docker/VM-mounted storage.
- Previous backups remain intact.
- PostgreSQL dump is clearly documented as the real rollback source.
- Excel, JSON/NDJSON, XML, and YAML are documented as audit/selective recovery support only.
```
