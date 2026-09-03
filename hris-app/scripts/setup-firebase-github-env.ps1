param(
	[string]$Repo = "hrisworkforcesystem-coder/hris-app",
	[string]$DevBaseUrl = "",
	[string]$UatBaseUrl = "",
	[string]$DevCloudinaryPath = "",
	[string]$UatCloudinaryPath = "",
	[string]$DevServiceAccountJsonPath = "",
	[string]$UatServiceAccountJsonPath = ""
)

$ErrorActionPreference = "Stop"
$script:GitHubCommand = $null

function Write-Step {
	param([string]$Message)
	Write-Host ""
	Write-Host "==> $Message" -ForegroundColor Cyan
}

function Ensure-Command {
	param([string]$CommandName)
	if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
		throw "Missing required command: $CommandName"
	}
}

function Resolve-NativeCommandPath {
	param([string]$CommandName)

	$command = Get-Command $CommandName -ErrorAction SilentlyContinue
	if (-not $command) {
		throw "Missing required command: $CommandName"
	}

	$source = $command.Source
	if ([string]::IsNullOrWhiteSpace($source)) {
		return $CommandName
	}

	$extension = [System.IO.Path]::GetExtension($source)
	if ($extension -ieq ".ps1") {
		$cmdPath = [System.IO.Path]::ChangeExtension($source, ".cmd")
		if (Test-Path $cmdPath) {
			return $cmdPath
		}

		$batPath = [System.IO.Path]::ChangeExtension($source, ".bat")
		if (Test-Path $batPath) {
			return $batPath
		}
	}

	return $source
}

function Convert-ToProcessArgumentString {
	param([string[]]$Arguments)

	if (-not $Arguments -or $Arguments.Count -eq 0) {
		return ""
	}

	$escaped = foreach ($argument in $Arguments) {
		if ($null -eq $argument) {
			'""'
			continue
		}

		$value = [string]$argument
		if ($value -match '[\s"]') {
			'"' + ($value -replace '(\\*)"', '$1$1\"') + '"'
		} else {
			$value
		}
	}

	return ($escaped -join " ")
}

function Invoke-GitHubCli {
	param([string[]]$Arguments)

	$psi = New-Object System.Diagnostics.ProcessStartInfo
	$psi.FileName = $script:GitHubCommand
	$psi.RedirectStandardOutput = $true
	$psi.RedirectStandardError = $true
	$psi.RedirectStandardInput = $true
	$psi.UseShellExecute = $false
	$psi.CreateNoWindow = $true
	$psi.Arguments = Convert-ToProcessArgumentString -Arguments $Arguments

	$process = New-Object System.Diagnostics.Process
	$process.StartInfo = $psi
	$null = $process.Start()
	return $process
}

function Get-FirebaseProjects {
	$firebasercPath = Join-Path $PSScriptRoot "..\.firebaserc"
	if (-not (Test-Path $firebasercPath)) {
		throw "Could not find .firebaserc at $firebasercPath"
	}

	$firebaserc = Get-Content -LiteralPath $firebasercPath -Raw | ConvertFrom-Json
	return @{
		Default = [string]$firebaserc.projects.default
		Dev = [string]$firebaserc.projects.dev
		Uat = [string]$firebaserc.projects.uat
	}
}

function Get-EnvValueFromFile {
	param(
		[string]$Path,
		[string]$Key
	)

	if (-not (Test-Path $Path)) {
		return ""
	}

	$match = Select-String -Path $Path -Pattern "^\s*$Key\s*=\s*(.*)\s*$" | Select-Object -First 1
	if (-not $match) {
		return ""
	}

	$value = [string]$match.Matches[0].Groups[1].Value
	$value = $value.Trim()
	if ($value.StartsWith('"') -and $value.EndsWith('"')) {
		$value = $value.Substring(1, $value.Length - 2)
	}
	return $value
}

function Set-GitHubVariable {
	param(
		[string]$Name,
		[string]$Value
	)

	if ([string]::IsNullOrWhiteSpace($Value)) {
		Write-Host "Skipping variable $Name because value is empty." -ForegroundColor Yellow
		return
	}

	Write-Host "Setting variable $Name" -ForegroundColor Green
	$process = Invoke-GitHubCli -Arguments @("variable", "set", $Name, "--repo", $Repo, "--body", $Value)
	$stdout = $process.StandardOutput.ReadToEnd()
	$stderr = $process.StandardError.ReadToEnd()
	$process.WaitForExit()
	if ($process.ExitCode -ne 0) {
		if (-not [string]::IsNullOrWhiteSpace($stderr)) {
			Write-Host $stderr.Trim() -ForegroundColor Yellow
		}
		throw "Failed to set GitHub variable $Name"
	}
}

function Set-GitHubSecretFromValue {
	param(
		[string]$Name,
		[string]$Value
	)

	if ([string]::IsNullOrWhiteSpace($Value)) {
		Write-Host "Skipping secret $Name because value is empty." -ForegroundColor Yellow
		return
	}

	Write-Host "Setting secret $Name" -ForegroundColor Green
	$process = Invoke-GitHubCli -Arguments @("secret", "set", $Name, "--repo", $Repo, "--body", "-")
	$process.StandardInput.Write($Value)
	$process.StandardInput.Close()
	$stdout = $process.StandardOutput.ReadToEnd()
	$stderr = $process.StandardError.ReadToEnd()
	$process.WaitForExit()
	if ($process.ExitCode -ne 0) {
		if (-not [string]::IsNullOrWhiteSpace($stderr)) {
			Write-Host $stderr.Trim() -ForegroundColor Yellow
		}
		throw "Failed to set GitHub secret $Name"
	}
}

function Set-GitHubSecretFromFile {
	param(
		[string]$Name,
		[string]$Path
	)

	if ([string]::IsNullOrWhiteSpace($Path)) {
		Write-Host "Skipping secret $Name because no file path was provided." -ForegroundColor Yellow
		return
	}

	if (-not (Test-Path $Path)) {
		throw "Secret file not found: $Path"
	}

	Write-Host "Setting secret $Name from file" -ForegroundColor Green
	$process = Invoke-GitHubCli -Arguments @("secret", "set", $Name, "--repo", $Repo, "--body-file", $Path)
	$stdout = $process.StandardOutput.ReadToEnd()
	$stderr = $process.StandardError.ReadToEnd()
	$process.WaitForExit()
	if ($process.ExitCode -ne 0) {
		if (-not [string]::IsNullOrWhiteSpace($stderr)) {
			Write-Host $stderr.Trim() -ForegroundColor Yellow
		}
		throw "Failed to set GitHub secret $Name from file"
	}
}

Ensure-Command "gh"
$script:GitHubCommand = Resolve-NativeCommandPath "gh"

Write-Step "Reading Firebase aliases from .firebaserc"
$projects = Get-FirebaseProjects
Write-Host "DEV project: $($projects.Dev)"
Write-Host "UAT project: $($projects.Uat)"

$frontendEnvPath = Join-Path $PSScriptRoot "..\.env"

if ([string]::IsNullOrWhiteSpace($DevBaseUrl)) {
	$DevBaseUrl = Get-EnvValueFromFile -Path $frontendEnvPath -Key "VITE_API_BASE_URL"
}

if ([string]::IsNullOrWhiteSpace($UatBaseUrl)) {
	$UatBaseUrl = ""
}

Write-Step "Resolved values"
$resolvedDevBaseUrl = if ([string]::IsNullOrWhiteSpace($DevBaseUrl)) { "(missing)" } else { $DevBaseUrl }
$resolvedUatBaseUrl = if ([string]::IsNullOrWhiteSpace($UatBaseUrl)) { "(missing)" } else { $UatBaseUrl }
$resolvedDevCloudinaryPath = if ([string]::IsNullOrWhiteSpace($DevCloudinaryPath)) { "(not provided)" } else { $DevCloudinaryPath }
$resolvedUatCloudinaryPath = if ([string]::IsNullOrWhiteSpace($UatCloudinaryPath)) { "(not provided)" } else { $UatCloudinaryPath }

Write-Host "VITE_API_BASE_URL_DEV: $resolvedDevBaseUrl"
Write-Host "VITE_API_BASE_URL_UAT: $resolvedUatBaseUrl"
Write-Host "VITE_CLOUDINARY_PATH_DEV: $resolvedDevCloudinaryPath"
Write-Host "VITE_CLOUDINARY_PATH_UAT: $resolvedUatCloudinaryPath"

Write-Step "Setting GitHub variables"
Set-GitHubVariable -Name "FIREBASE_PROJECT_ID_DEV" -Value $projects.Dev
Set-GitHubVariable -Name "FIREBASE_PROJECT_ID_UAT" -Value $projects.Uat
Set-GitHubVariable -Name "VITE_API_BASE_URL_DEV" -Value $DevBaseUrl
Set-GitHubVariable -Name "VITE_API_BASE_URL_UAT" -Value $UatBaseUrl

Write-Step "Setting GitHub secrets from provided values"
Set-GitHubSecretFromValue -Name "VITE_CLOUDINARY_PATH_DEV" -Value $DevCloudinaryPath
Set-GitHubSecretFromValue -Name "VITE_CLOUDINARY_PATH_UAT" -Value $UatCloudinaryPath

Write-Step "Setting Firebase service account secrets from JSON files"
Set-GitHubSecretFromFile -Name "FIREBASE_SERVICE_ACCOUNT_HRIS_APP_DEV" -Path $DevServiceAccountJsonPath
Set-GitHubSecretFromFile -Name "FIREBASE_SERVICE_ACCOUNT_UAT" -Path $UatServiceAccountJsonPath

Write-Step "Done"
Write-Host "GitHub repository: $Repo" -ForegroundColor Green
