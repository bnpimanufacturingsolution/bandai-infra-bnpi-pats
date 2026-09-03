param(
  [string]$GuestIp = '',
  [string]$User = 'infra',
  [string]$ConfigPath = "$env:ProgramData\ProjectTruth\config\project-truth.json"
)

$ErrorActionPreference = 'Stop'

function Get-Config {
  if (-not (Test-Path -LiteralPath $ConfigPath)) {
    return $null
  }

  try {
    return Get-Content -Raw -LiteralPath $ConfigPath | ConvertFrom-Json
  } catch {
    Write-Warning "Could not read Project Truth config at ${ConfigPath}: $($_.Exception.Message)"
    return $null
  }
}

function Get-ConfiguredApps {
  param($Config)

  $apps = New-Object System.Collections.Generic.List[string]

  if ($Config -and $Config.gitops) {
    foreach ($app in @($Config.gitops.applications)) {
      if (-not [string]::IsNullOrWhiteSpace($app)) {
        $apps.Add($app)
      }
    }
    foreach ($app in @($Config.gitops.runtimeApplications)) {
      if (-not [string]::IsNullOrWhiteSpace($app)) {
        $apps.Add($app)
      }
    }
  }

  if ($apps.Count -eq 0) {
    foreach ($app in @(
      'project-truth-dev',
      'project-truth-uat',
      'project-truth-prod',
      'project-truth-runtime-dev',
      'project-truth-runtime-uat',
      'project-truth-runtime-prod'
    )) {
      $apps.Add($app)
    }
  }

  $apps | Select-Object -Unique
}

function Resolve-GuestIp {
  param($Config)

  if (-not [string]::IsNullOrWhiteSpace($GuestIp)) {
    return $GuestIp
  }

  if (-not [string]::IsNullOrWhiteSpace($env:PROJECT_TRUTH_GUEST_IP)) {
    return $env:PROJECT_TRUTH_GUEST_IP
  }

  foreach ($hint in @($Config.hyperv.guestIpHint, $Config.virtualbox.guestIpHint)) {
    if (-not [string]::IsNullOrWhiteSpace($hint)) {
      return $hint
    }
  }

  $vmName = $Config.hyperv.vmName
  if (-not [string]::IsNullOrWhiteSpace($vmName) -and (Get-Command Get-VMNetworkAdapter -ErrorAction SilentlyContinue)) {
    $addresses = @(Get-VMNetworkAdapter -VMName $vmName -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty IPAddresses -ErrorAction SilentlyContinue |
      Where-Object { $_ -match '^\d{1,3}(\.\d{1,3}){3}$' -and $_ -notmatch '^169\.254\.' -and $_ -ne '127.0.0.1' })

    if ($addresses.Count -gt 0) {
      return $addresses[0]
    }
  }

  throw "Could not resolve VM IP. Re-run with -GuestIp <vm-lan-ip>, set PROJECT_TRUTH_GUEST_IP, or save guestIpHint with configure."
}

$config = Get-Config
$targetIp = Resolve-GuestIp -Config $config
$apps = @(Get-ConfiguredApps -Config $config)
$appList = ($apps -join ' ')
$runRoot = Join-Path (Join-Path (Split-Path -Parent $PSScriptRoot) '.runtime\gitops-pull') (Get-Date -Format 'yyyyMMdd-HHmmss')
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

$remote = @"
set -e
echo "Project Truth GitOps pull: hard-refreshing Argo CD applications."
for app in $appList; do
  if sudo kubectl get application -n argocd "`$app" >/dev/null 2>&1; then
    sudo kubectl -n argocd annotate application "`$app" argocd.argoproj.io/refresh=hard --overwrite
  else
    echo "missing: `$app"
  fi
done
echo
sudo kubectl get applications -n argocd -o wide
"@

$localScript = Join-Path $runRoot 'gitops-pull.sh'
$remoteScript = "/tmp/project-truth-gitops-pull-$([System.Diagnostics.Process]::GetCurrentProcess().Id).sh"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$normalizedRemote = ($remote -replace "`r`n", "`n") -replace "`r", "`n"
[System.IO.File]::WriteAllText($localScript, ($normalizedRemote.TrimEnd() + "`n"), $utf8NoBom)
scp -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 $localScript "${User}@${targetIp}:${remoteScript}" | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "GitOps pull failed: could not stage remote script on ${targetIp}."
}
ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "$User@$targetIp" "chmod 700 '$remoteScript' && bash '$remoteScript'; rc=`$?; rm -f '$remoteScript'; exit `$rc"
if ($LASTEXITCODE -ne 0) {
  throw "GitOps pull failed against ${targetIp}."
}
