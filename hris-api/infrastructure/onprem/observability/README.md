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
- Retention:
  - `BACKUP_KEEP_ROLLING`
  - `BACKUP_KEEP_FULL`
- Each backup also writes a `.sha256` checksum file

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


