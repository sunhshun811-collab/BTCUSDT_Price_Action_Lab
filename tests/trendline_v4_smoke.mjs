
import {analyzeTrendline,eligibleTrendlineFeatures,trendlineConfluence} from '../src/trendline_research.js';
const rows=[];let p=100;
for(let i=0;i<300;i++){
  const t=i*3600,o=p;
  const line=90+i*.03;
  p=line+2+Math.sin(i/8)*1.1;
  rows.push([t,o,Math.max(o,p)+.8,Math.min(o,p)-.8,p,100,0,0,0,0]);
}
const line={id:'TL1',type:'trend',timeframe:'1h',a:{time:20*3600,price:90.6},b:{time:120*3600,price:93.6},
  role:'support',zoneAtr:.3,researchConfirmed:true,causalEligible:true,validFrom:121*3600};
const a=analyzeTrendline(line,rows,'1h',300*3600);
if(!a.available||!Number.isFinite(a.quality))throw new Error('analysis failed');
const f=eligibleTrendlineFeatures([line],rows,'1h',300*3600);
if(f.count!==1)throw new Error('eligibility failed');
const c=trendlineConfluence({timeframes:{'1h':{trendlines:f}}},100);
if(c.count!==1)throw new Error('confluence failed');
console.log('trendline intelligence smoke OK',a.lifecycle,Math.round(a.quality),a.touchCount);
