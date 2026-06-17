# Deployment Architecture

This document defines how `hris-api` is deployed in two targets:
- On-prem
- On-cloud (GCP)

It focuses on runtime infrastructure, deployment flow, and operational boundaries.

## 1. On-Prem Deployment Architecture

Reference:
- `infrastructure/onprem/main.tf`
- `infrastructure/onprem/README.md`
- `docker-compose.yml`
- `.github/workflows/deploy-local-tailscale.yml`
- `docs/LOCAL_TAILSCALE_DEPLOY.md`

### 1.1 Runtime Topology

```text
Users / Internal Clients
          |
          v
      Host Network
          |
          v
+-------------------------------------------+
| Docker Host                               |
|                                           |
|  +------------------+                     |
|  | API Container    |  PORT=3001(default) |
|  | node dist/server |<------------------+ |
|  +------------------+                   | |
|            |                             | |
|            v                             | |
|  +------------------+                    | |
|  | MongoDB          | 27017 (container)  | |
|  | replica set rs0  |                    | |
|  +------------------+                    | |
|            |                             | |
|            v                             | |
|  +------------------+                    | |
|  | Redis            | 6379 (container)   | |
|  | AOF enabled      |                    | |
|  +------------------+                    | |
|            |                             | |
|            v                             | |
|  +------------------+                    | |
|  | MinIO            | 9000 API           | |
|  | Object Storage   | 9001 Console       | |
|  +------------------+                    | |
|            ^                             | |
|            |                             | |
|  +------------------+                    | |
|  | Cron Container   | node dist/cron     | |
|  +------------------+--------------------+ |
|                                           |
+-------------------------------------------+
```

### 1.1.1 On-Prem Observability Topology (Grafana Logging)

```text
App/Cron/Mongo/Redis Containers
            |
            v
      Promtail (log collector)
            |
            v
      Loki (log storage/index)
            |
            v
      Grafana (log query + dashboards)

Metrics path:
node-exporter + cAdvisor + blackbox-exporter -> Prometheus -> Grafana
                                                  |
                                                  v
                                            Alertmanager
```

### 1.2 Infrastructure Responsibilities

- Provisioning: Terraform Docker provider (`network`, `volumes`, `containers`)
- Persistence: MongoDB volume, Redis volume, and MinIO volume
- Service discovery: container-to-container via Docker network
- Secrets/config: `.env` mounted into app/cron
- Runtime overrides injected by Terraform (`DATABASE_URL`, `REDIS_HOST`, `REDIS_URL`, `STORAGE_PROVIDER`, `MINIO_*`)
- Terraform/runtime contract: Terraform `>= 1.5.0`, provider `kreuzwerker/docker ~> 3.0`
- Exposed host ports default to Redis `6380`, MongoDB `27018`, MinIO API `9000`, MinIO Console `9001`, App `3001` (from `.env` `PORT` or fallback)
- Storage mode: on-prem defaults to `STORAGE_PROVIDER=minio` with bucket bootstrap via `minio-init`

### 1.3 Deployment Flow

1. Build app image from `Dockerfile`.
2. Run `terraform init` and `terraform apply` in `infrastructure/onprem`.
3. Terraform creates network, volumes, Redis, MongoDB, MinIO, MinIO bucket-init job, app, and cron containers.
4. App/cron upload paths store files in MinIO bucket (`MINIO_BUCKET`).
5. API traffic is served from host-exposed app port.

### 1.4 Operational Notes

- Scaling model: vertical/manual on the host
- Availability model: single-host unless extended externally
- Best fit: controlled internal/private deployments
- Observability stack is deployed separately via `infrastructure/onprem/observability/docker-compose.yml`
- Observability endpoints: Grafana `localhost:53000`, Loki `localhost:3110`, Prometheus `localhost:9091`, Alertmanager `localhost:9093`
- Infra telemetry sources: cAdvisor (`localhost:8088`), node-exporter (`localhost:9110`), blackbox-exporter (`localhost:9115`)
- Terraform outputs include: resolved project root, Docker network name, container names, app URL, and effective MongoDB URL
- MinIO endpoints: API `localhost:9000`, Console `localhost:9001`
- Hybrid storage backup (compose path): optional `minio-backup` mirrors MinIO objects to GCS bucket using interoperability keys
- Optional CI/CD path: GitHub Actions can deploy to on-prem host over Tailscale SSH (`deploy-local-tailscale.yml`), using GitHub secrets or GCP Secret Manager via Workload Identity
- Optional data refresh path: on-prem auto deploy script can pull MongoDB cloud data into local DB when `MONGO_SYNC_FROM_CLOUD=true`

## 2. On-Cloud Deployment Architecture (GCP)

Reference:
- `gcp/gcp-deploy.ps1`
- `gcp/README.md`

### 2.1 Runtime Topology

```text
Internet / API Clients
          |
          v
   Cloud Run Service (dev or uat)
          |
          +------------------------+
          |                        |
          v                        v
   Secret Manager            External Services
   (env binding)            (MongoDB, GCS, logging,
                             optional Redis endpoint)

Build & Release Path:
GitHub Branch -> Cloud Build -> Artifact Registry -> Cloud Run
```

### 2.2 Infrastructure Responsibilities

- Compute: Cloud Run service per environment (`hris-api-dev`, `hris-api-uat`)
- Image supply chain: Cloud Build builds image; Artifact Registry stores image
- Config/secrets: Secret Manager stores env values; Cloud Run binds secrets to runtime env vars
- IAM: deployer service account for build/deploy permissions and runtime service account for service-time access
- Region baseline: `asia-southeast1`
- Project baseline: `hris-492904`
- Secret-bound runtime keys include `DATABASE_URL`, `JWT_SECRET`, `CORS_*`, `GCS_*`, and `BETTER_STACK_*`

### 2.3 Deployment Flow

1. Choose environment (`dev` or `uat`).
2. Enable required GCP APIs.
3. Ensure Artifact Registry and service accounts exist.
4. Sync selected `.env.<env>` values to Secret Manager.
5. Build and push image with Cloud Build.
6. Deploy to Cloud Run with `--update-secrets` bindings.

### 2.4 Operational Notes

- Scaling model: managed autoscaling (Cloud Run)
- Availability model: managed regional service
- Best fit: shared environments, reduced ops overhead
- Logging/observability: app runtime can push logs/telemetry to Better Stack using `BETTER_STACK_*`
- Platform logs/metrics: Cloud Run and Cloud Logging/Monitoring
- Access mode: deploy workflow supports `--allow-unauthenticated` or `--no-allow-unauthenticated` via environment-specific secret flags

### 2.5 Cloud CI/CD and Rollback Control Plane

Reference:
- `.github/workflows/deploy.yml`
- `.github/workflows/rollback.yml`

Deploy workflow coverage:
- Trigger branches: `develop`, `uat`
- Path filters skip on-prem-only changes (`infrastructure/onprem/**`, local Docker docs/files)
- CI gate: install, lint (non-blocking), build
- CD gate: deploy job runs only on push/manual (not PR)
- Auth mode: GitHub OIDC -> Workload Identity -> GCP service account
- Release path: Docker build/push -> Cloud Run deploy with secret bindings
- Concurrency control: one deploy per branch at a time (`cancel-in-progress: true`)

Rollback workflow coverage:
- Manual dispatch with selected environment and target revision
- Validates revision exists before shifting traffic
- Uses Cloud Run traffic split API to route `100%` traffic to chosen revision
- Concurrency control per environment rollback group (`cancel-in-progress: false`)

### 2.6 Identity and Secret Distribution

Reference:
- `gcp/setup-github-workload-identity.ps1`
- `gcp/sync-github-deploy-secrets.ps1`
- `gcp/audit-github-deploy-secrets.ps1`
- `gcp/setup-github-cd.ps1`

Current model:
- Workload Identity pool/provider for GitHub Actions
- Repository-scoped attribute condition for token trust
- Dedicated deploy service account and runtime service account
- Environment-suffixed GitHub secrets (`*_DEV`, `*_UAT`)
- Automated secret audit/fix path to detect missing/new/legacy secret names

## 3. Deployment Model Comparison

| Area | On-Prem | On-Cloud (GCP) |
|---|---|---|
| Runtime | Docker containers on owned host | Cloud Run managed container runtime |
| Provisioning | Terraform (`infrastructure/onprem`) | `gcloud` automation scripts in `gcp/` |
| Control Plane | Local Terraform apply/destroy and Docker lifecycle | GitHub Actions deploy/rollback + GCP IAM/WIF |
| Secrets | `.env` file mounted in containers | Secret Manager + runtime secret bindings |
| Object Storage | MinIO bucket (`MINIO_BUCKET`) | Google Cloud Storage bucket (`GCS_BUCKET_NAME`) |
| Storage Backup/DR | Optional MinIO mirror to GCS (`minio-backup`) | Native bucket durability/versioning controls |
| Observability | Grafana + Loki/Promtail + Prometheus + Alertmanager (on-prem stack) | Cloud Run logs/metrics + Better Stack integration via secrets |
| Scaling | Manual host scaling | Automatic service scaling |
| Ops Ownership | Team manages host + container lifecycle | GCP manages platform/runtime layer |

## 4. Environment Strategy

Current cloud strategy:
- `develop` branch -> `dev` deployment
- `uat` branch -> `uat` deployment

Recommended pattern:
- Keep on-prem for local/private/internal runtime needs.
- Keep GCP for shared non-local environments.
- Add a separate `prod` environment later instead of mixing with `uat`.

## 5. Log Retention and Backup

Reference:
- `infrastructure/onprem/observability/README.md`
- `infrastructure/onprem/observability/backup/*`
- `infrastructure/onprem/observability/docker-compose.yml`

### 5.1 What Is Backed Up (On-Prem)

The observability backup service snapshots persistent data volumes for:
- Grafana
- Prometheus
- Loki
- Alertmanager

### 5.2 Backup Modes and Retention

- Rolling backups: created on interval (`BACKUP_INTERVAL_SECONDS`)
- Full backups: controlled by `FULL_FREQUENCY` (`daily|weekly|monthly|always`)
- Retention controls: `BACKUP_KEEP_ROLLING`, `BACKUP_KEEP_FULL`
- Integrity: each backup writes a `.sha256` checksum

### 5.3 Backup Storage Paths

Host paths:
- `infrastructure/onprem/observability/backups/rolling`
- `infrastructure/onprem/observability/backups/full`

### 5.4 Off-Machine Replication (Optional)

`backup-replicator` (rclone) can copy backups to remote storage.

Controls:
- `REMOTE_REPLICATION_ENABLED=true`
- `RCLONE_REMOTE_PATH=<remote>:<path>`
- `REPLICATION_INTERVAL_SECONDS=<seconds>`

Purpose:
- Protect against single-host failure
- Support disaster recovery beyond local disks

### 5.5 Restore Path

- Manual restore is supported through `backup/restore.sh`.
- Recovery process should validate checksums and restore latest known-good full/rolling snapshot pair.

## 6. Infrastructure Scope Checklist (Current)

Included in this repository now:
- On-prem runtime stack (app, cron, MongoDB, Redis, MinIO + bucket init) via Terraform
- On-prem object storage adapter support (`STORAGE_PROVIDER=minio` default on on-prem)
- Optional on-prem MinIO-to-GCS mirror backup via compose `minio-backup`
- On-prem observability stack (Grafana, Loki/Promtail, Prometheus, Alertmanager, exporters)
- On-prem observability backup and optional off-machine replication
- GCP environment bootstrap scripts (`dev` and `uat`)
- GCP Cloud Run deployment automation
- GitHub Actions CI/CD workflow for `develop` and `uat`
- GitHub Actions manual rollback workflow by revision
- Workload Identity Federation setup and secret sync/audit utilities

## 7. Ports and Endpoints Matrix

### 7.1 On-Prem Runtime (Terraform/Docker)

| Component | Internal Port | Host Port (Default) | Endpoint / Access |
|---|---:|---:|---|
| HRIS API (`app`) | `3001` (or `.env` `PORT`) | `58001` via `.env` `APP_HOST_PORT` fallback | `http://localhost:58001` |
| MongoDB | `27017` | `27018` | `mongodb://localhost:27018` (host access), `mongodb://mongodb:27017/<db>?replicaSet=rs0` (container network) |
| Redis | `6379` | `6380` | `redis://localhost:6380` (host access), `redis://redis:6379` (container network) |
| MinIO API | `9000` | `9000` | `http://localhost:9000` |
| MinIO Console | `9001` | `9001` | `http://localhost:9001` |
| MinIO Bucket Init (`minio-init`) | n/a | n/a | One-shot bootstrap to create `MINIO_BUCKET` |
| MinIO Backup (`minio-backup`) | n/a | n/a | Optional mirror loop MinIO -> GCS bucket |
| Cron (`cron`) | n/a (worker process) | n/a | Internal background worker (`node dist/cron.js`) |

### 7.2 On-Prem Observability Stack

| Component | Container Port | Host Port (Default) | Endpoint / Access |
|---|---:|---:|---|
| Grafana | `3000` | `53000` | `http://localhost:53000` |
| Loki | `3100` | `3110` | `http://localhost:3110` |
| Prometheus | `9090` | `9091` | `http://localhost:9091` |
| Alertmanager | `9093` | `9093` | `http://localhost:9093` |
| blackbox-exporter | `9115` | `9115` | `http://localhost:9115` |
| cAdvisor | `8080` | `8088` | `http://localhost:8088` |
| node-exporter | `9100` | `9110` | `http://localhost:9110` |

### 7.3 Cloud Runtime and CI/CD Control Endpoints

| Area | Endpoint / Target | Notes |
|---|---|---|
| Cloud Run service | `https://<cloud-run-service-url>` | One service per env (`hris-api-dev`, `hris-api-uat`) |
| Artifact Registry | `${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}` | Container image registry for deploy artifacts |
| Secret Manager | `projects/<project>/secrets/<name>` | Runtime env injection via Cloud Run `--update-secrets` |
| Cloud Logging | GCP project logging endpoints/UI | Platform/runtime logs for Cloud Run |
| Better Stack | Host from `BETTER_STACK_HOST` | App telemetry/log shipping (when configured) |
| GitHub Actions Deploy | `.github/workflows/deploy.yml` | Branch-based deploy (`develop`, `uat`) |
| GitHub Actions Rollback | `.github/workflows/rollback.yml` | Manual traffic rollback to specific revision |

### 7.4 Hybrid Storage Backup Controls (On-Prem -> GCS)

| Control | Purpose |
|---|---|
| `MINIO_BACKUP_ENABLED` | Enable/disable MinIO mirror job |
| `MINIO_BACKUP_INTERVAL_SECONDS` | Mirror interval loop |
| `GCS_BACKUP_BUCKET` | Target GCS bucket for mirrored objects |
| `GCS_S3_ACCESS_KEY` / `GCS_S3_SECRET_KEY` | GCS interoperability credentials used by MinIO client (`mc`) |
