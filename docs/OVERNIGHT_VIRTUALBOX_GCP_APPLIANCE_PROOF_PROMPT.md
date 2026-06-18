# Overnight Prompt: Project Truth GCP To VirtualBox Appliance Proof

## Mission

Prove the current Project Truth appliance from a clean Windows user journey, without drifting away from the VM state that is already known to pass LAN checks.

```text
current Project Truth VM state with passing PROD/DEV/UAT
  -> staged into a fresh Google Compute Packer build
  -> built as a new golden GCP image/artifact
  -> downloaded as a portable VirtualBox disk artifact
  -> download/export/import into VirtualBox
  -> bridged LAN adapter
  -> VM boots automatically
  -> Project Truth HRIS PROD, DEV, and UAT services start automatically
  -> PROD, DEV, and UAT are reachable from host and LAN
  -> login works for demo accounts
  -> status scripts prove what is running inside the VM
```

Do not fake success with a placeholder disk, a stale GCP image, or a local dev server. The proof must use a real bootable Project Truth VM artifact created from the intended current state and real browser/API checks.

Important builder rule: use Google Compute for the fresh build/export path. Do not spend the overnight run building the appliance locally unless GCP is unavailable and the final report clearly classifies that as an `ENVIRONMENT BLOCKER` or fallback.

## Working Folder

```powershell
cd C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH
```

## Current Repo Truth

This repo currently contains two related tracks:

```text
Track A: Hyper-V/Terraform/K3s/Argo documentation and scripts
Track B: Importable Linux appliance running HRIS through Docker Compose
```

For this overnight run, the acceptance target is Track B unless explicitly changed:

```text
VirtualBox appliance
bridged LAN
Docker Compose HRIS
PROD app/API: 3000/3001
DEV app/API: 3100/3101
UAT app/API: 3200/3201
```

K3s and Argo CD are useful evidence if present, but they are not a substitute for the HRIS appliance login and health proof.

## Current Passing LAN Baseline

Before replacing or deleting any GCP artifact, preserve this known-good baseline in the run log:

```text
Known passing host/LAN IP: 192.168.100.174
PROD app: http://192.168.100.174:3000/auth/login -> 200
PROD API: http://192.168.100.174:3001/health -> 200
DEV app:  http://192.168.100.174:3100/auth/login -> 200
DEV API:  http://192.168.100.174:3101/health -> 200
UAT app:  http://192.168.100.174:3200/auth/login -> 200
UAT API:  http://192.168.100.174:3201/health -> 200
CORS:
  3000 -> 3001 allowed
  3100 -> 3101 allowed
  3200 -> 3201 allowed
```

Treat this as the state to retain. If the imported artifact does not match this capability, do not call it proven.

## Safety Rules

Allowed:

```text
create logs under .runtime/
install VirtualBox if absent and the machine allows it
use Windows Sandbox or a clean Windows VM for clean-user testing
download Project Truth image artifacts
import a new VirtualBox VM
configure bridged networking
start/restart Project Truth VM
run browser/API checks
SSH into the VM for verification
```

Not allowed without explicit human approval:

```text
create a new local Windows user
invent or set Windows passwords
delete existing VMs
delete the only known-good GCP image/export
delete user files outside Project Truth runtime/cache folders
weaken Windows security
use UAC bypasses
claim success from screenshots only
claim success if only PROD works but DEV/UAT fail
```

If a clean user is needed, prefer Windows Sandbox or a clean disposable Windows VM. If a real local Windows user is truly required, stop and report the exact command, reason, and risk.

## Runtime Setup

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runRoot = ".runtime\overnight-virtualbox-gcp\$stamp"
New-Item -ItemType Directory -Force -Path $runRoot, "$runRoot\screenshots" | Out-Null
"RunRoot=$runRoot" | Tee-Object "$runRoot\run.log"
git status --short --branch *>&1 | Tee-Object "$runRoot\git-status.txt"
git rev-parse --short HEAD *>&1 | Tee-Object "$runRoot\git-commit.txt"
Get-PSDrive C | Format-List * | Out-String | Tee-Object "$runRoot\free-space-c.txt"
New-Item -ItemType Directory -Force -Path "C:\ProgramData\ProjectTruth\images" | Out-Null
```

## Phase 0: Golden Source And Drift Gate

The first job is to identify the exact source of truth. Do not use a random older GCP image only because it exists.

Known stale artifact decision:

```text
gs://project-truth-image-export-hris-492904-161377059311/project-truth-node-gcp-1781686573.vdi
```

Treat this export as old/stale unless the human explicitly re-blesses it during the run. Do not download it as the primary proof path.

Record all candidate sources:

```powershell
VBoxManage list vms *>&1 | Tee-Object "$runRoot\vbox-vms.txt"
VBoxManage list runningvms *>&1 | Tee-Object "$runRoot\vbox-runningvms.txt"
gcloud compute instances list --project "hris-492904" *>&1 | Tee-Object "$runRoot\gcp-instances.txt"
gcloud compute images list --project "hris-492904" --filter "family=project-truth-node OR name~project-truth" *>&1 | Tee-Object "$runRoot\gcp-images.txt"
gsutil ls -l gs://project-truth-image-export-hris-492904-161377059311/** *>&1 | Tee-Object "$runRoot\gcs-exports.txt"
```

For each candidate VM or image, record:

```text
name
created timestamp
disk/image id
source instance, if known
whether it can explain the passing LAN baseline
whether it contains /opt/project-truth/appliance
whether PROD/DEV/UAT are present
whether Docker volumes/images exist
```

If an existing GCP image does not come from the current passing state, classify it as `DRIFT CANDIDATE`. Do not delete it yet. Build or capture a new golden image first, prove the new artifact, and only then write the exact cleanup command under `Stale cleanup candidate`.

### Preferred Golden Path: Fresh Google Compute Build

Use the repo's GCP Packer build wrapper so the build runs on Google Compute, not on the local Windows host:

```powershell
$gcpProject = "hris-492904"
$zone = "asia-southeast1-a"
.\scripts\build-image-gcp.ps1 `
  -ProjectId $gcpProject `
  -Zone $zone *>&1 | Tee-Object "$runRoot\gcp-packer-build-wrapper.txt"
```

This wrapper stages the current repo folders into `image-factory\packer\staging`:

```text
gitops
appliance
hris-api
hris-app
```

After the build, identify the newest image created by this run:

```powershell
gcloud compute images list `
  --project $gcpProject `
  --filter "family=project-truth-node AND creationTimestamp>=$(Get-Date -Format yyyy-MM-dd)" `
  --sort-by "~creationTimestamp" *>&1 | Tee-Object "$runRoot\gcp-images-after-build.txt"

$goldenImage = "<newest-image-name-from-this-run>"
gcloud compute images describe $goldenImage --project $gcpProject *>&1 | Tee-Object "$runRoot\gcp-golden-image-describe.txt"
```

The new image must include the current repo service contract:

```text
appliance/systemd/project-truth-hris.service
ExecStart=/usr/local/bin/project-truth-hris-env-start all
```

If the Packer build succeeds but the exported/imported VM still has the old `project-truth-hris-start` ExecStart, classify as `DRIFT` or `REPO BUG`: the build did not consume the current staged repo.

### Optional Post-Build GCP Smoke Test

If time allows, create a short-lived GCP test instance from the new image before exporting. This is a cloud-side smoke test only; the final acceptance still requires VirtualBox import on Windows.

```powershell
$testInstance = "project-truth-golden-smoke-$(Get-Date -Format yyyyMMdd-HHmmss)"
gcloud compute instances create $testInstance `
  --project $gcpProject `
  --zone $zone `
  --machine-type e2-standard-4 `
  --image $goldenImage `
  --boot-disk-size 80GB *>&1 | Tee-Object "$runRoot\gcp-smoke-instance-create.txt"

gcloud compute ssh "infra@$testInstance" `
  --zone $zone `
  --project $gcpProject `
  --command "hostname; ip -br addr; systemctl cat project-truth-hris.service; systemctl is-enabled project-truth-hris.service || true; project-truth-status; docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'" *>&1 |
  Tee-Object "$runRoot\gcp-smoke-inside.txt"
```

### Optional GCP Post-Install Goldenization

If the appliance needs first-run work to retain the desired state, do that work on the GCP smoke instance, not locally. This keeps the heavy build/post-install path fast and repeatable.

Run post-install inside the GCP instance:

```powershell
gcloud compute ssh "infra@$testInstance" `
  --zone $zone `
  --project $gcpProject `
  --command "sudo systemctl daemon-reload; sudo systemctl enable project-truth-hris.service; sudo project-truth-hris-env-start all; sudo project-truth-hris-env-seed all; project-truth-status; docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'; systemctl cat project-truth-hris.service" *>&1 |
  Tee-Object "$runRoot\gcp-postinstall-goldenize.txt"
```

If post-install changed the disk state that should be retained, stop the smoke instance and create a second image from that disk. This post-install image becomes the `goldenImage` to export:

```powershell
$postInstallImage = "project-truth-node-postinstall-$(Get-Date -Format yyyyMMdd-HHmmss)"
gcloud compute instances stop $testInstance --zone $zone --project $gcpProject *>&1 | Tee-Object "$runRoot\gcp-postinstall-stop.txt"
gcloud compute images create $postInstallImage `
  --source-disk $testInstance `
  --source-disk-zone $zone `
  --project $gcpProject `
  --family project-truth-node *>&1 | Tee-Object "$runRoot\gcp-postinstall-image-create.txt"

$goldenImage = $postInstallImage
gcloud compute images describe $goldenImage --project $gcpProject *>&1 | Tee-Object "$runRoot\gcp-postinstall-image-describe.txt"
```

If this smoke instance is created, record it as a cleanup candidate after evidence collection. Do not delete it automatically unless the user explicitly approved cleanup:

```powershell
gcloud compute instances stop $testInstance --zone $zone --project $gcpProject
```

### Alternate Path: Current Passing State Is A Running GCP Instance

Use this only if the human says the current truth is already a running GCP instance with the retained state. Stop only the intended instance long enough to create a consistent image, then restart it:

```powershell
$gcpProject = "hris-492904"
$zone = "asia-southeast1-a"
$instance = "<current-passing-instance-name>"
$goldenImage = "project-truth-node-golden-$(Get-Date -Format yyyyMMdd-HHmmss)"

gcloud compute instances describe $instance --zone $zone --project $gcpProject *>&1 | Tee-Object "$runRoot\gcp-source-instance-describe.txt"
gcloud compute ssh "infra@$instance" --zone $zone --project $gcpProject --command "hostname; ip -br addr; project-truth-status; docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'; docker image ls; docker volume ls" *>&1 | Tee-Object "$runRoot\gcp-source-inside-before-image.txt"
gcloud compute instances stop $instance --zone $zone --project $gcpProject *>&1 | Tee-Object "$runRoot\gcp-source-stop.txt"
gcloud compute images create $goldenImage --source-disk $instance --source-disk-zone $zone --project $gcpProject --family project-truth-node *>&1 | Tee-Object "$runRoot\gcp-golden-image-create.txt"
gcloud compute instances start $instance --zone $zone --project $gcpProject *>&1 | Tee-Object "$runRoot\gcp-source-restart.txt"
gcloud compute images describe $goldenImage --project $gcpProject *>&1 | Tee-Object "$runRoot\gcp-golden-image-describe.txt"
```

### Fallback Path: Current Passing State Is A Local VirtualBox VM

Prefer the fresh Google Compute build above. Use this only if the human says the current truth is a local VirtualBox VM that cannot be recreated from the repo/GCP build. Do not rely on the old `project-truth-hris-local` if it is unreachable. If the current local VM is the passing one, prove it first:

```powershell
$sourceVm = "<current-passing-vbox-vm-name>"
VBoxManage showvminfo $sourceVm --machinereadable *>&1 | Tee-Object "$runRoot\vbox-source-info.txt"
VBoxManage guestproperty enumerate $sourceVm *>&1 | Tee-Object "$runRoot\vbox-source-guestproperties.txt"
```

Then export a clone or appliance from that VM, preserving disk state:

```powershell
$sourceOva = "C:\ProgramData\ProjectTruth\images\project-truth-current-state-$stamp.ova"
VBoxManage export $sourceVm --output $sourceOva *>&1 | Tee-Object "$runRoot\vbox-source-export.txt"
Get-FileHash $sourceOva -Algorithm SHA256 | Format-List | Out-String | Tee-Object "$runRoot\vbox-source-export-sha256.txt"
```

### Drift Rule

The final import proof must be from the newest golden artifact created or explicitly selected in this run. The older known export is stale by default:

```text
gs://project-truth-image-export-hris-492904-161377059311/project-truth-node-gcp-1781686573.vdi
```

Do not use it unless the human explicitly blesses it after seeing the drift warning. If you cannot prove an artifact was created from the current repo/state, stop and create a fresh Google Compute image/export.

## Phase 1: Host Prerequisites

```powershell
systeminfo *>&1 | Tee-Object "$runRoot\systeminfo.txt"
Get-Command git, curl.exe, ssh -ErrorAction SilentlyContinue | Format-Table -AutoSize | Out-String | Tee-Object "$runRoot\host-tools.txt"
Get-Command VBoxManage -ErrorAction SilentlyContinue | Format-List * | Out-String | Tee-Object "$runRoot\virtualbox-command.txt"
```

If VirtualBox is missing, install it only through a normal trusted installer path and log the source. Do not silently install unrelated tools.

After install:

```powershell
VBoxManage --version *>&1 | Tee-Object "$runRoot\virtualbox-version.txt"
VBoxManage list bridgedifs *>&1 | Tee-Object "$runRoot\bridged-adapters.txt"
```

Select a real active Wi-Fi or Ethernet adapter for bridged networking. Do not use NAT as final proof.

## Phase 2: Artifact Discovery Or Download

Find the real Project Truth VirtualBox artifact from the GCP export or release location. Acceptable formats:

```text
.ova preferred for import
.vdi acceptable if attached to a new VM
```

If the only available artifact is a GCP custom image, first export it to a portable disk artifact. Record the exact command used. Example shape:

```powershell
gcloud compute images list --project "<gcp-project>" --filter "family=project-truth-node OR name~project-truth" *>&1 | Tee-Object "$runRoot\gcp-images.txt"
gcloud compute images describe "<image-name>" --project "<gcp-project>" *>&1 | Tee-Object "$runRoot\gcp-image-describe.txt"
```

If export is needed, use the documented GCP export path available to the environment and log the bucket/object name. Do not treat a cloud image name as an imported VirtualBox artifact until a local `.ova` or `.vdi` exists and has a checksum.

When exporting a GCP image for VirtualBox, prefer VDI and use a new object name that includes the golden image name:

```powershell
$bucket = "project-truth-image-export-hris-492904-161377059311"
$object = "$goldenImage.vdi"
gcloud compute images export `
  --project "$gcpProject" `
  --image "$goldenImage" `
  --destination-uri "gs://$bucket/$object" `
  --export-format vdi *>&1 | Tee-Object "$runRoot\gcp-export-vdi.txt"

gsutil ls -l "gs://$bucket/$object" *>&1 | Tee-Object "$runRoot\gcp-exported-vdi-facts.txt"
```

Search common local locations first:

```powershell
$roots = @(
  "C:\ProgramData\ProjectTruth\images",
  "$env:USERPROFILE\Downloads",
  "C:\Users\anoni\OneDrive\Desktop"
)

$roots | ForEach-Object {
  Get-ChildItem $_ -Recurse -Include *.ova,*.vdi,*.sha256 -ErrorAction SilentlyContinue |
    Select-Object FullName,Length,LastWriteTime
} | Sort-Object LastWriteTime -Descending |
  Format-Table -AutoSize | Out-String | Tee-Object "$runRoot\artifact-search.txt"
```

If using a GCP-built image, record:

```text
GCP project
image name or family
export command or download URL
local artifact path
SHA256
artifact size
```

Do not proceed with an artifact that is empty, tiny, or not clearly Project Truth.

Checksum proof:

```powershell
Get-FileHash "<artifact-path>" -Algorithm SHA256 | Format-List | Out-String | Tee-Object "$runRoot\artifact-sha256.txt"
Get-Item "<artifact-path>" | Format-List FullName,Length,LastWriteTime | Out-String | Tee-Object "$runRoot\artifact-file-facts.txt"
```

The prior blocked run suggested this old download command:

```powershell
gsutil cp gs://project-truth-image-export-hris-492904-161377059311/project-truth-node-gcp-1781686573.vdi C:\ProgramData\ProjectTruth\images\project-truth-node-gcp-1781686573.vdi
```

Do not run that command for this overnight proof unless the human explicitly re-blesses that old VDI. Build/export a new GCP golden VDI and download that instead.

## Phase 3: Clean VirtualBox Import

Use a fresh VM name:

```powershell
$vmName = "project-truth-appliance-proof-$stamp"
```

For OVA:

```powershell
VBoxManage import "<artifact.ova>" --vsys 0 --vmname $vmName *>&1 | Tee-Object "$runRoot\vbox-import.txt"
```

For VDI:

```powershell
VBoxManage createvm --name $vmName --ostype Ubuntu_64 --register *>&1 | Tee-Object "$runRoot\vbox-createvm.txt"
VBoxManage modifyvm $vmName --memory 8192 --cpus 4 --firmware efi --boot1 disk *>&1 | Tee-Object "$runRoot\vbox-modify-base.txt"
VBoxManage storagectl $vmName --name "SATA" --add sata --controller IntelAhci *>&1 | Tee-Object "$runRoot\vbox-storagectl.txt"
VBoxManage storageattach $vmName --storagectl "SATA" --port 0 --device 0 --type hdd --medium "<artifact.vdi>" *>&1 | Tee-Object "$runRoot\vbox-storageattach.txt"
```

Configure bridged LAN:

```powershell
$bridgeAdapter = "<exact adapter name from VBoxManage list bridgedifs>"
VBoxManage modifyvm $vmName --nic1 bridged --bridgeadapter1 $bridgeAdapter --cableconnected1 on *>&1 | Tee-Object "$runRoot\vbox-bridge.txt"
VBoxManage showvminfo $vmName --machinereadable *>&1 | Tee-Object "$runRoot\vbox-info-before-start.txt"
VBoxManage startvm $vmName --type headless *>&1 | Tee-Object "$runRoot\vbox-start.txt"
```

## Phase 4: Discover Guest IP

Poll until a LAN IP is found:

```powershell
1..80 | ForEach-Object {
  "Poll $_ $(Get-Date -Format o)" | Tee-Object "$runRoot\ip-poll.txt" -Append
  VBoxManage guestproperty enumerate $vmName *>&1 | Tee-Object "$runRoot\guestproperties-$_.txt"
  arp -a *>&1 | Tee-Object "$runRoot\arp-$_.txt"
  Start-Sleep -Seconds 15
}
```

VirtualBox guest properties only work if Guest Additions or compatible guest integration is present. If guest properties are empty, fall back to DHCP/ARP evidence:

```powershell
VBoxManage showvminfo $vmName *>&1 | Tee-Object "$runRoot\vbox-info-ip-debug.txt"
Get-NetNeighbor -AddressFamily IPv4 *>&1 | Tee-Object "$runRoot\net-neighbor.txt"
arp -a *>&1 | Tee-Object "$runRoot\arp-final.txt"
```

If the VM console shows a login prompt but no LAN IP, verify bridged adapter choice and DHCP. Inside the VM, the repair command is:

```bash
project-truth-lan-dhcp
```

## Phase 5: Inside-VM Proof

SSH into the appliance if credentials are available. If SSH credentials are not known, use the VirtualBox console and record that limitation.

First try the expected image-builder account only if it is known to be part of the artifact contract:

```powershell
ssh -o StrictHostKeyChecking=accept-new infra@<guest-lan-ip> "hostname; ip -br addr" *>&1 | Tee-Object "$runRoot\ssh-infra-probe.txt"
```

If SSH fails because credentials are unknown, classify it as `IMAGE BUG` or `ARTIFACT CONTRACT GAP` unless the handoff documentation clearly states another login method.

Expected commands inside VM:

```bash
hostname
ip -br addr
systemctl status project-truth-hris.service --no-pager || true
project-truth-status
project-truth-hris-status
docker ps --filter "name=hris-" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
docker compose -f /opt/project-truth/appliance/docker-compose.yml ps
docker compose -f /opt/project-truth/appliance/docker-compose.environments.yml ps
systemctl cat project-truth-hris.service
systemctl is-enabled project-truth-hris.service || true
systemctl is-active project-truth-hris.service || true
kubectl get nodes -o wide || true
kubectl get pods -A -o wide || true
kubectl get applications -n argocd -o wide || true
```

If DEV/UAT are not running yet:

```bash
sudo project-truth-hris-env-start all
sudo project-truth-hris-env-seed all
project-truth-hris-status
```

Important: if DEV/UAT only pass after the manual commands above, record that separately. The image may still be usable, but auto-start is not fully proven for all environments.

Expected current repo service contract:

```text
project-truth-hris.service ExecStart=/usr/local/bin/project-truth-hris-env-start all
```

If the imported artifact still has `ExecStart=/usr/local/bin/project-truth-hris-start`, it is stale or was built before the all-environment auto-start fix. Classify this as `DRIFT` unless the artifact was intentionally built before this repo change.

## Phase 6: Host And LAN Health Proof

Replace `<guest-lan-ip>` with the discovered VM IP.

```powershell
$guestIp = "<guest-lan-ip>"
$checks = @(
  "http://${guestIp}:3000/",
  "http://${guestIp}:3000/auth/login",
  "http://${guestIp}:3001/health",
  "http://${guestIp}:3100/auth/login",
  "http://${guestIp}:3101/health",
  "http://${guestIp}:3200/auth/login",
  "http://${guestIp}:3201/health"
)

foreach ($url in $checks) {
  "CHECK $url" | Tee-Object "$runRoot\http-checks.txt" -Append
  curl.exe -i --max-time 20 $url *>&1 | Tee-Object "$runRoot\http-checks.txt" -Append
}
```

Expected:

```text
PROD login: HTTP 200 on http://<guest-ip>:3000/auth/login
PROD API: HTTP 200 on http://<guest-ip>:3001/health
DEV login: HTTP 200 on http://<guest-ip>:3100/auth/login
DEV API: HTTP 200 on http://<guest-ip>:3101/health
UAT login: HTTP 200 on http://<guest-ip>:3200/auth/login
UAT API: HTTP 200 on http://<guest-ip>:3201/health
```

## Phase 7: Browser Login Proof

Use Playwright, browser automation, or manual browser screenshots. Prove login for at least:

```text
PROD: http://<guest-ip>:3000/auth/login
DEV:  http://<guest-ip>:3100/auth/login
UAT:  http://<guest-ip>:3200/auth/login
```

Demo accounts shown by `project-truth-status`:

```text
hr-manager@seed.local / Password123!
hr-user@seed.local / Password123!
employee@seed.local / Password123!
```

For each environment capture:

```text
login page loaded
credentials submitted
post-login route or dashboard loaded
visible evidence of environment or API-backed data
browser console errors, if any
network failures, if any
```

Screenshots:

```text
$runRoot\screenshots\prod-login.png
$runRoot\screenshots\prod-dashboard.png
$runRoot\screenshots\dev-dashboard.png
$runRoot\screenshots\uat-dashboard.png
```

Do not mark login proven from API health alone.

## Phase 8: Auto-Start Proof

Power off and start the VM again:

```powershell
VBoxManage controlvm $vmName acpipowerbutton *>&1 | Tee-Object "$runRoot\vbox-acpi-stop.txt"
Start-Sleep -Seconds 60
VBoxManage startvm $vmName --type headless *>&1 | Tee-Object "$runRoot\vbox-restart.txt"
Start-Sleep -Seconds 180
```

Re-run Phase 6 and Phase 7. Auto-start is proven only if PROD, DEV, and UAT HRIS come back after reboot without manually running compose commands.

Also prove the service enablement state inside the VM:

```bash
systemctl is-enabled project-truth-hris.service || true
systemctl is-active project-truth-hris.service || true
docker ps --filter "name=hris-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

If PROD auto-starts but DEV/UAT require manual start, classify it as a policy decision only if the README/status text clearly says DEV/UAT are manual. Otherwise classify it as an image or repo gap.

For this overnight run, DEV/UAT are expected to auto-start. The repo systemd unit now starts `project-truth-hris-env-start all`, so DEV/UAT manual-only behavior is a failure for the current acceptance goal.

## Phase 9: Gap Classification

Write final result to:

```text
$runRoot\final-truth.txt
docs\USER_JOURNEY_PROOF.md
docs\INSTALLER_TEST_REPORT.md
docs\GAPS_AND_NEXT_GOALS.md
```

Use these labels:

```text
PROVEN:
  golden source state identified and preserved
  real artifact imported
  bridged LAN works
  services auto-start
  PROD/DEV/UAT API health pass
  PROD/DEV/UAT login pass

DRIFT:
  imported artifact is older than the current repo/service contract
  imported artifact does not match the known passing PROD/DEV/UAT LAN baseline
  GCP image/export came from a different VM state than the intended current one
  DEV/UAT pass on the source VM but not after import

REPO BUG:
  scripts/config/compose/service definitions are wrong
  status output lies
  ports mismatch docs
  seed/start commands fail

IMAGE BUG:
  artifact boots but lacks expected files/services/images
  Docker images were not built into the image
  systemd service not enabled
  first boot breaks K3s, Docker, or network

ENVIRONMENT BLOCKER:
  VirtualBox unavailable
  no bridged adapter
  DHCP unavailable
  artifact unavailable
  GCP credentials/export missing

POLICY DECISION:
  whether VirtualBox appliance or Hyper-V/Terraform is the primary customer path
  whether DEV/UAT should auto-start by default or only on command
  whether K3s/Argo is required for the appliance acceptance
  whether the artifact contract should include SSH credentials, console credentials, or no shell access
```

Only after a newer artifact is proven may stale GCP cleanup be recommended. Write the exact command but do not run it automatically:

```powershell
gcloud compute images delete "<stale-image-name>" --project "hris-492904"
gsutil rm "gs://project-truth-image-export-hris-492904-161377059311/<stale-object>"
```

## Final Report Template

```text
Result: PROVEN or BLOCKED
Run root:
Repo commit:
Artifact path:
Artifact SHA256:
Golden source:
Golden source proof:
Drift decision:
Stale cleanup candidate:
VirtualBox version:
VM name:
Bridge adapter:
Guest LAN IP:
Auto-start after reboot:
PROD login:
PROD API health:
DEV login:
DEV API health:
UAT login:
UAT API health:
Inside VM status:
Docker containers:
Kubernetes/Argo state:
Screenshots:
Blockers:
Repo bugs fixed:
Image bugs found:
Next exact command:
```

## Success Bar

The morning answer is only successful if this sentence is backed by real logs and screenshots:

```text
PROVEN: A clean Windows/VirtualBox user can import the Project Truth appliance, use bridged LAN, reboot it, and log in to PROD, DEV, and UAT HRIS from the host/LAN.
```
