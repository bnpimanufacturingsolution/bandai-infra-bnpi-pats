<#
    Chunked, resumable, verified ISO fetcher.

    Why this replaced curl -C -:
    curl -C - asks the server for "bytes from N onward". When a mirror answers
    200 with the whole body instead of 206 with the range, curl appends the full
    body onto the existing partial file. The result silently overshoots the real
    size (observed: 3588 MB written for a 3248 MB ISO) and can never match the
    SHA-256.

    This script instead fetches explicit, fixed byte ranges into separate part
    files. A part is only accepted when its length equals the requested length
    exactly, so a bad or partial response can never corrupt the final image.
    Parts are retried individually, which survives stalls on a slow link, and the
    concatenation is verified against the published SHA-256 before use.

    Packer keys its HTTP cache by a hash of the URL, so once the verified file is
    in place the build reuses it and never re-downloads.
#>
[CmdletBinding()]
param(
    [string[]]$Mirrors = @(
        'https://mirrors.xtom.com/ubuntu-releases/24.04/ubuntu-24.04.4-live-server-amd64.iso',
        'https://mirrors.edge.kernel.org/ubuntu-releases/24.04/ubuntu-24.04.4-live-server-amd64.iso',
        'https://releases.ubuntu.com/24.04/ubuntu-24.04.4-live-server-amd64.iso'
    ),
    [long]$ExpectedBytes = 3405469696,
    [string]$ExpectedSha256 = 'e907d92eeec9df64163a7e454cbc8d7755e8ddc7ed42f99dbc80c40f1a138433',
    [string]$CacheDir = 'C:\Users\zenja\OneDrive\Desktop\UZARO PROJECT 2026\Bandai\bandai-infra-bnpi-pats\image-factory\packer\packer_cache',
    [string]$CacheName = '404079b253c03df4faee35898313e7c4d9dde17b.iso',
    [int]$ChunkCount = 32,
    [int]$Parallel = 4,
    [int]$MaxAttemptsPerChunk = 60
)

$ErrorActionPreference = 'Continue'
$target = Join-Path $CacheDir $CacheName
$partsDir = Join-Path $CacheDir 'iso-parts'
$done = "$target.CACHED-OK"
$log = Join-Path $CacheDir 'iso-fetch.log'

function Say {
    param([string]$m)
    $line = "{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m
    Write-Host $line
    Add-Content -LiteralPath $log -Value $line -Encoding UTF8
}

New-Item -ItemType Directory -Force -Path $partsDir | Out-Null
Remove-Item -LiteralPath $done -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "$target.lock" -Force -ErrorAction SilentlyContinue

$chunkSize = [long][math]::Ceiling($ExpectedBytes / $ChunkCount)
Say "CHUNKED START bytes=$ExpectedBytes chunks=$ChunkCount chunk_bytes=$chunkSize parallel=$Parallel"
Say "target=$target"

# Build the chunk plan: exact start/end for every chunk.
$plan = @()
for ($n = 0; $n -lt $ChunkCount; $n++) {
    $start = [long]($n * $chunkSize)
    if ($start -ge $ExpectedBytes) { break }
    $end = [long][Math]::Min($start + $chunkSize - 1, $ExpectedBytes - 1)
    $plan += [pscustomobject]@{
        Index  = $n
        Start  = $start
        End    = $end
        Length = [long]($end - $start + 1)
        Path   = Join-Path $partsDir ('part-{0:D3}.bin' -f $n)
    }
}
Say "planned_chunks=$($plan.Count)"

function Get-Part {
    param([Parameter(Mandatory = $true)]$Chunk)

    for ($a = 1; $a -le $MaxAttemptsPerChunk; $a++) {
        if (Test-Path -LiteralPath $Chunk.Path) {
            $len = (Get-Item -LiteralPath $Chunk.Path).Length
            if ($len -eq $Chunk.Length) { return $true }
            # Wrong length means a truncated or over-long response. Never reuse it.
            Remove-Item -LiteralPath $Chunk.Path -Force -ErrorAction SilentlyContinue
        }

        $mirror = $Mirrors[($a - 1) % $Mirrors.Count]
        $tmp = "$($Chunk.Path).tmp"
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue

        & curl.exe -sS --fail --connect-timeout 20 --max-time 1800 `
            --speed-time 60 --speed-limit 2048 `
            -r "$($Chunk.Start)-$($Chunk.End)" -o $tmp $mirror 2>$null | Out-Null

        if (Test-Path -LiteralPath $tmp) {
            $len = (Get-Item -LiteralPath $tmp).Length
            if ($len -eq $Chunk.Length) {
                Move-Item -LiteralPath $tmp -Destination $Chunk.Path -Force
                return $true
            }
            Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
        }
    }
    return $false
}

# ---- phase 1: fetch every chunk (bounded parallelism) ----------------------
$pending = [System.Collections.Generic.Queue[object]]::new()
foreach ($c in $plan) { $pending.Enqueue($c) }

$failed = @()
while ($pending.Count -gt 0) {
    $batch = @()
    for ($i = 0; $i -lt $Parallel -and $pending.Count -gt 0; $i++) { $batch += $pending.Dequeue() }

    # Start-Job flattens array arguments, so the mirror list is passed as one
    # pipe-delimited string and split inside the job. Passing [string[]] directly
    # binds $mirrors to a single URL string and shifts every other parameter.
    $mirrorSpec = ($Mirrors -join '|')

    $jobs = foreach ($c in $batch) {
        Start-Job -ScriptBlock {
            param($c, $mirrorSpec, $max)
            $mirrors = $mirrorSpec -split '\|'
            for ($a = 1; $a -le $max; $a++) {
                if (Test-Path -LiteralPath $c.Path) {
                    if ((Get-Item -LiteralPath $c.Path).Length -eq $c.Length) { return $true }
                    Remove-Item -LiteralPath $c.Path -Force -ErrorAction SilentlyContinue
                }
                $mirror = $mirrors[($a - 1) % $mirrors.Count]
                $tmp = "$($c.Path).tmp"
                Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
                & curl.exe -sS --fail --connect-timeout 20 --max-time 1800 `
                    --speed-time 60 --speed-limit 2048 `
                    -r "$($c.Start)-$($c.End)" -o $tmp $mirror 2>$null | Out-Null
                if (Test-Path -LiteralPath $tmp) {
                    if ((Get-Item -LiteralPath $tmp).Length -eq $c.Length) {
                        Move-Item -LiteralPath $tmp -Destination $c.Path -Force
                        return $true
                    }
                    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
                }
            }
            return $false
        } -ArgumentList $c, $mirrorSpec, $MaxAttemptsPerChunk
    }

    # Receive-Job without -Wait returns immediately, so removing the job right
    # after kills curl mid-transfer. Every job in the batch must finish first.
    Wait-Job -Job $jobs | Out-Null

    foreach ($j in $jobs) {
        $null = Receive-Job -Job $j -ErrorAction SilentlyContinue
        Remove-Job -Job $j -Force -ErrorAction SilentlyContinue
    }

    $have = (Get-ChildItem $partsDir -Filter 'part-*.bin' -ErrorAction SilentlyContinue | Measure-Object).Count
    Say "chunks_ready=$have/$($plan.Count)"
}

$have = (Get-ChildItem $partsDir -Filter 'part-*.bin' -ErrorAction SilentlyContinue | Measure-Object).Count
if ($have -ne $plan.Count) {
    Say "CHUNK_FETCH_INCOMPLETE $have/$($plan.Count)"
    exit 1
}

# ---- phase 2: concatenate in order ----------------------------------------
Say 'concatenating parts'
Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
$outStream = [System.IO.File]::Create($target)
try {
    foreach ($c in $plan) {
        $inStream = [System.IO.File]::OpenRead($c.Path)
        try { $inStream.CopyTo($outStream, 1MB) } finally { $inStream.Dispose() }
    }
}
finally { $outStream.Dispose() }

$actualBytes = (Get-Item -LiteralPath $target).Length
Say "assembled_bytes=$actualBytes expected=$ExpectedBytes"
if ($actualBytes -ne $ExpectedBytes) {
    Say 'SIZE_MISMATCH after assembly'
    exit 1
}

# ---- phase 3: verify -------------------------------------------------------
Say 'verifying SHA-256 (this takes a minute)'
$actual = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $ExpectedSha256.ToLowerInvariant()) {
    Say "CHECKSUM_MISMATCH actual=$actual expected=$ExpectedSha256"
    exit 1
}

Set-Content -LiteralPath $done -Value "ok $actual $(Get-Date -Format o)" -Encoding ASCII
Say "ISO_CACHED_OK sha256=$actual size_bytes=$actualBytes"
Remove-Item -LiteralPath $partsDir -Recurse -Force -ErrorAction SilentlyContinue
exit 0
