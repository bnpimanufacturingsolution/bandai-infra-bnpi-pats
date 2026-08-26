param(
    [string]$VmName = "project-truth-local-vhdx-proof",
    [string]$SwitchAlias = "vEthernet (Default Switch)",
    [string]$HostSwitchIp = "10.184.37.250",
    [int]$PrefixLength = 24,
    [string]$VmIp = ""
)

$ErrorActionPreference = "Stop"

function Test-Port {
    param(
        [string]$HostName,
        [int]$Port
    )

    [pscustomobject]@{
        host = $HostName
        port = $Port
        tcp  = [bool](Test-NetConnection -ComputerName $HostName -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue)
    }
}

$vm = Get-VM -Name $VmName -ErrorAction Stop
$adapter = Get-VMNetworkAdapter -VMName $VmName -ErrorAction Stop
$reportedIps = @($adapter.IPAddresses | Where-Object { $_ -match '^\d{1,3}(\.\d{1,3}){3}$' })

if ([string]::IsNullOrWhiteSpace($VmIp)) {
    $preferredIps = @("10.184.37.241", "10.184.37.19", "10.184.37.78")
    $candidateIps = @($preferredIps + $reportedIps) | Select-Object -Unique
    $VmIp = $candidateIps | Where-Object { $_ -match '^10\.184\.37\.' } | Select-Object -First 1
}

if ([string]::IsNullOrWhiteSpace($VmIp)) {
    throw "Could not determine the Project Truth VM LAN IP. Pass -VmIp explicitly."
}

$switchIp = Get-NetIPAddress -InterfaceAlias $SwitchAlias -IPAddress $HostSwitchIp -ErrorAction SilentlyContinue

if (-not $switchIp) {
    New-NetIPAddress -InterfaceAlias $SwitchAlias -IPAddress $HostSwitchIp -PrefixLength $PrefixLength -SkipAsSource $false | Out-Null
    Start-Sleep -Seconds 2
}

$currentSwitchIps = Get-NetIPAddress -InterfaceAlias $SwitchAlias -AddressFamily IPv4 |
    Select-Object InterfaceAlias, IPAddress, PrefixLength, SkipAsSource, AddressState

$routes = Get-NetRoute -AddressFamily IPv4 |
    Where-Object { $_.DestinationPrefix -eq "10.184.37.0/24" -or $_.DestinationPrefix -eq "$HostSwitchIp/32" } |
    Select-Object DestinationPrefix, NextHop, InterfaceAlias, RouteMetric

$ports = @(22, 3000, 3001, 15432, 15433, 15434) | ForEach-Object {
    Test-Port -HostName $VmIp -Port $_
}

[pscustomobject]@{
    vm = [pscustomobject]@{
        name = $vm.Name
        state = $vm.State.ToString()
        status = $vm.Status
        switchName = $adapter.SwitchName
        reportedIps = $reportedIps
        selectedIp = $VmIp
    }
    hostSwitchIps = $currentSwitchIps
    routes = $routes
    probes = $ports
}
