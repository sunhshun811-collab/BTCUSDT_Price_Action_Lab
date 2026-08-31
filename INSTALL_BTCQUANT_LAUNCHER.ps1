param(
    [string]$ProjectRoot = "C:\Users\18871\Desktop\BTCUSDT_Quant_Research_Kit"
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    Write-Host "[BTCQuant Bootstrap] $Message" -ForegroundColor Cyan
}

Write-Step "Checking project root..."
if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    throw "Project root not found: $ProjectRoot"
}

$codeCmd = Get-Command code -ErrorAction SilentlyContinue
if (-not $codeCmd) {
    throw "VS Code CLI 'code' was not found in PATH. In VS Code, enable/install the 'code' shell command, then rerun this installer."
}

$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitCmd) {
    throw "git was not found in PATH."
}

$runnerDir = Join-Path $ProjectRoot "tools\chatgpt_runner"
New-Item -ItemType Directory -Force -Path $runnerDir | Out-Null

Write-Step "Installing local runner into project..."
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "runner\RUN_JOB_PACKAGE.ps1") -Destination $runnerDir -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "runner\OPEN_JOB_FILE.ps1") -Destination $runnerDir -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "runner\OPEN_BTCQUANT_URI.ps1") -Destination $runnerDir -Force

$configDir = Join-Path $env:USERPROFILE ".btcquant-launcher"
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
$configPath = Join-Path $configDir "config.json"
@{
    projectRoot = $ProjectRoot
    runnerPath = (Join-Path $runnerDir "RUN_JOB_PACKAGE.ps1")
} | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8

Write-Step "Installing VS Code URI extension..."
$vsix = Join-Path $PSScriptRoot "btcquant-chatgpt-launcher-0.1.0.vsix"
& code --install-extension $vsix --force
if ($LASTEXITCODE -ne 0) {
    throw "VS Code extension installation failed with exit code $LASTEXITCODE"
}

Write-Step "Registering .btcquantjob file association..."
$jobClass = "BTCQuant.Job"
New-Item -Path "HKCU:\Software\Classes\.btcquantjob" -Force | Out-Null
Set-Item -Path "HKCU:\Software\Classes\.btcquantjob" -Value $jobClass

New-Item -Path "HKCU:\Software\Classes\$jobClass" -Force | Out-Null
Set-Item -Path "HKCU:\Software\Classes\$jobClass" -Value "BTC Quant ChatGPT Job"

New-Item -Path "HKCU:\Software\Classes\$jobClass\shell\open\command" -Force | Out-Null
$openJob = Join-Path $runnerDir "OPEN_JOB_FILE.ps1"
$jobCommand = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + $openJob + '" "%1"'
Set-Item -Path "HKCU:\Software\Classes\$jobClass\shell\open\command" -Value $jobCommand

Write-Step "Registering btcquant:// protocol..."
New-Item -Path "HKCU:\Software\Classes\btcquant" -Force | Out-Null
Set-Item -Path "HKCU:\Software\Classes\btcquant" -Value "URL:BTC Quant Protocol"
New-ItemProperty -Path "HKCU:\Software\Classes\btcquant" -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null

New-Item -Path "HKCU:\Software\Classes\btcquant\shell\open\command" -Force | Out-Null
$openUri = Join-Path $runnerDir "OPEN_BTCQUANT_URI.ps1"
$uriCommand = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + $openUri + '" "%1"'
Set-Item -Path "HKCU:\Software\Classes\btcquant\shell\open\command" -Value $uriCommand

Write-Step "Checking Git repository..."
Push-Location $ProjectRoot
try {
    & git rev-parse --is-inside-work-tree | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "ProjectRoot is not a Git repository."
    }

    $remote = (& git remote get-url origin 2>$null)
    if ($LASTEXITCODE -eq 0 -and $remote) {
        Write-Host "Git origin: $remote" -ForegroundColor Green
    } else {
        Write-Warning "No Git origin found. Local jobs will run, but auto-push cannot work until origin is configured."
    }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Bootstrap installed successfully." -ForegroundColor Green
Write-Host "Next: double-click TEST_LAUNCHER.btcquantjob from this package." -ForegroundColor Yellow
Write-Host "A VS Code integrated terminal should open and run the self-test." -ForegroundColor Yellow
