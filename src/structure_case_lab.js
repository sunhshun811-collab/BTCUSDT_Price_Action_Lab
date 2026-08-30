
import {createChart,CandlestickSeries,LineSeries,createSeriesMarkers,CrosshairMode} from 'lightweight-charts';
import {loadMonths,loadContexts,toCandleRows} from './data.js';
import {getDrawings} from './annotations.js';
import {TF_SECONDS,linePrice,explainCase,explainIdealZone,classifyByIdealZone,buildCaseDraft} from './case_entry_research.js';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const TF_LABEL={'8h':'8小时','4h':'4小时','1h':'1小时','15m':'15分钟','5m':'5分钟','1m':'1分钟'};
const STORE='priceActionLab.structureCaseV8',OLD_STORE='priceActionLab.structureCaseV7';
const FEEDBACK='priceActionLab.structureCaseFeedbackV8',OLD_FEEDBACK='priceActionLab.structureCaseFeedbackV7';
const DRAFTS='priceActionLab.structureCaseDraftsV8';
const BJ='Asia/Shanghai';
const fmtBJ=sec=>new Intl.DateTimeFormat('zh-CN',{timeZone:BJ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(Number(sec)*1000));
const num=x=>x==null||!Number.isFinite(Number(x))?'—':Number(x).toLocaleString('en-US',{maximumFractionDigits:2});
const dec=(x,d=2)=>x==null||!Number.isFinite(Number(x))?'—':Number(x).toFixed(d);
const pct=x=>x==null||!Number.isFinite(Number(x))?'—':`${(Number(x)*100).toFixed(2)}%`;
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
function putCase(c){if(c){c.updatedAt=new Date().toISOString();localStorage.setItem(STORE,JSON.stringify(c))}else localStorage.removeItem(STORE)}
function getFeedback(){
  try{
    let x=JSON.parse(localStorage.getItem(FEEDBACK)||'null');
    if(!x){x=JSON.parse(localStorage.getItem(OLD_FEEDBACK)||'{}');localStorage.setItem(FEEDBACK,JSON.stringify(x))}
    return x||{};
  }catch{return{}}
}
function putFeedback(x){localStorage.setItem(FEEDBACK,JSON.stringify(x))}
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
  try{return (await loadContexts(months)).rows||[]}catch{return[]}
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
  const chartEl=api.chartContainer(),wrap=api.chartWrap(),entryOverlay=$('#entryZoneOverlay'),idealOverlay=$('#idealZoneOverlay');

  function selectedDrawing(){const d=api.selectedDrawing();return d?clone(d):null}
  function ensureCase(sourceTf){
    if(!c)c={id:`CASE_${Date.now()}`,sourceTf,trendline:null,horizontal:null,zone:null,idealZone:null,candidates:[],createdAt:new Date().toISOString()};
    return c;
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
    renderOverlays();renderMarkers();renderCandidateList();renderIdealZone();renderExplanation();
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
    putCase(sc);c=sc;renderCase();
  }
  function resetCase(){
    if(!confirm('清空当前 Structure Case、候选和区间？主图原始趋势线/水平线不会删除。'))return;
    c=null;putCase(null);localStorage.removeItem(FEEDBACK);clearMini();api.setEntryMarkers([]);renderCase();
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
      putCase(c);
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
      const accepted=items.some(x=>fb[x.id]?.verdict==='accept'),allRejected=items.every(x=>fb[x.id]?.verdict==='reject');
      markers.push({time:bt,position:'belowBar',shape:'arrowUp',
        color:accepted?'#6ee7b7':hit?'#d3a6ff':allRejected?'#ff7b7b':'#ffd166',
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
      m.push({time:t,position:'belowBar',shape:'arrowUp',color:f?.verdict==='accept'?'#6ee7b7':hit?'#d3a6ff':f?.verdict==='reject'?'#ff7b7b':'#ffd166',text:xs.length>1?`×${xs.length}`:`${top.sourceTf} L${top.level}`});
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
    $('#scanCaseEntries').disabled=true;$('#caseStatus').textContent='准备低周期数据…';
    try{
      const {tfs,ctx}=await prepareRows();showMiniFromCache();worker?.terminate();
      worker=new Worker(new URL('./structure_case_worker.js',import.meta.url),{type:'module'});
      worker.onmessage=e=>{
        const m=e.data||{};
        if(m.type==='PROGRESS')$('#caseStatus').textContent=`Web Worker 扫描 ${TF_LABEL[m.timeframe]} · ${m.done+1}/${m.total}`;
        if(m.type==='ERROR'){$('#caseStatus').textContent='扫描失败：'+m.message;$('#scanCaseEntries').disabled=false}
        if(m.type==='DONE'){
          const oldFb=getFeedback(),all=m.results.flatMap(x=>x.candidates||[]);c.candidates=all;putCase(c);
          const ids=new Set(all.map(x=>x.id)),nf={};for(const[k,v]of Object.entries(oldFb))if(ids.has(k))nf[k]=v;putFeedback(nf);
          explanation=explainCase(all,nf);idealExplanation=explainIdealZone(all,c.idealZone);
          $('#caseStatus').textContent=`扫描完成：${all.length} 个候选；${c.idealZone?idealHitCount()+' 个命中理想区间。':'尚未设置理想区间。'}`;
          renderCase();showMiniFromCache();$('#scanCaseEntries').disabled=false;
        }
      };
      worker.postMessage({type:'SCAN',structureCase:c,contextRows:ctx,items:tfs.map(tf=>({tf,rows:rowCache[tf]}))});
    }catch(err){$('#caseStatus').textContent='扫描失败：'+err.message;$('#scanCaseEntries').disabled=false}
  }
  function verdict(id,v){
    const fb=getFeedback();fb[id]={verdict:v,reason:v==='reject'?$('#rejectReasonV7').value:'',updatedAt:new Date().toISOString()};putFeedback(fb);
    explanation=explainCase(c.candidates||[],fb);renderCase();showMiniFromCache();
  }
  function renderCandidateList(){
    const box=$('#caseCandidateList');if(!box)return;
    if(!c?.candidates?.length){box.innerHTML='尚未扫描或当前区间没有候选。';return}
    const fb=getFeedback(),v=c.candidates.slice().sort((a,b)=>a.decisionTime-b.decisionTime||a.level-b.level);
    box.innerHTML=v.map(x=>{
      const f=fb[x.id],manual=f?.verdict==='accept'?'✓ 合理':f?.verdict==='reject'?'× 不合理':'未评价',zoneStatus=statusByIdeal(x);
      return `<article class="caseEntry ${f?.verdict||''} ${zoneStatus==='命中理想区间'?'idealHit':''}" data-id="${x.id}">
        <div class="caseEntryTop"><b>${TF_LABEL[x.sourceTf]} · L${x.level} · ${x.reason}</b><strong>${Math.round(x.score)}</strong></div>
        <div class="caseEntryMeta">${fmtBJ(x.decisionTime)} · ${num(x.entryPrice)} · <b>${zoneStatus}</b> · ${manual}</div>
        <div class="caseEntryTags"><span>HL ${x.hl?'✓':'—'}</span><span>BOS ${x.bosUp?'✓':'—'}</span><span>水平 ${dec(x.horizontalDistanceAtr)} ATR</span><span>趋势线 ${dec(x.trendlineDistanceAtr)} ATR</span></div>
        <div class="caseEntryRisk">4h MFE ${pct(x.outcomes?.h4?.mfe)} · MAE ${pct(x.outcomes?.h4?.mae)} · 10x保证金MAE ${pct(x.outcomes?.h4?.marginMae10x)}</div>
        <div class="caseEntryActions"><button data-v="accept">✓ 合理</button><button data-v="reject">× 不合理</button></div>
      </article>`;
    }).join('');
    box.querySelectorAll('.caseEntry').forEach(el=>el.onclick=e=>{
      const x=c.candidates.find(q=>q.id===el.dataset.id);if(!x)return;
      if(e.target.dataset.v){e.stopPropagation();verdict(x.id,e.target.dataset.v);return}
      const p=x.process||{};
      $('#caseEntryDetail').innerHTML=`<b>${TF_LABEL[x.sourceTf]} L${x.level} · ${statusByIdeal(x)}</b><br>${fmtBJ(x.decisionTime)} @ ${num(x.entryPrice)}<br>
      下跌效率改善 ${dec(x.downsideEfficiencyChange)} · 下影 ${dec(x.lowerWickRatio)} · 成交量比 ${dec(x.volumeAsymmetry)}<br>
      OI 1h ${pct(x.oi_change_1h)} · Funding Z ${dec(x.funding_z7d)} · Taker ${dec(x.taker_ls_ratio)}<br>
      <b>过程变量</b><br>OI: Zone ${pct(p.oi_change_1h?.zone)} → Low ${pct(p.oi_change_1h?.low)} → Entry ${pct(p.oi_change_1h?.entry)}<br>
      Funding Z: ${dec(p.funding_z7d?.zone)} → ${dec(p.funding_z7d?.low)} → ${dec(p.funding_z7d?.entry)}`;
    });
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
    if(!c?.candidates?.length){box.innerHTML='先扫描候选，再选择理想区间或人工评价。';return}
    const fb=getFeedback();explanation=explainCase(c.candidates,fb);idealExplanation=explainIdealZone(c.candidates,c.idealZone);
    let html='';
    if(c.idealZone){
      const inside=idealHitCount();
      html+=`<div class="caseExplainNote">理想区间是当前 Case 的主要监督信号：比较“命中理想窗口”和“窗口外”的候选。命中候选 ${inside} 个。</div>`;
      if(idealExplanation.some(x=>x.insideN&&x.outsideN)){
        html+=`<table><thead><tr><th>理想区间解释因子</th><th>区间内均值</th><th>区间外均值</th><th>区分度</th></tr></thead><tbody>${
          idealExplanation.slice(0,10).map(x=>`<tr><td>${x.label}</td><td>${dec(x.insideMean,3)}</td><td>${dec(x.outsideMean,3)}</td><td>${dec(x.separation,2)}</td></tr>`).join('')
        }</tbody></table>`;
      }
    }else html+='<div class="caseExplainNote">先选择“我的理想买点区间”，系统就能比较太早 / 命中 / 太晚。</div>';
    const labeled=Object.values(fb).filter(x=>['accept','reject'].includes(x.verdict)).length;
    if(labeled>=2){
      html+=`<h4 class="subHead">人工合理 / 不合理补充比较</h4><table><thead><tr><th>因子</th><th>认可均值</th><th>拒绝均值</th><th>区分度</th></tr></thead><tbody>${
        explanation.slice(0,8).map(x=>`<tr><td>${x.label}</td><td>${dec(x.acceptedMean,3)}</td><td>${dec(x.rejectedMean,3)}</td><td>${dec(x.separation,2)}</td></tr>`).join('')
      }</tbody></table>`;
    }
    box.innerHTML=html+`<div class="caseExplainNote">仅解释当前 Structure Case；不自动寻找历史相似结构，不声明泛化能力。</div>`;
  }
  function generateDraft(){
    if(!c)return;const d=buildCaseDraft(c,getFeedback(),explanation);$('#caseDraft').textContent=JSON.stringify(d,null,2);
    let arr=[];try{arr=JSON.parse(localStorage.getItem(DRAFTS)||'[]')}catch{}arr.push({...d,createdAt:new Date().toISOString()});localStorage.setItem(DRAFTS,JSON.stringify(arr));
  }
  function dataChanged(){renderCase()}
  function chartRebuilt(){renderCase();try{api.chart()?.timeScale().subscribeVisibleTimeRangeChange(()=>renderOverlays())}catch{}}
  function refresh(){renderCase()}

  $('#lockSelectedStructure').onclick=lockSelected;$('#resetStructureCase').onclick=resetCase;
  $('#selectCaseZone').onclick=()=>beginSelection('entry');$('#selectIdealZone').onclick=()=>beginSelection('ideal');
  $('#clearIdealZone').onclick=()=>{if(c){c.idealZone=null;putCase(c);renderCase();showMiniFromCache()}};
  $('#scanCaseEntries').onclick=scan;$('#generateCaseDraft').onclick=generateDraft;
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&selectionMode){selectionMode=null;drag=false;chartEl.classList.remove('zoneSelectActive');zA=zB=null;renderOverlays()}});
  renderCase();
  return {dataChanged,chartRebuilt,refresh,case:()=>c};
}
