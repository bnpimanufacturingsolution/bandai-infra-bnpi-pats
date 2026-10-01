# Setup Doc 02 — Files 10 to 18 (Compose stacks + env)

## 📁 Files Covered
10. `appliance/docker-compose.yml`
11. `appliance/docker-compose.environments.yml`
12. `appliance/docker-compose.lgtm.yml`
13. `bnpi-pats-api/docker-compose.yml`
14. `bnpi-pats-api/deploy/docker-compose.pats.yml`
15. `appliance/.env`
16. `appliance/env/bnpi-pats-api.env`
17. `.env.example`
18. `bnpi-pats-api/.env`

## 🖼️ Role in the Docker Image

### 10. `appliance/docker-compose.yml` — on-prem appliance stack (canonical local/VM stack)
- Why: defines `postgres`, `bnpi-pats-api-db-init` (build `../bnpi-pats-api` target `db-init`), `bnpi-pats-api` (build `../bnpi-pats-api`, image `bnpi-pats-api-local:develop`, `3001:3001`), `bnpi-pats-app`, observability services. This is what runs **inside the VM**, not on the Windows host.
- COPY/ADD: none directly; `build.context: ../bnpi-pats-api` pulls setup-01 Dockerfiles.
- Runtime vs build: both — `build:` at image-build time, `image:/env_file:/volumes:/ports:/healthcheck:` at runtime.
- Env/secrets/volumes: `env_file: ./env/bnpi-pats-api.env`; `PG_*/DATABASE_URL` overrides; volumes `apiuploads:/app/uploads`, `../data/import:ro`, `../source-inputs-organized:ro`, `../docs:/docs:ro`, SSH key `:ro`; Postgres volume `postgresdata:/var/lib/postgresql/data`; ports `15432:5432` (host-mapped PG), `3001:3001` (API).

### 11. `appliance/docker-compose.environments.yml` — DEV/UAT/PROD overlay
- Why: per-environment port/image overrides (`3100/3101` DEV, `3200/3201` UAT, `3000/3001` PROD) + `db-init` schema-only guard. Referenced by ansible rollout (auto-roll after rebuild).
- Runtime overlay; no secrets inside (points at env files).

### 12. `appliance/docker-compose.lgtm.yml` — observability stack (Loki/Grafana/Tempo/Mimir/Prometheus)
- Why: logs/metrics/traces sidecars; not part of app/API images but shares Docker network (`bnpi-pats-observability`).
- Runtime only; data root from `appliance/.env` (`OBSERVABILITY_DATA_ROOT`).

### 13. `bnpi-pats-api/docker-compose.yml` — API-dev local stack
- Why: lightweight API+DB for API-repo development (subset of appliance stack).
- Same build/runtime split as (10) but scoped to API dev.

### 14. `bnpi-pats-api/deploy/docker-compose.pats.yml` — contract deploy stack
- Why: deploys from `deploy/contract/{dev,uat,prod}.env` port/mode contracts; future GitOps ConfigMap source.
- Runtime; reads contract env files, never hardcodes secrets.

### 15. `appliance/.env` — observability + host ports
- Why: `OBSERVABILITY_DATA_ROOT`, `GRAFANA/PROMETHEUS/LOKI/TEMPO/ALERTMANAGER_HOST_PORT`, Grafana admin (local defaults only).
- Consumed via `env_file`/interpolation at `docker compose` runtime. Not copied into images (`COPY` never references it).
- Secrets note: local defaults (`admin123`) are dev-only; real appliance secrets come from host bootstrap/VM secrets, never committed prod values.

### 16. `appliance/env/bnpi-pats-api.env` — API runtime env (compose `env_file`)
- Why: single file mounted into `postgres`, `db-init`, `api` services (DB creds, storage provider, OTEL, tunnel host vars).
- Runtime only; required for `docker run --env-file` diagnostic too.

### 17. `.env.example` (319 B, repo root)
- Why: template for required keys; copy to `.env` for local compose. Documents shape without values.
- Build-time reference only.

### 18. `bnpi-pats-api/.env` — API local defaults (`PORT=3000`, `PATS_DATABASE_URL=...@localhost:5433`)
- Why: hot-reload/dev fallback. Compose overrides with `PATS_ENV`/contract ports.
- WARNING (drift): tracked in git — real keys must use VM/K8s secret plumbing (see handoff 2026-09-04 open item). Never bake into images.

## 🛠️ Scripts & Commands

```bash
# validate (no run)
docker compose -f appliance/docker-compose.yml config
docker compose -f appliance/docker-compose.yml -f appliance/docker-compose.environments.yml config

# diagnostic up (VM is canonical; host only for config check)
docker compose -f appliance/docker-compose.yml up -d postgres
docker compose -f appliance/docker-compose.yml up -d bnpi-pats-api-db-init
docker compose -f appliance/docker-compose.yml up -d bnpi-pats-api bnpi-pats-app
docker compose -f appliance/docker-compose.yml ps
docker compose -f appliance/docker-compose.yml logs -f bnpi-pats-api
```

## ✅ Verification
- `docker compose config` exits 0 (no interpolation errors).
- `docker ps` shows `bnpi-pats-postgres` healthy (`pg_isready`), `bnpi-pats-api-db-init` exits 0, `bnpi-pats-api` healthcheck passes.
- `curl http://localhost:3001/health` → 200 (when API port mapped for that env).
- Expected logs: `prisma-postgres:push` success in db-init; API `listening on :3001`.

## ⚠️ Notes
- Do not run the full appliance stack on the Windows host as the system of record — host compose is for `config` validation + ephemeral diagnostics. Real proof is `ssh infra@10.184.37.19` + VM-local compose/K3s.
- `db-init` is push-only: never seed / `--accept-data-loss` on UAT/PROD (Project Truth db-init rule; Failed Job is a safety lock).
- Port table: PROD `3000/3001`, DEV `3100/3101`, UAT `3200/3201`, PG host `15432` (appliance) vs `5433` (api-dev) vs K3s DEV forward `55435` (canonical Windows hot-reload DB — do not silently swap to compose DEV `15433`).
