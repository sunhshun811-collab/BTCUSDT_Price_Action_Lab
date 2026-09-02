import {loadIndex as legacyLoadIndex,loadMonths as legacyLoadMonths,loadContexts as legacyLoadContexts} from './data.js';

const BASE=`${import.meta.env.BASE_URL}data/v10/`;
let manifestPromise=null;
const decodedCache=new Map();
const finite=x=>Number.isFinite(Number(x));

async function fetchManifest(){
  if(!manifestPromise)manifestPromise=(async()=>{
    try{const r=await fetch(`${BASE}manifest.json?v=${Date.now()}`,{cache:'no-cache'});if(!r.ok)return null;const m=await r.json();return m?.version===10?m:null}catch{return null}
  })();
  return manifestPromise;
}
async function cachedResponse(url,revision){
  const key=`${url}?v=${encodeURIComponent(revision||'0')}`;
  if('caches' in window){
    const cache=await caches.open(`btc-pa-foundation-${revision||'v10'}`);let r=await cache.match(key);
    if(!r){r=await fetch(key,{cache:'force-cache'});if(r.ok)await cache.put(key,r.clone())}return r;
  }
  return fetch(key,{cache:'force-cache'});
}
async function gunzipF64(url,cols,revision){
  const cacheKey=`${url}|${revision}`;if(decodedCache.has(cacheKey))return decodedCache.get(cacheKey);
  const promise=(async()=>{
    const r=await cachedResponse(url,revision);if(!r.ok)throw new Error(`${url} ${r.status}`);
    if(!('DecompressionStream' in window))throw new Error('浏览器不支持 gzip DecompressionStream，请使用新版 Chrome/Edge。');
    const ab=await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    const f64=new Float64Array(ab),rows=[];
    if(f64.length%cols)throw new Error(`V10 shard schema mismatch: ${url}`);
    for(let i=0;i<f64.length;i+=cols)rows.push(Array.from(f64.subarray(i,i+cols),x=>Number.isFinite(x)?x:null));
    return rows;
  })();decodedCache.set(cacheKey,promise);return promise;
}
export async function loadIndexSmart(){return await fetchManifest()||legacyLoadIndex()}
export async function loadMonthsSmart(tf,months){
  const m=await fetchManifest();if(!m)return legacyLoadMonths(tf,months);
  const allowed=new Set(m.timeframes?.[tf]||[]),out=[],missing=[];
  for(const mon of months){
    if(!allowed.has(mon)){missing.push(mon);continue}
    try{out.push(...await gunzipF64(`${BASE}klines/${tf}/${mon}.f64.gz`,m.kline_schema.length,m.revision))}catch(e){console.warn('V10 kline fallback',tf,mon,e);missing.push(mon)}
  }
  if(missing.length){try{out.push(...await legacyLoadMonths(tf,missing))}catch(e){console.warn('legacy kline fallback failed',e)}}
  out.sort((a,b)=>a[0]-b[0]);return out;
}
function contextObject(schema,row){
  const x={};schema.forEach((k,i)=>x[k]=row[i]);
  // Backward-compatible aliases used by current context panel/research code.
  x.funding=x.funding_rate;x.oi_usd=x.open_interest_value;x.top_pos_ratio=x.top_position_ls_ratio;
  x.taker_ls_ratio=finite(x.taker_buy_sell_ratio)?x.taker_buy_sell_ratio:x.metrics_taker_ls_ratio;
  x.data_quality_mask=x.source_mask;
  return x;
}
export async function loadContextsSmart(months,chartTf='5m'){
  const m=await fetchManifest();if(!m)return legacyLoadContexts(months);
  const res=['8h','4h','1h'].includes(chartTf)?'1h':chartTf==='15m'?'15m':'5m';
  const allowed=new Set(m.context_timeframes?.[res]||m.context_months||[]),out=[],missing=[];
  for(const mon of months){
    if(!allowed.has(mon)){missing.push(mon);continue}
    try{const rows=await gunzipF64(`${BASE}context/${res}/${mon}.f64.gz`,m.context_schema.length,m.revision);out.push(...rows.map(r=>contextObject(m.context_schema,r)))}catch(e){console.warn('V10 context fallback',mon,e);missing.push(mon)}
  }
  if(missing.length){try{const old=await legacyLoadContexts(missing);out.push(...(old.rows||[]))}catch(e){console.warn('legacy context fallback failed',e)}}
  out.sort((a,b)=>a.time-b.time);return{rows:out,foundationVersion:m.version,revision:m.revision,resolution:res};
}
export async function foundationStatus(){const m=await fetchManifest();return m?{available:true,version:m.version,revision:m.revision,quality:m.quality}: {available:false}}
const HUMAN_LABEL_KEY='priceActionLab.labels.v1';
export function getHumanLabels(){
  try{return JSON.parse(localStorage.getItem(HUMAN_LABEL_KEY)||'[]')}catch{return[]}
}
export function setHumanLabels(v){
  localStorage.setItem(HUMAN_LABEL_KEY,JSON.stringify(Array.isArray(v)?v:[]));
  return getHumanLabels();
}
export function addHumanLabel(x){
  const v=getHumanLabels();v.push(x);setHumanLabels(v);return v;
}
export function updateHumanLabel(id,patch){
  const v=getHumanLabels(),i=v.findIndex(x=>x.id===id);
  if(i>=0){v[i]={...v[i],...patch,updated_at_utc:new Date().toISOString()};setHumanLabels(v)}
  return v;
}
export function removeHumanLabel(id){
  const v=getHumanLabels().filter(x=>x.id!==id);setHumanLabels(v);return v;
}
