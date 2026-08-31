param(
  [string]$LabRoot = "C:\Users\18871\Desktop\BTCUSDT_Price_Action_Lab"
)
$ErrorActionPreference="Stop"
$PatchRoot=Split-Path -Parent $MyInvocation.MyCommand.Path
if(-not(Test-Path (Join-Path $LabRoot ".git"))){throw "Price Action Lab not found: $LabRoot"}

Write-Host "=== INSTALL STRUCTURE CASE V9 RESEARCH UI ===" -ForegroundColor Cyan
Write-Host "Global dates + any-TF Entry Zone + Ideal Entry Zone." -ForegroundColor Yellow
Write-Host "Local Node.js is NOT required." -ForegroundColor Green
Write-Host "NO Binance market data will be downloaded to this PC." -ForegroundColor Green

Set-Location $LabRoot
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$backup=Join-Path $env:LOCALAPPDATA "BTCUSDT_Price_Action_Lab_structure_case_v9_backup_$stamp"
New-Item -ItemType Directory -Path $backup -Force|Out-Null

$files=@(
  "index.html","src\main.js","src\style.css","src\case_entry_research.js",
  "src\structure_case_lab.js","tests\structure_case_v9_smoke.mjs"
)
foreach($rel in $files){
  $old=Join-Path $LabRoot $rel
  if(Test-Path $old){
    $dst=Join-Path $backup $rel
    New-Item -ItemType Directory -Path (Split-Path $dst -Parent) -Force|Out-Null
    Copy-Item $old $dst -Force
  }
}

Write-Host "[1/3] Installing validated V9 files..." -ForegroundColor Cyan
Copy-Item (Join-Path $PatchRoot "payload\index.html") (Join-Path $LabRoot "index.html") -Force
foreach($name in @("main.js","style.css","case_entry_research.js","structure_case_lab.js")){
  Copy-Item (Join-Path $PatchRoot "payload\src\$name") (Join-Path $LabRoot "src\$name") -Force
}
New-Item -ItemType Directory -Path (Join-Path $LabRoot "tests") -Force|Out-Null
Copy-Item (Join-Path $PatchRoot "payload\tests\structure_case_v9_smoke.mjs") (Join-Path $LabRoot "tests\structure_case_v9_smoke.mjs") -Force

Write-Host "[2/3] Commit code..." -ForegroundColor Cyan
git add index.html src/main.js src/style.css src/case_entry_research.js src/structure_case_lab.js tests/structure_case_v9_smoke.mjs
$changes=git status --porcelain
if($changes){
  git commit -m "Upgrade research UI and trade judgement workflow"
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
  Set-Content ".\.pending_push" "$(Get-Date -Format o) pending structure-case-v8 push"
  Write-Host "V8 IS INSTALLED AND COMMITTED LOCALLY." -ForegroundColor Green
  Write-Host "Only GitHub synchronization is pending. Later run .\PUSH_PENDING.ps1" -ForegroundColor Yellow
  exit 0
}
Remove-Item ".\.pending_push" -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "STRUCTURE CASE V9 RESEARCH UI PUSH COMPLETE" -ForegroundColor Green
Write-Host "GitHub Actions will rebuild/deploy Pages." -ForegroundColor Green
Write-Host "Pages: https://sunhshun811-collab.github.io/BTCUSDT_Price_Action_Lab/" -ForegroundColor Yellow
Write-Host "Backup: $backup" -ForegroundColor DarkGray
