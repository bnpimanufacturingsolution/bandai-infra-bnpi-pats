param(
  [switch]$Apply,
  [string]$TerraformDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'terraform-hyperv'),
  [string]$TfVars = (Join-Path (Split-Path -Parent $PSScriptRoot) 'terraform-hyperv\terraform.tfvars')
)

$ErrorActionPreference = 'Stop'

if (-not $Apply) {
  Write-Host 'Safety gate: terraform apply requires -Apply.'
  & "$PSScriptRoot\terraform-plan.ps1" -TerraformDir $TerraformDir -TfVars $TfVars
  exit 0
}

if (-not (Test-Path -LiteralPath $TfVars)) {
  throw "terraform.tfvars not found: $TfVars"
}

terraform -chdir="$TerraformDir" apply -var-file="$TfVars"
