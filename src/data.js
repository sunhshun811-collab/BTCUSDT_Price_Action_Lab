
const BASE = `${import.meta.env.BASE_URL}data/`;

export async function loadIndex(){
  const r=await fetch(`${BASE}index.json?v=${Date.now()}`,{cache:'no-store'});
  if(!r.ok) throw new Error(`data/index.json ${r.status}`);
  return r.json();
}
async function ungzipJson(url){
  const r=await fetch(url,{cache:'no-store'});
  if(!r.ok) throw new Error(`${url} ${r.status}`);
  if(!('DecompressionStream' in window)) throw new Error('浏览器不支持 gzip DecompressionStream，请使用新版 Chrome/Edge。');
  const stream=r.body.pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}
export async function loadMonth(tf,month){
  return ungzipJson(`${BASE}${tf}/${month}.json.gz`);
}
export async function loadMonths(tf,months){
  const chunks=[];
  for(const m of months){ const x=await loadMonth(tf,m); chunks.push(...(x.rows||[])); }
  chunks.sort((a,b)=>a[0]-b[0]);
  return chunks;
}
export function toCandleRows(rows){
  return rows.map(r=>({time:r[0],open:r[1],high:r[2],low:r[3],close:r[4]}));
}
export function toVolumeRows(rows){
  return rows.map(r=>({time:r[0],value:r[5],color:r[4]>=r[1]?'rgba(47,209,139,.45)':'rgba(255,100,112,.45)'}));
}
