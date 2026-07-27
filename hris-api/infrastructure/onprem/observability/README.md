<!-- docs-union: careful merge of standalone snapshot + bandai-infra develop (hris-api/infrastructure/onprem/observability/README.md) -->
# On-Prem Observability Stack (Senior Setup)

Production-style observability bundle for on-prem/hybrid workloads using:
- Grafana (visualization)
- Prometheus (metrics + alert rules)
- Alertmanager (alert routing)
- Loki + Promtail (centralized logs)
- cAdvisor + node-exporter (container + host telemetry)
- blackbox-exporter (HTTP health probes)
- backup sidecar (rolling + full backups)

## Quick Start
From repo root:

```bash
cd infrastructure/onprem/observability
cp .env.example .env
cp backup/.env.example backup/.env
docker compose up -d
```

## Endpoints
- Grafana: `http://localhost:53000`
- Prometheus: `http://localhost:9091`
- Loki: `http://localhost:3110`
- Alertmanager: `http://localhost:9093`
- blackbox-exporter: `http://localhost:9115`
- cAdvisor: `http://localhost:8088`
- node-exporter: `http://localhost:9110`
- Tempo: `http://localhost:3202` (from bandai-infra develop stack)
- OpenTelemetry Collector OTLP gRPC: `localhost:4317`
- OpenTelemetry Collector OTLP HTTP: `localhost:4318`
- OpenTelemetry Collector metrics: `http://localhost:8889/metrics`

## Grafana Login
- User: `admin`
- Password: from `.env` (`GRAFANA_ADMIN_PASSWORD`)

## Preloaded Dashboards
- `HRIS Observability Overview`
- `HRIS Container Logs`

## Backups (Rolling + Full)
Backups are written to host path:
- `infrastructure/onprem/observability/backups/rolling`
- `infrastructure/onprem/observability/backups/full`

Behavior:
- Rolling backup: created every interval (`BACKUP_INTERVAL_SECONDS`)
- Full backup: policy by `FULL_FREQUENCY` (`daily|weekly|monthly|always`)
- Retention (defaults tightened after root-full / DiskPressure incident):
  - `BACKUP_KEEP_ROLLING` default **24** (was 48)
  - `BACKUP_KEEP_FULL` default **7** (was 30)
- Each backup also writes a `.sha256` checksum file
- Host safety net: `project-truth-disk-guard` (systemd timer) age-prunes rolling
  backups older than 3d and full backups older than 14d, and fails when free
  space is under 30 GiB or usage is above 85%. See
  `appliance/bin/project-truth-disk-guard.sh`.

Manual backup now:
```bash
docker compose exec backup sh /backup/backup.sh
```

Manual restore extract:
```bash
docker compose exec backup sh /backup/restore.sh /backups/full/<backup-file>.tar.gz
```

## Off-Machine Replication (Remote Copy)
Replication service: `backup-replicator` (rclone-based).

Setup:
1. Create rclone config:
```bash
cp rclone/rclone.conf.example rclone/rclone.conf
```
2. Edit `rclone/rclone.conf` with your real remote credentials.
3. Enable replication in `backup/.env`:
```bash
REMOTE_REPLICATION_ENABLED=true
RCLONE_REMOTE_PATH=s3-remote:hris-observability-backups
REPLICATION_INTERVAL_SECONDS=1800
```
4. Start/restart stack:
```bash
docker compose up -d
```

Manual replication test:
```bash
docker compose exec backup-replicator rclone lsf "${RCLONE_REMOTE_PATH}" --config /config/rclone/rclone.conf
docker compose logs --tail 100 backup-replicator
```

## Senior-Level Features Included
- Environment-driven ports and credentials (`.env`)
- Prometheus alerting pipeline wired to Alertmanager
- Baseline alert rules for target down, CPU/memory pressure, restart spikes, failed HTTP probes
- Blackbox probes for service health endpoints
- Loki retention + ingestion/query limits
- Promtail labels for container/service/project for better log filtering
- Auto-provisioned Grafana datasources (Prometheus, Loki, Alertmanager)
- Automated rolling and full backups with retention pruning

## Operations
Reload Prometheus config/rules without restart:
```bash
curl -X POST http://localhost:9091/-/reload
```

Restart only Grafana provisioning:
```bash
docker compose restart grafana
```

Stop stack:
```bash
docker compose down
```

## Hardening Recommendations (Before Production)
- Change `GRAFANA_ADMIN_PASSWORD`
- Restrict inbound ports with firewall or reverse proxy
- Add TLS termination (Nginx/Traefik)
- Replace Alertmanager default receiver with Slack/Email/Webhook receiver
- Add app-native `/metrics` (Prometheus exposition format) for business and API metrics
- Replicate backup directory to remote storage (NFS/S3/rsync) for disaster recovery

---

## Additional sections from bandai-infra develop

_These headings existed only on the monorepo develop tree at recombine time._

## VM Bootstrap
For a fresh Ubuntu-based on-prem VM that already has this repo checkout, run from
the repo root:

```bash
sudo bash scripts/bootstrap-onprem-vm.sh
```

The bootstrap script:
- installs Docker and Docker Compose when missing
- syncs the repo to `/opt/project-truth` unless `PROJECT_TRUTH_ROOT` is set
- creates `/srv/hris/backups`
- creates `/srv/hris/observability/{grafana,prometheus,loki,tempo,alertmanager,collector,backups}`
- creates missing observability `.env` files from examples
- installs `project-truth-hris-*` commands into `/usr/local/bin`
- enables `project-truth-hris.service`
- starts observability first, then Postgres, API, and app
- verifies API, Grafana, Prometheus, Loki, Tempo, and Collector endpoints

The boot service uses `project-truth-hris-env-start all`, which now starts the
observability stack before app containers attach to the shared
`hris-observability` Docker network.

## Application Wiring
API and cron containers must share the `hris-observability` Docker network and send traces to the collector:

```env
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=onprem,service.namespace=hris
API_ACTIVITY_LOGGING_ENABLED=true
API_ACTIVITY_LOG_INCLUDE_READS=true
API_ACTIVITY_LOG_EXCLUDED_PATHS=/health,/metrics
```

The appliance compose files already attach HRIS API/app containers to the external
`hris-observability` network. Start this observability stack first so the external
network exists.

## User Activity and Trace Correlation
The API writes request activity records to `ActivityLogging` for authenticated API
requests and emits matching structured log events named `api.activity.request`.
Each record/log includes route, method, status, duration, user context when
available, and OpenTelemetry `trace_id`/`span_id`.

Use Grafana:
- Dashboard: `HRIS User Activity and Audit`
- Logs: search Loki for `api.activity.request`
- Trace drilldown: copy or click `trace_id` into Tempo

Do not use Prometheus labels for raw user IDs, employee IDs, emails, session IDs,
or exact entity IDs. Prometheus is for aggregate operational metrics; durable user
accountability belongs in `ActivityLogging` and `AuditLogging`.

## Verification
```bash
docker compose config
docker compose up -d
docker compose ps
curl -f http://localhost:9091/-/ready
curl -f http://localhost:53000/api/health
curl -f http://localhost:3110/ready
curl -f http://localhost:3202/ready
curl -f http://localhost:8889/metrics
```

After the HRIS API is running, generate an authenticated API request and verify:
- `/metrics` exposes `hris_api_http_requests_total`
- Loki contains `api.activity.request`
- Tempo contains traces for `hris-api`
- Grafana datasources show Prometheus, Loki, Tempo, and Alertmanager as healthy
