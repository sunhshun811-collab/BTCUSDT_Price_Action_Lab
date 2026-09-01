# BTCUSDT Price Action Lab

> 面向 BTCUSDT 的 Price Action / Market Structure 研究与可视化实验室。  
> 重点是把主观图形交易中的结构、标注、案例、入场逻辑和数据验证沉淀成可复现、可测试、可持续迭代的研究系统。

## 🌐 在线可视化界面

### **[👉 点击打开 BTCUSDT Price Action Lab 可视化界面](https://sunhshun811-collab.github.io/BTCUSDT_Price_Action_Lab/)**

- GitHub 仓库：[https://github.com/sunhshun811-collab/BTCUSDT_Price_Action_Lab](https://github.com/sunhshun811-collab/BTCUSDT_Price_Action_Lab)
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
- Strategy Research 研究界面。
- Data Foundation V10 数据层。
- Binance USD-M Futures 公共行情数据接入。
- 自动 Smoke Tests。
- GitHub Actions 自动构建、数据处理和页面部署。
- .btcquantjob → VS Code → 测试 → Git → GitHub Actions 自动化工作流。

## 数据与周期

当前主要研究对象：

`	ext
Binance USD-M Futures
BTCUSDT
`

主要周期包括：

`	ext
8h
4h
1h
15m
5m
1m
`

实际数据结构、更新方式和部署逻辑，以仓库中的以下目录为准：

`	ext
.github/workflows/
scripts/
public/
src/
`

## 本地运行

推荐环境：

- Windows
- VS Code
- PowerShell
- Node.js

项目本地启动入口：

`powershell
powershell -ExecutionPolicy Bypass -File .\RUN_LOCAL_DEV.ps1
`

## 数据更新与发布

数据更新/发布入口：

`powershell
powershell -ExecutionPolicy Bypass -File .\UPDATE_DATA_AND_PUBLISH.ps1
`

GitHub 自动流程位于：

`	ext
.github/workflows/
`

## 自动测试

核心 Smoke Tests 位于：

`	ext
tests/
`

覆盖数据基础、绘图、研究界面、结构案例、结构入场、趋势线等关键模块。

自动任务在提交代码前应优先运行测试：

`	ext
测试通过
→ git commit
→ git push
→ GitHub Actions
`

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
- 
ode_modules/。
- 临时构建产物。
- 本机注册信息。
- .env。
- 私钥和密钥。
- 其他不可公开或不可复现的运行时文件。

## 目录结构

`	ext
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
`

## BTCQuant 一键自动化

项目支持 .btcquantjob。

`	ext
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
`

Launcher 的可复现源码放在：

`	ext
tools/btcquant_launcher/
`

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
