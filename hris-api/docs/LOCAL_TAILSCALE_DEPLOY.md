# Local Auto Deploy via Tailscale SSH

This guide configures GitHub Actions to auto-deploy `hris-api` to your Linux server over Tailscale SSH.

Reference workflow:
- `.github/workflows/deploy-local-tailscale.yml`

Reference server script:
- `scripts/deploy/onprem-auto-deploy.sh`

## 1. Server prerequisites (Linux)

1. Install and connect Tailscale on the server.
2. Install Docker and Terraform (`>= 1.5`).
3. Clone this repo on the server (example: `/opt/hris-api`).
4. Create repo root `.env` on the server with production/local values.
5. Ensure deploy user can run Docker and Terraform.
6. If you want DB sync on each deploy, set Mongo sync variables in server `.env`:
   - `MONGO_SYNC_FROM_CLOUD=true`
   - `MONGO_CLOUD_DATABASE_URL=<your mongodb cloud uri>`
   - optional `MONGO_LOCAL_DATABASE_URL=<local mongodb uri>`
   - optional `MONGO_SYNC_DB_NAME=hris`

## 2. GCP Secret Manager secrets

Create these GCP Secret Manager secrets (default names):

- `hris-local-deploy-dev-tailscale-authkey`
- `hris-local-deploy-dev-host`
- `hris-local-deploy-dev-user`
- `hris-local-deploy-dev-path`
- `hris-local-deploy-dev-ssh-private-key`
- `hris-local-deploy-dev-ssh-password` (optional fallback when no key is provided)
- `hris-local-deploy-dev-env-file` (full `.env` content for on-prem server)
- optional `hris-local-deploy-dev-ssh-port`
- optional `hris-local-deploy-dev-known-hosts`

## 3. How deployment runs

On push to `develop` (or manual run), workflow:

1. Authenticates to GCP using Workload Identity.
2. Loads local deploy secrets from GCP Secret Manager.
3. Joins your Tailnet.
4. SSH-es to your Linux host (key auth first, password fallback).
5. If `hris-local-deploy-dev-env-file` exists, syncs it to `${LOCAL_DEPLOY_PATH}/.env` on server.
6. Runs `scripts/deploy/onprem-auto-deploy.sh` remotely.

The script performs:

1. `git fetch` + branch checkout + fast-forward pull
2. `docker build -t hris-local-app:latest -f Dockerfile .`
3. `terraform init` and `terraform apply -auto-approve` in `infrastructure/onprem`
4. optional cloud DB pull (if enabled): `mongodump` from cloud + `mongorestore` into local DB

## 4. Manual run

Use `Actions` -> `On-Prem Auto Deploy (Tailscale SSH)` -> `Run workflow`.

Optional input:
- `ref`: branch name to deploy.

## 5. Recommended hardening

- Use a dedicated deploy-only SSH key.
- Restrict SSH key in `authorized_keys` if possible.
- Prefer setting `LOCAL_DEPLOY_KNOWN_HOSTS` to pin host key.
- Rotate `TAILSCALE_AUTHKEY` and SSH keys periodically.
