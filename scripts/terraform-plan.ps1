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
  Write-Warning "No terraform.tfvars found at $TfVars. Trying runtime dry-run tfvars before falling back to validation only."
  $runtimeDir = Join-Path (Split-Path -Parent $TerraformDir) '.runtime'
  $runtimeTfVars = Join-Path $runtimeDir 'terraform.test.tfvars'
  if (-not (Test-Path -LiteralPath $runtimeTfVars)) {
    New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
    @'
vm_name           = "project-truth-node-01"
switch_name       = "ProjectTruth-Internal-Test"
switch_type       = "Internal"
net_adapter_names = []
source_image_path = "C:\\ProgramData\\BandaiApp\\Bnpipats\\images\\project-truth-node-latest.vhdx"
vm_path           = "C:\\ProgramData\\BandaiApp\\Bnpipats\\HyperV"
memory_mb         = 4096
cpu_count         = 2
guest_ip_hint     = ""
'@ | Set-Content -LiteralPath $runtimeTfVars -Encoding ASCII
  }
  terraform -chdir="$TerraformDir" plan -var-file="$runtimeTfVars"
}
