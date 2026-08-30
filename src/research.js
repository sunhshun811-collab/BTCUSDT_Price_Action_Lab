
const CASE_KEY='priceActionLab.strategyCases.v3';
const VERSION_KEY='priceActionLab.strategyVersion.v3';

export const TF_SECONDS={'8h':28800,'4h':14400,'1h':3600,'15m':900,'5m':300,'1m':60};
export const TF_ORDER=['8h','4h','1h','15m','5m','1m'];

export function getStrategyVersion(){return localStorage.getItem(VERSION_KEY)||'PA_SETUP_V001'}
export function setStrategyVersion(v){localStorage.setItem(VERSION_KEY,String(v||'PA_SETUP_V001').trim()||'PA_SETUP_V001')}
export function getCases(){try{return JSON.parse(localStorage.getItem(CASE_KEY)||'[]')}catch{return[]}}
export function saveCase(x){const v=getCases();v.push(x);localStorage.setItem(CASE_KEY,JSON.stringify(v));return x}
export function clearCases(){localStorage.removeItem(CASE_KEY)}

const finite=x=>Number.isFinite(Number(x));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mean=x=>{const a=x.filter(finite).map(Number);return a.length?a.reduce((s,v)=>s+v,0)/a.length:null};
const sd=x=>{const a=x.filter(finite).map(Number);if(a.length<2)return null;const m=mean(a);return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/a.length)};
const ema=(a,n)=>{if(!a.length)return[];const k=2/(n+1),o=[];let p=a[0];for(let i=0;i<a.length;i++){p=i?Number(a[i])*k+p*(1-k):Number(a[i]);o.push(p)}return o};
const tanh=x=>Math.tanh(Number.isFinite(x)?x:0);
const pct=(a,b)=>finite(a)&&finite(b)&&Number(b)!==0?Number(a)/Number(b)-1:null;

function trueRange(rows,i){
  const r=rows[i];if(i===0)return r[2]-r[3];
  return Math.max(r[2]-r[3],Math.abs(r[2]-rows[i-1][4]),Math.abs(r[3]-rows[i-1][4]));
}
function atr(rows,n=14){
  if(!rows.length)return null;
  const x=[];for(let i=Math.max(0,rows.length-n);i<rows.length;i++)x.push(trueRange(rows,i));
  return mean(x);
}
function confirmedPivots(rows,span=3){
  // Candidate pivot j is considered only after span bars to its right have CLOSED.
  // Because rows passed here are already truncated to bars closed by decisionTime,
  // this is causal and does not repaint at the decision timestamp.
  const highs=[],lows=[];
  for(let j=span;j<rows.length-span;j++){
    let hi=true,lo=true;
    for(let k=j-span;k<=j+span;k++){
      if(k===j)continue;
      if(rows[k][2]>=rows[j][2])hi=false;
      if(rows[k][3]<=rows[j][3])lo=false;
    }
    if(hi)highs.push({time:rows[j][0],price:rows[j][2]});
    if(lo)lows.push({time:rows[j][0],price:rows[j][3]});
  }
  return {highs,lows};
}
function structureFeatures(rows){
  const {highs,lows}=confirmedPivots(rows,3);
  const h1=highs.at(-1),h0=highs.at(-2),l1=lows.at(-1),l0=lows.at(-2);
  const hh=h1&&h0?h1.price>h0.price:null;
  const hl=l1&&l0?l1.price>l0.price:null;
  const lh=h1&&h0?h1.price<h0.price:null;
  const ll=l1&&l0?l1.price<l0.price:null;
  let score=0,known=0;
  for(const [v,s] of [[hh,1],[hl,1],[lh,-1],[ll,-1]])if(v!=null){known++;if(v)score+=s}
  score=known?score/2:0;
  return {score,hh,hl,lh,ll,lastSwingHigh:h1?.price??null,lastSwingLow:l1?.price??null,
          prevSwingHigh:h0?.price??null,prevSwingLow:l0?.price??null,pivotHighCount:highs.length,pivotLowCount:lows.length};
}
export function causalRows(rows,tf,decisionTime){
  const sec=TF_SECONDS[tf];
  return rows.filter(r=>Number(r[0])+sec<=decisionTime);
}
export function computeFeatures(rows,tf,decisionTime){
  const x=causalRows(rows,tf,decisionTime);
  if(x.length<20)return {timeframe:tf,bars:x.length,available:false};
  const close=x.map(r=>Number(r[4])),vol=x.map(r=>Number(r[5]));
  const e20=ema(close,20),e60=ema(close,60),A=Math.max(atr(x,14)||0,1e-9),last=close.at(-1);
  const retBars=n=>x.length>n?pct(last,close.at(-1-n)):null;
  const look=Math.min(60,x.length),recent=x.slice(-look);
  const hi=Math.max(...recent.map(r=>r[2])),lo=Math.min(...recent.map(r=>r[3]));
  const range=Math.max(hi-lo,1e-9);
  const position=(last-lo)/range;
  const trend=(e20.at(-1)-e60.at(-1))/A;
  const slope20=x.length>6?(e20.at(-1)-e20.at(-6))/A:null;
  const v20=mean(vol.slice(-20)),volumeRatio=v20?vol.at(-1)/v20:null;
  const tr=x.slice(-20).map((_,i,a)=>{const j=x.length-a.length+i;return trueRange(x,j)});
  const noise=A?mean(tr.map(v=>Math.min(v/A,3))):null;
  const st=structureFeatures(x);

  const trendStrength=clamp(Math.abs(tanh(trend/2)),0,1);
  const structureClarity=clamp(Math.abs(st.score),0,1);
  const levelClarity=clamp(Math.abs(position-.5)*2,0,1);
  const volumeClarity=finite(volumeRatio)?clamp(Math.abs(Math.log(Math.max(volumeRatio,1e-6)))/1.2,0,1):0;
  const noisePenalty=finite(noise)?clamp((noise-0.8)/2,0,1):0;
  const clarity=100*clamp(.36*trendStrength+.34*structureClarity+.18*levelClarity+.12*volumeClarity-.18*noisePenalty,0,1);

  return {
    timeframe:tf,available:true,bars:x.length,time:x.at(-1)[0],close:last,atr14:A,
    ema20:e20.at(-1),ema60:e60.at(-1),ema20DistanceAtr:(last-e20.at(-1))/A,
    ema60DistanceAtr:(last-e60.at(-1))/A,trendAtr:trend,ema20Slope5Atr:slope20,
    ret1:retBars(1),ret5:retBars(5),ret20:retBars(20),ret60:retBars(60),
    volumeRatio20:volumeRatio,rangePosition60:position,rollingHigh60:hi,rollingLow60:lo,
    structure:st,clarity
  };
}
export function nearestContext(rows,decisionTime){
  let lo=0,hi=rows.length-1,best=null;
  while(lo<=hi){const m=(lo+hi)>>1;if(rows[m].time<=decisionTime){best=rows[m];lo=m+1}else hi=m-1}
  return best?{...best}:null;
}
function softmax(obj){
  const vals=Object.values(obj),mx=Math.max(...vals),es=vals.map(x=>Math.exp(x-mx)),z=es.reduce((a,b)=>a+b,0);
  const out={};Object.keys(obj).forEach((k,i)=>out[k]=es[i]/z);return out;
}
export function marketStage(snapshot){
  const f8=snapshot.timeframes?.['8h'],f4=snapshot.timeframes?.['4h'],f1=snapshot.timeframes?.['1h'];
  const valid=[f8,f4,f1].filter(x=>x?.available);
  const t=mean(valid.map(x=>tanh(x.trendAtr/2)))||0;
  const s=mean(valid.map(x=>x.structure?.score))||0;
  const mom=mean(valid.map(x=>tanh((x.ret5||0)*8)))||0;
  const ext=mean(valid.map(x=>Math.abs((x.rangePosition60??.5)-.5)*2))||0;
  const scores={
    bear: -1.6*t-1.0*s-0.2*mom,
    transition: 1.1*(1-Math.abs(t))+0.8*(1-Math.abs(s)),
    earlyBull: 1.2*Math.max(t,0)+0.9*Math.max(s,0)-0.4*ext,
    continuation: 1.5*Math.max(t,0)+1.0*Math.max(s,0)+0.5*Math.max(mom,0),
    mature: 1.0*Math.max(t,0)+0.7*Math.max(s,0)+0.8*ext,
    exhaustion: 0.7*Math.max(t,0)+0.9*ext+0.7*Math.max(-mom,0)
  };
  return softmax(scores);
}
export function setupClarity(snapshot){
  const v=TF_ORDER.map(tf=>snapshot.timeframes?.[tf]?.clarity).filter(finite);
  let base=mean(v)||0;
  const c=snapshot.context||{};
  let deriv=0,n=0;
  for(const x of [c.funding_z7d,c.basis_bps_z7d]){
    if(finite(x)){deriv+=clamp(Math.abs(Number(x))/3,0,1);n++}
  }
  if(finite(c.taker_ls_ratio)){deriv+=clamp(Math.abs(Math.log(Math.max(Number(c.taker_ls_ratio),1e-6)))/.8,0,1);n++}
  const d=n?deriv/n:0;
  return clamp(base*.88+d*12,0,100);
}
export function flattenSnapshot(snapshot){
  const a=[];
  for(const tf of TF_ORDER){
    const f=snapshot.timeframes?.[tf]||{};
    a.push(finite(f.trendAtr)?tanh(f.trendAtr/2):0);
    a.push(finite(f.structure?.score)?f.structure.score:0);
    a.push(finite(f.rangePosition60)?(f.rangePosition60-.5)*2:0);
    a.push(finite(f.volumeRatio20)?tanh(Math.log(Math.max(f.volumeRatio20,1e-6))):0);
  }
  const c=snapshot.context||{};
  a.push(finite(c.funding_z7d)?tanh(c.funding_z7d/2):0);
  a.push(finite(c.basis_bps_z7d)?tanh(c.basis_bps_z7d/2):0);
  a.push(finite(c.taker_ls_ratio)?tanh(Math.log(Math.max(c.taker_ls_ratio,1e-6))):0);
  a.push(finite(c.oi_change_1h)?tanh(c.oi_change_1h*20):0);
  return a;
}
export function similarCases(snapshot,cases=getCases(),limit=8){
  const q=flattenSnapshot(snapshot);
  return cases.filter(x=>x.snapshot).map(x=>{
    const v=flattenSnapshot(x.snapshot);let s=0;
    for(let i=0;i<Math.min(q.length,v.length);i++)s+=(q[i]-v[i])**2;
    return {...x,similarity:1/(1+Math.sqrt(s))};
  }).sort((a,b)=>b.similarity-a.similarity).slice(0,limit);
}
export function outcomeFrom1m(rows,decisionTime,direction=1){
  const future=rows.filter(r=>r[0]>=decisionTime).sort((a,b)=>a[0]-b[0]);
  if(!future.length)return {available:false};
  const entry=future[0][1],entryTime=future[0][0],sign=direction>=0?1:-1;
  const horizons={m5:5,m15:15,h1:60,h4:240,h8:480,h24:1440};
  const out={available:true,entry,entryTime,horizons:{},direction:sign};
  for(const [k,n] of Object.entries(horizons)){
    const xs=future.filter(r=>r[0]<entryTime+n*60);
    if(!xs.length){out.horizons[k]=null;continue}
    const last=xs.at(-1)[4],ret=sign*(last/entry-1);
    let mfe=-Infinity,mae=Infinity,mfeTime=null,maeTime=null;
    for(const r of xs){
      const favorable=sign>0?r[2]/entry-1:1-r[3]/entry;
      const adverse=sign>0?r[3]/entry-1:1-r[2]/entry;
      if(favorable>mfe){mfe=favorable;mfeTime=r[0]}
      if(adverse<mae){mae=adverse;maeTime=r[0]}
    }
    out.horizons[k]={return:ret,mfe,mae,mfeTime,maeTime,
      marginMae10x:mae*10,accountMaeApprox:mae};
  }
  return out;
}
export function makeCaseId(){return crypto.randomUUID()}
