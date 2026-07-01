# DEV K3s Data Promotion and DM Workbook Runtime Evidence - 2026-07-01

## Request

The operator requested that DEV K3s match the expected DEV dataset instead of showing the small seeded database:

- Docker DEV Postgres source: expected full imported employee dataset.
- K3s DEV Postgres target: previously showed only 7 employees.
- DEV public/LAN app/API target: `10.184.38.144:3100` / `10.184.38.144:3101`.

This work followed the `Agent-Meta-Prompt-Template.md` loop: discover current state, protect data with backups, execute in passes, validate the live runtime, and record evidence.

## Current-State Finding

Before promotion, DEV had a data split:

- `hris-postgres-dev` in Docker held `employees=2217`.
- K3s DEV Postgres held the small seed dataset with `employees=7`.
- No employee deletion was found in the CORS repair. The visible DEV app was simply backed by the K3s database, not the Docker DEV database that held the imported data.

## Safety Actions

K3s initially hit DiskPressure while recovering the DEV runtime. The cleanup was limited to safe runtime cache/artifact cleanup:

- truncated oversized Docker JSON logs
- removed duplicate temporary tar files from `/tmp`
- pruned unused Docker containers/build cache/images
- restarted K3s after freeing disk

Persistent Postgres data directories and Project Truth runtime volumes were not deleted.

Backups were created before restore:

| Backup | Path | Size | SHA256 |
| --- | --- | ---: | --- |
| Docker DEV source dump | `/var/lib/project-truth/backups/dev-k3s-promote-20260701-054647/docker-dev-hris.dump` | 112M | `5a4aef7f9cbb3a37342e5379b67a2b4706d06e3f67d524abb4f7d8d8562a01ce` |
| K3s DEV pre-restore dump | `/var/lib/project-truth/backups/dev-k3s-promote-20260701-054647/k3s-dev-before-hris.dump` | 45M | `44a2708c6e1d53743cc2200f6e139df716ec3d042e915f450befc2d08baac15b` |

## Execution Summary

DEV writers were scaled down before the database replacement:

- `hris-api`
- `hris-app`
- `hris-hikvision-watcher`

K3s DEV Postgres was restored from the Docker DEV custom dump by dropping and recreating the `public` schema, then running `pg_restore` and `analyze`. DEV workloads were scaled back up afterward.

## Validation Evidence

Live K3s DEV database:

```text
employees=2217
users=2039
MigrationRun
MigrationRunEvent
MigrationRunStep
```

Live DEV pods:

```text
hris-api-cd487cc48-72gkg                 1/1 Running
hris-app-85c49866dd-hsbv8                1/1 Running
hris-hikvision-watcher-d6c8d9bb4-jw5v5   1/1 Running
hris-postgres-0                          1/1 Running
```

K3s node:

```text
project-truth-node Ready
MemoryPressure=False
DiskPressure=False
PIDPressure=False
Ready=True
InternalIP=10.184.38.144
```

Argo CD:

```text
project-truth-dev           Synced Healthy 325a35a9591a56bb157f84d4b0b9a26184f31bb2
project-truth-runtime-dev   Synced Healthy 325a35a9591a56bb157f84d4b0b9a26184f31bb2
```

LAN/API probes:

```text
http://10.184.38.144:3101/health => HTTP 200
http://10.184.38.144:3100/auth/login => HTTP 200
OPTIONS /api/auth/login from http://10.184.38.144:3100 => HTTP 204, Access-Control-Allow-Credentials=true
GET /api/migration/workbook-template/DM3-employee-data-migration.xlsx without auth => HTTP 401
```

The unauthenticated workbook-template probe returning `401` means the route is present and protected by auth. It is no longer failing anonymously as a missing static asset check. Runtime file presence was verified inside the live API pod.

## DM Workbook Runtime Evidence

Inside live DEV API pod `hris-api-cd487cc48-72gkg`:

```text
/data/import/DM3-employee-data-migration.xlsx        813.1K
/docs/dm-source-input-manifest.json                    9.8K
data_import_files=24
/data/import                                           3.8M
/docs                                                279.1M
/source-inputs-organized                             385.0M
```

This matches the API's workbook-template lookup paths and DM workflow mount expectations.

## Remaining Drift / Notes

- DEV K3s now has the expected full employee dataset: `employees=2217`.
- The Docker DEV database still exists and was not deleted.
- The K3s DEV pre-restore dump is retained for rollback.
- The workbook route still requires authentication, so anonymous HTTP probes should return `401`; authenticated browser/API verification should be used for UI download proof.
- The earlier data split recommendation is addressed for DEV by this promotion, but the broader operational need remains: future DEV dataset promotions should use the same explicit backup/restore evidence path.

