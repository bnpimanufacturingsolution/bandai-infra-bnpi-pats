# BNPI PATS Local Hyper-V Runbook (laptop)

One-command flow on your own Hyper-V: bake the image, birth the VM,
optionally connect Cloudflare. Everything runs in one elevated terminal.

## 0. Prerequisites (laptop)

- Windows with Hyper-V enabled + Hyper-V Management Tools
  (`Get-VM` must exist).
- Terraform in PATH (`terraform --version`).
- `cloudflared` in PATH (only for `-WithPublic`).
- Elevated PowerShell (Run as Administrator).
- Repo checkout of `bandai-infra-bnpi-pats`
  (branch `tunnel-repin-12e89b6a` or later, containing
  `scripts/bnpi-pats-full.ps1`).
- Your account's tunnel: verify the ID first —
  `cloudflared tunnel list` must show `bnpi-pats`.
  This doc was written against tunnel `12e89b6a-dabb-4897-9925-08ce9213b983`
  on zone `bnpipats.tech`. If yours differs, pass nothing:
  the ID is script default; check it with
  `Select-String 12e89b6a scripts/*-*.ps1`.

## 1. One command

```powershell
cd C:\path\to\bandai-infra-bnpi-pats
.\scripts\project-truth.ps1 bnpi-pats-full -BaseDir "C:\ProgramData\BnpiPats"
```

What it does, in order:

| Leg | Step | Skipped when |
|---|---|---|
| 1 | Bake VHDX (`build-image`, Hyper-V Packer, hours) | VHDX already in `<BaseDir>\images` |
| 2 | Birth VM (`bnpi-pats-vm`): SHA check, `terraform-apply`, IP wait, health proof | Never (core job) |
| 3 | Public (`-WithPublic` only): credential import to VM, DNS, verify | Without the flag |

Useful flags:

```powershell
# test-boot + freeze the proven disk first (slower, safer)
.\scripts\project-truth.ps1 bnpi-pats-full -BaseDir "C:\ProgramData\BnpiPats" -SelfTest

# full run including Cloudflare (needs credential file on this host)
.\scripts\project-truth.ps1 bnpi-pats-full -BaseDir "C:\ProgramData\BnpiPats" -WithPublic -TunnelJson "$env:USERPROFILE\.cloudflared\12e89b6a-dabb-4897-9925-08ce9213b983.json"
```

## 2. Layout it creates

```text
C:\ProgramData\BnpiPats\HyperV\               VM + virtual disk
C:\ProgramData\BnpiPats\images\               VHDX + .sha256 + .manifest
C:\ProgramData\BnpiPats\logs\
C:\ProgramData\BnpiPats\secrets\cloudflared\  put the tunnel JSON here
C:\ProgramData\BnpiPats\config\image.json
```

Default `VmName` is `bnpi-pats`. Default `BaseDir` is
`C:\ProgramData\ProjectTruth` (kept for the existing server).

## 3. Expected result

PowerShell ends with:

```text
DONE. New VM: bnpi-pats @ <guest-ip>
LAN PROD: http://<guest-ip>:3000/auth/login + http://<guest-ip>:3001/health
LAN DEV:  http://<guest-ip>:3100/auth/login + http://<guest-ip>:3101/health
LAN UAT:  http://<guest-ip>:3200/auth/login + http://<guest-ip>:3201/health
```

VMConnect console shows the appliance banner
(`BNPI PATS appliance`, LAN IP, Cloudflare URL, SSH alias,
`infra` prompt) with a `Run:` list:

```bash
project-truth-lan-summary --screen-overview
project-truth-lan-summary --screen-tunnels
sudo project-truth-ansible-pull
```

With `-WithPublic`, additionally:

```text
https://bnpipats.tech/auth/login
https://api.bnpipats.tech/health
ssh project-truth-bnpi-pats
```

## 4. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Run as Administrator` throw | Reopen PowerShell elevated. |
| `Get-VM` missing | Enable Hyper-V Management Tools. |
| `terraform not found` | Install Terraform, reopen shell. |
| `VM 'bnpi-pats' already exists` | `Get-VM -Name bnpi-pats`; remove/rename old, or pass `-VmName`. |
| `SHA256 mismatch` | VHDX vs sidecar differ; re-download or rebuild. |
| `No guest IP appeared` | `Get-VMNetworkAdapter -VMName bnpi-pats`; check switch (`ProjectTruth-External`). |
| `Health checks did not pass` | Wait/warm-up; check `http://<guest-ip>:3001/health` manually. |
| `TunnelJson ... not found` | Copy `12e89b6a-*.json` to this host first; never commit it. |
| `SSH key not found` | Copy the existing infra private key; do not generate a new one (VM trusts the old public half). |

## 5. Never bake / never commit

- Tunnel credential JSON (`*12e89b6a-*.json`, any `TunnelSecret`).
- SSH private keys.
- `*.vhdx`, `*.iso`, `*.sha256` (git-ignored).

## 6. Single-leg commands (when you don't want the full run)

```powershell
.\scripts\project-truth.ps1 build-image -TargetPlatform hyperv -SwitchName "Default Switch"
.\scripts\project-truth.ps1 download-image -ImageUrl "<bucket-url>" -ExpectedSha256 "<sha>"
.\scripts\project-truth.ps1 bnpi-pats-vm -VhdxPath "<vhdx>" -VmName "bnpi-pats" -BaseDir "C:\ProgramData\BnpiPats"
.\scripts\project-truth.ps1 ensure-bnpi-cloudflare-host -ProvisionDns -StartTunnel -VerifyPublic
```
