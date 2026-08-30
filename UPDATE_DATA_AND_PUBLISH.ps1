param(
  [string]$Start="2026-01-01T00:00:00Z",
  [string]$Timeframes="8h,4h,1h,15m,5m,1m"
)
$ErrorActionPreference="Stop"
$Root=Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host "=== UPDATE BTCUSDT PRICE ACTION DATA ===" -ForegroundColor Cyan
python .\scripts\fetch_binance_usdm.py --start $Start --timeframes $Timeframes --output ".\public\data"
if($LASTEXITCODE -ne 0){throw "Binance data update failed"}

git add public/data
$changes=git status --porcelain
if($changes){
  git commit -m "Update BTCUSDT market data"
  if($LASTEXITCODE -ne 0){throw "git commit failed"}
}

Write-Host "Local data and Git commit are complete." -ForegroundColor Green
Write-Host "GitHub synchronization is independent from data success." -ForegroundColor DarkGray

$ok=$false
for($i=1;$i -le 8;$i++){
  git -c http.version=HTTP/1.1 push origin main
  if($LASTEXITCODE -eq 0){$ok=$true;break}
  Write-Host "GitHub unavailable; pending push. Retry $i / 8..." -ForegroundColor Yellow
  Start-Sleep -Seconds ([Math]::Min(45,5*$i))
}
if($ok){
  Remove-Item ".\.pending_push" -Force -ErrorAction SilentlyContinue
  Write-Host "GitHub synced. Pages will rebuild automatically." -ForegroundColor Green
}else{
  Set-Content ".\.pending_push" "$(Get-Date -Format o) pending main push"
  Write-Host "DATA UPDATE SUCCEEDED. GitHub is pending because the network is unavailable." -ForegroundColor Yellow
  Write-Host "Run .\PUSH_PENDING.ps1 later; do NOT refetch data." -ForegroundColor Yellow
}
