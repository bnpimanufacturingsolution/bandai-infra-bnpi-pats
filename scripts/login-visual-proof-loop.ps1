[CmdletBinding()]
param(
  [string]$VmName = 'project-truth-final-vbox-proof',
  [string]$Username = 'infra',
  [string]$Password = 'infra',
  [int]$WaitSeconds = 10,
  [int]$MaxPasses = 3,
  [ValidateSet('None','Reboot','PowerOffStart','Reset')]
  [string]$ResetMode = 'None',
  [string]$GuestIp = '',
  [switch]$PatchLiveGuest,
  [string]$ProofRoot = '.runtime\login-visual-proof'
)

$ErrorActionPreference = 'Stop'

function Write-Step {
  param([string]$Message)
  Write-Host ("{0} {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message)
}

function Resolve-VBoxManage {
  $command = Get-Command VBoxManage -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $default = Join-Path $env:ProgramFiles 'Oracle\VirtualBox\VBoxManage.exe'
  if (Test-Path -LiteralPath $default) {
    return $default
  }

  throw 'VBoxManage not found. Install VirtualBox or add VBoxManage to PATH.'
}

function Invoke-VBox {
  param([string[]]$Arguments)
  & $script:VBox @Arguments
  return $LASTEXITCODE
}

function Save-Screenshot {
  param(
    [string]$Path,
    [string]$Label
  )
  Write-Step "Capturing $Label -> $Path"
  $code = Invoke-VBox -Arguments @('controlvm', $VmName, 'screenshotpng', $Path)
  if ($code -ne 0) {
    throw "Screenshot failed with exit code $code"
  }
}

function Get-VMState {
  $info = & $script:VBox showvminfo $VmName --machinereadable
  $stateLine = $info | Where-Object { $_ -like 'VMState=*' } | Select-Object -First 1
  if (-not $stateLine) {
    return ''
  }
  return ($stateLine -replace '^VMState="?', '' -replace '"$', '')
}

function Ensure-VMRunning {
  $state = Get-VMState
  if ($state -eq 'running') {
    return
  }

  Write-Step "Starting VM $VmName from state '$state'"
  $code = Invoke-VBox -Arguments @('startvm', $VmName, '--type', 'gui')
  if ($code -ne 0) {
    throw "startvm failed with exit code $code"
  }
}

function Invoke-VMReset {
  if ($ResetMode -eq 'None') {
    return
  }

  Write-Step "Applying VM reset mode: $ResetMode"
  if ($ResetMode -eq 'Reboot') {
    Invoke-VBox -Arguments @('controlvm', $VmName, 'keyboardputscancode', '1d', '38', '53', 'd3', 'b8', '9d') | Out-Null
    return
  }

  if ($ResetMode -eq 'Reset') {
    Invoke-VBox -Arguments @('controlvm', $VmName, 'reset') | Out-Null
    return
  }

  if ($ResetMode -eq 'PowerOffStart') {
    Invoke-VBox -Arguments @('controlvm', $VmName, 'poweroff') | Out-Null
    Start-Sleep -Seconds 3
    Invoke-VBox -Arguments @('startvm', $VmName, '--type', 'gui') | Out-Null
  }
}

function Try-PatchLiveGuest {
  param([string]$RunRoot)

  if (-not $PatchLiveGuest) {
    'PatchLiveGuest not requested.' | Set-Content -LiteralPath (Join-Path $RunRoot 'live-patch.txt')
    return
  }

  $log = Join-Path $RunRoot 'live-patch.txt'
  Write-Step 'Attempting live guest patch through VirtualBox guestcontrol'

  $files = @(
    @{
      Source = (Resolve-Path 'appliance\bin\project-truth-lan-summary.sh').Path
      Temp = '/tmp/project-truth-lan-summary.sh'
      Target = '/usr/local/bin/project-truth-lan-summary'
      Mode = '0755'
    },
    @{
      Source = (Resolve-Path 'appliance\profile.d\project-truth-hris-help.sh').Path
      Temp = '/tmp/project-truth-hris-help.sh'
      Target = '/etc/profile.d/project-truth-hris-help.sh'
      Mode = '0644'
    }
  )

  try {
    foreach ($file in $files) {
      & $script:VBox guestcontrol $VmName copyto $file.Source $file.Temp --username $Username --password $Password 2>&1 |
        Tee-Object -FilePath $log -Append
      if ($LASTEXITCODE -ne 0) {
        throw "guestcontrol copyto failed for $($file.Source)"
      }

      $install = "printf '%s\n' '$Password' | sudo -S install -m $($file.Mode) $($file.Temp) $($file.Target)"
      & $script:VBox guestcontrol $VmName run --username $Username --password $Password -- /bin/bash -lc $install 2>&1 |
        Tee-Object -FilePath $log -Append
      if ($LASTEXITCODE -ne 0) {
        throw "guestcontrol install failed for $($file.Target)"
      }
    }

    $refresh = "printf '%s\n' '$Password' | sudo -S systemctl restart project-truth-lan-summary.service; printf '%s\n' '$Password' | sudo -S project-truth-lan-summary"
    & $script:VBox guestcontrol $VmName run --username $Username --password $Password -- /bin/bash -lc $refresh 2>&1 |
      Tee-Object -FilePath $log -Append
  } catch {
    "BLOCKED: live guest patch failed: $($_.Exception.Message)" | Tee-Object -FilePath $log -Append
  }
}

function Save-EndpointProof {
  param([string]$RunRoot)

  if (-not $GuestIp) {
    'GuestIp not provided; endpoint proof skipped.' | Set-Content -LiteralPath (Join-Path $RunRoot 'endpoint-proof.txt')
    return
  }

  $targets = @(
    "PROD http://$GuestIp`:3001/health",
    "DEV http://$GuestIp`:3101/health",
    "UAT http://$GuestIp`:3201/health",
    "Grafana http://$GuestIp`:53000/api/health",
    "Prometheus http://$GuestIp`:9091/-/ready",
    "Loki http://$GuestIp`:3110/ready"
  )

  $out = Join-Path $RunRoot 'endpoint-proof.txt'
  foreach ($target in $targets) {
    $name, $url = $target -split ' ', 2
    "===== $name $url =====" | Tee-Object -FilePath $out -Append
    try {
      curl.exe -i --max-time 8 $url 2>&1 | Tee-Object -FilePath $out -Append
    } catch {
      "ERROR: $($_.Exception.Message)" | Tee-Object -FilePath $out -Append
    }
    '' | Tee-Object -FilePath $out -Append
  }
}

$script:VBox = Resolve-VBoxManage
$resolvedProofRoot = Join-Path (Resolve-Path '.').Path $ProofRoot
New-Item -ItemType Directory -Force -Path $resolvedProofRoot | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runRoot = Join-Path $resolvedProofRoot $stamp
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
Set-Content -LiteralPath (Join-Path $resolvedProofRoot 'LATEST.txt') -Value $runRoot

Write-Step "Proof root: $runRoot"
Write-Step "WaitSeconds=$WaitSeconds MaxPasses=$MaxPasses ResetMode=$ResetMode PatchLiveGuest=$($PatchLiveGuest.IsPresent)"

Ensure-VMRunning
Try-PatchLiveGuest -RunRoot $runRoot

for ($pass = 1; $pass -le $MaxPasses; $pass++) {
  $passRoot = Join-Path $runRoot ("pass-{0:00}" -f $pass)
  New-Item -ItemType Directory -Force -Path $passRoot | Out-Null

  Invoke-VMReset
  Start-Sleep -Seconds $WaitSeconds
  Save-Screenshot -Path (Join-Path $passRoot 'screen-plus-10s.png') -Label "pass $pass after $WaitSeconds seconds"

  & $script:VBox showvminfo $VmName --machinereadable | Set-Content -LiteralPath (Join-Path $passRoot 'vbox-showvminfo.txt')
  Save-EndpointProof -RunRoot $passRoot
}

@"
VISUAL PROOF LOOP COMPLETE
Run root: $runRoot

Agent verdict rules:
- Open every pass-*/screen-plus-10s.png.
- PASS only if the visible login/help text is clean, line-broken, and includes PROD/DEV/UAT plus Grafana/Prometheus/Loki.
- FAIL if text is jammed, shows literal \n, omits observability URLs, or is only a status command after login.
- If PatchLiveGuest failed because guestcontrol is unavailable, rebuild the image or patch by console/SSH, then rerun this loop.
"@ | Tee-Object -FilePath (Join-Path $runRoot 'VERDICT_RULES.txt')
