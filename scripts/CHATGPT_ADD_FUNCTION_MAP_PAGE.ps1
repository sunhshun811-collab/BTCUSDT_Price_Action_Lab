$ErrorActionPreference = "Stop"

function Resolve-Git {
    $cmd = Get-Command git -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($candidate in @(
        "C:\Program Files\Git\cmd\git.exe",
        "C:\Program Files\Git\bin\git.exe"
    )) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    throw "Git not found."
}

$GitExe = Resolve-Git
$ProjectRoot = (Get-Location).Path
Write-Host "=== Add function map page ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot" -ForegroundColor Green

$origin = (& $GitExe remote get-url origin 2>$null)
if (-not $origin) { throw "Git origin is not configured." }

$repoUrl = $null
$pagesUrl = $null

$originText = [string]$origin
if ($originText -match '^https://github\.com/([^/]+)/([^/]+?)(?:\.git)?$') {
    $owner = $Matches[1]
    $repo  = $Matches[2]
    $repoUrl = "https://github.com/$owner/$repo"
    $pagesUrl = "https://$owner.github.io/$repo/"
}
elseif ($originText -match '^git@github\.com:([^/]+)/([^/]+?)(?:\.git)?$') {
    $owner = $Matches[1]
    $repo  = $Matches[2]
    $repoUrl = "https://github.com/$owner/$repo"
    $pagesUrl = "https://$owner.github.io/$repo/"
}
else {
    throw "Cannot parse GitHub origin: $originText"
}

$functionMapUrl = ($pagesUrl.TrimEnd('/') + "/function-map.html")
Write-Host "Pages root     : $pagesUrl" -ForegroundColor Green
Write-Host "Function map URL: $functionMapUrl" -ForegroundColor Green

$htmlPath = Join-Path $ProjectRoot "public\function-map.html"
if (-not (Test-Path -LiteralPath $htmlPath)) {
    throw "public\function-map.html was not applied."
}

$readmePath = Join-Path $ProjectRoot "README.md"
if (-not (Test-Path -LiteralPath $readmePath)) {
    throw "README.md not found."
}

$readme = Get-Content -LiteralPath $readmePath -Raw -Encoding UTF8

if ($readme -notmatch 'function-map\.html') {
    $insertBlock = @"
### **[👉 点击打开 BTCUSDT Price Action Lab 功能树网络图]($functionMapUrl)**

- 功能树网络图：可拖动节点、拖动画布、滚轮缩放，用于盘点当前系统功能、模块关系与裁剪讨论。
"@

    if ($readme.Contains("- GitHub 仓库：")) {
        $readme = $readme.Replace("- GitHub 仓库：", $insertBlock + "`r`n- GitHub 仓库：")
    }
    elseif ($readme.Contains("## 🌐 在线可视化界面")) {
        $readme = $readme.Replace("## 🌐 在线可视化界面", "## 🌐 在线可视化界面`r`n`r`n" + $insertBlock)
    }
    else {
        $prefix = @"
## 🌐 在线可视化界面

### **[👉 点击打开 BTCUSDT Price Action Lab 可视化界面]($pagesUrl)**
$insertBlock
"@
        $readme = $prefix + "`r`n" + $readme
    }

    Set-Content -LiteralPath $readmePath -Value $readme -Encoding UTF8
    Write-Host "README.md updated with function-map link." -ForegroundColor Green
}
else {
    Write-Host "README already contains function-map link; no update needed." -ForegroundColor Yellow
}

Write-Host "ADD_FUNCTION_MAP_PAGE_OK" -ForegroundColor Green
