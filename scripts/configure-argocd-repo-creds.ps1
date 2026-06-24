param(
  [Parameter(Mandatory = $true)][string]$GuestIp,
  [string]$User = 'infra',
  [string]$RepoUrlPrefix = 'https://github.com/hrisworkforcesystem-coder',
  [Parameter(Mandatory = $true)][string]$GitUsername,
  [Parameter(Mandatory = $true)][string]$GitToken
)

$ErrorActionPreference = 'Stop'

function To-Base64 {
  param([string]$Value)
  [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Value))
}

$type64 = To-Base64 'git'
$url64 = To-Base64 $RepoUrlPrefix
$username64 = To-Base64 $GitUsername
$password64 = To-Base64 $GitToken

$manifest = @"
apiVersion: v1
kind: Secret
metadata:
  name: project-truth-repo-creds
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: repo-creds
type: Opaque
data:
  type: $type64
  url: $url64
  username: $username64
  password: $password64
"@

$manifest64 = To-Base64 $manifest
$remote = "echo '$manifest64' | base64 -d | sudo kubectl apply -f - && sudo kubectl get secret project-truth-repo-creds -n argocd"
ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "$User@$GuestIp" $remote
if ($LASTEXITCODE -ne 0) {
  throw "Failed to configure Argo CD repository credentials."
}
