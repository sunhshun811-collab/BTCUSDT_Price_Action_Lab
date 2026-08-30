
import {classifyByIdealZone,explainIdealZone,explainCase,buildCaseDraft} from '../src/case_entry_research.js';

const ideal={start:1000,end:2000,selectedOnTf:'5m'};
const base={
  sourceTf:'5m',entryPrice:100,bosStrengthAtr:.2,downsideEfficiencyChange:.1,lowerWickRatio:.2,
  volumeAsymmetry:1.0,compression:.9,horizontalDistanceAtr:.3,trendlineDistanceAtr:.4,
  undercutDepthAtr:.2,funding_z7d:.1,basis_bps_z7d:0,oi_change_1h:-.01,taker_ls_ratio:1.0
};
const a={...base,id:'A',decisionTime:900,level:2};
const b={...base,id:'B',decisionTime:1500,level:4,bosStrengthAtr:.6,downsideEfficiencyChange:.4,oi_change_1h:-.03,taker_ls_ratio:1.25};
const c={...base,id:'C',decisionTime:2300,level:3,oi_change_1h:.02,taker_ls_ratio:.85};

if(classifyByIdealZone(a,ideal)!=='TOO_EARLY')throw new Error('early');
if(classifyByIdealZone(b,ideal)!=='IN_IDEAL_ZONE')throw new Error('ideal');
if(classifyByIdealZone(c,ideal)!=='TOO_LATE')throw new Error('late');

const ie=explainIdealZone([a,b,c],ideal);
if(!ie.length)throw new Error('ideal explanation failed');

const binary={A:{verdict:'reject'},B:{verdict:'accept'},C:{verdict:'reject'}};
const ce=explainCase([a,b,c],binary);
if(!ce.length)throw new Error('case explanation failed');

const sc={id:'CASE',sourceTf:'8h',trendline:{id:'TL',a:{time:0,price:100},b:{time:1000,price:90}},horizontal:{id:'H',price:95},zone:{start:500,end:2500},idealZone:ideal,candidates:[a,b,c]};
const draft=buildCaseDraft(sc,binary,ce);
if(draft.status!=='CURRENT_CASE_EXPLANATION_ONLY')throw new Error('draft status');
console.log('Structure Case V9 smoke OK',ie.length,ce.length,draft.version);
