param(
  [string[]]$Environments = @('dev', 'uat', 'prod')
)

$ErrorActionPreference = 'Stop'

function Assert-Text {
  param(
    [string]$Name,
    [string]$Text,
    [string]$Pattern
  )

  if ($Text -notmatch $Pattern) {
    throw "Self-heal contract failed: ${Name} did not match pattern: ${Pattern}"
  }
  [pscustomobject]@{ Check = $Name; Status = 'PASS' }
}

function Get-RenderedOverlay {
  param([string]$Path)

  $rendered = kubectl kustomize $Path 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to render ${Path}: $($rendered | Out-String)"
  }
  ($rendered | Out-String)
}

$checks = New-Object System.Collections.Generic.List[object]

foreach ($envName in $Environments) {
  $runtimeOverlay = "gitops/runtime-k8s/overlays/$envName"
  $rendered = Get-RenderedOverlay -Path $runtimeOverlay

  $expectedAppPort = switch ($envName) {
    'prod' { 3000 }
    'dev' { 3100 }
    'uat' { 3200 }
    default { throw "Unsupported environment: $envName" }
  }
  $expectedApiPort = $expectedAppPort + 1
  $expectedPostgresPort = switch ($envName) {
    'prod' { 15432 }
    'dev' { 15433 }
    'uat' { 15434 }
  }

  $checks.Add((Assert-Text "runtime-$envName has hris-api Deployment" $rendered '(?ms)^kind:\s*Deployment.*?name:\s*hris-api'))
  $checks.Add((Assert-Text "runtime-$envName has hris-app Deployment" $rendered '(?ms)^kind:\s*Deployment.*?name:\s*hris-app'))
  $checks.Add((Assert-Text "runtime-$envName has hris-postgres StatefulSet" $rendered '(?ms)^kind:\s*StatefulSet.*?name:\s*hris-postgres'))
  $checks.Add((Assert-Text "runtime-$envName has db init Job" $rendered '(?ms)^kind:\s*Job.*?name:\s*hris-api-db-init'))
  $checks.Add((Assert-Text "runtime-$envName uses local image policy" $rendered 'imagePullPolicy:\s*Never'))
  $checks.Add((Assert-Text "runtime-$envName has readiness probes" $rendered 'readinessProbe:'))
  $checks.Add((Assert-Text "runtime-$envName has liveness probes" $rendered 'livenessProbe:'))
  $checks.Add((Assert-Text "runtime-$envName has retained hostPath persistence" $rendered '(?ms)persistentVolumeReclaimPolicy:\s*Retain.*?hostPath:'))
  $checks.Add((Assert-Text "runtime-$envName exposes app hostPort" $rendered "hostPort:\s*$expectedAppPort"))
  $checks.Add((Assert-Text "runtime-$envName exposes api hostPort" $rendered "hostPort:\s*$expectedApiPort"))
  $checks.Add((Assert-Text "runtime-$envName exposes postgres hostPort" $rendered "hostPort:\s*$expectedPostgresPort"))

  $runtimeApplication = Get-Content -Raw "gitops/argocd/runtime-applications/project-truth-runtime-$envName.yaml"
  $checks.Add((Assert-Text "runtime-$envName Argo app points at runtime overlay" $runtimeApplication "path:\s*gitops/runtime-k8s/overlays/$envName"))
  $checks.Add((Assert-Text "runtime-$envName Argo app auto-sync enabled" $runtimeApplication 'enabled:\s*true'))
  $checks.Add((Assert-Text "runtime-$envName Argo app self-heals" $runtimeApplication 'selfHeal:\s*true'))
  $checks.Add((Assert-Text "runtime-$envName Argo app prunes" $runtimeApplication 'prune:\s*true'))
  $checks.Add((Assert-Text "runtime-$envName Argo app retries" $runtimeApplication '(?ms)retry:\s*\r?\n\s*limit:\s*5'))

  $contractApplication = Get-Content -Raw "gitops/argocd/applications/project-truth-$envName.yaml"
  $checks.Add((Assert-Text "contract-$envName Argo app self-heals" $contractApplication 'selfHeal:\s*true'))
  $checks.Add((Assert-Text "contract-$envName Argo app retries" $contractApplication '(?ms)retry:\s*\r?\n\s*limit:\s*5'))
}

$enableScript = Get-Content -Raw 'scripts/enable-k8s-runtime.ps1'
$repairScript = Get-Content -Raw 'scripts/repair-appliance-online.ps1'
$verifyScript = Get-Content -Raw 'scripts/verify-gitops-state.ps1'

$checks.Add((Assert-Text 'enable-k8s-runtime stores image archive for K3s pre-import' $enableScript '/var/lib/rancher/k3s/agent/images/project-truth-k8s-runtime-images\.tar'))
$checks.Add((Assert-Text 'enable-k8s-runtime imports images into k8s.io namespace' $enableScript 'k3s ctr -n k8s\.io images import'))
$checks.Add((Assert-Text 'enable-k8s-runtime installs runtime apps into K3s auto-deploy dir' $enableScript '/var/lib/rancher/k3s/server/manifests'))
$checks.Add((Assert-Text 'repair-appliance-online persists app manifests into K3s auto-deploy dir' $repairScript '/var/lib/rancher/k3s/server/manifests'))
$checks.Add((Assert-Text 'verify-gitops-state can require runtime Applications' $verifyScript 'RequireRuntimeApplications'))

$checks | Format-Table -AutoSize
Write-Host "Self-heal contract checks passed: $($checks.Count)"
