from __future__ import annotations
import argparse, csv, gzip, hashlib, io, json, math, statistics, time
import urllib.error, urllib.request, zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

BASE = "https://data.binance.vision/data/futures/um"
SYMBOL = "BTCUSDT"
TF_SECONDS = {"1m":60,"5m":300,"15m":900,"1h":3600,"4h":14400,"8h":28800}

def previous_month(now=None):
    now = now or datetime.now(timezone.utc)
    first = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    end = first
    last = first - timedelta(days=1)
    start = datetime(last.year, last.month, 1, tzinfo=timezone.utc)
    return start, end

def parse_month(s):
    y,m = map(int,s.split("-"))
    start = datetime(y,m,1,tzinfo=timezone.utc)
    end = datetime(y + (m==12), 1 if m==12 else m+1, 1, tzinfo=timezone.utc)
    return start,end

def get(url, retries=6):
    last=None
    for i in range(retries):
        try:
            req=urllib.request.Request(url,headers={"User-Agent":"BTCUSDT-Price-Action-Lab/1.0"})
            with urllib.request.urlopen(req,timeout=45) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            last=e
            if e.code in (403,404,451):
                raise
        except Exception as e:
            last=e
        time.sleep(min(20,2+3*i))
    raise RuntimeError(f"download failed: {url}: {last}")

def download_zip(url, cache_dir:Path, verify=True):
    cache_dir.mkdir(parents=True, exist_ok=True)
    name=url.rsplit("/",1)[-1]
    path=cache_dir/name
    if not path.exists() or path.stat().st_size<100:
        print("GET",url)
        path.write_bytes(get(url))
    if verify:
        c_url=url+".CHECKSUM"
        try:
            raw=get(c_url).decode("utf-8","replace").strip()
            expected=raw.split()[0].lower()
            actual=hashlib.sha256(path.read_bytes()).hexdigest().lower()
            if expected != actual:
                path.unlink(missing_ok=True)
                raise RuntimeError(f"checksum mismatch for {name}")
        except urllib.error.HTTPError as e:
            if e.code!=404:
                raise
    return path.read_bytes()

def csv_from_zip(blob):
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        names=[n for n in z.namelist() if n.lower().endswith(".csv")]
        if not names: return []
        with z.open(names[0]) as f:
            return list(csv.reader(io.TextIOWrapper(f,encoding="utf-8-sig",newline="")))

def timestamp_sec(v):
    x=int(float(v))
    if x>10**15: return x//1_000_000
    if x>10**12: return x//1_000
    return x

def parse_kline(rows):
    out=[]
    for r in rows:
        try:
            t=timestamp_sec(r[0])
            out.append([
                t,float(r[1]),float(r[2]),float(r[3]),float(r[4]),
                float(r[5]),float(r[7]),int(float(r[8])),
                float(r[9]),float(r[10])
            ])
        except (ValueError,IndexError):
            continue
    return sorted({r[0]:r for r in out}.values(),key=lambda r:r[0])

def monthly_url(kind, interval, y, m):
    # kind: klines, markPriceKlines, indexPriceKlines, premiumIndexKlines
    fname=f"{SYMBOL}-{interval}-{y:04d}-{m:02d}.zip"
    return f"{BASE}/monthly/{kind}/{SYMBOL}/{interval}/{fname}"

def funding_url(y,m):
    fname=f"{SYMBOL}-fundingRate-{y:04d}-{m:02d}.zip"
    return f"{BASE}/monthly/fundingRate/{SYMBOL}/{fname}"

def metrics_url(d):
    fname=f"{SYMBOL}-metrics-{d.isoformat()}.zip"
    return f"{BASE}/daily/metrics/{SYMBOL}/{fname}"

def parse_funding(rows):
    # Archive layouts have changed over time. Detect timestamp/rate by header when possible.
    if not rows: return []
    header=[x.strip().lower() for x in rows[0]]
    data=rows[1:] if any("time" in h or "fund" in h for h in header) else rows
    ti=ri=None
    for i,h in enumerate(header):
        if ti is None and ("funding_time" in h or h=="calc_time" or h=="time"): ti=i
        if ri is None and ("funding_rate" in h or h=="fundingrate"): ri=i
    out=[]
    for r in data:
        try:
            if ti is not None and ri is not None:
                t=timestamp_sec(r[ti]); rate=float(r[ri])
            else:
                # common public archive: calc_time,funding_interval_hours,last_funding_rate
                candidates=[]
                for i,x in enumerate(r):
                    try:
                        xx=float(x)
                        if xx>10**11: candidates.append(("time",i,xx))
                        elif abs(xx)<0.1: candidates.append(("rate",i,xx))
                    except: pass
                titem=next((x for x in candidates if x[0]=="time"),None)
                ritems=[x for x in candidates if x[0]=="rate"]
                if not titem or not ritems: continue
                t=timestamp_sec(str(titem[2])); rate=float(ritems[-1][2])
            out.append([t,rate])
        except Exception:
            continue
    return sorted({x[0]:x for x in out}.values())

def parse_metrics(rows):
    if not rows: return []
    header=[x.strip().lower() for x in rows[0]]
    idx={h:i for i,h in enumerate(header)}
    def pick(*names):
        for n in names:
            if n in idx:return idx[n]
        return None
    cols={
      "time":pick("create_time","timestamp"),
      "oi":pick("sum_open_interest"),
      "oi_usd":pick("sum_open_interest_value"),
      "top_acct":pick("count_toptrader_long_short_ratio"),
      "top_pos":pick("sum_toptrader_long_short_ratio"),
      "global_ls":pick("count_long_short_ratio"),
      "taker":pick("sum_taker_long_short_vol_ratio")
    }
    out=[]
    for r in rows[1:]:
        try:
            t=timestamp_sec(r[cols["time"]]) if cols["time"] is not None else None
            if t is None:continue
            rec={"time":t}
            for k in ("oi","oi_usd","top_acct","top_pos","global_ls","taker"):
                i=cols[k]
                rec[k]=float(r[i]) if i is not None and r[i] not in ("","null","None") else None
            out.append(rec)
        except Exception:
            continue
    return sorted({x["time"]:x for x in out}.values(),key=lambda x:x["time"])

def aggregate(rows, sec):
    if sec==60:return rows
    b={}
    for r in rows:
        k=(r[0]//sec)*sec
        x=b.get(k)
        if x is None:
            b[k]=[k,r[1],r[2],r[3],r[4],r[5],r[6],r[7],r[8],r[9]]
        else:
            x[2]=max(x[2],r[2]);x[3]=min(x[3],r[3]);x[4]=r[4]
            x[5]+=r[5];x[6]+=r[6];x[7]+=r[7];x[8]+=r[8];x[9]+=r[9]
    return [b[k] for k in sorted(b)]

def align_close(ref_rows):
    return {r[0]:r[4] for r in ref_rows}

def backward_value(series, times):
    # series list [time,value]
    out=[];i=0;last=None
    for t in times:
        while i<len(series) and series[i][0]<=t:
            last=series[i][1];i+=1
        out.append(last)
    return out

def mean_sd(xs):
    v=[x for x in xs if x is not None and math.isfinite(x)]
    if len(v)<2:return (None,None)
    return statistics.mean(v),statistics.stdev(v)

def zscores(xs, window):
    out=[]
    for i,x in enumerate(xs):
        if x is None:out.append(None);continue
        v=[y for y in xs[max(0,i-window+1):i+1] if y is not None]
        if len(v)<max(5,window//3):out.append(None);continue
        m=statistics.mean(v);sd=statistics.pstdev(v)
        out.append((x-m)/sd if sd>1e-12 else 0.0)
    return out

def write_gz(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    raw=json.dumps(obj,separators=(",",":"),ensure_ascii=False).encode()
    with gzip.open(path,"wb",compresslevel=6) as f:f.write(raw)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--month",default="")
    ap.add_argument("--output",default="public/data")
    ap.add_argument("--cache",default=".cache/binance")
    a=ap.parse_args()
    start,end=parse_month(a.month) if a.month else previous_month()
    y,m=start.year,start.month
    month=f"{y:04d}-{m:02d}"
    out=Path(a.output);cache=Path(a.cache)

    print("Trial month:",month)
    # All price/candle sources are Binance USD-M BTCUSDT.
    blobs={}
    for kind in ("klines","markPriceKlines","indexPriceKlines","premiumIndexKlines"):
        url=monthly_url(kind,"1m",y,m)
        blobs[kind]=download_zip(url,cache/kind)

    perp=parse_kline(csv_from_zip(blobs["klines"]))
    mark=parse_kline(csv_from_zip(blobs["markPriceKlines"]))
    index=parse_kline(csv_from_zip(blobs["indexPriceKlines"]))
    premium=parse_kline(csv_from_zip(blobs["premiumIndexKlines"]))
    if not perp: raise SystemExit("No Binance BTCUSDT perpetual klines.")

    # Funding: Binance Vision monthly archive.
    funding=[]
    try:
        funding=parse_funding(csv_from_zip(download_zip(funding_url(y,m),cache/"fundingRate")))
    except urllib.error.HTTPError as e:
        print("Funding archive unavailable:",e)

    # 5m Binance futures metrics are daily archives.
    metrics=[]
    d=start.date()
    while d<end.date():
        try:
            rows=csv_from_zip(download_zip(metrics_url(d),cache/"metrics",verify=False))
            metrics.extend(parse_metrics(rows))
        except urllib.error.HTTPError as e:
            if e.code!=404: print("metrics HTTP",e.code,d)
        d+=timedelta(days=1)
    metrics=sorted({x["time"]:x for x in metrics}.values(),key=lambda x:x["time"])

    # Publish all six displayed timeframes from Binance 1m perpetual Klines.
    tf_months={}
    for tf,sec in TF_SECONDS.items():
        rows=aggregate(perp,sec)
        write_gz(out/tf/f"{month}.json.gz",{
          "schema_version":3,"source":"Binance USD-M BTCUSDT perpetual klines",
          "timeframe":tf,"month":month,"rows":rows
        })
        tf_months[tf]=[month]

    # Build 5m derivative context using Binance sources only.
    p5=aggregate(perp,300)
    mark5=align_close(aggregate(mark,300))
    idx5=align_close(aggregate(index,300))
    prem5=align_close(aggregate(premium,300))
    metric_map={x["time"]:x for x in metrics}
    times=[r[0] for r in p5]
    fund_vals=backward_value(funding,times)

    ctx=[]
    for i,r in enumerate(p5):
        t=r[0];last=r[4]
        mk=mark5.get(t);ix=idx5.get(t);pr=prem5.get(t)
        met=metric_map.get(t,{})
        basis=((mk/ix)-1)*10000 if mk and ix else None
        mark_last=((mk/last)-1)*10000 if mk and last else None
        # PremiumIndex kline close is stored as a decimal premium-like series.
        premium_bp=pr*10000 if pr is not None and abs(pr)<1 else None
        ctx.append({
          "time":t,
          "close":last,
          "funding":fund_vals[i],
          "basis_bps":basis,
          "mark_last_bps":mark_last,
          "premium_bps":premium_bp,
          "oi":met.get("oi"),
          "oi_usd":met.get("oi_usd"),
          "top_acct_ratio":met.get("top_acct"),
          "top_pos_ratio":met.get("top_pos"),
          "global_ls_ratio":met.get("global_ls"),
          "taker_ls_ratio":met.get("taker")
        })

    for key,window in (("funding",12*24*7),("basis_bps",12*24*7),("oi_usd",12*24*7)):
        zs=zscores([x.get(key) for x in ctx],window)
        for x,z in zip(ctx,zs):x[key+"_z7d"]=z

    # OI returns.
    for lag,name in ((1,"oi_change_5m"),(12,"oi_change_1h"),(96,"oi_change_8h")):
        for i,x in enumerate(ctx):
            cur=x.get("oi_usd")
            old=ctx[i-lag].get("oi_usd") if i>=lag else None
            x[name]=(cur/old-1) if cur and old else None

    write_gz(out/"context"/f"{month}.json.gz",{
      "schema_version":1,
      "source":"Binance public USD-M archives",
      "month":month,
      "interval":"5m",
      "rows":ctx
    })

    coverage={
      "klines":{"source":"Binance BTCUSDT USD-M perpetual","rows_1m":len(perp),"available":bool(perp)},
      "markPriceKlines":{"rows_1m":len(mark),"available":bool(mark)},
      "indexPriceKlines":{"rows_1m":len(index),"available":bool(index)},
      "premiumIndexKlines":{"rows_1m":len(premium),"available":bool(premium)},
      "fundingRate":{"rows":len(funding),"available":bool(funding)},
      "futuresMetrics":{"rows_5m":len(metrics),"available":bool(metrics)}
    }
    (out/"index.json").write_text(json.dumps({
      "schema_version":3,
      "symbol":SYMBOL,
      "market":"Binance USD-M Perpetual",
      "trial":True,
      "trial_month":month,
      "display_timezone":"Asia/Shanghai",
      "source_policy":"All Kline/candle data in this Lab comes from Binance public USD-M BTCUSDT archives.",
      "generated_at_utc":datetime.now(timezone.utc).isoformat(),
      "timeframes":tf_months,
      "context_months":[month],
      "coverage":coverage
    },indent=2,ensure_ascii=False),encoding="utf-8")
    print(json.dumps(coverage,indent=2,ensure_ascii=False))

if __name__=="__main__":
    main()
