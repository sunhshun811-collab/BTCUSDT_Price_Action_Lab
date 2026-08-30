
const TF_SECONDS={'8h':28800,'4h':14400,'1h':3600,'15m':900,'5m':300,'1m':60};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const finite=x=>Number.isFinite(Number(x));
const mean=a=>{const x=a.filter(finite).map(Number);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null};

function tr(rows,i){
  const r=rows[i];if(i===0)return r[2]-r[3];
  return Math.max(r[2]-r[3],Math.abs(r[2]-rows[i-1][4]),Math.abs(r[3]-rows[i-1][4]));
}
function atrAt(rows,i,n=14){
  const a=[];for(let j=Math.max(0,i-n+1);j<=i;j++)a.push(tr(rows,j));
  return Math.max(mean(a)||0,1e-9);
}
function nearestIndex(rows,time){
  let lo=0,hi=rows.length-1,b=0;
  while(lo<=hi){
    const m=(lo+hi)>>1;
    if(Math.abs(rows[m][0]-time)<Math.abs(rows[b][0]-time))b=m;
    if(rows[m][0]<time)lo=m+1;else if(rows[m][0]>time)hi=m-1;else return m;
  }
  return b;
}
export function detectStructuralSwings(rows,span=3){
  const out=[];
  for(let i=span;i<rows.length-span;i++){
    let hi=true,lo=true;
    for(let j=i-span;j<=i+span;j++){
      if(j===i)continue;
      if(rows[j][2]>=rows[i][2])hi=false;
      if(rows[j][3]<=rows[i][3])lo=false;
    }
    const A=atrAt(rows,i);
    const left=rows.slice(Math.max(0,i-8),i),right=rows.slice(i+1,Math.min(rows.length,i+9));
    if(hi){
      const base=Math.max(
        left.length?Math.max(...left.map(r=>r[4])):rows[i][4],
        right.length?Math.max(...right.map(r=>r[4])):rows[i][4]
      );
      out.push({time:rows[i][0],price:rows[i][2],kind:'H',index:i,
        importance:clamp((rows[i][2]-base)/A+.45,0,1)});
    }
    if(lo){
      const base=Math.min(
        left.length?Math.min(...left.map(r=>r[4])):rows[i][4],
        right.length?Math.min(...right.map(r=>r[4])):rows[i][4]
      );
      out.push({time:rows[i][0],price:rows[i][3],kind:'L',index:i,
        importance:clamp((base-rows[i][3])/A+.45,0,1)});
    }
  }
  return out;
}
function rawPrice(rawA,rawB,t){
  if(rawA.time===rawB.time)return rawA.price;
  return rawA.price+(rawB.price-rawA.price)*(t-rawA.time)/(rawB.time-rawA.time);
}
function linePrice(a,b,t){
  if(a.time===b.time)return a.price;
  return a.price+(b.price-a.price)*(t-a.time)/(b.time-a.time);
}
function endpointFit(p,raw,rows,rawSpanBars){
  const i=nearestIndex(rows,p.time),A=atrAt(rows,i);
  const timeBars=Math.abs(p.time-raw.time)/Math.max(60,(rows[1]?.[0]-rows[0]?.[0])||60);
  const timeScore=Math.exp(-timeBars/Math.max(4,rawSpanBars*.28));
  const priceScore=Math.exp(-Math.abs(p.price-raw.price)/(A*2.5));
  return .52*timeScore+.48*priceScore;
}
function evaluateLine(a,b,kind,rows,rawA,rawB,mode){
  if(a.time===b.time)return null;
  if(a.time>b.time)[a,b]=[b,a];
  const sec=(rows[1]?.[0]-rows[0]?.[0])||60;
  const spanBars=Math.abs(b.time-a.time)/sec;
  if(spanBars<4)return null;

  const rawSpanBars=Math.max(4,Math.abs(rawB.time-rawA.time)/sec);
  const efit=(endpointFit(a,rawA,rows,rawSpanBars)+endpointFit(b,rawB,rows,rawSpanBars))/2;

  // Penalize a calibrated line whose geometry deviates too much from the rough intent.
  const mid=(a.time+b.time)/2;
  const iMid=nearestIndex(rows,mid),A=atrAt(rows,iMid);
  const geometricError=Math.abs(linePrice(a,b,mid)-rawPrice(rawA,rawB,mid))/A;
  const geometry=Math.exp(-geometricError/(mode==='fit'?2.3:1.15));

  let touches=0,bodyPen=0,reaction=0,checked=0;
  const start=nearestIndex(rows,Math.min(a.time,b.time));
  const end=Math.min(rows.length-1,nearestIndex(rows,Math.max(b.time,rawB.time))+Math.max(10,Math.round(rawSpanBars*.35)));
  for(let i=start;i<=end;i++){
    const r=rows[i],lp=linePrice(a,b,r[0]),atr=atrAt(rows,i),zone=.28*atr;
    const intersects=r[3]<=lp+zone&&r[2]>=lp-zone;
    if(intersects){
      touches++;
      const nxt=rows.slice(i+1,Math.min(rows.length,i+4));
      if(nxt.length){
        const fav=kind==='L'
          ?Math.max(...nxt.map(q=>(q[2]-lp)/atr))
          :Math.max(...nxt.map(q=>(lp-q[3])/atr));
        if(fav>.35)reaction+=clamp(fav/1.5,0,1);
      }
    }
    const wrong=kind==='L'?r[4]<lp-zone:r[4]>lp+zone;
    if(wrong)bodyPen++;
    checked++;
  }
  const touchScore=clamp(touches/6,0,1);
  const reactionScore=touches?clamp(reaction/Math.max(1,touches),0,1):0;
  const penetration=checked?clamp(bodyPen/checked*7,0,1):0;
  const importance=(Number(a.importance||.5)+Number(b.importance||.5))/2;
  const spanScore=clamp(Math.log1p(spanBars)/Math.log(150),0,1);

  const w=mode==='fit'
    ?{endpoint:.18,geometry:.16,importance:.20,touch:.22,reaction:.16,span:.08,penalty:.24}
    :{endpoint:.34,geometry:.20,importance:.17,touch:.14,reaction:.08,span:.07,penalty:.22};

  const score=clamp(
    w.endpoint*efit+w.geometry*geometry+w.importance*importance+
    w.touch*touchScore+w.reaction*reactionScore+w.span*spanScore-
    w.penalty*penetration,0,1
  );

  return {
    a:{time:a.time,price:a.price},b:{time:b.time,price:b.price},
    anchorType:kind==='L'?'Swing Low':'Swing High',
    role:kind==='L'?'support':'resistance',
    score,endpointFit:efit,geometryFit:geometry,importance,touchScore,reactionScore,
    penetration,spanBars,touches
  };
}
function poolsForRaw(swings,rawA,rawB,rows,mode){
  const sec=(rows[1]?.[0]-rows[0]?.[0])||60;
  const span=Math.max(8,Math.abs(rawB.time-rawA.time)/sec);
  const radius=(mode==='fit'?0.60:0.36)*span*sec;
  const around=(raw)=>swings.filter(s=>Math.abs(s.time-raw.time)<=radius);
  let A=around(rawA),B=around(rawB);
  // If the user's rough endpoints were very rough, do not fail: widen to all structure points in the rough time corridor.
  if(A.length<2||B.length<2){
    const lo=Math.min(rawA.time,rawB.time)-radius,hi=Math.max(rawA.time,rawB.time)+radius;
    const wider=swings.filter(s=>s.time>=lo&&s.time<=hi);
    if(A.length<2)A=wider;if(B.length<2)B=wider;
  }
  return {A,B};
}
function freeCandidate(rawA,rawB){
  return {a:{...rawA},b:{...rawB},anchorType:'自由',role:'auto',score:1,
    endpointFit:1,geometryFit:1,importance:null,touchScore:null,reactionScore:null,penetration:null,touches:null};
}
export function calibrateTrendline(rawA,rawB,rows,tf,mode='dual'){
  if(!rawA||!rawB||rawA.time===rawB.time||rows.length<12){
    return {rawA,rawB,mode,candidates:[freeCandidate(rawA,rawB)],recommended:0};
  }
  if(mode==='free')return {rawA,rawB,mode,candidates:[freeCandidate(rawA,rawB)],recommended:0};

  const swings=detectStructuralSwings(rows,3);
  const pools=poolsForRaw(swings,rawA,rawB,rows,mode);
  const candidates=[];
  for(const kind of ['H','L']){
    const aa=pools.A.filter(x=>x.kind===kind),bb=pools.B.filter(x=>x.kind===kind);
    for(const a0 of aa){
      for(const b0 of bb){
        if(a0.time===b0.time)continue;
        let a=a0,b=b0;if(a.time>b.time)[a,b]=[b,a];
        const c=evaluateLine(a,b,kind,rows,rawA.time<=rawB.time?rawA:rawB,rawA.time<=rawB.time?rawB:rawA,mode);
        if(c)candidates.push(c);
      }
    }
  }

  // Deduplicate identical pairs.
  const seen=new Set(),unique=[];
  for(const c of candidates.sort((a,b)=>b.score-a.score)){
    const k=`${c.a.time}:${c.b.time}:${c.anchorType}`;
    if(seen.has(k))continue;seen.add(k);unique.push(c);
  }
  let top=unique.slice(0,5);
  if(!top.length)top=[freeCandidate(rawA,rawB)];

  const first=top[0]?.score??0,second=top[1]?.score??0;
  const confidence=clamp((first*.72+(first-second)*.55),0,1);
  top=top.map((x,i)=>({...x,rank:i+1,confidence:i===0?confidence:clamp(x.score*.65,0,1)}));
  return {rawA,rawB,mode,candidates:top,recommended:0,swingsScanned:swings.length};
}
