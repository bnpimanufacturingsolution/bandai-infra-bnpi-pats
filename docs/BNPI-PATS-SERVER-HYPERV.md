# BNPI PATS Server Hyper-V Runbook (strict terminal)

Server-side companion to `docs/BNPI-PATS-LOCAL-HYPERV.md`.
Assumes an elevated PowerShell, no GUI, no USB, no git push.
The branch work (`tunnel-repin-12e89b6a`) must be present in the
server repo copy first — retype the 3-file fix or pull the branch
once git is available.

## 0. Prerequisites (server)

- Hyper-V role + Management Tools (`Get-VM` works).
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
.\scripts\project-truth.ps1 bnpi-pats-full -BaseDir "C:\ProgramData\BandaiApp\Bnpipats" -VhdxName "<your-file>.vhdx"
```

With only a VHDX and no credential yet, stop after birth:

```powershell
.\scripts\project-truth.ps1 bnpi-pats-vm -VhdxPath "<full-path-to-vhdx>" -VmName "bnpi-pats" -BaseDir "C:\ProgramData\BandaiApp\Bnpipats"
```

Check first for a name clash:

```powershell
Get-VM -Name "bnpi-pats" -ErrorAction SilentlyContinue
```

If a row returns, remove/rename the old VM or pass another `-VmName`.

## 3. Layout it creates (untouched `ProjectTruth` folder stays as-is)

```text
C:\ProgramData\BandaiApp\Bnpipats\HyperV\               reserved host VM layout
C:\ProgramData\BandaiApp\Bnpipats\images\               source VHDX + .sha256 + .manifest
C:\ProgramData\BandaiApp\Bnpipats\logs\
C:\ProgramData\BandaiApp\Bnpipats\secrets\cloudflared\  put 12e89b6a-*.json here
C:\ProgramData\BandaiApp\Bnpipats\config\image.json
```

Leave `C:\ProgramData\BandaiApp\Bnpipats\bnpi-pats` (HRIS-era) alone until
the new VM is proven — verify with
`Get-VM | Select-Object Name, State, Path` which folder is active.

## 4. Connect Cloudflare (needs the credential + key on this server)

```powershell
# 4a. tunnel JSON for 12e89b6a must exist at:
#     C:\ProgramData\BandaiApp\Bnpipats\secrets\cloudflared\  (copy it here first)
# 4b. existing infra SSH private key must exist at:
#     $env:USERPROFILE\.ssh\node-health-appliance_ed25519
.\scripts\project-truth.ps1 bnpi-pats-full -BaseDir "C:\ProgramData\BandaiApp\Bnpipats" -WithPublic -TunnelJson "C:\ProgramData\BandaiApp\Bnpipats\secrets\cloudflared\12e89b6a-dabb-4897-9925-08ce9213b983.json"
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

## 7. Full command reference (every script in this flow)

| # | Command | Purpose |
|---|---|---|
| 1 | `doctor` | Host preflight (Hyper-V, tools, paths) |
| 2 | `select-image -ImagePath …` | Register VHDX in host config (no VM change) |
| 3 | `download-image -ImageUrl … -ExpectedSha256 …` | Hash-verified fetch + register |
| 4 | `build-image -TargetPlatform hyperv` | Bake VHDX (Packer, hours; skip here, VHDX exists) |
| 5 | `vhdx-autopilot -Mode Import -VhdxPath … -VmName …` | Direct Hyper-V import and start |
| 6 | `vhdx-autopilot -Mode SelfTestHyperV …` | Test-boot a VHDX, then teardown |
| 7 | `finalize-local-vhdx -VmName … -StopVm -Force` | Freeze proven disk to stable name + manifest + SHA |
| 8 | `bnpi-pats-vm -VhdxPath … -VmName … -BaseDir …` | Birth VM: SHA, direct import, IP wait, health |
| 9 | `bnpi-pats-full -BaseDir … [-SelfTest] [-WithPublic …]` | Bake (if missing) + birth + public in one command |
| 10 | `verify` | Host-local `:3000/:3001/:3100/:3101/:3200/:3201` checks |
| 11 | `watch-until-healthy -GuestIp …` | Poll host-local + LAN checks until green |
| 12 | `ensure-bnpi-cloudflare-host -Login` | Cloudflare account login (browser, once) |
| 13 | `ensure-bnpi-cloudflare-host` | Readiness report (cert, credential, key, task) |
| 14 | `ensure-bnpi-cloudflare-host -ProvisionDns -StartTunnel -VerifyPublic` | DNS routes + connector + public proof |
| 15 | `verify-gitops-state -GuestIp …` | Argo CD applications state on the VM |
| 16 | `vm-pull -GuestIp … -Status` | VM pull/sync status |
| 17 | `v6-one-shot -GuestIp …` | Full runtime proof (ansible-pull, tunnel import, network, browser) |

## 8. Troubleshooting

Same table as the laptop runbook, plus:

| Symptom | Cause / fix |
|---|---|
| `Get-VM` or `Get-VMSwitch` missing | Install/enable Hyper-V Management Tools on the server, then reopen the elevated shell. |
| `tunnel route dns` fails for a name | Wrong account login (`cert.pem`) or name already on the old tunnel; check dashboard DNS targets. |
| New VM and old appliance share `.19` | One of them must move IP; never run two VMs on one static LAN IP. |
