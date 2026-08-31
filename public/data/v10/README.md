# Data Foundation V10

This directory is generated in GitHub Actions on the dedicated `data-v10` repository branch, not on the user's Windows desktop or the normal `main` working tree.

- `klines/<tf>/<YYYY-MM>.f64.gz`: complete processed Kline fields.
- `context/5m/<YYYY-MM>.f64.gz`: Funding / Mark / Index / Premium / Basis / OI / Positioning / Taker context.
- `quality/<YYYY-MM>.json`: source coverage and missing-data report.
- `manifest.json`: schemas, available months, revision and cache-busting metadata.

Binary format: little-endian Float64 row-major compressed with gzip. The schemas are in `manifest.json` / `schema.json`.

No missing OI/Positioning value is fabricated. `source_mask` records which Binance sources are present at each 5-minute timestamp.
