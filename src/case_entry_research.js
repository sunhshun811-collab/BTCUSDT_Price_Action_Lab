
export const TF_SECONDS={'8h':28800,'4h':14400,'1h':3600,'15m':900,'5m':300,'1m':60};
const finite=x=>Number.isFinite(Number(x));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mean=a=>{const x=a.filter(finite).map(Number);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null};

export function linePrice(line,t){
  if(!line?.a||!line?.b||Number(line.a.time)===Number(line.b.time))return null;
  return Number(line.a.price)+(Number(line.b.price)-Number(line.a.price))*(Number(t)-Number(line.a.time))/(Number(line.b.time)-Number(line.a.time));
}
function tr(rows,i){
  const r=rows[i];
  if(i===0)return Number(r[2])-Number(r[3]);
  return Math.max(Number(r[2])-Number(r[3]),Math.abs(Number(r[2])-Number(rows[i-1][4])),Math.abs(Number(r[3])-Number(rows[i-1][4])));
}
function atr(rows,i,n=14){
  const x=[];for(let j=Math.max(0,i-n+1);j<=i;j++)x.push(tr(rows,j));
  return Math.max(mean(x)||0,1e-9);
}
function avg(arr,i,n){
  const x=[];for(let j=Math.max(0,i-n+1);j<=i;j++)if(finite(arr[j]))x.push(Number(arr[j]));
  return mean(x);
}
function efficiency(close,i,n=6){
  if(i<n)return null;
  let path=0;for(let j=i-n+1;j<=i;j++)path+=Math.abs(Number(close[j])-Number(close[j-1]));
  return path>1e-12?(Number(close[i])-Number(close[i-n]))/path:0;
}
function pivots(rows,span=2){
  const H=[],L=[];
  for(let i=span;i<rows.length-span;i++){
    let hi=true,lo=true;
    for(let j=i-span;j<=i+span;j++){
      if(j===i)continue;
      if(Number(rows[j][2])>=Number(rows[i][2]))hi=false;
      if(Number(rows[j][3])<=Number(rows[i][3]))lo=false;
    }
    if(hi)H.push({index:i,confirm:i+span,time:Number(rows[i][0]),price:Number(rows[i][2])});
    if(lo)L.push({index:i,confirm:i+span,time:Number(rows[i][0]),price:Number(rows[i][3])});
  }
  return {H,L};
}
function ctxAt(ctx,t){
  if(!ctx?.length)return null;
  let lo=0,hi=ctx.length-1,b=null;
  while(lo<=hi){const m=(lo+hi)>>1;if(Number(ctx[m].time)<=t){b=ctx[m];lo=m+1}else hi=m-1}
  return b;
}
function nearestCtx(ctx,t){return ctxAt(ctx,t)}
function futureFromCandidate(rows,i,tfSec){
  const entry=Number(rows[i][4]),horizons={h1:3600,h4:14400,h8:28800,h24:86400},out={};
  for(const [k,sec] of Object.entries(horizons)){
    const end=Number(rows[i][0])+tfSec+sec;let last=null,mfe=-Infinity,mae=Infinity;
    for(let j=i+1;j<rows.length&&Number(rows[j][0])<end;j++){
      last=rows[j];mfe=Math.max(mfe,Number(rows[j][2])/entry-1);mae=Math.min(mae,Number(rows[j][3])/entry-1);
    }
    out[k]=last?{
      return:Number(last[4])/entry-1,mfe,mae,
      marginMae10x:mae*10,
      accountMaeApprox:mae // 10% margin x 10x => ~100% account notional
    }:null;
  }
  return out;
}
function processSnapshot(ctx,zoneStart,localLowTime,triggerTime,entryTime){
  const pick=t=>nearestCtx(ctx,t);
  const z=pick(zoneStart),l=pick(localLowTime),p=pick(Math.max(zoneStart,triggerTime-3600)),e=pick(entryTime);
  const field=k=>({zone:z?.[k]??null,low:l?.[k]??null,preTrigger:p?.[k]??null,entry:e?.[k]??null});
  return {
    funding_z7d:field('funding_z7d'),
    basis_bps_z7d:field('basis_bps_z7d'),
    oi_change_1h:field('oi_change_1h'),
    taker_ls_ratio:field('taker_ls_ratio')
  };
}
function featureRecord(rows,i,tf,horizontal,trendline,zone,ctx,knownH,knownL){
  const tfSec=TF_SECONDS[tf],r=rows[i],t=Number(r[0]),close=Number(r[4]),A=atr(rows,i);
  const H=knownH.at(-1),H0=knownH.at(-2),L=knownL.at(-1),L0=knownL.at(-2);
  const hl=!!(L&&L0&&L.price>L0.price),hh=!!(H&&H0&&H.price>H0.price);
  const bosUp=!!(H&&i>0&&Number(rows[i-1][4])<=H.price&&close>H.price);
  const bosStrength=H?(close-H.price)/A:null;
  const closes=rows.map(x=>Number(x[4])),vols=rows.map(x=>Number(x[5]));
  const eff=efficiency(closes,i,6),oldEff=efficiency(closes,i-6,6);
  const effImprove=finite(eff)&&finite(oldEff)?eff-oldEff:null;
  const o=Number(r[1]),h=Number(r[2]),l=Number(r[3]),range=Math.max(h-l,1e-9);
  const lowerWick=(Math.min(o,close)-l)/range;
  let upV=0,dnV=0;
  for(let j=Math.max(0,i-7);j<=i;j++){if(Number(rows[j][4])>=Number(rows[j][1]))upV+=vols[j];else dnV+=vols[j]}
  const volAsym=(upV+1)/(dnV+1);
  const trv=rows.map((_,j)=>tr(rows,j)),a5=avg(trv,i,5),a20=avg(trv,i,20),compression=a20?a5/a20:null;
  const hp=Number(horizontal.price),tp=linePrice(trendline,t),hDist=(close-hp)/A,tDist=finite(tp)?(close-tp)/A:null;
  let minLow=Infinity,minLowTime=t,minClose=Infinity;
  for(let j=Math.max(0,i-18);j<=i;j++){
    if(Number(rows[j][3])<minLow){minLow=Number(rows[j][3]);minLowTime=Number(rows[j][0])}
    minClose=Math.min(minClose,Number(rows[j][4]));
  }
  const reclaim=minClose<hp&&close>hp&&Number(rows[i-1][4])<=hp;
  const undercut=Math.max(0,(hp-minLow)/A);
  const c=ctxAt(ctx,t+tfSec)||{};
  return {
    index:i,barTime:t,decisionTime:t+tfSec,timeframe:tf,entryPrice:close,atr:A,
    hl,hh,bosUp,bosStrengthAtr:bosStrength,lastSwingHigh:H?.price??null,lastSwingLow:L?.price??null,
    downsideEfficiency:eff,downsideEfficiencyChange:effImprove,lowerWickRatio:lowerWick,
    volumeAsymmetry:volAsym,compression,
    horizontalDistanceAtr:hDist,trendlineDistanceAtr:tDist,undercutDepthAtr:undercut,reclaim,
    funding_z7d:c.funding_z7d??null,basis_bps_z7d:c.basis_bps_z7d??null,
    oi_change_1h:c.oi_change_1h??null,taker_ls_ratio:c.taker_ls_ratio??null,
    localLowTime:minLowTime,
    process:processSnapshot(ctx,zone.start,minLowTime,t+tfSec,t+tfSec)
  };
}
function stageCandidate(f,prev){
  const exhaustion=(f.downsideEfficiencyChange??-9)>.12 &&
    ((f.lowerWickRatio??0)>.24 || (f.compression??9)<.90);
  const newHL=f.hl&&!prev?.hl;
  const bos=f.bosUp;
  if(f.reclaim&&bos&&f.hl)return {level:5,type:'L5_RECLAIM_HL_BOS',reason:'Reclaim + HL + BOS'};
  if(f.hl&&bos)return {level:4,type:'L4_HL_BOS',reason:'HL + BOS'};
  if(bos)return {level:3,type:'L3_BOS',reason:'低周期向上 BOS'};
  if(newHL)return {level:2,type:'L2_HL_CONFIRMED',reason:'Higher Low 已确认'};
  if(exhaustion)return {level:1,type:'L1_DOWNSIDE_EXHAUSTION',reason:'下跌效率衰减/拒绝/压缩'};
  return null;
}
function quality(f,level){
  const structure=clamp(level/5,0,1);
  const horizontal=clamp(1-Math.max(0,Math.abs(f.horizontalDistanceAtr)-.2)/3,0,1);
  const trend=f.trendlineDistanceAtr==null?.5:clamp((f.trendlineDistanceAtr+1.2)/2.6,0,1);
  const exhaustion=clamp(.45*clamp(((f.downsideEfficiencyChange??-.2)+.2)/.65,0,1)+.30*clamp((f.lowerWickRatio??0)/.55,0,1)+.25*clamp((1.1-(f.compression??1))/0.55,0,1),0,1);
  const volume=clamp(Math.log(Math.max(f.volumeAsymmetry,1e-6))/1.2+.5,0,1);
  const score=100*clamp(.43*structure+.22*horizontal+.12*trend+.15*exhaustion+.08*volume,0,1);
  return {score,components:{structure:structure*100,horizontal:horizontal*100,trendline:trend*100,exhaustion:exhaustion*100,volume:volume*100}};
}
export function scanCaseTf(rows,tf,structureCase,ctx=[]){
  const zone=structureCase.zone,horizontal=structureCase.horizontal,trendline=structureCase.trendline,tfSec=TF_SECONDS[tf];
  const pv=pivots(rows,2),knownH=[],knownL=[];let hi=0,lo=0,prev=null;
  const candidates=[],featureRows=[];let lastByLevel={};
  for(let i=0;i<rows.length;i++){
    while(hi<pv.H.length&&pv.H[hi].confirm<=i)knownH.push(pv.H[hi++]);
    while(lo<pv.L.length&&pv.L[lo].confirm<=i)knownL.push(pv.L[lo++]);
    if(i<24)continue;
    const f=featureRecord(rows,i,tf,horizontal,trendline,zone,ctx,knownH,knownL);
    if(f.decisionTime>=zone.start&&f.decisionTime<=zone.end)featureRows.push(f);
    const st=stageCandidate(f,prev);prev=f;
    if(!st||f.decisionTime<zone.start||f.decisionTime>zone.end)continue;
    if(Math.abs(f.horizontalDistanceAtr)>4.0)continue;
    if(f.trendlineDistanceAtr!=null&&f.trendlineDistanceAtr<-1.6)continue;
    const cd=Math.max(tfSec*3,900),last=lastByLevel[st.level]??-Infinity;
    if(f.decisionTime-last<cd)continue;
    lastByLevel[st.level]=f.decisionTime;
    const q=quality(f,st.level);
    const c={
      ...f,...st,...q,
      id:`${structureCase.id}:${tf}:${f.decisionTime}:${st.type}`,
      sourceTf:tf,structureCaseId:structureCase.id,
      outcomes:futureFromCandidate(rows,i,tfSec),
      riskModel:{marginFraction:.10,leverage:10,accountNotionalApprox:1.0}
    };
    candidates.push(c);
  }
  return {tf,candidates,featureRows};
}
export function explainCase(candidates,feedback={}){
  const fields=[
    ['level','买点确认层级'],
    ['bosStrengthAtr','BOS强度'],
    ['downsideEfficiencyChange','下跌衰竭改善'],
    ['lowerWickRatio','下影线比例'],
    ['volumeAsymmetry','上涨/下跌成交量比'],
    ['compression','波动压缩'],
    ['horizontalDistanceAtr','距水平线ATR'],
    ['trendlineDistanceAtr','距趋势线ATR'],
    ['undercutDepthAtr','水平位下穿深度'],
    ['funding_z7d','Funding 7日Z'],
    ['basis_bps_z7d','Basis 7日Z'],
    ['oi_change_1h','OI 1h变化'],
    ['taker_ls_ratio','Taker L/S']
  ];
  const A=candidates.filter(c=>feedback[c.id]?.verdict==='accept');
  const R=candidates.filter(c=>feedback[c.id]?.verdict==='reject');
  const out=[];
  for(const [key,label] of fields){
    const av=A.map(x=>x[key]).filter(finite),rv=R.map(x=>x[key]).filter(finite);
    const all=candidates.map(x=>x[key]).filter(finite),am=mean(av),rm=mean(rv),sd=(()=>{
      const m=mean(all);if(all.length<2||m==null)return null;
      return Math.sqrt(all.reduce((s,v)=>s+(v-m)**2,0)/all.length)
    })();
    out.push({
      key,label,acceptedN:av.length,rejectedN:rv.length,acceptedMean:am,rejectedMean:rm,
      separation:(finite(am)&&finite(rm)&&finite(sd)&&sd>1e-12)?(am-rm)/sd:null,
      caseRange:all.length?[Math.min(...all),Math.max(...all)]:null
    });
  }
  return out.sort((a,b)=>Math.abs(b.separation??0)-Math.abs(a.separation??0));
}

export function classifyByIdealZone(candidate,idealZone){
  if(!idealZone)return 'UNSET';
  const t=Number(candidate.decisionTime);
  if(t<Number(idealZone.start))return 'TOO_EARLY';
  if(t>Number(idealZone.end))return 'TOO_LATE';
  return 'IN_IDEAL_ZONE';
}
export function explainIdealZone(candidates,idealZone){
  if(!idealZone)return[];
  const inside=candidates.filter(x=>classifyByIdealZone(x,idealZone)==='IN_IDEAL_ZONE');
  const outside=candidates.filter(x=>classifyByIdealZone(x,idealZone)!=='IN_IDEAL_ZONE');
  const fields=[
    ['level','买点确认层级'],['bosStrengthAtr','BOS强度'],['downsideEfficiencyChange','下跌衰竭改善'],
    ['lowerWickRatio','下影线比例'],['volumeAsymmetry','上涨/下跌成交量比'],['compression','波动压缩'],
    ['horizontalDistanceAtr','距水平线ATR'],['trendlineDistanceAtr','距趋势线ATR'],['undercutDepthAtr','水平位下穿深度'],
    ['funding_z7d','Funding 7日Z'],['basis_bps_z7d','Basis 7日Z'],['oi_change_1h','OI 1h变化'],['taker_ls_ratio','Taker L/S']
  ];
  const out=[];
  for(const [key,label] of fields){
    const a=inside.map(x=>x[key]).filter(finite),b=outside.map(x=>x[key]).filter(finite),all=[...a,...b];
    const am=mean(a),bm=mean(b),m=mean(all);
    const sd=all.length>1&&m!=null?Math.sqrt(all.reduce((s,v)=>s+(v-m)**2,0)/all.length):null;
    out.push({key,label,insideN:a.length,outsideN:b.length,insideMean:am,outsideMean:bm,
      separation:(finite(am)&&finite(bm)&&finite(sd)&&sd>1e-12)?(am-bm)/sd:null});
  }
  return out.sort((a,b)=>Math.abs(b.separation??0)-Math.abs(a.separation??0));
}
export function buildCaseDraft(structureCase,feedback={},explanation=[]){
  const accepted=structureCase.candidates.filter(c=>feedback[c.id]?.verdict==='accept');
  return {
    version:'STRUCTURE_ENTRY_V002',
    status:'CURRENT_CASE_EXPLANATION_ONLY',
    structureCaseId:structureCase.id,
    sourceTimeframe:structureCase.sourceTf,
    structure:{
      trendline:structureCase.trendline,
      horizontal:structureCase.horizontal,
      entryZone:structureCase.zone
    },
    humanApprovedEntries:accepted.map(x=>({id:x.id,timeframe:x.sourceTf,decisionTime:x.decisionTime,entryPrice:x.entryPrice,level:x.level,type:x.type})),
    idealEntryZone:structureCase.idealZone||null,
    strongestCurrentCaseSeparators:explanation.filter(x=>finite(x.separation)).slice(0,8),
    riskModel:{marginFraction:.10,leverage:10,accountNotionalApprox:1.0},
    note:'仅解释当前人工确认 Structure Case；未做自动相似结构、未做泛化验证、未声明为有效 Alpha。'
  };
}
