param(
  [string]$SshTarget = '',
  [Parameter(Mandatory = $true)]
  [string]$DeviceIp,
  [string]$DeviceUsername = 'admin',
  [string]$DevicePassword = $(if ($env:HIKVISION_PASSWORD) { $env:HIKVISION_PASSWORD } else { '' }),
  [string]$SdkRoot = '/home/infra/project-truth-hcnetsdk/EN-HCNetSDKV6.1.9.48_build20230410_linux64',
  [string]$RemoteWorkDir = '/tmp/project-truth-hikvision-sdk-matrix',
  [switch]$IncludeTransportSweep
)

$ErrorActionPreference = 'Stop'
if ($null -ne (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue)) {
  $PSNativeCommandUseErrorActionPreference = $false
}

if ([string]::IsNullOrWhiteSpace($DevicePassword)) {
  throw 'Pass -DevicePassword or set HIKVISION_PASSWORD before running the Linux SDK matrix helper.'
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$runtimeRoot = Join-Path $repoRoot '.runtime\hikvision-remote-sdk-matrix'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runRoot = Join-Path $runtimeRoot $stamp
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

function Invoke-SshCommand {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable]$TargetSpec,
    [Parameter(Mandatory = $true)]
    [string]$RemoteCommand
  )

  $args = @() + $TargetSpec.SshArgs + @($RemoteCommand)
  return & ssh @args 2>&1
}

function Test-SshTargetSpec {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable]$TargetSpec
  )

  try {
    $output = Invoke-SshCommand -TargetSpec $TargetSpec -RemoteCommand 'hostname && whoami' 2>&1
    return [pscustomobject]@{
      Ok = ($LASTEXITCODE -eq 0)
      Output = @($output) -join "`n"
    }
  } catch {
    return [pscustomobject]@{
      Ok = $false
      Output = $_.Exception.Message
    }
  }
}

function Resolve-SshTargetSpec {
  param(
    [string]$RequestedSshTarget
  )

  $keyPath = Join-Path $env:USERPROFILE '.ssh\node-health-appliance_ed25519'
  $candidates = @()

  if (-not [string]::IsNullOrWhiteSpace($RequestedSshTarget)) {
    $candidates += @{
      Label = $RequestedSshTarget
      SshArgs = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', $RequestedSshTarget)
      ScpArgs = @()
      ScpTargetPrefix = $RequestedSshTarget
    }
  } else {
    $candidates += @{
      Label = 'infra@10.184.37.19'
      SshArgs = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', '-i', $keyPath, 'infra@10.184.37.19')
      ScpArgs = @('-i', $keyPath)
      ScpTargetPrefix = 'infra@10.184.37.19'
    }
    $candidates += @{
      Label = 'project-truth-bnpi-pats'
      SshArgs = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', 'project-truth-bnpi-pats')
      ScpArgs = @()
      ScpTargetPrefix = 'project-truth-bnpi-pats'
    }
  }

  foreach ($candidate in $candidates) {
    $probe = Test-SshTargetSpec -TargetSpec $candidate
    if ($probe.Ok) {
      $candidate.ProbeOutput = $probe.Output
      return $candidate
    }
  }

  $labels = $candidates | ForEach-Object { $_.Label }
  throw "No reachable SSH target found. Tried: $($labels -join ', ')"
}

function Escape-ShellSingleQuoted {
  param([string]$Value)
  if ($null -eq $Value) { return '' }
  return $Value.Replace("'", "'""'""'")
}

$cppSource = @'
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include "HCNetSDK.h"

int main(int argc, char** argv) {
  if (argc < 8) {
    std::cerr << "usage: <host> <port> <username> <password> <loginMode> <httpsMode> <transport>\n";
    return 2;
  }
  if (!NET_DVR_Init()) {
    std::cout << "INIT_FAIL lastError=" << NET_DVR_GetLastError() << "\n";
    return 1;
  }
  NET_DVR_USER_LOGIN_INFO info{};
  NET_DVR_DEVICEINFO_V40 dev{};
  info.bUseAsynLogin = false;
  info.wPort = static_cast<WORD>(std::atoi(argv[2]));
  info.byLoginMode = static_cast<BYTE>(std::atoi(argv[5]));
  info.byHttps = static_cast<BYTE>(std::atoi(argv[6]));
  info.byUseTransport = static_cast<BYTE>(std::atoi(argv[7]));
  std::strncpy(info.sDeviceAddress, argv[1], NET_DVR_DEV_ADDRESS_MAX_LEN - 1);
  std::strncpy(info.sUserName, argv[3], NET_DVR_LOGIN_USERNAME_MAX_LEN - 1);
  std::strncpy(info.sPassword, argv[4], NET_DVR_LOGIN_PASSWD_MAX_LEN - 1);
  LONG uid = NET_DVR_Login_V40(&info, &dev);
  if (uid < 0) {
    std::cout << "LOGIN_FAIL lastError=" << NET_DVR_GetLastError()
              << " loginMode=" << static_cast<int>(info.byLoginMode)
              << " httpsMode=" << static_cast<int>(info.byHttps)
              << " transport=" << static_cast<int>(info.byUseTransport)
              << " port=" << info.wPort << "\n";
    NET_DVR_Cleanup();
    return 1;
  }
  std::cout << "LOGIN_OK userId=" << uid
            << " loginMode=" << static_cast<int>(info.byLoginMode)
            << " httpsMode=" << static_cast<int>(info.byHttps)
            << " transport=" << static_cast<int>(info.byUseTransport)
            << " port=" << info.wPort << "\n";
  NET_DVR_Logout(uid);
  NET_DVR_Cleanup();
  return 0;
}
'@

$sshTargetSpec = Resolve-SshTargetSpec -RequestedSshTarget $SshTarget

$matrixLines = @(
  "echo ARGS=${DeviceIp}_8000_0_0_0"
  "LD_LIBRARY_PATH=`"${SdkRoot}/lib:${SdkRoot}:${SdkRoot}/HCNetSDKCom`" ./hikvision_login_probe '$DeviceIp' 8000 '$($DeviceUsername)' '$((Escape-ShellSingleQuoted $DevicePassword))' 0 0 0 || true"
  "echo ---"
  "echo ARGS=${DeviceIp}_8000_0_1_0"
  "LD_LIBRARY_PATH=`"${SdkRoot}/lib:${SdkRoot}:${SdkRoot}/HCNetSDKCom`" ./hikvision_login_probe '$DeviceIp' 8000 '$($DeviceUsername)' '$((Escape-ShellSingleQuoted $DevicePassword))' 0 1 0 || true"
  "echo ---"
  "echo ARGS=${DeviceIp}_8000_0_2_0"
  "LD_LIBRARY_PATH=`"${SdkRoot}/lib:${SdkRoot}:${SdkRoot}/HCNetSDKCom`" ./hikvision_login_probe '$DeviceIp' 8000 '$($DeviceUsername)' '$((Escape-ShellSingleQuoted $DevicePassword))' 0 2 0 || true"
  "echo ---"
  "echo ARGS=${DeviceIp}_8000_1_0_0"
  "LD_LIBRARY_PATH=`"${SdkRoot}/lib:${SdkRoot}:${SdkRoot}/HCNetSDKCom`" ./hikvision_login_probe '$DeviceIp' 8000 '$($DeviceUsername)' '$((Escape-ShellSingleQuoted $DevicePassword))' 1 0 0 || true"
  "echo ---"
  "echo ARGS=${DeviceIp}_8000_1_1_0"
  "LD_LIBRARY_PATH=`"${SdkRoot}/lib:${SdkRoot}:${SdkRoot}/HCNetSDKCom`" ./hikvision_login_probe '$DeviceIp' 8000 '$($DeviceUsername)' '$((Escape-ShellSingleQuoted $DevicePassword))' 1 1 0 || true"
  "echo ---"
  "echo ARGS=${DeviceIp}_8000_1_2_0"
  "LD_LIBRARY_PATH=`"${SdkRoot}/lib:${SdkRoot}:${SdkRoot}/HCNetSDKCom`" ./hikvision_login_probe '$DeviceIp' 8000 '$($DeviceUsername)' '$((Escape-ShellSingleQuoted $DevicePassword))' 1 2 0 || true"
  "echo ---"
  "echo ARGS=${DeviceIp}_8000_2_0_0"
  "LD_LIBRARY_PATH=`"${SdkRoot}/lib:${SdkRoot}:${SdkRoot}/HCNetSDKCom`" ./hikvision_login_probe '$DeviceIp' 8000 '$($DeviceUsername)' '$((Escape-ShellSingleQuoted $DevicePassword))' 2 0 0 || true"
  "echo ---"
  "echo ARGS=${DeviceIp}_8000_2_1_0"
  "LD_LIBRARY_PATH=`"${SdkRoot}/lib:${SdkRoot}:${SdkRoot}/HCNetSDKCom`" ./hikvision_login_probe '$DeviceIp' 8000 '$($DeviceUsername)' '$((Escape-ShellSingleQuoted $DevicePassword))' 2 1 0 || true"
  "echo ---"
  "echo ARGS=${DeviceIp}_8000_2_2_0"
  "LD_LIBRARY_PATH=`"${SdkRoot}/lib:${SdkRoot}:${SdkRoot}/HCNetSDKCom`" ./hikvision_login_probe '$DeviceIp' 8000 '$($DeviceUsername)' '$((Escape-ShellSingleQuoted $DevicePassword))' 2 2 0 || true"
  "echo ---"
  "echo ARGS=${DeviceIp}_443_0_0_0"
  "LD_LIBRARY_PATH=`"${SdkRoot}/lib:${SdkRoot}:${SdkRoot}/HCNetSDKCom`" ./hikvision_login_probe '$DeviceIp' 443 '$($DeviceUsername)' '$((Escape-ShellSingleQuoted $DevicePassword))' 0 0 0 || true"
  "echo ---"
  "echo ARGS=${DeviceIp}_443_0_1_0"
  "LD_LIBRARY_PATH=`"${SdkRoot}/lib:${SdkRoot}:${SdkRoot}/HCNetSDKCom`" ./hikvision_login_probe '$DeviceIp' 443 '$($DeviceUsername)' '$((Escape-ShellSingleQuoted $DevicePassword))' 0 1 0 || true"
  "echo ---"
  "echo ARGS=${DeviceIp}_443_0_2_0"
  "LD_LIBRARY_PATH=`"${SdkRoot}/lib:${SdkRoot}:${SdkRoot}/HCNetSDKCom`" ./hikvision_login_probe '$DeviceIp' 443 '$($DeviceUsername)' '$((Escape-ShellSingleQuoted $DevicePassword))' 0 2 0 || true"
  "echo ---"
  "echo ARGS=${DeviceIp}_443_1_0_0"
  "LD_LIBRARY_PATH=`"${SdkRoot}/lib:${SdkRoot}:${SdkRoot}/HCNetSDKCom`" ./hikvision_login_probe '$DeviceIp' 443 '$($DeviceUsername)' '$((Escape-ShellSingleQuoted $DevicePassword))' 1 0 0 || true"
  "echo ---"
  "echo ARGS=${DeviceIp}_443_1_1_0"
  "LD_LIBRARY_PATH=`"${SdkRoot}/lib:${SdkRoot}:${SdkRoot}/HCNetSDKCom`" ./hikvision_login_probe '$DeviceIp' 443 '$($DeviceUsername)' '$((Escape-ShellSingleQuoted $DevicePassword))' 1 1 0 || true"
  "echo ---"
  "echo ARGS=${DeviceIp}_443_1_2_0"
  "LD_LIBRARY_PATH=`"${SdkRoot}/lib:${SdkRoot}:${SdkRoot}/HCNetSDKCom`" ./hikvision_login_probe '$DeviceIp' 443 '$($DeviceUsername)' '$((Escape-ShellSingleQuoted $DevicePassword))' 1 2 0 || true"
  "echo ---"
  "echo ARGS=${DeviceIp}_443_2_0_0"
  "LD_LIBRARY_PATH=`"${SdkRoot}/lib:${SdkRoot}:${SdkRoot}/HCNetSDKCom`" ./hikvision_login_probe '$DeviceIp' 443 '$($DeviceUsername)' '$((Escape-ShellSingleQuoted $DevicePassword))' 2 0 0 || true"
  "echo ---"
  "echo ARGS=${DeviceIp}_443_2_1_0"
  "LD_LIBRARY_PATH=`"${SdkRoot}/lib:${SdkRoot}:${SdkRoot}/HCNetSDKCom`" ./hikvision_login_probe '$DeviceIp' 443 '$($DeviceUsername)' '$((Escape-ShellSingleQuoted $DevicePassword))' 2 1 0 || true"
  "echo ---"
  "echo ARGS=${DeviceIp}_443_2_2_0"
  "LD_LIBRARY_PATH=`"${SdkRoot}/lib:${SdkRoot}:${SdkRoot}/HCNetSDKCom`" ./hikvision_login_probe '$DeviceIp' 443 '$($DeviceUsername)' '$((Escape-ShellSingleQuoted $DevicePassword))' 2 2 0 || true"
  "echo ---"
)

if ($IncludeTransportSweep) {
  $matrixLines += @(
    "echo ARGS=${DeviceIp}_8000_0_0_1"
    "LD_LIBRARY_PATH=`"${SdkRoot}/lib:${SdkRoot}:${SdkRoot}/HCNetSDKCom`" ./hikvision_login_probe '$DeviceIp' 8000 '$($DeviceUsername)' '$((Escape-ShellSingleQuoted $DevicePassword))' 0 0 1 || true"
    "echo ---"
    "echo ARGS=${DeviceIp}_8000_2_2_1"
    "LD_LIBRARY_PATH=`"${SdkRoot}/lib:${SdkRoot}:${SdkRoot}/HCNetSDKCom`" ./hikvision_login_probe '$DeviceIp' 8000 '$($DeviceUsername)' '$((Escape-ShellSingleQuoted $DevicePassword))' 2 2 1 || true"
    "echo ---"
    "echo ARGS=${DeviceIp}_8000_0_0_2"
    "LD_LIBRARY_PATH=`"${SdkRoot}/lib:${SdkRoot}:${SdkRoot}/HCNetSDKCom`" ./hikvision_login_probe '$DeviceIp' 8000 '$($DeviceUsername)' '$((Escape-ShellSingleQuoted $DevicePassword))' 0 0 2 || true"
    "echo ---"
    "echo ARGS=${DeviceIp}_8000_2_2_2"
    "LD_LIBRARY_PATH=`"${SdkRoot}/lib:${SdkRoot}:${SdkRoot}/HCNetSDKCom`" ./hikvision_login_probe '$DeviceIp' 8000 '$($DeviceUsername)' '$((Escape-ShellSingleQuoted $DevicePassword))' 2 2 2 || true"
    "echo ---"
  )
}

$shellScript = @"
#!/usr/bin/env bash
set -euo pipefail
SDK_ROOT='$SdkRoot'
REMOTE_DIR='$RemoteWorkDir'
cd "`$REMOTE_DIR"
g++ -std=c++17 -I"`$SDK_ROOT/incEn" hikvision_login_probe.cpp -L"`$SDK_ROOT/lib" -lhcnetsdk -o hikvision_login_probe
echo META sshTarget=$($sshTargetSpec.Label) device=$DeviceIp sdkRoot=$SdkRoot remoteDir=$RemoteWorkDir
echo BUILD_OK
$(($matrixLines -join "`n"))
"@

$cppPath = Join-Path $runRoot 'hikvision_login_probe.cpp'
$shellPath = Join-Path $runRoot 'run-matrix.sh'
$metaPath = Join-Path $runRoot '01-command.json'
$outputPath = Join-Path $runRoot '02-remote-sdk-matrix.txt'

$cppSource | Set-Content -LiteralPath $cppPath -Encoding ascii
$shellScript | Set-Content -LiteralPath $shellPath -Encoding ascii

@{
  generatedAt = (Get-Date).ToString('o')
  sshTarget = $sshTargetSpec.Label
  deviceIp = $DeviceIp
  deviceUsername = $DeviceUsername
  sdkRoot = $SdkRoot
  remoteWorkDir = $RemoteWorkDir
  includeTransportSweep = [bool]$IncludeTransportSweep
  sshProbeOutput = $sshTargetSpec.ProbeOutput
} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $metaPath -Encoding UTF8

$null = Invoke-SshCommand -TargetSpec $sshTargetSpec -RemoteCommand "mkdir -p '$RemoteWorkDir'"
if ($LASTEXITCODE -ne 0) {
  throw "Failed to create remote work directory on $($sshTargetSpec.Label)."
}

$null = & scp @($sshTargetSpec.ScpArgs + @($cppPath, "$($sshTargetSpec.ScpTargetPrefix):$RemoteWorkDir/hikvision_login_probe.cpp"))
if ($LASTEXITCODE -ne 0) {
  throw "Failed to copy hikvision_login_probe.cpp to $($sshTargetSpec.Label)."
}

$null = & scp @($sshTargetSpec.ScpArgs + @($shellPath, "$($sshTargetSpec.ScpTargetPrefix):$RemoteWorkDir/run-matrix.sh"))
if ($LASTEXITCODE -ne 0) {
  throw "Failed to copy run-matrix.sh to $($sshTargetSpec.Label)."
}

$remoteLogPath = "$RemoteWorkDir/run-matrix-output.log"
$remoteCommand = "chmod +x '$RemoteWorkDir/run-matrix.sh' && bash '$RemoteWorkDir/run-matrix.sh' > '$remoteLogPath' 2>&1; code=`$?; cat '$remoteLogPath'; exit `$code"
Invoke-SshCommand -TargetSpec $sshTargetSpec -RemoteCommand $remoteCommand | Tee-Object -FilePath $outputPath
if ($LASTEXITCODE -ne 0) {
  throw "Remote Linux SDK matrix failed. Inspect $outputPath."
}

Write-Host "Remote Linux SDK matrix complete."
Write-Host "Evidence: $runRoot"
