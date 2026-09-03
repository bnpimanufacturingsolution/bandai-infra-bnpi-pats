# REC-20260820-RUNTIME-DB-INIT-DEGRADED — 2026-08-21

Operator page: `docs/DB_INIT_JOB.md`.

| Field | Value |
|---|---|
| Status | `PUSH_AUTHORIZED_2026-08-22` |
| Ask | Repair Failed `hris-api-db-init` **without deleting UAT/PROD data**; **do not commit until operator says** |
| Live DBs | Unchanged this turn (counts below) |
| Cluster Job recreate | **Not done** on purpose |
| Tunnel | `cloudflared-bnpi-hris.service` **active** (not touched) |
| Contract | self-heal **226/226 PASS** |

---

## Done vs open

| Claim | Status | Evidence | Operator still sees |
|---|---|---|---|
| UAT/PROD data kept | **Done** | counts + 156MB dumps | Same timesheet totals |
| Seed removed from **local** GitOps Job | **Done** (uncommitted) | `runtime.yaml` command = push only | GitHub origin still has seed |
| Failed Jobs deleted | **Not done** | Jobs Failed 0/1 ×3 ns | Argo runtime **Degraded** |
| Origin/develop updated | **Held** | `git status` dirty, no commit of this fix | Actions still old SHA |
| Argo Healthy | **Open** | needs commit → sync → delete Job | Synced/Degraded |

---

## Why seed is the data-loss path

| Layer | Path | Risk |
|---|---|---|
| Job command (origin) | `npm run prisma-postgres:push && npm run prisma-seed` | Seed runs after push |
| Seed entry | `hris-api/package.json` `prisma-seed` → `prisma/seed.ts` | Always writes; no `APP_ENV` guard |
| Employee seeder | `prisma/seeds/generalEmployeeSeeder.shared.ts` | `deleteMany` timesheets, timesheet_lines, attendances |
| Reset script | `prisma-reset` = `db push --force-reset` | **Drops the database** — never on appliance |

July 2026 overnight notes already said: fail was often **seed** after schema sync; do not use `--accept-data-loss`. Pod logs for the 2026-08-21 Failed Jobs are **gone** (`BackoffLimitExceeded`, pods deleted). Do not guess a new root cause to justify seed.

---

## Why not recreate Jobs today

| Check | Result |
|---|---|
| Argo `spec.syncPolicy.automated.selfHeal` | **true** (dev/uat/prod runtime apps) |
| Argo `prune` | **true** |
| Origin Job command | still `push && seed` |
| Local YAML | no-seed, **not on origin** |

Delete Job now → Argo recreates **seed Job** → UAT/PROD timesheets at risk.

Failed + backoff exceeded = seed is **not** looping. Leave it.

---

## Live snapshot (SELECT only, 2026-08-21T14:46Z)

| ns | employees | users | timesheets | timesheet_lines | `dayLaborType` on `timesheet_lines` |
|---|---:|---:|---:|---:|---|
| dev | 2227 | 2050 | 13566 | 158108 | present |
| uat | 2225 | 2048 | 10979 | 129535 | present |
| prod | 2225 | 2048 | 10979 | 129535 | present |

Postgres StatefulSets Ready 1/1. Public `/health` was 200 in the prior audit. Table name is `attendances`, not `attendance`.

---

## Backups

| Env | Path | Size | Mode | Restore run? |
|---|---|---|---|---|
| UAT | `/home/infra/db-init-repair-dumps/hris-uat.dump` | 156M | 600 | **No** |
| PROD | `/home/infra/db-init-repair-dumps/hris-prod.dump` | 156M | 600 | **No** |

Format: `pg_dump -Fc`. First dump to `/var/lib/project-truth/backups/` failed (`permission denied` on `kubectl cp`). Files live under `/home/infra/`.

---

## Local file list (uncommitted)

| File | Change |
|---|---|
| `gitops/runtime-k8s/overlays/dev/runtime.yaml` | Job: `npm run prisma-postgres:push` only |
| `gitops/runtime-k8s/overlays/uat/runtime.yaml` | same |
| `gitops/runtime-k8s/overlays/prod/runtime.yaml` | same |
| `appliance/docker-compose.environments.yml` | dev/uat init: push only |
| `appliance/docker-compose.yml` | empty local bootstrap **keeps** seed + warning comment |
| `scripts/test-self-heal-contract.ps1` | assert push; assert-no `npm run prisma-seed` for **dev, uat, prod** |
| `docs/DB_INIT_JOB.md` | operator runbook |
| `docs/DEVOPS_RUNBOOK.md` | pointer + bans |
| `docs/GITOPS_GH_WATCH_RUNBOOK.md` | Degraded honesty |
| `docs/SELF_HEALING_AND_DRIFT_RECOVERY.md` | this Job is not a self-heal |
| `README.md` | link |

`prisma-postgres:push` does **not** pass `--accept-data-loss`.

---

## After operator says commit (ordered)

1. Commit + push `develop`.
2. Prove origin YAML has **no** `prisma-seed` on the Job.
3. Wait Argo REV = that SHA. **Do not delete Jobs yet if origin still seeds.**
4. Re-count UAT/PROD vs table above.
5. `kubectl -n uat,prod,dev delete job hris-api-db-init` (Job object only — not Postgres).
6. Wait Complete; Argo Healthy.
7. Re-count; totals must not drop.

Exact commands: `docs/DB_INIT_JOB.md`.

---

## Residual

| Bucket | Count | Blocker class | Next |
|---|---:|---|---|
| Origin still seeds | 1 | `apply_path` | operator **commit** |
| Runtime Argo Degraded | 3 apps | `apply_path` | after commit, delete Failed Jobs |
| Job pod logs gone | 3 | `export_gap` | accept; do not re-seed to “see the error” |
| `prisma migrate deploy` unused | 1 | `optional_product` | hand SQL folder is not Migrate history |

---

## Team (this rec)

| Role | Outcome |
|---|---|
| Job spec / seed / migrate auditors | Seed is the wipe risk; no `migrate deploy` |
| Live VM | Failed Jobs, Ready Postgres, counts, dumps |
| Implementer | Local no-seed YAML + contract |
| Tester | 226/226 self-heal |
| Docs | this file + `docs/DB_INIT_JOB.md` |
