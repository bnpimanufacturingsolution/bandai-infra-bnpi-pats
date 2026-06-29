# Project Truth Summary

Last updated: 2026-06-29

## Current Runtime Truth

- Hyper-V is available from the elevated Windows host context.
- The current discovered Hyper-V proof VM is `project-truth-local-vhdx-proof`.
- The VM is attached to the `ProjectTruth-External` switch.
- The VM boots from `C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx`.
- The VM initially failed to start with 4 GB startup memory, then started after reducing dynamic memory to 1536 MB startup, 1024 MB minimum, and 3072 MB maximum.
- The current VM LAN IP after boot is `10.184.38.91`.
- SSH is exposed on `10.184.38.91:22`.
- SSH server banner evidence: `SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.16`.
- SSH password login is proven with the repo-documented appliance credential `infra / infra` through pinned-host-key `plink`.
- SSH key login is proven with Windows OpenSSH using `%USERPROFILE%\.ssh\node-health-appliance_ed25519`.
- OpenSSH proof returned hostname `project-truth-node`, user `infra`, `eth0 10.184.38.91/24`, and active SSH service.
- Plain OpenSSH `ssh infra@10.184.38.91` also works after loading `%USERPROFILE%\.ssh\node-health-appliance_ed25519` into Windows `ssh-agent`.
- Visual proof screenshot: `.runtime\hyperv-visual-proof\20260629-120737\pass-01\overview\vmconnect-client-summary.png`.
- The screenshot visibly shows `PROJECT TRUTH CLIENT SUMMARY`, `LAN IP: 10.184.38.91`, `LAN target: 10.184.38.91:22`, `OpenSSH: ssh infra@10.184.38.91`, and `Login: infra / infra`.
- Visual proof line-width check: `MaxLineLength=66`; the previous literal `r` line-ending artifact was fixed in `scripts/hyperv-visual-proof-loop.ps1` and `appliance/bin/project-truth-lan-summary.sh`.
- After warmup, HRIS LAN checks passed on `10.184.38.91` for PROD app/API (`3000`, `3001`), DEV app/API (`3100`, `3101`), and UAT app/API (`3200`, `3201`).
- Host-local PROD and DEV checks passed during validation, but host-local UAT ports `3200` and `3201` failed while LAN UAT passed.
- `%ProgramData%\ProjectTruth\config\project-truth.json` was backed up to `C:\ProgramData\ProjectTruth\config\project-truth.json.bak-20260629-114047` and updated to use VM `project-truth-local-vhdx-proof`, guest IP `10.184.38.91`, memory `1536`, and SSH port `22`.

## Current Drift

- `terraform-hyperv/terraform.tfvars` still lists SSH port `2222`, but the running VM exposes SSH on LAN port `22`.
- Previous LAN HRIS proof at `192.168.254.148` is stale for the current host session; it passed on 2026-06-28 but was not reachable on 2026-06-29.
- `verify-gitops-state -GuestIp 10.184.38.91` now reaches the VM over SSH, but the current Argo CD Application state needs follow-up: app sync statuses reported `Unknown`, runtime app health included `Degraded` and `Progressing`, and one Kubernetes API read returned `127.0.0.1:6443` connection refused.

## Operating Notes

- VM/GitOps/runtime work is admin / `hris-admin` operational work.
- Host-local Docker health is diagnostic only; the finish line remains VM LAN, GitOps, K3s/Argo CD, and HRIS app/API proof.
- Treat runtime IPs as evidence snapshots unless persisted through Project Truth configuration or a stable DHCP/static assignment.
