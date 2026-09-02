
import {LineSeries,createSeriesMarkers} from 'lightweight-charts';
import {calibrateTrendline} from './trendline_calibration.js';
import {newTrendStyle} from './drawing_style.js';

export function createTrendDrawingEngine(api){
  let active=false,drawing=false,rawA=null,rawB=null,state=null,preview=null,previewMarkers=null;
  const container=api.container();

  function pointFromEvent(ev){
    const chart=api.chart(),candle=api.candle();if(!chart||!candle)return null;
    const rect=container.getBoundingClientRect(),x=ev.clientX-rect.left,y=ev.clientY-rect.top;
    const time=chart.timeScale().coordinateToTime(x),price=candle.coordinateToPrice(y);
    if(time==null||price==null||!Number.isFinite(Number(price)))return null;
    return {time:Number(time),price:Number(price)};
  }
  function removePreview(){
    const chart=api.chart();
    if(preview&&chart){try{chart.removeSeries(preview)}catch{}}
    preview=null;previewMarkers=null;
  }
  function ensurePreview(){
    const chart=api.chart();if(!chart)return null;
    if(!preview){
      preview=chart.addSeries(LineSeries,{color:'#9ed2ff',lineWidth:2,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
    }
    return preview;
  }
  function renderLine(a,b,candidate=false){
    if(!a||!b||a.time===b.time)return;
    const s=ensurePreview();if(!s)return;
    let A=a,B=b;if(A.time>B.time)[A,B]=[B,A];
    s.applyOptions({color:candidate?'#ffd166':'#9ed2ff',lineWidth:candidate?3:2,lineStyle:candidate?0:2});
    s.setData([{time:A.time,value:A.price},{time:B.time,value:B.price}]);
    previewMarkers=createSeriesMarkers(s,[
      {time:A.time,position:'inBar',shape:'circle',color:'#ffffff',text:'A'},
      {time:B.time,position:'inBar',shape:'circle',color:candidate?'#ffd166':'#ffffff',text:'B'}
    ]);
  }
  function publish(kind,extra={}){
    state={kind,rawA,rawB,...extra};api.onState?.(state);
  }
  function stopEvent(ev){
    ev.preventDefault();ev.stopPropagation();
    if(ev.stopImmediatePropagation)ev.stopImmediatePropagation();
  }
  function onDown(ev){
    if(!active||ev.button!==0)return;
    const p=pointFromEvent(ev);if(!p)return;
    stopEvent(ev);drawing=true;rawA=p;rawB=p;state=null;
    try{container.setPointerCapture(ev.pointerId)}catch{}
    renderLine(rawA,rawB,false);publish('drawing',{message:'已锁定粗略起点 A，拖到大概的第二个位置后松开。'});
  }
  function onMove(ev){
    if(!active||!drawing)return;
    const p=pointFromEvent(ev);if(!p)return;
    stopEvent(ev);rawB=p;renderLine(rawA,rawB,false);
    publish('drawing',{message:'无需点准真实高低点；松开鼠标后自动识别结构锚点。'});
  }
  function onUp(ev){
    if(!active||!drawing)return;
    const p=pointFromEvent(ev);if(p)rawB=p;
    stopEvent(ev);drawing=false;
    try{container.releasePointerCapture(ev.pointerId)}catch{}
    if(!rawA||!rawB||rawA.time===rawB.time){cancel();return}
    const result=calibrateTrendline(rawA,rawB,api.rows(),api.timeframe(),api.calibrationMode());
    state={kind:'candidate',...result,index:result.recommended||0};
    renderCandidate();api.onState?.(state);
  }
  function renderCandidate(){
    if(!state||state.kind!=='candidate')return;
    const c=state.candidates[state.index]||state.candidates[0];
    renderLine(c.a,c.b,true);
  }
  function nextCandidate(){
    if(!state||state.kind!=='candidate')return;
    state.index=(state.index+1)%state.candidates.length;renderCandidate();api.onState?.(state);
  }
  function useRaw(){
    if(!state||state.kind!=='candidate')return;
    const raw={a:{...state.rawA},b:{...state.rawB},anchorType:'自由',role:'auto',score:1,confidence:1,rank:0};
    state={...state,candidates:[raw,...state.candidates],index:0,mode:'free_override'};
    renderCandidate();api.onState?.(state);
  }
  function accept(){
    if(!state||state.kind!=='candidate')return null;
    const c=state.candidates[state.index];if(!c)return null;
    const replay=api.replayState();
    const causal=!!(replay.active&&!replay.futureRevealed);
    const drawingObj={
      id:crypto.randomUUID(),type:'trend',timeframe:api.timeframe(),
      a:{...c.a},b:{...c.b},rawA:{...state.rawA},rawB:{...state.rawB},
      mode:api.trendMode(),role:c.role||'auto',zoneAtr:.25,style:newTrendStyle(),
      calibration:{
        method:state.mode,anchorType:c.anchorType,score:c.score,confidence:c.confidence,
        rank:state.index+1,candidateCount:state.candidates.length,
        endpointFit:c.endpointFit??null,geometryFit:c.geometryFit??null,
        touchScore:c.touchScore??null,penetration:c.penetration??null
      },
      researchConfirmed:false,causalEligible:causal,
      validFrom:causal?replay.decisionTime:null,
      origin:causal?'blind_replay_auto_calibrated':'manual_auto_calibrated',
      createdAt:new Date().toISOString()
    };
    removePreview();state=null;rawA=null;rawB=null;api.onCommit?.(drawingObj);
    return drawingObj;
  }
  function cancel(){
    drawing=false;rawA=null;rawB=null;state=null;removePreview();api.onState?.({kind:'idle'});
  }
  function setActive(v){
    active=!!v;container.classList.toggle('trendDrawActive',active);
    if(!active)cancel();
  }

  // Capture phase: this prevents Lightweight Charts from stealing the second anchor.
  container.addEventListener('pointerdown',onDown,true);
  window.addEventListener('pointermove',onMove,true);
  window.addEventListener('pointerup',onUp,true);
  window.addEventListener('pointercancel',onUp,true);

  return {setActive,cancel,nextCandidate,useRaw,accept,getState:()=>state,isActive:()=>active};
}
