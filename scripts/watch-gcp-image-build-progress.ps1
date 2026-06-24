param(
  [string]$RuntimeDir = '',
  [string]$LatestPath = (Join-Path (Split-Path -Parent $PSScriptRoot) '.runtime\gcp-build-visible-proof-LATEST.txt'),
  [string]$ProjectId = 'hris-492904',
  [int]$IntervalSeconds = 10,
  [int]$Ticks = 0
)

$ErrorActionPreference = 'Continue'

if ([string]::IsNullOrWhiteSpace($RuntimeDir)) {
  if (Test-Path -LiteralPath $LatestPath) {
    $RuntimeDir = (Get-Content -LiteralPath $LatestPath -Raw).Trim()
  }
}

if ([string]::IsNullOrWhiteSpace($RuntimeDir)) {
  throw "RuntimeDir was not supplied and latest pointer was not found: $LatestPath"
}

if (-not [System.IO.Path]::IsPathRooted($RuntimeDir)) {
  $RuntimeDir = Join-Path (Get-Location).Path $RuntimeDir
}
$RuntimeDir = [System.IO.Path]::GetFullPath($RuntimeDir)

function Format-Size {
  param([double]$Bytes)
  if ($Bytes -ge 1GB) { return ('{0:n2} GiB' -f ($Bytes / 1GB)) }
  if ($Bytes -ge 1MB) { return ('{0:n1} MiB' -f ($Bytes / 1MB)) }
  if ($Bytes -ge 1KB) { return ('{0:n1} KiB' -f ($Bytes / 1KB)) }
  return ('{0:n0} B' -f $Bytes)
}

function Get-Phase {
  param([string]$Run)

  $phases = @(
    @{ Name = 'Stage source'; Path = 'checkpoint-stage.txt'; Percent = 10; Meaning = 'Copying repo folders into a slim build payload.' },
    @{ Name = 'Create tar'; Path = 'checkpoint-stage-archive.txt'; Percent = 25; Meaning = 'Packing the payload into project-truth-staging.tar.' },
    @{ Name = 'Upload tar'; Path = 'checkpoint-stage-upload.txt'; Percent = 35; Meaning = 'Uploading the tar to Cloud Storage so GCE can pull it.' },
    @{ Name = 'Packer init'; Path = 'checkpoint-packer-init.txt'; Percent = 45; Meaning = 'Installing/checking the Packer GCP plugin.' },
    @{ Name = 'Validate'; Path = 'checkpoint-packer-validate.txt'; Percent = 50; Meaning = 'Validating the Packer template before launch.' },
    @{ Name = 'Build VM'; Path = 'checkpoint-packer-build.txt'; Percent = 65; Meaning = 'GCP build VM is provisioning the image.' }
  )

  $current = @{ Name = 'Starting'; Percent = 2; Meaning = 'Waiting for the first checkpoint.' }
  foreach ($phase in $phases) {
    if (Test-Path -LiteralPath (Join-Path $Run $phase.Path)) {
      $current = $phase
    }
  }

  $builtImage = Join-Path $Run 'built-image-name.txt'
  if (Test-Path -LiteralPath $builtImage) {
    return @{ Name = 'Image built'; Percent = 100; Meaning = "Built image: $((Get-Content -LiteralPath $builtImage -Raw).Trim())" }
  }

  $successAlerts = @(Get-ChildItem -LiteralPath $Run -Filter 'alert-*.txt' -ErrorAction SilentlyContinue | Where-Object {
    (Get-Content -LiteralPath $_.FullName -Raw -ErrorAction SilentlyContinue) -match 'Status:\s+SUCCEEDED'
  })
  if ($successAlerts.Count -gt 0) {
    return @{ Name = 'Succeeded'; Percent = 100; Meaning = 'Build completed successfully.' }
  }

  return $current
}

function New-Bar {
  param(
    [int]$Percent,
    [int]$Width = 28
  )
  $filled = [math]::Floor($Width * ([math]::Max(0, [math]::Min(100, $Percent)) / 100))
  return ('[{0}{1}] {2,3}%' -f ('#' * $filled), ('.' * ($Width - $filled)), $Percent)
}

function Get-GcpBuildRows {
  param([string]$Project)
  $gcloud = Get-Command gcloud.cmd, gcloud -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $gcloud) {
    return @('gcloud not found')
  }

  $rows = & $gcloud.Source compute instances list `
    --project $Project `
    --filter "name~project-truth-node-gcp-build OR labels.purpose=packer-image-build" `
    --format "csv[no-heading](name,zone.basename(),status,networkInterfaces[0].accessConfigs[0].natIP,creationTimestamp)" 2>$null

  if (-not $rows -or @($rows).Count -eq 0 -or [string]::IsNullOrWhiteSpace(@($rows)[0])) {
    return @('no GCP build VM yet')
  }
  return @($rows)
}

function Show-ProgressFrame {
  param([int]$Tick)

  $phase = Get-Phase -Run $RuntimeDir
  $files = @(Get-ChildItem -LiteralPath $RuntimeDir -Recurse -File -ErrorAction SilentlyContinue)
  $totalBytes = ($files | Measure-Object -Property Length -Sum).Sum
  if ($null -eq $totalBytes) { $totalBytes = 0 }

  $archive = Get-Item -LiteralPath (Join-Path $RuntimeDir 'staging\project-truth-staging.tar') -ErrorAction SilentlyContinue
  $manifest = Get-Item -LiteralPath (Join-Path $RuntimeDir 'staging\project-truth-staging.manifest.json') -ErrorAction SilentlyContinue
  $stdout = Get-Item -LiteralPath (Join-Path $RuntimeDir 'console.log') -ErrorAction SilentlyContinue
  $stderr = Get-Item -LiteralPath (Join-Path $RuntimeDir 'console.err.log') -ErrorAction SilentlyContinue
  $packerLog = Get-Item -LiteralPath (Join-Path $RuntimeDir 'packer-build.log') -ErrorAction SilentlyContinue

  $latestFiles = $files |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 6 |
    ForEach-Object {
      '  {0,-34} {1,10}  {2}' -f $_.Name, (Format-Size $_.Length), $_.LastWriteTime.ToString('HH:mm:ss')
    }

  $meaning = $phase.Meaning
  if ($archive -and $phase.Name -eq 'Upload tar') {
    $age = [math]::Round(((Get-Date) - $archive.LastWriteTime).TotalSeconds)
    $meaning = "Archive is complete; upload or cloud handoff is in progress. Archive age: ${age}s."
  }
  if ($phase.Name -eq 'Build VM') {
    $meaning = 'The temporary GCE build VM may be installing packages/building Docker images. This is the long phase.'
  }

  Clear-Host
  Write-Host 'Project Truth GCP Image Build Progress'
  Write-Host ('=' * 44)
  Write-Host ("Run:  {0}" -f $RuntimeDir)
  Write-Host ("Time: {0}   Tick: {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Tick)
  Write-Host ''
  Write-Host ("Phase: {0}" -f $phase.Name)
  Write-Host (New-Bar -Percent $phase.Percent)
  Write-Host ("Meaning: {0}" -f $meaning)
  Write-Host ''
  Write-Host 'Local build artifacts'
  Write-Host ('  total runtime files: {0}' -f (Format-Size $totalBytes))
  Write-Host ('  staging archive:     {0}' -f ($(if ($archive) { (Format-Size $archive.Length) + " @ " + $archive.LastWriteTime.ToString('HH:mm:ss') } else { 'pending' })))
  Write-Host ('  manifest:            {0}' -f ($(if ($manifest) { (Format-Size $manifest.Length) + " @ " + $manifest.LastWriteTime.ToString('HH:mm:ss') } else { 'pending' })))
  Write-Host ('  console.log:         {0}' -f ($(if ($stdout) { (Format-Size $stdout.Length) + " @ " + $stdout.LastWriteTime.ToString('HH:mm:ss') } else { 'pending' })))
  Write-Host ('  console.err.log:     {0}' -f ($(if ($stderr) { (Format-Size $stderr.Length) + " @ " + $stderr.LastWriteTime.ToString('HH:mm:ss') } else { 'pending' })))
  Write-Host ('  packer-build.log:    {0}' -f ($(if ($packerLog) { (Format-Size $packerLog.Length) + " @ " + $packerLog.LastWriteTime.ToString('HH:mm:ss') } else { 'pending' })))
  Write-Host ''
  Write-Host 'GCP build VM'
  Get-GcpBuildRows -Project $ProjectId | ForEach-Object { Write-Host "  $_" }
  Write-Host ''
  Write-Host 'Latest files'
  if ($latestFiles) { $latestFiles | ForEach-Object { Write-Host $_ } } else { Write-Host '  none yet' }
  Write-Host ''
  Write-Host 'Latest useful log lines'
  $logPath = if ($packerLog) { $packerLog.FullName } elseif ($stdout) { $stdout.FullName } else { '' }
  if ($logPath) {
    Get-Content -LiteralPath $logPath -Tail 10 -ErrorAction SilentlyContinue |
      Where-Object { $_ -and $_.Trim() } |
      ForEach-Object { Write-Host "  $_" }
  } else {
    Write-Host '  no log yet'
  }
  Write-Host ''
  Write-Host 'Tip: Ctrl+C stops only this watcher; it does not stop the build process.'
}

$tick = 1
while ($true) {
  Show-ProgressFrame -Tick $tick
  if ($Ticks -gt 0 -and $tick -ge $Ticks) {
    break
  }
  $tick++
  Start-Sleep -Seconds $IntervalSeconds
}
