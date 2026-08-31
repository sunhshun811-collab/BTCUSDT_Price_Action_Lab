param([string]$ProjectRoot = "")
$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}
$root = Join-Path $ProjectRoot "tools\btcquant_launcher"
$runner = Join-Path $root "runner"
$vsix = Join-Path $root "dist\btcquant-chatgpt-launcher-0.1.0.vsix"
if (-not (Test-Path $vsix)) { throw "VSIX missing: $vsix" }
if (-not (Get-Command code -ErrorAction SilentlyContinue)) { throw "VS Code CLI 'code' not found." }
& code --install-extension $vsix --force
if ($LASTEXITCODE -ne 0) { throw "VSIX install failed." }

$configDir = Join-Path $env:USERPROFILE ".btcquant-launcher"
New-Item -ItemType Directory -Force $configDir | Out-Null
@{projectRoot=$ProjectRoot; runnerPath=(Join-Path $runner "RUN_JOB_PACKAGE.ps1")} |
 ConvertTo-Json | Set-Content (Join-Path $configDir "config.json") -Encoding UTF8

$jobClass="BTCQuant.Job"
New-Item "HKCU:\Software\Classes\.btcquantjob" -Force | Out-Null
Set-Item "HKCU:\Software\Classes\.btcquantjob" $jobClass
New-Item "HKCU:\Software\Classes\$jobClass\shell\open\command" -Force | Out-Null
Set-Item "HKCU:\Software\Classes\$jobClass\shell\open\command" `
 ('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $runner "OPEN_JOB_FILE.ps1")+'" "%1"')

New-Item "HKCU:\Software\Classes\btcquant" -Force | Out-Null
Set-Item "HKCU:\Software\Classes\btcquant" "URL:BTC Quant Protocol"
New-ItemProperty "HKCU:\Software\Classes\btcquant" -Name "URL Protocol" -Value "" -Force | Out-Null
New-Item "HKCU:\Software\Classes\btcquant\shell\open\command" -Force | Out-Null
Set-Item "HKCU:\Software\Classes\btcquant\shell\open\command" `
 ('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $runner "OPEN_BTCQUANT_URI.ps1")+'" "%1"')
Write-Host "BTCQuant launcher installed from repository." -ForegroundColor Green
