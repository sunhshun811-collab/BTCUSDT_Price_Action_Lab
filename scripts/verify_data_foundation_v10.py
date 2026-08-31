#!/usr/bin/env python3
import argparse,gzip,json,struct
from pathlib import Path
ap=argparse.ArgumentParser();ap.add_argument('--repo-root',default='.');a=ap.parse_args();root=Path(a.repo_root)/'public/data/v10'
m=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
assert m['version']==10
for tf,months in m['timeframes'].items():
    for mon in months[-2:]:
        p=root/'klines'/tf/f'{mon}.f64.gz'; raw=gzip.decompress(p.read_bytes()); assert len(raw)%(8*len(m['kline_schema']))==0,(tf,mon)
for mon in m.get('context_months',[])[-2:]:
    p=root/'context/5m'/f'{mon}.f64.gz';raw=gzip.decompress(p.read_bytes());assert len(raw)%(8*len(m['context_schema']))==0,mon
print('Data Foundation V10 verify OK',m['revision'])
