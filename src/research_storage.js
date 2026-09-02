const DB_NAME='btc-price-action-research';
const DB_VERSION=1;
const CASE_STORE='structure_cases';
const VERSION_STORE='structure_case_versions';
const FALLBACK_KEY='priceActionLab.structureCaseLedgerFallbackV1';
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));

function fallbackRead(){
  try{return JSON.parse(localStorage.getItem(FALLBACK_KEY)||'{"cases":{},"versions":[]}')}
  catch{return{cases:{},versions:[]}}
}
function fallbackWrite(x){localStorage.setItem(FALLBACK_KEY,JSON.stringify(x))}
function requestPromise(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('IndexedDB request failed'))})}
function txDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('IndexedDB transaction failed'));tx.onabort=()=>reject(tx.error||new Error('IndexedDB transaction aborted'))})}
let dbPromise=null;
export async function openResearchDb(){
  if(!('indexedDB' in globalThis))return null;
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(CASE_STORE)){
        const s=db.createObjectStore(CASE_STORE,{keyPath:'id'});s.createIndex('updatedAt','updatedAt',{unique:false});s.createIndex('status','status',{unique:false});
      }
      if(!db.objectStoreNames.contains(VERSION_STORE)){
        const s=db.createObjectStore(VERSION_STORE,{keyPath:'versionId'});s.createIndex('caseId','caseId',{unique:false});s.createIndex('createdAt','createdAt',{unique:false});
      }
    };
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Cannot open research IndexedDB'));
  }).catch(err=>{console.warn('Research IndexedDB unavailable; fallback to localStorage',err);dbPromise=Promise.resolve(null);return null});
  return dbPromise;
}
function makeVersionId(caseId){return `${caseId}__${Date.now()}__${Math.random().toString(36).slice(2,8)}`}
export async function saveStructureCaseResearch({caseData,feedback={},draft=null,reason='autosave',status='active',meta={}}={}){
  if(!caseData?.id)return null;
  const now=new Date().toISOString();
  const current={id:caseData.id,status,sourceTf:caseData.sourceTf||null,createdAt:caseData.createdAt||now,updatedAt:now,caseData:clone(caseData),feedback:clone(feedback),draft:clone(draft),meta:{...clone(meta),lastReason:reason}};
  const version={versionId:makeVersionId(caseData.id),caseId:caseData.id,createdAt:now,reason,status,caseData:clone(caseData),feedback:clone(feedback),draft:clone(draft),meta:clone(meta)};
  const db=await openResearchDb();
  if(!db){const f=fallbackRead();f.cases[current.id]=current;f.versions.push(version);fallbackWrite(f);return version}
  const tx=db.transaction([CASE_STORE,VERSION_STORE],'readwrite');tx.objectStore(CASE_STORE).put(current);tx.objectStore(VERSION_STORE).put(version);await txDone(tx);return version;
}
export async function listStructureCases(limit=100){
  const db=await openResearchDb();
  if(!db)return Object.values(fallbackRead().cases).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,limit);
  const tx=db.transaction(CASE_STORE,'readonly');const rows=await requestPromise(tx.objectStore(CASE_STORE).getAll());return rows.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,limit);
}
export async function getStructureCaseResearch(caseId){
  const db=await openResearchDb();if(!db)return fallbackRead().cases[caseId]||null;const tx=db.transaction(CASE_STORE,'readonly');return await requestPromise(tx.objectStore(CASE_STORE).get(caseId));
}
export async function listStructureCaseVersions(caseId,limit=100){
  const db=await openResearchDb();let rows;
  if(!db)rows=fallbackRead().versions.filter(x=>x.caseId===caseId);
  else{const tx=db.transaction(VERSION_STORE,'readonly');rows=await requestPromise(tx.objectStore(VERSION_STORE).index('caseId').getAll(IDBKeyRange.only(caseId)))}
  return rows.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,limit);
}
export async function getStructureCaseVersion(versionId){
  const db=await openResearchDb();if(!db)return fallbackRead().versions.find(x=>x.versionId===versionId)||null;const tx=db.transaction(VERSION_STORE,'readonly');return await requestPromise(tx.objectStore(VERSION_STORE).get(versionId));
}
export async function archiveStructureCaseResearch(caseId){
  const row=await getStructureCaseResearch(caseId);if(!row)return null;return saveStructureCaseResearch({caseData:row.caseData,feedback:row.feedback||{},draft:row.draft||null,reason:'archive',status:'archived',meta:row.meta||{}});
}
export async function migrateLegacyStructureCaseResearch({caseData,feedback={},drafts=[]}={}){
  if(!caseData?.id)return false;const existing=await getStructureCaseResearch(caseData.id);if(existing)return false;
  const relevant=Array.isArray(drafts)?drafts.filter(d=>!d.caseId||d.caseId===caseData.id):[];
  await saveStructureCaseResearch({caseData,feedback,draft:relevant.at(-1)||null,reason:'legacy_migration',status:'active',meta:{migratedFrom:'localStorage V9',legacyDraftCount:relevant.length}});return true;
}
