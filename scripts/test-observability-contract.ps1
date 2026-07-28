[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$checks = 0

function Assert-Contract {
  param(
    [Parameter(Mandatory)]
    [bool]$Condition,
    [Parameter(Mandatory)]
    [string]$Message
  )

  if (-not $Condition) {
    throw "Observability contract failed: $Message"
  }
  $script:checks++
}

function Read-RepoFile {
  param([Parameter(Mandatory)][string]$RelativePath)
  return Get-Content -Raw -LiteralPath (Join-Path $repoRoot $RelativePath)
}

$compose = Read-RepoFile 'hris-api/infrastructure/onprem/observability/docker-compose.yml'
Assert-Contract ($compose -match '(?s)blackbox-exporter:.*?extra_hosts:.*?host\.docker\.internal:host-gateway') 'blackbox exporter must resolve the VM host gateway'

$prometheus = Read-RepoFile 'hris-api/infrastructure/onprem/observability/prometheus/prometheus.yml'
foreach ($staleTarget in @('hris-api-dev:3001', 'hris-api-uat:3001', 'hris-app-dev:3000', 'hris-app-uat:3000', 'host.docker.internal:58001')) {
  Assert-Contract (-not $prometheus.Contains($staleTarget)) "stale target remains: $staleTarget"
}
foreach ($environment in @('prod', 'dev', 'uat')) {
  Assert-Contract ($prometheus -match "environment:\s+$environment") "Prometheus target label missing for $environment"
}
foreach ($port in @(3000, 3001, 3100, 3101, 3200, 3201, 3300, 3310, 3320)) {
  Assert-Contract ($prometheus.Contains("host.docker.internal:$port")) "blackbox/API target missing for port $port"
}

$alerts = Read-RepoFile 'hris-api/infrastructure/onprem/observability/prometheus/alerts.yml'
Assert-Contract (-not $alerts.Contains('increase(container_start_time_seconds')) 'container start-time gauge must not be treated as a restart counter'

$promtail = Read-RepoFile 'hris-api/infrastructure/onprem/observability/promtail/promtail-config.yml'
Assert-Contract ($promtail -match "(?s)source:\s+environment\s+template:\s+'\{\{ \.namespace \}\}'") 'K3s namespace must be copied into the environment log label'

foreach ($environment in @('prod', 'dev', 'uat')) {
  $runtime = Read-RepoFile "gitops/runtime-k8s/overlays/$environment/runtime.yaml"
  Assert-Contract ($runtime -match '(?s)- name: OTEL_ENABLED\s+value: "true"') "OTEL must be enabled in $environment"
  Assert-Contract ($runtime.Contains("value: hris-api-$environment")) "OTEL service name missing in $environment"
  Assert-Contract ($runtime.Contains('value: http://10.184.37.19:4318/v1/traces')) "OTLP trace endpoint missing in $environment"
  Assert-Contract ($runtime.Contains("value: deployment.environment=$environment,service.namespace=hris")) "OTEL resource attributes missing in $environment"
}

$dashboardRoot = 'hris-api/infrastructure/onprem/observability/grafana/provisioning-prod/dashboards'
$apiDashboardText = Read-RepoFile "$dashboardRoot/grafana-dashboard-api-health.json"
$apiDashboard = $apiDashboardText | ConvertFrom-Json
Assert-Contract (-not ($apiDashboardText -match '"color"\s*:\s*\{\s*"mode"\s*:\s*"auto"')) 'Grafana 11 rejects auto field color mode'
Assert-Contract (@($apiDashboard.templating.list | Where-Object name -eq 'environment').Count -eq 1) 'API dashboard environment variable missing'
$apiExpressions = @($apiDashboard.panels.targets.expr | Where-Object { $_ })
Assert-Contract (@($apiExpressions | Where-Object { $_ -notmatch 'environment=~' }).Count -eq 0) 'every API panel query must filter by environment'

$overviewText = Read-RepoFile "$dashboardRoot/hris-observability-overview.json"
$overview = $overviewText | ConvertFrom-Json
Assert-Contract (-not $overviewText.Contains('image!=\"\"')) 'overview must not require the absent cAdvisor image label'
Assert-Contract ($overviewText.Contains('cri-containerd-')) 'overview must select leaf containerd cgroups'
Assert-Contract (@($overview.panels.targets.expr | Where-Object { $_ -match 'container_(cpu|memory)' }).Count -eq 4) 'overview container panels must remain queryable'

$logsText = Read-RepoFile "$dashboardRoot/hris-container-logs.json"
$logs = $logsText | ConvertFrom-Json
Assert-Contract (@($logs.templating.list | Where-Object name -eq 'environment').Count -eq 1) 'logs dashboard environment variable missing'
Assert-Contract ($logsText.Contains('environment=~\"$environment\"')) 'logs query must filter by environment'

Write-Output "Observability contract passed: $checks checks"
