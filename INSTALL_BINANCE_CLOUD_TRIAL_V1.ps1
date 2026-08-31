param(
  [string]$LabRoot = "C:\Users\18871\Desktop\BTCUSDT_Price_Action_Lab"
)
$ErrorActionPreference="Stop"
$PatchRoot=Split-Path -Parent $MyInvocation.MyCommand.Path

if(-not(Test-Path (Join-Path $LabRoot ".git"))){throw "Price Action Lab not found: $LabRoot"}

Write-Host "=== INSTALL BINANCE CLOUD DATA TRIAL V1 ===" -ForegroundColor Cyan
Write-Host "NO market data will be downloaded to this PC." -ForegroundColor Yellow
Write-Host "GitHub Actions will fetch Binance public data in the cloud." -ForegroundColor Yellow

Set-Location $LabRoot
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$backup=Join-Path $env:LOCALAPPDATA "BTCUSDT_Price_Action_Lab_cloud_trial_backup_$stamp"
New-Item -ItemType Directory -Path $backup -Force|Out-Null

foreach($rel in @(
  "scripts\build_binance_cloud_trial.py",
  ".github\workflows\deploy-pages.yml",
  "src\data.js","src\main.js","src\context.js","src\style.css","index.html"
)){
  $src=Join-Path $LabRoot $rel
  if(Test-Path $src){
    $dst=Join-Path $backup $rel
    New-Item -ItemType Directory -Path (Split-Path $dst -Parent) -Force|Out-Null
    Copy-Item $src $dst -Force
  }
}

Write-Host "[1/3] Installing cloud data builder + visualization..." -ForegroundColor Cyan
Get-ChildItem (Join-Path $PatchRoot "payload") -Force | ForEach-Object {
  Copy-Item $_.FullName $LabRoot -Recurse -Force
}

Write-Host "[2/3] Commit code only..." -ForegroundColor Cyan
git add scripts/build_binance_cloud_trial.py .github/workflows/deploy-pages.yml src/data.js src/main.js src/context.js src/style.css index.html
$changes=git status --porcelain
if($changes){
  git commit -m "Add Binance cloud trial derivatives context"
  if($LASTEXITCODE -ne 0){throw "git commit failed"}
}

Write-Host "[3/3] Push code; market data will be fetched by GitHub Actions..." -ForegroundColor Cyan
$ok=$false
for($i=1;$i -le 10;$i++){
  $old=$ErrorActionPreference;$ErrorActionPreference="Continue"
  git -c http.version=HTTP/1.1 push origin main
  $code=$LASTEXITCODE
  $ErrorActionPreference=$old
  if($code -eq 0){$ok=$true;break}
  Write-Host "GitHub temporarily unreachable; attempt $i / 10..." -ForegroundColor Yellow
  Start-Sleep -Seconds ([Math]::Min(45,5*$i))
}
if(-not $ok){
  Set-Content ".\.pending_push" "$(Get-Date -Format o) pending cloud-trial code push"
  Write-Host "INSTALL SUCCEEDED LOCALLY. GitHub push is pending." -ForegroundColor Yellow
  Write-Host "No market data was downloaded locally." -ForegroundColor Green
  Write-Host "Later run .\PUSH_PENDING.ps1" -ForegroundColor Yellow
  exit 0
}

Write-Host ""
Write-Host "BINANCE CLOUD TRIAL V1 INSTALLED + PUSHED" -ForegroundColor Green
Write-Host "GitHub Actions now downloads the previous complete month entirely in the cloud." -ForegroundColor Green
Write-Host "Pages: https://sunhshun811-collab.github.io/BTCUSDT_Price_Action_Lab/" -ForegroundColor Yellow
Write-Host "Backup: $backup" -ForegroundColor DarkGray
