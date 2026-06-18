# Docker/VM Backup Rollback Guide

The HRIS backup job creates one folder per run under `BACKUP_DIR`. The PostgreSQL custom dump is the real rollback artifact. Excel, JSON/NDJSON, XML, and YAML exports are readable evidence for inspection and selective repair planning.

## Backup Folder

```text
/var/backups/hris/
  2026-06-18T000000+0800/
    hris-postgres.dump
    manifest.json
    json/<EveryPrismaModel>.ndjson
    xml/<EveryPrismaModel>.xml
    yaml/<EveryPrismaModel>.yml
    excel/hris-readable.xlsx
```

Mount `BACKUP_DIR` to a persistent host path in Docker or the VM. Do not rely on container-local storage for backups.

Example mount:

```text
host: /srv/hris/backups
container: /var/backups/hris
```

## Manual Commands

From `hris-api`:

```powershell
npm run backup:dry-run
npm run backup:run
```

Dry-run reads the database and validates model export coverage, but does not write the PostgreSQL dump or readable artifacts.

## Full Rollback

1. Put the app in maintenance mode or stop API/app containers.
2. Create a fresh pre-rollback backup of the current database.
3. Restore the selected `hris-postgres.dump` into a clean target database.
4. Run:

```bash
pg_restore --clean --if-exists --no-owner --dbname=<target_db> hris-postgres.dump
```

5. Restart app containers.
6. Validate login, employee records, attendance/timekeeping, payroll, and reports.

## Selective Repair

Use Excel, JSON/NDJSON, XML, and YAML only to inspect what existed at backup time. If a row-level repair is needed, write a controlled Prisma or SQL restore script and run it inside a transaction.

Do not manually edit Excel, XML, or YAML and import directly into production.

## Artifact Meaning

- `hris-postgres.dump`: primary rollback source.
- `manifest.json`: run metadata, row counts, artifact paths, and SHA256 checksums.
- `json/`, `xml/`, `yaml/`: machine-readable row evidence for every database-backed Prisma model.
- `excel/hris-readable.xlsx`: human-readable workbook with one worksheet per database-backed Prisma model.
