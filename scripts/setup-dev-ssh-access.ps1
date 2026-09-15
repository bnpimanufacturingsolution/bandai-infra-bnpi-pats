<#
.SYNOPSIS
	One-time workstation onboarding for local bnpi-pats-api dev (SSH key + ssh config).

.DESCRIPTION
	Makes `npm run dev` work on a brand-new Windows workstation without manual
	SSH ceremony. Ensures, in order:

	  1. An SSH key pair at %USERPROFILE%\.ssh\node-health-appliance_ed25519
		 (generates a new one only when missing; never silently overwrites).
	  2. %USERPROFILE%\.ssh\config entry "Host project-truth-lan" for direct
		 LAN SSH to infra@10.184.37.19 and "Host project-truth-bnpi-pats" (Cloudflare
		 Access SSH via the cloudflared ProxyCommand).
	  3. The matching public key installed into the VM infra user's
		 authorized_keys. LAN-first; when the LAN is unreachable it falls back
		 to the Cloudflare SSH alias, which triggers a Cloudflare Access browser
		 sign-in (use the 1bis.solutions.tech account) and then one interactive
		 infra password prompt to authorize the new key.
	  4. End-to-end verification: BatchMode ssh whoami/hostname.

	Idempotent: safe to re-run; already-done steps are skipped. Prompts can be
	auto-accepted with -AcceptDefaults. -VerifyOnly performs a read-only check.

.EXAMPLE
	powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-dev-ssh-access.ps1
#>
param(
	[switch]$AcceptDefaults,
	[switch]$ForceKeyRegen,
	[switch]$VerifyOnly
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runRoot = Join-Path $repoRoot ".runtime\dev-ssh-setup-$stamp"
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

$sshDir = Join-Path $env:USERPROFILE '.ssh'
$keyPath = if ($env:PROJECT_TRUTH_SSH_KEY) { $env:PROJECT_TRUTH_SSH_KEY } else { Join-Path $sshDir 'node-health-appliance_ed25519' }
$pubPath = "$keyPath.pub"
$configPath = Join-Path $sshDir 'config'
$lanHost = '10.184.37.19'
$lanUser = 'infra'
$aliasName = 'project-truth-bnpi-pats'
$aliasHostName = 'ssh.bnpi-pats.tech'
$cloudflaredCandidates = @(
	"${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe",
	"$env:ProgramFiles\cloudflared\cloudflared.exe",
	"$env:LOCALAPPDATA\cloudflared\cloudflared.exe"
)

function Write-Step { param([string]$Message) Write-Host "[dev-ssh-setup] $Message" }
function Write-WarnLine { param([string]$Message) Write-Host "[dev-ssh-setup] WARNING: $Message" -ForegroundColor Yellow }
function Write-ErrLine { param([string]$Message) Write-Host "[dev-ssh-setup] ERROR: $Message" -ForegroundColor Red }

function Test-Interactive {
	if ($AcceptDefaults) { return $false }
	if ($env:BNPI_PATS_PREDEV_NONINTERACTIVE -eq 'true') { return $false }
	if ([Console]::IsInputRedirected) { return $false }
	return [Environment]::UserInteractive
}

function Read-Choice {
	param(
		[string]$Prompt,
		[bool]$DefaultYes = $true
	)
	if (-not (Test-Interactive)) { return $DefaultYes }
	$suffix = if ($DefaultYes) { '[Y/n]' } else { '[y/N]' }
	$answer = Read-Host "$Prompt $suffix"
	if ([string]::IsNullOrWhiteSpace($answer)) { return $DefaultYes }
	return ($answer -match '^(y|yes)$')
}

function Test-TcpOpen {
	param([string]$HostName, [int]$Port, [int]$TimeoutMs = 1500)
	try {
		$client = [System.Net.Sockets.TcpClient]::new()
		$async = $client.BeginConnect($HostName, $Port, $null, $null)
		if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) { $client.Close(); return $false }
		$client.EndConnect($async)
		$client.Close()
		return $true
	} catch { return $false }
}

function Find-SshExe {
	$cmd = Get-Command ssh.exe -ErrorAction SilentlyContinue
	if ($cmd) { return $cmd.Source }
	return $null
}

function Find-Cloudflared {
	foreach ($candidate in $cloudflaredCandidates) {
		if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
	}
	$cmd = Get-Command cloudflared.exe -ErrorAction SilentlyContinue
	if ($cmd) { return $cmd.Source }
	return $null
}

function Ensure-SshDir {
	if (-not (Test-Path -LiteralPath $sshDir)) {
		New-Item -ItemType Directory -Path $sshDir | Out-Null
		Write-Step "Created $sshDir"
	}
}

function Ensure-DevKey {
	if ((Test-Path -LiteralPath $keyPath) -and (Test-Path -LiteralPath $pubPath)) {
		if ($ForceKeyRegen) {
			if (-not (Read-Choice "Replace existing key $keyPath with a NEW key pair? (old key loses VM access until reinstalled)" $false)) {
				Write-Step 'Keeping the existing key pair.'
				return $true
			}
			Remove-Item -LiteralPath $keyPath -Force
			Remove-Item -LiteralPath $pubPath -Force
		} else {
			Write-Step "SSH key already present: $keyPath"
			return $true
		}
	}
	if ((Test-Path -LiteralPath $keyPath) -and -not (Test-Path -LiteralPath $pubPath)) {
		# Recover the public half from the private key instead of regenerating.
		$pub = & ssh-keygen.exe -y -f $keyPath 2>$null
		if ($LASTEXITCODE -eq 0 -and $pub) {
			($pub.Trim() + " project-truth-dev-recovered") | Set-Content -LiteralPath $pubPath -Encoding ascii
			Write-Step "Recovered missing public key from private key: $pubPath"
			return $true
		}
		Write-WarnLine "Private key exists at $keyPath but is unreadable/corrupt; regenerating is required."
		if (-not (Read-Choice "Generate a NEW key pair at $keyPath? (unreadable old key will be replaced)" $true)) { return $false }
		Move-Item -LiteralPath $keyPath -Destination "$keyPath.invalid-$stamp" -Force
	}

	$comment = "$env:USERNAME@$env:COMPUTERNAME project-truth-dev-$stamp"
	Write-Step "Generating new SSH key pair: $keyPath"
	& ssh-keygen.exe -q -t ed25519 -f $keyPath -N '""' -C $comment
	if ($LASTEXITCODE -ne 0) { throw "ssh-keygen failed (exit $LASTEXITCODE)." }
	# Windows OpenSSH refuses broad-ACL private keys; restrict to the current user.
	& icacls.exe $keyPath /inheritance:r /grant:r "$env:USERNAME:F" | Out-Null
	Write-Step "Created key pair (public key: $pubPath)"
	return $true
}

function Get-ConfigBlock {
	param([string]$CloudflaredPath)
	$identity = $keyPath -replace '\\', '/'
	$lanBlock = @"

Host project-truth-lan
  HostName $lanHost
  User $lanUser
  IdentityFile $identity
  IdentitiesOnly yes
"@
	$aliasBlock = ''
	if ($CloudflaredPath) {
		$aliasBlock = @"

Host $aliasName
  HostName $aliasHostName
  User $lanUser
  IdentityFile $identity
  IdentitiesOnly yes
  ProxyCommand "$CloudflaredPath" access ssh --hostname %h
"@
	}
	return ($lanBlock + $aliasBlock)
}

function Ensure-SshConfig {
	param([string]$CloudflaredPath)
	$existing = if (Test-Path -LiteralPath $configPath) { Get-Content -Raw -LiteralPath $configPath } else { '' }
	$needsLan = $existing -notmatch 'Host\s+project-truth-lan\b'
	$needsAlias = $existing -notmatch ("Host\s+" + [regex]::Escape($aliasName) + "\b")
	if (-not $needsLan -and (-not $needsAlias -or -not $CloudflaredPath)) {
		Write-Step 'ssh config already has the Project Truth host entries.'
		return
	}
	if ($needsAlias -and -not $CloudflaredPath) {
		Write-WarnLine 'cloudflared not found; skipping the project-truth-bnpi-pats (Cloudflare) config entry. LAN SSH will still work.'
	}
	if (Test-Path -LiteralPath $configPath) {
		Copy-Item -LiteralPath $configPath -Destination "$configPath.bak-$stamp" -Force
		Write-Step "Backed up existing ssh config to $configPath.bak-$stamp"
	}
	$block = Get-ConfigBlock -CloudflaredPath $CloudflaredPath
	Add-Content -LiteralPath $configPath -Value $block -Encoding ascii
	if ($needsLan) { Write-Step 'Added Host project-truth-lan to ssh config.' }
	if ($needsAlias -and $CloudflaredPath) { Write-Step "Added Host $aliasName (Cloudflare Access SSH) to ssh config." }
}

function Invoke-SshInstall {
	param([string]$Target, [string]$InstallCommand)
	$sshArguments = @(
		'-o', 'ConnectTimeout=15',
		'-o', 'StrictHostKeyChecking=accept-new',
		'-o', 'PubkeyAuthentication=no',
		'-o', 'PreferredAuthentications=password,keyboard-interactive'
	)
	$output = & ssh.exe @sshArguments $Target $InstallCommand 2>&1
	$exit = $LASTEXITCODE
	$output | Set-Content -LiteralPath (Join-Path $runRoot "install-$($Target -replace '[^a-zA-Z0-9_-]', '_').txt") -Encoding utf8
	if ($output) { $output | ForEach-Object { Write-Host "[dev-ssh-setup]   $_" } }
	return $exit
}

function Install-PubKeyOnVm {
	param([string]$Mode)
	$pubLine = (Get-Content -LiteralPath $pubPath | Select-Object -First 1).Trim()
	$installCommand = "mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && grep -qxF '$pubLine' ~/.ssh/authorized_keys 2>/dev/null || echo '$pubLine' >> ~/.ssh/authorized_keys; echo KEY_INSTALLED"
	$target = if ($Mode -eq 'alias') { $aliasName } else { "${lanUser}@${lanHost}" }
	Write-Step "Installing public key on ${target} (mode=$Mode)..."
	if ($Mode -eq 'alias') {
		Write-Host '[dev-ssh-setup] A browser window may open for Cloudflare Access sign-in -- use the 1bis.solutions.tech account, then return here.' -ForegroundColor Cyan
	}
	if (Test-Interactive) {
		Write-Host '[dev-ssh-setup] If prompted, enter the VM infra password once (nothing is stored).' -ForegroundColor Cyan
	}
	$exit = Invoke-SshInstall -Target $target -InstallCommand $installCommand
	if ($exit -ne 0) { throw "Public key install failed via ${target} (ssh exit $exit)." }
	Write-Step "Public key installed on ${target}."
}

function Test-DevSshReady {
	param([string]$Mode)
	$target = if ($Mode -eq 'alias') { $aliasName } else { "${lanUser}@${lanHost}" }
	$sshArguments = @('-o', 'ConnectTimeout=12', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'BatchMode=yes')
	if ($Mode -eq 'lan') {
		# Direct LAN auth must not depend on the ssh config block.
		$sshArguments = @('-i', $keyPath, '-o', 'IdentitiesOnly=yes') + $sshArguments
	}
	$output = & ssh.exe @sshArguments $target 'echo SSH_OK; whoami; hostname' 2>&1
	$exit = $LASTEXITCODE
	$output | Set-Content -LiteralPath (Join-Path $runRoot "verify-$Mode.txt") -Encoding utf8
	return ($exit -eq 0 -and (($output -join "`n") -match 'SSH_OK'))
}

function Show-ManualFallback {
	$pubLine = if (Test-Path -LiteralPath $pubPath) { (Get-Content -LiteralPath $pubPath | Select-Object -First 1).Trim() } else { '<public key not generated yet>' }
	Write-Host ''
	Write-Host '[dev-ssh-setup] Manual fallback -- ask the operator to run this ONE command (on any machine already SSH-authorized):' -ForegroundColor Cyan
	Write-Host "  ssh -i `%USERPROFILE%\.ssh\node-health-appliance_ed25519 ${lanUser}@${lanHost} `"mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '<PUBKEY>' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`"" -ForegroundColor White
	Write-Host "  <PUBKEY> = $pubLine" -ForegroundColor White
	Write-Host ''
}

# ---------------------------------------------------------------- main

Write-Host ''
Write-Host '=== Project Truth dev workstation onboarding (SSH + DEV DB access) ===' -ForegroundColor Cyan
Write-Step "Repo: $repoRoot"
Write-Step "Key target: $keyPath"

Ensure-SshDir

$sshExe = Find-SshExe
if (-not $sshExe) {
	Write-ErrLine 'OpenSSH client (ssh.exe) not found. Install it via: Settings > Apps > Optional Features > OpenSSH Client, or:'
	Write-ErrLine '  Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0'
	exit 1
}
Write-Step "ssh.exe: $sshExe"

$lanOpen = Test-TcpOpen -HostName $lanHost -Port 22 -TimeoutMs 1500
$lanText = if ($lanOpen) { 'yes' } else { 'no (Cloudflare path will be used)' }
Write-Step "LAN ${lanHost}:22 reachable: $lanText"

$cloudflared = Find-Cloudflared
if ($cloudflared) {
	Write-Step "cloudflared: $cloudflared"
} elseif (-not $lanOpen) {
	Write-Step 'cloudflared not found and LAN is unreachable. cloudflared is required for the Cloudflare SSH path.'
	if ((Get-Command winget.exe -ErrorAction SilentlyContinue) -and (Read-Choice 'Install cloudflared now with winget (silent)? (also needed for the 1bis.solutions.tech Access sign-in)' $true)) {
		& winget.exe install --id Cloudflare.cloudflared -e --silent --accept-source-agreements --accept-package-agreements
		$cloudflared = Find-Cloudflared
	}
	if (-not $cloudflared) {
		Write-WarnLine 'cloudflared is still missing. Install it, then re-run this script:'
		Write-Host '  winget install --id Cloudflare.cloudflared -e' -ForegroundColor White
		Write-Host '  https://developers.cloudflare.com/cloudflare/one/connections/connect-networks/downloads/' -ForegroundColor White
	}
}

if ($VerifyOnly) {
	$okLan = $false; $okAlias = $false
	if ($lanOpen) { $okLan = Test-DevSshReady -Mode 'lan' }
	$okAlias = Test-DevSshReady -Mode 'alias'
	$lanText = if ($okLan) { 'OK' } elseif (-not $lanOpen) { 'skipped (LAN unreachable)' } else { 'FAILED' }
	$aliasText = if ($okAlias) { 'OK' } else { 'FAILED' }
	Write-Host ''
	Write-Step "Verify LAN SSH: $lanText"
	Write-Step "Verify Cloudflare alias SSH: $aliasText"
	Write-Step "Run evidence: $runRoot"
	if ($okLan -or $okAlias) { exit 0 } else { exit 2 }
}

if (-not (Ensure-DevKey)) {
	Write-ErrLine 'Setup cancelled: no SSH key available. Re-run when ready.'
	exit 2
}

Ensure-SshConfig -CloudflaredPath $cloudflared

# Already authorized? BatchMode key auth without any prompt.
$alreadyReady = $false
if ($lanOpen) { $alreadyReady = Test-DevSshReady -Mode 'lan' }
if (-not $alreadyReady) { $alreadyReady = Test-DevSshReady -Mode 'alias' }

if ($alreadyReady) {
	Write-Step 'SSH key is ALREADY authorized on the VM. No install needed.'
} else {
	$installed = $false
	if ($lanOpen) {
		try { Install-PubKeyOnVm -Mode 'lan'; $installed = $true } catch { Write-WarnLine "LAN install failed: $($_.Exception.Message)" }
	}
	if (-not $installed -and $cloudflared) {
		try { Install-PubKeyOnVm -Mode 'alias'; $installed = $true } catch { Write-WarnLine "Cloudflare install failed: $($_.Exception.Message)" }
	}
	if (-not $installed) {
		Show-ManualFallback
		Write-ErrLine 'Could not install the public key automatically. Use the manual fallback above, then re-run this script.'
		exit 3
	}
	# Re-verify with the new key.
	$verified = $false
	if ($lanOpen) { $verified = Test-DevSshReady -Mode 'lan' }
	if (-not $verified) { $verified = Test-DevSshReady -Mode 'alias' }
	if (-not $verified) {
		Show-ManualFallback
		Write-ErrLine 'Key was installed but BatchMode verification failed. Use the manual fallback above if this persists.'
		exit 3
	}
}

Write-Host ''
Write-Host '=== SSH onboarding complete ===' -ForegroundColor Green
Write-Step 'Next: npm run dev (inside bnpi-pats-api). The DEV DB forward starts automatically.'
Write-Step "Run evidence: $runRoot"
exit 0
