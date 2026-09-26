<#
    Resumable ISO fetcher for the Packer Hyper-V build.

    Packer 1.16 aborts the ISO download after a 30 minute context deadline. On a
    slow link (86-330 KB/s observed) the 2.9 GB Ubuntu live-server ISO cannot
    finish inside that window, so every build died with
    "error downloading ISO: [context deadline exceeded]".

    This script resumes the partially downloaded ISO with curl -C - until the
    file is complete, then verifies it against the published SHA-256 and writes
    a sentinel file so the build can be started.

    Packer keys its HTTP cache by a hash of the URL, so a complete, checksum
    valid file at that exact path is reused and the download is skipped.
#>
[CmdletBinding()]
param(
    [string[]]$Urls = @(
        'https://mirrors.xtom.com/ubuntu-releases/24.04/ubuntu-24.04.4-live-server-amd64.iso',
        'https://mirrors.edge.kernel.org/ubuntu-releases/24.04/ubuntu-24.04.4-live-server-amd64.iso',
        'https://releases.ubuntu.com/24.04/ubuntu-24.04.4-live-server-amd64.iso'
    ),
    [string]$Sha256 = 'e907d92eeec9df64163a7e454cbc8d7755e8ddc7ed42f99dbc80c40f1a138433',
    [string]$CacheDir = 'C:\Users\zenja\OneDrive\Desktop\UZARO PROJECT 2026\Bandai\bandai-infra-bnpi-pats\image-factory\packer\packer_cache',
    [string]$CacheName = '404079b253c03df4faee35898313e7c4d9dde17b.iso',
    [int]$MaxAttempts = 200
)

$ErrorActionPreference = 'Continue'
$target = Join-Path $CacheDir $CacheName
$done = "$target.CACHED-OK"
$log = Join-Path $CacheDir 'iso-fetch.log'

function Say {
    param([string]$m)
    $line = "{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m
    Write-Host $line
    Add-Content -LiteralPath $log -Value $line -Encoding UTF8
}

New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
Remove-Item -LiteralPath $done -Force -ErrorAction SilentlyContinue

# Lock file that Packer uses; it must not be left behind for a completed file.
$lock = "$target.lock"
Remove-Item -LiteralPath $lock -Force -ErrorAction SilentlyContinue

Say "START mirrors=$($Urls.Count)"
Say "target=$target"

for ($i = 1; $i -le $MaxAttempts; $i++) {
    $have = 0
    if (Test-Path -LiteralPath $target) { $have = (Get-Item -LiteralPath $target).Length }
    $mb = [math]::Round($have / 1MB, 1)
    Say "attempt $i  have=$mb MB"

    foreach ($url in $Urls) {
        $before = 0
        if (Test-Path -LiteralPath $target) { $before = (Get-Item -LiteralPath $target).Length }

        & curl.exe -L -C - --retry 3 --retry-delay 3 --retry-all-errors `
            --speed-time 60 --speed-limit 2048 --connect-timeout 20 `
            -o $target $url 2>&1 | Out-Null
        $rc = $LASTEXITCODE

        $after = 0
        if (Test-Path -LiteralPath $target) { $after = (Get-Item -LiteralPath $target).Length }
        $deltaMb = [math]::Round(($after - $before) / 1MB, 1)
        Say "  mirror=$([Uri]$url).Host exit=$rc +$deltaMb MB (total $([math]::Round($after/1MB,1)) MB)"

        if ($rc -eq 0) { break }
    }

    $have = 0
    if (Test-Path -LiteralPath $target) { $have = (Get-Item -LiteralPath $target).Length }
    $mb = [math]::Round($have / 1MB, 1)

    # Check completeness by hash on every pass once the file looks near full.
    if ($have -gt 2.5GB) {
        Say "download looks complete, verifying SHA-256..."
        $actual = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -eq $Sha256.ToLowerInvariant()) {
            Set-Content -LiteralPath $done -Value "ok $actual $(Get-Date -Format o)" -Encoding ASCII
            Say "ISO_CACHED_OK sha256=$actual size_mb=$mb"
            exit 0
        }
        Say "CHECKSUM_MISMATCH actual=$actual expected=$Sha256 -> restarting from scratch"
        Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
    }

    Start-Sleep -Seconds 5
}

Say "ISO_FETCH_FAILED after $MaxAttempts attempts"
exit 1
