param(
    [string]$ProjectRoot = "C:\Users\18871\Desktop\BTCUSDT_Quant_Research_Kit"
)

$ErrorActionPreference = "Stop"

Remove-Item "HKCU:\Software\Classes\.btcquantjob" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "HKCU:\Software\Classes\BTCQuant.Job" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "HKCU:\Software\Classes\btcquant" -Recurse -Force -ErrorAction SilentlyContinue

& code --uninstall-extension shs-local.btcquant-chatgpt-launcher 2>$null

Remove-Item (Join-Path $env:USERPROFILE ".btcquant-launcher") -Recurse -Force -ErrorAction SilentlyContinue

$runnerDir = Join-Path $ProjectRoot "tools\chatgpt_runner"
if (Test-Path -LiteralPath $runnerDir) {
    Remove-Item -LiteralPath $runnerDir -Recurse -Force
}

Write-Host "BTC Quant launcher uninstalled." -ForegroundColor Green
