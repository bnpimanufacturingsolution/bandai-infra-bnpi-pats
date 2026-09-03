# On-Prem Local Docker Stack (Terraform)

This folder manages the local Docker runtime for HRIS API using Terraform.

It provisions:
- `redis` (`redis:7.2-alpine`, exposed on host `6380` by default)
- `mongodb` (`mongo:7`, exposed on host `27018` by default)
- `minio` (`minio/minio`, exposed on host `9000` API and `9001` Console by default)
- `app` (built from project `Dockerfile`, runs `node dist/server.js`)
- `cron` (same image, runs `node dist/cron.js`)
- Dedicated Docker network and data volumes (Redis, MongoDB, MinIO)

## Prerequisites

- Docker Desktop running
- Terraform CLI (`>= 1.5`)
- A real `.env` file at repo root with `REDIS_PASSWORD` set

## Usage

Run from `infrastructure/onprem`:

```bash
cd ../..
docker build -t hris-local-app:latest -f Dockerfile .
cd infrastructure/onprem
terraform init
terraform plan
terraform apply
```

To destroy:

```bash
terraform destroy
```

## Notes

- Terraform auto-loads `${project_root}/.env` and injects its variables into `app` and `cron`.
- `DATABASE_URL` is overridden to use the local `mongodb` container.
- `project_root` defaults to repo root (`../../` from this folder). Override in `terraform.tfvars` only if needed.
- `REDIS_HOST` and `REDIS_URL` are forced for container-to-container communication.
- `STORAGE_PROVIDER=minio` and MinIO runtime variables are injected for app/cron by default.
- App port uses `PORT` from `.env` when available; otherwise `app_port_fallback` (default `3001`).
- Terraform now fails fast if `.env` is missing or `REDIS_PASSWORD` is not set (unless `allow_insecure_local_defaults=true`).
- Insecure default credentials are blocked by validation unless `allow_insecure_local_defaults=true` for throwaway demos.

## DevOps Guardrails

- Never commit local Terraform state: `*.tfstate` and `.terraform/` are git-ignored.
- Use `terraform fmt -check -recursive` and `terraform validate` in CI before merges.
- Treat Terraform as source-of-truth for this stack and avoid manual `docker rm` on managed resources.
- Use `terraform plan -detailed-exitcode` for drift checks in automation.

## MinIO Access

- API endpoint: `http://localhost:9000`
- Console: `http://localhost:9001`
- Credentials and bucket are controlled by Terraform vars (`minio_root_user`, `minio_root_password`, `minio_bucket`).

