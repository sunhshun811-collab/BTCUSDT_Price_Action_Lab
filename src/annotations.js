const DRAW_KEY='priceActionLab.drawings.v1';
const UNDO_KEY='priceActionLab.drawings.undo.v2';
const REDO_KEY='priceActionLab.drawings.redo.v2';
const MAX_HISTORY=80;

const clone=x=>JSON.parse(JSON.stringify(x));
function read(key,fallback){
  try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback))}
  catch{return clone(fallback)}
}
function write(key,v){localStorage.setItem(key,JSON.stringify(v))}
function history(key){const v=read(key,[]);return Array.isArray(v)?v:[]}
function pushHistory(key,snapshot){
  const h=history(key);h.push(clone(snapshot));
  if(h.length>MAX_HISTORY)h.splice(0,h.length-MAX_HISTORY);
  write(key,h);
}
function emit(detail){
  try{window.dispatchEvent(new CustomEvent('priceaction:drawing-changed',{detail}))}catch{}
}
function normalize(x){
  const now=new Date().toISOString();
  return {
    ...x,
    drawnOnTimeframe:x.drawnOnTimeframe||x.timeframe||null,
    geometryRevision:Number(x.geometryRevision||1),
    styleRevision:Number(x.styleRevision||1),
    createdAt:x.createdAt||now
  };
}
function commit(next,detail){
  const current=getDrawings();
  pushHistory(UNDO_KEY,current);write(REDO_KEY,[]);
  setDrawings(next);
  emit(detail);
  return next;
}
function changeKind(patch){
  const keys=Object.keys(patch||{});
  if(keys.some(k=>['a','b','price','mode'].includes(k)))return'geometry';
  if(keys.some(k=>['style','locked','visible'].includes(k)))return'style';
  return'other';
}

export function getDrawings(){
  const v=read(DRAW_KEY,[]);
  return Array.isArray(v)?v.map(normalize):[];
}
export function setDrawings(v){write(DRAW_KEY,(v||[]).map(normalize))}
export function addDrawing(x){
  const v=getDrawings(),n=normalize(x);v.push(n);
  return commit(v,{id:n.id,kind:'add',drawing:n});
}
export function updateDrawing(id,patch){
  const v=getDrawings(),i=v.findIndex(x=>x.id===id);if(i<0)return v;
  const kind=changeKind(patch),prev=v[i],now=new Date().toISOString();
  const next={...prev,...patch,updatedAt:now};
  if(kind==='geometry')next.geometryRevision=Number(prev.geometryRevision||1)+1;
  if(kind==='style')next.styleRevision=Number(prev.styleRevision||1)+1;
  v[i]=normalize(next);
  return commit(v,{id,kind,drawing:v[i],previous:prev});
}
export function removeDrawing(id){
  const v=getDrawings(),prev=v.find(x=>x.id===id)||null;
  return commit(v.filter(x=>x.id!==id),{id,kind:'remove',drawing:prev});
}
export function drawingsFor(tf){return getDrawings().filter(x=>x.timeframe===tf)}
export function drawingsForView(tf,includeCrossTimeframe=true){
  return getDrawings().filter(x=>{
    if(x.visible===false)return false;
    if(x.timeframe===tf)return true;
    return includeCrossTimeframe&&['trend','horizontal'].includes(x.type);
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
export function undoDrawing(){
  const undo=history(UNDO_KEY);if(!undo.length)return getDrawings();
  const current=getDrawings(),prev=undo.pop();write(UNDO_KEY,undo);pushHistory(REDO_KEY,current);
  setDrawings(prev);emit({kind:'undo'});return getDrawings();
}
export function redoDrawing(){
  const redo=history(REDO_KEY);if(!redo.length)return getDrawings();
  const current=getDrawings(),next=redo.pop();write(REDO_KEY,redo);pushHistory(UNDO_KEY,current);
  setDrawings(next);emit({kind:'redo'});return getDrawings();
}
export function clearDrawings(tf=null){
  const v=tf?getDrawings().filter(x=>x.timeframe!==tf):[];
  return commit(v,{kind:'clear',timeframe:tf});
}
export function duplicateDrawing(id){
  const d=getDrawings().find(x=>x.id===id);if(!d)return null;
  const now=new Date().toISOString();
  const copy=normalize({...clone(d),id:crypto.randomUUID(),createdAt:now,updatedAt:now,geometryRevision:1,styleRevision:1});
  addDrawing(copy);return copy;
}
export function downloadJson(name,data){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);
}
