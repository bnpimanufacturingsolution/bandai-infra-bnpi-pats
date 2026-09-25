# BNPI PATS Infrastructure - Progress Log

## Status: BLOCKED - Hyper-V Not Installed

---

## What Was Done

### 1. Renamed VM to `bnpi-pats`
- `terraform.tfvars` - `vm_name = "bnpi-pats"`
- `variables.tf` - default value updated
- `terraform.tfvars.example` - example updated

### 2. Updated Domain from `bnpi-pats.tech` to `bnpipats.tech`
Files updated (15+):
- `scripts/verify-hyperv-bridge.ps1`
- `scripts/start-bnpi-cloudflare-tunnel.ps1`
- `appliance/bin/project-truth-cloudflare-vm-tunnel.sh`
- `appliance/env/bnpi-pats-api.env`
- `cloudflared-bnpi-pats.yml`
- `docs/04-infrastructure-and-operations/VM_DEPLOYMENT_GUIDE.md`
- `gitops/argocd/runtime-applications/` (dev/uat/prod namespaces)

Subdomains:
- **Production:** `bnpipats.tech`
- **Dev:** `dev.bnpipats.tech`
- **UAT:** `uat.bnpipats.tech`

### 3. Enabled WinRM on Laptop
- PSRemoting enabled
- Basic Auth enabled
- AllowUnencrypted enabled
- HTTPS listener on port 5986 with self-signed cert

### 4. Terraform Setup
- Provider: `taliesins/hyperv v1.2.1` (installed)
- `terraform init` ✅
- `terraform plan` ✅
- `terraform apply` ❌ - Fails with `401 - invalid content type`

### 5. Created VM Deployment Guide
- `docs/04-infrastructure-and-operations/VM_DEPLOYMENT_GUIDE.md`

### 6. Cloudflare Tunnel Config
- Tunnel ID: `e3486f00-f974-46d3-9e11-911266749d00`
- Config file: `cloudflared-bnpi-pats.yml`

---

## Current Blocker

### Hyper-V Not Installed

**Error:**
```
BLOCKER] Feature name Microsoft-Hyper-V is unknown.
```

**Possible Causes:**
1. Windows 11 Home edition (does NOT support Hyper-V)
2. Virtualization disabled in BIOS
3. Hyper-V feature not available on this machine

**To Diagnose:**
Run in PowerShell:
```powershell
# Check Windows edition
(Get-WmiObject -Class Win32_OperatingSystem).Caption

# Check Hyper-V support
systeminfo | Select-String "Hyper-V"
```

**If Windows 11 Home:**
- Cannot use Hyper-V
- Need to upgrade to Windows 11 Pro/Enterprise, OR
- Use VirtualBox instead (the script also supports VirtualBox)

---

## Next Steps (After Hyper-V is resolved)

1. Run `vhdx-autopilot.ps1` to create the VM
2. Get VM IP address
3. SSH into VM
4. Pull Ansible playbooks from repo
5. Run ArgoCD sync
6. Configure Cloudflare tunnel
7. Verify subdomains work

---

## Key Files

| File | Purpose |
|------|---------|
| `terraform-hyperv/terraform.tfvars` | VM config (name, memory, CPU) |
| `terraform-hyperv/providers.tf` | Terraform provider config |
| `scripts/vhdx-autopilot.ps1` | VM creation script |
| `scripts/project-truth.ps1` | Main CLI entry point |
| `cloudflared-bnpi-pats.yml` | Cloudflare tunnel config |
| `appliance/env/bnpi-pats-api.env` | API environment config |

---

## Configuration Values

| Setting | Value |
|---------|-------|
| VM Name | `bnpi-pats` |
| VHDX Path | `C:\ProgramData\BandaiApp\Bnpipats\images\project-truth-node-latest.vhdx` |
| Hyper-V Switch | `ProjectTruth-External` |
| Production Domain | `bnpipats.tech` |
| Dev Domain | `dev.bnpipats.tech` |
| UAT Domain | `uat.bnpipats.tech` |
| Cloudflare Tunnel ID | `e3486f00-f974-46d3-9e11-911266749d00` |
| Windows Username | `zenncode\zenja` |

---

*Last Updated: September 18, 2026*
