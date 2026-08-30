
import {classifyByIdealZone,explainIdealZone,buildCaseDraft,linePrice} from '../src/case_entry_research.js';

const ideal={start:1000,end:2000,selectedOnTf:'5m'};
const c1={id:'A',decisionTime:900,level:2,bosStrengthAtr:.1,downsideEfficiencyChange:.05,lowerWickRatio:.1,volumeAsymmetry:.8,compression:1.1,horizontalDistanceAtr:1.2,trendlineDistanceAtr:-.3,undercutDepthAtr:1.0,funding_z7d:.3,basis_bps_z7d:.1,oi_change_1h:.02,taker_ls_ratio:.85};
const c2={...c1,id:'B',decisionTime:1500,level:4,bosStrengthAtr:.6,downsideEfficiencyChange:.35,lowerWickRatio:.4,volumeAsymmetry:1.5,compression:.7,horizontalDistanceAtr:.2,trendlineDistanceAtr:.5,undercutDepthAtr:.3,oi_change_1h:-.02,taker_ls_ratio:1.2};
const c3={...c1,id:'C',decisionTime:2200,level:3};
if(classifyByIdealZone(c1,ideal)!=='TOO_EARLY')throw new Error('early');
if(classifyByIdealZone(c2,ideal)!=='IN_IDEAL_ZONE')throw new Error('inside');
if(classifyByIdealZone(c3,ideal)!=='TOO_LATE')throw new Error('late');
const ex=explainIdealZone([c1,c2,c3],ideal);
if(!ex.length)throw new Error('ideal explanation');
const sc={id:'CASE',sourceTf:'8h',trendline:{id:'TL',a:{time:0,price:100},b:{time:1000,price:90}},horizontal:{id:'H',price:95},zone:{start:500,end:2500,selectedOnTf:'15m'},idealZone:ideal,candidates:[c1,c2,c3]};
const draft=buildCaseDraft(sc,{},[]);
if(!draft.idealEntryZone||draft.idealEntryZone.start!==1000)throw new Error('draft ideal zone');
if(linePrice(sc.trendline,500)!==95)throw new Error('line projection');
console.log('Structure Case V8 smoke OK',classifyByIdealZone(c2,ideal),ex.length,draft.version);
