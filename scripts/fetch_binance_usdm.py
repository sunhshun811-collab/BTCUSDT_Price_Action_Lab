from __future__ import annotations
import argparse, gzip, json, time, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE="https://fapi.binance.com/fapi/v1/klines"
INTERVAL_MS={"1m":60_000,"5m":300_000,"15m":900_000,"1h":3_600_000,"4h":14_400_000,"8h":28_800_000}

def iso_ms(s:str)->int:
    if s.lower()=="now": return int(datetime.now(timezone.utc).timestamp()*1000)
    dt=datetime.fromisoformat(s.replace("Z","+00:00"))
    if dt.tzinfo is None: dt=dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp()*1000)

def request_json(params,retries=8):
    url=BASE+"?"+urllib.parse.urlencode(params)
    last=None
    for i in range(retries):
        try:
            req=urllib.request.Request(url,headers={"User-Agent":"BTCUSDT-Price-Action-Lab/0.1"})
            with urllib.request.urlopen(req,timeout=25) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            last=e;time.sleep(min(30,2+i*3))
    raise RuntimeError(f"Binance request failed: {last}")

def fetch_tf(symbol,tf,start_ms,end_ms):
    step=INTERVAL_MS[tf];cur=start_ms;rows=[];calls=0
    while cur<end_ms:
        data=request_json({"symbol":symbol,"interval":tf,"startTime":cur,"endTime":end_ms-1,"limit":1500})
        if not data: break
        for k in data:
            t=int(k[0])
            if t>=end_ms: break
            rows.append([t//1000,float(k[1]),float(k[2]),float(k[3]),float(k[4]),float(k[5]),float(k[7]),int(k[8])])
        nxt=int(data[-1][0])+step
        if nxt<=cur: break
        cur=nxt;calls+=1
        if calls%20==0: print(f"  {tf}: {len(rows):,} bars...")
        time.sleep(.08)
    # dedupe
    seen={r[0]:r for r in rows}
    return [seen[k] for k in sorted(seen)]

def month_key(sec): return datetime.fromtimestamp(sec,tz=timezone.utc).strftime("%Y-%m")

def write_tf(root,tf,rows):
    d=root/tf;d.mkdir(parents=True,exist_ok=True)
    groups={}
    for r in rows: groups.setdefault(month_key(r[0]),[]).append(r)
    for m,x in groups.items():
        payload=json.dumps({"schema_version":1,"timeframe":tf,"rows":x},separators=(",",":"),ensure_ascii=False).encode()
        with gzip.open(d/f"{m}.json.gz","wb",compresslevel=6) as f:f.write(payload)
    return sorted(groups)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--symbol",default="BTCUSDT")
    ap.add_argument("--start",default="2026-01-01T00:00:00Z")
    ap.add_argument("--end",default="now")
    ap.add_argument("--timeframes",default="8h,4h,1h,15m,5m,1m")
    ap.add_argument("--output",default="public/data")
    a=ap.parse_args()
    root=Path(a.output);root.mkdir(parents=True,exist_ok=True)
    start,end=iso_ms(a.start),iso_ms(a.end)
    index={"schema_version":1,"symbol":a.symbol,"market":"Binance USD-M Perpetual","display_timezone":"Asia/Shanghai",
           "start":datetime.fromtimestamp(start/1000,tz=timezone.utc).isoformat(),
           "end":datetime.fromtimestamp(end/1000,tz=timezone.utc).isoformat(),
           "generated_at_utc":datetime.now(timezone.utc).isoformat(),"timeframes":{}}
    for tf in [x.strip() for x in a.timeframes.split(",") if x.strip()]:
        if tf not in INTERVAL_MS: raise SystemExit(f"Unsupported timeframe: {tf}")
        print(f"Fetching {a.symbol} {tf} ...")
        rows=fetch_tf(a.symbol,tf,start,end)
        months=write_tf(root,tf,rows);index["timeframes"][tf]=months
        print(f"  done: {len(rows):,} bars, {len(months)} month files")
    # preserve other already-synced timeframes
    idx=root/"index.json"
    if idx.exists():
        try:
            old=json.loads(idx.read_text(encoding="utf-8"))
            for tf,months in old.get("timeframes",{}).items():
                index["timeframes"].setdefault(tf,months)
        except Exception: pass
    idx.write_text(json.dumps(index,indent=2,ensure_ascii=False),encoding="utf-8")
    print("Data index:",idx)

if __name__=="__main__": main()
