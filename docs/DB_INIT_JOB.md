# GitOps DB init Job (`bnpi-pats-api-db-init`)

Operator page for schema apply on the appliance. Evidence: `.wwg/reports/db-init-repair-20260821.md`.

| Field | Now (2026-08-21) |
|---|---|
| Live cluster Job command | `npm run prisma-postgres:push && npm run prisma-seed` (origin/develop) |
| Local uncommitted Job command | `npm run prisma-postgres:push` only |
| Argo runtime `dev`/`uat`/`prod` | Synced / **Degraded** because the Job is Failed |
| App/API / Postgres | **Up**. Degraded ≠ database empty |
| UAT/PROD data | **Not deleted**. Dumps on the VM |
| Git commit of this fix | Operator authorized **push** 2026-08-22 |

## What this Job is

| Item | Value |
|---|---|
| Kind | Kubernetes `Job` `bnpi-pats-api-db-init` in namespaces `dev`, `uat`, `prod` |
| Image | `bnpi-pats-api-db-init:develop` (`imagePullPolicy: Never`) |
| Manifests | `gitops/runtime-k8s/overlays/{dev,uat,prod}/runtime.yaml` |
| Argo apps | `project-truth-runtime-dev` / `-uat` / `-prod` (`selfHeal: true`, `prune: true`) |
| Schema command | `npm run prisma-postgres:push` = `npx prisma db push --schema prisma/schema-postgres --skip-generate` |
| Dangerous extra (live origin) | `&& npm run prisma-seed` → `bnpi-pats-api/prisma/seed.ts` |

DEV, UAT, and PROD are **three Postgres volumes on one VM**, not three clouds. Ports: PROD `15432`, DEV `15433`, UAT `15434`.

## What Argo “Degraded” means

| Source | Proves | Does not prove |
|---|---|---|
| Runtime Argo **Degraded** | Job `bnpi-pats-api-db-init` Failed (`BackoffLimitExceeded`) | Database wiped, API down, need restore |
| Overlay Argo **Healthy** | GitOps ConfigMaps/Services in sync | Images rebuilt |
| `/health` 200 | API process up | Git SHA, Job success |
| Observe green | VM reported a SHA (often `services=none`) | Job Complete |

Live APIs were healthy while runtime Argo was Degraded. **Do not “fix Degraded” by reseeding.**

## Hard bans (UAT and PROD)

| Ban | Why |
|---|---|
| `npm run prisma-seed` | Seed can `deleteMany` timesheets / timesheet lines / attendances for seeded employees |
| `npm run prisma-reset` | `prisma db push --force-reset` **drops all tables** |
| `prisma db push --accept-data-loss` | Allows destructive column/table drops |
| Delete Failed Job **before** origin git is schema-only | Argo selfHeal recreates the **origin** Job, which still **seeds** |
| `prisma migrate deploy` | `schema-postgres/migrations/` is hand SQL, not Prisma Migrate history |

Empty local compose (`appliance/docker-compose.yml`) may still seed a **blank** laptop DB. GitOps and compose **dev/uat** inits must not.

## Why Failed Jobs are left in place

1. Origin `develop` still has `push && seed`.
2. Argo `selfHeal` + `prune` will recreate whatever is in git.
3. Recreating the Job from origin can run seed against UAT/PROD (thousands of timesheet rows).
4. A Failed Job that has already hit backoff **does not keep retrying seed**.

That Failed object is a **safety lock** until git is schema-only **and** that commit is on `origin/develop`.

## Local code (uncommitted)

| File | Change |
|---|---|
| `gitops/runtime-k8s/overlays/{dev,uat,prod}/runtime.yaml` | Command = `npm run prisma-postgres:push` only |
| `appliance/docker-compose.environments.yml` | `bnpi-pats-api-db-init-dev` / `-uat` schema-only |
| `appliance/docker-compose.yml` | Local empty bootstrap **keeps** seed; comment forbids GitOps/UAT/PROD seed |
| `scripts/test-self-heal-contract.ps1` | All three ns: push required, `npm run prisma-seed` forbidden |

Contract: **226/226 PASS** (`.runtime/db-init-repair-20260821/self-heal-contract.txt`).

`db push` **without** `--accept-data-loss` fail-closes if Prisma would drop data.

## Live data snapshot (2026-08-21T14:46Z, SELECT only)

| ns | employees | users | timesheets | timesheet_lines |
|---|---:|---:|---:|---:|
| `dev` | 2227 | 2050 | 13566 | 158108 |
| `uat` | 2225 | 2048 | 10979 | 129535 |
| `prod` | 2225 | 2048 | 10979 | 129535 |

`timesheet_lines.dayLaborType` already exists on all three. Attendance table name is `attendances`.

## Backups

Custom `pg_dump` (`-Fc`), mode `600`, taken **before** any Job recreate:

| Env | VM path | Size |
|---|---|---|
| UAT | `/home/infra/db-init-repair-dumps/bnpi-pats-uat.dump` | 156M |
| PROD | `/home/infra/db-init-repair-dumps/bnpi-pats-prod.dump` | 156M |

No restore was run.

Restore only if a later write goes wrong (operator-approved):

```bash
# example PROD — destructive; needs explicit approval
kubectl -n prod exec -i sts/bnpi-pats-postgres -- pg_restore -U postgres -d bnpi-pats --clean --if-exists < /home/infra/db-init-repair-dumps/bnpi-pats-prod.dump
```

Do not run restore as part of the normal Job repair.

## After the operator says “commit”

Do **not** skip the git wait. Jobs are immutable.

1. Commit and `git push origin develop` (this repair + docs).
2. Confirm origin YAML is schema-only (no `prisma-seed` on the Job).
3. Wait Argo to see that git revision (`project-truth-runtime-*` REV = new SHA). The **old Failed Job object remains** until deleted.
4. Re-count UAT/PROD (must match table above, or only grow).
5. Delete Failed Jobs **only after** origin has no-seed:

```bash
ssh project-truth-bnpi-pats
kubectl -n dev get job bnpi-pats-api-db-init -o jsonpath='{.spec.template.spec.containers[0].command}'; echo
# must already be git-synced no-seed before delete
kubectl -n uat delete job bnpi-pats-api-db-init
kubectl -n prod delete job bnpi-pats-api-db-init
kubectl -n dev delete job bnpi-pats-api-db-init
```

6. Watch new Jobs Complete (`kubectl get jobs -A | grep db-init`).
7. Argo runtime should become **Healthy**.
8. Re-count employees / timesheets / timesheet_lines. Must not drop.

If the new Job command still contains `prisma-seed`, **stop** — do not delete.

## How to look (SSH)

LAN may timeout from home Wi‑Fi. Use `ssh project-truth-bnpi-pats`. Do not stop `cloudflared-bnpi-pats.service`.

```bash
kubectl -n argocd get app project-truth-runtime-dev project-truth-runtime-uat project-truth-runtime-prod \
  -o custom-columns=NAME:.metadata.name,SYNC:.status.sync.status,HEALTH:.status.health.status,REV:.status.sync.revision
kubectl get jobs -A | grep db-init
kubectl -n uat get job bnpi-pats-api-db-init -o jsonpath='{.spec.template.spec.containers[0].command}'; echo
```

## Related

| Doc | Role |
|---|---|
| `.wwg/reports/db-init-repair-20260821.md` | Evidence + counts + hold |
| `docs/DEVOPS_RUNBOOK.md` | CI / Observe / auto-roll + this Job |
| `docs/GITOPS_GH_WATCH_RUNBOOK.md` | Observe honesty; Degraded ≠ deployed |
| `docs/ONPREM_PORT_ACCESS.md` | DEV/UAT/PROD ports on this VM |
| `docs/SELF_HEALING_AND_DRIFT_RECOVERY.md` | What auto-heals; this Job does not |
| REC-20260820-RUNTIME-DB-INIT-DEGRADED | Registry entry |
