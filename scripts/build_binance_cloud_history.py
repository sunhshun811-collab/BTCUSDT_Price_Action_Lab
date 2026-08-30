from __future__ import annotations
import argparse, csv, gzip, hashlib, io, json, math, statistics, time
import urllib.error, urllib.request, zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

BASE="https://data.binance.vision/data/futures/um"
SYMBOL="BTCUSDT"
TF_SECONDS={"1m":60,"5m":300,"15m":900,"1h":3600,"4h":14400,"8h":28800}

def month_floor(dt):
    return datetime(dt.year,dt.month,1,tzinfo=timezone.utc)
def shift_month(dt,n):
    idx=dt.year*12+(dt.month-1)+n
    return datetime(idx//12,idx%12+1,1,tzinfo=timezone.utc)
def complete_months(months_back):
    current=month_floor(datetime.now(timezone.utc))
    first=shift_month(current,-months_back)
    return [(shift_month(first,i).year,shift_month(first,i).month) for i in range(months_back)]
def parse_start_month(s,months_back):
    if not s:return complete_months(months_back)
    y,m=map(int,s.split("-"))
    start=datetime(y,m,1,tzinfo=timezone.utc)
    current=month_floor(datetime.now(timezone.utc))
    months=[]
    cur=start
    while cur<current:
        months.append((cur.year,cur.month));cur=shift_month(cur,1)
    return months[-months_back:] if months_back>0 else months

def get(url,retries=6):
    last=None
    for i in range(retries):
        try:
            req=urllib.request.Request(url,headers={"User-Agent":"BTCUSDT-Price-Action-Lab/2.0"})
            with urllib.request.urlopen(req,timeout=50) as r:return r.read()
        except urllib.error.HTTPError as e:
            last=e
            if e.code in (403,404,451):raise
        except Exception as e:last=e
        time.sleep(min(24,2+3*i))
    raise RuntimeError(f"download failed {url}: {last}")

def download_zip(url,cache,verify=True):
    cache.mkdir(parents=True,exist_ok=True)
    p=cache/url.rsplit("/",1)[-1]
    if not p.exists() or p.stat().st_size<100:
        print("GET",url);p.write_bytes(get(url))
    if verify:
        try:
            expected=get(url+".CHECKSUM").decode("utf-8","replace").split()[0].lower()
            actual=hashlib.sha256(p.read_bytes()).hexdigest().lower()
            if expected!=actual:
                p.unlink(missing_ok=True);raise RuntimeError("checksum mismatch "+url)
        except urllib.error.HTTPError as e:
            if e.code!=404:raise
    return p.read_bytes()

def rows_from_zip(blob):
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        names=[n for n in z.namelist() if n.lower().endswith(".csv")]
        if not names:return []
        with z.open(names[0]) as f:return list(csv.reader(io.TextIOWrapper(f,encoding="utf-8-sig",newline="")))

def ts(v):
    x=int(float(v))
    if x>10**15:return x//1_000_000
    if x>10**12:return x//1_000
    return x

def parse_kline(rows):
    out=[]
    for r in rows:
        try:out.append([ts(r[0]),float(r[1]),float(r[2]),float(r[3]),float(r[4]),float(r[5]),float(r[7]),int(float(r[8])),float(r[9]),float(r[10])])
        except (ValueError,IndexError):continue
    return sorted({x[0]:x for x in out}.values(),key=lambda x:x[0])

def kline_url(kind,y,m):
    name=f"{SYMBOL}-1m-{y:04d}-{m:02d}.zip"
    return f"{BASE}/monthly/{kind}/{SYMBOL}/1m/{name}"
def funding_url(y,m):
    name=f"{SYMBOL}-fundingRate-{y:04d}-{m:02d}.zip"
    return f"{BASE}/monthly/fundingRate/{SYMBOL}/{name}"
def metrics_url(d):
    name=f"{SYMBOL}-metrics-{d.isoformat()}.zip"
    return f"{BASE}/daily/metrics/{SYMBOL}/{name}"

def parse_funding(rows):
    if not rows:return []
    header=[x.strip().lower() for x in rows[0]]
    data=rows[1:] if any("fund" in h or "time" in h for h in header) else rows
    ti=ri=None
    for i,h in enumerate(header):
        if ti is None and ("funding_time" in h or h in ("calc_time","time")):ti=i
        if ri is None and ("funding_rate" in h or h=="fundingrate"):ri=i
    out=[]
    for r in data:
        try:
            if ti is not None and ri is not None:out.append([ts(r[ti]),float(r[ri])]);continue
            nums=[]
            for i,x in enumerate(r):
                try:
                    q=float(x)
                    if q>10**11:nums.append(("t",i,q))
                    elif abs(q)<.1:nums.append(("r",i,q))
                except:pass
            t0=next((x for x in nums if x[0]=="t"),None);rr=[x for x in nums if x[0]=="r"]
            if t0 and rr:out.append([ts(str(t0[2])),float(rr[-1][2])])
        except:pass
    return sorted({x[0]:x for x in out}.values())

def parse_metrics(rows):
    if not rows:return []
    h=[x.strip().lower() for x in rows[0]];idx={x:i for i,x in enumerate(h)}
    def pick(*n):
        for x in n:
            if x in idx:return idx[x]
        return None
    cols={"time":pick("create_time","timestamp"),"oi":pick("sum_open_interest"),"oi_usd":pick("sum_open_interest_value"),
          "top_acct":pick("count_toptrader_long_short_ratio"),"top_pos":pick("sum_toptrader_long_short_ratio"),
          "global_ls":pick("count_long_short_ratio"),"taker":pick("sum_taker_long_short_vol_ratio")}
    out=[]
    for r in rows[1:]:
        try:
            t=ts(r[cols["time"]]);x={"time":t}
            for k in ("oi","oi_usd","top_acct","top_pos","global_ls","taker"):
                i=cols[k];x[k]=float(r[i]) if i is not None and r[i] not in ("","null","None") else None
            out.append(x)
        except:continue
    return sorted({x["time"]:x for x in out}.values(),key=lambda x:x["time"])

def aggregate(rows,sec):
    if sec==60:return rows
    b={}
    for r in rows:
        k=(r[0]//sec)*sec;x=b.get(k)
        if x is None:b[k]=[k,r[1],r[2],r[3],r[4],r[5],r[6],r[7],r[8],r[9]]
        else:
            x[2]=max(x[2],r[2]);x[3]=min(x[3],r[3]);x[4]=r[4]
            x[5]+=r[5];x[6]+=r[6];x[7]+=r[7];x[8]+=r[8];x[9]+=r[9]
    return [b[k] for k in sorted(b)]

def back(series,times):
    out=[];i=0;last=None
    for t in times:
        while i<len(series) and series[i][0]<=t:last=series[i][1];i+=1
        out.append(last)
    return out
def zscores(xs,w):
    out=[]
    for i,x in enumerate(xs):
        if x is None:out.append(None);continue
        v=[y for y in xs[max(0,i-w+1):i+1] if y is not None]
        if len(v)<max(5,w//3):out.append(None);continue
        m=statistics.mean(v);sd=statistics.pstdev(v);out.append((x-m)/sd if sd>1e-12 else 0.)
    return out
def write_gz(p,obj):
    p.parent.mkdir(parents=True,exist_ok=True)
    with gzip.open(p,"wb",compresslevel=6) as f:f.write(json.dumps(obj,separators=(",",":"),ensure_ascii=False).encode())

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--months-back",type=int,default=12)
    ap.add_argument("--start-month",default="")
    ap.add_argument("--metrics-days",type=int,default=90)
    ap.add_argument("--output",default="public/data")
    ap.add_argument("--cache",default=".cache/binance")
    a=ap.parse_args()
    months=parse_start_month(a.start_month,a.months_back)
    if not months:raise SystemExit("No complete months selected.")
    out=Path(a.output);cache=Path(a.cache);out.mkdir(parents=True,exist_ok=True)
    tf_months={tf:[] for tf in TF_SECONDS};context_months=[];coverage={}
    metric_cut=datetime.now(timezone.utc).date()-timedelta(days=a.metrics_days)

    for y,m in months:
        key=f"{y:04d}-{m:02d}";print("\n=== MONTH",key,"===")
        blobs={}
        for kind in ("klines","markPriceKlines","indexPriceKlines","premiumIndexKlines"):
            blobs[kind]=download_zip(kline_url(kind,y,m),cache/kind)
        perp=parse_kline(rows_from_zip(blobs["klines"]))
        mark=parse_kline(rows_from_zip(blobs["markPriceKlines"]))
        index=parse_kline(rows_from_zip(blobs["indexPriceKlines"]))
        premium=parse_kline(rows_from_zip(blobs["premiumIndexKlines"]))
        if not perp:raise SystemExit("No perpetual klines "+key)
        funding=[]
        try:funding=parse_funding(rows_from_zip(download_zip(funding_url(y,m),cache/"fundingRate")))
        except urllib.error.HTTPError as e:print("funding unavailable",e.code,key)

        metrics=[]
        start=datetime(y,m,1,tzinfo=timezone.utc).date()
        end=shift_month(datetime(y,m,1,tzinfo=timezone.utc),1).date()
        d=max(start,metric_cut)
        while d<end:
            try:metrics.extend(parse_metrics(rows_from_zip(download_zip(metrics_url(d),cache/"metrics",verify=False))))
            except urllib.error.HTTPError as e:
                if e.code!=404:print("metrics",e.code,d)
            d+=timedelta(days=1)
        metrics=sorted({x["time"]:x for x in metrics}.values(),key=lambda x:x["time"])

        for tf,sec in TF_SECONDS.items():
            rows=aggregate(perp,sec)
            write_gz(out/tf/f"{key}.json.gz",{"schema_version":4,"source":"Binance USD-M BTCUSDT perpetual","timeframe":tf,"month":key,"rows":rows})
            tf_months[tf].append(key)

        p5=aggregate(perp,300);mk={r[0]:r[4] for r in aggregate(mark,300)};ix={r[0]:r[4] for r in aggregate(index,300)};pr={r[0]:r[4] for r in aggregate(premium,300)}
        mm={x["time"]:x for x in metrics};times=[r[0] for r in p5];fv=back(funding,times);ctx=[]
        for i,r in enumerate(p5):
            t=r[0];met=mm.get(t,{})
            basis=((mk[t]/ix[t])-1)*10000 if t in mk and t in ix and ix[t] else None
            prem=pr.get(t);prem_bp=prem*10000 if prem is not None and abs(prem)<1 else None
            ctx.append({"time":t,"close":r[4],"funding":fv[i],"basis_bps":basis,"premium_bps":prem_bp,
                        "oi":met.get("oi"),"oi_usd":met.get("oi_usd"),"top_acct_ratio":met.get("top_acct"),
                        "top_pos_ratio":met.get("top_pos"),"global_ls_ratio":met.get("global_ls"),"taker_ls_ratio":met.get("taker")})
        for field in ("funding","basis_bps","oi_usd"):
            z=zscores([x.get(field) for x in ctx],12*24*7)
            for x,v in zip(ctx,z):x[field+"_z7d"]=v
        for lag,name in ((1,"oi_change_5m"),(12,"oi_change_1h"),(96,"oi_change_8h")):
            for i,x in enumerate(ctx):
                c=x.get("oi_usd");o=ctx[i-lag].get("oi_usd") if i>=lag else None
                x[name]=(c/o-1) if c and o else None
        write_gz(out/"context"/f"{key}.json.gz",{"schema_version":2,"source":"Binance public USD-M archives","month":key,"interval":"5m","rows":ctx})
        context_months.append(key)
        coverage[key]={"kline_1m":len(perp),"funding":len(funding),"metrics_5m":len(metrics)}

    # Remove stale shards outside selected window.
    keep=set(tf_months["1m"])
    for tf in list(TF_SECONDS)+["context"]:
        d=out/tf
        if d.exists():
            for p in d.glob("*.json.gz"):
                if p.stem.replace(".json","") not in keep:p.unlink()

    idx={"schema_version":4,"symbol":SYMBOL,"market":"Binance USD-M Perpetual","trial":True,
         "history_window_complete_months":len(months),"metrics_recent_days":a.metrics_days,
         "display_timezone":"Asia/Shanghai",
         "source_policy":"All displayed candle data comes from Binance USD-M BTCUSDT public archives.",
         "generated_at_utc":datetime.now(timezone.utc).isoformat(),"timeframes":tf_months,
         "context_months":context_months,"coverage":coverage}
    (out/"index.json").write_text(json.dumps(idx,indent=2,ensure_ascii=False),encoding="utf-8")
    print("\nBUILD COMPLETE",tf_months["8h"][0],"->",tf_months["8h"][-1])

if __name__=="__main__":main()
