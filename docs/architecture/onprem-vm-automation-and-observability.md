# On-Prem VM Automation and Observability Stack Architecture

**Date:** 2026-06-18  
**Author:** Kilo (Automated Architecture Report)  
**Active File:** `scripts/bootstrap-onprem-vm.sh`  
**Status:** Current Production Design (Intentional Architecture)

## Executive Summary

The observability stack for on-premises deployments is **deliberately implemented using Docker Compose** (`docker-compose.yml`) and a dedicated bootstrap script rather than Terraform. 

The script `scripts/bootstrap-onprem-vm.sh` serves as the **single source of truth for VM initialization**. It transforms a fresh Ubuntu-based VM into a complete, self-contained, production-grade HRIS system with full observability, automatic boot integration, persistent storage, and management utilities.

This design prioritizes:
- Operational simplicity for on-prem administrators
- Maintainability of complex observability configuration
- Reliable startup ordering
- Familiar tooling (`docker compose`, systemd, bash)

It is **not technical debt** — it is a pragmatic, senior-level architecture choice documented in `hris-api/infrastructure/onprem/observability/README.md`.

## 1. Why Observability Is NOT in Terraform

### Detailed Reasons

1. **Configuration Volume and Complexity**  
   The observability stack includes **15+ intricate YAML files**:
   - `prometheus.yml` + `alerts.yml`
   - `loki-config.yml`
   - `tempo.yml`
   - `otel-collector/otel-collector.yml`
   - Grafana datasources, dashboards (`hris-user-activity-audit.json`, etc.)
   - Promtail, Alertmanager, blackbox-exporter configs
   - Backup and replication logic

   Converting these into Terraform `local_file` or inline `content` blocks would result in extremely large, hard-to-read, and difficult-to-maintain `.tf` files. Updates to alerting rules or dashboards would become painful.

2. **Operator Experience on Bare VMs**  
   On-prem operators expect standard workflows:
   - `docker compose ps`
   - `docker compose logs -f prometheus`
   - `docker compose restart grafana`
   - Direct editing of config files in the `observability/` directory
   - Simple `docker compose up -d`

   A pure Terraform Docker provider approach would hide these tools behind `terraform apply`, making troubleshooting slower.

3. **Strict Service Dependency Ordering**  
   The observability stack **must start first** to create the external Docker network `hris-observability`. The HRIS API and frontend containers attach to this network and send traces/logs to the OTEL Collector.  
   The bash layer (`project-truth-hris-env-start all`) guarantees correct ordering. Terraform `depends_on` is less reliable across restarts.

4. **Persistent Host Volume Management**  
   The stack uses many host-mounted volumes under `/srv/hris/observability/{grafana,prometheus,loki,tempo,alertmanager,collector,backups}`.  
   The bootstrap script creates these directories with proper permissions before any container starts. This is cleaner and more idempotent in bash than in Terraform on a fresh VM.

5. **Grafana Provisioning Excellence**  
   Grafana’s native file-based provisioning (datasources + dashboards mounted as volumes) works perfectly with Docker Compose. The current setup auto-provisions:
   - Prometheus, Loki, Tempo, Alertmanager datasources
   - Preloaded dashboards (`HRIS Observability Overview`, `HRIS User Activity and Audit`)

6. **Design Philosophy ("Senior Setup")**  
   The `observability/` folder is explicitly positioned as a **production-style observability bundle** for on-prem and hybrid workloads. It includes advanced features such as:
   - Rolling + full backups with retention
   - Remote replication via rclone (S3 compatible)
   - User activity logging with trace correlation
   - OTEL tracing + structured logs feeding Loki and Tempo
   - Baseline alerting rules

   This level of sophistication is better expressed in Compose + dedicated config files.

### Trade-off Summary

**Terraform (used in `hris-api/infrastructure/onprem/main.tf`)**: Excellent for simple services (Redis, MongoDB, MinIO, app, cron).  
**Docker Compose + Bootstrap Script**: Superior for complex, config-heavy, monitoring platforms that require ongoing human interaction.

## 2. The VM Automation Script: `scripts/bootstrap-onprem-vm.sh`

### Purpose

This is the **Day-0 / First-Boot Automation Script**.  
It performs a complete, idempotent setup of an on-prem VM so that after one execution, the system is fully functional and will start automatically on every subsequent boot.

### Execution Flow

#### Phase 1: One-Time Manual Bootstrap
```bash
sudo bash scripts/bootstrap-onprem-vm.sh
```

#### Phase 2: Automatic on Every Boot
The script installs a systemd service:
- `/etc/systemd/system/project-truth-hris.service`
- `ExecStart=/usr/local/bin/project-truth-hris-env-start all`
- Enabled with `systemctl enable`

This service runs at boot via `multi-user.target`.

### Detailed Breakdown of What the Script Does

| Step | Function | What It Does |
|------|----------|--------------|
| 1 | `install_docker()` | Installs `docker.io` and `docker-compose-v2` on Debian-based systems. Enables and starts the Docker service. |
| 2 | `sync_repo_to_install_root()` | Rsyncs (or cp) the entire repository from current location to `/opt/project-truth` (default). Excludes `.git` and all `node_modules`. |
| 3 | `prepare_persistent_dirs()` | Creates critical host directories: `/srv/hris/backups` and `/srv/hris/observability/{grafana,prometheus,loki,tempo,alertmanager,collector,backups}`. |
| 4 | `prepare_env_files()` | Copies `.env.example` → `.env` for both the main observability stack and the backup component (only if missing — idempotent). |
| 5 | `install_commands_and_services()` | Installs 6 management CLIs into `/usr/local/bin/` with correct permissions. Installs the systemd unit file, runs `daemon-reload`, and enables the service. |
| 6 | `start_stacks()` | 1. Changes to observability directory and runs `compose up -d`<br>2. Changes to appliance directory, builds images, starts Postgres, then hris-api and hris-app with `--no-deps`. |
| 7 | `verify_local_endpoints()` | Polls (up to 5 minutes) these critical endpoints:<br>• `http://127.0.0.1:3001/health` (HRIS API)<br>• `http://127.0.0.1:53000/api/health` (Grafana)<br>• Prometheus ready, Loki ready, Tempo ready, Collector metrics |

### Installed Management Commands

- `project-truth-hris-start` — Core start logic + image build check
- `project-truth-hris-env-start` — Environment-aware starter (`dev|uat|prod|all`). Always starts observability first.
- `project-truth-hris-observability-start` — Dedicated observability starter
- `project-truth-hris-status` — Shows container status + health
- `project-truth-hris-seed` / `project-truth-hris-env-seed` — Database seeding helpers

### Final Output on Success

```text
On-prem VM bootstrap complete.
Grafana: http://<vm-ip>:53000
HRIS app: http://<vm-ip>:3000
HRIS API health: http://<vm-ip>:3001/health
```

## 3. Integration with Terraform and Packer

- `terraform-hyperv/` creates and configures the **Hyper-V virtual machine** on Windows hosts (using pre-built VHDX images from Packer).
- `image-factory/packer/` builds the base Ubuntu image.
- The bootstrap script runs **inside** the VM after it is created.
- Current gap: The VM creation and bootstrap are not yet fully chained into a single `terraform apply`. This is a known evolution point.

See also: `docs/TERRAFORM_HYPERV_ARCHITECTURE.md` and `docs/ARCHITECTURE.md`.

## 4. Recommendations for Future Improvement

1. **High Priority**: Add cloud-init or a firstboot systemd service so that `terraform apply` can automatically trigger the bootstrap script inside the new VM.
2. **Medium Priority**: Make the bootstrap script fully idempotent and add a `--force` flag for re-runs.
3. **Long Term**: Evaluate whether a Kubernetes-based on-prem path (via Helm + Argo CD) should replace or complement the current Docker Compose approach.
4. Keep the observability stack in Compose unless there is a strong business requirement for pure Infrastructure-as-Code management of monitoring tools.

## 5. Related Documentation

- `hris-api/infrastructure/onprem/observability/README.md` — Primary observability documentation
- `hris-api/infrastructure/onprem/observability/docker-compose.yml` — Full stack definition (249 lines)
- `appliance/bin/project-truth-hris-env-start.sh` — Orchestration logic
- `appliance/systemd/project-truth-hris.service` — Boot integration
- `terraform-hyperv/main.tf` — VM provisioning
- `docs/ARCHITECTURE.md` — Overall Hyper-V architecture

## 6. Conclusion

The decision to keep observability in Docker Compose and centralize VM setup in `bootstrap-onprem-vm.sh` is **sound**. It balances developer velocity, operational excellence, and maintainability for real on-premises deployments.

This report was auto-generated based on analysis of the active file `scripts/bootstrap-onprem-vm.sh`, the observability directory, Terraform modules, and supporting documentation.

**End of Report**
