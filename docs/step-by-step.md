# Project Truth VHDX: GCS to VM Step-by-Step

This is the single supported flow for the existing V7 VHDX:

```text
Laptop/source machine
  -> upload VHDX release to private GCS
Windows Server/local Hyper-V host
  -> download and verify with the helper script
  -> import/start the VM
  -> run VM runtime/GitOps
  -> configure/verify Cloudflare
```

Do not upload the `audits/` or `appliance/` folders separately. The VHDX already contains the initial appliance runtime, and GitOps updates the runtime from the repository later.

## 0. Fixed values

```text
GCP project:  bandai-pats-vhdx-artifacts
GCS bucket:   bandai-pats-vhdx-artifacts
GCS URI:      gs://bandai-pats-vhdx-artifacts
Release path: project-truth/hyperv/v7
Base dir:     C:\ProgramData\BandaiApp\Bnpipats
Image dir:    C:\ProgramData\BandaiApp\Bnpipats\images
```

The GCS release package is located at:

```text
C:\Users\zenja\OneDrive\Desktop\UZARO PROJECT 2026\Bandai\bandai-infra-bnpi-pats\bandai-bnpi-pats
```

## 1. Locate the VHDX on the laptop

Run PowerShell on the laptop that contains the VHDX:

```powershell
$roots = @(
  'C:\ProgramData\BandaiApp\Bnpipats\images',
  'C:\ProgramData\BandaiApp\Bnpipats',
  'C:\ProgramData\ProjectTruth\images',
  'C:\ProgramData\ProjectTruth'
)

$vhdxFile = Get-ChildItem `
  -Path $roots `
  -Recurse `
  -Filter 'project-truth-node-local-hyperv-v7-current-state.vhdx' `
  -File `
  -ErrorAction SilentlyContinue |
  Select-Object -First 1

if (-not $vhdxFile) {
  throw 'V7 VHDX not found. Check the search roots above.'
}

$vhdxFile | Select-Object FullName, Length, LastWriteTime
$vhdx = $vhdxFile.FullName
```

Do not use the literal placeholder `C:\path\to\...`.

## 2. Prepare the one-folder GCS release package

Run from the repository package folder:

```powershell
$packageDir = 'C:\Users\zenja\OneDrive\Desktop\UZARO PROJECT 2026\Bandai\bandai-infra-bnpi-pats\bandai-bnpi-pats'
Set-Location -LiteralPath $packageDir

gcloud auth login
gcloud config set project bandai-pats-vhdx-artifacts

powershell.exe `
  -NoProfile `
  -ExecutionPolicy Bypass `
  -File '.\prepare-project-truth-v7-staging.ps1' `
  -VhdDirectory (Split-Path -Parent $vhdx)
```

Expected result:

```text
STAGING_V7_READY=...
```

The preparation script copies the V7 VHDX, checksum, manifest, README, import script, and helper package into `bandai-bnpi-pats`. It does not upload anything yet.

## 3. Upload the release to private GCS

Still in the same package folder:

```powershell
powershell.exe `
  -NoProfile `
  -ExecutionPolicy Bypass `
  -File '.\upload-project-truth-v7-to-gcs.ps1'
```

Expected result:

```text
PROJECT_TRUTH_V7_UPLOAD_OK
```

Verify the exact release objects:

```powershell
gcloud storage ls `
  'gs://bandai-pats-vhdx-artifacts/project-truth/hyperv/v7/'
```

The upload allowlist includes the V7 VHDX, its checksum, V7 manifest/README/import script, the downloader, the staging helper, their checksums, and the setup guide. It does not upload V5/proven images, `.env` files, tunnel credentials, or SSH private keys.

## 4. Generate temporary signed URLs

Because the bucket is private, the target server needs signed URLs.

`gcloud storage objects generate-signed-url` **does not exist** in current
Google Cloud CLI (`gcloud 586.0.0` only has `compose`, `describe`, `list`,
`update`). Signed URLs are created with `gsutil signurl`, which signs locally
using a service-account RSA private key.

You need once, from someone with project IAM admin:

```text
Service account:  bnpi-pats-vhdx-signer@bandai-pats-vhdx-artifacts.iam.gserviceaccount.com
Role:             roles/storage.objectViewer   (signing only)
Key file:         a downloaded JSON private key, stored OFF the repo
```

Then, on the authenticated laptop:

```powershell
$signerEmail = 'bnpi-pats-vhdx-signer@bandai-pats-vhdx-artifacts.iam.gserviceaccount.com'
$signerKey   = "$env:USERPROFILE\.secrets\bnpi-pats-vhdx-signer.json"
$duration   = '2h'
$releaseUri = 'gs://bandai-pats-vhdx-artifacts/project-truth/hyperv/v7'

function New-SignedUrl {
    param([Parameter(Mandatory = $true)][string]$Name)
    $out = & gsutil signurl -e $signerEmail -k $signerKey -d $duration "$releaseUri/$Name" 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { throw "gsutil signurl failed for ${Name}:`n$out" }
    return (($out -split "`r?`n" | Where-Object { $_ -match '^https://' } | Select-Object -First 1)).Trim()
}

$helperUrl       = New-SignedUrl 'download-project-truth-vhdx.ps1'
$helperSidecarUrl = New-SignedUrl 'download-project-truth-vhdx.ps1.sha256'
$vhdxUrl         = New-SignedUrl 'project-truth-node-local-hyperv-v7-current-state.vhdx'
$vhdxSidecarUrl  = New-SignedUrl 'project-truth-node-local-hyperv-v7-current-state.vhdx.sha256'

$helperUrl
$vhdxUrl
```

Verify the private-bucket contract before trusting a URL:

```powershell
# expect 403 -> bucket is private
curl.exe -s -o NUL -w "%{http_code}`n" `
  'https://storage.googleapis.com/bandai-pats-vhdx-artifacts/project-truth/hyperv/v7/download-project-truth-vhdx.ps1'

# expect 200 -> signed URL works
curl.exe -s -o NUL -w "%{http_code}`n" $helperUrl
```

Transfer the four URL values to the target server securely. Do not put signed URLs in Git, documents, or chat. They expire.

## 5. Download on the Windows Server/local Hyper-V host

There are two methods. **Method A is the current supported path.**

### Method A - gcloud direct copy (recommended)

No signed URL and no public bucket. The host authenticates to Google with its
own account and pulls the object with `gcloud storage cp`.

On the target server, in **Administrator PowerShell**:

```powershell
gcloud auth login
gcloud config set project bandai-pats-vhdx-artifacts

# one-time: fetch the deployer from the private bucket
$tools = "$env:ProgramData\BandaiApp\Bnpipats\tools"
New-Item -ItemType Directory -Force -Path $tools | Out-Null
gcloud storage cp `
  'gs://bandai-pats-vhdx-artifacts/project-truth/hyperv/v7/deploy-project-truth-v7-from-gcs.ps1' `
  $tools

# download + verify + create/start the VM
& "$tools\deploy-project-truth-v7-from-gcs.ps1" `
  -RepoRoot 'C:\path\to\bandai-infra-bnpi-pats' `
  -StartVm
```

Drop `-StartVm` to only download and verify.

Success markers:

```text
PROJECT_TRUTH_V7_DOWNLOAD_OK   # downloaded and SHA-256 verified, no VM changes
PROJECT_TRUTH_V7_DEPLOY_OK     # VM imported and started
```

The VHDX `.sha256` sidecar in the bucket is the trust anchor. A mismatch deletes
the partial file and throws. A missing object throws with the exact upload
commands to run on the machine that holds the VHDX.

### Method B - signed URL (fallback)

Use this only when the target host cannot run `gcloud`.

Open **Administrator PowerShell** on the target machine and set:

```powershell
$helperUrl = '<signed-helper-url>'
$helperSidecarUrl = '<signed-helper-sidecar-url>'
$vhdxUrl = '<signed-vhdx-url>'
$vhdxSidecarUrl = '<signed-vhdx-sidecar-url>'

$imageDir = 'C:\ProgramData\BandaiApp\Bnpipats\images'
$helperPath = "$env:TEMP\download-project-truth-vhdx.ps1"

New-Item -ItemType Directory -Force -Path $imageDir | Out-Null
```

Download and verify the helper:

```powershell
Invoke-WebRequest -Uri $helperUrl -OutFile $helperPath -UseBasicParsing

$helperSidecar = (
  Invoke-WebRequest -Uri $helperSidecarUrl -UseBasicParsing
).Content

$expectedHelperHash = ($helperSidecar.Trim() -split '\s+')[0].ToLowerInvariant()
$actualHelperHash = (Get-FileHash -LiteralPath $helperPath -Algorithm SHA256).Hash.ToLowerInvariant()

if ($actualHelperHash -ne $expectedHelperHash) {
  throw "Downloader checksum failed. actual=$actualHelperHash expected=$expectedHelperHash"
}
```

Read the VHDX expected hash from its sidecar and download it:

```powershell
$vhdxSidecar = (
  Invoke-WebRequest -Uri $vhdxSidecarUrl -UseBasicParsing
).Content

$expectedVhdxHash = ($vhdxSidecar.Trim() -split '\s+')[0].ToLowerInvariant()

& $helperPath `
  -SignedUrl $vhdxUrl `
  -ExpectedSha256 $expectedVhdxHash `
  -ImagesDir $imageDir
```

The helper downloads and verifies the VHDX only. It does not import or start a VM unless explicit switches are supplied.

## 6. Create/start the VM

If the `bandai-infra-bnpi-pats` repository exists on the target server, run the helper with the full VM flow:

```powershell
$repoRoot = 'C:\path\to\bandai-infra-bnpi-pats'

& $helperPath `
  -SignedUrl $vhdxUrl `
  -ExpectedSha256 $expectedVhdxHash `
  -ImagesDir $imageDir `
  -RepoRoot $repoRoot `
  -StartVm `
  -WithPublic `
  -VerifyPublic
```

What this does:

```text
bnpi-pats-vm
  -> import/start Hyper-V VM
  -> wait for VM IP
  -> health checks
v6-one-shot
  -> ansible-pull/GitOps
  -> Docker/K3s runtime repair
  -> VM-managed Cloudflare credential import
  -> start cloudflared-bnpi-pats.service
  -> LAN/public validation
```

Do not run Project Truth Docker Compose on the Windows Hyper-V host. The runtime belongs inside the Linux VM.

If only the VM should be created, omit `-WithPublic` and `-VerifyPublic`:

```powershell
& $helperPath `
  -SignedUrl $vhdxUrl `
  -ExpectedSha256 $expectedVhdxHash `
  -ImagesDir $imageDir `
  -RepoRoot $repoRoot `
  -StartVm
```

## 7. Verify the VM and runtime

On the Windows host:

```powershell
Get-VM -Name 'bnpi-pats'
Get-VMNetworkAdapter -VMName 'bnpi-pats'
Test-NetConnection -ComputerName <VM-IP> -Port 22
Test-NetConnection -ComputerName <VM-IP> -Port 3000
Test-NetConnection -ComputerName <VM-IP> -Port 3001
```

Inside the VM:

```bash
hostname
ip -br addr
curl -i http://127.0.0.1:3001/health
curl -I http://127.0.0.1:3000/
project-truth-bnpi-pats-status
```

For K3s/Argo:

```bash
sudo kubectl get nodes
sudo kubectl get pods -A
sudo kubectl get applications -n argocd
```

## 8. GitOps updates after the first deployment

The VHDX contains the initial API/app images. Later application changes do not require a new VHDX.

On the development machine:

```powershell
git switch develop
git add .
git commit -m 'Describe the change'
git push origin develop
```

The VM's `project-truth-ansible-pull`/GitOps flow then pulls the latest source, rebuilds or imports the required API/app images, and rolls the runtime deployments.

Do not manually edit `/opt/project-truth` on the server as the normal update method.

## 9. Cloudflare/domain choice

Use one connector ownership model:

- **VM-managed:** use `-WithPublic`; the helper calls `v6-one-shot`, imports the credential at runtime, and starts `cloudflared-bnpi-pats.service`.
- **Host-managed:** from the Windows host, use the repository's `ensure-bnpi-cloudflare-host -ProvisionDns -StartTunnel -VerifyPublic` flow instead.

Do not run both connector models accidentally. The DNS records alone do not define the service port; the tunnel route must point to the actual app/API ports and API path rules must be ordered before root rules.

## 10. Public verification

From an external network:

```powershell
curl.exe -i https://bnpipats.tech/auth/login
curl.exe -i https://api.bnpipats.tech/health
curl.exe -I https://dev.bnpipats.tech/auth/login
curl.exe -I https://uat.bnpipats.tech/auth/login
```

Also verify Browser SSH:

```text
https://ssh.bnpipats.tech
```

## Troubleshooting

### VHDX not found

Run the discovery command in Step 1. Do not use `C:\path\to\...` literally.

### GCS upload fails

```powershell
gcloud auth list
gcloud config get-value project
gcloud billing projects describe bandai-pats-vhdx-artifacts
```

The project must have billing enabled and the bucket must exist.

### Signed URL expired

Generate a new signed URL; do not make the bucket public.

### VM is not created

Run the server command as Administrator and confirm:

```powershell
Get-VM -Name 'bnpi-pats'
Test-Path $repoRoot
```

Do not run the old import script and the new helper at the same time. The current supported path is `bnpi-pats-vm` plus optional `v6-one-shot`.
