$ErrorActionPreference = "Stop"

Write-Host "=== Repository-first cleanup FIXED ===" -ForegroundColor Cyan

$env:Path = (
    [Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
    [Environment]::GetEnvironmentVariable("Path","User")
)

function FindExe([string]$Name, [string[]]$Fallbacks) {
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($f in $Fallbacks) { if ($f -and (Test-Path -LiteralPath $f)) { return $f } }
    throw "Required executable not found: $Name"
}

$GitExe = FindExe "git" @("C:\Program Files\Git\cmd\git.exe","C:\Program Files\Git\bin\git.exe")
$NodeExe = FindExe "node" @("C:\Program Files\nodejs\node.exe",(Join-Path $env:LOCALAPPDATA "Programs\nodejs\node.exe"))
$ProjectRoot = (Get-Location).Path

& $GitExe rev-parse --is-inside-work-tree | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Not a Git repository." }

Write-Host "Project: $ProjectRoot"
Write-Host "Node   : $NodeExe"
& $NodeExe --version

# ---------------------------------------------------------------------------
# README：中文为主，并在顶部放置在线可视化界面
# ---------------------------------------------------------------------------
$origin = (& $GitExe remote get-url origin 2>$null)
$repoUrl = ""
$visualUrl = ""

if ($origin) {
    $originText = [string]$origin
    if ($originText -match '^https://github\.com/([^/]+)/([^/]+?)(?:\.git)?$') {
        $owner = $Matches[1]
        $repo = $Matches[2]
        $repoUrl = "https://github.com/$owner/$repo"
        $visualUrl = "https://$owner.github.io/$repo/"
    }
    elseif ($originText -match '^git@github\.com:([^/]+)/([^/]+?)(?:\.git)?$') {
        $owner = $Matches[1]
        $repo = $Matches[2]
        $repoUrl = "https://github.com/$owner/$repo"
        $visualUrl = "https://$owner.github.io/$repo/"
    }
}

if ([string]::IsNullOrWhiteSpace($repoUrl)) {
    $repoUrl = "请查看当前 GitHub origin"
}
if ([string]::IsNullOrWhiteSpace($visualUrl)) {
    $visualUrl = "请查看 GitHub Pages 部署结果"
}

$readme = @"
# BTCUSDT Price Action Lab

> 面向 BTCUSDT 的 Price Action / Market Structure 研究与可视化实验室。  
> 重点是把主观图形交易中的结构、标注、案例、入场逻辑和数据验证沉淀成可复现、可测试、可持续迭代的研究系统。

## 🌐 在线可视化界面

### **[👉 点击打开 BTCUSDT Price Action Lab 可视化界面]($visualUrl)**

- GitHub 仓库：[$repoUrl]($repoUrl)
- 在线界面由 GitHub Pages / 仓库部署工作流发布。
- 如果刚完成一次 push，GitHub Actions 与 Pages 可能需要等待片刻再刷新。

---

## 项目定位

BTCUSDT Price Action Lab 是一个围绕 BTCUSDT 永续合约构建的 Price Action / Market Structure 研究环境。

项目重点不是简单堆叠技术指标，也不是机械地产生买卖信号，而是：

- 保存价格行为结构。
- 保存人工或程序化标注。
- 研究结构案例与入场条件。
- 研究趋势线与结构演化。
- 让图形研究可以被数据验证。
- 让研究过程可以持续复现、测试和迭代。

## 当前能力

当前仓库包含或持续维护以下能力：

- 多周期 Price Action / Market Structure 可视化。
- 图形标注与 Drawing Engine。
- Trendline Intelligence。
- Structure Case 案例研究。
- Structure Entry 入场研究。
- Data Foundation V10 数据层。
- Binance USD-M Futures 公共行情数据接入。
- 自动 Smoke Tests。
- GitHub Actions 自动构建、数据处理和页面部署。
- `.btcquantjob → VS Code → 测试 → Git → GitHub Actions` 自动化工作流。

## 数据与周期

当前主要研究对象：

```text
Binance USD-M Futures
BTCUSDT
```

主要周期包括：

```text
8h
4h
1h
15m
5m
1m
```

实际数据结构、更新方式和部署逻辑，以仓库中的以下目录为准：

```text
.github/workflows/
scripts/
public/
src/
```

## 本地运行

推荐环境：

- Windows
- VS Code
- PowerShell
- Node.js

项目本地启动入口：

```powershell
powershell -ExecutionPolicy Bypass -File .\RUN_LOCAL_DEV.ps1
```

## 数据更新与发布

数据更新/发布入口：

```powershell
powershell -ExecutionPolicy Bypass -File .\UPDATE_DATA_AND_PUBLISH.ps1
```

GitHub 自动流程位于：

```text
.github/workflows/
```

## 自动测试

核心 Smoke Tests 位于：

```text
tests/
```

覆盖数据基础、绘图、结构案例、结构入场、趋势线等关键模块。

自动任务在提交代码前应优先运行测试：

```text
测试通过
→ git commit
→ git push
→ GitHub Actions
```

测试失败时停止发布。

## Repository-first 管理原则

本项目采用 **repository-first** 管理方式。

### 尽量进入 GitHub 的内容

- 源代码。
- 安装器。
- Runner。
- Tests。
- VSIX。
- GitHub Actions workflows。
- 文档。
- 环境恢复脚本。
- 可复现的迁移脚本。
- 有长期价值的历史安装脚本。

### 只留本地的内容

- 运行日志。
- 缓存。
- `node_modules/`。
- 临时构建产物。
- 本机注册信息。
- `.env`。
- 私钥和密钥。
- 其他不可公开或不可复现的运行时文件。

## 目录结构

```text
BTCUSDT_Price_Action_Lab/
├─ .github/                  # GitHub Actions / Pages
├─ docs/                     # 文档、历史说明与归档
├─ public/                   # Web 静态资源与公开数据
├─ scripts/                  # 构建、数据、迁移脚本
├─ src/                      # 前端与研究核心代码
├─ tests/                    # Smoke Tests
├─ tools/
│  ├─ btcquant_launcher/     # ChatGPT → VS Code 自动任务 Launcher
│  ├─ installers/            # 历史安装器归档
│  └─ ops/                   # 运维辅助脚本
├─ README.md
├─ package.json
├─ index.html
└─ vite.config.js
```

## BTCQuant 一键自动化

项目支持 `.btcquantjob`。

```text
ChatGPT 生成任务
        ↓
Windows 打开 .btcquantjob
        ↓
VS Code
        ↓
自动修改 / 研究 / 测试
        ↓
测试通过
        ↓
git commit
        ↓
git push
        ↓
GitHub Actions
```

Launcher 的可复现源码放在：

```text
tools/btcquant_launcher/
```

机器本地只保留必要的系统注册和运行配置。

## 研究原则

- 先明确 Price Action / Market Structure 假设，再编码验证。
- 研究结果应可复现，而不是依赖单次观察。
- 结构、标注、案例、入场条件和研究结论尽可能持久化。
- 新功能尽量附带 Smoke Test 或最小可验证路径。
- GitHub 作为长期源码与研究基础设施的主存储位置。
- 桌面项目根目录尽量保持简洁。

## 风险说明

本项目用于研究、可视化和策略实验，不构成投资建议。任何交易决策都应自行评估风险。
"@

Set-Content -LiteralPath (Join-Path $ProjectRoot "README.md") -Value $readme -Encoding UTF8
Write-Host "README.md 已更新为中文主版。" -ForegroundColor Green
Write-Host "在线可视化界面：$visualUrl" -ForegroundColor Green

# Canonical launcher files are delivered directly by this job payload.
$launcherRoot = Join-Path $ProjectRoot "tools\btcquant_launcher"
$canonicalRunner = Join-Path $launcherRoot "runner"
$distDir = Join-Path $launcherRoot "dist"
$examplesDir = Join-Path $launcherRoot "examples"

foreach ($required in @(
    (Join-Path $canonicalRunner "RUN_JOB_PACKAGE.ps1"),
    (Join-Path $canonicalRunner "OPEN_JOB_FILE.ps1"),
    (Join-Path $canonicalRunner "OPEN_BTCQUANT_URI.ps1")
)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Canonical runner missing: $required" }
}

New-Item -ItemType Directory -Force -Path $distDir, $examplesDir | Out-Null

$rootVsix = Join-Path $ProjectRoot "btcquant-chatgpt-launcher-0.1.0.vsix"
if (Test-Path -LiteralPath $rootVsix) {
    Move-Item -LiteralPath $rootVsix -Destination (Join-Path $distDir "btcquant-chatgpt-launcher-0.1.0.vsix") -Force
}
$rootTest = Join-Path $ProjectRoot "TEST_LAUNCHER.btcquantjob"
if (Test-Path -LiteralPath $rootTest) {
    Move-Item -LiteralPath $rootTest -Destination (Join-Path $examplesDir "TEST_LAUNCHER.btcquantjob") -Force
}

# Repoint active launcher to the canonical repository copy BEFORE removing duplicates.
$configDir = Join-Path $env:USERPROFILE ".btcquant-launcher"
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
@{
    projectRoot = $ProjectRoot
    runnerPath = (Join-Path $canonicalRunner "RUN_JOB_PACKAGE.ps1")
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $configDir "config.json") -Encoding UTF8

$jobClass = "BTCQuant.Job"
New-Item -Path "HKCU:\Software\Classes\.btcquantjob" -Force | Out-Null
Set-Item -Path "HKCU:\Software\Classes\.btcquantjob" -Value $jobClass
New-Item -Path "HKCU:\Software\Classes\$jobClass\shell\open\command" -Force | Out-Null
Set-Item -Path "HKCU:\Software\Classes\$jobClass\shell\open\command" `
  -Value ('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $canonicalRunner "OPEN_JOB_FILE.ps1") + '" "%1"')

New-Item -Path "HKCU:\Software\Classes\btcquant" -Force | Out-Null
Set-Item -Path "HKCU:\Software\Classes\btcquant" -Value "URL:BTC Quant Protocol"
New-ItemProperty -Path "HKCU:\Software\Classes\btcquant" -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
New-Item -Path "HKCU:\Software\Classes\btcquant\shell\open\command" -Force | Out-Null
Set-Item -Path "HKCU:\Software\Classes\btcquant\shell\open\command" `
  -Value ('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $canonicalRunner "OPEN_BTCQUANT_URI.ps1") + '" "%1"')

# Root declutter: archive reusable historical assets inside the repository.
$installerArchive = Join-Path $ProjectRoot "tools\installers\archive"
$docsArchive = Join-Path $ProjectRoot "docs\archive"
$opsDir = Join-Path $ProjectRoot "tools\ops"
New-Item -ItemType Directory -Force -Path $installerArchive, $docsArchive, $opsDir | Out-Null

$installers = @(
 "INSTALL_BINANCE_CLOUD_TRIAL_V1.ps1",
 "INSTALL_DATA_FOUNDATION_V10.ps1",
 "INSTALL_DRAWING_ENGINE_V5.ps1",
 "INSTALL_INTERACTIVE_V2.ps1",
 "INSTALL_STRUCTURE_CASE_V7.ps1",
 "INSTALL_STRUCTURE_CASE_V8.ps1",
 "INSTALL_STRUCTURE_CASE_V9_RESEARCH_UI.ps1",
 "INSTALL_STRUCTURE_ENTRY_V6.ps1",
 "INSTALL_TRENDLINE_INTELLIGENCE_V4.ps1"
)
foreach ($name in $installers) {
    $src = Join-Path $ProjectRoot $name
    if (Test-Path -LiteralPath $src) {
        Move-Item -LiteralPath $src -Destination (Join-Path $installerArchive $name) -Force
    }
}

foreach ($name in @("README_FIRST.txt")) {
    $src = Join-Path $ProjectRoot $name
    if (Test-Path -LiteralPath $src) {
        Move-Item -LiteralPath $src -Destination (Join-Path $docsArchive $name) -Force
    }
}

$pushPending = Join-Path $ProjectRoot "PUSH_PENDING.ps1"
if (Test-Path -LiteralPath $pushPending) {
    Move-Item -LiteralPath $pushPending -Destination (Join-Path $opsDir "PUSH_PENDING.ps1") -Force
}

# Old root launcher installers are superseded by tools/btcquant_launcher/INSTALL.ps1.
foreach ($name in @("INSTALL_BTCQUANT_LAUNCHER.ps1","UNINSTALL_BTCQUANT_LAUNCHER.ps1")) {
    $p = Join-Path $ProjectRoot $name
    if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force }
}

# Remove prior one-off cleanup script.
$oldCleanup = Join-Path $ProjectRoot "scripts\CHATGPT_VALIDATE_AND_PREPARE_BASELINE.ps1"
if (Test-Path -LiteralPath $oldCleanup) { Remove-Item -LiteralPath $oldCleanup -Force }

# Keep this migration as an auditable repository artifact, but out of the project root.
$migrationsDir = Join-Path $ProjectRoot "scripts\migrations"
New-Item -ItemType Directory -Force -Path $migrationsDir | Out-Null
$currentCleanup = Join-Path $ProjectRoot "scripts\CHATGPT_REPOSITORY_FIRST_CLEANUP.ps1"
if (Test-Path -LiteralPath $currentCleanup) {
    Copy-Item -LiteralPath $currentCleanup -Destination (Join-Path $migrationsDir "20260901_repository_first_cleanup.ps1") -Force
}

# Remove duplicate source/runtime directories.
# Current parent runner may still be executing from tools/chatgpt_runner; PowerShell has already loaded it.
foreach ($old in @(
    (Join-Path $ProjectRoot "runner"),
    (Join-Path $ProjectRoot "tools\chatgpt_runner")
)) {
    if (Test-Path -LiteralPath $old) {
        Remove-Item -LiteralPath $old -Recurse -Force
        Write-Host "Removed duplicate: $old" -ForegroundColor DarkGray
    }
}

# Canonical .gitignore: track reproducible launcher artifacts including VSIX/job examples.
$gitignore = Join-Path $ProjectRoot ".gitignore"
$existing = @()
if (Test-Path -LiteralPath $gitignore) { $existing = @(Get-Content -LiteralPath $gitignore) }

$obsolete = @(
 "TEST_LAUNCHER.btcquantjob",
 "btcquant-chatgpt-launcher-*.vsix",
 "tools/chatgpt_runner/",
 "runner/",
 "INSTALL_BTCQUANT_LAUNCHER.ps1",
 "UNINSTALL_BTCQUANT_LAUNCHER.ps1",
 "research_logs/chatgpt_jobs/",
 "node_modules/",
 "dist/",
 "/dist/",
 "*.log",
 ".env",
 ".env.*",
 "Thumbs.db",
 ".DS_Store"
) + $installers + @("README_FIRST.txt")

$commentPrefixes = @(
 "# ChatGPT / BTCQuant local launcher artifacts",
 "# Local ChatGPT / BTCQuant runner",
 "# Local BTCQuant launcher runtime",
 "# Historical local upgrade/install entrypoints",
 "# Machine-local BTCQuant runtime/logs",
 "# Generated/local artifacts"
)

$clean = foreach ($line in $existing) {
    $t = $line.Trim()
    if ($obsolete -contains $t) { continue }
    if ($commentPrefixes -contains $t) { continue }
    $line
}
while ($clean.Count -gt 0 -and [string]::IsNullOrWhiteSpace($clean[-1])) {
    if ($clean.Count -eq 1) { $clean = @(); break }
    $clean = $clean[0..($clean.Count-2)]
}
$append = @(
 "",
 "# Generated/local artifacts only",
 "node_modules/",
 "/dist/",
 "/research_logs/",
 "*.log",
 ".env",
 ".env.*",
 "Thumbs.db",
 ".DS_Store"
)
@($clean + $append) | Set-Content -LiteralPath $gitignore -Encoding UTF8

# Safety scan.
$danger = @()
foreach ($pat in @("*.pem","*.key","*.pfx","*.p12",".env",".env.*","id_rsa","id_ed25519")) {
    $danger += @(Get-ChildItem -Path $ProjectRoot -Recurse -File -Filter $pat -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch '\\.git\\' -and $_.FullName -notmatch '\\node_modules\\' })
}
if ($danger.Count -gt 0) {
    $danger | ForEach-Object { Write-Host $_.FullName -ForegroundColor Red }
    throw "Potential secret/private-key files found."
}

$large = @(Get-ChildItem -Path $ProjectRoot -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\.git\\' -and $_.Length -gt 90MB })
if ($large.Count -gt 0) {
    $large | ForEach-Object { Write-Host ("{0:N1} MB  {1}" -f ($_.Length/1MB), $_.FullName) -ForegroundColor Red }
    throw "Files over 90 MB need review before GitHub publish."
}

# Full smoke suite.
$tests = @(Get-ChildItem (Join-Path $ProjectRoot "tests\*_smoke.mjs") -File | Sort-Object Name)
if ($tests.Count -eq 0) { throw "No smoke tests found." }
foreach ($test in $tests) {
    Write-Host "`n=== $($test.Name) ===" -ForegroundColor Cyan
    & $NodeExe $test.FullName
    if ($LASTEXITCODE -ne 0) { throw "Smoke test failed: $($test.Name)" }
}
Write-Host "`nALL SMOKE TESTS PASSED" -ForegroundColor Green

Write-Host "`n=== Root after cleanup ===" -ForegroundColor Cyan
Get-ChildItem -LiteralPath $ProjectRoot -Force | Select-Object Name, Mode | Format-Table -AutoSize

Write-Host "REPOSITORY_FIRST_CLEANUP_OK" -ForegroundColor Green

# Commit/push here so transient network failures can be retried and the old parent
# runner is no longer responsible for repository publication.
Write-Host "`n=== Staging repository-first layout ===" -ForegroundColor Cyan
& $GitExe add -A
if ($LASTEXITCODE -ne 0) { throw "git add -A failed." }

& $GitExe diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    & $GitExe commit -m "chore: consolidate repository-first layout and remove desktop clutter"
    if ($LASTEXITCODE -ne 0) { throw "git commit failed." }
} else {
    Write-Host "No new staged changes; existing local commits will still be pushed."
}

for ($attempt = 1; $attempt -le 4; $attempt++) {
    Write-Host "git push origin HEAD (attempt $attempt/4)..." -ForegroundColor Cyan
    & $GitExe push origin HEAD
    if ($LASTEXITCODE -eq 0) {
        Write-Host "PUSH_SUCCEEDED" -ForegroundColor Green
        break
    }
    if ($attempt -eq 4) { throw "git push failed after 4 attempts." }
    Start-Sleep -Seconds (5 * $attempt)
}

# The currently executing parent runner may still need its old log directory for a
# few seconds. Remove it after this task returns. Future canonical runner logs live
# under %LOCALAPPDATA%\BTCQuant\logs, so it will not come back.
$oldLogs = Join-Path $ProjectRoot "research_logs"
if (Test-Path -LiteralPath $oldLogs) {
    $cleanupCmd = "Start-Sleep -Seconds 15; Remove-Item -LiteralPath '" + ($oldLogs -replace "'","''") + "' -Recurse -Force -ErrorAction SilentlyContinue"
    Start-Process powershell.exe -WindowStyle Hidden -ArgumentList "-NoProfile","-Command",$cleanupCmd | Out-Null
}

Write-Host "REPOSITORY_FIRST_PUBLISH_OK" -ForegroundColor Green
