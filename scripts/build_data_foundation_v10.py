#!/usr/bin/env python3
"""BTCUSDT Price Action Lab — Data Foundation V10.

Runs in GitHub Actions. It does NOT download market data to the user's Windows PC.
It stores only processed monthly shards used by GitHub Pages under public/data/v10.

Sources: Binance public Vision archives first; daily archive fallback; public REST only
for the current/incomplete tail where an endpoint supports it. Missing source data is
never fabricated or silently forward-filled across arbitrary gaps.
"""
from __future__ import annotations
import argparse, calendar, csv, gzip, io, json, math, os, statistics, struct, sys, time, urllib.error, urllib.parse, urllib.request, zipfile
from collections import deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone, date
from pathlib import Path

VISION='https://data.binance.vision/data/futures/um'
FAPI='https://fapi.binance.com'
SYMBOL='BTCUSDT'
INTERVAL_SECONDS={'1m':60,'5m':300,'15m':900,'1h':3600,'4h':14400,'8h':28800}
KLINE_SCHEMA=['time','open','high','low','close','volume','quote_volume','trade_count','taker_buy_volume','taker_buy_quote_volume']
CONTEXT_SCHEMA=[
 'time','funding_rate','funding_z7d','funding_z30d','mark_price','index_price','premium_bps','basis_bps','basis_bps_z7d','basis_bps_z30d',
 'open_interest','open_interest_value','oi_change_5m','oi_change_15m','oi_change_1h','oi_change_4h','oi_z7d',
 'top_account_ls_ratio','top_position_ls_ratio','global_ls_ratio','metrics_taker_ls_ratio','taker_buy_sell_ratio','taker_buy_share',
 'trade_count','quote_volume','source_mask'
]
SOURCE_BITS={'kline_taker':1,'funding':2,'mark':4,'index':8,'premium':16,'metrics':32}
UA='Mozilla/5.0 BTCUSDT-Price-Action-Lab-V10'

def log(*a): print(*a,flush=True)
def finite(x):
    try: return math.isfinite(float(x))
    except: return False

def f(x, default=math.nan):
    try:
        v=float(x); return v if math.isfinite(v) else default
    except: return default

def norm_ts(x):
    v=int(float(x))
    # seconds / milliseconds / microseconds / nanoseconds
    if v>10**17: v//=1_000_000_000
    elif v>10**14: v//=1_000_000
    elif v>10**11: v//=1_000
    return v

def month_iter(start,end):
    y,m=map(int,start.split('-')); ey,em=map(int,end.split('-'))
    while (y,m)<=(ey,em):
        yield f'{y:04d}-{m:02d}'
        m+=1
        if m==13: y+=1;m=1

def month_bounds(month):
    y,m=map(int,month.split('-')); a=datetime(y,m,1,tzinfo=timezone.utc)
    b=datetime(y+1,1,1,tzinfo=timezone.utc) if m==12 else datetime(y,m+1,1,tzinfo=timezone.utc)
    return int(a.timestamp()),int(b.timestamp())

def dates_in_month(month):
    y,m=map(int,month.split('-'))
    return [date(y,m,d).isoformat() for d in range(1,calendar.monthrange(y,m)[1]+1)]

def http_bytes(url, timeout=35, retries=3):
    err=None
    for i in range(retries):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'*/*'})
            with urllib.request.urlopen(req,timeout=timeout) as r: return r.read()
        except urllib.error.HTTPError as e:
            if e.code==404: return None
            err=e
        except Exception as e: err=e
        time.sleep(min(4,0.6*(i+1)))
    log('WARN fetch failed',url,repr(err)); return None

def unzip_csv(blob):
    if not blob: return []
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        names=[n for n in z.namelist() if not n.upper().endswith('CHECKSUM') and not n.endswith('/')]
        if not names:return []
        raw=z.read(names[0]).decode('utf-8-sig','replace')
    return list(csv.reader(io.StringIO(raw)))

def vision_url(kind,period,symbol,day_or_month,interval=None):
    if interval:
        return f'{VISION}/{period}/{kind}/{symbol}/{interval}/{symbol}-{interval}-{day_or_month}.zip'
    return f'{VISION}/{period}/{kind}/{symbol}/{symbol}-{kind}-{day_or_month}.zip'

def load_vision_rows(kind,month,interval=None):
    u=vision_url(kind,'monthly',SYMBOL,month,interval)
    rows=unzip_csv(http_bytes(u))
    if rows:return rows,'monthly'
    days=dates_in_month(month); today=date.today().isoformat()
    days=[d for d in days if d<=today]
    out=[]
    def one(d): return d,unzip_csv(http_bytes(vision_url(kind,'daily',SYMBOL,d,interval),timeout=25,retries=2))
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs=[ex.submit(one,d) for d in days]
        for q in as_completed(futs):
            d,r=q.result()
            if r: out.extend(r)
    return out,'daily' if out else 'missing'

def parse_kline(rows):
    out=[]
    for r in rows:
        if len(r)<10: continue
        try: t=norm_ts(r[0])
        except: continue
        vals=[f(r[i]) for i in [1,2,3,4,5]]
        if not all(finite(x) for x in vals):continue
        q=f(r[7] if len(r)>7 else math.nan); n=f(r[8] if len(r)>8 else math.nan)
        tb=f(r[9] if len(r)>9 else math.nan); tq=f(r[10] if len(r)>10 else math.nan)
        out.append([t,*vals,q,n,tb,tq])
    out.sort(key=lambda x:x[0]); return dedup(out,0)

def dedup(rows,key_index=0):
    d={r[key_index]:r for r in rows}; return [d[k] for k in sorted(d)]

def aggregate_klines(rows,interval):
    sec=INTERVAL_SECONDS[interval]
    groups={}
    for r in rows:
        k=int(r[0])//sec*sec
        g=groups.get(k)
        if g is None: groups[k]=[k,r[1],r[2],r[3],r[4],r[5],r[6],r[7],r[8],r[9]]
        else:
            g[2]=max(g[2],r[2]);g[3]=min(g[3],r[3]);g[4]=r[4]
            for j in (5,6,7,8,9):
                if finite(r[j]): g[j]=(g[j] if finite(g[j]) else 0)+r[j]
    return [groups[k] for k in sorted(groups)]

def parse_price_kline(rows):
    out=[]
    for r in rows:
        if len(r)<5:continue
        try:t=norm_ts(r[0])
        except:continue
        c=f(r[4]);
        if finite(c):out.append((t,c))
    return dict(dedup(out,0))

def header_map(row): return {str(v).strip().lower():i for i,v in enumerate(row)}
def parse_funding(rows):
    if not rows:return []
    hdr=header_map(rows[0]); data=rows[1:] if any(not finite(x) for x in rows[0]) else rows
    out=[]
    for r in data:
        try:
            if hdr:
                ti=next((i for k,i in hdr.items() if 'time' in k or 'calc' in k),0)
                ri=next((i for k,i in hdr.items() if 'rate' in k and 'fund' in k),len(r)-1)
            else: ti,ri=0,len(r)-1
            t=norm_ts(r[ti]); rate=f(r[ri])
            if finite(rate) and abs(rate)<1: out.append((t,rate))
        except: pass
    return dedup(out,0)

def parse_metrics(rows):
    if not rows:return {}
    hdr=header_map(rows[0]); data=rows[1:] if hdr and ('create_time' in hdr or 'symbol' in hdr) else rows
    def idx(*names):
        for name in names:
            if name in hdr:return hdr[name]
        return None
    ids={
      'time':idx('create_time','timestamp','time'),
      'oi':idx('sum_open_interest','open_interest'),
      'oi_value':idx('sum_open_interest_value','open_interest_value'),
      'top_account':idx('count_toptrader_long_short_ratio','top_account_long_short_ratio'),
      'top_position':idx('sum_toptrader_long_short_ratio','top_position_long_short_ratio'),
      'global':idx('count_long_short_ratio','global_long_short_ratio'),
      'taker':idx('sum_taker_long_short_vol_ratio','taker_long_short_ratio')
    }
    out={}
    for r in data:
        try:
            ti=ids['time'] if ids['time'] is not None else 0;t=norm_ts(r[ti])
            def val(k):
                i=ids[k]; return f(r[i]) if i is not None and i<len(r) else math.nan
            out[t]={'oi':val('oi'),'oi_value':val('oi_value'),'top_account':val('top_account'),'top_position':val('top_position'),'global':val('global'),'taker':val('taker')}
        except:pass
    return out

def api_json(path,params):
    url=FAPI+path+'?'+urllib.parse.urlencode(params)
    b=http_bytes(url,timeout=25,retries=2)
    if not b:return None
    try:return json.loads(b.decode())
    except:return None

def current_tail_klines(start_sec,end_sec):
    out=[];cur=start_sec*1000;end=end_sec*1000
    while cur<end:
        x=api_json('/fapi/v1/klines',{'symbol':SYMBOL,'interval':'1m','startTime':cur,'endTime':end-1,'limit':1500})
        if not isinstance(x,list) or not x:break
        out.extend(x);n=int(x[-1][0])+60_000
        if n<=cur:break
        cur=n;time.sleep(.05)
    return parse_kline(out)

def api_kline_tail(path,start_sec,end_sec,param_name='symbol'):
    params={param_name:SYMBOL,'interval':'5m','startTime':start_sec*1000,'endTime':end_sec*1000-1,'limit':1500}
    x=api_json(path,params)
    return parse_price_kline(x if isinstance(x,list) else [])

def api_funding_tail(start_sec,end_sec):
    x=api_json('/fapi/v1/fundingRate',{'symbol':SYMBOL,'startTime':start_sec*1000,'endTime':end_sec*1000-1,'limit':1000})
    out=[]
    if isinstance(x,list):
        for r in x:
            try:out.append((norm_ts(r.get('fundingTime')),f(r.get('fundingRate'))))
            except:pass
    return dedup([r for r in out if finite(r[1])],0)

def api_metrics_tail(start_sec,end_sec):
    # Binance public futures-data endpoints only expose recent history; this is used
    # for the current tail, never to fabricate old unavailable OI/positioning rows.
    specs=[
      ('/futures/data/openInterestHist','oi'),('/futures/data/topLongShortAccountRatio','top_account'),
      ('/futures/data/topLongShortPositionRatio','top_position'),('/futures/data/globalLongShortAccountRatio','global'),
      ('/futures/data/takerlongshortRatio','taker')]
    merged={}
    for path,key in specs:
        cur=start_sec
        while cur<end_sec:
            # 500 x 5m is the public endpoint page ceiling.
            page_end=min(end_sec,cur+500*300)
            x=api_json(path,{'symbol':SYMBOL,'period':'5m','startTime':cur*1000,'endTime':page_end*1000-1,'limit':500})
            if not isinstance(x,list) or not x:break
            last_t=cur
            for r in x:
                try:t=norm_ts(r.get('timestamp'));d=merged.setdefault(t,{});last_t=max(last_t,t)
                except:continue
                if key=='oi':d.update(oi=f(r.get('sumOpenInterest')),oi_value=f(r.get('sumOpenInterestValue')))
                elif key=='top_account':d['top_account']=f(r.get('longShortRatio'))
                elif key=='top_position':d['top_position']=f(r.get('longShortRatio'))
                elif key=='global':d['global']=f(r.get('longShortRatio'))
                else:d['taker']=f(r.get('buySellRatio'))
            nxt=max(page_end,last_t+300)
            if nxt<=cur:break
            cur=nxt;time.sleep(.05)
    return merged

def downsample_context(rows,sec):
    # Preserve the timestamp of the LAST known 5m state inside the bucket to avoid
    # assigning future information to the bucket start.
    g={}
    for r in rows:g[int(r[0])//sec*sec]=r
    return [g[k] for k in sorted(g)]

def asof_value(events,t,max_age=None):
    # events sorted tuples (time,value)
    lo,hi=0,len(events)-1;ans=None
    while lo<=hi:
        m=(lo+hi)//2
        if events[m][0]<=t:ans=events[m];lo=m+1
        else:hi=m-1
    if ans is None:return math.nan
    if max_age is not None and t-ans[0]>max_age:return math.nan
    return ans[1]

def asof_metric(metrics_times,metrics,t,max_age=900):
    lo,hi=0,len(metrics_times)-1;ans=None
    while lo<=hi:
        m=(lo+hi)//2
        if metrics_times[m]<=t:ans=metrics_times[m];lo=m+1
        else:hi=m-1
    if ans is None or t-ans>max_age:return None
    return metrics.get(ans)

def rolling_z(values,window):
    q=deque();s=0.0;s2=0.0;out=[]
    for v in values:
        if finite(v):q.append(float(v));s+=v;s2+=v*v
        else:q.append(None)
        while len(q)>window:
            old=q.popleft()
            if old is not None:s-=old;s2-=old*old
        n=sum(x is not None for x in q)
        if finite(v) and n>=max(12,min(window,96)):
            mu=s/n;var=max(0,s2/n-mu*mu);sd=math.sqrt(var);out.append((v-mu)/sd if sd>1e-12 else 0.0)
        else:out.append(math.nan)
    return out

def write_f64(path,rows):
    path.parent.mkdir(parents=True,exist_ok=True)
    buf=bytearray()
    for r in rows:
        buf.extend(struct.pack('<'+'d'*len(r),*[float(x) if finite(x) else math.nan for x in r]))
    path.write_bytes(gzip.compress(bytes(buf),compresslevel=6))

def read_f64(path,cols):
    if not path.exists():return []
    raw=gzip.decompress(path.read_bytes());n=len(raw)//8
    vals=struct.unpack('<'+'d'*n,raw);return [list(vals[i:i+cols]) for i in range(0,n,cols)]

def coverage_times(rows,start,end,step):
    exp=max(0,(end-start)//step); got=sum(1 for r in rows if start<=r[0]<end)
    return {'expected':exp,'rows':got,'coverage':got/exp if exp else 0.0,'missing':max(0,exp-got)}

def build_month(root,month,now_sec):
    log('===',month,'===')
    ms,me=month_bounds(month);effective_end=min(me,now_sec//60*60)
    raw,ksrc=load_vision_rows('klines',month,'1m'); k1=parse_kline(raw)
    # Tail fallback for current month/day if Vision is behind.
    if effective_end>ms:
        last=k1[-1][0]+60 if k1 else ms
        if last<effective_end and effective_end-last<=3*86400:
            tail=current_tail_klines(last,effective_end); k1=dedup(k1+tail,0)
    if not k1:
        q={'month':month,'error':'NO_KLINE_SOURCE_DATA','kline_1m':{'expected':max(0,(effective_end-ms)//60),'rows':0,'coverage':0.0,'missing':max(0,(effective_end-ms)//60)},'source_coverage':{},'sources':{'klines':ksrc}}
        qp=root/'quality'/f'{month}.json';qp.parent.mkdir(parents=True,exist_ok=True);qp.write_text(json.dumps(q,ensure_ascii=False,indent=2),encoding='utf-8')
        return q
    tf_rows={'1m':k1}
    for tf in ('5m','15m','1h','4h','8h'):tf_rows[tf]=aggregate_klines(k1,tf)
    for tf,rows in tf_rows.items():write_f64(root/'klines'/tf/f'{month}.f64.gz',rows)

    funding_rows,fsrc=load_vision_rows('fundingRate',month,None); funding=parse_funding(funding_rows)
    mark_rows,marksrc=load_vision_rows('markPriceKlines',month,'5m'); mark=parse_price_kline(mark_rows)
    index_rows,indexsrc=load_vision_rows('indexPriceKlines',month,'5m'); index=parse_price_kline(index_rows)
    prem_rows,premsrc=load_vision_rows('premiumIndexKlines',month,'5m'); prem=parse_price_kline(prem_rows)
    metric_rows,metricsrc=load_vision_rows('metrics',month,None); metrics=parse_metrics(metric_rows)
    # REST fills only the incomplete recent tail supported by public endpoints.
    if month==datetime.now(timezone.utc).strftime('%Y-%m') and effective_end>ms:
        tail_start=max(ms,effective_end-3*86400)
        funding=dedup(funding+api_funding_tail(tail_start,effective_end),0)
        mark.update(api_kline_tail('/fapi/v1/markPriceKlines',tail_start,effective_end,'symbol'))
        index.update(api_kline_tail('/fapi/v1/indexPriceKlines',tail_start,effective_end,'pair'))
        prem.update(api_kline_tail('/fapi/v1/premiumIndexKlines',tail_start,effective_end,'symbol'))
        for t,d in api_metrics_tail(tail_start,effective_end).items():
            base_m=metrics.setdefault(t,{})
            for k,v in d.items():
                if finite(v):base_m[k]=v
    mt=sorted(metrics)

    base=tf_rows['5m']; ctx=[]
    oi_by_time={}
    for r in base:
        t=int(r[0]);mask=SOURCE_BITS['kline_taker']
        fr=asof_value(funding,t+300,max_age=12*3600)
        if finite(fr):mask|=SOURCE_BITS['funding']
        mp=mark.get(t,math.nan);ip=index.get(t,math.nan);pp=prem.get(t,math.nan)
        if finite(mp):mask|=SOURCE_BITS['mark']
        if finite(ip):mask|=SOURCE_BITS['index']
        if finite(pp):mask|=SOURCE_BITS['premium']
        met=asof_metric(mt,metrics,t+300,900)
        if met:mask|=SOURCE_BITS['metrics']
        oi=met.get('oi',math.nan) if met else math.nan; oiv=met.get('oi_value',math.nan) if met else math.nan
        oi_by_time[t]=oiv
        basis=(mp/ip-1)*10000 if finite(mp) and finite(ip) and ip else math.nan
        premium=pp*10000 if finite(pp) else math.nan
        v,tb=r[5],r[8];sell=v-tb if finite(v) and finite(tb) else math.nan
        taker_ratio=tb/sell if finite(tb) and finite(sell) and sell>1e-12 else math.nan
        taker_share=tb/v if finite(tb) and finite(v) and v>1e-12 else math.nan
        ctx.append([t,fr,math.nan,math.nan,mp,ip,premium,basis,math.nan,math.nan,oi,oiv,math.nan,math.nan,math.nan,math.nan,math.nan,
                    met.get('top_account',math.nan) if met else math.nan,met.get('top_position',math.nan) if met else math.nan,met.get('global',math.nan) if met else math.nan,met.get('taker',math.nan) if met else math.nan,
                    taker_ratio,taker_share,r[7],r[6],mask])

    # Carry prior two context months for rolling/change features.
    prior=[]
    y,m=map(int,month.split('-'))
    for back in (2,1):
        total=y*12+(m-1)-back;py,pm=divmod(total,12);pmonth=f'{py:04d}-{pm+1:02d}'
        prior.extend(read_f64(root/'context/5m'/f'{pmonth}.f64.gz',len(CONTEXT_SCHEMA)))
    allrows=prior+ctx; allrows.sort(key=lambda x:x[0]); bytime={int(r[0]):r for r in allrows}
    funding_vals=[r[1] for r in allrows];basis_vals=[r[7] for r in allrows];oi_vals=[r[11] for r in allrows]
    fz7=rolling_z(funding_vals,7*24*12);fz30=rolling_z(funding_vals,30*24*12);bz7=rolling_z(basis_vals,7*24*12);bz30=rolling_z(basis_vals,30*24*12);oz7=rolling_z(oi_vals,7*24*12)
    for i,r in enumerate(allrows):
        r[2]=fz7[i];r[3]=fz30[i];r[8]=bz7[i];r[9]=bz30[i];r[16]=oz7[i]
        t=int(r[0]);cur=r[11]
        for col,lag in ((12,300),(13,900),(14,3600),(15,14400)):
            prev=bytime.get(t-lag);pv=prev[11] if prev else math.nan
            r[col]=cur/pv-1 if finite(cur) and finite(pv) and pv!=0 else math.nan
    ctx=[r for r in allrows if ms<=r[0]<me]
    write_f64(root/'context/5m'/f'{month}.f64.gz',ctx)
    write_f64(root/'context/15m'/f'{month}.f64.gz',downsample_context(ctx,900))
    write_f64(root/'context/1h'/f'{month}.f64.gz',downsample_context(ctx,3600))

    q={
      'month':month,'kline_1m':coverage_times(k1,ms,effective_end,60) if effective_end>ms else {'expected':0,'rows':0,'coverage':0,'missing':0},
      'context_5m_rows':len(ctx),
      'source_coverage':{},
      'sources':{'klines':ksrc,'funding':fsrc,'mark':marksrc,'index':indexsrc,'premium':premsrc,'metrics':metricsrc}
    }
    for name,bit in SOURCE_BITS.items():
        present=sum(1 for r in ctx if int(r[-1])&bit);q['source_coverage'][name]=present/len(ctx) if ctx else 0.0
    qp=root/'quality'/f'{month}.json';qp.parent.mkdir(parents=True,exist_ok=True);qp.write_text(json.dumps(q,ensure_ascii=False,indent=2),encoding='utf-8')
    return q

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--repo-root',default='.');ap.add_argument('--start-month',default='2020-01');ap.add_argument('--end-month',default='auto');ap.add_argument('--mode',choices=['auto','full','update','repair'],default='auto')
    a=ap.parse_args();repo=Path(a.repo_root).resolve();root=repo/'public/data/v10';root.mkdir(parents=True,exist_ok=True)
    now=datetime.now(timezone.utc);end=a.end_month if a.end_month!='auto' else now.strftime('%Y-%m');allmonths=list(month_iter(a.start_month,end))
    manifest_path=root/'manifest.json';old={}
    if manifest_path.exists():
        try:old=json.loads(manifest_path.read_text(encoding='utf-8'))
        except:old={}
    if a.mode=='full' or not old: months=allmonths
    elif a.mode=='update': months=allmonths[-2:]
    elif a.mode=='repair':
        bad=old.get('quality',{}).get('incomplete_months',[]);months=sorted(set(bad+allmonths[-2:]))
    else:
        existing=set(old.get('timeframes',{}).get('1m',[]));missing=[m for m in allmonths if m not in existing];months=sorted(set(missing+allmonths[-2:]))
    log('mode',a.mode,'months',len(months),months[:3],months[-3:] if months else [])
    qualities={}
    for month in months:
        try:qualities[month]=build_month(root,month,int(now.timestamp()))
        except Exception as e:
            log('ERROR month',month,repr(e));qualities[month]={'month':month,'error':repr(e)}
    # Read all quality files and build manifest from actual shards.
    qs={}
    for p in sorted((root/'quality').glob('????-??.json')):
        try:qs[p.stem]=json.loads(p.read_text(encoding='utf-8'))
        except:pass
    tfs={tf:sorted(p.stem.replace('.f64','') for p in (root/'klines'/tf).glob('*.f64.gz')) for tf in INTERVAL_SECONDS}
    context_timeframes={tf:sorted(p.name.replace('.f64.gz','') for p in (root/'context'/tf).glob('*.f64.gz')) for tf in ('5m','15m','1h')}
    contexts=context_timeframes['5m']
    incomplete=[]
    for m,q in qs.items():
        if q.get('error') or q.get('kline_1m',{}).get('coverage',0)<.995 or q.get('source_coverage',{}).get('metrics',0)<.95: incomplete.append(m)
    revision=now.strftime('%Y%m%dT%H%M%SZ')
    manifest={
      'version':10,'revision':revision,'symbol':SYMBOL,'market':'Binance USD-M Perpetual','generated_at_utc':now.isoformat(),
      'start_month':a.start_month,'end_month':end,'timeframes':tfs,'context_months':contexts,'context_timeframes':context_timeframes,
      'kline_schema':KLINE_SCHEMA,'context_schema':CONTEXT_SCHEMA,
      'storage':{'format':'little-endian float64 row-major + gzip','base':'data/v10','browser_cache_revision':revision},
      'quality':{'incomplete_months':sorted(incomplete),'quality_files':len(qs)},
      'source_bits':SOURCE_BITS
    }
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    (root/'schema.json').write_text(json.dumps({'kline_schema':KLINE_SCHEMA,'context_schema':CONTEXT_SCHEMA,'source_bits':SOURCE_BITS},ensure_ascii=False,indent=2),encoding='utf-8')
    coverage={'generated_at_utc':now.isoformat(),'months':qs,'incomplete_months':sorted(incomplete)}
    (root/'quality/coverage.json').write_text(json.dumps(coverage,ensure_ascii=False,indent=2),encoding='utf-8')
    log('manifest',manifest_path,'incomplete',len(incomplete))
if __name__=='__main__':main()
