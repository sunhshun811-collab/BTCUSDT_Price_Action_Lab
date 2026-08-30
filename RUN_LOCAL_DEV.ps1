$ErrorActionPreference="Stop"
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
if(-not(Test-Path ".\node_modules")){npm install;if($LASTEXITCODE -ne 0){throw "npm install failed"}}
npm run dev
