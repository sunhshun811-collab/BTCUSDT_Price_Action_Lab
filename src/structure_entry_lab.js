
import {createChart,CandlestickSeries,createSeriesMarkers,CrosshairMode} from 'lightweight-charts';
import {loadMonths,loadContexts,toCandleRows} from './data.js';
import {getDrawings} from './annotations.js';
import {discoverB3Candidates,factorDiscovery,buildStrategyDraft} from './conditional_entry_research.js';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const TF_SECONDS={'8h':28800,'4h':14400,'1h':3600,'15m':900,'5m':300,'1m':60};
const TF_LABEL={'1h':'1小时','15m':'15分钟','5m':'5分钟','1m':'1分钟'};
const STORE='priceActionLab.structureEntryV6',FEEDBACK='priceActionLab.entryFeedbackV6',DRAFTS='priceActionLab.strategyDraftsV6';
const BJ='Asia/Shanghai';
const fmtBJ=(sec)=>new Intl.DateTimeFormat('zh-CN',{timeZone:BJ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(sec*1000));
const fmt=x=>x==null||!Number.isFinite(Number(x))?'—':Number(x).toFixed(2);
const pct=x=>x==null||!Number.isFinite(Number(x))?'—':`${(Number(x)*100).toFixed(2)}%`;

function getState(){
  try{return {...{trendlineId:null,horizontalId:null,zone:null},...JSON.parse(localStorage.getItem(STORE)||'{}')}}catch{return{trendlineId:null,horizontalId:null,zone:null}}
}
function saveState(s){localStorage.setItem(STORE,JSON.stringify(s))}
function getFeedback(){try{return JSON.parse(localStorage.getItem(FEEDBACK)||'{}')}catch{return{}}}
function saveFeedback(v){localStorage.setItem(FEEDBACK,JSON.stringify(v))}
function monthList(indexData,tf,from,to){
  const all=indexData.timeframes?.[tf]||[];
  return all.filter(m=>{
    const [y,mo]=m.split('-').map(Number),a=Date.UTC(y,mo-1,1)/1000,b=Date.UTC(y+(mo===12),mo===12?0:mo,1)/1000;
    return b>from&&a<to;
  });
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

export function initStructureEntryLab(api){
  let state=getState(),zoneSelect=false,dragging=false,dragStart=null,dragEnd=null;
  let results={candidates:[],perTf:{},factors:[]},miniCharts=[],selectedCandidateId=null;
  const chartEl=api.chartContainer(),wrap=api.chartWrap(),overlay=$('#entryZoneOverlay');

  function drawings(){return getDrawings()}
  function trend(){return drawings().find(x=>x.id===state.trendlineId&&x.type==='trend')||null}
  function horiz(){return drawings().find(x=>x.id===state.horizontalId&&x.type==='horizontal')||null}
  function selected(){return api.selectedDrawing()}
  function renderSlots(){
    const t=trend(),h=horiz();
    $('#entryTrendSlot').innerHTML=t?`<b>趋势线</b><span>${t.timeframe} · ${(t.id||'').slice(0,8)}</span>`:'<b>趋势线</b><span>未选择</span>';
    $('#entryHorizontalSlot').innerHTML=h?`<b>水平线</b><span>${Number(h.price).toLocaleString('en-US',{maximumFractionDigits:2})}</span>`:'<b>水平线</b><span>未选择</span>';
    $('#entryZoneText').textContent=state.zone?`${fmtBJ(state.zone.start)} → ${fmtBJ(state.zone.end)}`:'未框选';
    renderOverlay();
  }
  function attachSelected(){
    const d=selected();if(!d){alert('先在主图选择一根趋势线或水平线。');return}
    if(d.type==='trend')state.trendlineId=d.id;
    else if(d.type==='horizontal')state.horizontalId=d.id;
    else return;
    saveState(state);renderSlots();
  }
  function clearStructure(){state.trendlineId=null;state.horizontalId=null;saveState(state);renderSlots();clearResults()}
  function chartX(t){return api.chart()?.timeScale().timeToCoordinate(t)}
  function renderOverlay(temp=false){
    const z=temp&&dragStart!=null&&dragEnd!=null?{start:Math.min(dragStart,dragEnd),end:Math.max(dragStart,dragEnd)}:state.zone;
    if(!z){overlay.classList.add('hidden');return}
    const x1=chartX(z.start),x2=chartX(z.end);
    if(x1==null||x2==null){overlay.classList.add('hidden');return}
    const cr=chartEl.getBoundingClientRect(),wr=wrap.getBoundingClientRect();
    const left=Math.min(x1,x2)+(cr.left-wr.left),width=Math.max(2,Math.abs(x2-x1));
    overlay.style.left=`${left}px`;overlay.style.width=`${width}px`;overlay.style.top=`${cr.top-wr.top}px`;overlay.style.height=`${cr.height}px`;
    overlay.classList.remove('hidden');
  }
  function eventTime(ev){
    const r=chartEl.getBoundingClientRect();
    const x=Math.max(0,Math.min(r.width,ev.clientX-r.left));
    const t=api.chart()?.timeScale().coordinateToTime(x);
    return t==null?null:Number(t);
  }
  function stop(ev){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation?.()}
  function onDown(ev){
    if(!zoneSelect||ev.button!==0)return;
    const t=eventTime(ev);if(t==null)return;stop(ev);dragging=true;dragStart=t;dragEnd=t;
    try{chartEl.setPointerCapture(ev.pointerId)}catch{}renderOverlay(true);
  }
  function onMove(ev){
    if(!zoneSelect||!dragging)return;const t=eventTime(ev);if(t==null)return;stop(ev);dragEnd=t;renderOverlay(true);
  }
  function onUp(ev){
    if(!zoneSelect||!dragging)return;const t=eventTime(ev);if(t!=null)dragEnd=t;stop(ev);dragging=false;zoneSelect=false;chartEl.classList.remove('zoneSelectActive');
    if(dragStart!=null&&dragEnd!=null&&dragStart!==dragEnd){
      state.zone={start:Math.min(dragStart,dragEnd),end:Math.max(dragStart,dragEnd),sourceTf:api.currentTF()};
      saveState(state);renderSlots();clearResults();
    }
    dragStart=dragEnd=null;
  }
  chartEl.addEventListener('pointerdown',onDown,true);
  window.addEventListener('pointermove',onMove,true);
  window.addEventListener('pointerup',onUp,true);
  window.addEventListener('pointercancel',onUp,true);

  function startZone(){
    if(!trend()||!horiz()){alert('先加入一根趋势线和一根水平线。');return}
    zoneSelect=true;chartEl.classList.add('zoneSelectActive');$('#entryZoneText').textContent='在主图按住鼠标拖出买点研究区间…';
  }
  function clearZone(){state.zone=null;saveState(state);renderSlots();clearResults()}
  function clearMini(){miniCharts.forEach(c=>{try{c.remove()}catch{}});miniCharts=[];$('#entryMiniCharts').innerHTML=''}
  function clearResults(){
    results={candidates:[],perTf:{},factors:[]};clearMini();api.setEntryMarkers([]);
    $('#entryCandidateList').innerHTML='尚未扫描。';$('#conditionalFactorTable').innerHTML='尚未扫描。';$('#strategyDraft').textContent='尚未生成。';
    $('#entryDiscoverySummary').textContent='选择结构和区间后开始扫描。';
  }
  function checkedTFs(){return $$('#entryTfChecks input:checked').map(x=>x.value)}
  async function loadTf(tf,from,to){
    const months=monthList(api.indexData(),tf,from,to);return months.length?loadMonths(tf,months):[];
  }
  async function loadCtx(from,to){
    const months=monthList(api.indexData(),'5m',from,to);return months.length?(await loadContexts(months)).rows||[]:[];
  }
  function feedbackMarker(c){
    const f=getFeedback()[c.id];
    return {time:c.barTime,position:'belowBar',shape:'arrowUp',
      color:f?.verdict==='accept'?'#6ee7b7':f?.verdict==='reject'?'#ff7b7b':'#ffd166',
      text:`${c.type.replace('B3_','')} ${Math.round(c.score)}`};
  }
  function renderMini(tf,rows,cands){
    const host=document.createElement('div');host.className='entryMini panel';
    host.innerHTML=`<div class="entryMiniHead"><b>${TF_LABEL[tf]}</b><span>${cands.length} 个候选</span></div><div class="entryMiniChart"></div>`;
    $('#entryMiniCharts').appendChild(host);
    const ch=createChart(host.querySelector('.entryMiniChart'),miniOptions()),s=ch.addSeries(CandlestickSeries,candleOptions());
    s.setData(toCandleRows(rows));
    createSeriesMarkers(s,cands.map(feedbackMarker).sort((a,b)=>a.time-b.time));
    const z=state.zone;if(z)ch.timeScale().setVisibleRange({from:z.start-6*TF_SECONDS[tf],to:z.end+6*TF_SECONDS[tf]});
    miniCharts.push(ch);
  }
  function candidateCard(c){
    const fb=getFeedback()[c.id],status=fb?.verdict==='accept'?'✓ 已认可':fb?.verdict==='reject'?'× 已拒绝':'未评价';
    return `<div class="entryCandidate ${fb?.verdict||''}" data-id="${c.id}">
      <div class="entryCandTop"><b>${TF_LABEL[c.timeframe]} · ${c.type}</b><strong>${Math.round(c.score)}</strong></div>
      <div class="entryCandMeta">${fmtBJ(c.decisionTime)} · Entry ${Number(c.close).toLocaleString('en-US',{maximumFractionDigits:2})}</div>
      <div class="entryCandTags">
        <span>HL ${c.hl?'✓':'—'}</span><span>BOS ${c.bosUp?'✓':'—'}</span><span>Reclaim ${c.reclaim?'✓':'—'}</span>
        <span>水平 ${fmt(c.horizontalDistanceAtr)} ATR</span><span>趋势线 ${fmt(c.trendlineDistanceAtr)} ATR</span>
        <span>OI 1h ${pct(c.oi_change_1h)}</span>
      </div>
      <div class="entryCandOutcome">4h: ${pct(c.outcomes?.h4?.return)} · MFE ${pct(c.outcomes?.h4?.mfe)} · MAE ${pct(c.outcomes?.h4?.mae)} · 10x保证金MAE ${pct(c.outcomes?.h4?.marginMae10x)}</div>
      <div class="entryCandActions"><button data-act="accept">✓ 买点合理</button><button data-act="reject">× 买点不合理</button><span>${status}</span></div>
    </div>`;
  }
  function renderCandidates(){
    const box=$('#entryCandidateList'),v=results.candidates.slice().sort((a,b)=>a.decisionTime-b.decisionTime);
    box.innerHTML=v.length?v.map(candidateCard).join(''):'当前条件没有发现 B3 类候选买点。';
    box.querySelectorAll('.entryCandidate').forEach(card=>{
      card.onclick=e=>{
        const id=card.dataset.id,c=results.candidates.find(x=>x.id===id);if(!c)return;
        selectedCandidateId=id;
        if(e.target.dataset.act){
          e.stopPropagation();const f=getFeedback(),act=e.target.dataset.act;
          f[id]={verdict:act==='accept'?'accept':'reject',reason:act==='reject'?$('#entryRejectReason').value:'',time:new Date().toISOString()};
          saveFeedback(f);renderCandidates();renderMiniAll();renderMainMarkers();return;
        }
        $('#entryCandidateDetail').innerHTML=`<b>${TF_LABEL[c.timeframe]} ${c.type}</b><br>
          北京时间 ${fmtBJ(c.decisionTime)}<br>
          Score ${fmt(c.score)} · Structure ${fmt(c.components.structure)} · Context ${fmt(c.components.context)} · Exhaustion ${fmt(c.components.exhaustion)}<br>
          Downside Eff ${fmt(c.downsideEfficiency)} → Δ ${fmt(c.downsideEfficiencyChange)} · Wick ${fmt(c.lowerWickRatio)} · Vol Asym ${fmt(c.volumeAsymmetry)}<br>
          Funding Z ${fmt(c.funding_z7d)} · Basis Z ${fmt(c.basis_bps_z7d)} · OI1h ${pct(c.oi_change_1h)} · Taker ${fmt(c.taker_ls_ratio)}`;
      };
    });
  }
  function renderFactors(){
    const v=results.factors;
    $('#conditionalFactorTable').innerHTML=v.length?`<table><thead><tr><th>因子</th><th>N</th><th>Spearman→4h</th><th>Q4-Q1</th><th>当前区间方向</th></tr></thead><tbody>${
      v.slice(0,10).map(x=>`<tr><td>${x.label}</td><td>${x.n}</td><td>${fmt(x.rho)}</td><td>${pct(x.quartileSpread)}</td><td>${x.direction}</td></tr>`).join('')
    }</tbody></table><div class="discoveryWarn">仅当前人工框选区间 Discovery，用于提出假设；不能当成已验证 Alpha。</div>`:'当前区间可用样本不足。';
  }
  function renderMainMarkers(){
    const tfSec=TF_SECONDS[api.currentTF()]||60,by=new Map();
    for(const c of results.candidates){
      let t=Math.floor((c.decisionTime-1)/tfSec)*tfSec;
      if(!by.has(t))by.set(t,c);else if(c.score>by.get(t).score)by.set(t,c);
    }
    api.setEntryMarkers([...by.values()].map(c=>{
      const f=getFeedback()[c.id];
      return {time:Math.floor((c.decisionTime-1)/tfSec)*tfSec,position:'belowBar',shape:'arrowUp',
        color:f?.verdict==='accept'?'#6ee7b7':f?.verdict==='reject'?'#ff7b7b':'#ffd166',
        text:`${c.timeframe} B3 ${Math.round(c.score)}`};
    }));
  }
  function renderMiniAll(){
    clearMini();
    for(const tf of Object.keys(results.perTf)){
      const r=results.perTf[tf];renderMini(tf,r.displayRows,r.candidates);
    }
  }
  async function scan(){
    const t=trend(),h=horiz(),z=state.zone,tfs=checkedTFs();
    if(!t||!h||!z){alert('需要：趋势线 + 水平线 + 买点研究区间。');return}
    if(!tfs.length){alert('至少选择一个低周期。');return}
    $('#entryDiscoverySummary').textContent='正在加载低周期并扫描因果特征…';clearMini();
    const lookback=4*86400,forward=2*86400,ctx=await loadCtx(z.start-lookback,z.end+forward);
    const all=[];
    for(const tf of tfs){
      const rows=await loadTf(tf,z.start-lookback,z.end+forward);
      const r=discoverB3Candidates(rows,tf,h,t,z,ctx);
      // Display enough context around zone, but keep full rows for outcomes.
      const displayRows=rows.filter(x=>Number(x[0])>=z.start-24*3600&&Number(x[0])<=z.end+12*3600);
      results.perTf[tf]={...r,displayRows,allRows:rows};all.push(...r.candidates);
    }
    results.candidates=all.sort((a,b)=>b.score-a.score);
    const factorTf=results.perTf['5m']?'5m':Object.keys(results.perTf)[0];
    results.factors=factorTf?factorDiscovery(results.perTf[factorTf].rows,z):[];
    $('#entryDiscoverySummary').textContent=`发现 ${results.candidates.length} 个提前 B3 类候选；因子探索使用 ${TF_LABEL[factorTf]||factorTf}。`;
    renderCandidates();renderFactors();renderMiniAll();renderMainMarkers();
  }
  function generateDraft(){
    const t=trend(),h=horiz(),z=state.zone;if(!t||!h||!z||!results.candidates.length){alert('先完成一次买点扫描。');return}
    const fb=getFeedback(),acceptedIds=Object.entries(fb).filter(([,v])=>v.verdict==='accept').map(([k])=>k);
    const draft=buildStrategyDraft({trendline:t,horizontal:h,zone:z,candidates:results.candidates,factors:results.factors,acceptedIds});
    $('#strategyDraft').textContent=JSON.stringify(draft,null,2);
    let ds=[];try{ds=JSON.parse(localStorage.getItem(DRAFTS)||'[]')}catch{}
    ds.push({...draft,createdAt:new Date().toISOString()});localStorage.setItem(DRAFTS,JSON.stringify(ds));
  }

  function chartRebuilt(){
    try{api.chart()?.timeScale().subscribeVisibleTimeRangeChange(()=>renderOverlay())}catch{}
    renderOverlay();renderMainMarkers();
  }
  function dataChanged(){clearResults();renderOverlay()}
  function refresh(){renderSlots()}
  function cancelZone(){zoneSelect=false;dragging=false;chartEl.classList.remove('zoneSelectActive');renderOverlay()}
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&zoneSelect){e.preventDefault();cancelZone()}});

  $('#attachSelectedStructure').onclick=attachSelected;$('#clearStructureSet').onclick=clearStructure;
  $('#selectEntryZone').onclick=startZone;$('#clearEntryZone').onclick=clearZone;$('#scanEntryCandidates').onclick=scan;$('#generateEntryStrategy').onclick=generateDraft;
  renderSlots();clearResults();

  return {chartRebuilt,dataChanged,refresh,setZone:z=>{state.zone=z;saveState(state);renderSlots()},state:()=>state};
}
