
import './style.css';
import {createChart,CandlestickSeries,HistogramSeries,LineSeries,createSeriesMarkers,CrosshairMode} from 'lightweight-charts';
import {loadIndex,loadMonths,loadContexts,toCandleRows,toVolumeRows} from './data.js';
import {setContextData,renderContextAt} from './context.js';
import {getDrawings,addDrawing,updateDrawing,removeDrawing,drawingsFor,drawingsForView,undoDrawing,clearDrawings,getLabels,addLabel,downloadJson} from './annotations.js';
import {analyzeTrendline} from './trendline_research.js';
import {createTrendDrawingEngine} from './drawing_engine.js';
import {scoreBars,previewTrades} from './strategy.js';
import {initResearchUI,researchDataChanged} from './research_ui.js';
import {initStructureCaseLab} from './structure_case_lab.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const TF_LABEL={'8h':'8小时','4h':'4小时','1h':'1小时','15m':'15分钟','5m':'5分钟','1m':'1分钟'};
const BJ='Asia/Shanghai';
const fmtBJ=(sec,withSeconds=false)=>new Intl.DateTimeFormat('zh-CN',{timeZone:BJ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:withSeconds?'2-digit':undefined,hour12:false}).format(new Date(sec*1000));
const tickBJ=sec=>new Intl.DateTimeFormat('zh-CN',{timeZone:BJ,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(sec*1000));
const TF_RANGES={
  '8h':['3M','6M','1Y','ALL'],'4h':['1M','3M','6M','1Y','ALL'],'1h':['1M','3M','6M','1Y'],
  '15m':['1W','1M','3M','6M'],'5m':['3D','1W','1M','3M'],'1m':['6H','1D','3D','1W','1M']
};
const TF_DEFAULT={'8h':'1Y','4h':'6M','1h':'3M','15m':'1M','5m':'1W','1m':'3D'};

let indexData,chart,candle,volume,markerApi,previewMarkerApi,currentRows=[],loadedRows=[],baseWindowRows=[],fullContextRows=[],currentTF='8h';
let tool='select',firstAnchor=null,hoverAnchor=null,selectedPoint=null,selectedDrawingId=null,reanchor=null;
let lineSeries=[],priceLines=[],previewLine=null,rowMap=new Map(),structureSnaps=[],currentRangeKey='1Y';
let researchReplayState={active:false,decisionTime:null,futureRevealed:false};
let drawingEngine=null,structureEntryLab=null;
let entryCandidateMarkers=[];
const overviewCharts=[];

function chartOptions(){
  return {
    autoSize:true,layout:{background:{color:'#09121c'},textColor:'#91a5b9',attributionLogo:true},
    grid:{vertLines:{color:'#182635'},horzLines:{color:'#182635'}},rightPriceScale:{borderColor:'#294058'},
    timeScale:{borderColor:'#294058',timeVisible:true,secondsVisible:false,tickMarkFormatter:t=>tickBJ(Number(t))},
    localization:{timeFormatter:t=>fmtBJ(Number(t),false),priceFormatter:p=>Number(p).toLocaleString('en-US',{maximumFractionDigits:2})},
    crosshair:{mode:CrosshairMode.Normal}
  };
}
function candleOptions(){return {upColor:'#ef5350',downColor:'#26a69a',borderVisible:false,wickUpColor:'#ef5350',wickDownColor:'#26a69a'}}
function num(x){return Number(x).toLocaleString('en-US',{maximumFractionDigits:2})}
function availableMonths(tf){return indexData?.timeframes?.[tf]||[]}
function secDate(sec){return new Date(sec*1000)}
function ymdBJ(sec){return new Intl.DateTimeFormat('en-CA',{timeZone:BJ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(sec*1000))}
function bjStart(s){return Math.floor(Date.parse(`${s}T00:00:00+08:00`)/1000)}
function bjEnd(s){return Math.floor(Date.parse(`${s}T00:00:00+08:00`)/1000)+86400}
function monthOf(sec){return new Date(sec*1000).toISOString().slice(0,7)}
function monthsCovering(from,to){
  const all=availableMonths(currentTF);if(!all.length)return[];
  return all.filter(m=>{
    const [y,mo]=m.split('-').map(Number),a=Date.UTC(y,mo-1,1)/1000,b=Date.UTC(y+(mo===12),mo===12?0:mo,1)/1000;
    return b>from&&a<to;
  });
}
function rangeStart(end,key){
  const d=new Date(end*1000);
  if(key==='6H')return end-6*3600;if(key==='1D')return end-86400;if(key==='3D')return end-3*86400;if(key==='1W')return end-7*86400;
  if(key==='ALL')return -Infinity;
  const n=Number(key.slice(0,-1)),unit=key.at(-1);let y=d.getUTCFullYear(),m=d.getUTCMonth();
  if(unit==='M'){m-=n}else if(unit==='Y'){y-=n}
  return Date.UTC(y,m,d.getUTCDate(),d.getUTCHours(),d.getUTCMinutes())/1000;
}
function renderRangeButtons(){
  const keys=TF_RANGES[currentTF],box=$('#rangeButtons');box.innerHTML='';
  if(!keys.includes(currentRangeKey))currentRangeKey=TF_DEFAULT[currentTF];
  for(const k of keys){
    const b=document.createElement('button');b.textContent=k==='ALL'?'全部':k;b.classList.toggle('active',k===currentRangeKey);
    b.onclick=()=>{currentRangeKey=k;renderRangeButtons();loadQuickRange()};box.appendChild(b);
  }
}
function fillMonthJump(){
  const months=availableMonths(currentTF);$('#monthJump').innerHTML=months.map(m=>`<option>${m}</option>`).join('');
  if(months.length)$('#monthJump').value=months.at(-1);
  const all=[...new Set(Object.values(indexData.timeframes||{}).flat())].sort();
  $('#overviewMonth').innerHTML=all.map(m=>`<option>${m}</option>`).join('');if(all.length)$('#overviewMonth').value=all.at(-1);
}
function destroyMain(){
  lineSeries=[];priceLines=[];previewLine=null;if(chart){chart.remove();chart=null}
}
function buildMainChart(){
  destroyMain();chart=createChart($('#chart'),chartOptions());
  candle=chart.addSeries(CandlestickSeries,candleOptions());volume=chart.addSeries(HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:''});
  volume.priceScale().applyOptions({scaleMargins:{top:.82,bottom:0}});
  markerApi=createSeriesMarkers(candle,[]);previewMarkerApi=createSeriesMarkers(candle,[]);
  chart.subscribeCrosshairMove(p=>{
    if(!p.point||!p.time)return;
    const d=p.seriesData.get(candle);if(d)$('#cursorInfo').innerHTML=`北京时间：${fmtBJ(Number(p.time),true)}<br>O ${num(d.open)} · H ${num(d.high)} · L ${num(d.low)} · C ${num(d.close)}`;
    renderContextAt(Number(p.time));
  });
  chart.subscribeClick(handleClick);
  if(structureEntryLab)structureEntryLab.chartRebuilt();
}
function rebuildMap(){
  rowMap=new Map(currentRows.map(r=>[r[0],r]));
  structureSnaps=[];
  const span=3;
  for(let i=span;i<currentRows.length-span;i++){
    let hi=true,lo=true;
    for(let j=i-span;j<=i+span;j++){
      if(j===i)continue;
      if(currentRows[j][2]>=currentRows[i][2])hi=false;
      if(currentRows[j][3]<=currentRows[i][3])lo=false;
    }
    if(hi)structureSnaps.push({time:currentRows[i][0],price:currentRows[i][2],snapName:'Swing H'});
    if(lo)structureSnaps.push({time:currentRows[i][0],price:currentRows[i][3],snapName:'Swing L'});
  }
}
function snapPoint(time,price,pixelY){
  const mode=$('#snapMode').value;if(mode==='off')return {time,price,snapped:false};
  if(mode==='structure'){
    let best=null,score=Infinity;
    for(const c of structureSnaps){
      const x=chart.timeScale().timeToCoordinate(c.time),y=candle.priceToCoordinate(c.price);
      const tx=chart.timeScale().timeToCoordinate(time);
      if(x==null||y==null||tx==null)continue;
      const dx=Math.abs(x-tx),dy=Math.abs(y-pixelY),s=Math.sqrt((dx*.7)**2+dy**2);
      if(s<score){score=s;best={...c,y}}
    }
    if(best&&score<=28)return {time:best.time,price:best.price,snapped:true,snapName:best.snapName};
    return {time,price,snapped:false};
  }
  const row=rowMap.get(time);if(!row)return {time,price,snapped:false};
  const candidates=[['H',row[2]],['L',row[3]],['O',row[1]],['C',row[4]]].map(([name,v])=>({name,v,y:candle.priceToCoordinate(v)})).filter(x=>x.y!=null);
  candidates.sort((a,b)=>Math.abs(a.y-pixelY)-Math.abs(b.y-pixelY));const best=candidates[0],limit=mode==='strong'?20:9;
  if(best&&Math.abs(best.y-pixelY)<=limit)return {time,price:best.v,snapped:true,snapName:best.name};
  return {time,price,snapped:false};
}
function linePoints(a,b,mode){
  if(!a||!b||a.time===b.time)return[];
  let A=a,B=b;if(A.time>B.time)[A,B]=[B,A];
  const slope=(B.price-A.price)/(B.time-A.time),first=currentRows[0]?.[0]??A.time,last=currentRows.at(-1)?.[0]??B.time;
  if(mode==='segment')return [{time:A.time,value:A.price},{time:B.time,value:B.price}];
  if(mode==='ray')return [{time:A.time,value:A.price},{time:last,value:A.price+slope*(last-A.time)}];
  return [{time:first,value:A.price+slope*(first-A.time)},{time:last,value:A.price+slope*(last-A.time)}];
}
function ensurePreview(){
  if(!previewLine)previewLine=chart.addSeries(LineSeries,{color:'#9ed2ff',lineWidth:1,lineStyle:2,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
}
function renderPreviewTrend(){
  if(!firstAnchor||!hoverAnchor)return;
  ensurePreview();previewLine.setData(linePoints(firstAnchor,hoverAnchor,$('#trendMode').value));
}
function clearPreview(){if(previewLine){chart.removeSeries(previewLine);previewLine=null}hoverAnchor=null}
function setTool(name){
  tool=name;firstAnchor=null;reanchor=null;clearPreview();
  if(drawingEngine)drawingEngine.setActive(name==='trend');
  $$('.tool').forEach(b=>b.classList.remove('active'));const map={select:'#toolSelect',trend:'#toolTrend',horizontal:'#toolHorizontal'};if(map[name])$(map[name]).classList.add('active');
}
async function selectDrawing(id){
  selectedDrawingId=id;renderDrawings();const d=getDrawings().find(x=>x.id===id);if(structureEntryLab)structureEntryLab.refresh();
  const editable=!!d&&d.type==='trend'&&d.timeframe===currentTF;
  $('#resetAnchorA').disabled=!editable;$('#resetAnchorB').disabled=!editable;$('#deleteSelected').disabled=!d;
  if(!d){$('#drawingInfo').textContent='未选择图形。';return}
  if(d.type==='trend'){
    $('#drawingInfo').innerHTML=`已选趋势线 · 母周期 ${TF_LABEL[d.timeframe]}<br>A ${fmtBJ(d.a.time)} @ ${num(d.a.price)}<br>B ${fmtBJ(d.b.time)} @ ${num(d.b.price)}<br>可直接锁入 Structure Case。`;
  }else if(d.type==='horizontal'){
    $('#drawingInfo').innerHTML=`已选水平线 · 母周期 ${TF_LABEL[d.timeframe]} · ${num(d.price)}<br>可直接锁入 Structure Case。`;
  }
}
function nearestDrawing(point,time){
  let best=null,bestPx=Infinity;
  for(const d of drawingsForView(currentTF,$('#showHigherTfTrendlines')?.checked!==false)){
    if(d.type==='horizontal'){
      const y=candle.priceToCoordinate(d.price);if(y!=null&&Math.abs(y-point.y)<bestPx){best={d,dist:Math.abs(y-point.y)};bestPx=Math.abs(y-point.y)}
    }else if(d.type==='trend'){
      let A=d.a,B=d.b;if(A.time>B.time)[A,B]=[B,A];if(A.time===B.time)continue;
      if(d.mode==='segment'&&(time<A.time||time>B.time))continue;if(d.mode==='ray'&&time<A.time)continue;
      const p=A.price+(B.price-A.price)*(time-A.time)/(B.time-A.time),y=candle.priceToCoordinate(p);
      if(y!=null&&Math.abs(y-point.y)<bestPx){best={d,dist:Math.abs(y-point.y)};bestPx=Math.abs(y-point.y)}
    }
  }
  return best&&best.dist<=10?best.d:null;
}
function handleClick(p){
  if(!p.point||!p.time)return;const raw=Number(candle.coordinateToPrice(p.point.y));if(!Number.isFinite(raw))return;
  const snapped=snapPoint(Number(p.time),raw,p.point.y);selectedPoint=snapped;

  if(reanchor&&selectedDrawingId){
    const d=getDrawings().find(x=>x.id===selectedDrawingId);if(d?.type==='trend'){
      updateDrawing(d.id,{[reanchor]:{time:snapped.time,price:snapped.price}});reanchor=null;renderDrawings();selectDrawing(d.id);return;
    }
  }
  if(tool==='select'){const d=nearestDrawing(p.point,Number(p.time));selectDrawing(d?.id||null);return}
  if(tool==='trend')return; // V5 uses pointer-drag Drawing Engine instead of chart.subscribeClick().
  if(tool==='horizontal'){const d={id:crypto.randomUUID(),type:'horizontal',timeframe:currentTF,price:snapped.price,createdAt:new Date().toISOString()};addDrawing(d);setTool('select');selectDrawing(d.id)}
}
function renderDrawings(){
  lineSeries.forEach(x=>chart.removeSeries(x.series));lineSeries=[];priceLines.forEach(p=>candle.removePriceLine(p));priceLines=[];
  for(const d of drawingsForView(currentTF,$('#showHigherTfTrendlines')?.checked!==false)){
    if(d.type==='horizontal'){
      priceLines.push(candle.createPriceLine({price:d.price,color:d.id===selectedDrawingId?'#9ed2ff':'#e7bf55',lineWidth:d.id===selectedDrawingId?2:1,lineStyle:2,axisLabelVisible:true,title:'关键位'}));
    }else if(d.type==='trend'){
      const projected=d.timeframe!==currentTF;
      const s=chart.addSeries(LineSeries,{color:d.id===selectedDrawingId?'#9ed2ff':projected?'#6f8da8':'#55a7ff',lineWidth:d.id===selectedDrawingId?3:projected?1:2,lineStyle:projected?2:0,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
      s.setData(linePoints(d.a,d.b,d.mode||'ray'));
      if(d.id===selectedDrawingId)createSeriesMarkers(s,[{time:d.a.time,position:'inBar',shape:'circle',color:'#ffffff',text:'A'},{time:d.b.time,position:'inBar',shape:'circle',color:'#ffffff',text:'B'}].sort((a,b)=>a.time-b.time));
      lineSeries.push({id:d.id,series:s});
    }
  }
}


function renderCalibrationState(s){
  const panel=$('#trendCalibrationPanel'),summary=$('#calibrationSummary');
  if(!s||s.kind==='idle'){
    panel.classList.add('hidden');return;
  }
  panel.classList.remove('hidden');
  if(s.kind==='drawing'){
    summary.innerHTML=`<strong>粗略画线中</strong><div class="small">${s.message||'拖动后松开即可自动识别锚点。'}</div>`;
    return;
  }
  if(s.kind==='candidate'){
    const c=s.candidates[s.index]||s.candidates[0];
    const conf=Math.round(Number(c.confidence??c.score??0)*100);
    const score=Math.round(Number(c.score??0)*100);
    summary.innerHTML=`<strong>候选 ${s.index+1}/${s.candidates.length} · ${c.anchorType}</strong>
      <div class="small">A：${fmtBJ(c.a.time,true)} @ ${num(c.a.price)}<br>
      B：${fmtBJ(c.b.time,true)} @ ${num(c.b.price)}<br>
      自动校准分 ${score} · 置信度 ${conf}% · 角色 ${c.role==='support'?'支撑':c.role==='resistance'?'阻力':'自动'}<br>
      你只需要确认“是不是你想表达的那条线”。</div>`;
  }
}

function renderTrendInspector(a){
  const badge=$('#trendResearchBadge');
  if(!a){
    badge.textContent='未选择趋势线';badge.className='trendBadge';
    $('#trendMetrics').textContent='选择一根趋势线查看质量、生命周期和事件。';$('#trendEvents').textContent='—';return;
  }
  const d=getDrawings().find(x=>x.id===a.id);
  const causal=d?.causalEligible;
  badge.textContent=d?.researchConfirmed?(causal?'已确认 · 因果可用':'已确认 · 描述用途'):'未纳入研究';
  badge.className='trendBadge '+(d?.researchConfirmed&&causal?'ok':d?.researchConfirmed?'warn':'');
  const fmt=x=>x==null||!Number.isFinite(Number(x))?'—':Number(x).toFixed(2);
  $('#trendMetrics').innerHTML=`<div class="metricGrid">
    <div class="metricCell"><span>质量评分</span><b>${fmt(a.quality)}</b></div>
    <div class="metricCell"><span>生命周期</span><b>${a.lifecycle}</b></div>
    <div class="metricCell"><span>当前距离</span><b>${fmt(a.distanceAtr)} ATR</b></div>
    <div class="metricCell"><span>当前趋势线价</span><b>${num(a.currentLinePrice)}</b></div>
    <div class="metricCell"><span>触碰次数</span><b>${a.touchCount}</b></div>
    <div class="metricCell"><span>实体突破</span><b>${a.bodyBreakCount}</b></div>
    <div class="metricCell"><span>Wick穿透</span><b>${a.wickBreakCount}</b></div>
    <div class="metricCell"><span>平均反应</span><b>${fmt(a.avgReactionAtr)} ATR</b></div>
    <div class="metricCell"><span>存在时间</span><b>${fmt(a.ageDays)} 天</b></div>
    <div class="metricCell"><span>角色</span><b>${a.role==='support'?'支撑':'阻力'}</b></div>
    <div class="metricCell"><span>区域宽度</span><b>${fmt(a.zoneAtr)} ATR</b></div>
    <div class="metricCell"><span>锚点贴合</span><b>${fmt(a.anchorFit*100)}</b></div>
  </div>`;
  $('#trendEvents').innerHTML=a.events.length?a.events.slice(-12).reverse().map(e=>{
    const c=['BODY_BREAK','ACCEPTANCE','FAILED_RETEST'].includes(e.name)?'break':['REJECTION','RECLAIM','FALSE_BREAK'].includes(e.name)?'good':'';
    return `<span class="eventChip ${c}" title="${fmtBJ(e.time,true)}">${e.name}</span>`;
  }).join(''):'暂无事件';
}
async function refreshTrendInspector(d){
  if(!d||d.type!=='trend'){renderTrendInspector(null);return}
  try{
    let rows=[];
    if(d.timeframe===currentTF)rows=baseWindowRows.length?baseWindowRows:currentRows;
    else{
      const all=indexData?.timeframes?.[d.timeframe]||[];
      const from=Math.min(d.a.time,d.b.time),to=currentRows.at(-1)?.[0]??from;
      const months=all.filter(m=>{
        const [y,mo]=m.split('-').map(Number),a=Date.UTC(y,mo-1,1)/1000,b=Date.UTC(y+(mo===12),mo===12?0:mo,1)/1000;
        return b>from&&a<=to;
      });
      rows=months.length?await loadMonths(d.timeframe,months):[];
    }
    renderTrendInspector(analyzeTrendline(d,rows,d.timeframe,null));
  }catch(e){$('#trendMetrics').textContent='趋势线分析失败：'+e.message}
}

function humanMarkers(){
  const map={'2':['arrowUp','#ef5350','强多'],'1':['arrowUp','#f28a87','偏多'],'0':['circle','#9aa9b7','观望'],'-1':['arrowDown','#69bdb4','偏空'],'-2':['arrowDown','#26a69a','强空']};
  return getLabels().filter(x=>x.timeframe===currentTF).map(x=>{const [shape,color,text]=map[x.label];return{time:x.time,position:x.label>0?'belowBar':x.label<0?'aboveBar':'inBar',shape,color,text:`${text} ${x.confidence}`}})
}
function renderHumanMarkers(){
  if(markerApi)markerApi.setMarkers([...humanMarkers(),...entryCandidateMarkers].sort((a,b)=>a.time-b.time));
}
function setEntryCandidateMarkers(v){entryCandidateMarkers=(v||[]).slice();renderHumanMarkers()}

function showRowsForResearch(rows,ctxRows){
  currentRows=rows.slice();
  buildMainChart();
  candle.setData(toCandleRows(currentRows));volume.setData(toVolumeRows(currentRows));rebuildMap();
  chart.timeScale().fitContent();renderDrawings();renderHumanMarkers();
  setContextData({rows:(ctxRows||[]).slice()});
}

async function loadWindow(from,to,label){
  const months=monthsCovering(from,to);if(!months.length){$('#dataStatus').textContent=' · 所选日期暂无云端数据';return}
  $('#dataStatus').textContent=` · 正在加载 ${months.length} 个分片…`;
  loadedRows=await loadMonths(currentTF,months);currentRows=loadedRows.filter(r=>r[0]>=from&&r[0]<to);
  if(!currentRows.length){$('#dataStatus').textContent=' · 范围内无K线';return}
  baseWindowRows=currentRows.slice();
  try{const cx=await loadContexts(months);fullContextRows=(cx.rows||[]).slice()}catch(e){console.warn(e);fullContextRows=[]}
  showRowsForResearch(baseWindowRows,fullContextRows);
  researchDataChanged();
  if(structureEntryLab)structureEntryLab.dataChanged();
  $('#customStart').value=ymdBJ(currentRows[0][0]);$('#customEnd').value=ymdBJ(currentRows.at(-1)[0]);
  $('#rangeHint').textContent=`${label} · ${fmtBJ(currentRows[0][0])} → ${fmtBJ(currentRows.at(-1)[0])} · ${months.length}个月分片`;
  $('#dataStatus').textContent=` · ${currentRows.length.toLocaleString()} 根K线`;
}
async function loadQuickRange(){
  const months=availableMonths(currentTF);if(!months.length){buildMainChart();$('#dataStatus').textContent=' · 尚无数据';return}
  const lastMonth=months.at(-1),[y,m]=lastMonth.split('-').map(Number),end=Date.UTC(y+(m===12),m===12?0:m,1)/1000;
  const from=rangeStart(end,currentRangeKey);await loadWindow(from,end,currentRangeKey==='ALL'?'全部':currentRangeKey);
}
function jumpMonth(m){
  if(!m||!chart)return;const [y,mo]=m.split('-').map(Number),from=Date.UTC(y,mo-1,1)/1000,to=Date.UTC(y+(mo===12),mo===12?0:mo,1)/1000;
  chart.timeScale().setVisibleRange({from,to});
}
function saveHumanLabel(){
  if(!selectedPoint){alert('先在K线上点击一个位置。');return}const pending=Number(document.body.dataset.pendingLabel||999);if(pending===999){alert('先选择人工判断。');return}
  addLabel({id:crypto.randomUUID(),symbol:'BTCUSDT',market:'Binance USD-M Perpetual',timeframe:currentTF,time:selectedPoint.time,beijing_time:fmtBJ(selectedPoint.time,true),price:selectedPoint.price,label:pending,confidence:Number($('#confidence').value),note:$('#labelNote').value.trim(),created_at_utc:new Date().toISOString()});
  $('#labelNote').value='';delete document.body.dataset.pendingLabel;renderHumanMarkers();renderLabelsTable();
}
function bindSliders(){
  [['wTrend','vTrend'],['wBreakout','vBreakout'],['wVolume','vVolume'],['scoreThreshold','vThreshold']].forEach(([a,b])=>{const el=$('#'+a),o=$('#'+b),f=()=>o.textContent=Number(el.value).toFixed(a==='scoreThreshold'?2:1);el.addEventListener('input',f);f()})
}
function runPreview(){
  if(!currentRows.length)return;const p={wTrend:+$('#wTrend').value,wBreakout:+$('#wBreakout').value,wVolume:+$('#wVolume').value},scores=scoreBars(currentRows,p),th=+$('#scoreThreshold').value,r=previewTrades(scores,th,6);
  previewMarkerApi.setMarkers(r.events.map(e=>({time:e.time,position:e.side.includes('LONG')?(e.side.startsWith('OPEN')?'belowBar':'aboveBar'):(e.side.startsWith('OPEN')?'aboveBar':'belowBar'),shape:e.side.startsWith('OPEN')?(e.side.endsWith('LONG')?'arrowUp':'arrowDown'):'circle',color:e.side.includes('LONG')?'#ef5350':'#26a69a',text:e.side.replace('_',' ')})));
  $('#strategyResult').innerHTML=`当前加载窗口预览：开启交易 ${r.trades} 次；简化价格+6bps/side收益 <b class="${r.totalReturn>=0?'positive':'negative'}">${(r.totalReturn*100).toFixed(2)}%</b>。<br>这仍是草稿，不代表正式 Alpha。`;
}
function switchMode(mode){
  $$('.mode').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  const editorMode=mode==='editor'||mode==='research';
  $('#editorView').classList.toggle('hidden',!editorMode);$('#overviewView').classList.toggle('hidden',mode!=='overview');$('#labelsView').classList.toggle('hidden',mode!=='labels');
  if(mode==='overview')renderOverview();if(mode==='labels')renderLabelsTable();
  if(mode==='research')setTimeout(()=>$('#researchPanel')?.scrollIntoView({behavior:'smooth',block:'start'}),60);
}
async function miniChart(tf,container,month){
  if(!availableMonths(tf).includes(month)){container.innerHTML=`<div class="miniTitle">${TF_LABEL[tf]} · 无数据</div>`;return}
  const rows=await loadMonths(tf,[month]),c=createChart(container,chartOptions()),s=c.addSeries(CandlestickSeries,candleOptions());s.setData(toCandleRows(rows));c.timeScale().fitContent();overviewCharts.push(c)
}
async function renderOverview(){
  overviewCharts.splice(0).forEach(c=>c.remove());const grid=$('#overviewGrid');grid.innerHTML='';const month=$('#overviewMonth').value;
  for(const tf of ['8h','4h','1h','15m','5m','1m']){const box=document.createElement('div');box.className='panel miniPanel';box.innerHTML=`<div class="miniTitle">${TF_LABEL[tf]}</div><div class="miniChart"></div>`;grid.appendChild(box);miniChart(tf,box.querySelector('.miniChart'),month).catch(e=>box.querySelector('.miniChart').innerHTML=`<div class="miniTitle">加载失败 ${e.message}</div>`)}
}
function renderLabelsTable(){
  const v=getLabels().sort((a,b)=>b.time-a.time),map={2:'强烈做多',1:'偏多',0:'不交易','-1':'偏空','-2':'强烈做空'};
  $('#labelStats').textContent=`累计 ${v.length} 个判断标签。`;$('#labelsTable').innerHTML='<thead><tr><th>北京时间</th><th>周期</th><th>判断</th><th>置信度</th><th>价格</th><th>备注</th></tr></thead><tbody>'+v.map(x=>`<tr><td>${x.beijing_time}</td><td>${TF_LABEL[x.timeframe]}</td><td>${map[x.label]}</td><td>${x.confidence}</td><td>${num(x.price)}</td><td>${x.note||''}</td></tr>`).join('')+'</tbody>'
}
async function init(){
  indexData=await (await import('./data.js')).loadIndex();currentRangeKey=TF_DEFAULT[currentTF];fillMonthJump();renderRangeButtons();bindSliders();

  drawingEngine=createTrendDrawingEngine({
    container:()=>$('#chart'),
    chart:()=>chart,
    candle:()=>candle,
    rows:()=>currentRows,
    timeframe:()=>currentTF,
    calibrationMode:()=>$('#trendCalibrationMode').value,
    trendMode:()=>$('#trendMode').value,
    replayState:()=>researchReplayState,
    onState:renderCalibrationState,
    onCommit:(d)=>{
      addDrawing(d);
      setTool('select');
      selectDrawing(d.id);
      $('#drawingInfo').innerHTML=`趋势线已自动校准。<br>原始粗略线已保存在 rawA/rawB；正式锚点 A/B 已识别。`;
    }
  });

  $('#timeframe').onchange=async()=>{
    currentTF=$('#timeframe').value;currentRangeKey=TF_DEFAULT[currentTF];selectedDrawingId=null;fillMonthJump();renderRangeButtons();
    const sc=structureEntryLab?.case?.();
    if(sc?.zone){
      const span=Math.max(3600,Number(sc.zone.end)-Number(sc.zone.start));
      const minPad=currentTF==='8h'?7*86400:currentTF==='4h'?4*86400:currentTF==='1h'?2*86400:86400;
      const pad=Math.max(minPad,span*.45);
      await loadWindow(Number(sc.zone.start)-pad,Number(sc.zone.end)+pad,`Structure Case ${sc.id}`);
    }else{
      await loadQuickRange();
    }
  };
  $('#applyCustomRange').onclick=async()=>{const a=$('#customStart').value,b=$('#customEnd').value;if(!a||!b)return;await loadWindow(bjStart(a),bjEnd(b),'自定义')};
  $('#monthJump').onchange=()=>jumpMonth($('#monthJump').value);
  $('#overviewMonth').onchange=renderOverview;
  $('#toolSelect').onclick=()=>setTool('select');$('#toolTrend').onclick=()=>setTool('trend');$('#toolHorizontal').onclick=()=>setTool('horizontal');
  $('#acceptCalibratedLine').onclick=()=>drawingEngine?.accept();
  $('#nextCalibrationCandidate').onclick=()=>drawingEngine?.nextCandidate();
  $('#useRawTrendline').onclick=()=>drawingEngine?.useRaw();
  $('#cancelTrendDrawing').onclick=()=>{drawingEngine?.cancel();setTool('select')};

  $('#undoDrawing').onclick=()=>{undoDrawing(currentTF);selectedDrawingId=null;renderDrawings()};
  $('#clearDrawings').onclick=()=>{if(confirm('清空当前周期全部图形？')){clearDrawings(currentTF);selectedDrawingId=null;renderDrawings()}};
  $('#resetAnchorA').onclick=()=>{if(selectedDrawingId){reanchor='a';setTool('select');$('#drawingInfo').textContent='请在K线上点击新的锚点 A。'}};
  $('#resetAnchorB').onclick=()=>{if(selectedDrawingId){reanchor='b';setTool('select');$('#drawingInfo').textContent='请在K线上点击新的锚点 B。'}};
  $('#deleteSelected').onclick=()=>{if(selectedDrawingId){removeDrawing(selectedDrawingId);selectedDrawingId=null;renderDrawings();selectDrawing(null)}};

  $('#showHigherTfTrendlines').onchange=()=>renderDrawings();
  window.addEventListener('palab:replay-state',e=>{researchReplayState={...researchReplayState,...(e.detail||{})}});
  window.addEventListener('keydown',e=>{
    const tag=(document.activeElement?.tagName||'').toLowerCase();
    if(['input','textarea','select'].includes(tag))return;
    if(e.key==='Escape'&&drawingEngine?.isActive()){e.preventDefault();drawingEngine.cancel();setTool('select');return}
    if(e.key==='Enter'&&drawingEngine?.getState()?.kind==='candidate'){e.preventDefault();drawingEngine.accept();return}
    if((e.key==='n'||e.key==='N')&&drawingEngine?.getState()?.kind==='candidate'){e.preventDefault();drawingEngine.nextCandidate();return}
    if(e.key==='Delete'&&selectedDrawingId){e.preventDefault();removeDrawing(selectedDrawingId);selectedDrawingId=null;renderDrawings();selectDrawing(null);return}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undoDrawing(currentTF);selectedDrawingId=null;renderDrawings()}
  });


  $('#confidence').oninput=()=>$('#confidenceText').textContent=$('#confidence').value;
  $$('.labelGrid button').forEach(b=>b.onclick=()=>{document.body.dataset.pendingLabel=b.dataset.label;$$('.labelGrid button').forEach(x=>x.classList.remove('active'));b.classList.add('active')});
  $('#saveLabel').onclick=saveHumanLabel;$('#runPreview').onclick=runPreview;
  $('#exportLabels').onclick=()=>downloadJson('price_action_human_labels.json',getLabels());$('#exportDrawings').onclick=()=>downloadJson('price_action_drawings.json',getDrawings());
  $$('.mode').forEach(b=>b.onclick=()=>switchMode(b.dataset.mode));
  initResearchUI({
    indexData:()=>indexData,
    currentTF:()=>currentTF,
    baseRows:()=>baseWindowRows,
    fullContextRows:()=>fullContextRows,
    selectedPoint:()=>selectedPoint,
    showReplayRows:(rows,ctx)=>showRowsForResearch(rows,ctx),
    fmtBJ
  });
  structureEntryLab=initStructureCaseLab({
    indexData:()=>indexData,
    currentTF:()=>currentTF,
    selectedDrawing:()=>getDrawings().find(x=>x.id===selectedDrawingId)||null,
    chart:()=>chart,
    chartContainer:()=>$('#chart'),
    chartWrap:()=>$('#chartWrap'),
    setEntryMarkers:setEntryCandidateMarkers
  });
  await loadQuickRange();renderLabelsTable();
}
init().catch(e=>{document.body.innerHTML=`<pre style="color:white;padding:20px">启动失败：${e.stack||e}</pre>`});
