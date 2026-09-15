# Health Checks

Run the normal verifier:

```powershell
.\scripts\project-truth.ps1 verify -GuestIp <guest-lan-ip>
```

Run the persistent loop:

```powershell
.\scripts\project-truth.ps1 watch-until-healthy -GuestIp <guest-lan-ip> -MaxHours 8
```

`-GuestIp` is required. Without it, the watcher exits with `BLOCKED` because LAN, SSH, Kubernetes, and Argo CD proof require a booted VM with a discovered IP.

The verifier checks:

```text
http://127.0.0.1:3000/auth/login
http://127.0.0.1:3001/health
http://127.0.0.1:3100/auth/login
http://127.0.0.1:3101/health
http://127.0.0.1:3200/auth/login
http://127.0.0.1:3201/health
http://<guest-lan-ip>:3000/auth/login
http://<guest-lan-ip>:3001/health
http://<guest-lan-ip>:3100/auth/login
http://<guest-lan-ip>:3101/health
http://<guest-lan-ip>:3200/auth/login
http://<guest-lan-ip>:3201/health
ssh infra@<guest-lan-ip> "hostname; ip -br addr; docker ps || true; sudo kubectl get nodes; sudo kubectl get pods -A; sudo kubectl get svc -A; sudo kubectl get applications -n argocd || true"
```

App/API HTTP 200 with Argo runtime **Degraded** is expected when Job `bnpi-pats-api-db-init` is Failed. That is not an empty database. Do not reseed UAT/PROD or delete that Job to make Argo Healthy. `docs/DB_INIT_JOB.md`.

For host-only BNPI PATS appliance checks without a VM guest IP:

```powershell
.\scripts\project-truth.ps1 verify-local-bnpi-pats-runtime -Environment all
```

Logs are written under `.runtime/` and are not committed.

## Latest Local Result

Date: 2026-06-16

```text
Evidence folder: .runtime\overnight\20260616-090206
Selected VHDX: BLOCKED, C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx does not exist.
Approved-path VHDX search: BLOCKED, no .vhdx found.
Terraform apply: SKIPPED BY SAFETY GATE, no real selected VHDX.
VM IP: NOT TESTED, no VM boot.
Host-local DEV/UAT/PROD health: NOT TESTED, no VM boot.
LAN DEV/UAT/PROD health: NOT TESTED, no guest IP.
SSH/Kubernetes/Argo CD: NOT TESTED, no guest IP.
Self-repair: PROVEN, completed and reported health blocked until a guest IP exists.
```
