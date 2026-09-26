[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SignedUrl,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F]{64}$')]
    [string]$ExpectedSha256,

    [string]$ImageFileName = '',
    [ValidateSet('hyperv', 'virtualbox')]
    [string]$TargetPlatform = 'hyperv',
    [string]$ImagesDir = "$env:ProgramData\BandaiApp\Bnpipats\images",
    [string]$RepoRoot = '',
    [string]$VmName = 'bnpi-pats',
    [string]$SwitchName = 'ProjectTruth-External',
    [string]$BaseDir = "$env:ProgramData\BandaiApp\Bnpipats",
    [string]$TunnelCredentialPath = "$env:ProgramData\BandaiApp\Bnpipats\secrets\cloudflared\12e89b6a-dabb-4897-9925-08ce9213b983.json",
    [switch]$StartVm,
    [switch]$WithPublic,
    [switch]$VerifyPublic,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Step {
    param([string]$Message)
    Write-Host "[Project Truth] $Message"
}

function Get-Sha256 {
    param([Parameter(Mandatory = $true)][string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-DefaultImageName {
    param([Parameter(Mandatory = $true)][Uri]$Uri)

    $leaf = [IO.Path]::GetFileName([Uri]::UnescapeDataString($Uri.AbsolutePath))
    if ([string]::IsNullOrWhiteSpace($leaf)) {
        if ($TargetPlatform -eq 'virtualbox') {
            return 'project-truth-node-latest.vdi'
        }
        return 'project-truth-node-latest.vhdx'
    }

    $expectedExtension = if ($TargetPlatform -eq 'virtualbox') { '.vdi' } else { '.vhdx' }
    if ([IO.Path]::GetExtension($leaf).ToLowerInvariant() -ne $expectedExtension) {
        throw "The signed URL does not point to a $expectedExtension file: $leaf"
    }

    return $leaf
}

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]$identity
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Invoke-ProjectTruthCommand {
    param(
        [Parameter(Mandatory = $true)][string]$ProjectRoot,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $dispatcher = Join-Path $ProjectRoot 'scripts\project-truth.ps1'
    if (-not (Test-Path -LiteralPath $dispatcher)) {
        throw "Project Truth dispatcher not found: $dispatcher"
    }

    Write-Step "Running Project Truth command: $($Arguments -join ' ')"
    & $dispatcher @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Project Truth command failed with exit code $LASTEXITCODE."
    }
}

function Wait-ProjectTruthVmIp {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [int]$TimeoutSeconds = 600
    )

    if (-not (Get-Command Get-VMNetworkAdapter -ErrorAction SilentlyContinue)) {
        throw 'Hyper-V PowerShell cmdlets are unavailable. Run this script in Administrator PowerShell on the Windows host.'
    }

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $addresses = @(Get-VMNetworkAdapter -VMName $Name -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty IPAddresses -ErrorAction SilentlyContinue |
            Where-Object { $_ -match '^\d{1,3}(\.\d{1,3}){3}$' -and $_ -notmatch '^169\.254\.' -and $_ -ne '127.0.0.1' })

        if ($addresses.Count -gt 0) {
            return $addresses[0]
        }

        Start-Sleep -Seconds 10
    }

    throw "No guest IP appeared for VM '$Name' within $TimeoutSeconds seconds."
}

function Test-PublicEndpoints {
    $urls = @(
        'https://bnpipats.tech/auth/login',
        'https://api.bnpipats.tech/health',
        'https://dev.bnpipats.tech/auth/login',
        'https://uat.bnpipats.tech/auth/login'
    )

    $failures = @()
    foreach ($url in $urls) {
        try {
            $response = Invoke-WebRequest -Uri $url -Method Get -MaximumRedirection 5 -TimeoutSec 30 -UseBasicParsing
            Write-Step "Public check passed: $url ($($response.StatusCode))"
        }
        catch {
            $failures += $url
            Write-Warning "Public check failed: $url :: $($_.Exception.Message)"
        }
    }

    if ($failures.Count -gt 0) {
        throw "Public verification failed for: $($failures -join ', ')"
    }
}

try {
    try {
        $uri = [Uri]$SignedUrl
    }
    catch {
        throw 'SignedUrl is not a valid URI.'
    }

    if ($uri.Scheme -ne 'https') {
        throw 'SignedUrl must use HTTPS.'
    }

    if ($WithPublic -and -not $StartVm) {
        throw '-WithPublic requires -StartVm.'
    }
    if ($VerifyPublic -and -not $WithPublic) {
        throw '-VerifyPublic requires -WithPublic.'
    }
    if ($StartVm -and $TargetPlatform -ne 'hyperv') {
        throw '-StartVm is only supported for the Hyper-V target platform.'
    }
    if ($StartVm -and [string]::IsNullOrWhiteSpace($RepoRoot)) {
        throw '-StartVm requires -RepoRoot pointing to the bandai-infra-bnpi-pats checkout on the Windows host.'
    }
    if ($WithPublic -and [string]::IsNullOrWhiteSpace($TunnelCredentialPath)) {
        throw '-WithPublic requires -TunnelCredentialPath.'
    }
    if ($WithPublic -and -not (Test-Path -LiteralPath $TunnelCredentialPath)) {
        throw "Cloudflare tunnel credential not found: $TunnelCredentialPath"
    }

    if ([string]::IsNullOrWhiteSpace($ImageFileName)) {
        $ImageFileName = Get-DefaultImageName -Uri $uri
    }
    elseif ([IO.Path]::GetFileName($ImageFileName) -ne $ImageFileName) {
        throw 'ImageFileName must be a file name only, without a directory path.'
    }

    $expectedExtension = if ($TargetPlatform -eq 'virtualbox') { '.vdi' } else { '.vhdx' }
    if ([IO.Path]::GetExtension($ImageFileName).ToLowerInvariant() -ne $expectedExtension) {
        throw "Expected a $expectedExtension file for TargetPlatform=$TargetPlatform."
    }

    New-Item -ItemType Directory -Force -Path $ImagesDir | Out-Null
    $target = Join-Path $ImagesDir $ImageFileName
    $temp = "$target.part"

    if (Test-Path -LiteralPath $target) {
        $existingHash = Get-Sha256 -Path $target
        if ($existingHash -eq $ExpectedSha256.ToLowerInvariant()) {
            Write-Step "Existing VHDX is already verified: $target"
        }
        elseif (-not $Force) {
            throw "A different file already exists at $target. Use -Force only after confirming replacement is intended."
        }
        else {
            Remove-Item -LiteralPath $target -Force
        }
    }

    if (-not (Test-Path -LiteralPath $target)) {
        try {
            Write-Step 'Downloading VHDX from the private signed URL...'
            Invoke-WebRequest -Uri $SignedUrl -OutFile $temp -UseBasicParsing

            if (-not (Test-Path -LiteralPath $temp)) {
                throw 'The download did not create the expected temporary file.'
            }

            $actualHash = Get-Sha256 -Path $temp
            if ($actualHash -ne $ExpectedSha256.ToLowerInvariant()) {
                throw "VHDX SHA-256 verification failed. actual=$actualHash expected=$($ExpectedSha256.ToLowerInvariant())"
            }

            Move-Item -LiteralPath $temp -Destination $target -Force
            Write-Step "VHDX downloaded and verified: $target"
            Write-Step "SHA256: $actualHash"
        }
        finally {
            if (Test-Path -LiteralPath $temp) {
                Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
            }
        }
    }

    if (-not $StartVm) {
        Write-Step 'Download/verification complete. VM import was not requested.'
        Write-Step "Next: run .\scripts\project-truth.ps1 bnpi-pats-vm -VhdxPath `"$target`" -VmName `"$VmName`" -SwitchName `"$SwitchName`" -BaseDir `"$BaseDir`""
        exit 0
    }

    if (-not (Test-Administrator)) {
        throw 'VM import/start requires Administrator PowerShell.'
    }

    Invoke-ProjectTruthCommand -ProjectRoot $RepoRoot -Arguments @(
        'bnpi-pats-vm',
        '-VhdxPath', $target,
        '-VmName', $VmName,
        '-SwitchName', $SwitchName,
        '-BaseDir', $BaseDir
    )

    if ($WithPublic) {
        $guestIp = Wait-ProjectTruthVmIp -Name $VmName
        Write-Step "VM guest IP: $guestIp"

        Invoke-ProjectTruthCommand -ProjectRoot $RepoRoot -Arguments @(
            'v6-one-shot',
            '-GuestIp', $guestIp,
            '-CredentialPath', $TunnelCredentialPath
        )

        if ($VerifyPublic) {
            Test-PublicEndpoints
        }
    }

    Write-Step 'Project Truth VHDX setup completed.'
}
catch {
    Write-Error $_
    exit 1
}
