# Overnight Prompt: DEV Current Data GCP VDI Proof

## Mission

Continue from the real Project Truth state already produced on 2026-06-18. Do not restart the research loop or use stale artifacts.

Prove this path:

```text
current local DEV database snapshot
  -> baked into a fresh Google Compute/Packer image
  -> postinstalled on GCP so PROD/DEV/UAT are running
  -> DEV restored from the current snapshot only
  -> PROD and UAT keep default seed data
  -> exported as a public VirtualBox VDI
  -> downloaded on a clean/fresh Windows device
  -> imported into VirtualBox with bridged networking
  -> PROD/DEV/UAT app/API health and browser login pass
```

## Working Folder

```powershell
cd C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH
```

## Current Truth

This is not a proposed artifact anymore. The GCP build/export reached a real public VDI.

```text
Run root:
  .runtime\overnight-dev-current-gcp\20260618-014413

Source DEV database:
  postgresql://postgres:postgres@localhost:55432/haaasasasdsdsEWWE?schema=public

DEV dump:
  appliance\seeds\dev-current\dev-current.dump
  size: 54,778,532 bytes
  sha256: 120e542fc0a42a7c3aaf5089f141fc4f64f233f907034af6c6b8e1f8eab75c43

Source DEV counts:
  tables=70
  employees=2217
  users=2039

Fresh GCP Packer image:
  project-truth-node-gcp-1781718268

Postinstall GCP image:
  project-truth-node-devcurrent-postinstall-20260618-020148

Public VDI:
  gs://project-truth-image-export-hris-492904-161377059311/public/project-truth/virtualbox/dev-current/latest/project-truth-node-devcurrent-postinstall-20260618-020148.vdi

Public HTTPS:
  https://storage.googleapis.com/project-truth-image-export-hris-492904-161377059311/public/project-truth/virtualbox/dev-current/latest/project-truth-node-devcurrent-postinstall-20260618-020148.vdi

VDI size:
  14,859,698,688 bytes
```

The bucket/object is public-readable. `curl -I` already returned `HTTP/1.1 200 OK` and `Content-Length: 14859698688`.

Latest local proof result:

```text
PROVEN WITH VIRTUALBOX BOOT WORKAROUND
Imported VM: project-truth-devcurrent-proof-20260618-070929
Guest IP: 192.168.100.84
Required VirtualBox CPU setting for this VDI: --cpus 1
```

Do not import this specific GCP-kernel VDI with 4 vCPU for acceptance proof. It stalls in VirtualBox initramfs on `raid6_pq`. The one-vCPU setting was proven to boot, start HRIS, and pass PROD/DEV/UAT browser login.

## What Changed In Repo

These are intentional changes and should be preserved:

```text
appliance/bin/project-truth-hris-dev-current-restore.sh
  New helper that restores /opt/project-truth/appliance/seeds/dev-current/dev-current.dump into DEV only.

appliance/bin/project-truth-hris-env-seed.sh
  DEV now prefers the baked dev-current dump when it exists.
  PROD and UAT still use the normal default seed path.

image-factory/packer/provision.sh
  Installs project-truth-hris-dev-current-restore into /usr/local/bin.
```

Expected service contract remains:

```text
project-truth-hris.service ExecStart=/usr/local/bin/project-truth-hris-env-start all
```

## Evidence Already Collected

The GCP smoke/postinstall run proved:

```text
DEV dump exists inside image:
  /opt/project-truth/appliance/seeds/dev-current/dev-current.dump

DEV dump hash inside image:
  120e542fc0a42a7c3aaf5089f141fc4f64f233f907034af6c6b8e1f8eab75c43

DEV restore command exists:
  /usr/local/bin/project-truth-hris-dev-current-restore

Service starts all environments:
  ExecStart=/usr/local/bin/project-truth-hris-env-start all

After GCP postinstall:
  dev_tables=70
  dev_employees=2217
  dev_users=2039

GCP local HTTP:
  PROD login 3000 -> 200
  PROD API 3001 -> 200
  DEV login 3100 -> 200
  DEV API 3101 -> 200
  UAT login 3200 -> 200
  UAT API 3201 -> 200
```

Primary evidence files:

```text
.runtime\overnight-dev-current-gcp\20260618-014413\gcp-smoke-assets.txt
.runtime\overnight-dev-current-gcp\20260618-014413\gcp-postinstall-goldenize.txt
.runtime\overnight-dev-current-gcp\20260618-014413\gcp-postinstall-image-describe.txt
.runtime\overnight-dev-current-gcp\20260618-014413\gcp-exported-vdi-stat.txt
.runtime\overnight-dev-current-gcp\20260618-014413\public-vdi-curl-head.txt
```

## Drift Decision

The old VDI is stale for this goal:

```text
gs://project-truth-image-export-hris-492904-161377059311/project-truth-node-gcp-1781686573.vdi
```

Do not use it for this proof. The correct artifact is the `dev-current/latest` VDI listed above.

## Continuation Point

Local download/import proof was interrupted. A zero-byte temporary file may exist:

```text
C:\ProgramData\ProjectTruth\images\project-truth-node-devcurrent-postinstall-20260618-020148.vdi_.gstmp
```

It is safe to remove that temp file before retrying the download.

## Phase 1: Prepare Fresh Windows Device

Install or verify:

```text
VirtualBox
Google Cloud CLI only if using gsutil
curl.exe if using public HTTPS download
```

If the fresh device does not have Google Cloud CLI, use the public HTTPS URL. If it has Google Cloud CLI, `gsutil` is preferred because it resumes/retries large downloads better.

Create the image folder:

```cmd
mkdir C:\ProgramData\ProjectTruth\images
```

## Phase 2: Download The Correct VDI

Preferred, with `gsutil`:

```cmd
gsutil -m cp gs://project-truth-image-export-hris-492904-161377059311/public/project-truth/virtualbox/dev-current/latest/project-truth-node-devcurrent-postinstall-20260618-020148.vdi C:\ProgramData\ProjectTruth\images\project-truth-node-devcurrent-postinstall-20260618-020148.vdi
```

Fallback, with public `curl.exe`:

```cmd
curl.exe -L "https://storage.googleapis.com/project-truth-image-export-hris-492904-161377059311/public/project-truth/virtualbox/dev-current/latest/project-truth-node-devcurrent-postinstall-20260618-020148.vdi" -o "C:\ProgramData\ProjectTruth\images\project-truth-node-devcurrent-postinstall-20260618-020148.vdi"
```

Verify size:

```cmd
dir C:\ProgramData\ProjectTruth\images\project-truth-node-devcurrent-postinstall-20260618-020148.vdi
```

Expected size:

```text
14,859,698,688 bytes
```

If the file is only a few hundred bytes, it is an error XML/HTML response, not the disk.

## Phase 3: Pick The Bridged Adapter

List VirtualBox bridge adapters:

```cmd
"C:\Program Files\Oracle\VirtualBox\VBoxManage.exe" list bridgedifs
```

Use the active Wi-Fi or Ethernet adapter on that device. On this current host, the working adapter is:

```text
Hyper-V Virtual Ethernet Adapter #3
```

On a fresh device, this may instead be:

```text
Intel(R) Wi-Fi ...
Realtek PCIe GbE Family Controller
```

Do not hard-code Hyper-V if it does not exist on the fresh device.

## Phase 4: Import VDI Into VirtualBox

Replace `YOUR_ACTIVE_BRIDGE_ADAPTER_NAME` before running.

```cmd
set "VM=project-truth-devcurrent-proof" && set "VDI=C:\ProgramData\ProjectTruth\images\project-truth-node-devcurrent-postinstall-20260618-020148.vdi" && set "VBOX=C:\Program Files\Oracle\VirtualBox\VBoxManage.exe" && "%VBOX%" createvm --name "%VM%" --ostype Ubuntu_64 --register && "%VBOX%" modifyvm "%VM%" --memory 8192 --cpus 1 --firmware efi --boot1 disk --graphicscontroller vmsvga --vram 32 && "%VBOX%" storagectl "%VM%" --name "SATA" --add sata --controller IntelAhci && "%VBOX%" storageattach "%VM%" --storagectl "SATA" --port 0 --device 0 --type hdd --medium "%VDI%" && "%VBOX%" modifyvm "%VM%" --nic1 bridged --bridgeadapter1 "YOUR_ACTIVE_BRIDGE_ADAPTER_NAME" --cableconnected1 on && "%VBOX%" startvm "%VM%" --type gui
```

Important: `--cpus 1` is intentional for this current GCP-kernel export. A 4-vCPU import stalled during proof.

If you previously created a broken VM with the same name, delete only that proof VM first:

```cmd
"C:\Program Files\Oracle\VirtualBox\VBoxManage.exe" unregistervm "project-truth-devcurrent-proof" --delete
```

Do not delete any other VM.

## Phase 5: Expected Boot Messages

These messages are not automatically fatal:

```text
serial port com0 isn't found
terminal serial isn't found
initrdless boot failed. Attempting with initrd
```

They are acceptable if Ubuntu continues booting to login and the LAN services become reachable.

Expected console credentials:

```text
infra / infra
```

## Phase 6: Discover Guest IP

From Windows:

```cmd
"C:\Program Files\Oracle\VirtualBox\VBoxManage.exe" guestproperty enumerate "project-truth-devcurrent-proof"
arp -a
```

From inside VM console:

```bash
ip -br addr
project-truth-lan-dhcp
project-truth-status
```

Use the VM LAN IP for the checks below.

## Phase 7: Health Proof

Replace `<guest-ip>`.

```cmd
curl.exe -i --max-time 20 http://<guest-ip>:3000/auth/login
curl.exe -i --max-time 20 http://<guest-ip>:3001/health
curl.exe -i --max-time 20 http://<guest-ip>:3100/auth/login
curl.exe -i --max-time 20 http://<guest-ip>:3101/health
curl.exe -i --max-time 20 http://<guest-ip>:3200/auth/login
curl.exe -i --max-time 20 http://<guest-ip>:3201/health
```

Expected:

```text
PROD login 3000 -> HTTP 200
PROD API 3001 -> HTTP 200
DEV login 3100 -> HTTP 200
DEV API 3101 -> HTTP 200
UAT login 3200 -> HTTP 200
UAT API 3201 -> HTTP 200
```

## Phase 8: DEV Current Data Proof

SSH or console into the VM:

```bash
docker exec hris-postgres-dev psql -U postgres -d hris -Atc "select 'dev_tables=' || count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';"
docker exec hris-postgres-dev psql -U postgres -d hris -Atc "select 'dev_employees=' || count(*) from employees;"
docker exec hris-postgres-dev psql -U postgres -d hris -Atc "select 'dev_users=' || count(*) from users;"
```

Expected:

```text
dev_tables=70
dev_employees=2217
dev_users=2039
```

## Phase 9: Browser Login Proof

Open and login:

```text
PROD: http://<guest-ip>:3000/auth/login
DEV:  http://<guest-ip>:3100/auth/login
UAT:  http://<guest-ip>:3200/auth/login
```

Demo accounts:

```text
hr-manager@seed.local / Password123!
hr-user@seed.local / Password123!
employee@seed.local / Password123!
```

Capture screenshots:

```text
prod-login.png
prod-dashboard.png
dev-dashboard.png
uat-dashboard.png
```

Do not mark browser login proven from API health alone.

## Phase 10: Reboot Auto-Start Proof

```cmd
"C:\Program Files\Oracle\VirtualBox\VBoxManage.exe" controlvm "project-truth-devcurrent-proof" acpipowerbutton
timeout /t 60
"C:\Program Files\Oracle\VirtualBox\VBoxManage.exe" startvm "project-truth-devcurrent-proof" --type gui
```

Wait 3 minutes, then re-run Phase 7 and Phase 9. Auto-start is proven only if PROD, DEV, and UAT return without manually running compose commands.

Inside VM:

```bash
systemctl is-enabled project-truth-hris.service || true
systemctl is-active project-truth-hris.service || true
systemctl cat project-truth-hris.service
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
```

Expected:

```text
project-truth-hris.service enabled
project-truth-hris.service active
ExecStart=/usr/local/bin/project-truth-hris-env-start all
PROD/DEV/UAT containers healthy or running
```

## Known Gap To Track

`project-truth-status` can report base services as `missing` even while `project-truth-hris-status` and `docker ps` show the environment containers healthy. Treat that as a status-script repo gap unless it blocks actual app/API/browser use.

## Final Report Template

```text
Result: PROVEN or BLOCKED
Run root:
VDI URL:
VDI size:
Local VDI path:
VirtualBox version:
VM name:
Bridge adapter:
Guest LAN IP:
Auto-start after reboot:
PROD login:
PROD API health:
DEV login:
DEV API health:
DEV current data counts:
UAT login:
UAT API health:
Browser screenshots:
Inside VM status:
Docker containers:
Blockers:
Repo gaps:
Next exact command:
```

## Success Bar

```text
PROVEN: A fresh Windows/VirtualBox device can download the public Project Truth dev-current VDI, import it with bridged LAN, reboot it, and log in to PROD, DEV, and UAT HRIS. DEV contains the current captured data snapshot; PROD and UAT keep default seed data.
```
