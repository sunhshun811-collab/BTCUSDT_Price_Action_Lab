
import {discoverB3Candidates,factorDiscovery,buildStrategyDraft} from '../src/conditional_entry_research.js';

const rows=[];let p=100;
for(let i=0;i<1000;i++){
  const trend=i<400?-0.04:i<550?-0.005:0.05;
  const cyc=Math.sin(i*.31)*0.16;
  const o=p;p=p+trend+cyc;
  const h=Math.max(o,p)+0.10+0.05*Math.sin(i*.71)**2;
  const l=Math.min(o,p)-0.10-0.04*Math.cos(i*.83)**2;
  rows.push([i*300,o,h,l,p,100+30*Math.abs(Math.sin(i*.2)),0,0,0,0]);
}
const tl={id:'TL',type:'trend',a:{time:0,price:101},b:{time:600*300,price:85}};
const hl={id:'HL',type:'horizontal',price:85};
const zone={start:450*300,end:800*300};
const ctx=rows.map(r=>({time:r[0],funding_z7d:0,basis_bps_z7d:0,oi_change_1h:-.01,taker_ls_ratio:1.1}));

const r=discoverB3Candidates(rows,'5m',hl,tl,zone,ctx);
if(r.candidates.length<1)throw new Error('expected at least one B3 candidate');
const f=factorDiscovery(r.rows,zone);
if(f.length<5)throw new Error('factor discovery too small');
const d=buildStrategyDraft({trendline:tl,horizontal:hl,zone,candidates:r.candidates,factors:f,acceptedIds:[]});
if(d.version!=='STRUCTURE_ENTRY_V001')throw new Error('draft failed');

console.log('structure entry V6 smoke OK',r.candidates.length,f.length,d.version,Math.round(r.candidates[0].score));
