[CmdletBinding()]
param(
  [string]$RemoteHost = 'project-truth-bnpi-pats',
  [string]$RemoteChunkDir = '/var/lib/project-truth/retained-vhdx/20260703-102324/host-test-chunks-128m',
  [string]$RemoteImage = '/var/lib/project-truth/retained-vhdx/20260703-102324/project-truth-node-current-state-20260703-102324-host-test-cloudflare-disabled.vhdx',
  [string]$TargetPath = 'C:\ProgramData\ProjectTruth\images\project-truth-node-latest.vhdx',
  [string]$WorkDir = 'C:\ProgramData\ProjectTruth\images\host-test-download',
  [string]$SevenZip = 'C:\Program Files\7-Zip\7z.exe'
)

$ErrorActionPreference = 'Stop'

New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
$logPath = Join-Path $WorkDir 'download-host-test-vhdx.log'
$statePath = Join-Path $WorkDir 'download-host-test-vhdx.state.json'
$donePath = Join-Path $WorkDir 'download-host-test-vhdx.done'
$expectedShaPath = Join-Path $WorkDir 'expected.sha256'
$chunkLocal = Join-Path $WorkDir 'chunk.zst'
$extractDir = Join-Path $WorkDir 'extract'

function Write-Log {
  param([string]$Message)
  $line = "$(Get-Date -Format o) $Message"
  $line | Tee-Object -FilePath $logPath -Append
}

function Invoke-Checked {
  param([string]$Command)
  Write-Log "RUN $Command"
  cmd.exe /d /c $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed ($LASTEXITCODE): $Command"
  }
}

function Invoke-CheckedRetry {
  param(
    [string]$Command,
    [int]$Attempts = 5,
    [int]$DelaySeconds = 20
  )

  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    try {
      Invoke-Checked $Command
      return
    } catch {
      if ($attempt -ge $Attempts) {
        throw
      }
      Write-Log "RETRY attempt=$attempt attempts=$Attempts after failure: $($_.Exception.Message)"
      Start-Sleep -Seconds $DelaySeconds
    }
  }
}

if (-not (Test-Path -LiteralPath $SevenZip)) {
  throw "7-Zip was not found at $SevenZip"
}

Remove-Item -LiteralPath $donePath -Force -ErrorAction SilentlyContinue
Write-Log "Starting/resuming host-test VHDX download"
Write-Log "Remote image: $RemoteImage"
Write-Log "Target: $TargetPath"

$remoteSize = (& ssh $RemoteHost "stat -c '%s' '$RemoteImage'").Trim()
$expectedShaLine = (& ssh $RemoteHost "cat '$RemoteImage.sha256'").Trim()
$expectedSha = ($expectedShaLine -split '\s+')[0]
$expectedShaLine | Set-Content -LiteralPath $expectedShaPath -Encoding ASCII

$chunkInfoLines = & ssh $RemoteHost "cd '$RemoteChunkDir' && for f in part-*; do stat -c '%n %s' `"`$f`"; done"
if (-not $chunkInfoLines) {
  throw "No remote chunks found under $RemoteChunkDir"
}
$chunks = @()
$offset = 0L
foreach ($line in $chunkInfoLines) {
  if (-not $line.Trim()) { continue }
  $parts = $line.Trim() -split '\s+'
  $chunks += [pscustomobject]@{
    Name = $parts[0]
    Size = [int64]$parts[1]
    Offset = $offset
  }
  $offset += [int64]$parts[1]
}

if ((Test-Path -LiteralPath $TargetPath) -and ((Get-Item -LiteralPath $TargetPath).Length -gt [int64]$remoteSize)) {
  throw "Target is larger than remote image; remove it before resuming: $TargetPath"
}

if (-not (Test-Path -LiteralPath $TargetPath)) {
  New-Item -ItemType File -Path $TargetPath -Force | Out-Null
}

$targetStream = [System.IO.File]::Open($TargetPath, [System.IO.FileMode]::Append, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read)
try {
  foreach ($chunkItem in $chunks) {
    $chunk = $chunkItem.Name

    $remoteChunk = "$RemoteChunkDir/$chunk"
    $remoteChunkSize = [int64]$chunkItem.Size
    $currentSize = (Get-Item -LiteralPath $TargetPath).Length
    $expectedOffset = [int64]$chunkItem.Offset

    if ($currentSize -ge ($expectedOffset + $remoteChunkSize)) {
      Write-Log "SKIP $chunk already appended currentSize=$currentSize"
      continue
    }
    if ($currentSize -ne $expectedOffset) {
      throw "Resume offset mismatch before $chunk. target=$currentSize expected=$expectedOffset"
    }

    $state = [ordered]@{
      chunk = $chunk
      targetSize = $currentSize
      expectedOffset = $expectedOffset
      remoteSize = [int64]$remoteSize
      startedAt = (Get-Date).ToString('o')
    }
    $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8

    Remove-Item -LiteralPath $chunkLocal -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $extractDir | Out-Null

    Write-Log "Compress remote $chunk"
    Invoke-CheckedRetry "ssh $RemoteHost `"sudo zstd -q -3 -f '$remoteChunk' -o '$remoteChunk.zst' && sudo chmod 0644 '$remoteChunk.zst'`""

    Write-Log "Download $chunk.zst"
    Invoke-CheckedRetry "scp `"${RemoteHost}:$remoteChunk.zst`" `"$chunkLocal`""

    Write-Log "Remove remote compressed $chunk.zst"
    & ssh $RemoteHost "sudo rm -f '$remoteChunk.zst'" | Out-Null

    Write-Log "Decompress $chunk"
    Invoke-Checked "`"$SevenZip`" x `"$chunkLocal`" `"-o$extractDir`" -y"
    $extracted = Join-Path $extractDir $chunk
    if (-not (Test-Path -LiteralPath $extracted)) {
      $extractedFiles = @(Get-ChildItem -LiteralPath $extractDir -File)
      if ($extractedFiles.Count -eq 1) {
        $extracted = $extractedFiles[0].FullName
        Write-Log "Using extracted file $extracted for $chunk"
      } else {
        throw "Expected extracted chunk missing: $extracted"
      }
    }
    $actualChunkSize = (Get-Item -LiteralPath $extracted).Length
    if ($actualChunkSize -ne $remoteChunkSize) {
      throw "Chunk size mismatch for $chunk. local=$actualChunkSize remote=$remoteChunkSize"
    }

    Write-Log "Append $chunk bytes=$actualChunkSize"
    $readStream = [System.IO.File]::OpenRead($extracted)
    try {
      $buffer = New-Object byte[] (4MB)
      while (($read = $readStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
        $targetStream.Write($buffer, 0, $read)
      }
      $targetStream.Flush()
    } finally {
      $readStream.Dispose()
    }

    Remove-Item -LiteralPath $chunkLocal -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue
    $newSize = (Get-Item -LiteralPath $TargetPath).Length
    Write-Log "DONE $chunk targetSize=$newSize"
  }
} finally {
  $targetStream.Dispose()
}

$finalSize = (Get-Item -LiteralPath $TargetPath).Length
if ($finalSize -ne [int64]$remoteSize) {
  throw "Final size mismatch. local=$finalSize remote=$remoteSize"
}

Write-Log "Hashing final VHDX"
$actualSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $TargetPath).Hash.ToLowerInvariant()
if ($actualSha -ne $expectedSha.ToLowerInvariant()) {
  throw "SHA256 mismatch. local=$actualSha expected=$expectedSha"
}

"$actualSha  $TargetPath" | Set-Content -LiteralPath "$TargetPath.sha256" -Encoding ASCII
"complete $(Get-Date -Format o)" | Set-Content -LiteralPath $donePath -Encoding ASCII
Write-Log "COMPLETE sha256=$actualSha"
