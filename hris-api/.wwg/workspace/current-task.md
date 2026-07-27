# Current Task

## Status
done

## Summary
`npm run dev:local` now auto-runs `prisma db push` against the local clone Postgres so a wiped/fresh volume has schema (and `/setup` works without a manual push).

## Category
infra

## Packages
- bandai-infra/hris-api
- Dual-app: **HR/emp-only (no counterpart)**

## Code changes
- `scripts/run-dev-local.cjs` — `ensureLocalCloneSchema()` after container ready; localhost guard; opt-out `HRIS_SKIP_LOCAL_CLONE_SCHEMA_PUSH=true`
- `.env.local-clone.example` — document auto schema push
- `bandai-infra/docs/LOCAL_WINDOWS_REMOTE_DEV_BOOTSTRAP_20260720.md` — document step

## Behavior
| Step | Behavior |
|---|---|
| Container/volume | create/start as before |
| Schema | always `prisma db push --schema prisma/schema-postgres --skip-generate` on local clone URL |
| Skip push | `HRIS_SKIP_LOCAL_CLONE_SCHEMA_PUSH=true` |
| ensure-local-dev-services bootstrap | still skipped (`HRIS_SKIP_LOCAL_DB_BOOTSTRAP=true`) to avoid double work / other compose stacks |

## Truth delta
NO — local-dev tooling only.

## Drift
NONE

## Follow-ups
- Optional: seed minimal org defaults only after push (status already auto-creates org on first status hit)
