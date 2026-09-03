param(
    [ValidateSet("status", "ensure", "delete")]
    [string]$Action = "status",

    [string]$Repo = "hrisworkforcesystem-coder/hris-app",
    [string]$DevProjectId = "hris-workforce-dev-20260416",
    [string]$UatProjectId = "hris-workforce-uat-20260416",
    [string]$DevDisplayName = "HRIS DEV",
    [string]$UatDisplayName = "HRIS UAT",
    [switch]$SkipFirebasercUpdate,
    [switch]$CreateHostingSites,
    [switch]$SyncGitHubEnv,
    [switch]$DeleteDev,
    [switch]$DeleteUat,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$script:FirebaseCommand = $null
$script:GCloudCommand = $null

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

function Get-CommandFailureDetails {
    param([hashtable]$Result)

    $parts = @()
    if ($null -ne $Result) {
        if (-not [string]::IsNullOrWhiteSpace($Result.StdOut)) {
            $parts += $Result.StdOut.Trim()
        }
        if (-not [string]::IsNullOrWhiteSpace($Result.StdErr)) {
            $parts += $Result.StdErr.Trim()
        }
    }

    return ($parts -join [Environment]::NewLine)
}

function Test-ProjectIdConflict {
    param([string]$Details)

    if ([string]::IsNullOrWhiteSpace($Details)) {
        return $false
    }

    $patterns = @(
        "already in use",
        "already exists",
        "is not available",
        "project id you specified is already in use",
        "project id is already taken"
    )

    foreach ($pattern in $patterns) {
        if ($Details.ToLowerInvariant().Contains($pattern)) {
            return $true
        }
    }

    return $false
}

function Test-AlreadyExistsMessage {
    param([string]$Details)

    if ([string]::IsNullOrWhiteSpace($Details)) {
        return $false
    }

    $patterns = @(
        "already exists",
        "http error: 409",
        "projects/",
        "sites/",
        "site "
    )

    foreach ($pattern in $patterns) {
        if ($Details.ToLowerInvariant().Contains($pattern)) {
            return $true
        }
    }

    return $false
}

function Ensure-Command {
    param([string]$CommandName)

    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $CommandName"
    }
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
        [switch]$StreamOutput
    )

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $FilePath
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.Arguments = Convert-ToProcessArgumentString -Arguments $Arguments

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    $null = $process.Start()

    $stdoutLines = New-Object System.Collections.Generic.List[string]
    $stderrLines = New-Object System.Collections.Generic.List[string]
    $commandName = [System.IO.Path]::GetFileNameWithoutExtension($FilePath)

    while (-not $process.HasExited -or $process.StandardOutput.Peek() -ge 0 -or $process.StandardError.Peek() -ge 0) {
        $readAnything = $false

        while ($process.StandardOutput.Peek() -ge 0) {
            $line = $process.StandardOutput.ReadLine()
            if ($null -ne $line) {
                [void]$stdoutLines.Add($line)
                if ($StreamOutput) {
                    Write-Host "[$commandName] $line" -ForegroundColor DarkGray
                }
            }
            $readAnything = $true
        }

        while ($process.StandardError.Peek() -ge 0) {
            $line = $process.StandardError.ReadLine()
            if ($null -ne $line) {
                [void]$stderrLines.Add($line)
                if ($StreamOutput) {
                    Write-Host "[$commandName] $line" -ForegroundColor Yellow
                }
            }
            $readAnything = $true
        }

        if (-not $readAnything) {
            Start-Sleep -Milliseconds 150
        }
    }

    $process.WaitForExit()
    $stdout = ($stdoutLines -join [Environment]::NewLine)
    $stderr = ($stderrLines -join [Environment]::NewLine)

    return @{
        ExitCode = $process.ExitCode
        StdOut = $stdout
        StdErr = $stderr
    }
}

function Invoke-FirebaseCommand {
    param([string[]]$Arguments)

    return Invoke-CliCommand -FilePath $script:FirebaseCommand -Arguments $Arguments
}

function Invoke-GCloudCommand {
    param([string[]]$Arguments)

    return Invoke-CliCommand -FilePath $script:GCloudCommand -Arguments $Arguments
}

function Test-GcpProjectExists {
    param([string]$ProjectId)

    if ([string]::IsNullOrWhiteSpace($script:GCloudCommand)) {
        return $false
    }

    $result = Invoke-GCloudCommand -Arguments @("projects", "describe", $ProjectId)
    return ($result.ExitCode -eq 0)
}

function Ensure-GcpProject {
    param(
        [string]$ProjectId,
        [string]$DisplayName
    )

    if ([string]::IsNullOrWhiteSpace($script:GCloudCommand)) {
        throw "gcloud is required for fallback GCP project creation."
    }

    if (Test-GcpProjectExists -ProjectId $ProjectId) {
        Write-OK "GCP project already exists: $ProjectId"
        return
    }

    Write-Step "Creating Google Cloud project $ProjectId"
    $result = Invoke-GCloudCommand -Arguments @("projects", "create", $ProjectId, "--name", $DisplayName)
    if ($result.ExitCode -ne 0) {
        $details = Get-CommandFailureDetails -Result $result
        if (-not [string]::IsNullOrWhiteSpace($details)) {
            Write-Warn $details
        }
        if (Test-ProjectIdConflict -Details $details) {
            return $false
        }
        throw "Failed to create Google Cloud project $ProjectId"
    }

    Write-OK "Created Google Cloud project: $ProjectId"
    return $true
}

function Get-FirebaseProjectList {
    $result = Invoke-FirebaseCommand -Arguments @("projects:list", "--json")
    if ($result.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($result.StdOut)) {
        $details = Get-CommandFailureDetails -Result $result
        if (-not [string]::IsNullOrWhiteSpace($details)) {
            Write-Warn $details
        }
        throw "Failed to list Firebase projects. Make sure 'firebase login' is already done."
    }

    $parsed = $result.StdOut | ConvertFrom-Json
    if ($parsed.result) {
        return @($parsed.result)
    }
    if ($parsed.projects) {
        return @($parsed.projects)
    }
    return @()
}

function Test-FirebaseProjectExists {
    param(
        [object[]]$Projects,
        [string]$ProjectId
    )

    return [bool]($Projects | Where-Object { $_.projectId -eq $ProjectId })
}

function Get-ProjectIdCandidates {
    param(
        [string]$RequestedProjectId,
        [string]$EnvironmentName
    )

    $candidates = New-Object System.Collections.Generic.List[string]
    $suffixes = @("-app", "-web", "-site")

    $candidateSet = New-Object System.Collections.Generic.HashSet[string]([System.StringComparer]::OrdinalIgnoreCase)

    function Add-Candidate {
        param([string]$Value)

        if (-not [string]::IsNullOrWhiteSpace($Value) -and $candidateSet.Add($Value)) {
            [void]$candidates.Add($Value)
        }
    }

    Add-Candidate $RequestedProjectId

    foreach ($suffix in $suffixes) {
        Add-Candidate "$RequestedProjectId$suffix"
    }

    if ($EnvironmentName -eq "dev" -and $RequestedProjectId -match "dev") {
        Add-Candidate ($RequestedProjectId -replace "dev", "develop")
        Add-Candidate (($RequestedProjectId -replace "dev", "develop") + "-app")
    }

    if ($EnvironmentName -eq "uat") {
        Add-Candidate "hris-uat-app"
        Add-Candidate "hris-uat-site"
    }

    Add-Candidate "hris-workforce-$EnvironmentName"
    Add-Candidate "hris-$EnvironmentName-app"

    $timestampSuffix = Get-Date -Format "yyyyMMdd"
    Add-Candidate "$RequestedProjectId-$timestampSuffix"

    return @($candidates)
}

function Ensure-FirebaseProject {
    param(
        [object[]]$Projects,
        [string]$ProjectId,
        [string]$DisplayName,
        [string]$EnvironmentName
    )

    $candidateIds = Get-ProjectIdCandidates -RequestedProjectId $ProjectId -EnvironmentName $EnvironmentName

    foreach ($candidateProjectId in $candidateIds) {
        if (Test-FirebaseProjectExists -Projects $Projects -ProjectId $candidateProjectId) {
            if ($candidateProjectId -ne $ProjectId) {
                Write-Warn "Requested project id $ProjectId is not owned here. Using existing Firebase project $candidateProjectId instead."
            }
            Write-OK "Firebase project already exists: $candidateProjectId"
            return $candidateProjectId
        }

        Write-Step "Creating Firebase project $candidateProjectId"
    $result = Invoke-CliCommand -FilePath $script:FirebaseCommand -Arguments @("projects:create", $candidateProjectId, "--display-name", $DisplayName) -StreamOutput
        if ($result.ExitCode -eq 0) {
            Write-OK "Created Firebase project: $candidateProjectId"
            return $candidateProjectId
        }

        $details = Get-CommandFailureDetails -Result $result

        if (Test-GcpProjectExists -ProjectId $candidateProjectId) {
            Write-Warn "GCP project $candidateProjectId already exists. Trying to add Firebase to the existing project."
            $addFirebaseResult = Invoke-CliCommand -FilePath $script:FirebaseCommand -Arguments @("projects:addfirebase", $candidateProjectId) -StreamOutput
            if ($addFirebaseResult.ExitCode -eq 0) {
                Write-OK "Enabled Firebase for existing project: $candidateProjectId"
                return $candidateProjectId
            }

            $addFirebaseDetails = Get-CommandFailureDetails -Result $addFirebaseResult
            if (Test-ProjectIdConflict -Details $addFirebaseDetails) {
                Write-Warn "Project id $candidateProjectId is not available for this account. Trying next candidate."
                continue
            }

            if (-not [string]::IsNullOrWhiteSpace($addFirebaseDetails)) {
                Write-Warn $addFirebaseDetails
            }
            throw "Failed to add Firebase to existing project $candidateProjectId"
        }

        if (-not [string]::IsNullOrWhiteSpace($script:GCloudCommand)) {
            if (Test-ProjectIdConflict -Details $details) {
                Write-Warn "Project id $candidateProjectId is already taken globally. Trying next candidate."
                continue
            }

            Write-Warn "Firebase project create failed. Trying GCP project creation plus Firebase enablement."
            $gcpProjectCreated = Ensure-GcpProject -ProjectId $candidateProjectId -DisplayName $DisplayName
            if (-not $gcpProjectCreated) {
                Write-Warn "Project id $candidateProjectId is already taken at the GCP level. Trying next candidate."
                continue
            }
            $addFirebaseFromNewGcp = Invoke-CliCommand -FilePath $script:FirebaseCommand -Arguments @("projects:addfirebase", $candidateProjectId) -StreamOutput
            if ($addFirebaseFromNewGcp.ExitCode -eq 0) {
                Write-OK "Created GCP project and enabled Firebase: $candidateProjectId"
                return $candidateProjectId
            }

            $addFirebaseFromNewGcpDetails = Get-CommandFailureDetails -Result $addFirebaseFromNewGcp
            if (Test-ProjectIdConflict -Details $addFirebaseFromNewGcpDetails) {
                Write-Warn "Project id $candidateProjectId is not available after GCP fallback. Trying next candidate."
                continue
            }
            if (-not [string]::IsNullOrWhiteSpace($addFirebaseFromNewGcpDetails)) {
                Write-Warn $addFirebaseFromNewGcpDetails
            }
            throw "Failed to enable Firebase for new GCP project $candidateProjectId"
        }

        if (-not [string]::IsNullOrWhiteSpace($details)) {
            Write-Warn $details
        }
        if (Test-ProjectIdConflict -Details $details) {
            Write-Warn "Project id $candidateProjectId is already taken globally. Trying next candidate."
            continue
        }
        throw "Failed to create Firebase project $candidateProjectId"
    }

    throw "Could not find an available Firebase project id for requested base '$ProjectId'."
}

function Ensure-HostingSite {
    param(
        [string]$ProjectId,
        [string]$SiteId
    )

    $siteListResult = Invoke-FirebaseCommand -Arguments @("hosting:sites:list", "--project", $ProjectId, "--json")
    if ($siteListResult.ExitCode -eq 0 -and -not [string]::IsNullOrWhiteSpace($siteListResult.StdOut)) {
        $siteParsed = $siteListResult.StdOut | ConvertFrom-Json
        $sites = @()
        if ($siteParsed.result) { $sites = @($siteParsed.result) }
        elseif ($siteParsed.sites) { $sites = @($siteParsed.sites) }

        if ($sites | Where-Object { $_.name -match "/sites/$SiteId$" -or $_.site -eq $SiteId -or $_.defaultUrl -match "$SiteId" }) {
            Write-OK "Hosting site already exists for $ProjectId"
            return
        }
    }

    Write-Step "Ensuring Hosting site for $ProjectId"
    $createResult = Invoke-CliCommand -FilePath $script:FirebaseCommand -Arguments @("hosting:sites:create", $SiteId, "--project", $ProjectId) -StreamOutput
    if ($createResult.ExitCode -ne 0) {
        $details = Get-CommandFailureDetails -Result $createResult
        if (Test-AlreadyExistsMessage -Details $details) {
            Write-OK "Hosting site already exists for $ProjectId"
            return
        }
        if (-not [string]::IsNullOrWhiteSpace($details)) {
            Write-Warn $details
        }
        Write-Warn "Could not create hosting site $SiteId. If Hosting is already enabled, this can be okay."
        return
    }
    Write-OK "Hosting site ready: $SiteId"
}

function Update-FirebasercAliases {
    param(
        [string]$Path,
        [string]$DevAliasProjectId,
        [string]$UatAliasProjectId
    )

    $firebaserc = @{
        projects = @{
            default = $DevAliasProjectId
            dev = $DevAliasProjectId
            uat = $UatAliasProjectId
        }
        targets = @{}
        etags = @{}
    }

    if (Test-Path $Path) {
        $existing = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
        if ($null -ne $existing.targets) { $firebaserc.targets = $existing.targets }
        if ($null -ne $existing.etags) { $firebaserc.etags = $existing.etags }
    }

    $json = $firebaserc | ConvertTo-Json -Depth 10
    Set-Content -LiteralPath $Path -Value $json
    Write-OK "Updated .firebaserc aliases"
}

function Remove-GcpProject {
    param([string]$ProjectId)

    Write-Step "Deleting project $ProjectId"
    $result = Invoke-GCloudCommand -Arguments @("projects", "delete", $ProjectId, "--quiet")
    if ($result.ExitCode -ne 0) {
        $details = Get-CommandFailureDetails -Result $result
        if (-not [string]::IsNullOrWhiteSpace($details)) {
            Write-Warn $details
        }
        throw "Failed to delete project $ProjectId"
    }
    Write-OK "Delete requested for project: $ProjectId"
}

$firebaseRoot = Split-Path -Parent $PSScriptRoot
$projectRoot = Split-Path -Parent $firebaseRoot
$firebasercPath = Join-Path $projectRoot ".firebaserc"
$setupGitHubEnvScript = Join-Path $projectRoot "scripts\\setup-firebase-github-env.ps1"

try {
    Ensure-Command "firebase"
    $script:FirebaseCommand = Resolve-NativeCommandPath "firebase"

    if (Get-Command "gcloud" -ErrorAction SilentlyContinue) {
        $script:GCloudCommand = Resolve-NativeCommandPath "gcloud"
    }

    if ($Action -eq "delete") {
        Ensure-Command "gcloud"
        $script:GCloudCommand = Resolve-NativeCommandPath "gcloud"
    }

    if ($SyncGitHubEnv) {
        Ensure-Command "gh"
    }

    Write-Step "Reading current Firebase projects"
    $projects = Get-FirebaseProjectList
    Write-OK "Loaded $($projects.Count) Firebase projects"

    if ($Action -eq "status") {
        $devExists = Test-FirebaseProjectExists -Projects $projects -ProjectId $DevProjectId
        $uatExists = Test-FirebaseProjectExists -Projects $projects -ProjectId $UatProjectId

        Write-Host "DEV project id: $DevProjectId"
        Write-Host "DEV exists: $devExists"
        Write-Host "UAT project id: $UatProjectId"
        Write-Host "UAT exists: $uatExists"
        Write-Host "Local aliases file: $firebasercPath"
        exit 0
    }

    if ($Action -eq "ensure") {
        $resolvedDevProjectId = Ensure-FirebaseProject -Projects $projects -ProjectId $DevProjectId -DisplayName $DevDisplayName -EnvironmentName "dev"
        $projects = Get-FirebaseProjectList
        $resolvedUatProjectId = Ensure-FirebaseProject -Projects $projects -ProjectId $UatProjectId -DisplayName $UatDisplayName -EnvironmentName "uat"

        if (-not $SkipFirebasercUpdate) {
            Write-Step "Updating local Firebase aliases"
            Update-FirebasercAliases -Path $firebasercPath -DevAliasProjectId $resolvedDevProjectId -UatAliasProjectId $resolvedUatProjectId
        }

        if ($CreateHostingSites) {
            Ensure-HostingSite -ProjectId $resolvedDevProjectId -SiteId $resolvedDevProjectId
            Ensure-HostingSite -ProjectId $resolvedUatProjectId -SiteId $resolvedUatProjectId
        }

        if ($SyncGitHubEnv) {
            if (-not (Test-Path $setupGitHubEnvScript)) {
                throw "Could not find setup-firebase-github-env.ps1 at $setupGitHubEnvScript"
            }

            Write-Step "Syncing GitHub Firebase variables from .firebaserc"
            & powershell.exe -File $setupGitHubEnvScript -Repo $Repo
            if ($LASTEXITCODE -ne 0) {
                throw "Failed to sync GitHub Firebase env values."
            }
            Write-OK "GitHub Firebase variables synced"
        }

        Write-Step "Done"
        Write-Host "DEV project: $resolvedDevProjectId" -ForegroundColor Green
        Write-Host "UAT project: $resolvedUatProjectId" -ForegroundColor Green
        exit 0
    }

    if ($Action -eq "delete") {
        if (-not $DeleteDev -and -not $DeleteUat) {
            throw "For delete mode, pass -DeleteDev and/or -DeleteUat."
        }

        if (-not $Force) {
            throw "Delete mode requires -Force so project deletion is explicit."
        }

        if ($DeleteDev) {
            Remove-GcpProject -ProjectId $DevProjectId
        }

        if ($DeleteUat) {
            Remove-GcpProject -ProjectId $UatProjectId
        }

        Write-Step "Delete requests submitted"
        exit 0
    }
}
catch {
    Write-Warn $_.Exception.Message
    throw
}
