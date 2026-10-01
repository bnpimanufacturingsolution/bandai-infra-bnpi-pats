# Setup Doc 03 — Files 19 to 27 (Env contracts + image pipeline entry)

## 📁 Files Covered
19. `bnpi-pats-api/deploy/contract/dev.env`
20. `bnpi-pats-api/deploy/contract/uat.env`
21. `bnpi-pats-api/deploy/contract/prod.env`
22. `cloudflared-bnpi-pats.yml`
23. `package.json` (repo root)
24. `app/server.js`
25. `scripts/build-image.ps1`
26. `scripts/build-image-gcp.ps1`
27. `scripts/export-devcurrent-gcp-vhdx.ps1`

## 🖼️ Role in the Docker Image

### 19–21. `bnpi-pats-api/deploy/contract/{dev,uat,prod}.env` — per-env port/mode contracts
- Why: single source per env for `PATS_ENV`, `APP_PORT`/`API_PORT` (`3100/3101` dev, `3200/3201` uat, `3000/3001` prod), `DB_HOST_PORT`, `SEED_MODE`, `CORS_ORIGINS`, `PATS_VERSION`, `POSTGRES_*` placeholders. Compose stack + future GitOps ConfigMap derive from these; secrets do NOT live here.
- COPY/ADD: never `COPY`d into images; read at `docker compose --env-file` / deploy time.
- Runtime vs build: runtime config only.
- Gotcha: `POSTGRES_PASSWORD=*-placeholder` is replaced by host secret bootstrap on a real appliance — do not treat placeholder as credential.

### 22. `cloudflared-bnpi-pats.yml` — named-tunnel ingress (not in image)
- Why: maps public `*.bnpi-pats.tech` (app/api/dev/uat/grafana/ssh) to VM-local origins (`10.184.37.19:3000/3001/...`). Required sidecar for public proof after Docker run; must stay active (`cloudflared-bnpi-pats.service` on VM). Fresh images must NOT bake tunnel credentials — import at boot via `ensure-bnpi-cloudflare-host`.
- Runtime dependency; volumes/secrets: tunnel credential JSON lives under host/VM secrets dirs (`C:\ProgramData\...\secrets\cloudflared\` / `/etc/cloudflared`), never in image layers.

### 23. `package.json` (root `project_truth_hyperv_fresh`)
- Why: documents repo direction (Hyper-V + appliance, Packer optional); no Docker `COPY` (context roots are `app/`, `bnpi-pats-api/`, `bnpi-pats-app/`).
- Neither build nor runtime artifact — orientation only.

### 24. `app/server.js` (857 B, express health server)
- Why: runtime payload of `app/Dockerfile` (`COPY server.js ./`, `npm start`). Serves `/health` for K3s/host checks.
- Runtime; `PORT`/`HOST` envs; no volumes/secrets.

### 25. `scripts/build-image.ps1` — Packer Hyper-V image factory (maintainer-only)
- Why: builds the **VHDX** (Ubuntu 24.04 → Hyper-V Gen2 `.vhdx`), not Docker images. Params: `TargetPlatform=hyperv`, `VmName=project-truth-node-01`, `MemoryMb/BuildMemoryMb=4096`, `VmPath=C:\ProgramData\BandaiApp\Bnpipats\HyperV`, `ImagesDir=C:\ProgramData\BandaiApp\Bnpipats\images`. Normal users skip this (prebuilt VHDX path); Packer only when base platform changes.
- Output: `project-truth-node-*.vhdx` + `.sha256` in `ImagesDir`. Last host run failed OOM (`Not enough memory ... 4096 MB`) — lower `BuildMemoryMb` or free RAM before retry.
- Safety: no Docker interaction; no tunnel changes.

### 26. `scripts/build-image-gcp.ps1` — GCP image build (maintainer-only)
- Why: cloud variant of (25) for GCP artifacts (`PROJECT_ID=bandai-pats-vhdx-artifacts` context). Produces VHDX/GCE image, not Docker tarballs.
- Needs `gcloud auth login` + project set; bucket destination is `NEEDS_CONFIRMATION` (no bucket name provided in this task).

### 27. `scripts/export-devcurrent-gcp-vhdx.ps1` — DEV-current VHDX export
- Why: snapshots current DEV state to VHDX for upload; companion to `verify-gcp-image-boot.ps1`.
- Output VHDX lands in images dir; upload step needs explicit `gs://<BUCKET>` (missing — see README).

## 🛠️ Scripts & Commands

```bash
# contract check
diff bnpi-pats-api/deploy/contract/dev.env bnpi-pats-api/deploy/contract/uat.env
diff bnpi-pats-api/deploy/contract/uat.env bnpi-pats-api/deploy/contract/prod.env

# health image quick proof (uses 23+24)
docker build -f app/Dockerfile -t bnpi-pats-health:develop ./app
docker run -d --name bnpi-pats-health-diag -p 3000:3000 bnpi-pats-health:develop

# VHDX factory (maintainer only — NOT normal flow; requires Hyper-V + free RAM)
# powershell -File scripts/build-image.ps1 -TargetPlatform hyperv -SkipBuild:$false
```

## ✅ Verification
- Contract envs parse: no spaces around `=`, ports match compose overlays (dev `3100/3101`, uat `3200/3201`, prod `3000/3001`).
- `node app/server.js` locally → `GET /health` 200 before Dockerizing.
- Packer path (if ever run): `*.vhdx` + `*.sha256` appear in `C:\ProgramData\BandaiApp\Bnpipats\images\`; `qemu-img check -f vhdx` clean (VM-side).

## ⚠️ Notes
- Do not confuse Docker `docker save …tar.gz` artifacts with Hyper-V `.vhdx` disks. This task stages Docker tarballs **next to** the VHDX dir per operator choice; it does not rebuild the 13 GB VHDX.
- `C:\ProgramData\BandaiApp\Bnpipats\images\` currently holds only `project-truth-node-latest.previous-20260930-215112.vhdx` (13.9 GB); `image.json` expects `project-truth-node-latest.vhdx` — that gap is `NEEDS_CONFIRMATION`, left untouched per operator selection.
- Tunnel file (22) is host/VM config, never image-baked.
