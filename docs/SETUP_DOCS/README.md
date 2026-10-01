# SETUP_DOCS — Docker build → run → GCS upload (diagnostic scope)

> Project Truth note: Windows-host Docker is **diagnostic only**. The finish line is
> `Windows repo → GitHub → GitOps → Argo CD in Hyper-V VM → K3s/appliance runtime → LAN BNPI PATS → named Cloudflare Tunnel`.
> See root `AGENTS.md` (Host-Local VM First, Architecture Rule) and `.wwg/wiki/project-truth.md`.
> Product: BNPI PATS timekeeping/payroll only (device lane + emp-app retired 2026-09-15).

## Overview
- Scope: 29 Docker-relevant files (not the full 2036-file repo, which would be 227 docs). Grouped 9 per doc; last group partial.
- `setup-01.md` — image build contexts (3 Dockerfiles + ignores + manifests).
- `setup-02.md` — compose stacks + env wiring.
- `setup-03.md` — per-env contracts + health server + VHDX factory entry (maintainer-only).
- `setup-04.md` — VM import/start CLI (normal path; Docker lives inside the VM).

## Links
- [setup-01.md — Files 1–9](setup-01.md)
- [setup-02.md — Files 10–18](setup-02.md)
- [setup-03.md — Files 19–27](setup-03.md)
- [setup-04.md — Files 28–29](setup-04.md)

## Variables (this run)

| Variable | Value (used) | Status |
|---|---|---|
| `IMAGE_NAME` (api) | `bnpi-pats-api-local` | default |
| `IMAGE_NAME` (app) | `bnpi-pats-app-local` | default |
| `IMAGE_NAME` (health) | `bnpi-pats-health` | default |
| `TAG` | `develop` (+ `diagnostic-20260930` tag alias) | default |
| `CONTAINER_NAME` | `*-diag` ephemeral (e.g. `bnpi-pats-api-diag`) | default |
| `HOST_PORT` → `CONTAINER_PORT` | health `3000→3000`; api diag `3001→3000`; app `3000→3000`; appliance canonical prod `3000/3001`, dev `3100/3101`, uat `3200/3201` | default |
| `PROJECT_ID` | `bandai-pats-vhdx-artifacts` (from `gcloud config`) | CONFIRMED local config |
| `BUCKET_NAME` | `gs://<BUCKET_NAME>/` | **NEEDS_CONFIRMATION — no bucket name provided; upload commands below use placeholder and are not executed green** |
| VHDX dir | `C:\ProgramData\BandaiApp\Bnpipats\images\` | operator choice: stage Docker `*.tar.gz` here; do NOT rebuild/overwrite VHDX |

## Prerequisites
- Docker Desktop 29.x running (Windows) + buildkit.
- `gcloud` 586 + `gsutil` 5.37 installed; `gcloud auth login` completed (current identity `1bis.solutions.tech@gmail.com` returns **403 `storage.buckets.list`** on this project — upload blocked until IAM/bucket granted).
- Hyper-V available (for normal VHDX path, not for Docker diag).
- No secrets baked in images; Cloudflare tunnel creds never in layers.

## Full build → run → upload flow

```powershell
# 0. bootstrap (WWG-mandated reads done 2026-09-30; see session report)
powershell -File scripts/verify-grok-wwg-bootstrap.ps1

# 1. BUILD (diagnostic, host)
docker build -f app/Dockerfile -t bnpi-pats-health:develop ./app
docker build -f bnpi-pats-api/Dockerfile --target runner -t bnpi-pats-api-local:develop ./bnpi-pats-api
docker build -f bnpi-pats-api/Dockerfile --target db-init -t bnpi-pats-api-db-init:develop ./bnpi-pats-api
docker build -f bnpi-pats-app/Dockerfile -t bnpi-pats-app-local:develop ./bnpi-pats-app
docker images | Select-String "bnpi-pats"

# 2. RUN locally (ephemeral diag; full stack belongs in VM)
docker run -d --name bnpi-pats-health-diag -p 3000:3000 bnpi-pats-health:develop
docker run -d --name bnpi-pats-api-diag -p 3001:3000 --env-file appliance/env/bnpi-pats-api.env bnpi-pats-api-local:develop
# compose validation only on host:
docker compose -f appliance/docker-compose.yml config

# 3. VERIFY
docker ps
docker logs bnpi-pats-health-diag
curl http://localhost:3000/health

# 4. SAVE (tarball staged next to VHDX per operator choice)
docker save bnpi-pats-health:develop | gzip > bnpi-pats-health-develop.tar.gz
docker save bnpi-pats-api-local:develop | gzip > bnpi-pats-api-local-develop.tar.gz
docker save bnpi-pats-app-local:develop | gzip > bnpi-pats-app-local-develop.tar.gz
Copy-Item *.tar.gz C:\ProgramData\BandaiApp\Bnpipats\images\

# 5. UPLOAD to GCS (BLOCKED — needs BUCKET_NAME + IAM; commands only)
gcloud auth login
gcloud config set project bandai-pats-vhdx-artifacts
# gsutil cp bnpi-pats-api-local-develop.tar.gz gs://<BUCKET_NAME>/
# gcloud storage cp bnpi-pats-api-local-develop.tar.gz gs://<BUCKET_NAME>/
# gsutil ls gs://<BUCKET_NAME>/

# 6. NORMAL (non-diagnostic) path — prebuilt VHDX → VM (no Docker on host)
.\scripts\project-truth.ps1 doctor
.\scripts\project-truth.ps1 select-image -ImagePath C:\ProgramData\BandaiApp\Bnpipats\images\project-truth-node-latest.vhdx
.\scripts\project-truth.ps1 vhdx-autopilot -Mode Import -VhdxPath C:\ProgramData\BandaiApp\Bnpipats\images\project-truth-node-latest.vhdx -VmName bnpi-pats
.\scripts\project-truth.ps1 watch-until-healthy -GuestIp <guest-lan-ip>
```

## Evidence / known blocks (2026-09-30, this run)
- Built + verified (host diagnostic): `bnpi-pats-health:develop` (210 MB, Up healthy, `GET :3005/health` 200), `bnpi-pats-app-local:develop` (200 MB, Up, `GET :3006/` 200), `bnpi-pats-api-db-init:develop` (985 MB, build OK). Diag containers removed after proof; images retained.
- Tarballs staged in `C:\ProgramData\BandaiApp\Bnpipats\images\`: `bnpi-pats-health-develop.tar.gz` (49.7 MB, SHA256 `EBDFE895…F0526F1`), `bnpi-pats-app-local-develop.tar.gz` (47.9 MB, `CFB74286…0487420`), `bnpi-pats-api-db-init-develop.tar.gz` (197.6 MB, `5F6DD198…7103A251`). Repo copies also kept at repo root.
- `bnpi-pats-api-local:develop` (`runner` target) FAILS at `RUN npm run build`: bare `prisma generate` finds no `prisma/schema.prisma` (schema lives in `prisma/schema/*.prisma` + `prisma/pats/schema.prisma`). `CONFLICTING` with VM-rebuild expectations (ansible `docker compose build` uses the same Dockerfile). Proposed fix (needs operator decision, not applied here): `prisma generate --schema prisma/schema` in `build` script or Dockerfile. Recorded as candidate REC, not implemented.
- `gcloud storage ls --project=bandai-pats-vhdx-artifacts` → `403 storage.buckets.list denied` for `1bis.solutions.tech@gmail.com` (+ warning: no permission on the project instance). Upload cannot go green without bucket name + `storage.objects.create/list` grant.
- `C:\ProgramData\BandaiApp\Bnpipats\images\` holds only `project-truth-node-latest.previous-20260930-215112.vhdx` (13.9 GB); `image.json` points at missing `project-truth-node-latest.vhdx` — left untouched per operator.
- Packer history: last build OOM at 4096 MB (`packer-build.log`); factory is maintainer-only, not run here.

## Task mode
`docs-only + diagnostic build` with `high-risk` boundaries respected (no prod deploy, no VHDX overwrite, no secret invention, no tunnel change). No new recommendations beyond existing registry unless the bucket/VHDX gap is promoted by the operator.
