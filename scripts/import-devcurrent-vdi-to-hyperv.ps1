[CmdletBinding()]
param(
    [string]$VdiPath = "C:\ProgramData\ProjectTruth\images\project-truth-node-devcurrent-postinstall-20260618-020148.vdi",
    [string]$VhdxPath = "C:\ProgramData\ProjectTruth\images\project-truth-devcurrent-hyperv.vhdx",
    [string]$VmName = "project-truth-devcurrent-hyperv-proof",
    [string]$PreferredSwitch = "ProjectTruth-External",
    [int]$CpuCount = 2,
    [int]$StartupMemoryGB = 4,
    [int]$MaximumMemoryGB = 6,
    [int]$PollSeconds = 10,
    [int]$PollCount = 90,
    [switch]$ForceRecreate
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host ("{0} {1}" -f (Get-Date -Format "HH:mm:ss"), $Message)
}

function Get-FreeCGB {
    [math]::Round((Get-Volume -DriveLetter C).SizeRemaining / 1GB, 2)
}

function Get-HttpCode {
    param([string]$Url)
    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec 8 -UseBasicParsing
        return [int]$response.StatusCode
    }
    catch {
        return 0
    }
}

function Convert-MacForArp {
    param([string]$MacAddress)
    if (-not $MacAddress) {
        return $null
    }
    (($MacAddress -replace "(.{2})(?=.)", '$1-').ToLowerInvariant())
}

function Find-GuestIp {
    param([string]$VmName)

    $adapter = Get-VMNetworkAdapter -VMName $VmName
    $ip = $adapter.IPAddresses |
        Where-Object { $_ -match "^\d+\.\d+\.\d+\.\d+$" -and $_ -notmatch "^169\.254" } |
        Where-Object { $_ -match "^192\.168\.100\." } |
        Select-Object -First 1

    if ($ip) {
        return $ip
    }

    $mac = Convert-MacForArp $adapter.MacAddress
    if (-not $mac) {
        return $null
    }

    $arpLines = arp -a
    foreach ($line in $arpLines) {
        if ($line -match "^\s*(192\.168\.100\.\d+)\s+$([regex]::Escape($mac))\s+") {
            return $matches[1]
        }
    }

    return $null
}

function Assert-Admin {
    $principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Run this from Administrator PowerShell."
    }
}

Assert-Admin

if (-not (Test-Path $VhdxPath)) {
    if (-not (Test-Path $VdiPath)) {
        throw "Missing VDI: $VdiPath"
    }

    $vbox = "C:\Program Files\Oracle\VirtualBox\VBoxManage.exe"
    if (-not (Test-Path $vbox)) {
        throw "VirtualBox VBoxManage not found at $vbox"
    }

    $tempVhd = [System.IO.Path]::ChangeExtension($VhdxPath, ".vhd")
    if (Test-Path $tempVhd) {
        Remove-Item $tempVhd -Force
    }

    Write-Step "Converting VDI to temporary VHD. freeC=$(Get-FreeCGB)GB"
    $process = Start-Process -FilePath $vbox -ArgumentList @("clonemedium", "disk", $VdiPath, $tempVhd, "--format", "VHD") -PassThru -NoNewWindow
    while (-not $process.HasExited) {
        $size = if (Test-Path $tempVhd) { [math]::Round((Get-Item $tempVhd).Length / 1GB, 2) } else { 0 }
        Write-Step "VDI->VHD target=${size}GB freeC=$(Get-FreeCGB)GB"
        Start-Sleep -Seconds 15
        $process.Refresh()
    }
    if ($process.ExitCode -ne 0) {
        throw "VBoxManage conversion failed with exit code $($process.ExitCode)"
    }

    Write-Step "Converting VHD to VHDX. freeC=$(Get-FreeCGB)GB"
    Convert-VHD -Path $tempVhd -DestinationPath $VhdxPath -VHDType Dynamic
    Remove-Item $tempVhd -Force
}

if (-not (Test-Path $VhdxPath)) {
    throw "Missing VHDX: $VhdxPath"
}

$switch = Get-VMSwitch -Name $PreferredSwitch -ErrorAction SilentlyContinue
if (-not $switch) {
    $switch = Get-VMSwitch -Name "Default Switch" -ErrorAction SilentlyContinue
}
if (-not $switch) {
    throw "No usable Hyper-V switch found."
}

$existing = Get-VM -Name $VmName -ErrorAction SilentlyContinue
if ($existing -and $ForceRecreate) {
    if ($existing.State -ne "Off") {
        Stop-VM -Name $VmName -TurnOff -Force
    }
    Remove-VM -Name $VmName -Force
    $existing = $null
}

if (-not $existing) {
    Write-Step "Creating Hyper-V VM $VmName on switch $($switch.Name)"
    $startupBytes = [int64]$StartupMemoryGB * 1GB
    $maximumBytes = [int64]$MaximumMemoryGB * 1GB
    New-VM -Name $VmName -Generation 2 -MemoryStartupBytes $startupBytes -VHDPath $VhdxPath -SwitchName $switch.Name | Out-Null
    Set-VMProcessor -VMName $VmName -Count $CpuCount
    Set-VMMemory -VMName $VmName -DynamicMemoryEnabled $true -MinimumBytes 2GB -StartupBytes $startupBytes -MaximumBytes $maximumBytes
    Set-VMFirmware -VMName $VmName -EnableSecureBoot Off
    Set-VM -Name $VmName -AutomaticCheckpointsEnabled $false
}
else {
    Write-Step "Reusing Hyper-V VM $VmName"
    $startupBytes = [int64]$StartupMemoryGB * 1GB
    $maximumBytes = [int64]$MaximumMemoryGB * 1GB
    if ($existing.State -ne "Off") {
        Stop-VM -Name $VmName -TurnOff -Force
    }
    Set-VMProcessor -VMName $VmName -Count $CpuCount
    Set-VMMemory -VMName $VmName -DynamicMemoryEnabled $true -MinimumBytes 2GB -StartupBytes $startupBytes -MaximumBytes $maximumBytes
    Set-VMFirmware -VMName $VmName -EnableSecureBoot Off
    Connect-VMNetworkAdapter -VMName $VmName -SwitchName $switch.Name
}

Write-Step "Starting $VmName"
Start-VM -Name $VmName

$paths = @(
    ":3000/auth/login",
    ":3001/health",
    ":3100/auth/login",
    ":3101/health",
    ":3200/auth/login",
    ":3201/health"
)

for ($i = 1; $i -le $PollCount; $i++) {
    Start-Sleep -Seconds $PollSeconds
    $vm = Get-VM -Name $VmName
    $ip = Find-GuestIp -VmName $VmName
    $mem = [math]::Round($vm.MemoryAssigned / 1GB, 2)
    Write-Step "[$i/$PollCount] state=$($vm.State) cpu=$($vm.CPUUsage)% mem=${mem}GB ip=$ip freeC=$(Get-FreeCGB)GB"

    if (-not $ip) {
        continue
    }

    $ok = 0
    foreach ($path in $paths) {
        $url = "http://$ip$path"
        $code = Get-HttpCode $url
        Write-Host ("  {0} -> {1}" -f $url, $(if ($code -eq 200) { "200" } else { "DOWN" }))
        if ($code -eq 200) {
            $ok++
        }
    }

    if ($ok -eq $paths.Count) {
        Write-Host ""
        Write-Host "PROVEN: Hyper-V boot and PROD/DEV/UAT health passed at $ip"
        Write-Host "PROD: http://$ip`:3000/auth/login"
        Write-Host "DEV:  http://$ip`:3100/auth/login"
        Write-Host "UAT:  http://$ip`:3200/auth/login"
        exit 0
    }
}

throw "Timed out before all Project Truth health checks passed."
