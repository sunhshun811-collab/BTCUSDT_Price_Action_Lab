
const DRAW_KEY='priceActionLab.drawings.v1';
const LABEL_KEY='priceActionLab.labels.v1';
export function getDrawings(){try{return JSON.parse(localStorage.getItem(DRAW_KEY)||'[]')}catch{return[]}}
export function setDrawings(v){localStorage.setItem(DRAW_KEY,JSON.stringify(v))}
export function addDrawing(x){const v=getDrawings();v.push(x);setDrawings(v);return v}
export function drawingsFor(tf){return getDrawings().filter(x=>x.timeframe===tf)}
export function undoDrawing(tf){const v=getDrawings();for(let i=v.length-1;i>=0;i--){if(v[i].timeframe===tf){v.splice(i,1);break}}setDrawings(v);return v}
export function clearDrawings(tf){const v=getDrawings().filter(x=>x.timeframe!==tf);setDrawings(v);return v}
export function getLabels(){try{return JSON.parse(localStorage.getItem(LABEL_KEY)||'[]')}catch{return[]}}
export function addLabel(x){const v=getLabels();v.push(x);localStorage.setItem(LABEL_KEY,JSON.stringify(v));return v}
export function downloadJson(name,data){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);
}
