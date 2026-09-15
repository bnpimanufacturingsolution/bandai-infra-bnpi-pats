[CmdletBinding()]
param(
    [ValidateSet("Import", "Publish", "Both", "DeleteHyperV", "ResetHyperV", "ResetVirtualBox", "ResetImages", "ResetAll", "SelfTestHyperV")]
    [string]$Mode = "Import",

    [string]$VhdxPath = "C:\ProgramData\ProjectTruth\images\project-truth-devcurrent-hyperv.vhdx",
    [string]$SourceUrl = "",
    [string]$SourceGcsUri = "",

    [string]$VmName = "project-truth-devcurrent",
    [string]$HyperVVmPattern = "project-truth*",
    [string]$PreferredSwitch = "ProjectTruth-External",
    [string]$FallbackSwitch = "Default Switch",
    [string]$AutoCreateSwitchName = "ProjectTruth-Auto",
    [string]$BridgeAdapterName = "",
    [switch]$RequireExternalSwitch,
    [int]$CpuCount = 2,
    [int]$StartupMemoryGB = 4,
    [int]$MinimumMemoryGB = 2,
    [int]$MaximumMemoryGB = 6,
    [int]$FallbackStartupMemoryGB = 2,
    [int]$FallbackMinimumMemoryGB = 1,
    [switch]$Start,
    [switch]$NoStart,
    [switch]$ForceRecreate,

    [string]$Bucket = "project-truth-image-export-bnpi-pats-492904-161377059311",
    [string]$ObjectPrefix = "public/project-truth/hyperv/dev-current/latest",
    [string]$ObjectName = "",
    [string]$ImagesDir = "C:\ProgramData\ProjectTruth\images",
    [string]$VirtualBoxVmPattern = "project-truth*",
    [string]$ImageNamePattern = "project-truth*",
    [switch]$DeleteVhdx,
    [int]$PollSeconds = 10,
    [int]$PollCount = 60,
    [switch]$ElevatedChild
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host ("{0} {1}" -f (Get-Date -Format "HH:mm:ss"), $Message)
}

function Write-Ok {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Stop-Blocker {
    param([string]$Message)
    Write-Host "[BLOCKER] $Message" -ForegroundColor Red
    if ($ElevatedChild) {
        Read-Host "Press Enter to close"
    }
    exit 1
}

function Test-Admin {
    $principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Ensure-ServiceRunning {
    param(
        [string]$Name,
        [int]$TimeoutSeconds = 60
    )

    $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if (-not $service) {
        Stop-Blocker "Required Windows service not found: $Name"
    }

    if ($service.Status -ne "Running") {
        Write-Step "Starting Windows service $Name"
        Start-Service -Name $Name
        $service.WaitForStatus("Running", [TimeSpan]::FromSeconds($TimeoutSeconds))
    }

    $service.Refresh()
    if ($service.Status -ne "Running") {
        Stop-Blocker "Windows service did not start: $Name"
    }
}

function Invoke-SelfElevated {
    $arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit", "-File", $PSCommandPath, "-ElevatedChild")
    foreach ($key in $PSBoundParameters.Keys) {
        if ($key -eq "ElevatedChild") {
            continue
        }
        $value = $PSBoundParameters[$key]
        if ($value -is [switch] -or $value -is [System.Management.Automation.SwitchParameter]) {
            if ($value.IsPresent) {
                $arguments += "-$key"
            }
            continue
        }
        $arguments += "-$key"
        $arguments += [string]$value
    }

    $quotedArguments = $arguments | ForEach-Object {
        '"' + ([string]$_ -replace '"', '\"') + '"'
    }

    Write-Step "Requesting Administrator rights through UAC."
    $process = Start-Process powershell.exe -Verb RunAs -ArgumentList ($quotedArguments -join " ") -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        Stop-Blocker "Elevated import exited with code $($process.ExitCode)."
    }
    exit 0
}

function Assert-HyperVReady {
    $feature = Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All
    if ($feature.State -ne "Enabled") {
        Write-Step "Enabling Hyper-V. Reboot is required; run this script again after reboot."
        Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All
        exit 0
    }

    Ensure-ServiceRunning -Name "vmms"

    $bad = systeminfo | Select-String "Virtualization Enabled In Firmware:\s+No|Second Level Address Translation:\s+No|VM Monitor Mode Extensions:\s+No|Data Execution Prevention Available:\s+No"
    if ($bad) {
        Stop-Blocker ("Host Hyper-V requirement failed: " + ($bad -join "; "))
    }
}

function Resolve-Vhdx {
    if (Test-Path -LiteralPath $VhdxPath) {
        return (Resolve-Path -LiteralPath $VhdxPath).Path
    }

    $parent = Split-Path -Parent $VhdxPath
    if ($parent) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }

    if ($SourceGcsUri) {
        $gsutil = Get-Command gsutil.cmd, gsutil -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $gsutil) {
            Stop-Blocker "gsutil not found on PATH, and VHDX is missing: $VhdxPath"
        }
        Write-Step "Downloading VHDX from $SourceGcsUri"
        & $gsutil.Source cp $SourceGcsUri $VhdxPath
    }
    elseif ($SourceUrl) {
        Write-Step "Downloading VHDX from $SourceUrl"
        curl.exe -L --fail --retry 10 --retry-delay 10 -o $VhdxPath $SourceUrl
    }
    else {
        Stop-Blocker "VHDX not found: $VhdxPath. Pass -SourceUrl or -SourceGcsUri to download it first."
    }

    if (-not (Test-Path -LiteralPath $VhdxPath)) {
        Stop-Blocker "Download finished but VHDX is still missing: $VhdxPath"
    }

    return (Resolve-Path -LiteralPath $VhdxPath).Path
}

function Get-UsableSwitchName {
    Ensure-ServiceRunning -Name "vmms"

    $switch = Get-VMSwitch -Name $PreferredSwitch -ErrorAction SilentlyContinue
    if (-not $switch -and $BridgeAdapterName) {
        $adapter = Get-NetAdapter -Name $BridgeAdapterName -ErrorAction SilentlyContinue
        if (-not $adapter) {
            $adapter = Get-NetAdapter -ErrorAction SilentlyContinue |
                Where-Object { $_.InterfaceDescription -eq $BridgeAdapterName } |
                Select-Object -First 1
        }
        if (-not $adapter) {
            Stop-Blocker "Bridge adapter not found: $BridgeAdapterName"
        }
        Write-Step "Creating external switch $PreferredSwitch on adapter $($adapter.Name)"
        $switch = New-VMSwitch -Name $PreferredSwitch -NetAdapterName $adapter.Name -AllowManagementOS $true
    }
    if (-not $switch) {
        $switch = @(Get-VMSwitch -ErrorAction SilentlyContinue) |
            Where-Object SwitchType -eq External |
            Select-Object -First 1
    }
    if (-not $switch) {
        if ($RequireExternalSwitch) {
            $upAdapters = @(Get-NetAdapter -ErrorAction SilentlyContinue |
                Where-Object {
                    $_.Status -eq "Up" -and
                    $_.InterfaceDescription -notmatch "Hyper-V|VirtualBox|Loopback|VPN|TAP|TUN|WSL"
                } |
                Sort-Object LinkSpeed -Descending)
            if ($upAdapters.Count -eq 1) {
                Write-Step "Creating external switch $PreferredSwitch on detected adapter $($upAdapters[0].Name)"
                $switch = New-VMSwitch -Name $PreferredSwitch -NetAdapterName $upAdapters[0].Name -AllowManagementOS $true
            }
            elseif ($upAdapters.Count -gt 1) {
                $detail = ($upAdapters | ForEach-Object { "$($_.Name) [$($_.InterfaceDescription)]" }) -join "; "
                Stop-Blocker "Multiple active physical adapters found. Re-run with -BridgeAdapterName. Candidates: $detail"
            }
            else {
                Stop-Blocker "No external Hyper-V switch found and no active physical adapter is available."
            }
        }
    }
    if (-not $switch -and -not $RequireExternalSwitch) {
        $switch = Get-VMSwitch -Name $FallbackSwitch -ErrorAction SilentlyContinue
    }
    if (-not $switch) {
        $switch = @(Get-VMSwitch -ErrorAction SilentlyContinue) | Select-Object -First 1
    }
    if (-not $switch) {
        Write-Step "No Hyper-V switch found. Creating internal switch $AutoCreateSwitchName"
        $switch = New-VMSwitch -Name $AutoCreateSwitchName -SwitchType Internal
    }
    if ($RequireExternalSwitch -and $switch.SwitchType -ne "External") {
        Stop-Blocker "Selected switch is not External: $($switch.Name) [$($switch.SwitchType)]"
    }
    return $switch.Name
}

function Find-VBoxManage {
    $command = Get-Command VBoxManage -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $defaultVBoxManage = Join-Path $env:ProgramFiles "Oracle\VirtualBox\VBoxManage.exe"
    if (Test-Path -LiteralPath $defaultVBoxManage) {
        return $defaultVBoxManage
    }

    Stop-Blocker "VBoxManage not found. Install Oracle VirtualBox or add VBoxManage to PATH."
}

function Get-VBoxVmNames {
    param([string]$VBoxManage)

    $names = @()
    $lines = & $VBoxManage list vms
    foreach ($line in $lines) {
        if ($line -match '^"(.+)"\s+\{[0-9a-fA-F-]+\}$') {
            $names += $matches[1]
        }
    }
    return @($names | Where-Object { $_ -like $VirtualBoxVmPattern })
}

function Remove-HyperVVm {
    if (-not (Test-Admin)) {
        Invoke-SelfElevated
    }

    Assert-HyperVReady
    $existing = Get-VM -Name $VmName -ErrorAction SilentlyContinue
    if (-not $existing) {
        Write-Ok "Hyper-V VM not found, nothing to delete: $VmName"
    }
    else {
        Write-Step "Deleting Hyper-V VM $VmName"
        if ($existing.State -ne "Off") {
            Stop-VM -Name $VmName -TurnOff -Force
        }
        Remove-VM -Name $VmName -Force
        Write-Ok "Deleted Hyper-V VM: $VmName"
    }

    if ($DeleteVhdx) {
        if (Test-Path -LiteralPath $VhdxPath) {
            Write-Step "Deleting VHDX $VhdxPath"
            Remove-Item -LiteralPath $VhdxPath -Force
            Write-Ok "Deleted VHDX: $VhdxPath"
        }
        else {
            Write-Ok "VHDX not found, nothing to delete: $VhdxPath"
        }
    }
}

function Reset-HyperVProjectTruth {
    if (-not (Test-Admin)) {
        Invoke-SelfElevated
    }

    Assert-HyperVReady
    $vms = @(Get-VM -ErrorAction SilentlyContinue | Where-Object { $_.Name -like $HyperVVmPattern })
    if (-not $vms.Count) {
        Write-Ok "No Hyper-V VMs matched: $HyperVVmPattern"
    }
    else {
        foreach ($vm in $vms) {
            Write-Step "Deleting Hyper-V VM $($vm.Name)"
            if ($vm.State -ne "Off") {
                Stop-VM -Name $vm.Name -TurnOff -Force
            }
            Remove-VM -Name $vm.Name -Force
        }
        Write-Ok "Deleted $($vms.Count) Hyper-V VM(s) matching: $HyperVVmPattern"
    }

    if ($DeleteVhdx) {
        Reset-ProjectTruthImages
    }
}

function Reset-VirtualBoxProjectTruth {
    $vbox = Find-VBoxManage
    $vmNames = Get-VBoxVmNames -VBoxManage $vbox
    if (-not $vmNames.Count) {
        Write-Ok "No VirtualBox VMs matched: $VirtualBoxVmPattern"
        return
    }

    foreach ($name in $vmNames) {
        Write-Step "Resetting VirtualBox VM $name"
        $running = & $vbox list runningvms
        if ($running | Select-String ([regex]::Escape("`"$name`"")) -Quiet) {
            & $vbox controlvm $name poweroff | Out-Host
            Start-Sleep -Seconds 3
        }
        & $vbox unregistervm $name --delete | Out-Host
    }
    Write-Ok "VirtualBox reset complete for pattern: $VirtualBoxVmPattern"
}

function Reset-ProjectTruthImages {
    if (-not (Test-Admin)) {
        Invoke-SelfElevated
    }

    if (-not (Test-Path -LiteralPath $ImagesDir)) {
        Write-Ok "Images directory not found, nothing to delete: $ImagesDir"
        return
    }

    $extensions = @(".vdi", ".vmdk", ".ova")
    if ($DeleteVhdx) {
        $extensions += ".vhdx"
        $extensions += ".vhd"
    }

    $images = @(Get-ChildItem -LiteralPath $ImagesDir -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like $ImageNamePattern -and $_.Extension.ToLowerInvariant() -in $extensions })

    if (-not $images.Count) {
        Write-Ok "No images matched $ImageNamePattern in $ImagesDir"
        return
    }

    foreach ($image in $images) {
        Write-Step "Deleting image $($image.FullName)"
        Remove-Item -LiteralPath $image.FullName -Force
    }
    Write-Ok "Deleted $($images.Count) image file(s) from $ImagesDir"
}

function Set-ProjectTruthVmMemory {
    param(
        [string]$Name,
        [int]$StartupGB,
        [int]$MinimumGB,
        [int]$MaximumGB
    )

    $startupBytes = [int64]$StartupGB * 1GB
    $minimumBytes = [int64]$MinimumGB * 1GB
    $maximumBytes = [int64]$MaximumGB * 1GB
    if ($maximumBytes -lt $startupBytes) {
        $maximumBytes = $startupBytes
    }
    if ($minimumBytes -gt $startupBytes) {
        $minimumBytes = $startupBytes
    }

    Set-VMMemory -VMName $Name -DynamicMemoryEnabled $true -MinimumBytes $minimumBytes -StartupBytes $startupBytes -MaximumBytes $maximumBytes
}

function Start-ProjectTruthVm {
    param([string]$Name)

    $attempts = @(
        [pscustomobject]@{
            StartupGB = $StartupMemoryGB
            MinimumGB = $MinimumMemoryGB
            MaximumGB = $MaximumMemoryGB
            Label = "requested"
        },
        [pscustomobject]@{
            StartupGB = $FallbackStartupMemoryGB
            MinimumGB = $FallbackMinimumMemoryGB
            MaximumGB = [Math]::Max($FallbackStartupMemoryGB, 2)
            Label = "fallback"
        },
        [pscustomobject]@{
            StartupGB = 1
            MinimumGB = 1
            MaximumGB = 2
            Label = "last-resort"
        }
    ) | Sort-Object StartupGB -Descending

    $lastError = $null
    foreach ($attempt in $attempts) {
        $vm = Get-VM -Name $Name
        if ($vm.State -eq "Running") {
            Write-Ok "VM already running: $Name"
            return
        }

        Write-Step "Starting $Name with $($attempt.StartupGB)GB startup RAM ($($attempt.Label))"
        Set-ProjectTruthVmMemory -Name $Name -StartupGB $attempt.StartupGB -MinimumGB $attempt.MinimumGB -MaximumGB $attempt.MaximumGB
        try {
            Start-VM -Name $Name
            Write-Ok "Started $Name with $($attempt.StartupGB)GB startup RAM"
            return
        }
        catch {
            $lastError = $_
            if ($_.Exception.Message -notmatch "0x800705AA|Insufficient system resources|Unable to allocate") {
                throw
            }
            Write-Step "Start failed from RAM pressure; retrying with lower startup RAM."
        }
    }

    if ($lastError) {
        throw $lastError
    }
}

function Import-VhdxVm {
    if (-not (Test-Admin)) {
        Invoke-SelfElevated
    }

    Assert-HyperVReady
    $resolvedVhdx = Resolve-Vhdx
    $switchName = Get-UsableSwitchName
    Write-Ok "Using VHDX: $resolvedVhdx"
    Write-Ok "Using switch: $switchName"

    $existing = Get-VM -Name $VmName -ErrorAction SilentlyContinue
    if ($existing -and $ForceRecreate) {
        Write-Step "Removing existing VM because -ForceRecreate was provided: $VmName"
        if ($existing.State -ne "Off") {
            Stop-VM -Name $VmName -TurnOff -Force
        }
        Remove-VM -Name $VmName -Force
        $existing = $null
    }

    $startupBytes = [int64]$StartupMemoryGB * 1GB
    $minimumBytes = [int64]$MinimumMemoryGB * 1GB
    $maximumBytes = [int64]$MaximumMemoryGB * 1GB

    if (-not $existing) {
        Write-Step "Creating Hyper-V VM $VmName"
        New-VM -Name $VmName -Generation 2 -MemoryStartupBytes $startupBytes -VHDPath $resolvedVhdx -SwitchName $switchName | Out-Null
        Set-VM -Name $VmName -AutomaticCheckpointsEnabled $false
    }
    else {
        Write-Step "Reusing existing Hyper-V VM $VmName"
        Connect-VMNetworkAdapter -VMName $VmName -SwitchName $switchName
    }

    Set-VMProcessor -VMName $VmName -Count $CpuCount
    Set-ProjectTruthVmMemory -Name $VmName -StartupGB $StartupMemoryGB -MinimumGB $MinimumMemoryGB -MaximumGB $MaximumMemoryGB
    Set-VMFirmware -VMName $VmName -EnableSecureBoot Off
    Set-VMNetworkAdapter -VMName $VmName -DeviceNaming On -DhcpGuard Off -RouterGuard Off -MacAddressSpoofing Off

    if ((-not $NoStart) -and ($Start -or $Mode -in @("Import", "Both"))) {
        $vm = Get-VM -Name $VmName
        if ($vm.State -ne "Running") {
            Start-ProjectTruthVm -Name $VmName
        }

        for ($i = 1; $i -le $PollCount; $i++) {
            Start-Sleep -Seconds $PollSeconds
            $ips = @(Get-VMNetworkAdapter -VMName $VmName |
                Select-Object -ExpandProperty IPAddresses |
                Where-Object { $_ -match "^\d+\.\d+\.\d+\.\d+$" -and $_ -notmatch "^169\.254" })
            if ($ips.Count) {
                Write-Ok ("VM IPv4: " + ($ips -join ", "))
                foreach ($ip in $ips) {
                    Write-Host "curl http://$ip`:3000/auth/login"
                    Write-Host "curl http://$ip`:3001/health"
                    Write-Host "curl http://$ip`:3100/auth/login"
                    Write-Host "curl http://$ip`:3101/health"
                    Write-Host "curl http://$ip`:3200/auth/login"
                    Write-Host "curl http://$ip`:3201/health"
                }
                break
            }
            Write-Step "Waiting for VM IPv4 [$i/$PollCount]"
        }
    }

    Write-Ok "Hyper-V import complete: $VmName"
}

function Invoke-HyperVSelfTest {
    if (-not (Test-Admin)) {
        Invoke-SelfElevated
    }

    if ($DeleteVhdx) {
        Write-Step "Self-test preserves the source VHDX; ignoring -DeleteVhdx for this mode."
        $script:DeleteVhdx = $false
    }

    Write-Step "Self-test starting for Hyper-V VM $VmName"
    $existing = Get-VM -Name $VmName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Step "Self-test removing existing VM before import: $VmName"
        Remove-HyperVVm
    }

    $script:Start = [System.Management.Automation.SwitchParameter]::Present
    Import-VhdxVm

    $vm = Get-VM -Name $VmName -ErrorAction SilentlyContinue
    if (-not $vm) {
        Stop-Blocker "Self-test import did not create VM: $VmName"
    }
    if ($vm.State -ne "Running") {
        Stop-Blocker "Self-test import created VM but it is not running: $($vm.State)"
    }

    Write-Ok "Self-test start proved: $VmName is running"
    Write-Step "Self-test deleting VM after successful start"
    Remove-HyperVVm
    Write-Ok "Self-test delete proved: $VmName removed"
}

function Publish-Vhdx {
    $resolvedVhdx = Resolve-Vhdx
    $gsutil = Get-Command gsutil.cmd, gsutil -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $gsutil) {
        Stop-Blocker "gsutil not found on PATH."
    }

    if (-not $ObjectName) {
        $ObjectName = Split-Path -Leaf $resolvedVhdx
    }

    $objectPath = (($ObjectPrefix.TrimEnd("/")) + "/" + $ObjectName)
    $gcsUri = "gs://$Bucket/$objectPath"
    $publicUrl = "https://storage.googleapis.com/$Bucket/$objectPath"

    Write-Step "Publishing $resolvedVhdx"
    Write-Step "Destination $gcsUri"
    & $gsutil.Source -o "GSUtil:parallel_composite_upload_threshold=150M" -h "Content-Type:application/octet-stream" cp $resolvedVhdx $gcsUri
    if ($LASTEXITCODE -ne 0) {
        Stop-Blocker "Upload failed: $gcsUri"
    }

    Write-Step "Verifying public URL"
    curl.exe -I --fail --max-time 60 $publicUrl | Out-Host

    Write-Host ""
    Write-Ok "Published VHDX"
    Write-Host "GCS: $gcsUri"
    Write-Host "URL: $publicUrl"
}

try {
    switch ($Mode) {
        "Import" { Import-VhdxVm }
        "Publish" { Publish-Vhdx }
        "Both" {
            Publish-Vhdx
            Import-VhdxVm
        }
        "DeleteHyperV" { Remove-HyperVVm }
        "ResetHyperV" { Reset-HyperVProjectTruth }
        "ResetVirtualBox" { Reset-VirtualBoxProjectTruth }
        "ResetImages" { Reset-ProjectTruthImages }
        "ResetAll" {
            Reset-HyperVProjectTruth
            Reset-VirtualBoxProjectTruth
            Reset-ProjectTruthImages
        }
        "SelfTestHyperV" { Invoke-HyperVSelfTest }
    }
}
catch {
    Write-Host "[BLOCKER] $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ScriptStackTrace) {
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
    }
    if ($ElevatedChild) {
        Read-Host "Press Enter to close"
    }
    exit 1
}
