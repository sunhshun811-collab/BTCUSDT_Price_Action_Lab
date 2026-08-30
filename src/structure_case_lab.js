
import {createChart,CandlestickSeries,LineSeries,createSeriesMarkers,CrosshairMode} from 'lightweight-charts';
import {loadMonths,loadContexts,toCandleRows} from './data.js';
import {getDrawings} from './annotations.js';
import {TF_SECONDS,linePrice,explainCase,buildCaseDraft} from './case_entry_research.js';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const TF_LABEL={'8h':'8小时','4h':'4小时','1h':'1小时','15m':'15分钟','5m':'5分钟','1m':'1分钟'};
const STORE='priceActionLab.structureCaseV7',FEEDBACK='priceActionLab.structureCaseFeedbackV7',DRAFTS='priceActionLab.structureCaseDraftsV7';
const BJ='Asia/Shanghai';
const fmtBJ=sec=>new Intl.DateTimeFormat('zh-CN',{timeZone:BJ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(Number(sec)*1000));
const num=x=>x==null||!Number.isFinite(Number(x))?'—':Number(x).toLocaleString('en-US',{maximumFractionDigits:2});
const dec=(x,d=2)=>x==null||!Number.isFinite(Number(x))?'—':Number(x).toFixed(d);
const pct=x=>x==null||!Number.isFinite(Number(x))?'—':`${(Number(x)*100).toFixed(2)}%`;

function getCase(){try{return JSON.parse(localStorage.getItem(STORE)||'null')}catch{return null}}
function putCase(c){if(c){c.updatedAt=new Date().toISOString();localStorage.setItem(STORE,JSON.stringify(c))}else localStorage.removeItem(STORE)}
function getFeedback(){try{return JSON.parse(localStorage.getItem(FEEDBACK)||'{}')}catch{return{}}}
function putFeedback(x){localStorage.setItem(FEEDBACK,JSON.stringify(x))}
function clone(x){return JSON.parse(JSON.stringify(x))}
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
    grid:{vertLines:{color:'#182635'},horzLines:{color:'#182635'}},
    rightPriceScale:{borderColor:'#294058'},timeScale:{borderColor:'#294058',timeVisible:true,secondsVisible:false},
    localization:{timeFormatter:t=>fmtBJ(Number(t)),priceFormatter:p=>Number(p).toLocaleString('en-US',{maximumFractionDigits:2})},
    crosshair:{mode:CrosshairMode.Normal}
  };
}
function candleOptions(){return{upColor:'#ef5350',downColor:'#26a69a',borderVisible:false,wickUpColor:'#ef5350',wickDownColor:'#26a69a'}}

export function initStructureCaseLab(api){
  let c=getCase(),zoneMode=false,drag=false,zA=null,zB=null,mini=[],idealMode=false,worker=null,explanation=[];
  const chartEl=api.chartContainer(),wrap=api.chartWrap(),overlay=$('#entryZoneOverlay');

  function sourceDrawing(){
    const d=api.selectedDrawing();return d?clone(d):null;
  }
  function ensureCase(sourceTf){
    if(!c)c={id:`CASE_${Date.now()}`,sourceTf,trendline:null,horizontal:null,zone:null,candidates:[],idealEntries:[],createdAt:new Date().toISOString()};
    return c;
  }
  function renderCase(){
    c=getCase()||c;
    const badge=$('#caseLockBadge');
    if(!c){badge.textContent='尚未建立 Structure Case';badge.className='caseBadge';}
    else{badge.textContent=`${c.id} · 母周期 ${TF_LABEL[c.sourceTf]||c.sourceTf} · 全周期锁定`;badge.className='caseBadge locked'}
    const t=c?.trendline,h=c?.horizontal,z=c?.zone;
    $('#caseTrend').innerHTML=t?`<b>趋势线</b><span>${TF_LABEL[t.sourceTf]} · A ${fmtBJ(t.a.time)} @ ${num(t.a.price)}<br>B ${fmtBJ(t.b.time)} @ ${num(t.b.price)}</span>`:'<b>趋势线</b><span>未锁定</span>';
    $('#caseHorizontal').innerHTML=h?`<b>水平线</b><span>${TF_LABEL[h.sourceTf]} · ${num(h.price)}</span>`:'<b>水平线</b><span>未锁定</span>';
    $('#caseZone').innerHTML=z?`<b>买点研究区间</b><span>${fmtBJ(z.start)}<br>→ ${fmtBJ(z.end)}</span>`:'<b>买点研究区间</b><span>未锁定</span>';
    $('#caseCandidateCount').textContent=c?.candidates?.length||0;
    $('#caseIdealCount').textContent=c?.idealEntries?.length||0;
    renderOverlay();renderMarkers();renderCandidateList();renderIdealList();renderExplanation();
  }
  function lockSelected(){
    const d=sourceDrawing();if(!d){alert('先在主图选择趋势线或水平线。');return}
    const sc=ensureCase(d.timeframe);
    if(sc.sourceTf!==d.timeframe){
      alert(`当前 Structure Case 母周期是 ${TF_LABEL[sc.sourceTf]}。请在母周期选择结构，避免重新解释。`);return;
    }
    if(d.type==='trend'){
      sc.trendline={
        id:d.id,sourceTf:d.timeframe,type:'trend',
        a:clone(d.a),b:clone(d.b),mode:d.mode||'ray',role:d.role||'auto',zoneAtr:Number(d.zoneAtr??.25),
        calibration:clone(d.calibration||null)
      };
    }else if(d.type==='horizontal'){
      sc.horizontal={id:d.id,sourceTf:d.timeframe,type:'horizontal',price:Number(d.price)};
    }else return;
    putCase(sc);c=sc;renderCase();
  }
  function resetCase(){
    if(!confirm('清空当前 Structure Case、候选买点和理想买点？画在主图上的原始线不会删除。'))return;
    c=null;putCase(null);localStorage.removeItem(FEEDBACK);clearMini();api.setEntryMarkers([]);renderCase();
  }
  function chartX(t){return api.chart()?.timeScale().timeToCoordinate(Number(t))}
  function renderOverlay(temp=false){
    const z=temp&&zA!=null&&zB!=null?{start:Math.min(zA,zB),end:Math.max(zA,zB)}:c?.zone;
    if(!z){overlay.classList.add('hidden');return}
    const x1=chartX(z.start),x2=chartX(z.end);
    if(x1==null||x2==null){overlay.classList.add('hidden');return}
    const cr=chartEl.getBoundingClientRect(),wr=wrap.getBoundingClientRect();
    overlay.style.left=`${Math.min(x1,x2)+(cr.left-wr.left)}px`;
    overlay.style.width=`${Math.max(2,Math.abs(x2-x1))}px`;
    overlay.style.top=`${cr.top-wr.top}px`;overlay.style.height=`${cr.height}px`;
    overlay.classList.remove('hidden');
  }
  function eventTime(ev){
    const r=chartEl.getBoundingClientRect(),x=Math.max(0,Math.min(r.width,ev.clientX-r.left));
    const t=api.chart()?.timeScale().coordinateToTime(x);return t==null?null:Number(t);
  }
  function stop(ev){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation?.()}
  function startZone(){
    if(!c?.trendline||!c?.horizontal){alert('先锁定趋势线和水平线。');return}
    if(api.currentTF()!==c.sourceTf){alert(`请回到母周期 ${TF_LABEL[c.sourceTf]} 框选 Entry Zone。`);return}
    zoneMode=true;chartEl.classList.add('zoneSelectActive');$('#caseStatus').textContent='在主图按住鼠标拖出买点研究区间…';
  }
  function down(ev){if(!zoneMode||ev.button!==0)return;const t=eventTime(ev);if(t==null)return;stop(ev);drag=true;zA=t;zB=t;renderOverlay(true)}
  function move(ev){if(!zoneMode||!drag)return;const t=eventTime(ev);if(t==null)return;stop(ev);zB=t;renderOverlay(true)}
  function up(ev){
    if(!zoneMode||!drag)return;const t=eventTime(ev);if(t!=null)zB=t;stop(ev);drag=false;zoneMode=false;chartEl.classList.remove('zoneSelectActive');
    if(zA!=null&&zB!=null&&zA!==zB){
      c.zone={start:Math.min(zA,zB),end:Math.max(zA,zB),sourceTf:c.sourceTf};
      c.candidates=[];c.idealEntries=[];putCase(c);localStorage.removeItem(FEEDBACK);
    }
    zA=zB=null;$('#caseStatus').textContent='Entry Zone 已按绝对时间锁定。';renderCase();clearMini();
  }
  chartEl.addEventListener('pointerdown',down,true);window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',up,true);

  function tfChecks(){return $$('#caseTfChecks input:checked').map(x=>x.value)}
  function markerBar(entry,currentTf){
    const sec=TF_SECONDS[currentTf]||60,t=Number(entry.decisionTime);
    return Math.floor((t-1)/sec)*sec;
  }
  function renderMarkers(){
    if(!c){api.setEntryMarkers([]);return}
    const tf=api.currentTF(),fb=getFeedback(),groups=new Map();
    for(const x of c.candidates||[]){
      const bt=markerBar(x,tf),key=`C:${bt}`;
      if(!groups.has(key))groups.set(key,{time:bt,items:[]});groups.get(key).items.push(x);
    }
    const markers=[];
    for(const g of groups.values()){
      const top=g.items.slice().sort((a,b)=>b.level-a.level||b.score-a.score)[0];
      const accepts=g.items.filter(x=>fb[x.id]?.verdict==='accept').length,rejects=g.items.filter(x=>fb[x.id]?.verdict==='reject').length;
      markers.push({
        time:g.time,position:'belowBar',shape:'arrowUp',
        color:accepts?'#6ee7b7':rejects===g.items.length?'#ff7b7b':'#ffd166',
        text:g.items.length>1?`B3 ×${g.items.length}`:`${top.sourceTf} L${top.level}`
      });
    }
    for(const x of c.idealEntries||[]){
      markers.push({time:markerBar(x,tf),position:'belowBar',shape:'circle',color:'#d3a6ff',text:`★理想 ${x.sourceTf}`});
    }
    api.setEntryMarkers(markers.sort((a,b)=>a.time-b.time));
  }
  function clearMini(){mini.forEach(x=>{try{x.chart.remove()}catch{}});mini=[];$('#caseMiniCharts').innerHTML=''}
  function addMiniZone(host,chart,z){
    const ov=host.querySelector('.miniZone');
    const paint=()=>{
      const x1=chart.timeScale().timeToCoordinate(z.start),x2=chart.timeScale().timeToCoordinate(z.end);
      if(x1==null||x2==null){ov.style.display='none';return}
      ov.style.display='block';ov.style.left=`${Math.min(x1,x2)}px`;ov.style.width=`${Math.max(2,Math.abs(x2-x1))}px`;
    };
    setTimeout(paint,50);chart.timeScale().subscribeVisibleTimeRangeChange(paint);
  }
  function projectedTrendData(line,from,to){
    const a=Math.max(from,Math.min(Number(line.a.time),to)),b=to;
    return [{time:a,value:linePrice(line,a)},{time:b,value:linePrice(line,b)}].filter(x=>Number.isFinite(x.value));
  }
  function miniMarkers(tf){
    if(!c)return[];
    const fb=getFeedback(),sec=TF_SECONDS[tf],groups=new Map();
    for(const x of c.candidates||[]){
      const t=Math.floor((Number(x.decisionTime)-1)/sec)*sec;
      if(!groups.has(t))groups.set(t,[]);groups.get(t).push(x);
    }
    const m=[];
    for(const [t,xs] of groups){
      const top=xs.slice().sort((a,b)=>b.level-a.level||b.score-a.score)[0],f=fb[top.id];
      m.push({time:t,position:'belowBar',shape:'arrowUp',color:f?.verdict==='accept'?'#6ee7b7':f?.verdict==='reject'?'#ff7b7b':'#ffd166',text:xs.length>1?`×${xs.length}`:`${top.sourceTf} L${top.level}`});
    }
    for(const x of c.idealEntries||[]){
      const t=Math.floor((Number(x.decisionTime)-1)/sec)*sec;
      m.push({time:t,position:'belowBar',shape:'circle',color:'#d3a6ff',text:'★'});
    }
    return m.sort((a,b)=>a.time-b.time);
  }
  function renderMini(tf,rows){
    const host=document.createElement('section');host.className='caseMini panel';
    host.innerHTML=`<div class="caseMiniHead"><b>${TF_LABEL[tf]}</b><span>母结构 ${TF_LABEL[c.sourceTf]} 原样投影</span></div><div class="caseMiniBody"><div class="caseMiniChart"></div><div class="miniZone"></div></div>`;
    $('#caseMiniCharts').appendChild(host);
    const ch=createChart(host.querySelector('.caseMiniChart'),miniOptions()),s=ch.addSeries(CandlestickSeries,candleOptions());
    s.setData(toCandleRows(rows));
    s.createPriceLine({price:Number(c.horizontal.price),color:'#e7bf55',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:`${c.sourceTf}水平位`});
    const tl=ch.addSeries(LineSeries,{color:'#55a7ff',lineWidth:2,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
    tl.setData(projectedTrendData(c.trendline,rows[0]?.[0]??c.zone.start,rows.at(-1)?.[0]??c.zone.end));
    createSeriesMarkers(s,miniMarkers(tf));
    const pad=Math.max(6*TF_SECONDS[tf],(c.zone.end-c.zone.start)*.12);
    ch.timeScale().setVisibleRange({from:c.zone.start-pad,to:c.zone.end+pad});
    addMiniZone(host,ch,c.zone);
    ch.subscribeClick(p=>{
      if(!idealMode||!p?.time||!p?.point)return;
      const price=s.coordinateToPrice(p.point.y);if(price==null)return;
      addIdeal(tf,Number(p.time),Number(price));idealMode=false;$('#idealEntryMode').classList.remove('active');$('#caseStatus').textContent='理想买点已保存。';
    });
    mini.push({chart:ch,tf});
  }
  function addIdeal(tf,barTime,price){
    const x={id:`IDEAL_${Date.now()}`,sourceTf:tf,barTime,decisionTime:barTime+TF_SECONDS[tf],entryPrice:price,createdAt:new Date().toISOString()};
    c.idealEntries=[...(c.idealEntries||[]),x];putCase(c);renderCase();refreshMiniMarkers();
  }
  function refreshMiniMarkers(){
    // Mini marker APIs are rebuilt cheaply; avoids mutating research objects.
    if(!c?.zone)return;
    const checked=tfChecks();if(checked.length&&mini.length){showMiniFromCache()}
  }
  let rowCache={};
  function showMiniFromCache(){
    clearMini();for(const tf of tfChecks())if(rowCache[tf]?.length)renderMini(tf,rowCache[tf]);
  }
  async function prepareRows(){
    const tfs=tfChecks();if(!tfs.length)throw new Error('至少选择一个低周期。');
    const lookback=Math.max(2*86400,(c.zone.end-c.zone.start)*.5),forward=86400;
    const from=c.zone.start-lookback,to=c.zone.end+forward;rowCache={};
    for(const tf of tfs){
      $('#caseStatus').textContent=`加载 ${TF_LABEL[tf]} 数据…`;
      rowCache[tf]=await loadTf(api.indexData(),tf,from,to);
    }
    const ctx=await loadCtx(api.indexData(),from,to);return {tfs,ctx};
  }
  async function scan(){
    if(!c?.trendline||!c?.horizontal||!c?.zone){alert('需要锁定：趋势线 + 水平线 + Entry Zone。');return}
    $('#scanCaseEntries').disabled=true;$('#caseStatus').textContent='准备低周期数据…';
    try{
      const {tfs,ctx}=await prepareRows();showMiniFromCache();
      worker?.terminate();
      worker=new Worker(new URL('./structure_case_worker.js',import.meta.url),{type:'module'});
      worker.onmessage=e=>{
        const m=e.data||{};
        if(m.type==='PROGRESS')$('#caseStatus').textContent=`Web Worker 扫描 ${TF_LABEL[m.timeframe]} · ${m.done+1}/${m.total}`;
        if(m.type==='ERROR'){throw new Error(m.message)}
        if(m.type==='DONE'){
          const oldFb=getFeedback(),all=m.results.flatMap(x=>x.candidates||[]);
          c.candidates=all;putCase(c);
          // Keep only reviews whose deterministic candidate still exists.
          const ids=new Set(all.map(x=>x.id)),nf={};for(const [k,v] of Object.entries(oldFb))if(ids.has(k))nf[k]=v;putFeedback(nf);
          explanation=explainCase(all,nf);
          $('#caseStatus').textContent=`扫描完成：${all.length} 个候选。当前只研究这个 Structure Case。`;
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
      const f=fb[x.id],status=f?.verdict==='accept'?'✓ 合理':f?.verdict==='reject'?'× 不合理':'未评价';
      return `<article class="caseEntry ${f?.verdict||''}" data-id="${x.id}">
        <div class="caseEntryTop"><b>${TF_LABEL[x.sourceTf]} · L${x.level} · ${x.reason}</b><strong>${Math.round(x.score)}</strong></div>
        <div class="caseEntryMeta">${fmtBJ(x.decisionTime)} · ${num(x.entryPrice)} · ${status}</div>
        <div class="caseEntryTags"><span>HL ${x.hl?'✓':'—'}</span><span>BOS ${x.bosUp?'✓':'—'}</span><span>水平 ${dec(x.horizontalDistanceAtr)} ATR</span><span>趋势线 ${dec(x.trendlineDistanceAtr)} ATR</span></div>
        <div class="caseEntryRisk">4h MFE ${pct(x.outcomes?.h4?.mfe)} · MAE ${pct(x.outcomes?.h4?.mae)} · 10x保证金MAE ${pct(x.outcomes?.h4?.marginMae10x)}</div>
        <div class="caseEntryActions"><button data-v="accept">✓ 合理</button><button data-v="reject">× 不合理</button></div>
      </article>`;
    }).join('');
    box.querySelectorAll('.caseEntry').forEach(el=>{
      el.onclick=e=>{
        const x=c.candidates.find(q=>q.id===el.dataset.id);if(!x)return;
        if(e.target.dataset.v){e.stopPropagation();verdict(x.id,e.target.dataset.v);return}
        const p=x.process||{};
        $('#caseEntryDetail').innerHTML=`<b>${TF_LABEL[x.sourceTf]} L${x.level}</b><br>${fmtBJ(x.decisionTime)} @ ${num(x.entryPrice)}<br>
          下跌效率改善 ${dec(x.downsideEfficiencyChange)} · 下影 ${dec(x.lowerWickRatio)} · 成交量比 ${dec(x.volumeAsymmetry)}<br>
          OI 1h ${pct(x.oi_change_1h)} · Funding Z ${dec(x.funding_z7d)} · Taker ${dec(x.taker_ls_ratio)}<br>
          <b>过程变量</b><br>OI: Zone ${pct(p.oi_change_1h?.zone)} → Low ${pct(p.oi_change_1h?.low)} → Entry ${pct(p.oi_change_1h?.entry)}<br>
          Funding Z: ${dec(p.funding_z7d?.zone)} → ${dec(p.funding_z7d?.low)} → ${dec(p.funding_z7d?.entry)}`;
      };
    });
  }
  function renderIdealList(){
    const box=$('#idealEntryList');if(!box)return;
    const ideals=c?.idealEntries||[],cand=c?.candidates||[];
    if(!ideals.length){box.innerHTML='还没有标记“我的理想买点”。';return}
    box.innerHTML=ideals.map(x=>{
      const near=cand.slice().sort((a,b)=>Math.abs(a.decisionTime-x.decisionTime)-Math.abs(b.decisionTime-x.decisionTime))[0];
      const delta=near?Math.round((near.decisionTime-x.decisionTime)/60):null;
      return `<div class="idealRow"><b>★ ${TF_LABEL[x.sourceTf]} ${fmtBJ(x.decisionTime)}</b><span>${num(x.entryPrice)}</span><em>${near?`最近机器候选 ${delta>0?'晚':'早'} ${Math.abs(delta)} 分钟`:'暂无机器候选'}</em><button data-id="${x.id}">删除</button></div>`;
    }).join('');
    box.querySelectorAll('button').forEach(b=>b.onclick=()=>{c.idealEntries=c.idealEntries.filter(x=>x.id!==b.dataset.id);putCase(c);renderCase();showMiniFromCache()});
  }
  function renderExplanation(){
    const box=$('#caseExplanation');if(!box)return;
    if(!c?.candidates?.length){box.innerHTML='先扫描候选，再由你评价合理/不合理。';return}
    explanation=explainCase(c.candidates,getFeedback());
    const labeled=Object.values(getFeedback()).filter(x=>['accept','reject'].includes(x.verdict)).length;
    if(labeled<2){
      box.innerHTML=`<div class="caseExplainNote">当前不是“有效 Alpha 排名”。先评价至少两个买点，系统再比较你认可和拒绝的 Entry。</div>`;
      return;
    }
    box.innerHTML=`<table><thead><tr><th>当前Case解释因子</th><th>认可均值</th><th>拒绝均值</th><th>区分度</th></tr></thead><tbody>${
      explanation.slice(0,10).map(x=>`<tr><td>${x.label}</td><td>${dec(x.acceptedMean,3)}</td><td>${dec(x.rejectedMean,3)}</td><td>${dec(x.separation,2)}</td></tr>`).join('')
    }</tbody></table><div class="caseExplainNote">仅解释当前 Structure Case；没有自动找历史相似结构，也没有泛化结论。</div>`;
  }
  function generateDraft(){
    if(!c){return}const d=buildCaseDraft(c,getFeedback(),explanation);$('#caseDraft').textContent=JSON.stringify(d,null,2);
    let arr=[];try{arr=JSON.parse(localStorage.getItem(DRAFTS)||'[]')}catch{}arr.push({...d,createdAt:new Date().toISOString()});localStorage.setItem(DRAFTS,JSON.stringify(arr));
  }
  function dataChanged(){renderCase();renderMarkers();renderOverlay()}
  function chartRebuilt(){renderCase();try{api.chart()?.timeScale().subscribeVisibleTimeRangeChange(()=>renderOverlay())}catch{}}
  function refresh(){renderCase()}
  function setIdealMode(){if(!c?.zone){alert('先建立 Structure Case 和 Entry Zone。');return}idealMode=!idealMode;$('#idealEntryMode').classList.toggle('active',idealMode);$('#caseStatus').textContent=idealMode?'请在下方任一低周期图点击你的理想买点。':'已取消理想买点标记模式。'}

  $('#lockSelectedStructure').onclick=lockSelected;$('#resetStructureCase').onclick=resetCase;$('#selectCaseZone').onclick=startZone;
  $('#scanCaseEntries').onclick=scan;$('#idealEntryMode').onclick=setIdealMode;$('#generateCaseDraft').onclick=generateDraft;
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&zoneMode){zoneMode=false;drag=false;chartEl.classList.remove('zoneSelectActive');renderOverlay()}});
  renderCase();
  return {dataChanged,chartRebuilt,refresh,case:()=>c};
}
