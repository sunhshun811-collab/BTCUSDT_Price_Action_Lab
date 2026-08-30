
function ema(values,period){
  const a=2/(period+1),out=new Array(values.length).fill(NaN);let prev=values[0];
  for(let i=0;i<values.length;i++){prev=i===0?values[i]:a*values[i]+(1-a)*prev;out[i]=prev}return out;
}
function rollingMean(x,n,i){let s=0,c=0;for(let j=Math.max(0,i-n+1);j<=i;j++){if(Number.isFinite(x[j])){s+=x[j];c++}}return c?s/c:NaN}
function atr(rows,n=14){
  const tr=rows.map((r,i)=>i===0?r[2]-r[3]:Math.max(r[2]-r[3],Math.abs(r[2]-rows[i-1][4]),Math.abs(r[3]-rows[i-1][4])));
  return tr.map((_,i)=>rollingMean(tr,n,i));
}
function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
export function scoreBars(rows,p){
  if(rows.length<80)return[];
  const close=rows.map(r=>r[4]),vol=rows.map(r=>r[5]),e20=ema(close,20),e60=ema(close,60),A=atr(rows);
  const out=[];
  for(let i=60;i<rows.length;i++){
    const a=Math.max(A[i]||0,1e-9);
    const trend=Math.tanh((e20[i]-e60[i])/a)+Math.tanh((e20[i]-e20[Math.max(0,i-5)])/a);
    let hh=-Infinity,ll=Infinity;for(let j=i-20;j<i;j++){hh=Math.max(hh,rows[j][2]);ll=Math.min(ll,rows[j][3])}
    const up=Math.max(0,(close[i]-hh)/a),dn=Math.max(0,(ll-close[i])/a);
    const breakout=Math.tanh(up*2)-Math.tanh(dn*2);
    const vm=rollingMean(vol,20,i-1)||vol[i]||1;
    const volume=Math.tanh(Math.log(Math.max(vol[i]/vm,1e-6)))*Math.sign(breakout||trend);
    const raw=p.wTrend*trend+p.wBreakout*breakout+p.wVolume*volume;
    const score=Math.tanh(raw/3);
    out.push({time:rows[i][0],score,trend,breakout,volume,close:close[i]});
  }
  return out;
}
export function previewTrades(scores,threshold,costBps=6){
  let pos=0,entry=0,trades=0,ret=1,wins=0,lastClose=null;
  const events=[];
  for(const x of scores){
    const desired=x.score>=threshold?1:x.score<=-threshold?-1:0;
    if(lastClose!=null&&pos!==0)ret*=1+pos*(x.close/lastClose-1);
    if(desired!==pos){
      if(pos!==0){ret*=1-costBps/10000;events.push({time:x.time,side:pos>0?'CLOSE_LONG':'CLOSE_SHORT',price:x.close});}
      if(desired!==0){ret*=1-costBps/10000;entry=x.close;trades++;events.push({time:x.time,side:desired>0?'OPEN_LONG':'OPEN_SHORT',price:x.close});}
      pos=desired;
    }
    lastClose=x.close;
  }
  return {trades,totalReturn:ret-1,events};
}
