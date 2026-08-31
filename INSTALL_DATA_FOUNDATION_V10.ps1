param([string]$LabRoot="C:\Users\18871\Desktop\BTCUSDT_Price_Action_Lab")
$ErrorActionPreference="Stop"
$PatchRoot=Split-Path -Parent $MyInvocation.MyCommand.Path
if(-not(Test-Path (Join-Path $LabRoot ".git"))){throw "Price Action Lab not found: $LabRoot"}
Write-Host "=== INSTALL DATA FOUNDATION V10 ===" -ForegroundColor Cyan
Write-Host "All market-data downloads/builds happen in GitHub Actions, not on this PC." -ForegroundColor Green
Write-Host "Processed monthly shards will live in the GitHub data-v10 branch under public/data/v10, then be attached to GitHub Pages. Desktop stays code-only." -ForegroundColor Yellow
Set-Location $LabRoot
$stamp=Get-Date -Format "yyyyMMdd_HHmmss";$backup=Join-Path $env:LOCALAPPDATA "BTCUSDT_Price_Action_Lab_data_v10_backup_$stamp";New-Item -ItemType Directory -Path $backup -Force|Out-Null
$files=@("src\main.js","src\context.js","src\case_entry_research.js","src\structure_case_lab.js","src\data_foundation_v10.js","scripts\build_data_foundation_v10.py","scripts\verify_data_foundation_v10.py",".github\workflows\build-data-foundation-v10.yml",".github\workflows\deploy-pages.yml","public\data\v10\README.md")
foreach($rel in $files){$old=Join-Path $LabRoot $rel;if(Test-Path $old){$dst=Join-Path $backup $rel;New-Item -ItemType Directory -Path (Split-Path $dst -Parent) -Force|Out-Null;Copy-Item $old $dst -Force}}
Write-Host "[1/3] Installing V10 data foundation code..." -ForegroundColor Cyan
foreach($rel in $files){$src=Join-Path $PatchRoot ("payload\"+$rel);if(Test-Path $src){$dst=Join-Path $LabRoot $rel;New-Item -ItemType Directory -Path (Split-Path $dst -Parent) -Force|Out-Null;Copy-Item $src $dst -Force}}
Write-Host "[2/3] Commit code..." -ForegroundColor Cyan
git add src/main.js src/context.js src/case_entry_research.js src/structure_case_lab.js src/data_foundation_v10.js scripts/build_data_foundation_v10.py scripts/verify_data_foundation_v10.py .github/workflows/build-data-foundation-v10.yml .github/workflows/deploy-pages.yml public/data/v10/README.md
if(git status --porcelain){git commit -m "Add complete Binance Data Foundation V10";if($LASTEXITCODE -ne 0){throw "git commit failed"}}
Write-Host "[3/3] Push code; GitHub Actions will build the market-data repository shards..." -ForegroundColor Cyan
$ok=$false
for($i=1;$i -le 10;$i++){git -c http.version=HTTP/1.1 push origin main;if($LASTEXITCODE -eq 0){$ok=$true;break};Write-Host "GitHub temporarily unreachable; attempt $i / 10..." -ForegroundColor Yellow;Start-Sleep -Seconds ([Math]::Min(45,5*$i))}
if(-not $ok){Set-Content ".\.pending_push" "$(Get-Date -Format o) pending V10 push";Write-Host "V10 installed/committed locally. Only push is pending; later run .\PUSH_PENDING.ps1" -ForegroundColor Yellow;exit 0}
Remove-Item ".\.pending_push" -Force -ErrorAction SilentlyContinue
Write-Host "DATA FOUNDATION V10 PUSH COMPLETE" -ForegroundColor Green
Write-Host "Now watch Actions -> Build Data Foundation V10. First bootstrap can take substantially longer because it builds 2020-to-present history." -ForegroundColor Yellow
Write-Host "Processed data location in GitHub: branch data-v10 / public/data/v10" -ForegroundColor Green
Write-Host "Desktop full market-data download: NONE" -ForegroundColor Green
Write-Host "Backup: $backup" -ForegroundColor DarkGray
