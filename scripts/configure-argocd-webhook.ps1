param(
  [Parameter(Mandatory = $true)][string]$GuestIp,
  [string]$User = 'infra',
  [Parameter(Mandatory = $true)][string]$WebhookSecret
)

$ErrorActionPreference = 'Stop'

$secret64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($WebhookSecret))
$patch = "{`"data`":{`"webhook.github.secret`":`"$secret64`"}}"
$patch64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($patch))

$remote = "patch_json=`$(echo '$patch64' | base64 -d); sudo kubectl patch secret argocd-secret -n argocd --type merge -p `"`$patch_json`" && sudo kubectl get secret argocd-secret -n argocd"
ssh -o BatchMode=yes -o ConnectTimeout=10 "$User@$GuestIp" $remote
if ($LASTEXITCODE -ne 0) {
  throw "Failed to configure Argo CD GitHub webhook secret."
}
