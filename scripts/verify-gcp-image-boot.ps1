param(
  [string]$ProjectId = 'hris-492904',
  [string]$Zone = 'asia-southeast1-a',
  [string]$ImageName = '',
  [string]$ImageFamily = 'project-truth-node',
  [string]$ImageProject = '',
  [string]$InstanceName = '',
  [string]$MachineType = 'e2-standard-4',
  [int]$DiskSizeGb = 60,
  [string]$DiskType = 'pd-balanced',
  [string]$SshUser = 'infra',
  [int]$BootWaitSeconds = 90,
  [int]$PollSeconds = 20,
  [int]$PollCount = 30,
  [string]$RuntimeDir = (Join-Path (Split-Path -Parent $PSScriptRoot) '.runtime\gcp-image-boot-proof'),
  [switch]$DisableDisplayDevice,
  [switch]$PreserveInstance,
  [switch]$DeleteOnSuccess
)

$ErrorActionPreference = 'Stop'

if (-not [System.IO.Path]::IsPathRooted($RuntimeDir)) {
  $RuntimeDir = Join-Path (Get-Location).Path $RuntimeDir
}
$RuntimeDir = [System.IO.Path]::GetFullPath($RuntimeDir)
New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
$script:LastGcloudExitCode = 0

function Invoke-Gcloud {
  param([string[]]$Arguments)

  $gcloud = Get-Command gcloud.cmd, gcloud -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $gcloud) {
    throw 'gcloud not found in PATH. Install Google Cloud SDK before verifying the Project Truth GCP image.'
  }

  $previousNativeErrorPreference = if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference
  } else {
    $null
  }
  try {
    if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
      $PSNativeCommandUseErrorActionPreference = $false
    }
    $ErrorActionPreference = 'Continue'
    & $gcloud.Source @Arguments 2>&1 | ForEach-Object {
      if ($_ -is [System.Management.Automation.ErrorRecord]) {
        $_.ToString()
      } else {
        $_
      }
    }
    $script:LastGcloudExitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
  } finally {
    if ($null -ne $previousNativeErrorPreference) {
      $PSNativeCommandUseErrorActionPreference = $previousNativeErrorPreference
    }
  }
}

function Invoke-GcloudChecked {
  param(
    [string]$Name,
    [string[]]$Arguments
  )

  $logPath = Join-Path $RuntimeDir "$Name.log"
  Write-Host "Running: gcloud $($Arguments -join ' ')"
  $script:LastGcloudExitCode = 0
  Invoke-Gcloud -Arguments $Arguments | Tee-Object -FilePath $logPath | Out-Host
  if ($script:LastGcloudExitCode -ne 0) {
    throw "gcloud $Name failed with exit code $($script:LastGcloudExitCode). Log: $logPath"
  }
}

function Save-GcloudOutput {
  param(
    [string]$Name,
    [string[]]$Arguments
  )

  $logPath = Join-Path $RuntimeDir "$Name.log"
  $script:LastGcloudExitCode = 0
  $output = @(Invoke-Gcloud -Arguments $Arguments)
  $output | Set-Content -LiteralPath $logPath -Encoding UTF8
  return $output
}

function Invoke-ProofSsh {
  param(
    [string]$Name,
    [string]$Command
  )

  $localScript = Join-Path $RuntimeDir "$Name.remote.sh"
  $remoteScript = "/tmp/project-truth-$Name.sh"
  $Command -replace "`r`n", "`n" |
    Set-Content -LiteralPath $localScript -Encoding ASCII -NoNewline

  Save-GcloudOutput -Name "$Name-scp" -Arguments @(
    'compute', 'scp', $localScript, "$SshUser@$InstanceName`:$remoteScript",
    '--project', $ProjectId,
    '--zone', $Zone,
    '--quiet'
  ) | Out-Null
  if ($script:LastGcloudExitCode -ne 0) {
    throw "gcloud compute scp failed with exit code $($script:LastGcloudExitCode). Log: $(Join-Path $RuntimeDir "$Name-scp.log")"
  }

  $sshArgs = @(
    'compute', 'ssh', "$SshUser@$InstanceName",
    '--project', $ProjectId,
    '--zone', $Zone,
    '--quiet',
    '--command', "bash $remoteScript; rc=`$?; rm -f $remoteScript; exit `$rc"
  )
  $output = Save-GcloudOutput -Name $Name -Arguments $sshArgs
  if ($script:LastGcloudExitCode -ne 0) {
    throw "gcloud compute ssh failed with exit code $($script:LastGcloudExitCode). Log: $(Join-Path $RuntimeDir "$Name.log")"
  }
  return $output
}

function Save-DisplayScreenshot {
  param([string]$Name)

  if ($DisableDisplayDevice) {
    return
  }

  Invoke-GcloudChecked -Name $Name -Arguments @(
    'compute', 'instances', 'get-screenshot', $InstanceName,
    '--project', $ProjectId,
    '--zone', $Zone,
    '--destination', (Join-Path $RuntimeDir "$Name.jpg")
  )
}

if ([string]::IsNullOrWhiteSpace($ImageProject)) {
  $ImageProject = $ProjectId
}

if ([string]::IsNullOrWhiteSpace($ImageName)) {
  $ImageName = (Save-GcloudOutput -Name 'resolve-image-family' -Arguments @(
    'compute', 'images', 'describe-from-family', $ImageFamily,
    '--project', $ImageProject,
    '--format', 'value(name)'
  ) | Select-Object -First 1).Trim()
}

if ([string]::IsNullOrWhiteSpace($ImageName)) {
  throw "Could not resolve an image. Pass -ImageName or ensure image family '$ImageFamily' exists in project '$ImageProject'."
}

if ([string]::IsNullOrWhiteSpace($InstanceName)) {
  $InstanceName = "project-truth-gcp-boot-proof-$([int][double]::Parse((Get-Date -UFormat %s)))"
}

@"
Timestamp: $(Get-Date -Format o)
Project: $ProjectId
Zone: $Zone
Image project: $ImageProject
Image: $ImageName
Instance: $InstanceName
Machine: $MachineType
Disk: $DiskSizeGb GB $DiskType
Display screenshot enabled: $(-not $DisableDisplayDevice)
Delete on successful proof: $DeleteOnSuccess
"@ | Set-Content -LiteralPath (Join-Path $RuntimeDir 'boot-proof-vars.txt') -Encoding UTF8

$created = $false
$proofSucceeded = $false
try {
  $existingStatus = ''
  if (-not [string]::IsNullOrWhiteSpace($InstanceName)) {
    $describeOutput = Save-GcloudOutput -Name 'describe-existing-proof-instance' -Arguments @(
      'compute', 'instances', 'describe', $InstanceName,
      '--project', $ProjectId,
      '--zone', $Zone,
      '--format', 'value(status)'
    )
    if ($script:LastGcloudExitCode -eq 0) {
      $existingStatus = ($describeOutput | Select-Object -First 1).Trim()
    }
  }

  $createArgs = @(
    'compute', 'instances', 'create', $InstanceName,
    '--project', $ProjectId,
    '--zone', $Zone,
    '--machine-type', $MachineType,
    '--boot-disk-size', "${DiskSizeGb}GB",
    '--boot-disk-type', $DiskType,
    '--image', $ImageName,
    '--image-project', $ImageProject,
    '--metadata', 'serial-port-enable=TRUE,enable-oslogin=FALSE',
    '--labels', 'app=project-truth,purpose=gcp-image-boot-proof',
    '--quiet'
  )
  if (-not $DisableDisplayDevice) {
    $createArgs += '--enable-display-device'
  }

  if ([string]::IsNullOrWhiteSpace($existingStatus)) {
    Invoke-GcloudChecked -Name 'create-proof-instance' -Arguments @(
      $createArgs
    )
    $created = $true
  } else {
    Write-Host "Reusing existing proof instance: $InstanceName status=$existingStatus"
    $created = $true
  }

  Write-Host "Waiting ${BootWaitSeconds}s for first boot services..."
  Start-Sleep -Seconds $BootWaitSeconds

  Save-GcloudOutput -Name 'serial-port-1-initial' -Arguments @(
    'compute', 'instances', 'get-serial-port-output', $InstanceName,
    '--project', $ProjectId,
    '--zone', $Zone,
    '--port', '1'
  ) | Out-Null

  Save-DisplayScreenshot -Name 'display-screenshot-initial'

  $remoteProof = @'
set -euo pipefail
lan_ip="$(ip route get 1.1.1.1 2>/dev/null | awk '{ for (i=1; i<=NF; i++) if ($i=="src") { print $(i+1); exit } }')"
echo "===== /etc/issue ====="
cat /etc/issue || true
echo "===== /etc/motd ====="
cat /etc/motd || true
echo "===== identity ====="
hostname
ip -br addr
echo "===== project truth summary ====="
project-truth-lan-summary || true
echo "===== services ====="
systemctl --no-pager --full --lines=40 status project-truth-firstboot-identity.service project-truth-lan-config.service project-truth-lan-summary.service project-truth-clean-console.service project-truth-hris.service || true
echo "===== k3s ====="
kubectl get nodes -o wide || true
kubectl get pods -A -o wide || true
echo "===== argocd ====="
kubectl get applications -A -o wide || true
kubectl get pods -n argocd -o wide || true
echo "===== docker ====="
docker compose -f /opt/project-truth/appliance/docker-compose.yml ps || true
docker compose -f /opt/project-truth/appliance/docker-compose.environments.yml ps || true
echo "===== endpoint probes ====="
failed=0
for url in \
  http://127.0.0.1:3001/health \
  http://127.0.0.1:3000/auth/login \
  http://127.0.0.1:3101/health \
  http://127.0.0.1:3100/auth/login \
  http://127.0.0.1:3201/health \
  http://127.0.0.1:3200/auth/login \
  http://127.0.0.1:53000/api/health; do
  echo "--- $url"
  ok=0
  for i in $(seq 1 30); do
    if curl -fsS --max-time 5 "$url"; then
      echo
      ok=1
      break
    fi
    sleep 10
  done
  if [ "$ok" -ne 1 ]; then
    echo "FAILED $url" >&2
    failed=1
  fi
done
echo "===== bridge target ====="
if [ -n "$lan_ip" ]; then
  echo "ZKTECO_WEBHOOK_URL=http://${lan_ip}:3001/api/zkteco/events"
else
  echo "ZKTECO_WEBHOOK_URL unavailable: no LAN IP detected"
  failed=1
fi
exit "$failed"
'@

  $sshSucceeded = $false
  $proofText = @()
  for ($attempt = 1; $attempt -le $PollCount; $attempt++) {
    try {
      Write-Host "SSH proof attempt ${attempt}/${PollCount}"
      Save-DisplayScreenshot -Name ("display-screenshot-attempt-{0:D2}-before-ssh" -f $attempt)
      $proofText = @(Invoke-ProofSsh -Name ("ssh-proof-{0:D2}" -f $attempt) -Command $remoteProof)
      $proofText | Out-Host
      Save-DisplayScreenshot -Name ("display-screenshot-attempt-{0:D2}-after-ssh" -f $attempt)
      $sshSucceeded = $true
      break
    } catch {
      Write-Warning $_.Exception.Message
      try {
        Save-DisplayScreenshot -Name ("display-screenshot-attempt-{0:D2}-failed" -f $attempt)
      } catch {
        Write-Warning "Could not capture failed-attempt screenshot: $($_.Exception.Message)"
      }
      if ($attempt -lt $PollCount) {
        Start-Sleep -Seconds $PollSeconds
      }
    }
  }

  Save-GcloudOutput -Name 'serial-port-1-final' -Arguments @(
    'compute', 'instances', 'get-serial-port-output', $InstanceName,
    '--project', $ProjectId,
    '--zone', $Zone,
    '--port', '1'
  ) | Out-Null

  Save-DisplayScreenshot -Name 'display-screenshot-final'

  if (-not $sshSucceeded) {
    throw "Boot proof VM was created, but SSH proof did not complete after $PollCount attempts. Serial output is in $RuntimeDir."
  }

  $proofSucceeded = $true
  Write-Host ''
  Write-Host 'PROVEN: Project Truth GCP image boots as a fresh Compute Engine VM.'
  Write-Host "Image: $ImageName"
  Write-Host "Proof logs: $RuntimeDir"
} finally {
  if ($created -and -not $proofSucceeded) {
    Write-Host "Preserved failed proof VM for inspection: $InstanceName"
  } elseif ($created -and $DeleteOnSuccess -and -not $PreserveInstance) {
    Write-Host "Deleting proof VM: $InstanceName"
    Invoke-Gcloud -Arguments @('compute', 'instances', 'delete', $InstanceName, '--project', $ProjectId, '--zone', $Zone, '--quiet') | Out-Host
  } elseif ($created) {
    Write-Host "Preserved proof VM: $InstanceName"
  }
}
