# Create Hyper-V VM from Existing VHDX (Golden Image)

## Prerequisites
- Windows Server / Windows 10/11 Pro VHDX (sysprep'd or not)
- Hyper-V enabled on host
- External virtual switch configured for LAN access

---

## 1. Create VM from VHDX

### Hyper-V Manager (GUI)
1. **New** → **Virtual Machine**
2. **Name**: `bnpi-pats-vm`
3. **Generation 2** (required for UEFI/VHDX)
4. **Memory**: 4096 MB (Startup) → ✅ **Use Dynamic Memory**
5. **Network**: Select your **External Virtual Switch**
6. **Connect Virtual Hard Disk** → **Use an existing virtual hard disk** → Browse to `.vhdx`
7. **Finish**

### PowerShell (Alternative)
```powershell
New-VM -Name "bnpi-pats-vm" -Generation 2 -MemoryStartupBytes 4GB -SwitchName "ExternalSwitch" -VHDPath "C:\Path\To\golden-image.vhdx"
Set-VM -Name "bnpi-pats-vm" -DynamicMemory
```

---

## 2. Start VM & Connect

```powershell
Start-VM -Name "bnpi-pats-vm"
```
- Hyper-V Manager → Right-click VM → **Connect**
- Wait for boot

---

## 3. First Boot: OOBE or Login

| VHDX State | Action |
|------------|--------|
| **Sysprep'd** (`/generalize /oobe /shutdown`) | Complete OOBE: Region → Keyboard → Admin user + password |
| **Not sysprep'd** | Log in with existing credentials |

---

## 4. Get VM LAN IP

```powershell
# Inside VM (PowerShell)
Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.254.*"
} | Select-Object IPAddress, InterfaceAlias
```
**Note the IP** (e.g., `10.184.37.19`)

---

## 5. Configure SSH (if not baked in VHDX)

```powershell
# Inside VM - PowerShell as Administrator

# --- OpenSSH Server ---
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType 'Automatic'

# --- Firewall ---
New-NetFirewallRule -Name 'OpenSSH' -DisplayName 'OpenSSH Server' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22

# --- Key-based Authentication ---
$keyPath = "C:\ProgramData\ssh\administrators_authorized_keys"
New-Item -ItemType Directory -Force -Path (Split-Path $keyPath)

# REPLACE with YOUR public key (one line):
"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... your@email" | Out-File -Encoding ascii $keyPath

icacls $keyPath /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"

# --- Harden sshd_config ---
$cfg = "C:\ProgramData\ssh\sshd_config"
(Get-Content $cfg) -replace '#?PermitRootLogin.*', 'PermitRootLogin no' `
                       -replace '#?PasswordAuthentication.*', 'PasswordAuthentication no' `
                       -replace '#?PubkeyAuthentication.*', 'PubkeyAuthentication yes' | Set-Content $cfg

Restart-Service sshd

# Verify
Get-Service sshd | Format-Table Name, Status, StartType
```

**If VHDX already has SSH + keys** → Skip this step.

---

## 6. Update Cloudflare Tunnel Config (on Host)

**File**: `cloudflared-bnpi-pats.yml` (or `~/.cloudflared/config.yml`)

```yaml
tunnel: 12e89b6a-dabb-4897-9925-08ce9213b983
credentials-file: C:\Users\<you>\.cloudflared\12e89b6a-dabb-4897-9925-08ce9213b983.json
ingress:
  - hostname: bnpipats.tech
    service: http://localhost:3000
  - hostname: www.bnpipats.tech
    service: http://localhost:3000
  - hostname: ssh.bnpipats.tech
    service: ssh://10.184.37.19:22   # <-- REPLACE with VM IP from Step 4
  - service: http_status:404
```

**Restart tunnel:**
```powershell
Restart-Service cloudflared
# or manual:
cloudflared tunnel run --config C:\Users\<you>\.cloudflared\config.yml bnpi-pats
```

---

## 7. Verify SSH Access

### Browser SSH (any device, no setup)
```
https://ssh.bnpipats.tech
```
→ Cloudflare Access login → Browser terminal opens

### CLI SSH (prepared workstation)
```bash
# One-time auth
cloudflared access ssh --hostname ssh.bnpipats.tech
ssh username@ssh.bnpipats.tech

# Persistent config (~/.ssh/config):
Host vm-cf
    HostName ssh.bnpipats.tech
    User <vm-admin-username>
    ProxyCommand cloudflared access ssh --hostname %h

# Then:
ssh vm-cf
```

### Direct LAN SSH (same network/VPN)
```bash
ssh username@10.184.37.19
```

---

## 8. (Optional) Create New Golden Image

After verifying everything works, create updated golden image:

```powershell
# Inside VM - run LAST
C:\Windows\System32\Sysprep\Sysprep.exe /generalize /oobe /shutdown
```

**Hyper-V Manager** → Right-click VM → **Export** → Choose folder → **Finish**

Exported folder = new golden image (contains `.vmcx`, `.vhdx`, snapshots)

---

## Quick Reference

| Task | Command |
|------|---------|
| Get VM IP (from host) | `Get-VM -Name "bnpi-pats-vm" \| Select -ExpandProperty NetworkAdapters \| Select IPAddresses` |
| Start VM | `Start-VM -Name "bnpi-pats-vm"` |
| Stop VM | `Stop-VM -Name "bnpi-pats-vm" -Force` |
| Check SSH service | `Get-Service sshd` |
| Restart tunnel | `Restart-Service cloudflared` |
| List tunnel routes | `cloudflared tunnel route list bnpi-pats` |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| No IP on VM | Check virtual switch is "External", VM network adapter connected |
| SSH connection refused | `Get-Service sshd` → must be Running; firewall rule exists |
| Cloudflare tunnel 502 | Verify VM IP in config matches actual VM IP; restart cloudflared |
| Browser SSH fails | Check Cloudflare Zero Trust → Applications → `ssh.bnpipats.tech` → Browser SSH enabled |
| Key auth fails | Verify `administrators_authorized_keys` permissions (Admin:F, SYSTEM:F only) |

---

## Related Files
- `bandai-infra/docs/ssh-bnpi-pats.md` - SSH via Cloudflare Tunnel details
- `bandai-infra/docs/CLOUDFLARE_NAMED_TUNNEL_RUNBOOK.md` - Tunnel operations
- `bandai-infra/docs/hyper-v deployment/hyperV-image.md` - Image baking guide