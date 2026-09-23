# BNPI PATS Server Hyper-V Runbook (strict terminal)

Server-side companion to `docs/BNPI-PATS-LOCAL-HYPERV.md`.
Assumes an elevated PowerShell, no GUI, no USB, no git push.
The branch work (`tunnel-repin-12e89b6a`) must be present in the
server repo copy first — retype the 3-file fix or pull the branch
once git is available.

## 0. Prerequisites (server)

- Hyper-V role + Management Tools (`Get-VM` works).
- Terraform in PATH.
- `cloudflared` in PATH (only for `-WithPublic`).
- Existing VHDX on this server, e.g.
  `D:\path\to\project-truth-node-local-hyperv-v7-current-state.vhdx`
  plus its `.sha256` sidecar.
- The live `project-truth-appliance` VM (old HRIS lane) stays untouched
  until the new VM proves green. Do not reuse its static IP on two VMs.

## 1. Get the fixes onto this server

No USB, no push. Either:

- (a) retype the 3-file fix:
  `scripts/start-bnpi-cloudflare-tunnel.ps1` (tunnel ID line 6,
  grafana DNS, 9 check URLs to `bnpipats.tech`),
  `scripts/ensure-bnpi-cloudflare-host.ps1` (tunnel ID line 4,
  `dnsNames` to `bnpipats.tech` set, no emp names),
  `appliance/bin/project-truth-cloudflare-vm-tunnel.sh`
  (tunnel ID line 5, delete emp blocks);
  plus new files `scripts/bnpi-pats-vm.ps1`,
  `scripts/bnpi-pats-full.ps1` and the 2-line dispatcher addition
  (`bnpi-pats-vm`, `bnpi-pats-full` in `scripts/project-truth.ps1`);
- (b) or `git pull` the branch once the remote allows it.

Prove the copy before building:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/tests/bnpi-cloudflare-config.test.ps1
```

Must print `bnpi Cloudflare config regression checks passed.`

## 2. One command

```powershell
cd C:\path\to\bandai-infra-bnpi-pats
.\scripts\project-truth.ps1 bnpi-pats-full -BaseDir "C:\ProgramData\BnpiPats" -VhdxName "<your-file>.vhdx"
```

With only a VHDX and no credential yet, stop after birth:

```powershell
.\scripts\project-truth.ps1 bnpi-pats-vm -VhdxPath "<full-path-to-vhdx>" -VmName "bnpi-pats" -BaseDir "C:\ProgramData\BnpiPats"
```

Check first for a name clash:

```powershell
Get-VM -Name "bnpi-pats" -ErrorAction SilentlyContinue
```

If a row returns, remove/rename the old VM or pass another `-VmName`.

## 3. Layout it creates (untouched `ProjectTruth` folder stays as-is)

```text
C:\ProgramData\BnpiPats\HyperV\               new VM + virtual disk
C:\ProgramData\BnpiPats\images\
C:\ProgramData\BnpiPats\logs\
C:\ProgramData\BnpiPats\secrets\cloudflared\  put 12e89b6a-*.json here
C:\ProgramData\BnpiPats\config\image.json
```

Leave `C:\ProgramData\ProjectTruth\bnpi-pats` (HRIS-era) alone until
the new VM is proven — verify with
`Get-VM | Select-Object Name, State, Path` which folder is active.

## 4. Connect Cloudflare (needs the credential + key on this server)

```powershell
# 4a. tunnel JSON for 12e89b6a must exist at:
#     C:\ProgramData\BnpiPats\secrets\cloudflared\  (copy it here first)
# 4b. existing infra SSH private key must exist at:
#     $env:USERPROFILE\.ssh\node-health-appliance_ed25519
.\scripts\project-truth.ps1 bnpi-pats-full -BaseDir "C:\ProgramData\BnpiPats" -WithPublic -TunnelJson "C:\ProgramData\BnpiPats\secrets\cloudflared\12e89b6a-dabb-4897-9925-08ce9213b983.json"
```

This imports the credential into the VM (`/etc/cloudflared`,
root-only, tmp copy removed), provisions DNS
(`api/dev-api/uat-api/grafana/ssh/db` on `bnpipats.tech`),
and verifies public URLs.

## 5. Prove

On the VM console:

```bash
project-truth-lan-summary --screen-overview
project-truth-lan-summary --screen-tunnels
```

Expect banner `BNPI PATS appliance`, LAN IP, `https://bnpipats.tech/...`,
`ssh project-truth-bnpi-pats`. From any browser:

```text
https://bnpipats.tech/auth/login
https://api.bnpipats.tech/health
```

Only cut over (stop/remove the HRIS appliance) after all three are green.

## 6. Troubleshooting

Same table as the laptop runbook, plus:

| Symptom | Cause / fix |
|---|---|
| `Missing both terraform.tfvars and example` | Repo copy incomplete; restore `terraform-hyperv/terraform.tfvars.example`. |
| `tunnel route dns` fails for a name | Wrong account login (`cert.pem`) or name already on the old tunnel; check dashboard DNS targets. |
| New VM and old appliance share `.19` | One of them must move IP; never run two VMs on one static LAN IP. |
