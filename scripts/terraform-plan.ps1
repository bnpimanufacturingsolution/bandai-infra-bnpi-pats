param(
  [string]$TerraformDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'terraform-hyperv'),
  [string]$TfVars = (Join-Path (Split-Path -Parent $PSScriptRoot) 'terraform-hyperv\terraform.tfvars')
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command terraform -ErrorAction SilentlyContinue)) {
  throw 'terraform not found in PATH.'
}

terraform -chdir="$TerraformDir" fmt -recursive
terraform -chdir="$TerraformDir" init
terraform -chdir="$TerraformDir" validate

if (Test-Path -LiteralPath $TfVars) {
  terraform -chdir="$TerraformDir" plan -var-file="$TfVars"
} else {
  Write-Warning "No terraform.tfvars found at $TfVars. Running validation only. Copy terraform.tfvars.example and set source_image_path before planning."
}
