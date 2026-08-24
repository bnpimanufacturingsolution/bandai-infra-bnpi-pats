param(
  [string]$Workspace = "C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH",
  [string]$TargetHost = "192.168.1.54",
  [switch]$StartCodex
)

$ErrorActionPreference = "Continue"

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runRoot = Join-Path $Workspace ".runtime\overnight-docker-bridge-minio-truth\$timestamp"
$promptPath = Join-Path $Workspace "docs\OVERNIGHT_HARDCUTOVER_MINIO_DRIFT_REPAIR_PROMPT.md"
$promptUsed = Join-Path $runRoot "PROMPT_USED.md"
$summaryPath = Join-Path $runRoot "START_HERE.md"
$codexLog = Join-Path $runRoot "codex-exec.log"
$codexErr = Join-Path $runRoot "codex-exec.err.log"
$codexFinal = Join-Path $runRoot "codex-final-message.md"
$codexRunner = Join-Path $runRoot "run-codex-exec.ps1"

New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

function Write-Section {
  param([string]$Name)
  "`n===== $Name =====" | Tee-Object -FilePath (Join-Path $runRoot "launcher.log") -Append
}

function Save-Command {
  param(
    [string]$Name,
    [string]$Command,
    [int]$TimeoutSeconds = 30
  )

  $safeName = $Name -replace "[^A-Za-z0-9_.-]", "_"
  $outFile = Join-Path $runRoot "$safeName.txt"
  Write-Section $Name
  "COMMAND: $Command" | Tee-Object -FilePath $outFile
  try {
    $job = Start-Job -ScriptBlock {
      param($cmd, $dir)
      Set-Location -LiteralPath $dir
      powershell.exe -NoProfile -ExecutionPolicy Bypass -Command $cmd 2>&1
    } -ArgumentList $Command, $Workspace

    if (Wait-Job $job -Timeout $TimeoutSeconds) {
      Receive-Job $job | Tee-Object -FilePath $outFile -Append
    } else {
      "TIMEOUT after $TimeoutSeconds seconds" | Tee-Object -FilePath $outFile -Append
      Stop-Job $job | Out-Null
    }
    Remove-Job $job -Force | Out-Null
  } catch {
    "ERROR: $($_.Exception.Message)" | Tee-Object -FilePath $outFile -Append
  }
}

Copy-Item -LiteralPath $promptPath -Destination $promptUsed -Force

Set-Location -LiteralPath $Workspace

Save-Command "git-status" "git status --short" 20
Save-Command "git-diff-stat" "git diff --stat" 20
Save-Command "codex-version" "codex --version" 20
Save-Command "docker-ps" "docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'" 20
Save-Command "hyperv-vms" "Get-VM | Select-Object Name,State,CPUUsage,MemoryAssigned,Uptime | Format-Table -AutoSize" 20
Save-Command "ports-3000-3201" "netstat -ano | Select-String ':3000|:3001|:3100|:3101|:3200|:3201|:9000|:9001'" 20

$envs = @(
  @{ Name = "prod"; App = "http://${TargetHost}:3000"; Api = "http://${TargetHost}:3001" },
  @{ Name = "dev"; App = "http://${TargetHost}:3100"; Api = "http://${TargetHost}:3101" },
  @{ Name = "uat"; App = "http://${TargetHost}:3200"; Api = "http://${TargetHost}:3201" }
)

foreach ($env in $envs) {
  Save-Command "$($env.Name)-app-login" "curl.exe -i --max-time 20 '$($env.App)/auth/login'" 30
  Save-Command "$($env.Name)-api-health" "curl.exe -i --max-time 20 '$($env.Api)/health'" 30
  Save-Command "$($env.Name)-avatar-unauth" "curl.exe -i --max-time 20 '$($env.Api)/api/auth/me/avatar'" 30
}

Save-Command "minio-host-live" "curl.exe -i --max-time 20 'http://${TargetHost}:9000/minio/health/live'" 30
Save-Command "minio-console" "curl.exe -i --max-time 20 'http://${TargetHost}:9001'" 30

$startCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""$PSCommandPath"" -StartCodex"

$summary = @(
  "# Overnight Docker Bridge MinIO Truth Run",
  "",
  "Run root:",
  "",
  "``````text",
  $runRoot,
  "``````",
  "",
  "Prepared prompt:",
  "",
  "``````text",
  $promptUsed,
  "``````",
  "",
  "To start the unattended local Codex repair loop:",
  "",
  "``````powershell",
  $startCommand,
  "``````",
  "",
  "This launcher already captured initial repo/runtime/HTTP evidence in this folder.",
  "",
  "If -StartCodex was used, follow:",
  "",
  "``````text",
  $codexLog,
  $codexErr,
  $codexFinal,
  "``````",
  "",
  "Expected final report from the agent:",
  "",
  "``````text",
  (Join-Path $runRoot "FINAL_REPORT.md"),
  "``````"
)

Set-Content -LiteralPath $summaryPath -Value $summary -Encoding UTF8

if ($StartCodex) {
  $runnerContent = @(
    '$ErrorActionPreference = "Continue"',
    "Set-Location -LiteralPath ""$Workspace""",
    "Get-Content -Raw -LiteralPath ""$promptUsed"" | codex exec --cd ""$Workspace"" --dangerously-bypass-approvals-and-sandbox --output-last-message ""$codexFinal"" - *> ""$codexLog""",
    "if (`$LASTEXITCODE -ne 0) { ""codex exec exited with code `$LASTEXITCODE"" | Set-Content -LiteralPath ""$codexErr"" -Encoding UTF8 }"
  )
  Set-Content -LiteralPath $codexRunner -Value $runnerContent -Encoding UTF8

  Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $codexRunner) `
    -WorkingDirectory $Workspace `
    -WindowStyle Hidden

  "Started unattended Codex exec. Logs: $codexLog" | Tee-Object -FilePath (Join-Path $runRoot "launcher.log") -Append
} else {
  "Prepared overnight run kit. Start with -StartCodex when ready." | Tee-Object -FilePath (Join-Path $runRoot "launcher.log") -Append
}

Write-Host "Run root: $runRoot"
Write-Host "Start here: $summaryPath"
if ($StartCodex) {
  Write-Host "Codex exec started in background."
  Write-Host "Log: $codexLog"
}
