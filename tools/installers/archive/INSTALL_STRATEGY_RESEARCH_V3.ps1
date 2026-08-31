param(
  [string]$LabRoot = "C:\Users\18871\Desktop\BTCUSDT_Price_Action_Lab"
)
$ErrorActionPreference="Stop"
$PatchRoot=Split-Path -Parent $MyInvocation.MyCommand.Path
if(-not(Test-Path (Join-Path $LabRoot ".git"))){throw "Price Action Lab not found: $LabRoot"}

Write-Host "=== INSTALL PRICE ACTION LAB STRATEGY RESEARCH V3 ===" -ForegroundColor Cyan
Write-Host "Blind Replay + causal snapshots + Setup/Veto + MFE/MAE + similarity." -ForegroundColor Yellow
Write-Host "NO market data will be downloaded to this PC." -ForegroundColor Green

Set-Location $LabRoot
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$backup=Join-Path $env:LOCALAPPDATA "BTCUSDT_Price_Action_Lab_strategy_v3_backup_$stamp"
New-Item -ItemType Directory -Path $backup -Force|Out-Null

$files=@("index.html","src\main.js","src\style.css","src\research.js","src\research_ui.js","tests\research_smoke.mjs")
foreach($rel in $files){
  $old=Join-Path $LabRoot $rel
  if(Test-Path $old){$dst=Join-Path $backup $rel;New-Item -ItemType Directory -Path (Split-Path $dst -Parent) -Force|Out-Null;Copy-Item $old $dst -Force}
}

Write-Host "[1/3] Installing Strategy Research V3 frontend..." -ForegroundColor Cyan
Get-ChildItem (Join-Path $PatchRoot "payload") -Force | ForEach-Object {Copy-Item $_.FullName $LabRoot -Recurse -Force}

Write-Host "[2/3] Validating + committing code..." -ForegroundColor Cyan
node --check .\src\research.js
if($LASTEXITCODE -ne 0){throw "research.js syntax failed"}
node --check .\src\research_ui.js
if($LASTEXITCODE -ne 0){throw "research_ui.js syntax failed"}
node --check .\src\main.js
if($LASTEXITCODE -ne 0){throw "main.js syntax failed"}
node .\tests\research_smoke.mjs
if($LASTEXITCODE -ne 0){throw "research smoke test failed"}

git add index.html src/main.js src/style.css src/research.js src/research_ui.js tests/research_smoke.mjs
$changes=git status --porcelain
if($changes){
  git commit -m "Add causal strategy research lab and blind replay"
  if($LASTEXITCODE -ne 0){throw "git commit failed"}
}

Write-Host "[3/3] Push code..." -ForegroundColor Cyan
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
  Set-Content ".\.pending_push" "$(Get-Date -Format o) pending strategy-v3 push"
  Write-Host "V3 INSTALLED LOCALLY. GitHub synchronization is pending." -ForegroundColor Yellow
  Write-Host "No market data was downloaded locally. Later run .\PUSH_PENDING.ps1" -ForegroundColor Green
  exit 0
}

Write-Host ""
Write-Host "STRATEGY RESEARCH V3 INSTALLED + PUSHED" -ForegroundColor Green
Write-Host "GitHub Actions will rebuild Pages using the existing cloud Binance data workflow." -ForegroundColor Green
Write-Host "Pages: https://sunhshun811-collab.github.io/BTCUSDT_Price_Action_Lab/" -ForegroundColor Yellow
Write-Host "Backup: $backup" -ForegroundColor DarkGray
