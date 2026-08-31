param(
    [Parameter(Mandatory=$true)]
    [string]$PackagePath
)
$ErrorActionPreference = "Stop"

function Log([string]$Message) {
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$stamp] $Message"
    Write-Host $line
    if ($script:LogFile) {
        Add-Content -LiteralPath $script:LogFile -Value $line -Encoding UTF8
    }
}
function Resolve-SafeChildPath([string]$Root, [string]$RelativePath) {
    if ([string]::IsNullOrWhiteSpace($RelativePath)) { throw "Empty relative path is not allowed." }
    if ([System.IO.Path]::IsPathRooted($RelativePath)) { throw "Absolute path is not allowed: $RelativePath" }
    $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
    $candidate = [System.IO.Path]::GetFullPath((Join-Path $Root $RelativePath))
    if (-not $candidate.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Path escapes project root: $RelativePath"
    }
    return $candidate
}

if (-not (Test-Path -LiteralPath $PackagePath)) { throw "Job package not found: $PackagePath" }
$configPath = Join-Path $env:USERPROFILE ".btcquant-launcher\config.json"
if (-not (Test-Path -LiteralPath $configPath)) { throw "Launcher config not found." }
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$ProjectRoot = [string]$config.projectRoot
if (-not (Test-Path -LiteralPath $ProjectRoot)) { throw "Configured project root does not exist: $ProjectRoot" }

$tempRoot = Join-Path $env:TEMP ("btcquant_job_" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($PackagePath, $tempRoot)
    $job = Get-Content -LiteralPath (Join-Path $tempRoot "job.json") -Raw | ConvertFrom-Json
    if ($job.schema -ne "btcquant.job.v1") { throw "Unsupported job schema." }

    $projectName = Split-Path -Leaf $ProjectRoot
    $logDir = Join-Path $env:LOCALAPPDATA ("BTCQuant\logs\" + $projectName)
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $script:LogFile = Join-Path $logDir (([string]$job.job_id) + "_" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".log")

    Log "Job: $($job.job_id)"
    Log "Package: $PackagePath"
    Log "Project: $ProjectRoot"

    Push-Location $ProjectRoot
    try {
        & git rev-parse --is-inside-work-tree | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "ProjectRoot is not a Git repository." }

        if (-not [bool]$job.allow_dirty) {
            $dirty = @(& git status --porcelain)
            if ($dirty.Count -gt 0) { throw "Working tree is dirty." }
        }

        $payloadRoot = Join-Path $tempRoot "payload"
        if (Test-Path -LiteralPath $payloadRoot) {
            Log "Applying payload..."
            Get-ChildItem -LiteralPath $payloadRoot -Recurse -File | ForEach-Object {
                $relative = $_.FullName.Substring($payloadRoot.Length).TrimStart('\','/')
                $dest = Resolve-SafeChildPath $ProjectRoot $relative
                New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
                Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
                Log "APPLY $relative"
            }
        }

        if ([string]$job.mode -eq "self_test") {
            Log "SELF_TEST_OK"
            exit 0
        }

        $entry = Resolve-SafeChildPath $ProjectRoot ([string]$job.entry_script)
        Log "Running entry script: $($job.entry_script)"
        & powershell -NoProfile -ExecutionPolicy Bypass -File $entry
        if ($LASTEXITCODE -ne 0) { throw "Entry script failed with exit code $LASTEXITCODE" }

        Log "Entry script completed successfully."

        if ([bool]$job.auto_commit) {
            & git add -A
            if ($LASTEXITCODE -ne 0) { throw "git add failed." }
            & git diff --cached --quiet
            if ($LASTEXITCODE -ne 0) {
                $message = [string]$job.commit_message
                if ([string]::IsNullOrWhiteSpace($message)) { $message = "chatgpt-job: $($job.job_id)" }
                Log "Creating commit: $message"
                & git commit -m $message
                if ($LASTEXITCODE -ne 0) { throw "git commit failed." }
            }
            if ([bool]$job.auto_push) {
                for ($i=1; $i -le 4; $i++) {
                    Log "Pushing to origin (attempt $i/4)..."
                    & git push origin HEAD
                    if ($LASTEXITCODE -eq 0) { Log "Push succeeded."; break }
                    if ($i -eq 4) { throw "git push failed after 4 attempts." }
                    Start-Sleep -Seconds (5*$i)
                }
            }
        }
        Log "JOB_OK"
    } finally {
        Pop-Location
    }
}
catch {
    if ($script:LogFile) { Log ("JOB_FAILED: " + $_.Exception.Message) }
    throw
}
finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
