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

function Get-KustomizeImageTag {
  param(
    [string]$KustomizationText,
    [string]$ImageName
  )

  $pattern = "(?ms)^\s*-\s*name:\s*$([regex]::Escape($ImageName))\s*\r?\n\s*newTag:\s*([A-Za-z0-9._-]+)"
  $match = [regex]::Match($KustomizationText, $pattern)
  if (-not $match.Success) {
    throw "Self-heal contract failed: missing kustomize image tag for ${ImageName}"
  }
  $match.Groups[1].Value
}

function Get-EnvironmentRuntimeImageTag {
  param(
    [string]$EnvironmentPatchText,
    [string]$EnvName
  )

  $match = [regex]::Match($EnvironmentPatchText, '(?m)^\s*runtime_image_tag:\s*"?([A-Za-z0-9._-]+)"?\s*$')
  if (-not $match.Success) {
    throw "Self-heal contract failed: missing runtime_image_tag for ${EnvName}"
  }
  $match.Groups[1].Value
}

$checks = New-Object System.Collections.Generic.List[object]

foreach ($envName in $Environments) {
  $runtimeOverlay = "gitops/runtime-k8s/overlays/$envName"
  $rendered = Get-RenderedOverlay -Path $runtimeOverlay
  $runtimeKustomization = Get-Content -Raw "$runtimeOverlay/kustomization.yaml"
  $environmentPatch = Get-Content -Raw "gitops/overlays/$envName/environment-patch.yaml"
  $environmentRuntimeImageTag = Get-EnvironmentRuntimeImageTag -EnvironmentPatchText $environmentPatch -EnvName $envName

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

  foreach ($imageName in @('hris-api-db-init', 'hris-api-local', 'hris-app-local')) {
    $imageTag = Get-KustomizeImageTag -KustomizationText $runtimeKustomization -ImageName $imageName
    if ($imageTag -ne $environmentRuntimeImageTag) {
      throw "Self-heal contract failed: runtime_image_tag for ${envName} is ${environmentRuntimeImageTag}, but ${imageName} uses ${imageTag}"
    }
    $checks.Add((Assert-Text "runtime-$envName $imageName tag matches environment contract" "runtime_image_tag: $environmentRuntimeImageTag`nnewTag: $imageTag" '(?ms)runtime_image_tag:\s*([A-Za-z0-9._-]+).*newTag:\s*\1'))
    $checks.Add((Assert-Text "runtime-$envName renders $imageName tag from kustomization" $rendered "image:\s*$([regex]::Escape($imageName)):$([regex]::Escape($imageTag))"))
  }

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
$gitopsPullScript = Get-Content -Raw 'scripts/gitops-pull.ps1'
$vmPullScript = Get-Content -Raw 'scripts/vm-pull.ps1'
$vmGitCredsScript = Get-Content -Raw 'scripts/configure-vm-git-creds.ps1'
$bootstrapOnpremScript = Get-Content -Raw 'scripts/bootstrap-onprem-vm.sh'
$ansiblePullScript = Get-Content -Raw 'appliance/bin/project-truth-ansible-pull.sh'
$ansiblePullPlaybook = Get-Content -Raw 'ansible/project-truth-pull.yml'
$ansiblePullService = Get-Content -Raw 'appliance/systemd/project-truth-ansible-pull.service'
$ansiblePullTimer = Get-Content -Raw 'appliance/systemd/project-truth-ansible-pull.timer'
$osSyncScript = Get-Content -Raw 'appliance/bin/project-truth-os-sync.sh'
$osSyncService = Get-Content -Raw 'appliance/systemd/project-truth-os-sync.service'
$osSyncTimer = Get-Content -Raw 'appliance/systemd/project-truth-os-sync.timer'
$lanDhcpScript = Get-Content -Raw 'appliance/bin/project-truth-lan-dhcp.sh'
$lanSummaryScript = Get-Content -Raw 'appliance/bin/project-truth-lan-summary.sh'
$profileHelpScript = Get-Content -Raw 'appliance/profile.d/project-truth-hris-help.sh'
$imageProvisionScript = Get-Content -Raw 'image-factory/packer/provision.sh'
$promoteWorkflow = Get-Content -Raw '.github/workflows/promote-gitops.yml'
$platformConfig = Get-Content -Raw 'gitops/argocd/platform/argocd-cm.yaml'
$projectTruthScript = Get-Content -Raw 'scripts/project-truth.ps1'
$hypervVisualProofScript = Get-Content -Raw 'scripts/hyperv-visual-proof-loop.ps1'
$repoCredsScript = Get-Content -Raw 'scripts/configure-argocd-repo-creds.ps1'
$webhookScript = Get-Content -Raw 'scripts/configure-argocd-webhook.ps1'
$clientScalingDoc = Get-Content -Raw 'docs/GITOPS_CLIENT_ENV_SCALING.md'
$applicationSetTemplate = Get-Content -Raw 'gitops/argocd/applicationsets/project-truth-envs.example.yaml'

$checks.Add((Assert-Text 'enable-k8s-runtime stores image archive for K3s pre-import' $enableScript '/var/lib/rancher/k3s/agent/images/project-truth-k8s-runtime-images\.tar'))
$checks.Add((Assert-Text 'enable-k8s-runtime imports images into k8s.io namespace' $enableScript 'k3s ctr -n k8s\.io images import'))
$checks.Add((Assert-Text 'enable-k8s-runtime accepts promoted runtime image tag' $enableScript '\$ImageTag'))
$checks.Add((Assert-Text 'enable-k8s-runtime installs runtime apps into K3s auto-deploy dir' $enableScript '/var/lib/rancher/k3s/server/manifests'))
$checks.Add((Assert-Text 'repair-appliance-online persists app manifests into K3s auto-deploy dir' $repairScript '/var/lib/rancher/k3s/server/manifests'))
$checks.Add((Assert-Text 'repair-appliance-online reapplies Argo platform config' $repairScript 'project-truth-argocd-platform'))
$checks.Add((Assert-Text 'verify-gitops-state can require runtime Applications' $verifyScript 'RequireRuntimeApplications'))
$checks.Add((Assert-Text 'promote-gitops updates runtime image tag marker' $promoteWorkflow 'runtime_image_tag'))
$checks.Add((Assert-Text 'promote-gitops updates runtime kustomize image tags' $promoteWorkflow 'gitops/runtime-k8s/overlays/\$env_name/kustomization\.yaml'))
$checks.Add((Assert-Text 'promote-gitops supports optional registry image flow' $promoteWorkflow 'image_registry'))
$checks.Add((Assert-Text 'Argo platform declares reconciliation timeout' $platformConfig 'timeout\.reconciliation:\s*60s'))
$checks.Add((Assert-Text 'Argo platform declares reconciliation jitter' $platformConfig 'timeout\.reconciliation\.jitter:\s*15s'))
$checks.Add((Assert-Text 'project-truth exposes Argo platform command' $projectTruthScript 'apply-argocd-platform'))
$checks.Add((Assert-Text 'project-truth exposes one-command GitOps pull' $projectTruthScript 'gitops-pull'))
$checks.Add((Assert-Text 'gitops-pull hard-refreshes Argo apps' $gitopsPullScript 'argocd\.argoproj\.io/refresh=hard'))
$checks.Add((Assert-Text 'project-truth exposes one-command VM pull' $projectTruthScript 'vm-pull'))
$checks.Add((Assert-Text 'vm-pull installs VM-side ansible-pull' $vmPullScript 'project-truth-ansible-pull'))
$checks.Add((Assert-Text 'vm-pull can query VM-side OS sync status' $vmPullScript '\[switch\]\$Status'))
$checks.Add((Assert-Text 'vm-pull supports password fallback' $vmPullScript 'PROJECT_TRUTH_SSH_PASSWORD'))
$checks.Add((Assert-Text 'image build installs VM-side ansible-pull' $imageProvisionScript 'project-truth-ansible-pull\.sh'))
$checks.Add((Assert-Text 'image build installs ansible-pull timer' $imageProvisionScript 'project-truth-ansible-pull\.timer'))
$checks.Add((Assert-Text 'live bootstrap starts VM ansible-pull timer immediately' $bootstrapOnpremScript 'systemctl enable --now project-truth-ansible-pull\.timer'))
$checks.Add((Assert-Text 'live bootstrap re-arms VM ansible-pull timer immediately' $bootstrapOnpremScript 'systemctl restart project-truth-ansible-pull\.timer'))
$checks.Add((Assert-Text 'project-truth exposes VM Git credential command' $projectTruthScript 'configure-vm-git-creds'))
$checks.Add((Assert-Text 'VM Git credential command writes OS sync env file' $vmGitCredsScript '/etc/project-truth/os-sync\.env'))
$checks.Add((Assert-Text 'VM Git credential command restarts ansible-pull' $vmGitCredsScript 'project-truth-ansible-pull\.service'))
$checks.Add((Assert-Text 'VM Git credential command supports password fallback' $vmGitCredsScript 'PROJECT_TRUTH_SSH_PASSWORD'))
$checks.Add((Assert-Text 'ansible-pull wrapper pulls develop from repo' $ansiblePullScript 'PROJECT_TRUTH_BRANCH:-develop'))
$checks.Add((Assert-Text 'ansible-pull wrapper invokes ansible-pull' $ansiblePullScript 'ansible-pull'))
$checks.Add((Assert-Text 'ansible-pull wrapper preflights Git network before fetch' $ansiblePullScript 'repair_network_for_git'))
$checks.Add((Assert-Text 'ansible-pull wrapper repairs resolver drift before fetch' $ansiblePullScript 'systemd-resolved\.service'))
$checks.Add((Assert-Text 'ansible-pull wrapper repairs DHCP drift before fetch' $ansiblePullScript 'project-truth-lan-dhcp'))
$checks.Add((Assert-Text 'ansible-pull playbook updates install root' $ansiblePullPlaybook '/opt/project-truth'))
$checks.Add((Assert-Text 'ansible-pull playbook refreshes Argo apps after host sync' $ansiblePullPlaybook 'argocd\.argoproj\.io/refresh=hard'))
$checks.Add((Assert-Text 'ansible-pull playbook repairs CoreDNS upstreams' $ansiblePullPlaybook 'forward \. 1\.1\.1\.1 8\.8\.8\.8'))
$checks.Add((Assert-Text 'ansible-pull playbook releases stale retained runtime PV claim refs' $ansiblePullPlaybook 'kubectl patch pv "\$volume_name" --type=merge'))
$checks.Add((Assert-Text 'ansible-pull wrapper limits playbook to localhost inventory' $ansiblePullScript '-l localhost'))
$checks.Add((Assert-Text 'ansible-pull playbook reconciles LAN config' $ansiblePullPlaybook 'project-truth-lan-dhcp'))
$checks.Add((Assert-Text 'LAN reconciler persists static config' $lanDhcpScript '/etc/project-truth/lan\.env'))
$checks.Add((Assert-Text 'LAN reconciler supports static mode' $lanDhcpScript '--static'))
$checks.Add((Assert-Text 'LAN reconciler writes static netplan addresses' $lanDhcpScript 'addresses:'))
$checks.Add((Assert-Text 'ansible-pull wrapper exposes status command' $ansiblePullScript '--status\|status'))
$checks.Add((Assert-Text 'ansible-pull wrapper can reuse Argo repo credentials' $ansiblePullScript 'project-truth-repo-creds'))
$checks.Add((Assert-Text 'ansible-pull supports root-only credential env file' $ansiblePullService 'EnvironmentFile=-/etc/project-truth/os-sync\.env'))
$checks.Add((Assert-Text 'LAN summary reports last ansible-pull commit' $lanSummaryScript 'OS/Git sync'))
$checks.Add((Assert-Text 'LAN summary exposes ansible-pull command' $lanSummaryScript 'sudo project-truth-ansible-pull'))
$checks.Add((Assert-Text 'LAN summary exposes ansible-pull status command' $lanSummaryScript 'project-truth-ansible-pull --status'))
$checks.Add((Assert-Text 'login profile exposes ansible-pull command' $profileHelpScript 'sudo project-truth-ansible-pull'))
$checks.Add((Assert-Text 'login profile exposes ansible-pull status command' $profileHelpScript 'project-truth-ansible-pull --status'))
$checks.Add((Assert-Text 'ansible-pull timer has wall-clock fallback schedule' $ansiblePullTimer 'OnCalendar=\*:0/5'))
$checks.Add((Assert-Text 'ansible-pull timer reconciles repeatedly' $ansiblePullTimer 'OnUnitActiveSec=5min'))
$checks.Add((Assert-Text 'ansible-pull timer re-arms after failures' $ansiblePullTimer 'OnUnitInactiveSec=5min'))
$checks.Add((Assert-Text 'legacy OS sync remains available' $osSyncScript 'project-truth-os-sync'))
$checks.Add((Assert-Text 'legacy OS sync timer remains defined for stale images' $osSyncTimer 'OnCalendar=\*:0/5'))
$checks.Add((Assert-Text 'project-truth exposes Argo repo credential command' $projectTruthScript 'configure-argocd-repo-creds'))
$checks.Add((Assert-Text 'project-truth exposes Argo webhook command' $projectTruthScript 'configure-argocd-webhook'))
$checks.Add((Assert-Text 'Hyper-V visual proof supports pinned SSH host key' $hypervVisualProofScript '\[string\]\$HostKey'))
$checks.Add((Assert-Text 'Hyper-V visual proof passes host key to PuTTY tools' $hypervVisualProofScript "'-hostkey'"))
$checks.Add((Assert-Text 'repo credential script creates Argo repo-creds secret' $repoCredsScript 'argocd\.argoproj\.io/secret-type:\s*repo-creds'))
$checks.Add((Assert-Text 'webhook script configures GitHub webhook secret key' $webhookScript 'webhook\.github\.secret'))
$checks.Add((Assert-Text 'client scaling doc preserves dev uat prod shape' $clientScalingDoc 'gitops/clients/<client>/overlays/dev'))
$checks.Add((Assert-Text 'ApplicationSet template generates contract apps' $applicationSetTemplate 'name:\s*project-truth-env-contracts'))
$checks.Add((Assert-Text 'ApplicationSet template generates runtime apps' $applicationSetTemplate 'name:\s*project-truth-env-runtimes'))
$checks.Add((Assert-Text 'ApplicationSet template keeps contract overlay paths' $applicationSetTemplate 'contractPath:\s*gitops/overlays/dev'))
$checks.Add((Assert-Text 'ApplicationSet template keeps runtime overlay paths' $applicationSetTemplate 'runtimePath:\s*gitops/runtime-k8s/overlays/dev'))

$checks | Format-Table -AutoSize
Write-Host "Self-heal contract checks passed: $($checks.Count)"
