# Project Truth Summary

Last updated: 2026-06-29

## Current Runtime Truth

- Hyper-V is available from the elevated Windows host context.
- The current discovered Hyper-V proof VM is `project-truth-local-vhdx-proof`.
- The VM is attached to the `ProjectTruth-External` switch.
- The VM boots from `C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx`.
- The VM initially failed to start with 4 GB startup memory, then started after reducing dynamic memory to 1536 MB startup, 1024 MB minimum, and 3072 MB maximum.
- The current VM LAN IP after the 2026-06-29 21:23 PHT Cloudflare repair pass is `192.168.254.148`.
- SSH is exposed on the current VM LAN address at `192.168.254.148:22`.
- SSH server banner evidence: `SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.16`.
- SSH password login is proven on `192.168.254.148` with the repo-documented appliance credential `infra / infra` through pinned-host-key `plink`; current host key fingerprint is `SHA256:+Xxejdej6SPlSKBEvEO/++Hh3j+QvoFSetx6DZXxiok`.
- SSH key login is proven on `192.168.254.148` with Windows OpenSSH using `%USERPROFILE%\.ssh\node-health-appliance_ed25519`.
- OpenSSH proof returned hostname `project-truth-node`, user `infra`, `eth0 192.168.254.148/24`, and active SSH service.
- Current LAN SSH command: `ssh -i %USERPROFILE%\.ssh\node-health-appliance_ed25519 infra@192.168.254.148`.
- Public Cloudflare SSH is now verified through `ssh.bnpi-hris.tech` using Cloudflare Access and the host-managed named tunnel.
- Verified public SSH command: `ssh -i %USERPROFILE%\.ssh\node-health-appliance_ed25519 -o ProxyCommand="cloudflared access ssh --hostname %h" infra@ssh.bnpi-hris.tech`.
- Windows OpenSSH alias `project-truth-hris` was added to `%USERPROFILE%\.ssh\config`; `ssh project-truth-hris` returned `SSH_ALIAS_OK`, hostname `project-truth-node`, and user `infra`.
- VM summary script was updated and live-installed so `project-truth-lan-summary --screen-overview`, `/etc/issue`, `/etc/motd`, and `/run/project-truth/network-summary.txt` show `LAN IP: 192.168.254.148`, `OpenSSH: ssh infra@192.168.254.148`, the key path, and public Cloudflare app/API/Grafana URLs.
- Current generated overview line-width check: `MaxLineLength=66`; stale `10.184.38.91` was not present in `/etc/issue`, `/run/project-truth/network-summary.txt`, or the generated overview.
- After the Cloudflare repair pass, HRIS LAN checks passed on `192.168.254.148` for PROD app/API (`3000`, `3001`), DEV app/API (`3100`, `3101`), UAT app/API (`3200`, `3201`), and Grafana (`53000`).
- The `bnpi-hris.tech` Cloudflare 1033 issue was repaired by logging into the Cloudflare account that owns `bnpi-hris.tech`, creating named tunnel `e3486f00-f974-46d3-9e11-911266749d00`, and routing app/API/dev/uat/Grafana hostnames to it.
- Public checks passed for `bnpi-hris.tech`, `www.bnpi-hris.tech`, `app.bnpi-hris.tech`, `api.bnpi-hris.tech`, `dev.bnpi-hris.tech`, `dev-api.bnpi-hris.tech`, `uat.bnpi-hris.tech`, `uat-api.bnpi-hris.tech`, and `grafana.bnpi-hris.tech`.
- Current named tunnel bootstrap ownership remains host-managed on the Windows host through `scripts/start-bnpi-cloudflare-tunnel.ps1`, scheduled task `ProjectTruth-BNPI-HRIS-Cloudflared`, `scripts/ensure-bnpi-cloudflare-host.ps1`, and `cloudflared-bnpi-hris.yml`.
- Current proof VM also has a VM-side Cloudflare named tunnel connector active through `cloudflared-bnpi-hris.service`, using root-only runtime credentials under `/etc/cloudflared` and localhost ingress, including `ssh.bnpi-hris.tech -> ssh://localhost:22`.
- Fresh/final images must not bake Cloudflare tunnel credentials. The repeatable setup is to boot/import the VM, discover its LAN IP, then run `.\scripts\project-truth.ps1 ensure-bnpi-cloudflare-host -ProvisionDns -StartTunnel -VerifyPublic` from a Windows host that has `cloudflared` and the named tunnel credentials.
- VM-managed Cloudflare Tunnel is now current runtime proof for the proof VM only after deliberate credential import. Fresh/final images still must not bake Cloudflare credentials.
- Host-local PROD and DEV checks passed during validation, but host-local UAT ports `3200` and `3201` failed while LAN UAT passed.
- `%ProgramData%\ProjectTruth\config\project-truth.json` was backed up and updated to use VM `project-truth-local-vhdx-proof`, guest IP hint `192.168.254.148`, memory `1536`, and SSH port `22`.

## Current Drift

- Earlier `10.184.38.91` runtime proof is stale for the current Cloudflare/SSH repair session; probes to that address timed out on 2026-06-29 at about 21:23 PHT, while `192.168.254.148` passed.
- `verify-gitops-state -GuestIp 10.184.38.91` previously reached the VM over SSH, but that IP is stale for the current session. Argo CD Application state still needs follow-up on `192.168.254.148`: previous app sync statuses reported `Unknown`, runtime app health included `Degraded` and `Progressing`, and one Kubernetes API read returned `127.0.0.1:6443` connection refused.
- Runtime quick tunnels are deprecated for normal public access. Historical TryCloudflare evidence may remain in old reports, but active VM boot/sync paths keep the TryCloudflare service disabled by default.

## Operating Notes

- VM/GitOps/runtime work is admin / `hris-admin` operational work.
- Host-local Docker health is diagnostic only; the finish line remains VM LAN, GitOps, K3s/Argo CD, and HRIS app/API proof.
- Treat runtime IPs as evidence snapshots unless persisted through Project Truth configuration or a stable DHCP/static assignment.
