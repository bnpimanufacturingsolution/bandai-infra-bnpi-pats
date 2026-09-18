Hyper-V Golden Image with SSH (run on the VM you'll template)
1. Inside the VM (PowerShell as Admin)
# --- OpenSSH Server ---
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType 'Automatic'

# --- Firewall ---
New-NetFirewallRule -Name 'OpenSSH' -DisplayName 'OpenSSH Server' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22

# --- Key-based auth (recommended) ---
$keyPath = "C:\ProgramData\ssh\administrators_authorized_keys"
New-Item -ItemType Directory -Force -Path (Split-Path $keyPath)
# PASTE YOUR PUBLIC KEY HERE (one per line):
# "ssh-ed25519 AAAA... your@email" | Out-File -Encoding ascii $keyPath
# Or manually edit with notepad after

icacls $keyPath /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"

# --- Harden sshd_config ---
$cfg = "C:\ProgramData\ssh\sshd_config"
(Get-Content $cfg) -replace '#?PermitRootLogin.*', 'PermitRootLogin no' `
                       -replace '#?PasswordAuthentication.*', 'PasswordAuthentication no' `
                       -replace '#?PubkeyAuthentication.*', 'PubkeyAuthentication yes' | Set-Content $cfg

Restart-Service sshd
2. (Optional) Cloudflare Tunnel for SSH anywhere
# Install cloudflared
mkdir C:\cloudflared -Force
Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile "C:\cloudflared\cloudflared.exe"

# Config (replace YOUR_TUNNEL_ID)
@"
tunnel: YOUR_TUNNEL_ID
credentials-file: C:\cloudflared\YOUR_TUNNEL_ID.json
ingress:
  - hostname: bnpipats.tech
    service: http://localhost:3000
  - hostname: www.bnpipats.tech
    service: http://localhost:3000
  - hostname: ssh-vm.bnpipats.tech
    service: ssh://localhost:22
  - service: http_status:404
"@ | Set-Content C:\cloudflared\config.yml

# Copy your tunnel credentials JSON to C:\cloudflared\YOUR_TUNNEL_ID.json FIRST

# Install as service
C:\cloudflared\cloudflared.exe service install --config C:\cloudflared\config.yml
Start-Service cloudflared
Set-Service cloudflared -StartupType Automatic
3. Sysprep (generalize for cloning)
# Run THIS LAST - shuts down VM
C:\Windows\System32\Sysprep\Sysprep.exe /generalize /oobe /shutdown
4. In Hyper-V Manager
1. VM is now Off (sysprep shut it down)
2. Right-click VM → Export → choose folder → this is your golden image
3. To deploy: Import Virtual Machine → select exported folder → Copy the virtual machine (create new ID) → Finish
5. Each new VM from template
- Boots to OOBE (set admin password, network, etc.)
- SSH already works:
- LAN/VPN: ssh admin@vm-ip
- Cloudflare: ssh admin@ssh-vm.bnpipats.tech
Your public key (run on your laptop if you don't have one):
ssh-keygen -t ed25519
cat ~/.ssh/id_ed25519.pub