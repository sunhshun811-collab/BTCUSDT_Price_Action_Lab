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
$vscodeUri = "vscode://shs-local.btcquant-chatgpt-launcher/run?file=$encoded"
Start-Process $vscodeUri
