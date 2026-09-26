# Project Truth VHDX Setup Flow

## Scope and ownership

- **Build/publish machine:** Windows/Packer or an optional GCP/GCS build lane.
- **Deployment host:** Windows Server with Hyper-V. The host is not the BNPI PATS runtime.
- **Runtime:** Linux VM running the Project Truth services.
- **Tunnel:** Use either a VM-managed connector or a host-managed connector. Do not run both ownership models accidentally.

## 1. Build or obtain a clean VHDX

### Local Hyper-V build (optional)

Run in an elevated PowerShell from the repository:

```powershell
cd "C:\path\to\bandai-infra-bnpi-pats"
.\scripts\project-truth.ps1 build-image `
  -TargetPlatform hyperv `
  -SwitchName "Default Switch"
```

Packer creates a disposable build VM named `project-truth-image-build`. If the build fails, Packer may unregister and delete that temporary VM. This is expected cleanup; do not use that name for a production VM.

### GCS release bucket (current lane)

The current private GCS release target is:

```text
Project:      bandai-pats-vhdx-artifacts
Bucket:       gs://bandai-pats-vhdx-artifacts
Release path: project-truth/hyperv/v7
Region:       asia-southeast1
```

GCP is still optional when a verified VHDX already exists. The GCP Packer lane is a separate Google Compute image/staging workflow; it is not automatically the same as a Hyper-V VHDX.

Never upload a live VM disk that may contain Cloudflare credentials. Publish only a clean image, manifest, and SHA-256 sidecar.

After a successful Packer build, upload the V7 release files from the canonical Project Truth root:

```powershell
gcloud config set project bandai-pats-vhdx-artifacts
$baseDir = "C:\ProgramData\BandaiApp\Bnpipats"
$imageDir = Join-Path $baseDir "images"
$bucket = "gs://bandai-pats-vhdx-artifacts"
$objectPath = "project-truth/hyperv/v7"
$vhdx = Join-Path $imageDir "project-truth-node-local-hyperv-v7-current-state.vhdx"
$sidecar = "$vhdx.sha256"

if (-not (Test-Path -LiteralPath $vhdx)) {
  throw "V7 VHDX not found: $vhdx"
}

$vhdxHash = (Get-FileHash -LiteralPath $vhdx -Algorithm SHA256).Hash.ToLowerInvariant()
"$vhdxHash  $(Split-Path $vhdx -Leaf)" |
  Set-Content -LiteralPath $sidecar -Encoding ASCII

gcloud storage cp $vhdx "$bucket/$objectPath/"
gcloud storage cp $sidecar "$bucket/$objectPath/"
gcloud storage cp (Join-Path $baseDir "project-truth-hyperv-v7-manifest.json") "$bucket/$objectPath/"
gcloud storage cp (Join-Path $baseDir "README-HYPERV-EXPORT.txt") "$bucket/$objectPath/"
gcloud storage cp (Join-Path $baseDir "Import-ProjectTruthHyperV.ps1") "$bucket/$objectPath/"
gcloud storage ls "$bucket/$objectPath/"
```

Keep the bucket private. Generate short-lived signed URLs for the VHDX and downloader when the Windows Server is ready to download them.

## 2. Download and verify the VHDX on the Windows Hyper-V server

Run in **Administrator PowerShell** on the deployment server:

```powershell
cd "C:\path\to\bandai-infra-bnpi-pats"

.\scripts\project-truth.ps1 download-image `
  -ImageUrl "<approved-vhdx-url>" `
  -ExpectedSha256 "<expected-sha256>" `
  -TargetPlatform hyperv
```

Do not import a VHDX without its verified SHA-256 value.

Before importing, check for a name collision and confirm the Hyper-V switch:

```powershell
Get-VM -Name "bnpi-pats" -ErrorAction SilentlyContinue
Get-VMSwitch
```

Keep an existing production VM untouched until the replacement has passed verification.

## 2A. Upload the standalone Windows downloader

The helper script is stored in the same `bandai-bnpi-pats` folder as this guide:

```text
download-project-truth-vhdx.ps1
```

Upload the helper and its checksum to the same private GCS release folder as the VHDX:

```powershell
$downloader = "C:\path\to\download-project-truth-vhdx.ps1"
$downloaderHash = (Get-FileHash -LiteralPath $downloader -Algorithm SHA256).Hash.ToLowerInvariant()
"$downloaderHash  $(Split-Path $downloader -Leaf)" |
  Set-Content -LiteralPath "$downloader.sha256" -Encoding ASCII

gcloud storage cp $downloader "$bucket/$objectPath/"
gcloud storage cp "$downloader.sha256" "$bucket/$objectPath/"
```

On the Windows Server, download the helper with a temporary signed URL, verify its checksum, and then run it with the temporary signed VHDX URL and expected VHDX hash:

```powershell
$helperUrl = "<signed-helper-url>"
$helperPath = "$env:TEMP\download-project-truth-vhdx.ps1"
Invoke-WebRequest -Uri $helperUrl -OutFile $helperPath

$actualHelperHash = (Get-FileHash -LiteralPath $helperPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHelperHash -ne "<helper-sha256>") {
  throw "Downloader SHA-256 verification failed. actual=$actualHelperHash"
}

& $helperPath `
  -SignedUrl "<signed-vhdx-url>" `
  -ExpectedSha256 "<vhdx-sha256>"
```

The helper is safe by default: it only downloads and verifies the VHDX. It can optionally continue with the full server flow when explicit switches are supplied:

```powershell
& $helperPath `
  -SignedUrl "<signed-vhdx-url>" `
  -ExpectedSha256 "<vhdx-sha256>" `
  -RepoRoot "C:\path\to\bandai-infra-bnpi-pats" `
  -StartVm `
  -WithPublic `
  -VerifyPublic
```

- `-StartVm` imports/starts the Hyper-V VM through the repository's `bnpi-pats-vm` command.
- `-WithPublic` runs the VM-managed Cloudflare `v6-one-shot` flow using the runtime credential.
- `-VerifyPublic` checks the PROD/DEV/UAT public app/API URLs.
- The script never runs Project Truth Docker Compose on the Windows host and never embeds credentials.

## 3. Import and start the VM

Use the VHDX downloaded into the server image directory:

```powershell
.\scripts\project-truth.ps1 bnpi-pats-vm `
  -VhdxPath "C:\ProgramData\BandaiApp\Bnpipats\images\<image>.vhdx" `
  -VmName "bnpi-pats" `
  -SwitchName "ProjectTruth-External" `
  -BaseDir "C:\ProgramData\BandaiApp\Bnpipats"
```

This step imports/starts the VM, waits for its LAN IP, records the host configuration, and runs the initial health checks.

If the command reports that no VHDX artifact was produced, stop. Do not try to create the final VM until the image build succeeds.

## 4. Start and verify the runtime inside the Linux VM

Run the runtime commands **inside the VM**, not on the Windows Hyper-V host:

```bash
project-truth-lan-summary --screen-overview
project-truth-ansible-pull
project-truth-bnpi-pats-status
```

If this VM is intentionally using the Compose runtime, use the documented Compose service from inside the VM. Do not run the Project Truth Docker Compose runtime on the Windows host.

The `bnpi-pats-api-db-init` container/job is schema-only. Do not run `prisma-seed`, `prisma-reset`, or `--accept-data-loss` against UAT or production.

## 5. Configure Cloudflare only after VM health is green

Choose one tunnel ownership model.

### Option A: VM-managed tunnel (preferred)

Import the named-tunnel credential at runtime and run the VM proof flow from the Windows host:

```powershell
.\scripts\project-truth.ps1 v6-one-shot `
  -GuestIp "<VM-IP>" `
  -CredentialPath "C:\ProgramData\BandaiApp\Bnpipats\secrets\cloudflared\12e89b6a-dabb-4897-9925-08ce9213b983.json"
```

The credential must not be baked into the VHDX, repository, public bucket, or installer ZIP.

### Option B: Host-managed tunnel

Use this only when the connector should run on the Windows host:

```powershell
.\scripts\project-truth.ps1 ensure-bnpi-cloudflare-host `
  -ProvisionDns `
  -StartTunnel `
  -VerifyPublic
```

Do not start a second connector unless the deployment design intentionally supports multiple connectors with equivalent origins.

## 6. Verify LAN and public access

From the VM or an authorized LAN workstation:

```bash
curl -i http://<VM-IP>:3000/auth/login
curl -i http://<VM-IP>:3001/health
curl -i http://<VM-IP>:3101/health
curl -i http://<VM-IP>:3201/health
```

From an external network:

```powershell
curl.exe -i https://bnpipats.tech/auth/login
curl.exe -i https://api.bnpipats.tech/health
curl.exe -I https://dev.bnpipats.tech/auth/login
curl.exe -I https://uat.bnpipats.tech/auth/login
```

Also verify the Cloudflare connector and Browser SSH:

```text
https://ssh.bnpipats.tech
```

## 7. Cut over only after verification

Remove or retire an old VM only after the new VM has passed:

- VM boot and LAN IP discovery
- App/API health checks
- Database schema job completion
- Cloudflare connector health
- Public PROD/DEV/UAT checks
- SSH/Browser SSH check
- Browser login/application check

## Failure handling

If a Packer build fails and the temporary VM disappears, that is normal cleanup. For debugging, run Packer directly with `-on-error=abort` so the temporary build VM is retained:

```powershell
cd "C:\path\to\bandai-infra-bnpi-pats\image-factory\packer"
packer build -force `
  -on-error=abort `
  -var switch_name="Default Switch" `
  ubuntu-hyperv.pkr.hcl
```

Inspect the first real `Error:` or failed provisioner in the Packer output. The final `non-zero exit status: 1` is only a summary and is not the root cause.
