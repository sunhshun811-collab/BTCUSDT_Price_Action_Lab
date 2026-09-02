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
    const raw={time:Number(time),price:Number(price)};
    return api.snapPoint?.(raw.time,raw.price,y,{invert:!!ev.ctrlKey})||raw;
  }
  function removePreview(){
    const chart=api.chart();
    if(preview&&chart){try{chart.removeSeries(preview)}catch{}}
    preview=null;previewMarkers=null;
  }
  function ensurePreview(){
    const chart=api.chart();if(!chart)return null;
    if(!preview)preview=chart.addSeries(LineSeries,{color:'#9ed2ff',lineWidth:2,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
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
  function publish(kind,extra={}){state={kind,rawA,rawB,...extra};api.onState?.(state)}
  function stopEvent(ev){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation?.()}
  function onDown(ev){
    if(!active||ev.button!==0)return;
    const p=pointFromEvent(ev);if(!p)return;
    stopEvent(ev);drawing=true;rawA=p;rawB=p;state=null;
    try{container.setPointerCapture(ev.pointerId)}catch{}
    renderLine(rawA,rawB,false);publish('drawing',{message:'已确定起点，拖到第二个位置后松开即可完成趋势线。'});
  }
  function onMove(ev){
    if(!active||!drawing)return;
    const p=pointFromEvent(ev);if(!p)return;
    stopEvent(ev);rawB=p;renderLine(rawA,rawB,false);
    publish('drawing',{message:'松开鼠标立即成线；智能校准只作为可选建议，不会阻挡画线。'});
  }
  function makeRawDrawing(){
    const replay=api.replayState?.()||{};
    const causal=!!(replay.active&&!replay.futureRevealed);
    return {
      id:crypto.randomUUID(),type:'trend',
      timeframe:api.timeframe(),drawnOnTimeframe:api.timeframe(),
      a:{...rawA},b:{...rawB},rawA:{...rawA},rawB:{...rawB},
      mode:api.trendMode(),style:newTrendStyle(),locked:false,visible:true,
      role:'auto',zoneAtr:.25,geometryRevision:1,styleRevision:1,
      calibration:{method:'manual',anchorType:'手绘',score:null,confidence:null,rank:0,candidateCount:0},
      researchConfirmed:false,causalEligible:causal,validFrom:causal?replay.decisionTime:null,
      origin:causal?'blind_replay_manual':'manual',createdAt:new Date().toISOString()
    };
  }
  function onUp(ev){
    if(!active||!drawing)return;
    const p=pointFromEvent(ev);if(p)rawB=p;
    stopEvent(ev);drawing=false;
    try{container.releasePointerCapture(ev.pointerId)}catch{}
    if(!rawA||!rawB||rawA.time===rawB.time){cancel();return}
    const drawingObj=makeRawDrawing();
    removePreview();
    api.onCommit?.(drawingObj);
    if(api.calibrationMode?.()==='free'){state=null;rawA=null;rawB=null;api.onState?.({kind:'idle'});return}
    try{
      const result=calibrateTrendline(rawA,rawB,api.rows(),api.timeframe(),api.calibrationMode());
      if(result?.candidates?.length){
        state={kind:'suggestion',drawingId:drawingObj.id,...result,index:result.recommended||0,rawA:{...rawA},rawB:{...rawB}};
        renderCandidate();api.onState?.(state);
      }else{state=null;api.onState?.({kind:'idle'})}
    }catch{state=null;api.onState?.({kind:'idle'})}
    rawA=null;rawB=null;
  }
  function renderCandidate(){
    if(!state||state.kind!=='suggestion')return;
    const c=state.candidates[state.index]||state.candidates[0];renderLine(c.a,c.b,true);
  }
  function nextCandidate(){
    if(!state||state.kind!=='suggestion'||!state.candidates?.length)return;
    state.index=(state.index+1)%state.candidates.length;renderCandidate();api.onState?.(state);
  }
  function useRaw(){
    if(!state||state.kind!=='suggestion')return;
    removePreview();state=null;api.onState?.({kind:'idle'});
  }
  function accept(){
    if(!state||state.kind!=='suggestion')return null;
    const c=state.candidates[state.index];if(!c)return null;
    const patch={
      a:{...c.a},b:{...c.b},
      calibration:{
        method:state.mode,anchorType:c.anchorType,score:c.score,confidence:c.confidence,
        rank:state.index+1,candidateCount:state.candidates.length,
        endpointFit:c.endpointFit??null,geometryFit:c.geometryFit??null,
        touchScore:c.touchScore??null,penetration:c.penetration??null
      },
      origin:'manual_with_smart_calibration'
    };
    api.onApplySuggestion?.(state.drawingId,patch);
    const id=state.drawingId;removePreview();state=null;api.onState?.({kind:'idle'});return id;
  }
  function cancel(){
    drawing=false;rawA=null;rawB=null;state=null;removePreview();api.onState?.({kind:'idle'});
  }
  function setActive(v){
    active=!!v;container.classList.toggle('trendDrawActive',active);
    if(!active&&drawing)cancel();
  }
  container.addEventListener('pointerdown',onDown,true);
  window.addEventListener('pointermove',onMove,true);
  window.addEventListener('pointerup',onUp,true);
  window.addEventListener('pointercancel',onUp,true);
  return {setActive,cancel,nextCandidate,useRaw,accept,getState:()=>state,isActive:()=>active};
}
