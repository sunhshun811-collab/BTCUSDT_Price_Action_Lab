param(
    [Parameter(Mandatory=$true)]
    [string]$Uri
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Web
$u = [System.Uri]$Uri
if ($u.Scheme -ne "btcquant") { throw "Unexpected URI scheme." }
$query = [System.Web.HttpUtility]::ParseQueryString($u.Query)
$file = $query["file"]
if ([string]::IsNullOrWhiteSpace($file)) { throw "btcquant URI must contain ?file=<path>" }
$resolved = (Resolve-Path -LiteralPath $file).Path
$encoded = [System.Uri]::EscapeDataString($resolved)
Start-Process "vscode://shs-local.btcquant-chatgpt-launcher/run?file=$encoded"
