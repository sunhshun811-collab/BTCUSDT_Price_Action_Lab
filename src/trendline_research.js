
export const TF_SECONDS={'8h':28800,'4h':14400,'1h':3600,'15m':900,'5m':300,'1m':60};
const finite=x=>Number.isFinite(Number(x));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mean=a=>{const x=a.filter(finite).map(Number);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null};

export function trendlinePrice(line,time){
  if(!line?.a||!line?.b||line.a.time===line.b.time)return null;
  return Number(line.a.price)+(Number(line.b.price)-Number(line.a.price))*(Number(time)-Number(line.a.time))/(Number(line.b.time)-Number(line.a.time));
}
function tr(rows,i){
  const r=rows[i];if(i===0)return r[2]-r[3];
  return Math.max(r[2]-r[3],Math.abs(r[2]-rows[i-1][4]),Math.abs(r[3]-rows[i-1][4]));
}
function rollingAtr(rows,i,n=14){
  const a=[];for(let j=Math.max(0,i-n+1);j<=i;j++)a.push(tr(rows,j));
  return Math.max(mean(a)||0,1e-9);
}
function rowNearest(rows,t){
  if(!rows.length)return null;
  let lo=0,hi=rows.length-1,b=rows[0];
  while(lo<=hi){const m=(lo+hi)>>1;if(Math.abs(rows[m][0]-t)<Math.abs(b[0]-t))b=rows[m];if(rows[m][0]<t)lo=m+1;else if(rows[m][0]>t)hi=m-1;else return rows[m]}
  return b;
}
function inferRole(line,rows){
  if(line.role==='support'||line.role==='resistance')return line.role;
  const anchors=[line.a,line.b],lowErr=[],highErr=[];
  for(const a of anchors){
    const r=rowNearest(rows,a.time);if(!r)continue;
    const scale=Math.max(r[2]-r[3],1e-9);
    lowErr.push(Math.abs(Number(a.price)-r[3])/scale);
    highErr.push(Math.abs(Number(a.price)-r[2])/scale);
  }
  const le=mean(lowErr),he=mean(highErr);
  if(le!=null&&he!=null)return le<=he?'support':'resistance';
  return Number(line.b.price)>=Number(line.a.price)?'support':'resistance';
}
function anchorFit(line,rows,role){
  const a=[];
  for(const p of [line.a,line.b]){
    const r=rowNearest(rows,p.time);if(!r)continue;
    const px=role==='support'?r[3]:r[2],A=Math.max(r[2]-r[3],1e-9);
    a.push(clamp(1-Math.abs(Number(p.price)-px)/(A*1.2),0,1));
  }
  return mean(a)??0;
}
function eventName(x){
  return ({approach:'APPROACH',touch:'TOUCH',rejection:'REJECTION',wick_break:'WICK_BREAK',
    body_break:'BODY_BREAK',acceptance:'ACCEPTANCE',reclaim:'RECLAIM',retest:'RETEST',
    failed_retest:'FAILED_RETEST',false_break:'FALSE_BREAK'})[x]||x;
}
export function analyzeTrendline(line,rows,tf,decisionTime=null){
  if(!line||line.type!=='trend'||rows.length<5)return {available:false};
  const sec=TF_SECONDS[tf]||60;
  const end=decisionTime??(rows.at(-1)[0]+sec);
  const x=rows.filter(r=>r[0]+sec<=end).sort((a,b)=>a[0]-b[0]);
  if(x.length<5)return {available:false};
  const role=inferRole(line,x),zoneAtr=finite(line.zoneAtr)?Number(line.zoneAtr):0.25;
  const start=Math.max(Number(line.b.time),Number(line.a.time));
  const events=[],contacts=[];let broken=false,acceptedAt=null,retestAt=null,reclaimedAt=null;
  let bodyBreaks=0,wickBreaks=0,touchClusters=0,lastTouchI=-99,reactions=[];
  let prevHealthy=null,acceptRun=0;
  for(let i=0;i<x.length;i++){
    const r=x[i],t=r[0];if(t<start)continue;
    const lp=trendlinePrice(line,t);if(!finite(lp))continue;
    const A=rollingAtr(x,i),z=A*zoneAtr;
    const close=Number(r[4]),high=Number(r[2]),low=Number(r[3]);
    const healthy=role==='support'?close>=lp-z:close<=lp+z;
    const brokenClose=role==='support'?close<lp-z:close>lp+z;
    const wickCross=role==='support'?low<lp-z:high>lp+z;
    const intersects=low<=lp+z&&high>=lp-z;
    const dist=(role==='support'?(close-lp):(lp-close))/A;

    if(Math.abs(dist)<=1&&Math.abs(dist)>.35)events.push({time:t,type:'approach',distanceAtr:dist});
    if(intersects){
      contacts.push(i);
      if(i-lastTouchI>2){touchClusters++;events.push({time:t,type:'touch',distanceAtr:dist});lastTouchI=i}
      if(wickCross&&healthy){wickBreaks++;events.push({time:t,type:'wick_break',distanceAtr:dist})}
      const nxt=x.slice(i+1,Math.min(x.length,i+4));
      if(nxt.length){
        let favorable=0;
        for(const q of nxt){
          const qlp=trendlinePrice(line,q[0]),qa=rollingAtr(x,x.indexOf(q));
          const move=role==='support'?(q[2]-lp)/qa:(lp-q[3])/qa;
          favorable=Math.max(favorable,move);
        }
        if(favorable>=.5){reactions.push(favorable);events.push({time:t,type:'rejection',strengthAtr:favorable})}
      }
    }
    if(brokenClose){
      bodyBreaks++;acceptRun++;
      if(prevHealthy===true)events.push({time:t,type:'body_break',distanceAtr:dist});
    }else acceptRun=0;

    if(!broken&&acceptRun>=2){
      broken=true;acceptedAt=t;events.push({time:t,type:'acceptance',distanceAtr:dist});
    }
    if(broken&&acceptedAt!=null&&t>acceptedAt&&intersects&&retestAt==null){
      retestAt=t;events.push({time:t,type:'retest',distanceAtr:dist});
    }
    if(broken&&healthy){
      const recent=x.slice(Math.max(0,i-1),i+1);
      if(recent.length===2&&recent.every(q=>{
        const qlp=trendlinePrice(line,q[0]),qa=rollingAtr(x,x.indexOf(q)),qc=q[4];
        return role==='support'?qc>=qlp-zoneAtr*qa:qc<=qlp+zoneAtr*qa;
      })){
        reclaimedAt=t;broken=false;acceptedAt=null;retestAt=null;events.push({time:t,type:'reclaim',distanceAtr:dist});
        events.push({time:t,type:'false_break',distanceAtr:dist});
      }
    }
    if(broken&&retestAt!=null&&t>retestAt){
      const away=role==='support'?(lp-close)/A:(close-lp)/A;
      if(away>=.5){
        events.push({time:t,type:'failed_retest',strengthAtr:away});
        retestAt=null;
      }
    }
    prevHealthy=healthy;
  }

  const last=x.at(-1),lastLp=trendlinePrice(line,last[0]),lastAtr=rollingAtr(x,x.length-1);
  const distanceAtr=role==='support'?(last[4]-lastLp)/lastAtr:(lastLp-last[4])/lastAtr;
  const slopePerDay=(Number(line.b.price)-Number(line.a.price))/((Number(line.b.time)-Number(line.a.time))/86400);
  const ageDays=Math.max(0,(last[0]-Math.min(line.a.time,line.b.time))/86400);
  const fit=anchorFit(line,x,role);
  const reaction=clamp((mean(reactions)||0)/1.5,0,1);
  const touchScore=clamp(touchClusters/4,0,1);
  const ageScore=clamp(Math.log1p(ageDays)/Math.log(181),0,1);
  const breakPenalty=clamp(bodyBreaks/Math.max(4,touchClusters*2),0,1);
  const quality=100*clamp(.28*fit+.28*touchScore+.24*reaction+.20*ageScore-.28*breakPenalty,0,1);

  const lastEvents=events.slice(-20).map(e=>({...e,name:eventName(e.type)}));
  const latest=lastEvents.at(-1);
  let lifecycle='ACTIVE';
  if(Math.abs(distanceAtr)<=zoneAtr*1.4)lifecycle='TESTING';
  if(bodyBreaks>=Math.max(3,touchClusters))lifecycle='WEAKENING';
  if(latest?.type==='acceptance'||broken)lifecycle='BROKEN';
  if(latest?.type==='retest')lifecycle='RETESTING';
  if(latest?.type==='failed_retest')lifecycle='BROKEN';
  if(latest?.type==='reclaim'||latest?.type==='false_break')lifecycle='ACTIVE';

  return {
    available:true,id:line.id,timeframe:tf,role,zoneAtr,quality,lifecycle,
    researchConfirmed:!!line.researchConfirmed,causalEligible:!!line.causalEligible,
    validFrom:line.validFrom??null,distanceAtr,slopePerDay,ageDays,touchCount:touchClusters,
    bodyBreakCount:bodyBreaks,wickBreakCount:wickBreaks,avgReactionAtr:mean(reactions),
    anchorFit:fit,currentLinePrice:lastLp,currentPrice:last[4],lastEvent:latest??null,events:lastEvents
  };
}
export function eligibleTrendlineFeatures(lines,rows,tf,decisionTime){
  const eligible=lines.filter(x=>x.type==='trend'&&x.timeframe===tf&&x.researchConfirmed&&x.causalEligible&&(x.validFrom==null||Number(x.validFrom)<=decisionTime));
  const analyses=eligible.map(x=>analyzeTrendline(x,rows,tf,decisionTime)).filter(x=>x.available);
  analyses.sort((a,b)=>Math.abs(a.distanceAtr)-Math.abs(b.distanceAtr));
  return {count:analyses.length,closest:analyses[0]??null,highQuality:analyses.filter(x=>x.quality>=70).length,all:analyses.slice(0,6)};
}
export function trendlineConfluence(snapshot,threshold=.45){
  const xs=[];
  for(const [tf,f] of Object.entries(snapshot.timeframes||{})){
    const t=f?.trendlines?.closest;
    if(t&&Math.abs(t.distanceAtr)<=threshold)xs.push({timeframe:tf,...t});
  }
  const quality=xs.length?mean(xs.map(x=>x.quality)):null;
  return {count:xs.length,quality,lines:xs};
}
