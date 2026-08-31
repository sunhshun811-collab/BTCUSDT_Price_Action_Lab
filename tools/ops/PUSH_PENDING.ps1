$ErrorActionPreference="Continue"
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
git -c http.version=HTTP/1.1 push origin main
if($LASTEXITCODE -eq 0){
  Remove-Item ".\.pending_push" -Force -ErrorAction SilentlyContinue
  Write-Host "Pending GitHub push completed." -ForegroundColor Green
  exit 0
}
Write-Host "GitHub is still unreachable. Local commits are safe; retry this script later." -ForegroundColor Yellow
exit 2
