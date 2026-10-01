# Setup Doc 04 — Files 28 to 29 (VM import/start + CLI entry)

Covers the final 2 files of the 29-file Docker-relevant subset (partial group).

## 📁 Files Covered
28. `scripts/vhdx-autopilot.ps1`
29. `scripts/project-truth.ps1`

Related (flow references, documented in README, not counted here): `scripts/download-image.ps1`, `scripts/select-image.ps1`, `scripts/bnpi-pats-vm.ps1`, `scripts/verify-gcp-image-boot.ps1`, `scripts/watch-until-healthy.ps1`.

## 🖼️ Role in the Docker Image

### 28. `scripts/vhdx-autopilot.ps1` — direct Hyper-V import/start (normal path)
- Why: the normal user flow does NOT `docker run` on Windows. It imports the prebuilt `.vhdx` as a Gen2 VM, starts it, and proves guest IP + LAN health. Modes: `Import` (VHDX→VM+start), `SelfTestHyperV` (create/start/delete lifecycle without deleting source VHDX), `DeleteHyperV`/`ResetHyperV`/`ResetVirtualBox`/`ResetImages`/`ResetAll` (scoped to Project Truth names; add `-DeleteVhdx` only to remove `*.vhdx` from images dir).
- Docker relation: Docker runs **inside** the Linux VM after this script succeeds (VM owns Docker Engine + K3s/Argo). Host stays Hyper-V-only (no Project Truth Docker/WSL runtime on host per architecture rule).
- Env/volumes/secrets: `-VhdxPath` (default `C:\ProgramData\BandaiApp\Bnpipats\images\project-truth-node-latest.vhdx`), `-VmName` (`project-truth-node-01` canonical; proof VM `project-truth-local-vhdx-proof`), `-PollCount/-PollSeconds`; auto-retries lower RAM if 4 GB startup fails. No secrets.
- Safety: keeps VM-managed Cloudflare Tunnel active; never disables `cloudflared-bnpi-pats.service`.

### 29. `scripts/project-truth.ps1` — CLI dispatcher (doctor/select/vhdx/build/verify)
- Why: single entry: `doctor`, `select-image -ImagePath …`, `vhdx-autopilot -Mode Import …`, `watch-until-healthy -GuestIp …`, `build-image -TargetPlatform hyperv|virtualbox`, `verify`. Wires `C:\ProgramData\BandaiApp\Bnpipats\config\image.json` + `project-truth.json` (ports `3000/3001` prod, `3100/3101` dev, `3200/3201` uat, `3300/3310/3320` employee historical).
- Docker relation: `build-image` delegates to Packer path (maintainer); daily flow is `select-image` + `vhdx-autopilot`, then VM-internal Docker/K3s proof.
- No secrets baked; config records selected image path + SHA-256 + VM settings.

## 🛠️ Scripts & Commands

```bash
# normal flow (PowerShell, elevated for Hyper-V)
.\scripts\project-truth.ps1 doctor
.\scripts\project-truth.ps1 select-image -ImagePath C:\ProgramData\BandaiApp\Bnpipats\images\project-truth-node-latest.vhdx
.\scripts\project-truth.ps1 vhdx-autopilot -Mode Import -VhdxPath C:\ProgramData\BandaiApp\Bnpipats\images\project-truth-node-latest.vhdx -VmName bnpi-pats
.\scripts\project-truth.ps1 watch-until-healthy -GuestIp <guest-lan-ip>

# self-test lifecycle (no source VHDX delete)
.\scripts\project-truth.ps1 vhdx-autopilot -Mode SelfTestHyperV -VhdxPath "C:\ProgramData\BandaiApp\Bnpipats\images\project-truth-node-latest.vhdx" -VmName "project-truth-devcurrent" -PollCount 6 -PollSeconds 5

# docker save → stage next to VHDX (this task's choice: tarball only, no VHDX rebuild)
docker save bnpi-pats-api-local:develop | gzip > bnpi-pats-api-develop.tar.gz
# copy staged tarball to C:\ProgramData\BandaiApp\Bnpipats\images\ (done by build script below)
```

## ✅ Verification
- `doctor` greens Hyper-V + switch; `select-image` records SHA-256 match in `config\image.json`.
- `vhdx-autopilot Import` prints guest IP; `watch-until-healthy` proves `http://<guest-lan-ip>:3001/health` etc.
- Inside VM: `hostname`, `ip a`, `docker ps` (if Docker present), `kubectl get nodes/pods/svc`, `argocd app list`.
- Host Docker diag (this task): `docker ps`, `docker logs <diag-container>`, `curl` health endpoints.

## ⚠️ Notes
- If Hyper-V reports `Not enough memory ... 4096 MB` (seen 2026-09-24 Packer log), free RAM / lower startup RAM via autopilot retry — do not force-start by disabling other safety services.
- Cleanup modes are name-scoped; `-DeleteVhdx` is destructive to images — requires explicit operator intent (not used in this task).
- Windows host must not gain a Project Truth Docker/WSL runtime; `vEthernet (WSL …)` is drift, not a dependency.
