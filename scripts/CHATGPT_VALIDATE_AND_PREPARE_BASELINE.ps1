$ErrorActionPreference = "Stop"

Write-Host "=== BTCUSDT Price Action Lab: baseline publish V2 ===" -ForegroundColor Cyan

# Refresh PATH inside this process. This fixes VS Code launched by an Explorer
# process that was already running when Node.js was installed.
$machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$env:Path = (($machinePath, $userPath) -join ";")

function Resolve-Executable {
    param(
        [Parameter(Mandatory=$true)][string]$Name,
        [string[]]$Fallbacks = @()
    )

    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }

    foreach ($candidate in $Fallbacks) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return $candidate
        }
    }

    throw "Required command not found: $Name"
}

$GitExe = Resolve-Executable -Name "git" -Fallbacks @(
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Program Files\Git\bin\git.exe"
)

$NodeExe = Resolve-Executable -Name "node" -Fallbacks @(
    "C:\Program Files\nodejs\node.exe",
    (Join-Path $env:LOCALAPPDATA "Programs\nodejs\node.exe")
)

Write-Host "Git : $GitExe" -ForegroundColor Green
Write-Host "Node: $NodeExe" -ForegroundColor Green
& $NodeExe --version
if ($LASTEXITCODE -ne 0) { throw "Node environment check failed." }

# Repository policy: keep reproducible source/install/test assets in GitHub;
# ignore only machine-local runtime/log copies.
$gitignore = Join-Path $PWD ".gitignore"
if (-not (Test-Path -LiteralPath $gitignore)) {
    New-Item -ItemType File -Path $gitignore | Out-Null
}

$removeExact = @(
    "TEST_LAUNCHER.btcquantjob",
    "btcquant-chatgpt-launcher-*.vsix",
    "runner/",
    "INSTALL_BTCQUANT_LAUNCHER.ps1",
    "UNINSTALL_BTCQUANT_LAUNCHER.ps1",
    "INSTALL_BINANCE_CLOUD_TRIAL_V1.ps1",
    "INSTALL_DATA_FOUNDATION_V10.ps1",
    "INSTALL_DRAWING_ENGINE_V5.ps1",
    "INSTALL_INTERACTIVE_V2.ps1",
    "INSTALL_STRATEGY_RESEARCH_V3.ps1",
    "INSTALL_STRUCTURE_CASE_V7.ps1",
    "INSTALL_STRUCTURE_CASE_V8.ps1",
    "INSTALL_STRUCTURE_CASE_V9_RESEARCH_UI.ps1",
    "INSTALL_STRUCTURE_ENTRY_V6.ps1",
    "INSTALL_TRENDLINE_INTELLIGENCE_V4.ps1",
    "README_FIRST.txt",
    "RESUME_V3_WITHOUT_NODE.ps1"
)

$removeComments = @(
    "# ChatGPT / BTCQuant local launcher artifacts",
    "# Local ChatGPT / BTCQuant runner",
    "# Local BTCQuant launcher runtime",
    "# Historical local upgrade/install entrypoints",
    "# Machine-local BTCQuant runtime/logs"
)

$existing = @(Get-Content -LiteralPath $gitignore -ErrorAction SilentlyContinue)
$filtered = foreach ($line in $existing) {
    $trimmed = $line.Trim()
    if ($removeExact -contains $trimmed) { continue }
    if ($removeComments -contains $trimmed) { continue }
    if ($trimmed -eq "research_logs/chatgpt_jobs/") { continue }
    if ($trimmed -eq "tools/chatgpt_runner/") { continue }
    $line
}

# Trim excessive trailing blank lines, then append one canonical local-only block.
while ($filtered.Count -gt 0 -and [string]::IsNullOrWhiteSpace($filtered[-1])) {
    if ($filtered.Count -eq 1) { $filtered = @(); break }
    $filtered = $filtered[0..($filtered.Count - 2)]
}

$canonical = @(
    "",
    "# Machine-local BTCQuant runtime/logs",
    "research_logs/chatgpt_jobs/",
    "tools/chatgpt_runner/"
)
@($filtered + $canonical) | Set-Content -LiteralPath $gitignore -Encoding UTF8

Write-Host "Git policy updated: reproducible project assets remain eligible for Git." -ForegroundColor Green

# Run every project smoke test.
$tests = @(Get-ChildItem .\tests\*_smoke.mjs -File -ErrorAction SilentlyContinue | Sort-Object Name)
if ($tests.Count -eq 0) {
    throw "No smoke tests found under tests\*_smoke.mjs"
}

foreach ($test in $tests) {
    Write-Host "`n=== $($test.Name) ===" -ForegroundColor Cyan
    & $NodeExe $test.FullName
    if ($LASTEXITCODE -ne 0) {
        throw "Smoke test failed: $($test.Name)"
    }
}
Write-Host "`nALL SMOKE TESTS PASSED" -ForegroundColor Green

# Refuse obvious local secret/private-key artifacts.
$dangerPatterns = @(
    "*.pem","*.pfx","*.p12",
    ".env",".env.*",
    "id_rsa","id_ed25519"
)
$danger = @()
foreach ($pat in $dangerPatterns) {
    $danger += @(Get-ChildItem -Path . -Recurse -File -Filter $pat -ErrorAction SilentlyContinue |
        Where-Object {
            $_.FullName -notmatch '\\node_modules\\' -and
            $_.FullName -notmatch '\\.git\\'
        })
}
if ($danger.Count -gt 0) {
    Write-Host "Potential secret/private-key files detected:" -ForegroundColor Red
    $danger | ForEach-Object { Write-Host $_.FullName -ForegroundColor Red }
    throw "Refusing to publish until potential secret/private-key files are reviewed."
}

Write-Host "`nBaseline validation complete. Auto-stage/commit/push may proceed." -ForegroundColor Green
