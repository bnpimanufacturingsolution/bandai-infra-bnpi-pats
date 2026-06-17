[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$HostName,

  [Parameter(Mandatory = $true)]
  [string]$UserName,

  [Parameter(Mandatory = $true)]
  [string]$RemotePath,

  [string]$Branch = "develop",
  [string]$DeploySha = "",
  [int]$Port = 22,
  [string]$SshKeyPath = "",
  [string]$Password = "",
  [string]$HostKeyFingerprint = "",
  [string]$PlinkPath = "",
  [string]$LocalEnvFilePath = "",
  [switch]$SyncSource,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' is not installed or not in PATH."
  }
}

function Run-Step {
  param([string]$CommandLine)
  Write-Host ">> $CommandLine"
  if (-not $DryRun) {
    Invoke-Expression $CommandLine
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code $LASTEXITCODE"
    }
  }
}

function Escape-ShellArg {
  param([string]$Value)
  return "'" + ($Value -replace "'", "'\\''") + "'"
}

Assert-Command -Name "git"

$usingPasswordAuth = -not [string]::IsNullOrWhiteSpace($Password)
$usePoshSsh = $false
$usePlink = $false
$resolvedPlinkPath = ""

if ($usingPasswordAuth) {
  if (-not $DryRun -and (Get-Module -ListAvailable Posh-SSH)) {
    Import-Module Posh-SSH -ErrorAction Stop
    $usePoshSsh = $true
  }

  if (-not $usePoshSsh) {
    if ($PlinkPath) {
      if (-not (Test-Path -LiteralPath $PlinkPath)) {
        throw "Plink not found at -PlinkPath '$PlinkPath'."
      }
      $resolvedPlinkPath = (Resolve-Path -LiteralPath $PlinkPath).Path
      $usePlink = $true
    }
    else {
      $plinkCmd = Get-Command plink -ErrorAction SilentlyContinue
      if ($plinkCmd) {
        $resolvedPlinkPath = $plinkCmd.Source
        $usePlink = $true
      }
    }
  }

  if (-not $usePoshSsh -and -not $usePlink -and -not $DryRun) {
    throw "Password auth requires 'Posh-SSH' module or plink.exe (-PlinkPath)."
  }
}
else {
  Assert-Command -Name "ssh"
  Assert-Command -Name "scp"
}

$repoRoot = (git rev-parse --show-toplevel).Trim()
if (-not $repoRoot) {
  throw "Could not resolve git repository root. Run this script inside the hris-api repository."
}

Set-Location $repoRoot

if ([string]::IsNullOrWhiteSpace($DeploySha)) {
  $DeploySha = (git rev-parse HEAD).Trim()
}

if (-not ($Branch -match "^[A-Za-z0-9._/-]+$")) {
  throw "Invalid branch value '$Branch'."
}

if (-not ($DeploySha -match "^[A-Fa-f0-9]{7,40}$")) {
  throw "Invalid deploy SHA '$DeploySha'."
}

if ($SshKeyPath -and -not (Test-Path -LiteralPath $SshKeyPath)) {
  throw "SSH key file not found: $SshKeyPath"
}

if ($LocalEnvFilePath -and -not (Test-Path -LiteralPath $LocalEnvFilePath)) {
  throw "Env file not found: $LocalEnvFilePath"
}

if ($usingPasswordAuth -and $SshKeyPath) {
  throw "Use either -Password or -SshKeyPath, not both."
}

if ($usePlink -and [string]::IsNullOrWhiteSpace($HostKeyFingerprint)) {
  throw "When using plink password mode, set -HostKeyFingerprint (example: ssh-ed25519 255 SHA256:...)."
}

$sshBase = @("-p", "$Port")
$scpBase = @("-P", "$Port")

if ($SshKeyPath) {
  $sshBase += @("-i", $SshKeyPath)
  $scpBase += @("-i", $SshKeyPath)
}

$sshTarget = "$UserName@$HostName"

function Invoke-RemoteShCommand {
  param(
    [string]$Command
  )

  if ($usingPasswordAuth) {
    if ($usePlink) {
      Write-Host ">> [plink] $Command"
      if (-not $DryRun) {
        & $resolvedPlinkPath -batch -ssh -P $Port -l $UserName -pw $Password -hostkey $HostKeyFingerprint $HostName $Command
        if ($LASTEXITCODE -ne 0) {
          throw "Remote command failed with exit code $LASTEXITCODE"
        }
      }
      return
    }

    Write-Host ">> [posh-ssh] $Command"
    if (-not $DryRun) {
      $secure = ConvertTo-SecureString -String $Password -AsPlainText -Force
      $credential = New-Object System.Management.Automation.PSCredential ($UserName, $secure)
      $session = New-SSHSession -ComputerName $HostName -Credential $credential -Port $Port -AcceptKey -ErrorAction Stop
      try {
        $result = Invoke-SSHCommand -SessionId $session.SessionId -Command $Command -ErrorAction Stop
        if ($result.Output) { $result.Output | ForEach-Object { Write-Host $_ } }
        if ($result.Error) { $result.Error | ForEach-Object { Write-Host $_ } }
        if ($result.ExitStatus -ne 0) {
          throw "Remote command failed with exit status $($result.ExitStatus)"
        }
      }
      finally {
        Remove-SSHSession -SessionId $session.SessionId | Out-Null
      }
    }
  }
  else {
    $commandBytes = [System.Text.Encoding]::UTF8.GetBytes($Command)
    $commandB64 = [Convert]::ToBase64String($commandBytes)
    $remoteExec = "printf %s {0} | base64 -d | bash" -f (Escape-ShellArg $commandB64)
    $sshPreview = "ssh {0} {1} {2}" -f ($sshBase -join " "), $sshTarget, $remoteExec
    Write-Host ">> $sshPreview"
    Write-Host ">> [remote] $Command"
    if (-not $DryRun) {
      & ssh @sshBase $sshTarget $remoteExec
      if ($LASTEXITCODE -ne 0) {
        throw "Remote command failed with exit code $LASTEXITCODE"
      }
    }
  }
}

function Copy-FileToRemote {
  param(
    [string]$LocalPath,
    [string]$RemotePathFile
  )

  if ($usingPasswordAuth) {
    if ($usePlink) {
      throw "Copy operations with password auth require Posh-SSH. For plink mode, skip -SyncSource and -LocalEnvFilePath."
    }
    Write-Host ">> [posh-ssh scp] $LocalPath -> $RemotePathFile"
    if (-not $DryRun) {
      $secure = ConvertTo-SecureString -String $Password -AsPlainText -Force
      $credential = New-Object System.Management.Automation.PSCredential ($UserName, $secure)
      $session = New-SFTPSession -ComputerName $HostName -Credential $credential -Port $Port -AcceptKey -ErrorAction Stop
      try {
        Set-SFTPFile -SessionId $session.SessionId -LocalFile $LocalPath -RemotePath $RemotePathFile -Overwrite -ErrorAction Stop
      }
      finally {
        Remove-SFTPSession -SessionId $session.SessionId | Out-Null
      }
    }
  }
  else {
    $scpPreview = "scp {0} {1} {2}:{3}" -f ($scpBase -join " "), $LocalPath, $sshTarget, $RemotePathFile
    Write-Host ">> $scpPreview"
    if (-not $DryRun) {
      & scp @scpBase $LocalPath "${sshTarget}:$RemotePathFile"
      if ($LASTEXITCODE -ne 0) {
        throw "Copy command failed with exit code $LASTEXITCODE"
      }
    }
  }
}

if ($SyncSource) {
  $tempArchive = Join-Path ([System.IO.Path]::GetTempPath()) ("hris-src-{0}.tar" -f ([Guid]::NewGuid().ToString("N")))
  Write-Host ">> git archive --format=tar --output `"$tempArchive`" $DeploySha"
  if (-not $DryRun) {
    & git archive --format=tar --output $tempArchive $DeploySha
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code $LASTEXITCODE"
    }
  }
  try {
    Copy-FileToRemote -LocalPath $tempArchive -RemotePathFile "/tmp/hris-src.tar"
    Invoke-RemoteShCommand -Command ("mkdir -p {0} && tar -xf /tmp/hris-src.tar -C {0} && rm -f /tmp/hris-src.tar" -f (Escape-ShellArg $RemotePath))
  }
  finally {
    if (-not $DryRun -and (Test-Path -LiteralPath $tempArchive)) {
      Remove-Item -LiteralPath $tempArchive -Force
    }
  }
}

if ($LocalEnvFilePath) {
  Copy-FileToRemote -LocalPath $LocalEnvFilePath -RemotePathFile "/tmp/hris-onprem.env"
  Invoke-RemoteShCommand -Command ("mkdir -p {0} && cp /tmp/hris-onprem.env {0}/.env && sed -i 's/\r$//' {0}/.env && rm -f /tmp/hris-onprem.env" -f (Escape-ShellArg $RemotePath))
}

$remoteDeployCmd = "cd {0} && tr -d '\r' < scripts/deploy/onprem-auto-deploy.sh | bash -s -- {1} {2}" -f (Escape-ShellArg $RemotePath), (Escape-ShellArg $Branch), (Escape-ShellArg $DeploySha)
Invoke-RemoteShCommand -Command $remoteDeployCmd

Write-Host ""
Write-Host "Remote deploy command completed."
if ($DryRun) {
  Write-Host "Dry run mode: no remote changes were made."
}
