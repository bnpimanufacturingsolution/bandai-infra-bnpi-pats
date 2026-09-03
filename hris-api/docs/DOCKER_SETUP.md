# Docker Setup (Local via Terraform)

Local Docker setup is now managed with Terraform in `infrastructure/onprem`.

## What gets provisioned

- `redis` container (`redis:7.2-alpine`)
- `mongodb` container (`mongo:7`)
- `minio` container (`minio/minio`) for on-prem object storage
- `app` container (built from repo `Dockerfile`)
- `cron` container (same image as app, different command)
- dedicated Docker network
- persistent Redis/MongoDB/MinIO volumes

## Prerequisites

- Docker Desktop
- Terraform CLI (`>= 1.5`)

## Run locally

From repo root:

```bash
docker build -t hris-local-app:latest -f Dockerfile .
cd infrastructure/onprem
terraform init
terraform plan
terraform apply
```

The API base URL is output as `app_url` after apply.

## Stop and remove

```bash
cd infrastructure/onprem
terraform destroy
```

## Environment behavior

- `npm run dev` uses a bounded Docker Desktop readiness probe before bootstrapping local Postgres, so a loading Docker Desktop cannot stall the dev command indefinitely.
- Terraform reads `${repo_root}/.env` and injects values into `app` and `cron`.
- `DATABASE_URL` is overridden so app/cron use local MongoDB container.
- `REDIS_HOST` and `REDIS_URL` are overridden so services use Docker networking.
- `STORAGE_PROVIDER=minio` and MinIO runtime vars are injected for app/cron by default in on-prem runtime.
- If `.env` has `PORT`, that value is used for container port mapping.
- Keep `localhost:3001` reserved for the Windows `npm run dev` API process. When you need the Dockerized API locally, publish it on `APP_HOST_PORT=58001` unless the Windows dev server is intentionally off.

## MinIO and Hybrid Backup

- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`
- Default bucket: `hris-images` (created by init step)

Optional MinIO-to-GCS backup loop (via `docker-compose.yml`):
- Set `MINIO_BACKUP_ENABLED=true`
- Set `GCS_BACKUP_BUCKET`
- Set `GCS_S3_ACCESS_KEY` and `GCS_S3_SECRET_KEY` (GCS interoperability keys)
- Optional interval: `MINIO_BACKUP_INTERVAL_SECONDS` (default `1800`)
