param(
  [string]$VmName = 'PROJECT-TRUTH-NODE',
  [string]$SwitchName = 'ProjectTruth-External',
  [switch]$RequireExternal,
  [switch]$FixVmAdapter
)

$ErrorActionPreference = 'Continue'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  throw 'Administrator shell is required for Hyper-V bridge verification.'
}

$switch = Get-VMSwitch -Name $SwitchName -ErrorAction SilentlyContinue
if (-not $switch) {
  throw "Hyper-V switch not found: $SwitchName"
}
if ($RequireExternal -and $switch.SwitchType -ne 'External') {
  throw "Hyper-V switch is not External: $SwitchName [$($switch.SwitchType)]"
}

$vm = Get-VM -Name $VmName -ErrorAction SilentlyContinue
if (-not $vm) {
  throw "VM not found: $VmName"
}

$adapter = Get-VMNetworkAdapter -VMName $VmName -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $adapter) {
  throw "VM network adapter not found: $VmName"
}

if ($FixVmAdapter -and $adapter.SwitchName -ne $SwitchName) {
  Connect-VMNetworkAdapter -VMName $VmName -SwitchName $SwitchName
  Set-VMNetworkAdapter -VMName $VmName -DeviceNaming On -DhcpGuard Off -RouterGuard Off -MacAddressSpoofing Off
  $adapter = Get-VMNetworkAdapter -VMName $VmName | Select-Object -First 1
}

$hostLan = Get-NetIPConfiguration |
  Where-Object {
    $_.InterfaceAlias -eq "vEthernet ($SwitchName)" -and
    $_.IPv4Address
  } |
  Select-Object -First 1

$guestIps = @($adapter.IPAddresses | Where-Object {
  $_ -match '^\d+\.\d+\.\d+\.\d+$' -and $_ -notmatch '^169\.254\.'
})

$result = [pscustomobject]@{
  VmName = $vm.Name
  VmState = $vm.State
  SwitchName = $switch.Name
  SwitchType = $switch.SwitchType
  SwitchAdapter = $switch.NetAdapterInterfaceDescription
  VmAdapterSwitch = $adapter.SwitchName
  VmMacAddress = $adapter.MacAddress
  HostBridgeIp = $(if ($hostLan) { $hostLan.IPv4Address.IPAddress } else { '' })
  HostBridgePrefix = $(if ($hostLan) { $hostLan.IPv4Address.PrefixLength } else { '' })
  HostGateway = $(if ($hostLan -and $hostLan.IPv4DefaultGateway) { $hostLan.IPv4DefaultGateway.NextHop } else { '' })
  GuestIps = ($guestIps -join ',')
}

$result | Format-List

$failed = $false
if ($adapter.SwitchName -ne $SwitchName) {
  Write-Warning "VM adapter is not connected to $SwitchName."
  $failed = $true
}
if ($RequireExternal -and $switch.SwitchType -ne 'External') {
  Write-Warning "Switch is not External."
  $failed = $true
}
if (-not $hostLan) {
  Write-Warning "Host has no IPv4 address on vEthernet ($SwitchName)."
  $failed = $true
}

if ($failed) {
  exit 1
}

exit 0
