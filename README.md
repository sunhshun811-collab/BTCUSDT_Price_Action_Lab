# BTCUSDT Price Action Lab

独立于 `BTCUSDT_Quant_Research_Kit` 的交互式 Price Action / Market Structure 策略实验室。

目标不是马上声称“找到赚钱策略”，而是让主观图形交易可以被**画出来、保存下来、打标签、逐步量化和严格验证**。

## 第一版功能

- Binance USD-M `BTCUSDT` 永续合约。
- 8H / 4H / 1H / 15m / 5m / 1m 六周期。
- 所有网页时间：`Asia/Shanghai` 北京时间（UTC+8）。
- 主图可原生缩放、拖动、十字光标。
- 手动画：
  - 趋势线（两点）
  - 水平关键位
  - 撤销 / 清空
  - 趋势线右侧延伸
- 六周期同步月度总览。
- 人工教学标签：
  - 强烈做多
  - 偏多
  - 不交易
  - 偏空
  - 强烈做空
  - 置信度 50–100
  - 自由备注
- 标签和趋势线持久化在浏览器 `localStorage`，并可一键导出 JSON。
- 一个透明的“策略草稿台”：
  - 趋势/均线
  - 前高/前低突破
  - 成交量确认
  - No-trade 置信阈值
- 草稿台只是交互式探索，不代替正式 Train / Validation / Beta / 10x MAE 回测。

网页使用 TradingView Lightweight Charts™ 5.2.1，并按其许可证要求显示 TradingView attribution。

## 数据

```powershell
powershell -ExecutionPolicy Bypass -File .\UPDATE_DATA_AND_PUBLISH.ps1
```

默认下载 `2026-01-01 UTC` 至当前时间的：

`8h,4h,1h,15m,5m,1m`

数据源：Binance USD-M Futures public Kline API。

数据按 `timeframe / UTC月份` gzip 分块。网页显示时统一转北京时间。

## 本地交互开发

```powershell
powershell -ExecutionPolicy Bypass -File .\RUN_LOCAL_DEV.ps1
```

然后打开 Vite 提示的本地地址。

## GitHub 网络故障

这个仓库从一开始就把“研究/数据成功”和“GitHub push 成功”分开。

如果 GitHub 临时不可达：

- 数据更新仍然算成功；
- 本地 commit 已保存；
- `.pending_push` 标记等待同步；
- 之后只需要：

```powershell
powershell -ExecutionPolicy Bypass -File .\PUSH_PENDING.ps1
```

不需要重新下载数据或重新做研究。
