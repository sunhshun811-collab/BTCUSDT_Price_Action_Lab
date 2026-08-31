$ErrorActionPreference="Stop"
Remove-Item "HKCU:\Software\Classes\.btcquantjob" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "HKCU:\Software\Classes\BTCQuant.Job" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "HKCU:\Software\Classes\btcquant" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $env:USERPROFILE ".btcquant-launcher") -Recurse -Force -ErrorAction SilentlyContinue
if (Get-Command code -ErrorAction SilentlyContinue) {
    & code --uninstall-extension shs-local.btcquant-chatgpt-launcher 2>$null
}
Write-Host "Local launcher registrations removed. Repository source preserved." -ForegroundColor Green
