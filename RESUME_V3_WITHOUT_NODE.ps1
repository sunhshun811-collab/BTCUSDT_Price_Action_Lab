param(
  [string]$LabRoot = "C:\Users\18871\Desktop\BTCUSDT_Price_Action_Lab"
)
$ErrorActionPreference="Stop"
$PatchRoot=Split-Path -Parent $MyInvocation.MyCommand.Path

if(-not(Test-Path (Join-Path $LabRoot ".git"))){
  throw "Price Action Lab not found: $LabRoot"
}

Write-Host "=== STRATEGY RESEARCH V3.0.1 NODELESS RESUME ===" -ForegroundColor Cyan
Write-Host "Local Node.js is NOT required." -ForegroundColor Yellow
Write-Host "V3 files were pre-validated before this ZIP was created." -ForegroundColor DarkGray
Write-Host "GitHub Actions will perform the real Node/Vite build." -ForegroundColor DarkGray

Set-Location $LabRoot

Write-Host "[1/3] Re-applying the validated V3 files..." -ForegroundColor Cyan
Copy-Item (Join-Path $PatchRoot "payload\index.html") (Join-Path $LabRoot "index.html") -Force
Copy-Item (Join-Path $PatchRoot "payload\src\main.js") (Join-Path $LabRoot "src\main.js") -Force
Copy-Item (Join-Path $PatchRoot "payload\src\style.css") (Join-Path $LabRoot "src\style.css") -Force
Copy-Item (Join-Path $PatchRoot "payload\src\research.js") (Join-Path $LabRoot "src\research.js") -Force
Copy-Item (Join-Path $PatchRoot "payload\src\research_ui.js") (Join-Path $LabRoot "src\research_ui.js") -Force

New-Item -ItemType Directory -Path (Join-Path $LabRoot "tests") -Force | Out-Null
Copy-Item (Join-Path $PatchRoot "payload\tests\research_smoke.mjs") (Join-Path $LabRoot "tests\research_smoke.mjs") -Force

Write-Host "[2/3] Commit V3 research code..." -ForegroundColor Cyan
git add index.html src/main.js src/style.css src/research.js src/research_ui.js tests/research_smoke.mjs

$changes = git status --porcelain
if($changes){
  git commit -m "Add causal strategy research lab and blind replay"
  if($LASTEXITCODE -ne 0){throw "git commit failed"}
}else{
  Write-Host "No uncommitted V3 changes detected. Continuing to push." -ForegroundColor DarkGray
}

Write-Host "[3/3] Push to GitHub..." -ForegroundColor Cyan
$ok=$false

for($i=1;$i -le 10;$i++){
  $old=$ErrorActionPreference
  $ErrorActionPreference="Continue"
  git -c http.version=HTTP/1.1 push origin main
  $code=$LASTEXITCODE
  $ErrorActionPreference=$old

  if($code -eq 0){
    $ok=$true
    break
  }

  Write-Host "GitHub temporarily unreachable; attempt $i / 10..." -ForegroundColor Yellow
  Start-Sleep -Seconds ([Math]::Min(45,5*$i))
}

if(-not $ok){
  Set-Content ".\.pending_push" "$(Get-Date -Format o) pending strategy-v3.0.1 push"
  Write-Host "" 
  Write-Host "V3 IS INSTALLED AND COMMITTED LOCALLY." -ForegroundColor Green
  Write-Host "Only GitHub synchronization is pending." -ForegroundColor Yellow
  Write-Host "No market data was downloaded." -ForegroundColor Green
  Write-Host "Later run .\PUSH_PENDING.ps1" -ForegroundColor Yellow
  exit 0
}

Remove-Item ".\.pending_push" -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "STRATEGY RESEARCH V3.0.1 PUSH COMPLETE" -ForegroundColor Green
Write-Host "GitHub Actions will now validate/build/deploy using Node 22 in the cloud." -ForegroundColor Green
Write-Host "Pages: https://sunhshun811-collab.github.io/BTCUSDT_Price_Action_Lab/" -ForegroundColor Yellow
