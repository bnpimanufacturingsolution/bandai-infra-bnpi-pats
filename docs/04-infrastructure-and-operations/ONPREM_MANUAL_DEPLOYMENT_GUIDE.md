# BNPI PATS — On-Premises Manual Deployment Guide & Runbook

**System**: Production and Assembly Tracking System (PATS)  
**Organization**: Bandai Namco Philippines Inc. (BNPI)  
**Document Code**: `BNPI-PATS-OPS-DEP-001`  
**Classification**: Internal Technical / Operations Runbook  
**Target Environment**: On-Premises Hyper-V Appliance (`10.184.37.19`)  
**Runtime**: Linux Docker Compose / Systemd Services / K3s Alternate  

---

> [!NOTE]
> **Product Truth Notice (Retired Device Lane & HRIS Emp-App):**  
> As of September 15, 2026, the Hikvision/ZKTeco device lane and the standalone `bnpi-pats-emp-app` portal have been retired. BNPI PATS focuses exclusively on **factory floor manufacturing execution (PATS WIP routing, stations, lots, inventory)** and **integrated BNPI timekeeping/payroll**. Do not resurrect retired device services or legacy portals during deployment.

---

## 1. Executive Summary & Deployment Overview

This manual provides the definitive step-by-step instructions and command sequences required for operations engineers to manually deploy, update, configure, and verify the **BNPI PATS** application stack on the on-premises virtual appliance.

### 1.1 Architecture Stack Summary

| Component | Technology | On-Premises Role | Port / Target |
|---|---|---|---|
| **Host Machine** | Windows Server / Windows 11 | Hyper-V Hypervisor | Switch: `ProjectTruth-External` |
| **Virtual Appliance** | Ubuntu Linux 24.04 LTS | Core Runtime Node (`project-truth-node`) | Static LAN IP: `10.184.37.19` |
| **Frontend App** | React Router 7 / Vite / Node.js | Manufacturing & Timekeeping UI | Port `3000` (Prod) / `3100` (Dev) / `3200` (UAT) |
| **Backend API** | Node.js / Express / TypeScript / Prisma | REST API, Business Logic, DB Gateway | Port `3001` (Prod) / `3101` (Dev) / `3201` (UAT) |
| **Database** | PostgreSQL 16 (Alpine) | Relational Database (Persistent Volume) | Port `15432` (Prod) / `15433` (Dev) / `15434` (UAT) |
| **Observability** | Prometheus, Grafana, Loki, Tempo | LGTM Telemetry & Monitoring | Grafana: `53000`, Prometheus: `9091` |
| **Public Gateway** | Cloudflare Named Tunnel | Secure zero-inbound HTTPS/SSH tunnel | `*.bnpipats.tech`, `ssh.bnpipats.tech` |

---

## 2. Prerequisites & Access Requirements

Before executing the manual deployment, verify the following credentials and connectivity:

1. **Host Workstation**: Windows Server or Windows 11 with Hyper-V Module installed.
2. **Network Route**: Workstation connected to BNPI Factory LAN or configured with static route to `10.184.37.19`.
3. **SSH Private Key**: ED25519 appliance key located at:
   ```text
   %USERPROFILE%\.ssh\node-health-appliance_ed25519
   ```
4. **Appliance Linux User**: `infra` (with standard `sudo` authorization).
5. **Appliance Installation Root**: `/opt/project-truth`.

---

## 3. Step-by-Step Manual Deployment Procedure

### Phase 1: Host-Side Preparation (Windows Host)

Run the following commands in an elevated **PowerShell** prompt on the Windows Hyper-V host machine:

#### 1.1 Verify Hyper-V Virtual Switch & VM Status
```powershell
# Check that the external virtual switch exists
Get-VMSwitch -Name "ProjectTruth-External"

# Check appliance VM state
Get-VM -Name "project-truth-local-vhdx-proof"
```

#### 1.2 Start VM (if not currently running)
```powershell
Start-VM -Name "project-truth-local-vhdx-proof"
```

#### 1.3 Test Network Reachability to Appliance
```powershell
# Ping guest appliance IP
Test-Connection -ComputerName 10.184.37.19 -Count 3

# Verify SSH port (22) is listening
Test-NetConnection -ComputerName 10.184.37.19 -Port 22
```

#### 1.4 Connect to the Appliance via SSH
```powershell
ssh -i $env:USERPROFILE\.ssh\node-health-appliance_ed25519 infra@10.184.37.19
```
*(Or if using the configured OpenSSH alias: `ssh project-truth-bnpi-pats`)*.

---

### Phase 2: In-Appliance Workspace & Code Sync (Linux VM)

All subsequent commands in Phases 2 through 7 are executed **inside the Linux VM terminal (`infra@project-truth-node`)**.

#### 2.1 Navigate to Project Truth Root
```bash
cd /opt/project-truth
pwd
```

#### 2.2 Verify System Resources & Disk Space
```bash
# Check memory allocation (minimum 1.5 GB free recommended)
free -h

# Check root filesystem disk space (ensure at least 20 GB free)
df -h /
```

#### 2.3 Fetch Latest Code from Git Repository
```bash
# Fetch latest changes from canonical remote
git fetch origin develop

# Switch to develop branch
git checkout develop

# Pull the latest attested commits
git pull origin develop

# Verify current working commit
git log -1 --oneline
```

#### 2.4 Review Environment Configuration Files
Verify that the environment file `/opt/project-truth/appliance/env/bnpi-pats-api.env` is configured properly:
```bash
cat /opt/project-truth/appliance/env/bnpi-pats-api.env
```
Ensure key environment parameters are set:
```ini
NODE_ENV=production
PORT=3001
JWT_SECRET=your_production_secure_jwt_secret_here
JWT_EXPIRES_IN=7d
DATABASE_URL=postgresql://postgres:postgres@bnpi-pats-postgres:5432/bnpi_pats
STORAGE_PROVIDER=local
LOCAL_UPLOAD_ROOT=/app/uploads
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
PROJECT_TRUTH_VM_HOST=10.184.37.19
```

---

### Phase 3: Observability Stack Deployment

The telemetry and logging infrastructure must be online before core application containers launch.

#### 3.1 Ensure Shared Observability Network Exists
```bash
docker network inspect bnpi-pats-observability >/dev/null 2>&1 || \
docker network create bnpi-pats-observability
```

#### 3.2 Launch LGTM (Prometheus, Grafana, Loki, Tempo) Stack
```bash
cd /opt/project-truth/bnpi-pats-api/infrastructure/onprem/observability
docker compose up -d
```

#### 3.3 Verify Observability Health
```bash
# Check Grafana health
curl -fsS http://127.0.0.1:53000/api/health

# Check Prometheus readiness
curl -fsS http://127.0.0.1:9091/-/ready

# Check Loki readiness
curl -fsS http://127.0.0.1:3110/ready
```

---

### Phase 4: Database Provisioning & Schema Migration

> [!CAUTION]
> **Data Loss Prevention Policy:**  
> Never execute `npm run prisma-reset`, `prisma db push --accept-data-loss`, or `npm run prisma-seed` on Production or UAT databases. This destroys production lot tracking, timesheets, and employee rosters. Use safe deployment migrations only.

#### 4.1 Start PostgreSQL Service
```bash
cd /opt/project-truth/appliance

# For Production single stack:
docker compose up -d postgres

# Or for Multi-Environment stack (e.g. Production):
# docker compose -f docker-compose.environments.yml up -d bnpi-pats-postgres-prod
```

#### 4.2 Wait for PostgreSQL Readiness
```bash
# Poll until PostgreSQL reports ready
until docker exec bnpi-pats-postgres pg_isready -U postgres -d bnpi-pats >/dev/null 2>&1; do
  echo "Waiting for PostgreSQL to initialize..."
  sleep 2
done
echo "PostgreSQL is online and healthy."
```

#### 4.3 Execute Safe Schema Migrations
```bash
cd /opt/project-truth/bnpi-pats-api

# Generate Prisma client bindings
npx prisma generate --schema prisma/schema.prisma
npx prisma generate --schema prisma/pats/schema.prisma

# Apply pending schema migrations without data destruction
npm run prisma:pats:migrate:deploy
```

*(Optional First-Time Bootstrap Only: If this is an initial empty database, run bootstrap admin creation)*:
```bash
# ONLY on initial setup of a fresh empty system:
# npm run prisma:pats:bootstrap-local-admin
```

---

### Phase 5: Build Application Container Images

Build the updated container images directly on the appliance Docker engine.

#### 5.1 Build Backend REST API Image (`bnpi-pats-api`)
```bash
cd /opt/project-truth/bnpi-pats-api

# Capture current build SHA
BUILD_SHA=$(git rev-parse --short HEAD)

# Build API Docker image
docker build \
  --build-arg PROJECT_TRUTH_BUILD_SHA="$BUILD_SHA" \
  -t bnpi-pats-api-local:develop .
```

#### 5.2 Build Frontend Web Application Image (`bnpi-pats-app`)
```bash
cd /opt/project-truth/bnpi-pats-app

# Build App Docker image with standard /api reverse proxy prefix
docker build \
  --build-arg VITE_API_BASE_URL=/api \
  -t bnpi-pats-app-local:develop .
```

#### 5.3 Verify Built Images
```bash
docker images | grep -E "bnpi-pats-api-local|bnpi-pats-app-local"
```

---

### Phase 6: Start Application Services

Deploy and launch the updated application containers.

#### Option A: Single Production Stack (Standard)
```bash
cd /opt/project-truth/appliance

# Launch API and Web App containers
docker compose up -d --no-deps bnpi-pats-api bnpi-pats-app
```

#### Option B: Multi-Environment Production Stack
```bash
cd /opt/project-truth/appliance

# Deploy Production containers
docker compose -f docker-compose.environments.yml up -d --no-deps \
  bnpi-pats-api-prod \
  bnpi-pats-app-prod
```

#### Option C: Systemd Service Automated Startup (Recommended for Service Control)
```bash
# Restart the systemd management service
sudo systemctl daemon-reload
sudo systemctl restart project-truth-bnpi-pats.service

# Check service status
sudo systemctl status project-truth-bnpi-pats.service --no-pager
```

#### Option D: Appliance Helper Scripts
```bash
# Start all production services:
project-truth-bnpi-pats-start

# Or start specific environment:
project-truth-bnpi-pats-env-start prod
```

---

### Phase 7: Public Ingress & Cloudflare Named Tunnel

BNPI PATS uses an egress-only Cloudflare Named Tunnel (`cloudflared-bnpi-pats.service`) to provide public access without opening any inbound ports on the factory firewall.

#### 7.1 Verify Cloudflare Tunnel Service
```bash
sudo systemctl status cloudflared-bnpi-pats.service --no-pager
```

#### 7.2 Inspect Tunnel Connector Logs
```bash
journalctl -u cloudflared-bnpi-pats.service -n 25 --no-pager
```
*Verify that the tunnel reports active connections to Cloudflare edge data centers without TLS errors.*

> [!IMPORTANT]
> Never disable, stop, or mask `cloudflared-bnpi-pats.service` unless scheduled maintenance with an explicit fallback window has been authorized by operations management.

---

## 4. Post-Deployment Verification & Testing

Execute verification probes to confirm full service health and data connectivity.

### 4.1 In-Appliance Local Probes (from inside Linux VM)
```bash
# 1. Probe Backend API Health
curl -i http://127.0.0.1:3001/health
# Expected: HTTP/1.1 200 OK, {"status":"ok", ...}

# 2. Probe Web Frontend Health
curl -i http://127.0.0.1:3000/health
# Expected: HTTP/1.1 200 OK

# 3. Check Running Containers Status
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### 4.2 Windows Host Remote Probes (from Windows PowerShell)
```powershell
# Probe API health over LAN
curl.exe -s http://10.184.37.19:3001/health

# Probe Web App over LAN
curl.exe -s -o $null -w "%{http_code}`n" http://10.184.37.19:3000/
# Expected: 200
```

### 4.3 Automated Contract & Self-Heal Compliance Test
Run the repository test suite from the Windows host root:
```powershell
powershell -File scripts/test-self-heal-contract.ps1
```
*All contract checks must pass with green status.*

### 4.4 Browser Manual Acceptance Test
1. Open a browser and navigate to: `http://10.184.37.19:3000` (or `https://app.bnpipats.tech` if testing public route).
2. Enter administrator credentials:
   - **Email**: `admin@bandai.local`
   - **Password**: `password123`
3. Verify successful authentication and redirection to the main dashboard.
4. Verify core navigation views:
   - **Line Setup & Stations**: Workstations and floor line layouts load without HTTP 500.
   - **Planning Desk**: Parts lists, active projects, and routing stages display correctly.
   - **Line Operations**: Station scanning interface renders without JavaScript errors.
   - **Warehouse & Inventory**: Inter-stage transfers and lot balances display active records.

---

## 5. Operations & Maintenance Runbook

### 5.1 Viewing Container Logs
```bash
# Follow API logs in real time
docker logs -f --tail 100 bnpi-pats-api

# Follow Web App logs in real time
docker logs -f --tail 100 bnpi-pats-app

# Follow PostgreSQL logs
docker logs -f --tail 50 bnpi-pats-postgres
```

### 5.2 Restarting Individual Services
```bash
# Restart API only
docker compose restart bnpi-pats-api

# Restart Web App only
docker compose restart bnpi-pats-app
```

### 5.3 On-Demand Database Backup
```bash
# Execute immediate database backup dump
/opt/project-truth/appliance/bin/project-truth-db-access.sh backup

# List existing database backup archives
ls -lh /srv/bnpi-pats/backups/
```

### 5.4 Disaster Recovery / Rollback
If a newly deployed image fails validation:
```bash
# 1. Roll back Git commit to previous attested commit
cd /opt/project-truth
git checkout <PREVIOUS_STABLE_COMMIT_SHA>

# 2. Rebuild images
cd /opt/project-truth/bnpi-pats-api && docker build -t bnpi-pats-api-local:develop .
cd /opt/project-truth/bnpi-pats-app && docker build --build-arg VITE_API_BASE_URL=/api -t bnpi-pats-app-local:develop .

# 3. Restart services
cd /opt/project-truth/appliance
docker compose up -d --no-deps bnpi-pats-api bnpi-pats-app
```

---

## 6. Quick Command Cheat Sheet

| Task | Command |
|---|---|
| **SSH to Appliance** | `ssh -i $env:USERPROFILE\.ssh\node-health-appliance_ed25519 infra@10.184.37.19` |
| **Pull Latest Code** | `cd /opt/project-truth && git fetch origin develop && git pull origin develop` |
| **Start DB** | `cd /opt/project-truth/appliance && docker compose up -d postgres` |
| **Run Migrations** | `cd /opt/project-truth/bnpi-pats-api && npm run prisma:pats:migrate:deploy` |
| **Build API** | `cd /opt/project-truth/bnpi-pats-api && docker build -t bnpi-pats-api-local:develop .` |
| **Build App** | `cd /opt/project-truth/bnpi-pats-app && docker build --build-arg VITE_API_BASE_URL=/api -t bnpi-pats-app-local:develop .` |
| **Start App & API** | `cd /opt/project-truth/appliance && docker compose up -d bnpi-pats-api bnpi-pats-app` |
| **Check API Health** | `curl -fsS http://127.0.0.1:3001/health` |
| **Check App Health** | `curl -fsS http://127.0.0.1:3000/health` |
| **Check Tunnel** | `sudo systemctl status cloudflared-bnpi-pats.service` |
| **View Live Logs** | `docker logs -f --tail 100 bnpi-pats-api` |
| **Run Backup** | `/opt/project-truth/appliance/bin/project-truth-db-access.sh backup` |

---
*Document maintained by BNPI PATS Infrastructure & DevOps Team.*
