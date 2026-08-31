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
    if ([string]::IsNullOrWhiteSpace($RelativePath)) {
        throw "Empty relative path is not allowed."
    }
    if ([System.IO.Path]::IsPathRooted($RelativePath)) {
        throw "Absolute path is not allowed in job package: $RelativePath"
    }

    $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
    $candidate = [System.IO.Path]::GetFullPath((Join-Path $Root $RelativePath))
    if (-not $candidate.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Path escapes project root: $RelativePath"
    }
    return $candidate
}

if (-not (Test-Path -LiteralPath $PackagePath)) {
    throw "Job package not found: $PackagePath"
}

if ([System.IO.Path]::GetExtension($PackagePath) -ne ".btcquantjob") {
    throw "Expected a .btcquantjob package."
}

$configPath = Join-Path $env:USERPROFILE ".btcquant-launcher\config.json"
if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Launcher config not found. Run INSTALL_BTCQUANT_LAUNCHER.ps1 first."
}
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$ProjectRoot = [string]$config.projectRoot

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    throw "Configured project root does not exist: $ProjectRoot"
}

$tempRoot = Join-Path $env:TEMP ("btcquant_job_" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($PackagePath, $tempRoot)

    $manifestPath = Join-Path $tempRoot "job.json"
    if (-not (Test-Path -LiteralPath $manifestPath)) {
        throw "job.json missing from package."
    }

    $job = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($job.schema -ne "btcquant.job.v1") {
        throw "Unsupported job schema: $($job.schema)"
    }

    $jobId = [string]$job.job_id
    if ($jobId -notmatch '^[A-Za-z0-9._-]{1,80}$') {
        throw "Invalid job_id."
    }

    $logDir = Join-Path $ProjectRoot "research_logs\chatgpt_jobs"
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $script:LogFile = Join-Path $logDir ($jobId + "_" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".log")

    Log "Job: $jobId"
    Log "Package: $PackagePath"
    Log "Project: $ProjectRoot"

    Push-Location $ProjectRoot
    try {
        & git rev-parse --is-inside-work-tree | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "ProjectRoot is not a Git repository." }

        $allowDirty = [bool]$job.allow_dirty
        $dirtyBefore = @(& git status --porcelain)
        if (-not $allowDirty -and $dirtyBefore.Count -gt 0) {
            Log "Refusing to run because the repository already has uncommitted changes."
            $dirtyBefore | ForEach-Object { Log "DIRTY: $_" }
            throw "Working tree is dirty. Commit/stash existing changes first, or use an explicitly trusted job with allow_dirty=true."
        }

        if ([string]$job.mode -eq "self_test") {
            Log "Self-test mode: VS Code launcher and local runner are working."
            $origin = (& git remote get-url origin 2>$null)
            if ($LASTEXITCODE -eq 0 -and $origin) {
                Log "Git origin detected: $origin"
            } else {
                Log "Git origin not configured; auto-push will not work yet."
            }
            Log "SELF_TEST_OK"
            exit 0
        }

        $payloadRoot = Join-Path $tempRoot "payload"
        if (Test-Path -LiteralPath $payloadRoot) {
            Log "Applying payload..."
            Get-ChildItem -LiteralPath $payloadRoot -Recurse -File | ForEach-Object {
                $relative = $_.FullName.Substring($payloadRoot.Length).TrimStart('\','/')
                $dest = Resolve-SafeChildPath -Root $ProjectRoot -RelativePath $relative
                $destDir = Split-Path -Parent $dest
                New-Item -ItemType Directory -Force -Path $destDir | Out-Null
                Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
                Log "APPLY $relative"
            }
        }

        $entry = [string]$job.entry_script
        if ([string]::IsNullOrWhiteSpace($entry)) {
            throw "entry_script is required for non-self-test jobs."
        }
        $entryPath = Resolve-SafeChildPath -Root $ProjectRoot -RelativePath $entry
        if (-not (Test-Path -LiteralPath $entryPath)) {
            throw "Entry script not found after payload apply: $entry"
        }

        $kind = [string]$job.entry_kind
        $args = @()
        if ($job.entry_args) {
            foreach ($a in $job.entry_args) { $args += [string]$a }
        }

        Log "Running entry script: $entry"
        if ($kind -eq "python") {
            & python $entryPath @args
        } elseif ($kind -eq "powershell" -or [string]::IsNullOrWhiteSpace($kind)) {
            & powershell -NoProfile -ExecutionPolicy Bypass -File $entryPath @args
        } else {
            throw "Unsupported entry_kind: $kind"
        }

        if ($LASTEXITCODE -ne 0) {
            throw "Entry script failed with exit code $LASTEXITCODE"
        }

        Log "Entry script completed successfully."

        if ([bool]$job.auto_commit) {
            $gitAdd = @()
            if ($job.git_add) {
                foreach ($p in $job.git_add) {
                    $safe = Resolve-SafeChildPath -Root $ProjectRoot -RelativePath ([string]$p)
                    $gitAdd += $safe
                }
            }

            if ($gitAdd.Count -gt 0) {
                Log "Staging selected paths..."
                & git add -- $gitAdd
            } else {
                Log "Staging all repository changes..."
                & git add -A
            }
            if ($LASTEXITCODE -ne 0) { throw "git add failed." }

            & git diff --cached --quiet
            $hasStaged = ($LASTEXITCODE -ne 0)

            if ($hasStaged) {
                $message = [string]$job.commit_message
                if ([string]::IsNullOrWhiteSpace($message)) {
                    $message = "chatgpt-job: $jobId"
                }
                Log "Creating commit: $message"
                & git commit -m $message
                if ($LASTEXITCODE -ne 0) { throw "git commit failed." }

                if ([bool]$job.auto_push) {
                    Log "Pushing to origin..."
                    & git push origin HEAD
                    if ($LASTEXITCODE -ne 0) { throw "git push failed." }
                    Log "Push succeeded. GitHub Actions configured for this branch/push can now run."
                }
            } else {
                Log "No staged changes; skipping commit/push."
            }
        } else {
            Log "auto_commit=false; Git changes were not committed."
        }

        Log "JOB_OK"
    }
    finally {
        Pop-Location
    }
}
catch {
    if ($script:LogFile) { Log ("JOB_FAILED: " + $_.Exception.Message) }
    throw
}
finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
