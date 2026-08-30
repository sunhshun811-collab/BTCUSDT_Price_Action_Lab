
import {scanCaseTf,explainCase,buildCaseDraft,linePrice} from '../src/case_entry_research.js';

const rows=[];let p=100;
for(let i=0;i<1600;i++){
  const drift=i<500?-0.025:i<720?-0.002:0.028;
  const wave=Math.sin(i*.29)*.14+Math.sin(i*.071)*.07;
  const o=p;p=p+drift+wave;
  rows.push([i*300,o,Math.max(o,p)+.12,Math.min(o,p)-.12,p,100+20*Math.abs(Math.sin(i*.21)),0,0,0,0]);
}
const structureCase={
  id:'CASE_TEST',sourceTf:'8h',
  trendline:{id:'TL',sourceTf:'8h',type:'trend',a:{time:0,price:101},b:{time:900*300,price:82},mode:'ray'},
  horizontal:{id:'HL',sourceTf:'8h',type:'horizontal',price:84},
  zone:{start:620*300,end:1050*300,sourceTf:'8h'},
  candidates:[],idealEntries:[]
};
const ctx=rows.map(r=>({time:r[0],funding_z7d:.2,basis_bps_z7d:-.1,oi_change_1h:-.01,taker_ls_ratio:1.08}));
const scan=scanCaseTf(rows,'5m',structureCase,ctx);
if(!Array.isArray(scan.candidates)||!Array.isArray(scan.featureRows))throw new Error('scan contract failed');

const mockA={
  id:'A',sourceTf:'5m',decisionTime:800*300,entryPrice:90,level:4,type:'L4_HL_BOS',
  bosStrengthAtr:.5,downsideEfficiencyChange:.4,lowerWickRatio:.35,volumeAsymmetry:1.4,
  compression:.75,horizontalDistanceAtr:.2,trendlineDistanceAtr:.4,undercutDepthAtr:.3,
  funding_z7d:.1,basis_bps_z7d:-.1,oi_change_1h:-.02,taker_ls_ratio:1.2
};
const mockR={...mockA,id:'R',decisionTime:810*300,level:2,bosStrengthAtr:.05,downsideEfficiencyChange:.05,
  lowerWickRatio:.12,volumeAsymmetry:.8,compression:1.1,horizontalDistanceAtr:1.2,
  trendlineDistanceAtr:-.5,undercutDepthAtr:1.1,oi_change_1h:.02,taker_ls_ratio:.86};
structureCase.candidates=[mockA,mockR];
const fb={A:{verdict:'accept'},R:{verdict:'reject'}};
const ex=explainCase(structureCase.candidates,fb);
if(!ex.length)throw new Error('explanation failed');
const draft=buildCaseDraft(structureCase,fb,ex);
if(draft.status!=='CURRENT_CASE_EXPLANATION_ONLY')throw new Error('draft status failed');

const p1=linePrice(structureCase.trendline,structureCase.zone.start);
const p2=linePrice(structureCase.trendline,structureCase.zone.start);
if(p1!==p2)throw new Error('projection not deterministic');

console.log('Structure Case V7 smoke OK',
  'scanCandidates='+scan.candidates.length,
  'explain='+ex.length,
  draft.version,
  'source='+structureCase.sourceTf);
