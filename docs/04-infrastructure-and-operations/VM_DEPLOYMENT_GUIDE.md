# VM Deployment Guide

Complete step-by-step from Hyper-V VM creation to app deployment with domain.

## Prerequisites

- Windows with Hyper-V enabled
- Terraform installed
- Packer installed (for image building)
- SSH key at `%USERPROFILE%\.ssh\node-health-appliance_ed25519`
- Cloudflare account with `bnpipats.tech` domain
- Cloudflare tunnel credentials JSON file

---

## Step 1: Build the Base Image (Packer)

```powershell
cd C:\Users\zenja\OneDrive\Desktop\UZARO-PROJECT\HRIS-BANDAI\bandai-infra

# Build Hyper-V image
.\scripts\project-truth.ps1 build-image -TargetPlatform hyperv
```

This creates: `C:\ProgramData\BandaiApp\Bnpipats\images\project-truth-node-latest.vhdx`

---

## Step 2: Deploy VM with Terraform

```powershell
cd terraform-hyperv

# Edit terraform.tfvars
# vm_name           = "bnpi-pats"
# source_image_path = "C:\ProgramData\BandaiApp\Bnpipats\images\project-truth-node-latest.vhdx"
# net_adapter_names = ["Wi-Fi"]  # or ["Ethernet"]

# Initialize and apply
terraform init
terraform plan
terraform apply -auto-approve
```

This creates:
- Hyper-V switch `ProjectTruth-External`
- VM `bnpi-pats` with 4GB RAM, 2 CPUs
- Copies VHDX and boots the VM

---

## Step 3: Verify VM is Running

```powershell
# Check VM state
Get-VM -Name bnpi-pats | Select-Object Name, State, CPUUsage, MemoryAssigned

# Get VM IP
Get-VMNetworkAdapter -VMName bnpi-pats | Select-Object IPAddresses

# Verify network bridge
.\scripts\verify-hyperv-bridge.ps1 -VmName bnpi-pats -SwitchName ProjectTruth-External
```

---

## Step 4: SSH into the VM

```powershell
# Find VM IP (e.g., 10.184.37.241)
ssh infra@<VM_IP>

# Or use the SSH key
ssh -i %USERPROFILE%\.ssh\node-health-appliance_ed25519 infra@<VM_IP>
```

---

## Step 5: Initial VM Setup (Inside VM)

```bash
# Run the one-shot setup (first boot)
sudo project-truth-v6-one-shot

# Or manually:
# 1. Pull latest code
sudo project-truth-ansible-pull

# 2. Apply ArgoCD platform
sudo project-truth-ansible-pull  # This runs the playbook
```

---

## Step 6: Deploy App via GitOps (Inside VM)

The VM uses ArgoCD + K3s. The app is deployed automatically:

```bash
# Check ArgoCD applications
kubectl get applications -n argocd

# Check pods
kubectl get pods -A

# Check services
kubectl get svc -n dev
kubectl get svc -n uat
kubectl get svc -n prod
```

**What's running:**

| Namespace | App Port | API Port |
|---|---|---|
| `prod` | `:3000` | `:3001` |
| `dev` | `:3100` | `:3101` |
| `uat` | `:3200` | `:3201` |

---

## Step 7: Configure Cloudflare Tunnel (Inside VM)

```bash
# Install cloudflared if not present
sudo project-truth-os-sync

# Set up the tunnel with credentials
sudo project-truth-cloudflare-vm-tunnel /path/to/12e89b6a-dabb-4897-9925-08ce9213b983.json

# Verify tunnel is running
sudo systemctl status cloudflared-bnpi-pats.service
```

---

## Step 8: Add DNS Records in Cloudflare

In your Cloudflare dashboard for `bnpipats.tech`:

| Type | Name | Content | Proxy |
|---|---|---|---|
| CNAME | `@` | `12e89b6a-dabb-4897-9925-08ce9213b983.cfargotunnel.com` | Proxied |
| CNAME | `dev` | `12e89b6a-dabb-4897-9925-08ce9213b983.cfargotunnel.com` | Proxied |
| CNAME | `uat` | `12e89b6a-dabb-4897-9925-08ce9213b983.cfargotunnel.com` | Proxied |
| CNAME | `api` | `12e89b6a-dabb-4897-9925-08ce9213b983.cfargotunnel.com` | Proxied |
| CNAME | `ssh` | `12e89b6a-dabb-4897-9925-08ce9213b983.cfargotunnel.com` | Proxied |
| CNAME | `grafana` | `12e89b6a-dabb-4897-9925-08ce9213b983.cfargotunnel.com` | Proxied |

---

## Step 9: Verify Public Access

From your Windows host:

```powershell
# Test PROD
curl https://bnpipats.tech/auth/login
curl https://api.bnpipats.tech/health

# Test DEV
curl https://dev.bnpipats.tech/auth/login
curl https://dev-api.bnpipats.tech/health

# Test UAT
curl https://uat.bnpipats.tech/auth/login
curl https://uat-api.bnpipats.tech/health

# Test SSH
ssh -o ProxyCommand="cloudflared access ssh --hostname %h" infra@ssh.bnpipats.tech
```

---

## Quick One-Shot Command

If you want to do everything in one go:

```powershell
cd C:\Users\zenja\OneDrive\Desktop\UZARO-PROJECT\HRIS-BANDAI\bandai-infra

# 1. Build image
.\scripts\project-truth.ps1 build-image -TargetPlatform hyperv

# 2. Deploy VM
.\scripts\terraform-apply.ps1 -Apply

# 3. Verify
.\scripts\verify-hyperv-bridge.ps1 -VmName bnpi-pats

# 4. SSH and setup
ssh infra@<VM_IP>
sudo project-truth-v6-one-shot

# 5. Configure tunnel (from VM)
sudo project-truth-cloudflare-vm-tunnel /path/to/credentials.json
```

---

## Domain Mapping

| Environment | URL | App Port | API Port |
|---|---|---|---|
| PROD | `https://bnpipats.tech` | `:3000` | `:3001` |
| DEV | `https://dev.bnpipats.tech` | `:3100` | `:3101` |
| UAT | `https://uat.bnpipats.tech` | `:3200` | `:3201` |
| API | `https://api.bnpipats.tech` | - | `:3001` |
| DEV API | `https://dev-api.bnpipats.tech` | - | `:3101` |
| UAT API | `https://uat-api.bnpipats.tech` | - | `:3201` |
| SSH | `https://ssh.bnpipats.tech` | - | `:22` |
| Grafana | `https://grafana.bnpipats.tech` | `:53000` | - |

---

## Summary Flow

```
Packer build → VHDX → Terraform create VM → Boot → Ansible pull → ArgoCD sync → Cloudflare tunnel → DNS → Live at bnpipats.tech
```

---

## Troubleshooting

### VM not getting IP

```powershell
# Check switch exists
Get-VMSwitch -Name ProjectTruth-External

# Check VM adapter is connected
Get-VMNetworkAdapter -VMName bnpi-pats | Select-Object SwitchName, IPAddresses

# Fix adapter if needed
Connect-VMNetworkAdapter -VMName bnpi-pats -SwitchName ProjectTruth-External
```

### Cloudflare tunnel not working

```bash
# Check tunnel status
sudo systemctl status cloudflared-bnpi-pats.service

# View logs
sudo journalctl -u cloudflared-bnpi-pats.service -f

# Restart tunnel
sudo systemctl restart cloudflared-bnpi-pats.service
```

### App not responding

```bash
# Check K3s pods
kubectl get pods -A

# Check ArgoCD sync
kubectl get applications -n argocd

# Check services
kubectl get svc -n prod
kubectl get svc -n dev
kubectl get svc -n uat
```

### DNS not resolving

```powershell
# Check DNS resolution
Resolve-DnsName bnpipats.tech
Resolve-DnsName dev.bnpipats.tech

# Test direct access
curl -H "Host: bnpipats.tech" http://<VM_IP>:3000
```
