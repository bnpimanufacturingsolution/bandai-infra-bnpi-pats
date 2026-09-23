# SSH Access for Hyper-V VM via Cloudflare Tunnel (ssh.bnpipats.tech)

## Overview
Reuses existing Cloudflare Zero Trust SSH application `ssh.bnpipats.tech` for Hyper-V VM remote access.

## Current Configuration
- **Tunnel**: `bnpi-pats` (ID: 12e89b6a-dabb-4897-9925-08ce9213b983)
- **SSH Hostname**: `ssh.bnpipats.tech`
- **Access Policy**: `allow-owner-ssh` (allows owner email)
- **Browser SSH**: Enabled
- **Origin**: Hyper-V VM LAN IP on port 22

## 1. Hyper-V VM Setup (run once on VM via console/RDP)

```powershell
# --- OpenSSH Server ---
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType 'Automatic'

# --- Firewall ---
New-NetFirewallRule -Name 'OpenSSH' -DisplayName 'OpenSSH Server' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22

# --- Key-based auth (recommended) ---
$keyPath = "C:\ProgramData\ssh\administrators_authorized_keys"
New-Item -ItemType Directory -Force -Path (Split-Path $keyPath)
# Paste your PUBLIC key (one per line):
# "ssh-ed25519 AAAA... your@email" | Out-File -Encoding ascii $keyPath
icacls $keyPath /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"

# --- Harden sshd_config ---
$cfg = "C:\ProgramData\ssh\sshd_config"
(Get-Content $cfg) -replace '#?PermitRootLogin.*', 'PermitRootLogin no' `
                       -replace '#?PasswordAuthentication.*', 'PasswordAuthentication no' `
                       -replace '#?PubkeyAuthentication.*', 'PubkeyAuthentication yes' | Set-Content $cfg

Restart-Service sshd
```

## 2. Cloudflare Tunnel Config (on host running cloudflared)

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
    service: ssh://<HYPERV_VM_LAN_IP>:22
  - service: http_status:404
```

**Replace `<HYPERV_VM_LAN_IP>`** with actual VM IP (e.g., `10.184.37.19`).

**Restart tunnel**:
```powershell
Restart-Service cloudflared
# or manual:
cloudflared tunnel run --config C:\Users\<you>\.cloudflared\config.yml bnpi-pats
```

## 3. Cloudflare Zero Trust Dashboard (already configured)

**Application**: `ssh.bnpipats.tech` (Type: SSH)
- **Policy**: `allow-owner-ssh` → Allow → Include: Owner email
- **Browser SSH**: Enabled

## 4. Connect from Laptop

**Browser SSH (any device)**:
```
https://ssh.bnpipats.tech
```

**CLI SSH (prepared workstation)**:
```bash
# One-time
cloudflared access ssh --hostname ssh.bnpipats.tech
ssh username@ssh.bnpipats.tech

# Or with SSH config (~/.ssh/config):
Host vm-cf
    HostName ssh.bnpipats.tech
    User <vm-username>
    ProxyCommand cloudflared access ssh --hostname %h

# Then:
ssh vm-cf
```

**Direct SSH (LAN/VPN)**:
```bash
ssh username@<HYPERV_VM_LAN_IP>
```

## 5. VM Image Baking (for golden image)

Add to Packer/sysprep script:
```powershell
# Run BEFORE sysprep
# ... OpenSSH setup from step 1 ...

# Sysprep (last step)
C:\Windows\System32\Sysprep\Sysprep.exe /generalize /oobe /shutdown
```

**Note**: Do NOT bake Cloudflare tunnel credentials into image. Import at runtime via host script.

## Verification

```powershell
# On VM
Get-Service sshd | Format-Table Name, Status, StartType

# On host
cloudflared tunnel route list bnpi-pats | findstr ssh
ssh -o ProxyCommand="cloudflared access ssh --hostname %h" username@ssh.bnpipats.tech
```