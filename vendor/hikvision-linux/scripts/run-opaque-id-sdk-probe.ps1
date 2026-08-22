# Agent-owned dry-run HCNetSDK opaque-id probe (Docker + linux64 SDK).
# Recoverable loop: export credentials -> build image -> run -> capture evidence.
param(
  [int]$MaxAttempts = 3,
  [string]$DeviceId = "cmrlgqsjv000oob01165tbd8n",
  [string]$ImageName = "project-truth-opaque-id-sdk-probe:local"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
Set-Location $repoRoot

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outDir = Join-Path $repoRoot ".runtime\opaque-id-sdk-probe\$stamp"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$logPath = Join-Path $outDir "orchestrator.log"

function Write-Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "o"), $msg
  Add-Content -Path $logPath -Value $line
  Write-Host $line
}

Write-Log "START outDir=$outDir"

# 1) Ensure DB tunnel URL for credential export
if (-not $env:FORCE_DATABASE_URL) {
  $env:FORCE_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:55435/hris?schema=public"
}
$env:HIKVISION_DEVICE_ID = $DeviceId

# 2) Export device.spec (no password printed)
$exportScript = Join-Path $repoRoot "vendor\hikvision-linux\scripts\export-test-a-device-spec.cjs"
$exportOk = $false
for ($i = 1; $i -le $MaxAttempts; $i++) {
  try {
    Write-Log "export device.spec attempt $i"
    node $exportScript 2>&1 | Tee-Object -FilePath (Join-Path $outDir "export-$i.txt") | Out-Host
    $specPath = Join-Path $repoRoot ".runtime\opaque-id-sdk-probe\device.spec"
    $metaPath = Join-Path $repoRoot ".runtime\opaque-id-sdk-probe\device.meta.json"
    if ((Test-Path $specPath) -and (Test-Path $metaPath)) {
      Copy-Item $specPath (Join-Path $outDir "device.spec") -Force
      Copy-Item $metaPath (Join-Path $outDir "device.meta.json") -Force
      $meta = Get-Content $metaPath -Raw | ConvertFrom-Json
      if ($meta.hasUser -and $meta.hasPass) {
        $exportOk = $true
        Write-Log "export OK address=$($meta.address) sdkPort=$($meta.sdkPort)"
        break
      }
      Write-Log "export missing credentials hasUser=$($meta.hasUser) hasPass=$($meta.hasPass)"
    }
  } catch {
    Write-Log "export failed: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds 2
}
if (-not $exportOk) {
  Write-Log "FATAL: could not export device credentials after $MaxAttempts attempts"
  exit 2
}

# 3) TCP preflight to device (SDK + HTTPS)
$meta = Get-Content (Join-Path $outDir "device.meta.json") -Raw | ConvertFrom-Json
$address = [string]$meta.address
$sdkPort = [int]$meta.sdkPort
function Test-Tcp([string]$hostName, [int]$port) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect($hostName, $port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(3000, $false)
    if (-not $ok) { $client.Close(); return $false }
    $client.EndConnect($iar) | Out-Null
    $client.Close()
    return $true
  } catch { return $false }
}
$sdkReachable = Test-Tcp $address $sdkPort
$httpsReachable = Test-Tcp $address 443
Write-Log "preflight sdk=$sdkReachable :$sdkPort https=$httpsReachable :443 host=$address"
if (-not $sdkReachable -and -not $httpsReachable) {
  Write-Log "FATAL: device unreachable on SDK and HTTPS"
  exit 3
}

# 4) Docker available?
docker version --format "{{.Server.Version}}" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Log "FATAL: docker engine not available"
  exit 4
}

# 5) Stage Docker context (vendor .dockerignore excludes sdk-local/*.so)
$stage = Join-Path $repoRoot ".runtime\opaque-id-sdk-probe\docker-context"
$sdkSrc = Join-Path $repoRoot "vendor\hikvision-linux\sdk-local\hcnetsdk-6.1.9.48\EN-HCNetSDKV6.1.9.48_build20230410_linux64"
$sdkDst = Join-Path $stage "sdk-local\hcnetsdk-6.1.9.48\EN-HCNetSDKV6.1.9.48_build20230410_linux64"
New-Item -ItemType Directory -Force -Path (Join-Path $stage "scripts") | Out-Null
Copy-Item (Join-Path $repoRoot "vendor\hikvision-linux\opaque_id_sdk_probe.cpp") $stage -Force
Copy-Item (Join-Path $repoRoot "vendor\hikvision-linux\Dockerfile.opaque-id-sdk-probe") (Join-Path $stage "Dockerfile") -Force
Copy-Item (Join-Path $repoRoot "vendor\hikvision-linux\scripts\build-opaque-id-sdk-probe.sh") (Join-Path $stage "scripts") -Force
Set-Content (Join-Path $stage ".dockerignore") "# allow sdk for this probe context`n"
if (-not (Test-Path (Join-Path $sdkDst "lib\libhcnetsdk.so"))) {
  Write-Log "staging SDK from $sdkSrc"
  New-Item -ItemType Directory -Force -Path (Split-Path $sdkDst) | Out-Null
  robocopy $sdkSrc $sdkDst /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
}
if (-not (Test-Path (Join-Path $sdkDst "lib\libhcnetsdk.so"))) {
  Write-Log "FATAL: libhcnetsdk.so missing after stage"
  exit 5
}

# 6) Build image (retry)
$buildOk = $false
for ($i = 1; $i -le $MaxAttempts; $i++) {
  try {
    Write-Log "docker build attempt $i"
    docker build -t $ImageName $stage 2>&1 | Tee-Object -FilePath (Join-Path $outDir "docker-build-$i.log") | Out-Host
    if ($LASTEXITCODE -eq 0) {
      $buildOk = $true
      Write-Log "docker build OK"
      break
    }
    Write-Log "docker build exit=$LASTEXITCODE"
  } catch {
    Write-Log "docker build error: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds 3
}
if (-not $buildOk) {
  Write-Log "FATAL: docker build failed"
  exit 5
}

# 7) Run probe (Docker Desktop bridge; device LAN usually still reachable from container)
$runOk = $false
for ($i = 1; $i -le $MaxAttempts; $i++) {
  try {
    Write-Log "docker run attempt $i"
    $runLog = Join-Path $outDir "docker-run-$i.log"
    # Mount device.spec read-only and evidence out dir
    docker run --rm `
      -v "${outDir}/device.spec:/run/device.spec:ro" `
      -v "${outDir}:/out" `
      $ImageName `
      --device-file /run/device.spec `
      --evidence-dir /out `
      --max-log-rows 40 `
      --max-inventory 185 2>&1 | Tee-Object -FilePath $runLog | Out-Host

    $summaryPath = Join-Path $outDir "sdk-probe-summary.json"
    $jsonlPath = Join-Path $outDir "sdk-probe.jsonl"
    if (Test-Path $summaryPath) {
      $runOk = $true
      Write-Log "probe produced summary"
      Get-Content $summaryPath -Raw | Write-Host
      break
    }
    if (Test-Path $jsonlPath) {
      Write-Log "probe produced jsonl but no summary; inspecting tail"
      Get-Content $jsonlPath -Tail 20 | Write-Host
    }
    Write-Log "run attempt $i incomplete exit=$LASTEXITCODE"
  } catch {
    Write-Log "docker run error: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds 3
}

if (-not $runOk) {
  Write-Log "FATAL: probe did not produce summary after $MaxAttempts runs"
  exit 6
}

# 7) Write handoff
$handoff = Join-Path $outDir "HANDOFF.md"
@"
# Opaque ID SDK probe handoff

- stamp: $stamp
- device: $address sdkPort=$sdkPort
- evidence: $outDir
- summary: sdk-probe-summary.json
- stream: sdk-probe.jsonl

Read-only dry-run. No HRIS writes. No device mutations.
"@ | Set-Content -Path $handoff -Encoding UTF8

Write-Log "DONE handoff=$handoff"
exit 0
