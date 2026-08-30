
const TF_SECONDS={'8h':28800,'4h':14400,'1h':3600,'15m':900,'5m':300,'1m':60};
const finite=x=>Number.isFinite(Number(x));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mean=a=>{const x=a.filter(finite).map(Number);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null};

export function structuralLinePrice(line,t){
  if(!line?.a||!line?.b||line.a.time===line.b.time)return null;
  return Number(line.a.price)+(Number(line.b.price)-Number(line.a.price))*(Number(t)-Number(line.a.time))/(Number(line.b.time)-Number(line.a.time));
}
function tr(rows,i){
  const r=rows[i];if(i===0)return Number(r[2])-Number(r[3]);
  return Math.max(Number(r[2])-Number(r[3]),Math.abs(Number(r[2])-Number(rows[i-1][4])),Math.abs(Number(r[3])-Number(rows[i-1][4])));
}
function rollingMean(arr,i,n){
  const x=[];for(let j=Math.max(0,i-n+1);j<=i;j++)if(finite(arr[j]))x.push(Number(arr[j]));
  return mean(x);
}
function rollingAtr(rows,i,n=14){
  const x=[];for(let j=Math.max(0,i-n+1);j<=i;j++)x.push(tr(rows,j));
  return Math.max(mean(x)||0,1e-9);
}
function efficiency(closes,i,n=6){
  if(i<n)return null;
  const net=Number(closes[i])-Number(closes[i-n]);let path=0;
  for(let j=i-n+1;j<=i;j++)path+=Math.abs(Number(closes[j])-Number(closes[j-1]));
  return path>1e-12?net/path:0;
}
function confirmedPivots(rows,span=2){
  const highs=[],lows=[];
  for(let j=span;j<rows.length-span;j++){
    let hi=true,lo=true;
    for(let k=j-span;k<=j+span;k++){
      if(k===j)continue;
      if(Number(rows[k][2])>=Number(rows[j][2]))hi=false;
      if(Number(rows[k][3])<=Number(rows[j][3]))lo=false;
    }
    const confirm=j+span;
    if(hi)highs.push({index:j,confirmIndex:confirm,time:Number(rows[j][0]),price:Number(rows[j][2])});
    if(lo)lows.push({index:j,confirmIndex:confirm,time:Number(rows[j][0]),price:Number(rows[j][3])});
  }
  return {highs,lows};
}
function contextAt(ctx,t){
  if(!ctx?.length)return null;
  let lo=0,hi=ctx.length-1,b=null;
  while(lo<=hi){const m=(lo+hi)>>1;if(Number(ctx[m].time)<=t){b=ctx[m];lo=m+1}else hi=m-1}
  return b;
}
function futureMetrics(rows,i,tfSec){
  const entry=Number(rows[i][4]);
  const horizons={h1:3600,h4:14400,h8:28800,h24:86400},out={};
  for(const [name,secs] of Object.entries(horizons)){
    const end=Number(rows[i][0])+tfSec+secs;
    const xs=[];
    for(let j=i+1;j<rows.length&&Number(rows[j][0])<end;j++)xs.push(rows[j]);
    if(!xs.length){out[name]=null;continue}
    const last=Number(xs.at(-1)[4]);
    const mfe=Math.max(...xs.map(r=>Number(r[2])/entry-1));
    const mae=Math.min(...xs.map(r=>Number(r[3])/entry-1));
    out[name]={return:last/entry-1,mfe,mae,marginMae10x:mae*10};
  }
  return out;
}
function rank(a){
  const idx=a.map((v,i)=>[Number(v),i]).sort((x,y)=>x[0]-y[0]),r=Array(a.length);
  let i=0;
  while(i<idx.length){
    let j=i;while(j+1<idx.length&&idx[j+1][0]===idx[i][0])j++;
    const rr=(i+j)/2+1;for(let k=i;k<=j;k++)r[idx[k][1]]=rr;i=j+1;
  }
  return r;
}
function corr(a,b){
  if(a.length<3)return null;
  const ma=mean(a),mb=mean(b);let n=0,da=0,db=0;
  for(let i=0;i<a.length;i++){const x=a[i]-ma,y=b[i]-mb;n+=x*y;da+=x*x;db+=y*y}
  return da>0&&db>0?n/Math.sqrt(da*db):null;
}
function spearman(a,b){return corr(rank(a),rank(b))}
function qSpread(x,y){
  const z=x.map((v,i)=>[v,y[i]]).sort((a,b)=>a[0]-b[0]),n=z.length,q=Math.max(1,Math.floor(n*.25));
  return (mean(z.slice(-q).map(v=>v[1]))??0)-(mean(z.slice(0,q).map(v=>v[1]))??0);
}

export function computeConditionalRows(rows,tf,horizontal,trendline,contextRows=[]){
  const tfSec=TF_SECONDS[tf]||60;
  const closes=rows.map(r=>Number(r[4])),vol=rows.map(r=>Number(r[5]));
  const piv=confirmedPivots(rows,2);
  let hiPtr=0,loPtr=0;const knownH=[],knownL=[],out=[];
  for(let i=0;i<rows.length;i++){
    while(hiPtr<piv.highs.length&&piv.highs[hiPtr].confirmIndex<=i)knownH.push(piv.highs[hiPtr++]);
    while(loPtr<piv.lows.length&&piv.lows[loPtr].confirmIndex<=i)knownL.push(piv.lows[loPtr++]);
    if(i<20)continue;
    const r=rows[i],t=Number(r[0]),o=Number(r[1]),h=Number(r[2]),l=Number(r[3]),c=Number(r[4]),A=rollingAtr(rows,i,14);
    const lastH=knownH.at(-1),prevH=knownH.at(-2),lastL=knownL.at(-1),prevL=knownL.at(-2);
    const hl=!!(lastL&&prevL&&lastL.price>prevL.price);
    const hh=!!(lastH&&prevH&&lastH.price>prevH.price);
    const bosUp=!!(lastH&&i>0&&Number(rows[i-1][4])<=lastH.price&&c>lastH.price);
    const bosStrength=lastH?(c-lastH.price)/A:null;
    const eff=efficiency(closes,i,6),effPrev=efficiency(closes,i-6,6);
    const downsideEfficiencyChange=finite(eff)&&finite(effPrev)?eff-effPrev:null;
    const rng=Math.max(h-l,1e-9),lowerWick=(Math.min(o,c)-l)/rng;
    let upV=0,downV=0;
    for(let j=Math.max(0,i-7);j<=i;j++){if(Number(rows[j][4])>=Number(rows[j][1]))upV+=vol[j];else downV+=vol[j]}
    const volumeAsymmetry=(upV+1)/(downV+1);
    const atr5=rollingMean(rows.map((_,j)=>tr(rows,j)),i,5),atr20=rollingMean(rows.map((_,j)=>tr(rows,j)),i,20);
    const compression=atr20?atr5/atr20:null;
    const hp=Number(horizontal.price),tlp=structuralLinePrice(trendline,t);
    const hDist=(c-hp)/A,tlDist=finite(tlp)?(c-tlp)/A:null;
    let minLow=Infinity,minClose=Infinity;
    for(let j=Math.max(0,i-12);j<=i;j++){minLow=Math.min(minLow,Number(rows[j][3]));minClose=Math.min(minClose,Number(rows[j][4]))}
    const undercutDepth=Math.max(0,(hp-minLow)/A);
    const hadBelow=minClose<hp;
    const reclaim=hadBelow&&c>hp&&Number(rows[i-1][4])<=hp;
    const ctx=contextAt(contextRows,t+tfSec);
    out.push({
      index:i,barTime:t,decisionTime:t+tfSec,open:o,high:h,low:l,close:c,atr:A,
      hl,hh,bosUp,bosStrengthAtr:bosStrength,
      lastSwingHigh:lastH?.price??null,lastSwingLow:lastL?.price??null,
      horizontalDistanceAtr:hDist,trendlineDistanceAtr:tlDist,trendlinePrice:tlp,
      aboveHorizontal:c>=hp,aboveTrendline:finite(tlp)?c>=tlp:null,
      undercutDepthAtr:undercutDepth,reclaim,
      downsideEfficiency:eff,downsideEfficiencyChange,lowerWickRatio:lowerWick,
      volumeAsymmetry,compression,
      funding_z7d:ctx?.funding_z7d??null,basis_bps_z7d:ctx?.basis_bps_z7d??null,
      oi_change_1h:ctx?.oi_change_1h??null,taker_ls_ratio:ctx?.taker_ls_ratio??null,
      outcomes:futureMetrics(rows,i,tfSec)
    });
  }
  return out;
}
function scoreCandidate(x){
  const structure=clamp((x.bosUp?0.58:0)+(x.hl?0.30:0)+(x.reclaim?0.12:0),0,1);
  const hNear=clamp(1-Math.max(0,Math.abs(x.horizontalDistanceAtr)-.25)/2.75,0,1);
  const tlOk=x.trendlineDistanceAtr==null?.5:clamp((x.trendlineDistanceAtr+1.1)/2.2,0,1);
  const context=.60*hNear+.40*tlOk;
  const exhaustion=clamp(
    .45*clamp(((x.downsideEfficiencyChange??0)+.15)/.65,0,1)+
    .35*clamp(x.lowerWickRatio/.55,0,1)+
    .20*clamp((1.15-(x.compression??1))/0.6,0,1),0,1);
  const vol=clamp(Math.log(Math.max(x.volumeAsymmetry,1e-6))/1.2+.5,0,1);
  let deriv=.5,n=0,s=0;
  if(finite(x.oi_change_1h)){s+=x.oi_change_1h<=0?1:0;n++}
  if(finite(x.taker_ls_ratio)){s+=clamp((x.taker_ls_ratio-.8)/.6,0,1);n++}
  if(finite(x.funding_z7d)){s+=clamp((2-Math.max(x.funding_z7d,0))/2,0,1);n++}
  if(n)deriv=s/n;
  const score=100*clamp(.40*structure+.23*context+.18*exhaustion+.10*vol+.09*deriv,0,1);
  return {score,components:{structure:structure*100,context:context*100,exhaustion:exhaustion*100,volume:vol*100,derivatives:deriv*100}};
}
export function discoverB3Candidates(rows,tf,horizontal,trendline,zone,contextRows=[]){
  const all=computeConditionalRows(rows,tf,horizontal,trendline,contextRows);
  const tfSec=TF_SECONDS[tf]||60,candidates=[];
  for(const x of all){
    if(x.decisionTime<zone.start||x.decisionTime>zone.end)continue;
    const structureTrigger=x.bosUp&&(x.hl||(x.downsideEfficiencyChange??0)>.14||x.reclaim);
    const contextOk=Math.abs(x.horizontalDistanceAtr)<=3.0&&(x.trendlineDistanceAtr==null||x.trendlineDistanceAtr>=-1.3);
    if(!structureTrigger||!contextOk)continue;
    const s=scoreCandidate(x);
    const type=x.reclaim?'B3_RECLAIM_BOS':x.hl?'B3_HL_BOS':'B3_EARLY_BOS';
    candidates.push({...x,timeframe:tf,type,...s,id:`${tf}_${x.decisionTime}`});
  }
  // Cooldown / cluster dedupe: keep the strongest signal in a local burst.
  const cooldown=Math.max(1800,tfSec*4),dedup=[];
  for(const c of candidates.sort((a,b)=>a.decisionTime-b.decisionTime)){
    const last=dedup.at(-1);
    if(last&&c.decisionTime-last.decisionTime<cooldown){
      if(c.score>last.score)dedup[dedup.length-1]=c;
    }else dedup.push(c);
  }
  return {candidates:dedup,rows:all};
}
export function factorDiscovery(records,zone){
  const x=records.filter(r=>r.decisionTime>=zone.start&&r.decisionTime<=zone.end&&finite(r.outcomes?.h4?.return));
  const defs=[
    ['horizontal_distance_atr','距水平线ATR',r=>r.horizontalDistanceAtr],
    ['abs_horizontal_distance','水平线贴近度',r=>-Math.abs(r.horizontalDistanceAtr)],
    ['trendline_distance_atr','距趋势线ATR',r=>r.trendlineDistanceAtr],
    ['bos_strength_atr','BOS强度',r=>r.bosStrengthAtr],
    ['downside_efficiency','下跌效率',r=>r.downsideEfficiency],
    ['downside_efficiency_change','下跌衰竭改善',r=>r.downsideEfficiencyChange],
    ['lower_wick_ratio','下影线比例',r=>r.lowerWickRatio],
    ['volume_asymmetry','上涨/下跌成交量比',r=>r.volumeAsymmetry],
    ['compression','波动压缩',r=>r.compression],
    ['undercut_depth_atr','水平位下穿深度',r=>r.undercutDepthAtr],
    ['funding_z7d','Funding 7日Z',r=>r.funding_z7d],
    ['basis_z7d','Basis 7日Z',r=>r.basis_bps_z7d],
    ['oi_change_1h','OI 1h变化',r=>r.oi_change_1h],
    ['taker_ls_ratio','Taker L/S',r=>r.taker_ls_ratio]
  ];
  const stats=[];
  for(const [key,label,get] of defs){
    const a=[],y=[];
    for(const r of x){const v=get(r),ret=r.outcomes?.h4?.return;if(finite(v)&&finite(ret)){a.push(Number(v));y.push(Number(ret))}}
    if(a.length<12)continue;
    const rho=spearman(a,y),spread=qSpread(a,y);
    stats.push({key,label,n:a.length,rho,quartileSpread:spread,direction:(rho??0)>=0?'越高越有利':'越低越有利'});
  }
  return stats.sort((a,b)=>Math.abs(b.rho??0)-Math.abs(a.rho??0));
}
export function buildStrategyDraft({trendline,horizontal,zone,candidates,factors,acceptedIds=[]}){
  const accepted=candidates.filter(x=>acceptedIds.includes(x.id));
  const sample=accepted.length?accepted:candidates.slice().sort((a,b)=>b.score-a.score).slice(0,5);
  const med=(key)=>{
    const v=sample.map(x=>x[key]).filter(finite).sort((a,b)=>a-b);
    return v.length?v[Math.floor(v.length/2)]:null;
  };
  return {
    version:'STRUCTURE_ENTRY_V001',
    status:'DISCOVERY_DRAFT_NOT_VALIDATED',
    context:{
      trendlineId:trendline.id,horizontalId:horizontal.id,horizontalPrice:horizontal.price,
      entryZone:{start:zone.start,end:zone.end}
    },
    thesis:'高周期趋势线/水平位定义环境；低周期寻找下跌衰竭 -> HL/BOS 的提前多头触发。',
    trigger:{
      requireBOSUp:true,
      requireOneOf:['HL confirmed','downside efficiency improvement','horizontal reclaim'],
      maxAbsHorizontalDistanceAtr:3.0,
      minTrendlineDistanceAtr:-1.3
    },
    discoveryMedians:{
      downsideEfficiencyChange:med('downsideEfficiencyChange'),
      lowerWickRatio:med('lowerWickRatio'),
      volumeAsymmetry:med('volumeAsymmetry'),
      undercutDepthAtr:med('undercutDepthAtr'),
      oiChange1h:med('oi_change_1h'),
      takerLS:med('taker_ls_ratio')
    },
    topConditionalFactors:factors.slice(0,6),
    reviewedAcceptedCount:accepted.length,
    nextStep:'必须在其他历史 Structure Set / Entry Zone 上做独立验证，不能把当前区间的最优阈值直接当正式策略。'
  };
}
