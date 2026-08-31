param(
  [string]$LabRoot = "C:\Users\18871\Desktop\BTCUSDT_Price_Action_Lab"
)
$ErrorActionPreference="Stop"
$PatchRoot=Split-Path -Parent $MyInvocation.MyCommand.Path
if(-not(Test-Path (Join-Path $LabRoot ".git"))){throw "Price Action Lab not found: $LabRoot"}

Write-Host "=== INSTALL PRICE ACTION LAB INTERACTIVE V2 ===" -ForegroundColor Cyan
Write-Host "Features: adaptive ranges + red-up/green-down + upgraded trendline tool." -ForegroundColor Yellow
Write-Host "NO market data will be downloaded to this PC." -ForegroundColor Green

Set-Location $LabRoot
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$backup=Join-Path $env:LOCALAPPDATA "BTCUSDT_Price_Action_Lab_interactive_v2_backup_$stamp"
New-Item -ItemType Directory -Path $backup -Force|Out-Null

$files=@(
  ".github\workflows\deploy-pages.yml",
  "scripts\build_binance_cloud_history.py",
  "src\annotations.js","src\data.js","src\context.js","src\strategy.js","src\main.js","src\style.css","index.html"
)
foreach($rel in $files){
  $old=Join-Path $LabRoot $rel
  if(Test-Path $old){$dst=Join-Path $backup $rel;New-Item -ItemType Directory -Path (Split-Path $dst -Parent) -Force|Out-Null;Copy-Item $old $dst -Force}
}

Write-Host "[1/3] Installing V2 frontend + cloud history builder..." -ForegroundColor Cyan
Get-ChildItem (Join-Path $PatchRoot "payload") -Force | ForEach-Object {Copy-Item $_.FullName $LabRoot -Recurse -Force}

# Retire old single-month builder if tracked.
if(Test-Path ".\scripts\build_binance_cloud_trial.py"){
  git rm -f .\scripts\build_binance_cloud_trial.py 2>$null
  if(Test-Path ".\scripts\build_binance_cloud_trial.py"){Remove-Item ".\scripts\build_binance_cloud_trial.py" -Force}
}

Write-Host "[2/3] Commit code only..." -ForegroundColor Cyan
git add .github/workflows/deploy-pages.yml scripts/build_binance_cloud_history.py src index.html
$changes=git status --porcelain
if($changes){
  git commit -m "Upgrade interactive ranges and trendline workflow"
  if($LASTEXITCODE -ne 0){throw "git commit failed"}
}

Write-Host "[3/3] Push; GitHub Actions will build 12 complete months in the cloud..." -ForegroundColor Cyan
$ok=$false
for($i=1;$i -le 10;$i++){
  $old=$ErrorActionPreference;$ErrorActionPreference="Continue"
  git -c http.version=HTTP/1.1 push origin main
  $code=$LASTEXITCODE;$ErrorActionPreference=$old
  if($code -eq 0){$ok=$true;break}
  Write-Host "GitHub temporarily unreachable; attempt $i / 10..." -ForegroundColor Yellow
  Start-Sleep -Seconds ([Math]::Min(45,5*$i))
}
if(-not $ok){
  Set-Content ".\.pending_push" "$(Get-Date -Format o) pending interactive-v2 push"
  Write-Host "V2 INSTALLED LOCALLY. GitHub synchronization is pending." -ForegroundColor Yellow
  Write-Host "No market data was downloaded locally. Later run .\PUSH_PENDING.ps1" -ForegroundColor Green
  exit 0
}

Write-Host ""
Write-Host "INTERACTIVE V2 INSTALLED + PUSHED" -ForegroundColor Green
Write-Host "GitHub Actions is now rebuilding the Lab with 12 complete months of Binance BTCUSDT Klines." -ForegroundColor Green
Write-Host "Pages: https://sunhshun811-collab.github.io/BTCUSDT_Price_Action_Lab/" -ForegroundColor Yellow
Write-Host "Backup: $backup" -ForegroundColor DarkGray
