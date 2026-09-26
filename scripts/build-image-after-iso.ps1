<#
    Waits for the resumable Ubuntu ISO fetch to finish, then runs the Packer
    Hyper-V build so the whole image pipeline continues unattended.

    Why the sentinel: the ISO fetch is long running and resumable. Rather than
    polling it from an agent turn, this script blocks until
    <iso>.CACHED-OK exists (written only after the SHA-256 matches
    e907d92eeec9df64163a7e454cbc8d7755e8ddc7ed42f99dbc80c40f1a138433), then
    starts Packer. Packer reuses the cached ISO instead of re-downloading it,
    which is what previously killed every build with
    "error downloading ISO: [context deadline exceeded]".
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = 'C:\Users\zenja\OneDrive\Desktop\UZARO PROJECT 2026\Bandai\bandai-infra-bnpi-pats',
    [string]$VmName = 'project-truth-v7-image',
    [int]$WaitMinutes = 720,
    [int]$PollSeconds = 30
)

$ErrorActionPreference = 'Continue'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logDir = Join-Path $RepoRoot 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "build-chained-$stamp.log"

function Say {
    param([string]$m)
    $line = "{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m
    Write-Host $line
    Add-Content -LiteralPath $log -Value $line -Encoding UTF8
}

$cache = Join-Path $RepoRoot 'image-factory\packer\packer_cache'
$iso = Join-Path $cache '404079b253c03df4faee35898313e7c4d9dde17b.iso'
$sentinel = "$iso.CACHED-OK"
$fetchLog = Join-Path $cache 'iso-fetch.log'

Say "waiting for ISO sentinel: $sentinel"
$deadline = (Get-Date).AddMinutes($WaitMinutes)
$lastReported = -1

while ((Get-Date) -lt $deadline) {
    if (Test-Path -LiteralPath $sentinel) {
        Say "ISO sentinel found: $((Get-Content -LiteralPath $sentinel -Raw).Trim())"
        break
    }

    $mb = 0
    if (Test-Path -LiteralPath $iso) { $mb = [math]::Round((Get-Item -LiteralPath $iso).Length / 1MB, 1) }
    if ($mb -ne $lastReported) {
        Say "iso progress: $mb MB"
        $lastReported = $mb
    }

    # Bail out early if the fetcher died.
    if (-not (Get-Process -Name powershell -ErrorAction SilentlyContinue |
            Where-Object { $_.Id -ne $PID })) {
        Say 'note: no other powershell fetcher detected'
    }

    Start-Sleep -Seconds $PollSeconds
}

if (-not (Test-Path -LiteralPath $sentinel)) {
    Say "ISO_NOT_READY after $WaitMinutes minutes; build not started"
    Say "last fetch log lines:"
    if (Test-Path -LiteralPath $fetchLog) { Get-Content -LiteralPath $fetchLog -Tail 10 | ForEach-Object { Say "  $_" } }
    exit 1
}

$packerDir = Join-Path $RepoRoot 'image-factory\packer'
Set-Location $packerDir

Say 'removing any stale packer lock for the cached ISO'
Remove-Item -LiteralPath "$iso.lock" -Force -ErrorAction SilentlyContinue

Say "starting packer build: vm_name=$VmName"
$out = Join-Path $logDir "packer-$stamp.out"
$err = Join-Path $logDir "packer-$stamp.err"

& packer build -var "vm_name=$VmName" ubuntu-hyperv.pkr.hcl 1> $out 2> $err
$rc = $LASTEXITCODE
Say "packer exit=$rc"

if ($rc -ne 0) {
    Say 'BUILD_FAILED; last output:'
    if (Test-Path -LiteralPath $out) { Get-Content -LiteralPath $out -Tail 25 | ForEach-Object { Say "  $_" } }
    if (Test-Path -LiteralPath $err) { Get-Content -LiteralPath $err -Tail 15 | ForEach-Object { Say "  $_" } }
    exit $rc
}

$artifact = Join-Path $packerDir "output\$VmName\$VmName.vhdx"
if (Test-Path -LiteralPath $artifact) {
    $hash = (Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash.ToLowerInvariant()
    $sizeGb = [math]::Round((Get-Item -LiteralPath $artifact).Length / 1GB, 2)
    Set-Content -LiteralPath "$artifact.sha256" -Value "$hash  $(Split-Path $artifact -Leaf)" -Encoding ASCII
    Say "BUILD_OK artifact=$artifact size_gb=$sizeGb sha256=$hash"
    exit 0
}

Say "BUILD_OK reported by packer but artifact not found at $artifact"
Get-ChildItem (Join-Path $packerDir 'output') -Recurse -ErrorAction SilentlyContinue |
    ForEach-Object { Say "  out: $($_.FullName)" }
exit 1
