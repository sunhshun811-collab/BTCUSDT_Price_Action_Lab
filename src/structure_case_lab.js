
import {createChart,CandlestickSeries,LineSeries,createSeriesMarkers,CrosshairMode} from 'lightweight-charts';
import {toCandleRows} from './data.js';
import {loadMonthsSmart as loadMonths,loadContextsSmart as loadContexts,saveStructureCaseResearch,listStructureCases,listStructureCaseVersions,getStructureCaseVersion,migrateLegacyStructureCaseResearch} from './data_foundation_v10.js';
import {getDrawings} from './annotations.js';
import {TF_SECONDS,linePrice,explainCase,explainIdealZone,classifyByIdealZone,buildCaseDraft} from './case_entry_research.js';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const TF_LABEL={'8h':'8小时','4h':'4小时','1h':'1小时','15m':'15分钟','5m':'5分钟','1m':'1分钟'};
const STORE='priceActionLab.structureCaseV9',OLD_STORE='priceActionLab.structureCaseV7';
const FEEDBACK='priceActionLab.structureCaseTradeJudgementV9',OLD_FEEDBACK='priceActionLab.structureCaseFeedbackV7';
const DRAFTS='priceActionLab.structureCaseDraftsV9';
const BJ='Asia/Shanghai';
const fmtBJ=sec=>new Intl.DateTimeFormat('zh-CN',{timeZone:BJ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(Number(sec)*1000));
const num=x=>x==null||!Number.isFinite(Number(x))?'—':Number(x).toLocaleString('en-US',{maximumFractionDigits:2});
const dec=(x,d=2)=>x==null||!Number.isFinite(Number(x))?'—':Number(x).toFixed(d);
const pct=x=>x==null||!Number.isFinite(Number(x))?'—':`${(Number(x)*100).toFixed(2)}%`;
const sourceOk=(mask,bit)=>Number.isFinite(Number(mask))&&((Number(mask)|0)&bit)!==0;
const dataState=(mask,bit)=>sourceOk(mask,bit)?'完整':'⚠ 缺失';
const JUDGE_LABEL={
  strong_long:'强烈做多',
  long:'可以做多',
  wait:'等待确认',
  no_trade:'不做',
  reverse_watch:'反向观察'
};
const SUPPORT_OPTIONS=['高周期结构','趋势线位置','水平位位置','抬高低点（HL）','结构突破（BOS）','下跌衰竭','成交量改善','持仓量（OI）改善','资金费率降温','主动买盘增强'];
const VETO_OPTIONS=['高周期仍弱','回调过深','结构突破太弱','假突破风险','上方空间不足','没有真正止跌','持仓量（OI）不健康','资金费率拥挤','主动卖盘仍强','盈亏比不足'];
const NEED_OPTIONS=['1分钟结构突破','5分钟抬高低点','5分钟结构突破','15分钟抬高低点','15分钟结构突破','回踩确认','成交量确认','持仓量（OI）改善','主动买盘增强'];

const clone=x=>JSON.parse(JSON.stringify(x));

function normalizeCase(c){
  if(!c)return null;
  c.candidates=Array.isArray(c.candidates)?c.candidates:[];
  c.idealZone=c.idealZone||null;
  // V7 ideal points are intentionally not converted to a zone automatically.
  if(!Array.isArray(c.legacyIdealEntries)&&Array.isArray(c.idealEntries)&&c.idealEntries.length)c.legacyIdealEntries=clone(c.idealEntries);
  delete c.idealEntries;
  return c;
}
function getCase(){
  try{
    let c=JSON.parse(localStorage.getItem(STORE)||'null');
    if(!c){
      c=JSON.parse(localStorage.getItem(OLD_STORE)||'null');
      if(c){c=normalizeCase(c);localStorage.setItem(STORE,JSON.stringify(c))}
    }
    return normalizeCase(c);
  }catch{return null}
}
let casePersistHook=null,feedbackPersistHook=null;
function putCase(c,reason='case_update'){
  if(c){c.updatedAt=new Date().toISOString();localStorage.setItem(STORE,JSON.stringify(c))}
  else localStorage.removeItem(STORE);
  casePersistHook?.(reason);
}
function getFeedback(){
  try{
    let x=JSON.parse(localStorage.getItem(FEEDBACK)||'null');
    if(!x){
      // Migrate V8 binary feedback when available.
      const old=JSON.parse(localStorage.getItem('priceActionLab.structureCaseFeedbackV8')||'{}');
      x={};
      for(const [id,v] of Object.entries(old)){
        x[id]={
          judgement:v.verdict==='accept'?'long':v.verdict==='reject'?'no_trade':null,
          confidence:50,
          rejectReason:v.reason||'',
          support:[],veto:[],needs:[],executionTf:'5m',invalidation:'',note:'',
          updatedAt:v.updatedAt||new Date().toISOString()
        };
      }
      localStorage.setItem(FEEDBACK,JSON.stringify(x));
    }
    return x||{};
  }catch{return{}}
}
function putFeedback(x,reason='judgement_update'){
  localStorage.setItem(FEEDBACK,JSON.stringify(x));
  feedbackPersistHook?.(reason);
}
function monthsFor(indexData,tf,from,to){
  return (indexData.timeframes?.[tf]||[]).filter(m=>{
    const [y,mo]=m.split('-').map(Number),a=Date.UTC(y,mo-1,1)/1000,b=Date.UTC(y+(mo===12),mo===12?0:mo,1)/1000;
    return b>from&&a<to;
  });
}
async function loadTf(indexData,tf,from,to){
  const months=monthsFor(indexData,tf,from,to);if(!months.length)return[];
  const x=await loadMonths(tf,months);return x.filter(r=>Number(r[0])>=from&&Number(r[0])<to);
}
async function loadCtx(indexData,from,to){
  const months=monthsFor(indexData,'5m',from,to);if(!months.length)return[];
  try{return (await loadContexts(months,'5m')).rows||[]}catch{return[]}
}
function miniOptions(){
  return {
    autoSize:true,layout:{background:{color:'#09121c'},textColor:'#91a5b9',attributionLogo:true},
    grid:{vertLines:{color:'#182635'},horzLines:{color:'#182635'}},rightPriceScale:{borderColor:'#294058'},
    timeScale:{borderColor:'#294058',timeVisible:true,secondsVisible:false},
    localization:{timeFormatter:t=>fmtBJ(Number(t)),priceFormatter:p=>Number(p).toLocaleString('en-US',{maximumFractionDigits:2})},
    crosshair:{mode:CrosshairMode.Normal}
  };
}
function candleOptions(){return{upColor:'#ef5350',downColor:'#26a69a',borderVisible:false,wickUpColor:'#ef5350',wickDownColor:'#26a69a'}}

export function initStructureCaseLab(api){
  let c=getCase(),selectionMode=null,drag=false,zA=null,zB=null,mini=[],worker=null,explanation=[],idealExplanation=[],rowCache={};
  const detailAutoSaveTimers=new Map();
  let researchSaveTimer=null,researchSaveReason='autosave',suppressResearchPersist=false,lastDraft=null;
  const chartEl=api.chartContainer(),wrap=api.chartWrap(),entryOverlay=$('#entryZoneOverlay'),idealOverlay=$('#idealZoneOverlay');

  function saveState(text,state='saved'){
    const el=$('#caseAutoSaveStatus');if(!el)return;el.textContent=text;el.dataset.state=state;
  }
  async function persistResearchNow(reason='autosave',status='active',draft=lastDraft){
    if(suppressResearchPersist||!c?.id)return null;
    if(researchSaveTimer){clearTimeout(researchSaveTimer);researchSaveTimer=null}
    saveState('研究记录：正在保存…','saving');
    try{
      const v=await saveStructureCaseResearch({caseData:clone(c),feedback:clone(getFeedback()),draft:clone(draft),reason,status,meta:{selectedTfs:tfChecks(),module:'M04'}});
      const t=new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date());
      saveState(`已自动保存 ${t} · ${reason}`,'saved');renderCaseHistory();return v;
    }catch(err){console.error('M04 research persistence failed',err);saveState('研究记录保存失败：'+err.message,'error');return null}
  }
  function scheduleResearchSave(reason='autosave',delay=420){
    if(suppressResearchPersist||!c?.id)return;researchSaveReason=reason;
    if(researchSaveTimer)clearTimeout(researchSaveTimer);
    saveState('研究记录：等待自动保存…','pending');
    researchSaveTimer=setTimeout(()=>persistResearchNow(researchSaveReason),delay);
  }
  casePersistHook=reason=>scheduleResearchSave(reason);
  feedbackPersistHook=reason=>scheduleResearchSave(reason);

  async function restoreResearchVersion(versionId){
    const v=await getStructureCaseVersion(versionId);if(!v?.caseData)return;
    if(!confirm(`恢复 ${v.caseId} 的历史版本？当前状态会先形成自动保存版本。`))return;
    await persistResearchNow('before_version_restore');
    suppressResearchPersist=true;
    try{c=normalizeCase(clone(v.caseData));localStorage.setItem(STORE,JSON.stringify(c));localStorage.setItem(FEEDBACK,JSON.stringify(v.feedback||{}));lastDraft=clone(v.draft||null)}
    finally{suppressResearchPersist=false}
    rowCache={};clearMini();renderCase();
    if(lastDraft){$('#caseDraft').textContent=JSON.stringify(lastDraft,null,2);renderDraftExplanation(lastDraft)}
    await persistResearchNow('version_restored');
  }
  async function renderCaseVersions(caseId,host){
    const versions=await listStructureCaseVersions(caseId,80);
    host.innerHTML=versions.length?versions.map(v=>`<div class="caseVersionRow"><div><b>${v.reason||'autosave'}</b><span>${new Date(v.createdAt).toLocaleString('zh-CN',{hour12:false})} · ${v.status||'active'}</span></div><button data-restore-version="${v.versionId}">恢复</button></div>`).join(''):'<div class="mutedNote">暂无版本。</div>';
    host.querySelectorAll('[data-restore-version]').forEach(b=>b.onclick=()=>restoreResearchVersion(b.dataset.restoreVersion));
  }
  async function renderCaseHistory(){
    const box=$('#caseHistoryList');if(!box)return;
    try{
      const cases=await listStructureCases(100);
      if(!cases.length){box.innerHTML='<div class="mutedNote">还没有研究案例。建立 Structure Case 后会自动出现。</div>';return}
      box.innerHTML=cases.map(row=>`<article class="caseHistoryItem ${row.id===c?.id?'current':''}"><div class="caseHistoryMain"><div><b>${row.id}</b><span>${TF_LABEL[row.sourceTf]||row.sourceTf||'—'} · ${row.status||'active'} · 更新 ${new Date(row.updatedAt).toLocaleString('zh-CN',{hour12:false})}</span></div><button data-show-versions="${row.id}">版本历史</button></div><div class="caseVersionList hidden" data-version-list="${row.id}"></div></article>`).join('');
      box.querySelectorAll('[data-show-versions]').forEach(b=>b.onclick=async()=>{const host=box.querySelector(`[data-version-list="${b.dataset.showVersions}"]`);if(!host)return;const opening=host.classList.contains('hidden');host.classList.toggle('hidden');if(opening)await renderCaseVersions(b.dataset.showVersions,host)});
    }catch(err){box.textContent='历史案例读取失败：'+err.message}
  }

  function selectedDrawing(){const d=api.selectedDrawing();return d?clone(d):null}
  function ensureCase(sourceTf){
    if(!c)c={id:`CASE_${Date.now()}`,sourceTf,trendline:null,horizontal:null,zone:null,idealZone:null,candidates:[],createdAt:new Date().toISOString()};
    return c;
  }
  
  function binaryFeedback(){
    const j=getFeedback(),out={};
    for(const [id,v] of Object.entries(j)){
      if(['strong_long','long'].includes(v.judgement))out[id]={verdict:'accept'};
      else if(['no_trade','reverse_watch'].includes(v.judgement))out[id]={verdict:'reject'};
    }
    return out;
  }
  function idealHitCount(){
    if(!c?.idealZone)return 0;
    return (c.candidates||[]).filter(x=>classifyByIdealZone(x,c.idealZone)==='IN_IDEAL_ZONE').length;
  }
  function renderCase(){
    c=getCase()||c;
    const badge=$('#caseLockBadge');
    if(!c){badge.textContent='尚未建立 Structure Case';badge.className='caseBadge'}
    else{badge.textContent=`${c.id} · 结构母周期 ${TF_LABEL[c.sourceTf]||c.sourceTf} · 跨周期锁定`;badge.className='caseBadge locked'}
    const t=c?.trendline,h=c?.horizontal,z=c?.zone,iz=c?.idealZone;
    $('#caseTrend').innerHTML=t?`<b>趋势线</b><span>${TF_LABEL[t.sourceTf]} · A ${fmtBJ(t.a.time)} @ ${num(t.a.price)}<br>B ${fmtBJ(t.b.time)} @ ${num(t.b.price)}</span>`:'<b>趋势线</b><span>未锁定</span>';
    $('#caseHorizontal').innerHTML=h?`<b>水平线</b><span>${TF_LABEL[h.sourceTf]} · ${num(h.price)}</span>`:'<b>水平线</b><span>未锁定</span>';
    $('#caseZone').innerHTML=z?`<b>Entry Research Zone</b><span>在 ${TF_LABEL[z.selectedOnTf]||z.selectedOnTf} 选择<br>${fmtBJ(z.start)} → ${fmtBJ(z.end)}</span>`:'<b>Entry Research Zone</b><span>未选择</span>';
    $('#caseIdealZone').innerHTML=iz?`<b>Ideal Entry Zone</b><span>在 ${TF_LABEL[iz.selectedOnTf]||iz.selectedOnTf} 选择<br>${fmtBJ(iz.start)} → ${fmtBJ(iz.end)}</span>`:'<b>Ideal Entry Zone</b><span>未选择</span>';
    $('#caseCandidateCount').textContent=c?.candidates?.length||0;
    $('#caseIdealCount').textContent=idealHitCount();
    renderOverlays();renderMarkers();renderCandidateList();renderIdealZone();renderExplanation();renderTimeline();
  }
  function lockSelected(){
    const d=selectedDrawing();if(!d){alert('先在主图选择趋势线或水平线。');return}
    const sc=ensureCase(d.timeframe);
    if(sc.sourceTf!==d.timeframe){
      alert(`当前 Structure Case 的结构母周期是 ${TF_LABEL[sc.sourceTf]}。趋势线/水平线仍建议在同一结构周期锁定。`);return;
    }
    if(d.type==='trend'){
      sc.trendline={id:d.id,sourceTf:d.timeframe,type:'trend',a:clone(d.a),b:clone(d.b),mode:d.mode||'ray',role:d.role||'auto',zoneAtr:Number(d.zoneAtr??.25),calibration:clone(d.calibration||null)};
    }else if(d.type==='horizontal'){
      sc.horizontal={id:d.id,sourceTf:d.timeframe,type:'horizontal',price:Number(d.price)};
    }else return;
    putCase(sc,'structure_locked');c=sc;renderCase();
  }
  async function resetCase(){
    if(!confirm('归档并清空当前 Structure Case、候选和区间？主图原始趋势线/水平线不会删除。'))return;
    if(c?.id)await persistResearchNow('case_archived','archived');
    suppressResearchPersist=true;try{c=null;putCase(null);localStorage.removeItem(FEEDBACK)}finally{suppressResearchPersist=false}
    clearMini();api.setEntryMarkers([]);renderCase();renderCaseHistory();saveState('当前 Case 已归档；等待建立新 Case。','saved');
  }
  function chartX(t){return api.chart()?.timeScale().timeToCoordinate(Number(t))}
  function paintOverlay(el,z,temp=false){
    if(!z){el.classList.add('hidden');return}
    const x1=chartX(z.start),x2=chartX(z.end);
    if(x1==null||x2==null){el.classList.add('hidden');return}
    const cr=chartEl.getBoundingClientRect(),wr=wrap.getBoundingClientRect();
    el.style.left=`${Math.min(x1,x2)+(cr.left-wr.left)}px`;el.style.width=`${Math.max(2,Math.abs(x2-x1))}px`;
    el.style.top=`${cr.top-wr.top}px`;el.style.height=`${cr.height}px`;el.classList.remove('hidden');
  }
  function renderOverlays(){
    const temp=selectionMode&&zA!=null&&zB!=null?{start:Math.min(zA,zB),end:Math.max(zA,zB)}:null;
    paintOverlay(entryOverlay,selectionMode==='entry'?temp:c?.zone);
    paintOverlay(idealOverlay,selectionMode==='ideal'?temp:c?.idealZone);
  }
  function eventTime(ev){
    const r=chartEl.getBoundingClientRect(),x=Math.max(0,Math.min(r.width,ev.clientX-r.left));
    const t=api.chart()?.timeScale().coordinateToTime(x);return t==null?null:Number(t);
  }
  function stop(ev){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation?.()}
  function beginSelection(mode){
    if(mode==='entry'&&(!c?.trendline||!c?.horizontal)){alert('先锁定趋势线和水平线。');return}
    if(mode==='ideal'&&!c?.zone){alert('先选择 Entry Research Zone。');return}
    selectionMode=mode;drag=false;zA=zB=null;chartEl.classList.add('zoneSelectActive');
    $('#caseStatus').textContent=mode==='entry'
      ?`正在 ${TF_LABEL[api.currentTF()]} 主图选择 Entry Research Zone…`
      :`正在 ${TF_LABEL[api.currentTF()]} 主图选择我的 Ideal Entry Zone…`;
  }
  function down(ev){if(!selectionMode||ev.button!==0)return;const t=eventTime(ev);if(t==null)return;stop(ev);drag=true;zA=t;zB=t;renderOverlays()}
  function move(ev){if(!selectionMode||!drag)return;const t=eventTime(ev);if(t==null)return;stop(ev);zB=t;renderOverlays()}
  function up(ev){
    if(!selectionMode||!drag)return;const t=eventTime(ev);if(t!=null)zB=t;stop(ev);drag=false;
    const mode=selectionMode;selectionMode=null;chartEl.classList.remove('zoneSelectActive');
    if(zA!=null&&zB!=null&&zA!==zB){
      const zone={start:Math.min(zA,zB),end:Math.max(zA,zB),selectedOnTf:api.currentTF()};
      if(mode==='entry'){
        c.zone=zone;c.idealZone=null;c.candidates=[];putFeedback({});explanation=[];idealExplanation=[];
        $('#caseStatus').textContent=`Entry Research Zone 已在 ${TF_LABEL[zone.selectedOnTf]} 选择，并按绝对时间跨周期锁定。`;
      }else{
        // Keep the ideal zone inside the research zone to avoid ambiguous labels.
        zone.start=Math.max(zone.start,Number(c.zone.start));zone.end=Math.min(zone.end,Number(c.zone.end));
        if(zone.start>=zone.end){alert('理想买点区间必须与 Entry Research Zone 重叠。');}
        else{c.idealZone=zone;$('#caseStatus').textContent=`Ideal Entry Zone 已在 ${TF_LABEL[zone.selectedOnTf]} 选择。`}
      }
      putCase(c,mode==='entry'?'entry_zone_changed':'ideal_zone_changed');
    }
    zA=zB=null;renderCase();clearMini();
  }
  chartEl.addEventListener('pointerdown',down,true);window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',up,true);

  function tfChecks(){return $$('#caseTfChecks input:checked').map(x=>x.value)}
  function markerBar(entry,currentTf){const sec=TF_SECONDS[currentTf]||60;return Math.floor((Number(entry.decisionTime)-1)/sec)*sec}
  function statusByIdeal(x){
    const s=classifyByIdealZone(x,c?.idealZone);
    return s==='IN_IDEAL_ZONE'?'命中理想区间':s==='TOO_EARLY'?'太早':s==='TOO_LATE'?'太晚':'未设置';
  }
  function renderMarkers(){
    if(!c){api.setEntryMarkers([]);return}
    const tf=api.currentTF(),fb=getFeedback(),groups=new Map();
    for(const x of c.candidates||[]){
      const bt=markerBar(x,tf);if(!groups.has(bt))groups.set(bt,[]);groups.get(bt).push(x);
    }
    const markers=[];
    for(const [bt,items] of groups){
      const top=items.slice().sort((a,b)=>b.level-a.level||b.score-a.score)[0];
      const hit=items.some(x=>classifyByIdealZone(x,c.idealZone)==='IN_IDEAL_ZONE');
      const strong=items.some(x=>fb[x.id]?.judgement==='strong_long'),accepted=items.some(x=>fb[x.id]?.judgement==='long');
      const allNo=items.length&&items.every(x=>['no_trade','reverse_watch'].includes(fb[x.id]?.judgement));
      markers.push({time:bt,position:'belowBar',shape:'arrowUp',
        color:strong?'#d3a6ff':accepted?'#6ee7b7':hit?'#b58ae0':allNo?'#ff7b7b':'#ffd166',
        text:items.length>1?`B3 ×${items.length}`:`${top.sourceTf} L${top.level}`});
    }
    api.setEntryMarkers(markers.sort((a,b)=>a.time-b.time));
  }
  function clearMini(){mini.forEach(x=>{try{x.chart.remove()}catch{}});mini=[];$('#caseMiniCharts').innerHTML=''}
  function addMiniOverlay(host,chart,z,className){
    const ov=host.querySelector('.'+className);if(!ov||!z)return;
    const paint=()=>{const x1=chart.timeScale().timeToCoordinate(z.start),x2=chart.timeScale().timeToCoordinate(z.end);
      if(x1==null||x2==null){ov.style.display='none';return}ov.style.display='block';ov.style.left=`${Math.min(x1,x2)}px`;ov.style.width=`${Math.max(2,Math.abs(x2-x1))}px`};
    setTimeout(paint,50);chart.timeScale().subscribeVisibleTimeRangeChange(paint);
  }
  function projectedTrendData(line,from,to){
    const a=Math.max(from,Math.min(Number(line.a.time),to)),b=to;
    return [{time:a,value:linePrice(line,a)},{time:b,value:linePrice(line,b)}].filter(x=>Number.isFinite(x.value));
  }
  function miniMarkers(tf){
    if(!c)return[];const fb=getFeedback(),sec=TF_SECONDS[tf],groups=new Map();
    for(const x of c.candidates||[]){const t=Math.floor((Number(x.decisionTime)-1)/sec)*sec;if(!groups.has(t))groups.set(t,[]);groups.get(t).push(x)}
    const m=[];
    for(const [t,xs] of groups){
      const top=xs.slice().sort((a,b)=>b.level-a.level||b.score-a.score)[0],f=fb[top.id],hit=xs.some(x=>classifyByIdealZone(x,c.idealZone)==='IN_IDEAL_ZONE');
      const col=f?.judgement==='strong_long'?'#d3a6ff':f?.judgement==='long'?'#6ee7b7':f?.judgement==='wait'?'#ffd166':['no_trade','reverse_watch'].includes(f?.judgement)?'#ff7b7b':hit?'#b58ae0':'#ffd166';
      m.push({time:t,position:'belowBar',shape:'arrowUp',color:col,text:xs.length>1?`×${xs.length}`:`${top.sourceTf} L${top.level}`});
    }
    return m.sort((a,b)=>a.time-b.time);
  }
  function renderMini(tf,rows){
    const host=document.createElement('section');host.className='caseMini panel';
    host.innerHTML=`<div class="caseMiniHead"><b>${TF_LABEL[tf]}</b><span>结构/区间均按绝对时间投影</span></div><div class="caseMiniBody"><div class="caseMiniChart"></div><div class="miniZone"></div><div class="miniIdealZone"></div></div>`;
    $('#caseMiniCharts').appendChild(host);
    const ch=createChart(host.querySelector('.caseMiniChart'),miniOptions()),s=ch.addSeries(CandlestickSeries,candleOptions());
    s.setData(toCandleRows(rows));
    s.createPriceLine({price:Number(c.horizontal.price),color:'#e7bf55',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:`${c.horizontal.sourceTf}水平位`});
    const tl=ch.addSeries(LineSeries,{color:'#55a7ff',lineWidth:2,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
    tl.setData(projectedTrendData(c.trendline,rows[0]?.[0]??c.zone.start,rows.at(-1)?.[0]??c.zone.end));
    createSeriesMarkers(s,miniMarkers(tf));
    const pad=Math.max(6*TF_SECONDS[tf],(c.zone.end-c.zone.start)*.12);ch.timeScale().setVisibleRange({from:c.zone.start-pad,to:c.zone.end+pad});
    addMiniOverlay(host,ch,c.zone,'miniZone');addMiniOverlay(host,ch,c.idealZone,'miniIdealZone');mini.push({chart:ch,tf});
  }
  function showMiniFromCache(){clearMini();for(const tf of tfChecks())if(rowCache[tf]?.length)renderMini(tf,rowCache[tf])}
  async function prepareRows(){
    const tfs=tfChecks();if(!tfs.length)throw new Error('至少选择一个低周期。');
    const lookback=Math.max(2*86400,(c.zone.end-c.zone.start)*.5),forward=86400,from=c.zone.start-lookback,to=c.zone.end+forward;rowCache={};
    for(const tf of tfs){$('#caseStatus').textContent=`加载 ${TF_LABEL[tf]} 数据…`;rowCache[tf]=await loadTf(api.indexData(),tf,from,to)}
    const ctx=await loadCtx(api.indexData(),from,to);return{tfs,ctx}
  }
  async function scan(){
    if(!c?.trendline||!c?.horizontal||!c?.zone){alert('需要锁定趋势线、水平线并选择 Entry Research Zone。');return}
    await persistResearchNow('pre_scan');
    $('#scanCaseEntries').disabled=true;$('#caseStatus').textContent='准备低周期数据…';
    try{
      const {tfs,ctx}=await prepareRows();showMiniFromCache();worker?.terminate();
      worker=new Worker(new URL('./structure_case_worker.js',import.meta.url),{type:'module'});
      worker.onmessage=e=>{
        const m=e.data||{};
        if(m.type==='PROGRESS')$('#caseStatus').textContent=`Web Worker 扫描 ${TF_LABEL[m.timeframe]} · ${m.done+1}/${m.total}`;
        if(m.type==='ERROR'){$('#caseStatus').textContent='扫描失败：'+m.message;$('#scanCaseEntries').disabled=false}
        if(m.type==='DONE'){
          const oldFb=getFeedback(),all=m.results.flatMap(x=>x.candidates||[]);c.candidates=all;putCase(c,'scan_complete');
          const ids=new Set(all.map(x=>x.id)),nf={};for(const[k,v]of Object.entries(oldFb))if(ids.has(k))nf[k]=v;putFeedback(nf,'scan_feedback_reconciled');
          persistResearchNow('scan_complete');
          explanation=explainCase(all,binaryFeedback());idealExplanation=explainIdealZone(all,c.idealZone);
          $('#caseStatus').textContent=`扫描完成：${all.length} 个候选；${c.idealZone?idealHitCount()+' 个命中理想区间。':'尚未设置理想区间。'}`;
          renderCase();showMiniFromCache();$('#scanCaseEntries').disabled=false;
        }
      };
      worker.postMessage({type:'SCAN',structureCase:c,contextRows:ctx,items:tfs.map(tf=>({tf,rows:rowCache[tf]}))});
    }catch(err){$('#caseStatus').textContent='扫描失败：'+err.message;$('#scanCaseEntries').disabled=false}
  }
  function ensureJudgement(id){
    const all=getFeedback();
    all[id]={
      judgement:all[id]?.judgement||null,
      confidence:Number(all[id]?.confidence??50),
      support:Array.isArray(all[id]?.support)?all[id].support:[],
      veto:Array.isArray(all[id]?.veto)?all[id].veto:[],
      needs:Array.isArray(all[id]?.needs)?all[id].needs:[],
      executionTf:all[id]?.executionTf||'5m',
      invalidation:all[id]?.invalidation||'',
      note:all[id]?.note||'',
      updatedAt:all[id]?.updatedAt||new Date().toISOString()
    };
    return {all,j:all[id]};
  }
  function setQuickJudgement(id,value){
    const {all,j}=ensureJudgement(id);j.judgement=value;j.updatedAt=new Date().toISOString();putFeedback(all,'quick_judgement');
    explanation=explainCase(c.candidates||[],binaryFeedback());renderCase();showMiniFromCache();
  }
  function saveDetailedJudgement(id,root,{rerender=true,reason='detailed_judgement'}={}){
    const {all,j}=ensureJudgement(id);
    j.confidence=Number(root.querySelector('[data-field="confidence"]')?.value||50);
    j.executionTf=root.querySelector('[data-field="executionTf"]')?.value||'5m';
    j.invalidation=root.querySelector('[data-field="invalidation"]')?.value||'';
    j.note=root.querySelector('[data-field="note"]')?.value||'';
    j.support=[...root.querySelectorAll('[data-group="support"]:checked')].map(x=>x.value);
    j.veto=[...root.querySelectorAll('[data-group="veto"]:checked')].map(x=>x.value);
    j.needs=[...root.querySelectorAll('[data-group="needs"]:checked')].map(x=>x.value);
    j.updatedAt=new Date().toISOString();putFeedback(all,reason);
    explanation=explainCase(c.candidates||[],binaryFeedback());if(rerender){renderCase();showMiniFromCache()}
  }
  function scheduleDetailedAutosave(id,root){
    if(detailAutoSaveTimers.has(id))clearTimeout(detailAutoSaveTimers.get(id));
    saveState('研究记录：详细判断等待自动保存…','pending');
    detailAutoSaveTimers.set(id,setTimeout(()=>{detailAutoSaveTimers.delete(id);saveDetailedJudgement(id,root,{rerender:false,reason:'detailed_judgement_autosave'})},500));
  }

  function checkGroup(title,group,options,selected=[]){
    return `<div><b>${title}</b><div class="judgeChecks">${
      options.map(x=>`<label><input type="checkbox" data-group="${group}" value="${x}" ${selected.includes(x)?'checked':''}>${x}</label>`).join('')
    }</div></div>`;
  }
  function judgementCardHtml(x,j){
    const current=j?.judgement||null;
    return `<div class="tradeJudgeBox">
      <div class="tradeJudgeTitle">我的交易判断</div>
      <div class="tradeJudgeButtons">
        ${Object.entries(JUDGE_LABEL).map(([k,v])=>`<button data-judge="${k}" class="${current===k?'active':''}">${v}</button>`).join('')}
      </div>
      <div class="judgeSummary">${current?`当前：${JUDGE_LABEL[current]} · 信心 ${Number(j?.confidence??50)}`:'尚未判断'} <button data-expand-judge class="miniInlineBtn">展开详细判断</button></div>
      <div class="judgeExpand hidden">
        <div class="judgeGrid">
          <label>信心
            <div class="confidenceRow"><input data-field="confidence" type="range" min="0" max="100" value="${Number(j?.confidence??50)}"><span class="confidenceValue">${Number(j?.confidence??50)}</span></div>
          </label>
          <label>执行周期
            <select data-field="executionTf">${['1m','5m','15m','1h'].map(tf=>`<option value="${tf}" ${j?.executionTf===tf?'selected':''}>${TF_LABEL[tf]}</option>`).join('')}</select>
          </label>
          <label>失效条件
            <input data-field="invalidation" value="${j?.invalidation||''}" placeholder="例如：跌破最近5分钟 Swing Low">
          </label>
          <label>备注
            <textarea data-field="note" placeholder="例如：这里不追，等第一次缩量回踩">${j?.note||''}</textarea>
          </label>
        </div>
        ${checkGroup('主要支持理由','support',SUPPORT_OPTIONS,j?.support||[])}
        ${checkGroup('主要否决理由','veto',VETO_OPTIONS,j?.veto||[])}
        ${checkGroup('如果等待，还缺什么确认','needs',NEED_OPTIONS,j?.needs||[])}
        <button class="saveJudge">立即保存并刷新详情</button><span class="autoSaveHint">输入后约 500ms 自动保存</span>
      </div>
    </div>`;
  }
  function renderSelectedDetail(x){
    if(!x){$('#caseEntryDetail').textContent='点击左侧任意候选买点查看完整信息。';return}
    const j=getFeedback()[x.id]||{},p=x.process||{},zoneStatus=statusByIdeal(x);
    const judgement=j.judgement?JUDGE_LABEL[j.judgement]:'未判断';
    $('#caseEntryDetail').innerHTML=`
      <div class="detailSection">
        <h5>当前候选买点</h5>
        <div class="detailGrid">
          <div class="detailKV"><span>来源周期</span><span>${TF_LABEL[x.sourceTf]}</span></div>
          <div class="detailKV"><span>北京时间</span><span>${fmtBJ(x.decisionTime)}</span></div>
          <div class="detailKV"><span>入场价格</span><span>${num(x.entryPrice)}</span></div>
          <div class="detailKV"><span>形成阶段</span><span>L${x.level} · ${x.reason}</span></div>
          <div class="detailKV"><span>理想区间位置</span><span>${zoneStatus}</span></div>
          <div class="detailKV"><span>机器结构分</span><span>${Math.round(x.score)}</span></div>
        </div>
        <div class="detailCallout ${zoneStatus==='命中理想区间'?'ideal':''}">
          系统时间判断：<b>${zoneStatus}</b>。这个时间标签与人工交易判断相互独立。
        </div>
      </div>

      <div class="detailSection">
        <h5>结构状态</h5>
        <div class="detailGrid">
          <div class="detailKV"><span>抬高低点（HL）</span><span>${x.hl?'是':'否'}</span></div>
          <div class="detailKV"><span>结构突破（BOS）</span><span>${x.bosUp?'是':'否'}</span></div>
          <div class="detailKV"><span>BOS 强度</span><span>${dec(x.bosStrengthAtr)} ATR</span></div>
          <div class="detailKV"><span>距水平线</span><span>${dec(x.horizontalDistanceAtr)} ATR</span></div>
          <div class="detailKV"><span>距趋势线</span><span>${dec(x.trendlineDistanceAtr)} ATR</span></div>
          <div class="detailKV"><span>水平位下穿深度</span><span>${dec(x.undercutDepthAtr)} ATR</span></div>
        </div>
      </div>

      <div class="detailSection">
        <h5>价格行为</h5>
        <div class="detailGrid">
          <div class="detailKV"><span>下跌效率</span><span>${dec(x.downsideEfficiency,3)}</span></div>
          <div class="detailKV"><span>下跌衰竭改善</span><span>${dec(x.downsideEfficiencyChange,3)}</span></div>
          <div class="detailKV"><span>下影线比例</span><span>${dec(x.lowerWickRatio,3)}</span></div>
          <div class="detailKV"><span>上涨/下跌成交量比</span><span>${dec(x.volumeAsymmetry,3)}</span></div>
          <div class="detailKV"><span>波动压缩</span><span>${dec(x.compression,3)}</span></div>
          <div class="detailKV"><span>重新收复水平位</span><span>${x.reclaim?'是':'否'}</span></div>
        </div>
      </div>

      <div class="detailSection">
        <h5>Binance 永续衍生品状态与过程</h5>
        <div class="detailGrid">
          <div class="detailKV"><span>资金费率</span><span>${pct(x.funding_rate,4)}</span></div>
          <div class="detailKV"><span>资金费率 7日Z / 30日Z</span><span>${dec(x.funding_z7d,2)} / ${dec(x.funding_z30d,2)}</span></div>
          <div class="detailKV"><span>Mark / Index</span><span>${num(x.mark_price)} / ${num(x.index_price)}</span></div>
          <div class="detailKV"><span>基差（Basis）</span><span>${dec(x.basis_bps,2)} bp · Z7 ${dec(x.basis_bps_z7d,2)}</span></div>
          <div class="detailKV"><span>Premium</span><span>${dec(x.premium_bps,2)} bp</span></div>
          <div class="detailKV"><span>持仓量（OI）USD</span><span>${num(x.open_interest_value)}</span></div>
          <div class="detailKV"><span>OI 5m / 15m</span><span>${pct(x.oi_change_5m)} / ${pct(x.oi_change_15m)}</span></div>
          <div class="detailKV"><span>OI 1h / 4h</span><span>${pct(x.oi_change_1h)} / ${pct(x.oi_change_4h)}</span></div>
          <div class="detailKV"><span>大户账户多空比</span><span>${dec(x.top_account_ls_ratio,3)}</span></div>
          <div class="detailKV"><span>大户持仓多空比</span><span>${dec(x.top_position_ls_ratio,3)}</span></div>
          <div class="detailKV"><span>全市场账户多空比</span><span>${dec(x.global_ls_ratio,3)}</span></div>
          <div class="detailKV"><span>Metrics 主动多空量比</span><span>${dec(x.metrics_taker_ls_ratio,3)}</span></div>
          <div class="detailKV"><span>K线主动买卖比</span><span>${dec(x.taker_buy_sell_ratio,3)}</span></div>
          <div class="detailKV"><span>主动买入占比</span><span>${pct(x.taker_buy_share)}</span></div>
        </div>
        <div class="detailCallout">
          <b>持仓量（OI）1小时变化过程：</b>
          区间开始 ${pct(p.oi_change_1h?.zone)} → 局部低点 ${pct(p.oi_change_1h?.low)} → 触发前 ${pct(p.oi_change_1h?.preTrigger)} → Entry ${pct(p.oi_change_1h?.entry)}<br>
          <b>主动买卖比过程：</b>
          ${dec(p.taker_ls_ratio?.zone)} → ${dec(p.taker_ls_ratio?.low)} → ${dec(p.taker_ls_ratio?.preTrigger)} → ${dec(p.taker_ls_ratio?.entry)}<br>
          <b>资金费率 7日Z：</b>
          ${dec(p.funding_z7d?.zone)} → ${dec(p.funding_z7d?.low)} → ${dec(p.funding_z7d?.preTrigger)} → ${dec(p.funding_z7d?.entry)}
        </div>
        <div class="detailCallout">
          <b>数据覆盖：</b>
          主动成交 ${dataState(x.source_mask,1)} · Funding ${dataState(x.source_mask,2)} · Mark ${dataState(x.source_mask,4)} · Index ${dataState(x.source_mask,8)} · Premium ${dataState(x.source_mask,16)} · OI/Positioning ${dataState(x.source_mask,32)}
        </div>
      </div>

      <div class="detailSection">
        <h5>后验路径与 10 倍风险观察</h5>
        <div class="detailGrid">
          <div class="detailKV"><span>4小时收益</span><span>${pct(x.outcomes?.h4?.return)}</span></div>
          <div class="detailKV"><span>4小时最大有利波动（MFE）</span><span>${pct(x.outcomes?.h4?.mfe)}</span></div>
          <div class="detailKV"><span>持仓内最大不利波动（MAE）</span><span>${pct(x.outcomes?.h4?.mae)}</span></div>
          <div class="detailKV"><span>10倍保证金 MAE</span><span>${pct(x.outcomes?.h4?.marginMae10x)}</span></div>
        </div>
      </div>

      <div class="detailSection">
        <h5>我的人工交易判断</h5>
        <div class="detailGrid">
          <div class="detailKV"><span>判断</span><span>${judgement}</span></div>
          <div class="detailKV"><span>信心</span><span>${Number(j.confidence??50)}</span></div>
          <div class="detailKV"><span>执行周期</span><span>${TF_LABEL[j.executionTf]||'—'}</span></div>
          <div class="detailKV"><span>失效条件</span><span>${j.invalidation||'—'}</span></div>
        </div>
        <div class="detailPills">${(j.support||[]).map(v=>`<span>支持：${v}</span>`).join('')}${(j.veto||[]).map(v=>`<span>否决：${v}</span>`).join('')}${(j.needs||[]).map(v=>`<span>等待：${v}</span>`).join('')}</div>
        ${j.note?`<div class="detailCallout">${j.note}</div>`:''}
      </div>`;
  }
  function renderTimeline(){
    const box=$('#judgementTimeline');if(!box)return;
    if(!c?.candidates?.length){box.textContent='尚未扫描候选。';return}
    const fb=getFeedback();
    const rows=c.candidates.slice().sort((a,b)=>a.decisionTime-b.decisionTime);
    let html='',prev=null;
    for(const x of rows){
      const j=fb[x.id]||{},label=j.judgement?JUDGE_LABEL[j.judgement]:'未判断';
      if(prev&&prev.judgement!==j.judgement&&j.judgement){
        html+=`<div class="timelineTransition">判断变化：${prev.judgement?JUDGE_LABEL[prev.judgement]:'未判断'} → <b>${label}</b></div>`;
      }
      html+=`<div class="timelineItem">
        <div class="timelineTime">${fmtBJ(x.decisionTime)}<br>${TF_LABEL[x.sourceTf]}</div>
        <div class="timelineBody"><b>L${x.level} · ${x.reason}</b><br>人工：${label} · 系统：${statusByIdeal(x)}
          <div class="timelineTags"><span>HL ${x.hl?'✓':'—'}</span><span>BOS ${x.bosUp?'✓':'—'}</span><span>水平 ${dec(x.horizontalDistanceAtr)} ATR</span><span>OI ${pct(x.oi_change_1h)}</span><span>Taker ${dec(x.taker_ls_ratio)}</span></div>
        </div>
      </div>`;
      prev=j;
    }
    box.innerHTML=html;
  }
  function renderDraftExplanation(d){
    if(!d){$('#caseDraftExplain').textContent='尚未生成。';return}
    const fb=getFeedback(),strong=c.candidates.filter(x=>fb[x.id]?.judgement==='strong_long'),longs=c.candidates.filter(x=>fb[x.id]?.judgement==='long'),waits=c.candidates.filter(x=>fb[x.id]?.judgement==='wait');
    const topExplain=(d.strongestCurrentCaseSeparators||[]).slice(0,5);
    $('#caseDraftExplain').innerHTML=`
      <div class="strategySection"><h5>当前案例背景</h5><ul class="strategyList">
        <li>结构周期：${TF_LABEL[c.sourceTf]}</li>
        <li>趋势线：已锁定，跨周期规格不变</li>
        <li>水平位：${num(c.horizontal?.price)}</li>
        <li>买点研究区间：${fmtBJ(c.zone?.start)} → ${fmtBJ(c.zone?.end)}</li>
        <li>理想买点区间：${c.idealZone?`${fmtBJ(c.idealZone.start)} → ${fmtBJ(c.idealZone.end)}`:'未设置'}</li>
      </ul></div>
      <div class="strategySection"><h5>人工判断分布</h5><ul class="strategyList">
        <li>强烈做多：${strong.length} 个</li><li>可以做多：${longs.length} 个</li><li>等待确认：${waits.length} 个</li>
      </ul></div>
      <div class="strategySection"><h5>当前案例最有区分力的解释因子</h5><ul class="strategyList">
        ${topExplain.length?topExplain.map(x=>`<li>${x.label}：区分度 ${dec(x.separation,2)}</li>`).join(''):'<li>需要更多人工判断后再形成。</li>'}
      </ul></div>
      <div class="strategySection"><h5>研究状态</h5>
        这仍然只是<b>当前人工确认结构案例</b>的解释与规则草案，不自动寻找历史相似结构，也不声明泛化能力。
      </div>`;
  }

  function renderCandidateList(){
    const box=$('#caseCandidateList');if(!box)return;
    if(!c?.candidates?.length){box.innerHTML='尚未扫描或当前区间没有候选。';renderSelectedDetail(null);renderTimeline();return}
    const fb=getFeedback(),v=c.candidates.slice().sort((a,b)=>a.decisionTime-b.decisionTime||a.level-b.level);
    box.innerHTML=v.map(x=>{
      const j=fb[x.id]||{},zoneStatus=statusByIdeal(x),jud=j.judgement?JUDGE_LABEL[j.judgement]:'未判断';
      const cls=j.judgement||'';
      return `<article class="caseEntry ${zoneStatus==='命中理想区间'?'idealHit':''} ${cls}" data-id="${x.id}">
        <div class="caseEntryTop"><b>${TF_LABEL[x.sourceTf]} · L${x.level} · ${x.reason}</b><strong>${Math.round(x.score)}</strong></div>
        <div class="caseEntryMeta">${fmtBJ(x.decisionTime)} · ${num(x.entryPrice)} · <b>${zoneStatus}</b> · 人工：${jud}</div>
        <div class="caseEntryTags">
          <span>抬高低点（HL） ${x.hl?'✓':'—'}</span><span>结构突破（BOS） ${x.bosUp?'✓':'—'}</span>
          <span>距水平线 ${dec(x.horizontalDistanceAtr)} ATR</span><span>距趋势线 ${dec(x.trendlineDistanceAtr)} ATR</span>
          <span>持仓量（OI） ${pct(x.oi_change_1h)}</span><span>主动买卖比 ${dec(x.taker_ls_ratio)}</span>
        </div>
        <div class="caseEntryRisk">4小时 MFE ${pct(x.outcomes?.h4?.mfe)} · MAE ${pct(x.outcomes?.h4?.mae)} · 10倍保证金 MAE ${pct(x.outcomes?.h4?.marginMae10x)}</div>
        ${judgementCardHtml(x,j)}
      </article>`;
    }).join('');

    box.querySelectorAll('.caseEntry').forEach(el=>{
      const id=el.dataset.id,x=c.candidates.find(q=>q.id===id);if(!x)return;
      el.addEventListener('click',e=>{
        if(e.target.closest('button,input,select,textarea,label'))return;
        renderSelectedDetail(x);
      });
      el.querySelectorAll('[data-judge]').forEach(b=>b.onclick=e=>{e.stopPropagation();setQuickJudgement(id,b.dataset.judge);renderSelectedDetail(x)});
      const exp=el.querySelector('[data-expand-judge]');
      if(exp)exp.onclick=e=>{e.stopPropagation();el.querySelector('.judgeExpand')?.classList.toggle('hidden')};
      const slider=el.querySelector('[data-field="confidence"]'),val=el.querySelector('.confidenceValue');
      if(slider&&val)slider.oninput=()=>{val.textContent=slider.value;scheduleDetailedAutosave(id,el)};
      el.querySelectorAll('[data-field="executionTf"],[data-field="invalidation"],[data-field="note"],[data-group]').forEach(input=>{
        const ev=(input.matches('textarea')||input.dataset.field==='invalidation')?'input':'change';input.addEventListener(ev,()=>scheduleDetailedAutosave(id,el));
      });
      const save=el.querySelector('.saveJudge');
      if(save)save.onclick=e=>{e.stopPropagation();saveDetailedJudgement(id,el,{reason:'manual_judgement_checkpoint'});renderSelectedDetail(x)};
    });
    renderTimeline();
  }
  function renderIdealZone(){
    const box=$('#idealEntryList');if(!box)return;
    if(!c?.idealZone){box.innerHTML='还没有选择理想买点区间。可以切到 4H / 1H / 15m / 5m / 1m 后，在主图直接拖选。';return}
    const z=c.idealZone,inside=idealHitCount(),before=(c.candidates||[]).filter(x=>classifyByIdealZone(x,z)==='TOO_EARLY').length,after=(c.candidates||[]).filter(x=>classifyByIdealZone(x,z)==='TOO_LATE').length;
    box.innerHTML=`<div class="idealZoneSummary"><b>★ ${TF_LABEL[z.selectedOnTf]} 选择</b><span>${fmtBJ(z.start)} → ${fmtBJ(z.end)}</span>
      <div><em>太早 ${before}</em><em class="hit">命中 ${inside}</em><em>太晚 ${after}</em></div></div>`;
  }
  function renderExplanation(){
    const box=$('#caseExplanation');if(!box)return;
    if(!c?.candidates?.length){box.innerHTML='先扫描候选，再选择理想区间或进行人工交易判断。';return}
    const fb=binaryFeedback();explanation=explainCase(c.candidates,fb);idealExplanation=explainIdealZone(c.candidates,c.idealZone);
    let html='';
    if(c.idealZone){
      const inside=idealHitCount();
      html+=`<div class="caseExplainNote">主要监督信号：比较“命中理想买点区间”和“区间外”的机器候选。命中 ${inside} 个。</div>`;
      if(idealExplanation.some(x=>x.insideN&&x.outsideN)){
        html+=`<table><thead><tr><th>解释因子</th><th>理想区间内</th><th>区间外</th><th>区分度</th></tr></thead><tbody>${
          idealExplanation.slice(0,12).map(x=>`<tr><td>${x.label}</td><td>${dec(x.insideMean,3)}</td><td>${dec(x.outsideMean,3)}</td><td>${dec(x.separation,2)}</td></tr>`).join('')
        }</tbody></table>`;
      }
    }else html+='<div class="caseExplainNote">先选择“理想买点区间”，系统就能比较太早 / 命中 / 太晚。</div>';

    const labeled=Object.values(getFeedback()).filter(x=>x.judgement).length;
    if(labeled>=2){
      html+=`<h4 class="subHead">人工判断补充比较</h4>
      <div class="caseExplainNote">强烈做多/可以做多被映射为“认可”；不做/反向观察被映射为“拒绝”；等待确认保持中性，不强行归类。</div>`;
      if(explanation.some(x=>Number.isFinite(x.separation))){
        html+=`<table><thead><tr><th>因子</th><th>认可均值</th><th>拒绝均值</th><th>区分度</th></tr></thead><tbody>${
          explanation.slice(0,10).map(x=>`<tr><td>${x.label}</td><td>${dec(x.acceptedMean,3)}</td><td>${dec(x.rejectedMean,3)}</td><td>${dec(x.separation,2)}</td></tr>`).join('')
        }</tbody></table>`;
      }
    }
    box.innerHTML=html+`<div class="caseExplainNote">仅解释当前结构案例；不自动寻找历史相似结构，不声明泛化能力。</div>`;
  }
  function generateDraft(){
    if(!c)return;
    const d=buildCaseDraft(c,binaryFeedback(),explanation);
    $('#caseDraft').textContent=JSON.stringify(d,null,2);
    renderDraftExplanation(d);
    let arr=[];try{arr=JSON.parse(localStorage.getItem(DRAFTS)||'[]')}catch{}
    const savedDraft={...d,caseId:c.id,tradeJudgements:getFeedback(),createdAt:new Date().toISOString()};
    arr.push(savedDraft);localStorage.setItem(DRAFTS,JSON.stringify(arr));lastDraft=savedDraft;persistResearchNow('draft_generated','active',savedDraft);
  }
  function dataChanged(){renderCase()}
  function chartRebuilt(){renderCase();try{api.chart()?.timeScale().subscribeVisibleTimeRangeChange(()=>renderOverlays())}catch{}}
  function refresh(){renderCase()}

  $('#lockSelectedStructure').onclick=lockSelected;$('#resetStructureCase').onclick=resetCase;
  $('#selectCaseZone').onclick=()=>beginSelection('entry');$('#selectIdealZone').onclick=()=>beginSelection('ideal');
  $('#clearIdealZone').onclick=()=>{if(c){c.idealZone=null;putCase(c,'ideal_zone_cleared');renderCase();showMiniFromCache()}};
  $('#scanCaseEntries').onclick=scan;$('#generateCaseDraft').onclick=generateDraft;
  $('#refreshCaseHistory').onclick=renderCaseHistory;
  document.querySelectorAll('.researchTab').forEach(b=>b.onclick=()=>{
    document.querySelectorAll('.researchTab').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.researchTabPanel').forEach(x=>x.classList.add('hidden'));
    b.classList.add('active');
    const map={detail:'#tabDetail',timeline:'#tabTimeline',factors:'#tabFactors',ideal:'#tabIdeal'};
    $(map[b.dataset.tab])?.classList.remove('hidden');
  });
  document.querySelectorAll('.draftTab').forEach(b=>b.onclick=()=>{
    document.querySelectorAll('.draftTab').forEach(x=>x.classList.remove('active'));b.classList.add('active');
    const json=b.dataset.draftTab==='json';
    $('#caseDraft').classList.toggle('hidden',!json);$('#caseDraftExplain').classList.toggle('hidden',json);
  });

  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&selectionMode){selectionMode=null;drag=false;chartEl.classList.remove('zoneSelectActive');zA=zB=null;renderOverlays()}});
  (async()=>{
    try{
      let drafts=[];try{drafts=JSON.parse(localStorage.getItem(DRAFTS)||'[]')}catch{}
      await migrateLegacyStructureCaseResearch({caseData:c,feedback:getFeedback(),drafts});await renderCaseHistory();
      if(c?.id)await persistResearchNow('session_open');else saveState('研究记录：等待建立 Structure Case。','saved');
    }catch(err){saveState('Research Ledger 初始化失败：'+err.message,'error')}
  })();
  renderCase();
  return {dataChanged,chartRebuilt,refresh,case:()=>c};
}
