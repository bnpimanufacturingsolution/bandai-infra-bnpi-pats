[CmdletBinding()]
param(
  [string]$VmName = 'project-truth-local-vhdx-proof',
  [string]$GuestIp = '',
  [string]$Username = 'infra',
  [string]$Password = 'infra',
  [string]$HostKey = '',
  [int]$MaxPasses = 3,
  [int]$WaitSeconds = 3,
  [switch]$PatchLiveGuest,
  [string]$PublicUrlsFile = '',
  [string[]]$Pages = @('overview','tunnels','db'),
  [string]$ProofRoot = '.runtime\hyperv-visual-proof'
)

$ErrorActionPreference = 'Stop'

function Write-Step {
  param([string]$Message)
  Write-Host ("{0} {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message)
}

function Resolve-Tool {
  param(
    [string]$Name,
    [string[]]$Candidates
  )

  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  foreach ($candidate in $Candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  throw "$Name not found. Install PuTTY tools or add $Name to PATH."
}

function Resolve-GuestIp {
  if ($GuestIp) {
    return $GuestIp
  }

  $adapter = Get-VMNetworkAdapter -VMName $VmName -ErrorAction Stop |
    Select-Object -First 1
  $ip = $adapter.IPAddresses |
    Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' -and $_ -notmatch '^169\.254\.' } |
    Select-Object -First 1

  if (-not $ip) {
    throw "Could not discover IPv4 address for Hyper-V VM '$VmName'."
  }

  return $ip
}

function Invoke-Plink {
  param([string]$Command)

  $args = @('-ssh', '-batch')
  if ($HostKey) {
    $args += @('-hostkey', $HostKey)
  }
  $args += @('-pw', $Password, "$Username@$script:GuestAddress", $Command)

  & $script:Plink @args
  if ($LASTEXITCODE -ne 0) {
    throw "plink failed with exit code $LASTEXITCODE for: $Command"
  }
}

function Copy-ToGuest {
  param(
    [string]$Source,
    [string]$Target
  )

  $args = @('-batch')
  if ($HostKey) {
    $args += @('-hostkey', $HostKey)
  }
  $args += @('-pw', $Password, $Source, "$Username@$script:GuestAddress`:$Target")

  & $script:Pscp @args
  if ($LASTEXITCODE -ne 0) {
    throw "pscp failed with exit code $LASTEXITCODE for: $Source -> $Target"
  }
}

function Ensure-VMConnect {
  $process = Get-Process vmconnect -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -like "*$VmName*" -and $_.MainWindowHandle -ne 0 } |
    Sort-Object StartTime -Descending |
    Select-Object -First 1

  if (-not $process) {
    Write-Step "Opening VMConnect for $VmName"
    Start-Process vmconnect.exe -ArgumentList @('localhost', $VmName) -WindowStyle Normal | Out-Null
    Start-Sleep -Seconds 3
    $process = Get-Process vmconnect -ErrorAction SilentlyContinue |
      Where-Object { $_.MainWindowTitle -like "*$VmName*" -and $_.MainWindowHandle -ne 0 } |
      Sort-Object StartTime -Descending |
      Select-Object -First 1
  }

  if (-not $process) {
    throw "VMConnect window for '$VmName' was not found."
  }

  return $process
}

function Add-User32 {
  if ('ProjectTruth.User32' -as [type]) {
    return
  }

  Add-Type @'
using System;
using System.Runtime.InteropServices;

namespace ProjectTruth {
  public static class User32 {
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    [DllImport("user32.dll")]
    public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdcBlt, uint nFlags);
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }
}
'@
}

function Save-WindowScreenshot {
  param(
    [System.Diagnostics.Process]$Process,
    [string]$Path
  )

  Add-User32
  $hwndTopMost = [IntPtr]::new(-1)
  $hwndNoTopMost = [IntPtr]::new(-2)
  $swpNoMoveNoSize = 0x0001 -bor 0x0002

  [ProjectTruth.User32]::ShowWindow($Process.MainWindowHandle, 9) | Out-Null
  [ProjectTruth.User32]::SetWindowPos($Process.MainWindowHandle, $hwndTopMost, 0, 0, 0, 0, $swpNoMoveNoSize) | Out-Null
  [ProjectTruth.User32]::SetForegroundWindow($Process.MainWindowHandle) | Out-Null
  $shell = New-Object -ComObject WScript.Shell
  $shell.AppActivate($Process.Id) | Out-Null
  Start-Sleep -Milliseconds 1000

  $rect = New-Object ProjectTruth.RECT
  if (-not [ProjectTruth.User32]::GetWindowRect($Process.MainWindowHandle, [ref]$rect)) {
    throw "GetWindowRect failed for VMConnect window."
  }

  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -lt 100 -or $height -lt 100) {
    throw "VMConnect window rectangle is too small: ${width}x${height}."
  }

  Add-Type -AssemblyName System.Drawing
  $bitmap = New-Object System.Drawing.Bitmap($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $hdc = $graphics.GetHdc()
    try {
      $printed = [ProjectTruth.User32]::PrintWindow($Process.MainWindowHandle, $hdc, 2)
    } finally {
      $graphics.ReleaseHdc($hdc)
    }
    if (-not $printed) {
      $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
    }
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    [ProjectTruth.User32]::SetWindowPos($Process.MainWindowHandle, $hwndNoTopMost, 0, 0, 0, 0, $swpNoMoveNoSize) | Out-Null
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

function Get-MaxLineLength {
  param([string[]]$Lines)
  $max = 0
  foreach ($line in $Lines) {
    if ($line.Length -gt $max) {
      $max = $line.Length
    }
  }
  return $max
}

$script:Plink = Resolve-Tool -Name 'plink.exe' -Candidates @(
  "${env:ProgramFiles}\PuTTY\plink.exe",
  "${env:ProgramFiles(x86)}\PuTTY\plink.exe"
)
$script:Pscp = Resolve-Tool -Name 'pscp.exe' -Candidates @(
  "${env:ProgramFiles}\PuTTY\pscp.exe",
  "${env:ProgramFiles(x86)}\PuTTY\pscp.exe"
)
$script:GuestAddress = Resolve-GuestIp
$script:GuestPassword = $Password

$resolvedProofRoot = Join-Path (Resolve-Path '.').Path $ProofRoot
New-Item -ItemType Directory -Force -Path $resolvedProofRoot | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runRoot = Join-Path $resolvedProofRoot $stamp
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
Set-Content -LiteralPath (Join-Path $resolvedProofRoot 'LATEST.txt') -Value $runRoot

Write-Step "Hyper-V visual proof root: $runRoot"
Write-Step "VM=$VmName GuestIp=$script:GuestAddress PatchLiveGuest=$($PatchLiveGuest.IsPresent)"

$vm = $null
try {
  $vm = Get-VM -Name $VmName -ErrorAction Stop
} catch {
  if (-not $GuestIp) {
    throw
  }

  Write-Step "Skipping Hyper-V state query because Get-VM is unavailable in this shell; continuing with GuestIp=$GuestIp."
}

if ($vm -and $vm.State -ne 'Running') {
  Write-Step "Starting Hyper-V VM $VmName from $($vm.State)"
  Start-VM -Name $VmName
  Start-Sleep -Seconds 10
}

if ($PatchLiveGuest) {
  Write-Step 'Patching live guest summary/console scripts through SSH'
  Copy-ToGuest -Source (Resolve-Path 'appliance\bin\project-truth-lan-summary.sh').Path -Target '/tmp/project-truth-lan-summary.sh'
  Copy-ToGuest -Source (Resolve-Path 'appliance\bin\project-truth-clean-console.sh').Path -Target '/tmp/project-truth-clean-console.sh'
  Copy-ToGuest -Source (Resolve-Path 'appliance\profile.d\project-truth-hris-help.sh').Path -Target '/tmp/project-truth-hris-help.sh'
  Invoke-Plink "sudo install -m 0755 /tmp/project-truth-lan-summary.sh /usr/local/bin/project-truth-lan-summary && sudo install -m 0755 /tmp/project-truth-clean-console.sh /usr/local/bin/project-truth-clean-console && sudo install -m 0644 /tmp/project-truth-hris-help.sh /etc/profile.d/project-truth-hris-help.sh"

  if ($PublicUrlsFile) {
    Copy-ToGuest -Source (Resolve-Path $PublicUrlsFile).Path -Target '/tmp/trycloudflare-public-urls.txt'
    Invoke-Plink "sudo mkdir -p /run/project-truth && sudo install -m 0644 /tmp/trycloudflare-public-urls.txt /run/project-truth/trycloudflare-public-urls.txt"
  }
}

$vmconnect = Ensure-VMConnect

for ($pass = 1; $pass -le $MaxPasses; $pass++) {
  $passRoot = Join-Path $runRoot ("pass-{0:00}" -f $pass)
  New-Item -ItemType Directory -Force -Path $passRoot | Out-Null

  foreach ($page in $Pages) {
    $flag = switch ($page) {
      'overview' { '--screen-overview' }
      'tunnels' { '--screen-tunnels' }
      'db' { '--screen-db' }
      default { throw "Unknown page '$page'. Use overview, tunnels, or db." }
    }

    $pageRoot = Join-Path $passRoot $page
    New-Item -ItemType Directory -Force -Path $pageRoot | Out-Null

    Write-Step "Rendering client summary page '$page' on tty1, pass $pass"
    Invoke-Plink "printf '%s\n' '$script:GuestPassword' | sudo -S -p '' sh -c 'project-truth-lan-summary $flag > /tmp/project-truth-client-summary.txt && printf ""\033c"" > /dev/tty1 && cat /tmp/project-truth-client-summary.txt > /dev/tty1 && printf ""\ninfra@project-truth-node:~$ "" > /dev/tty1'"
    Start-Sleep -Seconds $WaitSeconds

    Invoke-Plink "cat /tmp/project-truth-client-summary.txt" |
      Set-Content -LiteralPath (Join-Path $pageRoot 'client-summary.txt')

    $summaryLines = Get-Content -LiteralPath (Join-Path $pageRoot 'client-summary.txt')
    $maxLine = Get-MaxLineLength -Lines $summaryLines
    "MaxLineLength=$maxLine" | Set-Content -LiteralPath (Join-Path $pageRoot 'line-width-check.txt')

    $screenshot = Join-Path $pageRoot 'vmconnect-client-summary.png'
    Write-Step "Capturing VMConnect screenshot -> $screenshot"
    Save-WindowScreenshot -Process $vmconnect -Path $screenshot
  }
}

@"
VISUAL PROOF LOOP COMPLETE
Run root: $runRoot
VM: $VmName
Guest IP: $script:GuestAddress

Pass rules:
- Open pass-*/*/vmconnect-client-summary.png.
- PASS only if the screenshot is the VMConnect console and the summary is readable.
- PASS only if the overview page shows PROD/DEV/UAT, Cloudflare named tunnel,
  LAN SSH, and Cloudflare SSH as not enabled unless Access has been proven.
- PASS only if the tunnels page shows bnpi-hris.tech named tunnel ownership and
  treats TryCloudflare as deprecated/manual fallback, not the normal path.
- PASS only if the db page shows redacted DB facts without ugly table wrapping.
- FAIL if the screenshot shows cramped table rows, cropped URLs, command spam,
  or a host browser instead of VMConnect.
"@ | Set-Content -LiteralPath (Join-Path $runRoot 'VERDICT_RULES.txt')

Write-Step 'Visual proof loop complete.'
Write-Host "Proof folder: $runRoot"
