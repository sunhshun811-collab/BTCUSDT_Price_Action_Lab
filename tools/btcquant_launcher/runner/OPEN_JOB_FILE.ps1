param(
    [Parameter(Mandatory=$true)]
    [string]$PackagePath
)
$ErrorActionPreference = "Stop"
$resolved = (Resolve-Path -LiteralPath $PackagePath).Path
if ([System.IO.Path]::GetExtension($resolved) -ne ".btcquantjob") {
    throw "Only .btcquantjob files are supported."
}
$encoded = [System.Uri]::EscapeDataString($resolved)
Start-Process "vscode://shs-local.btcquant-chatgpt-launcher/run?file=$encoded"
