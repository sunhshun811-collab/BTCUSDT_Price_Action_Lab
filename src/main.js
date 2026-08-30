
import './style.css';
import {createChart,CandlestickSeries,HistogramSeries,LineSeries,createSeriesMarkers,CrosshairMode} from 'lightweight-charts';
import {loadIndex,loadMonths,toCandleRows,toVolumeRows,loadContext} from './data.js';
import {setContextData,renderContextAt} from './context.js';
import {getDrawings,addDrawing,drawingsFor,undoDrawing,clearDrawings,getLabels,addLabel,downloadJson} from './annotations.js';
import {scoreBars,previewTrades} from './strategy.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const TF_LABEL={ '8h':'8小时','4h':'4小时','1h':'1小时','15m':'15分钟','5m':'5分钟','1m':'1分钟' };
const BJ='Asia/Shanghai';
const fmtBJ=(sec,withSeconds=false)=>new Intl.DateTimeFormat('zh-CN',{timeZone:BJ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:withSeconds?'2-digit':undefined,hour12:false}).format(new Date(sec*1000));
const tickBJ=sec=>new Intl.DateTimeFormat('zh-CN',{timeZone:BJ,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(sec*1000));
const colors=['#45a3ff','#e7bf55','#b67cff','#38d69b','#ff7d86','#7bb1e8'];

let indexData, chart, candle, volume, markerApi, currentRows=[], currentTF='8h', currentMonth='', tool='select', firstAnchor=null, selected=null, lineSeries=[], priceLines=[], previewMarkerApi=null;
const overviewCharts=[];

function chartOptions(){
  return {
    autoSize:true,
    layout:{background:{color:'#09121c'},textColor:'#91a5b9',attributionLogo:true},
    grid:{vertLines:{color:'#182635'},horzLines:{color:'#182635'}},
    rightPriceScale:{borderColor:'#294058'},
    timeScale:{borderColor:'#294058',timeVisible:true,secondsVisible:false,tickMarkFormatter:t=>tickBJ(Number(t))},
    localization:{timeFormatter:t=>fmtBJ(Number(t),false),priceFormatter:p=>Number(p).toLocaleString('en-US',{maximumFractionDigits:2})},
    crosshair:{mode:CrosshairMode.Normal}
  };
}
function destroyMain(){
  lineSeries=[];priceLines=[];
  if(chart){chart.remove();chart=null}
}
function buildMainChart(){
  destroyMain();
  chart=createChart($('#chart'),chartOptions());
  candle=chart.addSeries(CandlestickSeries,{upColor:'#2fd18b',downColor:'#ff6470',borderVisible:false,wickUpColor:'#2fd18b',wickDownColor:'#ff6470'});
  volume=chart.addSeries(HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:''});
  volume.priceScale().applyOptions({scaleMargins:{top:.82,bottom:0}});
  markerApi=createSeriesMarkers(candle,[]);
  previewMarkerApi=createSeriesMarkers(candle,[]);
  chart.subscribeCrosshairMove(param=>{
    if(!param.point||!param.time)return;
    const d=param.seriesData.get(candle);
    if(!d)return;
    $('#cursorInfo').innerHTML=`北京时间：${fmtBJ(Number(param.time),true)}<br>O ${num(d.open)} · H ${num(d.high)} · L ${num(d.low)} · C ${num(d.close)}`;
    renderContextAt(Number(param.time));
  });
  chart.subscribeClick(handleChartClick);
}
function num(x){return Number(x).toLocaleString('en-US',{maximumFractionDigits:2})}
function availableMonths(tf){return indexData?.timeframes?.[tf]||[]}
function fillMonths(){
  const months=availableMonths(currentTF);
  $('#month').innerHTML=months.map(m=>`<option>${m}</option>`).join('');
  currentMonth=months.at(-1)||'';
  if(currentMonth)$('#month').value=currentMonth;
  const allMonths=[...new Set(Object.values(indexData.timeframes||{}).flat())].sort();
  $('#overviewMonth').innerHTML=allMonths.map(m=>`<option>${m}</option>`).join('');
  if(allMonths.length)$('#overviewMonth').value=allMonths.at(-1);
}
async function loadMain(){
  currentTF=$('#timeframe').value;
  const months=availableMonths(currentTF);
  $('#chartTitle').textContent=`BTCUSDT 永续 · ${TF_LABEL[currentTF]}`;
  if(!months.length){
    currentRows=[];buildMainChart();$('#dataStatus').textContent=' · 尚未同步该周期数据';return;
  }
  let chosen=$('#rangeMode').value==='all'?months:[currentMonth&&months.includes(currentMonth)?currentMonth:months.at(-1)];
  $('#dataStatus').textContent=' · 正在加载…';
  try{
    currentRows=await loadMonths(currentTF,chosen);
    buildMainChart();
    candle.setData(toCandleRows(currentRows));volume.setData(toVolumeRows(currentRows));
    chart.timeScale().fitContent();renderDrawings();renderHumanMarkers();
    const ctxMonth = currentMonth || chosen.at(-1);
    try { setContextData(await loadContext(ctxMonth)); } catch(e) { console.warn('context load',e); }
    $('#dataStatus').textContent=` · ${currentRows.length.toLocaleString()} 根K线`;
  }catch(e){$('#dataStatus').textContent=` · 加载失败：${e.message}`;}
}
function setTool(name){
  tool=name;firstAnchor=null;
  $$('.tool').forEach(b=>b.classList.remove('active'));
  const map={select:'#toolSelect',trend:'#toolTrend',horizontal:'#toolHorizontal'};
  if(map[name])$(map[name]).classList.add('active');
}
function handleChartClick(param){
  if(!param.point||!param.time)return;
  const price=Number(candle.coordinateToPrice(param.point.y)); if(!Number.isFinite(price))return;
  selected={time:Number(param.time),price};
  if(tool==='trend'){
    if(!firstAnchor){firstAnchor={time:selected.time,price};$('#cursorInfo').innerHTML=`趋势线第1锚点：${fmtBJ(selected.time)} @ ${num(price)}<br>再点击第2个锚点。`;return}
    if(firstAnchor.time===selected.time)return;
    const [a,b]=firstAnchor.time<selected.time?[firstAnchor,selected]:[selected,firstAnchor];
    addDrawing({id:crypto.randomUUID(),type:'trend',timeframe:currentTF,a,b,extend:$('#extendRay').checked,createdAt:new Date().toISOString()});
    firstAnchor=null;renderDrawings();return;
  }
  if(tool==='horizontal'){
    addDrawing({id:crypto.randomUUID(),type:'horizontal',timeframe:currentTF,price,createdAt:new Date().toISOString()});
    renderDrawings();return;
  }
}
function renderDrawings(){
  lineSeries.forEach(s=>chart.removeSeries(s));lineSeries=[];
  priceLines.forEach(p=>candle.removePriceLine(p));priceLines=[];
  const lastT=currentRows.at(-1)?.[0];
  for(const d of drawingsFor(currentTF)){
    if(d.type==='horizontal'){
      priceLines.push(candle.createPriceLine({price:d.price,color:'#e7bf55',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:'关键位'}));
    }else if(d.type==='trend'){
      const s=chart.addSeries(LineSeries,{color:'#55a7ff',lineWidth:2,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
      const pts=[{time:d.a.time,value:d.a.price},{time:d.b.time,value:d.b.price}];
      if(d.extend&&lastT&&lastT>d.b.time){
        const slope=(d.b.price-d.a.price)/(d.b.time-d.a.time);
        pts.push({time:lastT,value:d.b.price+slope*(lastT-d.b.time)});
      }
      s.setData(pts);lineSeries.push(s);
    }
  }
}
function humanMarkers(){
  const labelMap={'2':['arrowUp','#2fd18b','强多'],'1':['arrowUp','#81d8ad','偏多'],'0':['circle','#9aa9b7','观望'],'-1':['arrowDown','#e7a0a6','偏空'],'-2':['arrowDown','#ff6470','强空']};
  return getLabels().filter(x=>x.timeframe===currentTF).map(x=>{const [shape,color,text]=labelMap[x.label];return{time:x.time,position:x.label>0?'belowBar':x.label<0?'aboveBar':'inBar',shape,color,text:`${text} ${x.confidence}`}})
}
function renderHumanMarkers(){ if(markerApi)markerApi.setMarkers(humanMarkers().sort((a,b)=>a.time-b.time));}
function saveHumanLabel(){
  if(!selected){alert('先在K线上点击一个位置。');return}
  const pending=Number(document.body.dataset.pendingLabel||'999');if(pending===999){alert('先选择“强烈做多 / 偏多 / 不交易 / 偏空 / 强烈做空”。');return}
  addLabel({id:crypto.randomUUID(),symbol:'BTCUSDT',market:'Binance USD-M Perpetual',timeframe:currentTF,time:selected.time,beijing_time:fmtBJ(selected.time,true),price:selected.price,label:pending,confidence:Number($('#confidence').value),note:$('#labelNote').value.trim(),created_at_utc:new Date().toISOString()});
  $('#labelNote').value='';delete document.body.dataset.pendingLabel;renderHumanMarkers();renderLabelsTable();
}
function bindSliders(){
  [['wTrend','vTrend'],['wBreakout','vBreakout'],['wVolume','vVolume'],['scoreThreshold','vThreshold']].forEach(([a,b])=>{
    const el=$('#'+a),out=$('#'+b);const f=()=>out.textContent=Number(el.value).toFixed(a==='scoreThreshold'?2:1);el.addEventListener('input',f);f();
  });
}
function runPreview(){
  if(!currentRows.length)return;
  const p={wTrend:+$('#wTrend').value,wBreakout:+$('#wBreakout').value,wVolume:+$('#wVolume').value};
  const scores=scoreBars(currentRows,p),threshold=+$('#scoreThreshold').value,r=previewTrades(scores,threshold,6);
  const marks=r.events.map(e=>({time:e.time,position:e.side.includes('LONG')?(e.side.startsWith('OPEN')?'belowBar':'aboveBar'):(e.side.startsWith('OPEN')?'aboveBar':'belowBar'),shape:e.side.startsWith('OPEN')?(e.side.endsWith('LONG')?'arrowUp':'arrowDown'):'circle',color:e.side.includes('LONG')?'#2fd18b':'#ff6470',text:e.side.replace('_',' ')}));
  previewMarkerApi.setMarkers(marks);
  $('#strategyResult').innerHTML=`当前可视区数据预览：交易开启 ${r.trades} 次；价格+6bps/side简化预览收益 <b class="${r.totalReturn>=0?'positive':'negative'}">${(r.totalReturn*100).toFixed(2)}%</b>。<br>这是探索工具：尚未加入正式 Train/Validation、Funding、10x MAE、Beta 和防过拟合检验，不能作为实盘结论。`;
}
function switchMode(mode){
  $$('.mode').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  $('#editorView').classList.toggle('hidden',mode!=='editor');$('#overviewView').classList.toggle('hidden',mode!=='overview');$('#labelsView').classList.toggle('hidden',mode!=='labels');
  if(mode==='overview')renderOverview();if(mode==='labels')renderLabelsTable();
}
async function miniChart(tf,container,month){
  const months=availableMonths(tf);if(!months.includes(month)){container.innerHTML=`<div class="miniTitle">${TF_LABEL[tf]} · 无数据</div>`;return}
  const rows=await loadMonths(tf,[month]);const c=createChart(container,chartOptions());const s=c.addSeries(CandlestickSeries,{upColor:'#2fd18b',downColor:'#ff6470',borderVisible:false,wickUpColor:'#2fd18b',wickDownColor:'#ff6470'});s.setData(toCandleRows(rows));c.timeScale().fitContent();overviewCharts.push(c);
}
async function renderOverview(){
  overviewCharts.splice(0).forEach(c=>c.remove());
  const grid=$('#overviewGrid');grid.innerHTML='';const month=$('#overviewMonth').value;
  for(const tf of ['8h','4h','1h','15m','5m','1m']){
    const box=document.createElement('div');box.className='panel miniPanel';box.innerHTML=`<div class="miniTitle">${TF_LABEL[tf]}</div><div class="miniChart"></div>`;grid.appendChild(box);
    miniChart(tf,box.querySelector('.miniChart'),month).catch(e=>box.querySelector('.miniChart').innerHTML=`<div class="miniTitle">加载失败 ${e.message}</div>`);
  }
}
function renderLabelsTable(){
  const v=getLabels().sort((a,b)=>b.time-a.time),map={2:'强烈做多',1:'偏多',0:'不交易','-1':'偏空','-2':'强烈做空'};
  $('#labelStats').textContent=`累计 ${v.length} 个判断标签。`;
  $('#labelsTable').innerHTML='<thead><tr><th>北京时间</th><th>周期</th><th>判断</th><th>置信度</th><th>价格</th><th>备注</th></tr></thead><tbody>'+v.map(x=>`<tr><td>${x.beijing_time}</td><td>${TF_LABEL[x.timeframe]}</td><td>${map[x.label]}</td><td>${x.confidence}</td><td>${num(x.price)}</td><td>${x.note||''}</td></tr>`).join('')+'</tbody>';
}
async function init(){
  indexData=await loadIndex();fillMonths();buildMainChart();bindSliders();
  $('#timeframe').addEventListener('change',()=>{currentTF=$('#timeframe').value;fillMonths();$('#rangeMode').value=['8h','4h','1h'].includes(currentTF)?'all':'month';loadMain()});
  $('#rangeMode').addEventListener('change',loadMain);$('#month').addEventListener('change',()=>{currentMonth=$('#month').value;loadMain()});
  $('#overviewMonth').addEventListener('change',renderOverview);
  $('#toolSelect').onclick=()=>setTool('select');$('#toolTrend').onclick=()=>setTool('trend');$('#toolHorizontal').onclick=()=>setTool('horizontal');
  $('#undoDrawing').onclick=()=>{undoDrawing(currentTF);renderDrawings()};$('#clearDrawings').onclick=()=>{if(confirm('清空当前周期全部画线？')){clearDrawings(currentTF);renderDrawings()}};
  $('#confidence').oninput=()=>$('#confidenceText').textContent=$('#confidence').value;
  $$('.labelGrid button').forEach(b=>b.onclick=()=>{document.body.dataset.pendingLabel=b.dataset.label;$$('.labelGrid button').forEach(x=>x.classList.remove('active'));b.classList.add('active')});
  $('#saveLabel').onclick=saveHumanLabel;$('#runPreview').onclick=runPreview;
  $('#exportLabels').onclick=()=>downloadJson('price_action_human_labels.json',getLabels());
  $('#exportDrawings').onclick=()=>downloadJson('price_action_drawings.json',getDrawings());
  $$('.mode').forEach(b=>b.onclick=()=>switchMode(b.dataset.mode));
  await loadMain();renderLabelsTable();
}
init().catch(e=>{document.body.innerHTML=`<pre style="color:white;padding:20px">启动失败：${e.stack||e}</pre>`});
