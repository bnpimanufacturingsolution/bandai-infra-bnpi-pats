param(
	[string]$Repo = "hrisworkforcesystem-coder/hris-app"
)

$ErrorActionPreference = "Stop"

function Write-Step {
	param([string]$Message)
	Write-Host ""
	Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-OK {
	param([string]$Message)
	Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn {
	param([string]$Message)
	Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Ensure-Command {
	param([string]$CommandName)
	if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
		throw "Missing required command: $CommandName"
	}
}

function Get-FirebaseConfig {
	$firebasercPath = Join-Path $projectRoot ".firebaserc"
	if (-not (Test-Path $firebasercPath)) {
		throw "Could not find .firebaserc at $firebasercPath"
	}

	$firebaserc = Get-Content -LiteralPath $firebasercPath -Raw | ConvertFrom-Json
	$devProject = [string]$firebaserc.projects.dev
	$uatProject = [string]$firebaserc.projects.uat
	$devSite = [string]$firebaserc.targets.$devProject.hosting.dev[0]
	$uatSite = [string]$firebaserc.targets.$uatProject.hosting.uat[0]

	return @{
		DevProject = $devProject
		UatProject = $uatProject
		DevSite = $devSite
		UatSite = $uatSite
	}
}

function Get-FirebasePublicTargets {
	$firebaseJsonPath = Join-Path $projectRoot "firebase.json"
	if (-not (Test-Path $firebaseJsonPath)) {
		throw "Could not find firebase.json at $firebaseJsonPath"
	}

	$firebaseJson = Get-Content -LiteralPath $firebaseJsonPath -Raw | ConvertFrom-Json
	$targets = @{}

	foreach ($hostingEntry in @($firebaseJson.hosting)) {
		if ($null -eq $hostingEntry) {
			continue
		}

		$targetName = [string]$hostingEntry.target
		$publicPath = [string]$hostingEntry.public
		if (-not [string]::IsNullOrWhiteSpace($targetName) -and -not [string]::IsNullOrWhiteSpace($publicPath)) {
			$targets[$targetName] = $publicPath
		}
	}

	return $targets
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

function Invoke-CliCommand {
	param(
		[string]$FilePath,
		[string[]]$Arguments,
		[string]$WorkingDirectory = ""
	)

	$psi = New-Object System.Diagnostics.ProcessStartInfo
	$psi.FileName = $FilePath
	$psi.RedirectStandardOutput = $true
	$psi.RedirectStandardError = $true
	$psi.UseShellExecute = $false
	$psi.CreateNoWindow = $false
	$psi.Arguments = Convert-ToProcessArgumentString -Arguments $Arguments
	if (-not [string]::IsNullOrWhiteSpace($WorkingDirectory)) {
		$psi.WorkingDirectory = $WorkingDirectory
	}

	$process = New-Object System.Diagnostics.Process
	$process.StartInfo = $psi
	$null = $process.Start()
	$stdout = $process.StandardOutput.ReadToEnd()
	$stderr = $process.StandardError.ReadToEnd()
	$process.WaitForExit()

	return @{
		ExitCode = $process.ExitCode
		StdOut = $stdout
		StdErr = $stderr
	}
}

function Get-FirebaseTokenFromLogin {
	param([string]$FirebaseCommand)

	Write-Step "Running firebase login:ci"
	Write-Host "Complete the browser login, then come back here. I'll capture the token from the CLI output if Firebase prints it." -ForegroundColor Yellow

	$result = Invoke-CliCommand -FilePath $FirebaseCommand -Arguments @("login:ci") -WorkingDirectory $projectRoot
	$output = @($result.StdOut, $result.StdErr) -join [Environment]::NewLine

	if ($result.ExitCode -ne 0) {
		if (-not [string]::IsNullOrWhiteSpace($output)) {
			Write-Warn $output.Trim()
		}
		throw "firebase login:ci failed."
	}

	$tokenMatch = [regex]::Match($output, '1//[A-Za-z0-9\-_]+')
	if ($tokenMatch.Success) {
		Write-OK "Captured Firebase CI token from CLI output"
		return $tokenMatch.Value
	}

	Write-Warn "Firebase CLI login succeeded, but no token was captured automatically."
	$entered = Read-Host "Paste the Firebase token"
	if ([string]::IsNullOrWhiteSpace($entered)) {
		throw "No Firebase token was provided."
	}

	return $entered.Trim()
}

function Test-FirebaseToken {
	param(
		[string]$FirebaseCommand,
		[string]$Token,
		[hashtable]$FirebaseConfig
	)

	Write-Step "Validating Firebase token"
	$result = Invoke-CliCommand -FilePath $FirebaseCommand -Arguments @("projects:list", "--token", $Token) -WorkingDirectory $projectRoot
	if ($result.ExitCode -ne 0) {
		$output = @($result.StdOut, $result.StdErr) -join [Environment]::NewLine
		if (-not [string]::IsNullOrWhiteSpace($output)) {
			Write-Warn $output.Trim()
		}
		throw "The Firebase token is not valid for CLI access."
	}

	Write-Step "Validating DEV Hosting access"
	$devResult = Invoke-CliCommand -FilePath $FirebaseCommand -Arguments @(
		"hosting:sites:list",
		"--project", $FirebaseConfig.DevProject,
		"--token", $Token
	) -WorkingDirectory $projectRoot
	if ($devResult.ExitCode -ne 0 -or $devResult.StdOut -notmatch [regex]::Escape($FirebaseConfig.DevSite)) {
		$output = @($devResult.StdOut, $devResult.StdErr) -join [Environment]::NewLine
		if (-not [string]::IsNullOrWhiteSpace($output)) {
			Write-Warn $output.Trim()
		}
		throw "The Firebase token could not access the DEV Hosting site $($FirebaseConfig.DevSite)."
	}

	Write-Step "Validating UAT Hosting access"
	$uatResult = Invoke-CliCommand -FilePath $FirebaseCommand -Arguments @(
		"hosting:sites:list",
		"--project", $FirebaseConfig.UatProject,
		"--token", $Token
	) -WorkingDirectory $projectRoot
	if ($uatResult.ExitCode -ne 0 -or $uatResult.StdOut -notmatch [regex]::Escape($FirebaseConfig.UatSite)) {
		$output = @($uatResult.StdOut, $uatResult.StdErr) -join [Environment]::NewLine
		if (-not [string]::IsNullOrWhiteSpace($output)) {
			Write-Warn $output.Trim()
		}
		throw "The Firebase token could not access the UAT Hosting site $($FirebaseConfig.UatSite)."
	}

	Write-OK "Firebase token validated for DEV and UAT Hosting"
}

function Test-FirebasePreviewDeploy {
	param(
		[string]$FirebaseCommand,
		[string]$Token,
		[string]$ProjectId,
		[string]$Target,
		[string]$PublicPath
	)

	$absolutePublicPath = Join-Path $projectRoot $PublicPath
	if (-not (Test-Path $absolutePublicPath)) {
		throw "Cannot preview-deploy target '$Target' because the public path does not exist: $absolutePublicPath"
	}

	$channelId = "codex-auth-check-$Target-" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

	try {
		Write-Step "Testing preview deploy for target '$Target' in project '$ProjectId'"
		$result = Invoke-CliCommand -FilePath $FirebaseCommand -Arguments @(
			"hosting:channel:deploy",
			$channelId,
			"--project", $ProjectId,
			"--only", $Target,
			"--expires", "1h",
			"--token", $Token,
			"--non-interactive"
		) -WorkingDirectory $projectRoot

		if ($result.ExitCode -ne 0) {
			$output = @($result.StdOut, $result.StdErr) -join [Environment]::NewLine
			if (-not [string]::IsNullOrWhiteSpace($output)) {
				Write-Warn $output.Trim()
			}
			throw "Preview deploy validation failed for target '$Target' in project '$ProjectId'."
		}

		Write-OK "Preview deploy validation passed for target '$Target'"
	}
	finally {
		$deleteResult = Invoke-CliCommand -FilePath $FirebaseCommand -Arguments @(
			"hosting:channel:delete",
			$channelId,
			"--project", $ProjectId,
			"--force",
			"--token", $Token,
			"--non-interactive"
		) -WorkingDirectory $projectRoot

		if ($deleteResult.ExitCode -eq 0) {
			Write-OK "Removed preview channel $channelId"
		}
	}
}

Ensure-Command "firebase"
Ensure-Command "gh"

$firebaseCommand = Resolve-NativeCommandPath "firebase"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$syncScript = Join-Path $projectRoot "scripts\setup-firebase-github-env.ps1"

if (-not (Test-Path $syncScript)) {
	throw "Could not find setup-firebase-github-env.ps1 at $syncScript"
}

$token = Get-FirebaseTokenFromLogin -FirebaseCommand $firebaseCommand
$firebaseConfig = Get-FirebaseConfig
$publicTargets = Get-FirebasePublicTargets
Test-FirebaseToken -FirebaseCommand $firebaseCommand -Token $token -FirebaseConfig $firebaseConfig
Test-FirebasePreviewDeploy -FirebaseCommand $firebaseCommand -Token $token -ProjectId $firebaseConfig.DevProject -Target "dev" -PublicPath $publicTargets["dev"]
Test-FirebasePreviewDeploy -FirebaseCommand $firebaseCommand -Token $token -ProjectId $firebaseConfig.UatProject -Target "uat" -PublicPath $publicTargets["uat"]

Write-Step "Syncing GitHub Firebase token secrets and variables"
& powershell.exe -File $syncScript `
	-Repo $Repo `
	-DevFirebaseToken $token `
	-UatFirebaseToken $token `
	-RemoveLegacy

if ($LASTEXITCODE -ne 0) {
	throw "Failed to sync GitHub Firebase config."
}

Write-Step "Done"
Write-Host "GitHub repo: $Repo" -ForegroundColor Green
