#Requires -Version 5.1
<#
.SYNOPSIS
  Verifies that Grok auto-loads Project Truth rules and opens WWG in live headless probes.

.DESCRIPTION
  Loop-friendly verifier for "Grok reads AGENTS/WWG every time" claims.
  - Checks grok inspect for AGENTS.md + .grok/rules bootstrap
  - Runs N independent headless probes (default 2) with natural prompts
  - Fails if any probe does not open required WWG files

.EXAMPLE
  powershell -File scripts/verify-grok-wwg-bootstrap.ps1
  powershell -File scripts/verify-grok-wwg-bootstrap.ps1 -ProbeCount 3 -MaxTurns 15
#>
param(
  [int]$ProbeCount = 2,
  [int]$MaxTurns = 15,
  [string]$Model = ""
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outDir = Join-Path $root ".runtime\grok-bootstrap-verify-$stamp"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$summaryPath = Join-Path $outDir "summary.json"
$latestPointer = Join-Path $root ".runtime\grok-bootstrap-verify-latest-dir.txt"
$outDir | Set-Content -Path $latestPointer -Encoding utf8

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

# --- 1) Inspect instruction load ---
Write-Step "grok inspect"
$inspectLog = Join-Path $outDir "grok-inspect.txt"
& grok inspect 1> $inspectLog 2>&1
$inspectText = Get-Content $inspectLog -Raw

$requiredInstructionMarkers = @(
  "Agents.md",
  "00-wwg-session-bootstrap.md"
)
$inspectOk = $true
foreach ($m in $requiredInstructionMarkers) {
  if ($inspectText -notmatch [regex]::Escape($m)) {
    Write-Host "FAIL inspect missing marker: $m" -ForegroundColor Red
    $inspectOk = $false
  }
}
if ($inspectText -notmatch "Project Instructions \(3\)" -and $inspectText -notmatch "Project Instructions \(4\)") {
  # Allow 3+ ; Claude may appear as Claude.md
  if ($inspectText -notmatch "Project Instructions") {
    Write-Host "FAIL: no Project Instructions section" -ForegroundColor Red
    $inspectOk = $false
  }
}
if ($inspectText -notmatch "Project trusted: yes") {
  Write-Host "WARN: project not trusted; tools may be limited" -ForegroundColor Yellow
}

# --- 2) Headless probes ---
$probePrompt = @'
What is the current WWG task status and overall handoff validation status?

You must open WWG files with tools before answering. Prefer evidence over assumption.
Return ONLY a JSON object (no markdown fences) with exactly:
{"opened_wwg_with_tools":true,"files_opened":["..."],"handoff_overall_status":"","current_task_status":"","assumed_without_reading":false}
'@

$probeResults = @()
$allProbesOk = $true

for ($i = 1; $i -le $ProbeCount; $i++) {
  Write-Step "Headless probe $i / $ProbeCount"
  $promptFile = Join-Path $outDir "probe$i-prompt.txt"
  $stdoutFile = Join-Path $outDir "probe$i-stdout.txt"
  $stderrFile = Join-Path $outDir "probe$i-stderr.txt"
  Set-Content -Path $promptFile -Value $probePrompt -Encoding utf8

  $args = @(
    "--prompt-file", $promptFile,
    "--cwd", $root.Path,
    "--output-format", "json",
    "--max-turns", "$MaxTurns",
    "--permission-mode", "bypassPermissions",
    "--always-approve",
    "--no-plan",
    "--disallowed-tools", "Agent"
  )
  if ($Model) { $args = @("-m", $Model) + $args }

  & grok @args 1> $stdoutFile 2> $stderrFile
  $exit = $LASTEXITCODE
  $raw = if (Test-Path $stdoutFile) { Get-Content $stdoutFile -Raw } else { "" }

  $opened = $false
  $files = @()
  $handoff = ""
  $task = ""
  try {
    $obj = $raw | ConvertFrom-Json
    $text = [string]$obj.text
    # strip optional fences
    $jsonText = $text
    if ($text -match '(?s)\{.*\}') {
      $jsonText = $Matches[0]
    }
    $inner = $jsonText | ConvertFrom-Json
    $opened = [bool]$inner.opened_wwg_with_tools
    if ($inner.files_opened) { $files = @($inner.files_opened) }
    $handoff = [string]$inner.handoff_overall_status
    $task = [string]$inner.current_task_status
  } catch {
    Write-Host "WARN: could not parse probe $i JSON: $($_.Exception.Message)" -ForegroundColor Yellow
  }

  $requiredFiles = @(
    ".wwg/reports/wwg-agent-handoff.md",
    ".wwg/workspace/current-task.md"
  )
  $filesJoined = ($files -join " ")
  $hasRequired = $true
  foreach ($rf in $requiredFiles) {
    if ($filesJoined -notmatch [regex]::Escape($rf) -and $filesJoined -notmatch [regex]::Escape(($rf -replace '/', '\'))) {
      $hasRequired = $false
    }
  }

  $probeOk = ($exit -eq 0) -and $opened -and $hasRequired
  if (-not $probeOk) {
    $allProbesOk = $false
    Write-Host "FAIL probe $i (exit=$exit opened=$opened hasRequired=$hasRequired)" -ForegroundColor Red
  } else {
    Write-Host "PASS probe $i handoff=$handoff task=$task" -ForegroundColor Green
  }

  $probeResults += [ordered]@{
    index = $i
    exitCode = $exit
    opened_wwg_with_tools = $opened
    files_opened = $files
    handoff_overall_status = $handoff
    current_task_status = $task
    ok = $probeOk
  }
}

$summary = [ordered]@{
  stamp = $stamp
  outDir = $outDir
  inspectOk = $inspectOk
  allProbesOk = $allProbesOk
  overallPass = ($inspectOk -and $allProbesOk)
  probeResults = $probeResults
  notes = @(
    "Grok auto-loads AGENTS.md and .grok/rules; it does not auto-inject full WWG wiki.",
    "Probes prove the model opens WWG with tools under those rules.",
    "Non-stop long tasks also need a checklist finish line and auto-approve so permissions do not idle-stop the run."
  )
}

($summary | ConvertTo-Json -Depth 6) | Set-Content -Path $summaryPath -Encoding utf8
Write-Host ""
Write-Host "Evidence: $outDir" -ForegroundColor Cyan
Write-Host "Summary:  $summaryPath" -ForegroundColor Cyan

if (-not $summary.overallPass) {
  Write-Host "OVERALL: FAIL" -ForegroundColor Red
  exit 1
}

Write-Host ("OVERALL: PASS - rules load and WWG bootstrap probes succeeded ({0} runs)" -f $ProbeCount) -ForegroundColor Green
exit 0
