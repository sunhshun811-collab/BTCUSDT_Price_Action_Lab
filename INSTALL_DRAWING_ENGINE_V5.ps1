param(
  [string]$LabRoot = "C:\Users\18871\Desktop\BTCUSDT_Price_Action_Lab"
)
$ErrorActionPreference="Stop"
$PatchRoot=Split-Path -Parent $MyInvocation.MyCommand.Path
if(-not(Test-Path (Join-Path $LabRoot ".git"))){throw "Price Action Lab not found: $LabRoot"}

Write-Host "=== INSTALL DRAWING ENGINE V5 ===" -ForegroundColor Cyan
Write-Host "Rough drag -> automatic structural A/B calibration -> confirm." -ForegroundColor Yellow
Write-Host "This also replaces the unreliable second-click trendline workflow." -ForegroundColor Yellow
Write-Host "Local Node.js is NOT required." -ForegroundColor Green
Write-Host "NO market data will be downloaded to this PC." -ForegroundColor Green

Set-Location $LabRoot
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$backup=Join-Path $env:LOCALAPPDATA "BTCUSDT_Price_Action_Lab_drawing_v5_backup_$stamp"
New-Item -ItemType Directory -Path $backup -Force|Out-Null

$files=@(
  "index.html","src\main.js","src\style.css","src\drawing_engine.js",
  "src\trendline_calibration.js","tests\drawing_engine_v5_smoke.mjs"
)
foreach($rel in $files){
  $old=Join-Path $LabRoot $rel
  if(Test-Path $old){
    $dst=Join-Path $backup $rel
    New-Item -ItemType Directory -Path (Split-Path $dst -Parent) -Force|Out-Null
    Copy-Item $old $dst -Force
  }
}

Write-Host "[1/3] Installing validated V5 Drawing Engine..." -ForegroundColor Cyan
Copy-Item (Join-Path $PatchRoot "payload\index.html") (Join-Path $LabRoot "index.html") -Force
foreach($name in @("main.js","style.css","drawing_engine.js","trendline_calibration.js")){
  Copy-Item (Join-Path $PatchRoot "payload\src\$name") (Join-Path $LabRoot "src\$name") -Force
}
New-Item -ItemType Directory -Path (Join-Path $LabRoot "tests") -Force|Out-Null
Copy-Item (Join-Path $PatchRoot "payload\tests\drawing_engine_v5_smoke.mjs") (Join-Path $LabRoot "tests\drawing_engine_v5_smoke.mjs") -Force

Write-Host "[2/3] Commit code..." -ForegroundColor Cyan
git add index.html src/main.js src/style.css src/drawing_engine.js src/trendline_calibration.js tests/drawing_engine_v5_smoke.mjs
$changes=git status --porcelain
if($changes){
  git commit -m "Replace trendline clicks with auto-calibrated drag drawing"
  if($LASTEXITCODE -ne 0){throw "git commit failed"}
}else{Write-Host "No new changes to commit." -ForegroundColor DarkGray}

Write-Host "[3/3] Push to GitHub..." -ForegroundColor Cyan
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
  Set-Content ".\.pending_push" "$(Get-Date -Format o) pending drawing-engine-v5 push"
  Write-Host "V5 IS INSTALLED AND COMMITTED LOCALLY." -ForegroundColor Green
  Write-Host "Only GitHub synchronization is pending. Later run .\PUSH_PENDING.ps1" -ForegroundColor Yellow
  exit 0
}
Remove-Item ".\.pending_push" -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "DRAWING ENGINE V5 PUSH COMPLETE" -ForegroundColor Green
Write-Host "GitHub Actions will rebuild and deploy Pages." -ForegroundColor Green
Write-Host "Pages: https://sunhshun811-collab.github.io/BTCUSDT_Price_Action_Lab/" -ForegroundColor Yellow
Write-Host "Backup: $backup" -ForegroundColor DarkGray
