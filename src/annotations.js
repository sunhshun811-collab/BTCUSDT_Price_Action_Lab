
const DRAW_KEY='priceActionLab.drawings.v1';
const LABEL_KEY='priceActionLab.labels.v1';
const TF_RANK={'8h':0,'4h':1,'1h':2,'15m':3,'5m':4,'1m':5};

export function getDrawings(){try{return JSON.parse(localStorage.getItem(DRAW_KEY)||'[]')}catch{return[]}}
export function setDrawings(v){localStorage.setItem(DRAW_KEY,JSON.stringify(v))}
export function addDrawing(x){const v=getDrawings();v.push(x);setDrawings(v);return v}
export function updateDrawing(id,patch){
  const v=getDrawings(),i=v.findIndex(x=>x.id===id);
  if(i>=0){v[i]={...v[i],...patch,updatedAt:new Date().toISOString()};setDrawings(v)}
  return v;
}
export function removeDrawing(id){const v=getDrawings().filter(x=>x.id!==id);setDrawings(v);return v}
export function drawingsFor(tf){return getDrawings().filter(x=>x.timeframe===tf)}
export function drawingsForView(tf,includeHigher=true){
  const rank=TF_RANK[tf]??99;
  return getDrawings().filter(x=>{
    if(x.timeframe===tf)return true;
    if(!includeHigher || !['trend','horizontal'].includes(x.type))return false;
    return (TF_RANK[x.timeframe]??99)<rank;
  });
}
export function confirmedResearchTrendlines(tf=null,causalOnly=false,decisionTime=null){
  return getDrawings().filter(x=>{
    if(x.type!=='trend'||!x.researchConfirmed)return false;
    if(tf&&x.timeframe!==tf)return false;
    if(causalOnly&&!x.causalEligible)return false;
    if(decisionTime!=null&&x.validFrom!=null&&Number(x.validFrom)>Number(decisionTime))return false;
    return true;
  });
}
export function undoDrawing(tf){const v=getDrawings();for(let i=v.length-1;i>=0;i--){if(v[i].timeframe===tf){v.splice(i,1);break}}setDrawings(v);return v}
export function clearDrawings(tf){const v=getDrawings().filter(x=>x.timeframe!==tf);setDrawings(v);return v}

export function getLabels(){try{return JSON.parse(localStorage.getItem(LABEL_KEY)||'[]')}catch{return[]}}
export function addLabel(x){const v=getLabels();v.push(x);localStorage.setItem(LABEL_KEY,JSON.stringify(v));return v}

export function downloadJson(name,data){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);
}
