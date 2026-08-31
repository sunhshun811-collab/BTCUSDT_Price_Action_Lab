# BTCUSDT Price Action Lab — Data Foundation V10

V10 is a data-layer upgrade on top of V9 Research UI. It does not add a new trading strategy.

## Storage decision

Full historical market data is **not** downloaded to the Windows desktop. GitHub Actions downloads Binance public data, preprocesses it and stores the browser-ready monthly shards in a dedicated repository branch:

`data-v10` branch → `public/data/v10/`

The normal `main` branch remains code-only, so the large generated history does not make the Desktop working tree fall behind after every scheduled data update.

During every Pages build, the workflow attaches `public/data/v10` from the `data-v10` branch into the Vite `public/` tree. The browser therefore downloads the data from the same GitHub Pages origin, not from Binance and not from the Desktop.

## Included fields

Klines: OHLC, base volume, quote volume, trade count, taker-buy base volume, taker-buy quote volume.

Derived active-flow fields: taker sell volume, taker buy/sell ratio, taker buy share.

Derivatives/context: Funding, Funding Z7/Z30, Mark, Index, Premium, Basis bps/Z7/Z30, OI, OI USD, OI changes 5m/15m/1h/4h, OI Z7, top-trader account ratio, top-trader position ratio, global long/short ratio, metrics taker ratio.

## Missing-data policy

No OI/Positioning value is invented. Monthly Vision archives are tried first, daily Vision archives second, and supported public REST tail endpoints are used only where appropriate. Remaining missing source data is explicitly recorded through `source_mask` and `quality/*.json`.

## Faster visualization

- All six Kline timeframes are prebuilt in GitHub Actions.
- Browser no longer has to aggregate 1m into 5m/15m/1h/4h/8h.
- Context features are also precomputed.
- Files are monthly Float64 binary shards + gzip.
- Browser uses revisioned Cache Storage plus in-memory decoded-shard cache.
- Switching repeatedly among timeframes can reuse already downloaded shards.

## First build

After installation, the pushed workflow code automatically triggers `Build Data Foundation V10`. On the first run, because the `data-v10` branch does not yet contain `manifest.json`, `auto` mode bootstraps 2020-01 through the current month. Later scheduled runs restore the previous data branch and update only missing/recent months. The workflow then redeploys Pages with the refreshed data branch attached.

## Install

```powershell
powershell -ExecutionPolicy Bypass -File .\INSTALL_DATA_FOUNDATION_V10.ps1
```

No local Node.js is required by the installer and no Binance market data is downloaded to the desktop.
