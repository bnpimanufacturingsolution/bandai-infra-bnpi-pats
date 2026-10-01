# Setup Doc 01 — Files 1 to 9 (Docker build contexts)

Scope: Docker-relevant subset only (29 files total across setup-01..04). Full repo is 2036 files; full 1-per-9 coverage would be 227 docs and is intentionally not generated — see README.md.

## 📁 Files Covered
1. `app/Dockerfile`
2. `app/.dockerignore`
3. `app/package.json`
4. `bnpi-pats-api/Dockerfile`
5. `bnpi-pats-api/.dockerignore`
6. `bnpi-pats-api/package.json`
7. `bnpi-pats-app/Dockerfile`
8. `bnpi-pats-app/.dockerignore`
9. `bnpi-pats-app/package.json`

## 🖼️ Role in the Docker Image

### 1. `app/Dockerfile` — minimal health-check image (`project-truth-health`)
- Why in image: defines the small `node:20-alpine` diagnostic image used for K3s DEV/UAT/PROD verification (`GET /health`).
- COPY: `COPY package*.json ./` then `RUN npm ci --omit=dev`; `COPY server.js ./`.
- Runtime vs build-time: build-time installs prod deps only; runtime serves `npm start` on `PORT=3000`.
- Env/volumes/secrets: `ENV HOST=0.0.0.0`, `ENV PORT=3000`; `EXPOSE 3000`; no secrets, no volumes. Healthcheck curls `http://localhost:3000/health`.

### 2. `app/.dockerignore` — build context filter for (1)
- Why: keeps `node_modules`, logs, `.git` out of the build context so `COPY package*.json` is deterministic and fast.
- COPY/ADD: not copied itself; controls Docker daemon context upload.
- Runtime vs build: build-time only.
- Env/secrets: none.

### 3. `app/package.json` — `project-truth-health` manifest
- Why: pinned `express ^5.2.1`, `scripts.start=node server.js`; consumed by `npm ci` in (1).
- COPY: via `COPY package*.json ./`.
- Runtime vs build: both (install at build, `npm start` at run).
- Env: none.

### 4. `bnpi-pats-api/Dockerfile` — main API image (multi-stage + db-init)
- Why: production API image. Stages: `base` → `deps` (prod `pnpm install --prod`) → `builder` (full toolchain + `prisma generate` ×2 + `npm run export-docs` + `npm run build`) → `runner` (non-root `nodeuser`, copies `dist/`, `node_modules/`, `prisma/`, `generated/`, `assets/`, `app/`, `docs/`) → `db-init` (schema-push job, `prisma db push` only).
- COPY (key): `COPY package.json pnpm-lock.yaml ./`; `COPY app/ config/ helper/ middleware/ utils/ zod/ prisma/ docs/ scripts/ assets/ errors/ cron/ index.ts ./` (builder); `COPY --from=builder …` into runner.
- Runtime vs build: `deps/builder` are build-time; `runner` is runtime (`CMD ["node","dist/server.js"]`, `EXPOSE 3000`, TCP healthcheck on `PORT||3000`); `db-init` is a K8s Job (`CMD ["npm","run","prisma-postgres:push"]` — never seed, never `--accept-data-loss` on appliance DBs per Project Truth db-init rule).
- Env/secrets/volumes: runtime needs `PG_DATABASE_URL`/`WRITE_DATABASE_URL`/`DATABASE_URL`, `STORAGE_PROVIDER`, `LOCAL_UPLOAD_ROOT=/app/uploads`, OTEL vars, `PROJECT_TRUTH_VM_HOST/USER/SSH_KEY`; mounted volumes in compose: `apiuploads:/app/uploads`, `../data/import:/data/import:ro`, `../source-inputs-organized:ro`, `../docs:/docs:ro`, SSH key dir `:ro`. No secrets baked in Dockerfile.

### 5. `bnpi-pats-api/.dockerignore` (500 B)
- Why: excludes local `node_modules`, `.env`, logs, `.runtime` from API build context (large TS repo).
- Build-time only.

### 6. `bnpi-pats-api/package.json` — `bnpi-pats-api v1.0.122`
- Why: declares `corepack/pnpm`, `prisma-postgres:push`, `export-docs`, `build` scripts consumed by all stages of (4).
- COPY: `COPY package.json pnpm-lock.yaml ./` in every stage.
- Both build and runtime.

### 7. `bnpi-pats-app/Dockerfile` — SPA frontend image
- Why: builds Vite SPA (`pnpm build`) then serves static `build/` via `scripts/serve-spa.mjs` on `PORT=3000`.
- COPY: `COPY package.json pnpm-lock.yaml ./` + `patches/` (deps stage); `COPY . .` + `RUN pnpm build` (build stage); `COPY --from=build /app/build ./build`, `scripts/`, `package.json` (runtime stage).
- Runtime vs build: first two stages build-time; final `node:20-alpine` runtime (`CMD ["node","scripts/serve-spa.mjs"]`).
- Env: `HOST=0.0.0.0`, `PORT=3000`, build-arg `VITE_API_BASE_URL=/api`; no secrets.

### 8. `bnpi-pats-app/.dockerignore` (45 B)
- Why: trims SPA context (node_modules/build/dist).
- Build-time only.

### 9. `bnpi-pats-app/package.json`
- Why: Vite build + `serve-spa.mjs` runner manifest; drives `pnpm install --frozen-lockfile` and `pnpm build`.
- Both build and runtime.

## 🛠️ Scripts & Commands

```bash
# diagnostic builds on Windows host (diagnostic only — real runtime is the Hyper-V VM per AGENTS.md)
docker build -f app/Dockerfile -t bnpi-pats-health:develop ./app
docker build -f bnpi-pats-api/Dockerfile --target runner -t bnpi-pats-api-local:develop ./bnpi-pats-api
docker build -f bnpi-pats-api/Dockerfile --target db-init -t bnpi-pats-api-db-init:develop ./bnpi-pats-api
docker build -f bnpi-pats-app/Dockerfile -t bnpi-pats-app-local:develop ./bnpi-pats-app

# run (diagnostic, ephemeral)
docker run -d --name bnpi-pats-health-diag -p 3000:3000 bnpi-pats-health:develop
docker run -d --name bnpi-pats-api-diag -p 3001:3000 --env-file appliance/env/bnpi-pats-api.env bnpi-pats-api-local:develop
docker run -d --name bnpi-pats-app-diag -p 3000:3000 bnpi-pats-app-local:develop
```

## ✅ Verification
- `docker ps` shows the diag containers; `docker logs <name>` shows listen lines.
- Health: `curl http://localhost:3000/health` (health/app images); API readiness via compose wiring, not bare `docker run` (needs Postgres).
- Expected: `HEALTHCHECK` greens in `docker inspect`; API `runner` runs as `nodeuser`, not root.

## ⚠️ Notes
- Host Docker Desktop runs are diagnostics only. Canonical runtime is Docker **inside** the Hyper-V VM (`project-truth-node-01` / `project-truth-local-vhdx-proof`) + K3s/Argo; do not declare Project Truth complete from host-local Docker (evidence-over-assumption + Finish Line rule).
- `bnpi-pats-api` build needs `pnpm-lock.yaml` + network for Prisma engines; on Windows ensure Docker Desktop has ≥4 GB and buildkit enabled.
- Never bake `.env` secrets or Cloudflare tunnel credentials into any image (V6 rule).
