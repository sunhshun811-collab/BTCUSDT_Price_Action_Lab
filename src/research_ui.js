
import {loadMonths} from './data.js';
import {
  TF_SECONDS,TF_ORDER,getStrategyVersion,setStrategyVersion,getCases,saveCase,
  computeFeatures,nearestContext,marketStage,setupClarity,similarCases,outcomeFrom1m,makeCaseId
} from './research.js';
import {getDrawings} from './annotations.js';
import {eligibleTrendlineFeatures,trendlineConfluence} from './trendline_research.js';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const LABEL={2:'强烈做多',1:'偏多',0:'不交易','-1':'偏空','-2':'强烈做空'};
const SETUPS={
  reversal_pullback_long:'反转后的第一次回调多',
  trend_continuation_long:'趋势延续回调多',
  breakout_long:'突破接力多',
  false_break_short:'假突破空',
  trend_failure_short:'趋势破坏空',
  top_reversal_short:'顶部反转空',
  no_trade:'观望 / 不交易'
};
const VETOS={
  key_hl_broken:'关键 HL 已失守',
  breakout_failed:'突破后重新回到旧结构',
  oi_short_build:'回调时 OI 上升且主动卖盘增强',
  higher_tf_bear:'高周期仍是明显熊市',
  funding_extreme:'Funding / 拥挤度过热',
  structure_unclear:'结构不够清晰',
  risk_too_large:'预期止损 / MAE 风险过大'
};
const fmtP=x=>x==null?'—':`${(Number(x)*100).toFixed(2)}%`;
const fmtN=(x,d=2)=>x==null||!Number.isFinite(Number(x))?'—':Number(x).toFixed(d);

let api=null,blind=null,lastSnapshot=null,lastOutcome=null;

function monthStr(sec){return new Date(sec*1000).toISOString().slice(0,7)}
function adjacentMonths(all,sec,back=2,forward=1){
  const m=monthStr(sec),i=all.indexOf(m);if(i<0)return all.slice(-Math.min(all.length,back+forward+1));
  return all.slice(Math.max(0,i-back),Math.min(all.length,i+forward+1));
}
async function buildSnapshot(decisionTime){
  const timeframes={};
  for(const tf of TF_ORDER){
    const all=api.indexData().timeframes?.[tf]||[];
    const months=adjacentMonths(all,decisionTime,2,0);
    const rows=months.length?await loadMonths(tf,months):[];
    timeframes[tf]=computeFeatures(rows,tf,decisionTime);
    timeframes[tf].trendlines=eligibleTrendlineFeatures(getDrawings(),rows,tf,decisionTime);
  }
  const context=nearestContext(api.fullContextRows(),decisionTime);
  const snapshot={decisionTime,timeframes,context};
  snapshot.trendlineConfluence=trendlineConfluence(snapshot);
  snapshot.stage=marketStage(snapshot);snapshot.clarity=setupClarity(snapshot);
  return snapshot;
}
function directionValue(){return Number(document.body.dataset.researchDirection||0)}
function selectedSetup(){return $('#setupType').value}
function selectedVetos(){return $$('#vetoChecks input:checked').map(x=>x.value)}
function renderSnapshot(s){
  lastSnapshot=s;
  const stage=Object.entries(s.stage).sort((a,b)=>b[1]-a[1]);
  $('#stageProb').innerHTML=stage.map(([k,v])=>`<div class="probRow"><span>${({bear:'下跌趋势',transition:'转换期',earlyBull:'上涨初期',continuation:'趋势延续',mature:'成熟趋势',exhaustion:'衰竭/反转风险'})[k]}</span><b>${(v*100).toFixed(0)}%</b></div>`).join('');
  $('#clarityScore').innerHTML=`<strong>${s.clarity.toFixed(0)}</strong><span>/100</span>`;
  $('#tfSnapshot').innerHTML=TF_ORDER.map(tf=>{
    const f=s.timeframes[tf];
    if(!f?.available)return `<div class="tfSnap"><b>${tf}</b><span>数据不足</span></div>`;
    const st=f.structure||{};
    const struct=st.hh&&st.hl?'HH+HL':st.lh&&st.ll?'LH+LL':st.hh?'HH':st.hl?'HL':st.lh?'LH':st.ll?'LL':'混合';
    const tl=f.trendlines?.closest;
    const tlText=tl?`TL ${fmtN(tl.distanceAtr,2)} ATR · Q${fmtN(tl.quality,0)}`:'无因果趋势线';
    return `<div class="tfSnap"><b>${tf}</b><span>${struct}</span><em>Trend ${fmtN(f.trendAtr,2)} ATR</em><em>${tlText}</em><em>清晰度 ${fmtN(f.clarity,0)}</em></div>`;
  }).join('');
  const c=s.context||{},tc=s.trendlineConfluence||{};
  $('#snapshotContext').innerHTML=`Funding Z7d ${fmtN(c.funding_z7d)} · Basis Z7d ${fmtN(c.basis_bps_z7d)} · OI 1h ${fmtP(c.oi_change_1h)} · Taker L/S ${fmtN(c.taker_ls_ratio,3)} · 趋势线共振 ${tc.count||0}`;
  renderSimilar();
}
function renderSimilar(){
  if(!lastSnapshot)return;
  const v=similarCases(lastSnapshot,getCases(),8);
  $('#similarCases').innerHTML=v.length?v.map(x=>`<button class="similarCase" data-id="${x.id}"><span>${x.strategyVersion}</span><b>${SETUPS[x.setup]||x.setup}</b><em>相似 ${(x.similarity*100).toFixed(0)}% · ${LABEL[x.direction]}</em></button>`).join(''):'还没有足够的已保存案例。';
  $$('.similarCase').forEach(b=>b.onclick=()=>{const x=getCases().find(c=>c.id===b.dataset.id);if(x)alert(`${SETUPS[x.setup]||x.setup}\n${LABEL[x.direction]}\n${x.note||''}`)});
}
function renderOutcome(o){
  lastOutcome=o;if(!o?.available){$('#outcomeTable').innerHTML='当前数据范围没有足够的 1m 未来路径。';return}
  const names={m5:'5m',m15:'15m',h1:'1h',h4:'4h',h8:'8h',h24:'24h'};
  $('#outcomeTable').innerHTML='<table><thead><tr><th>窗口</th><th>收益</th><th>MFE</th><th>MAE</th><th>10x保证金MAE</th><th>账户MAE≈</th></tr></thead><tbody>'+
  Object.entries(o.horizons).map(([k,x])=>x?`<tr><td>${names[k]}</td><td>${fmtP(x.return)}</td><td>${fmtP(x.mfe)}</td><td>${fmtP(x.mae)}</td><td>${fmtP(x.marginMae10x)}</td><td>${fmtP(x.accountMaeApprox)}</td></tr>`:`<tr><td>${names[k]}</td><td colspan="5">数据不足</td></tr>`).join('')+'</tbody></table>';
}
async function computeOutcome(decisionTime,direction){
  const all=api.indexData().timeframes?.['1m']||[],months=adjacentMonths(all,decisionTime,0,2);
  const rows=months.length?await loadMonths('1m',months):[];
  return outcomeFrom1m(rows,decisionTime,direction||1);
}
function chooseBlindPoint(){
  const rows=api.baseRows(),tf=api.currentTF();if(rows.length<30)return null;
  const sec=TF_SECONDS[tf],lo=Math.max(10,Math.floor(rows.length*.15)),hi=Math.max(lo+1,rows.length-5);
  const i=lo+Math.floor(Math.random()*(hi-lo));return {row:rows[i],decisionTime:rows[i][0]+sec,index:i};
}
async function startBlind(){
  const p=chooseBlindPoint();if(!p){alert('当前窗口K线太少。');return}
  blind={...p,fullRows:api.baseRows().slice(),fullContext:api.fullContextRows().slice()};
  const frozen=blind.fullRows.filter(r=>r[0]<=p.row[0]);
  const frozenCtx=blind.fullContext.filter(x=>x.time<=p.decisionTime);
  api.showReplayRows(frozen,frozenCtx);
  window.dispatchEvent(new CustomEvent('palab:replay-state',{detail:{active:true,decisionTime:p.decisionTime,futureRevealed:false}}));
  $('#blindStatus').textContent=`未来已冻结：决策时点 ${api.fmtBJ(p.decisionTime,true)}`;
  $('#revealFuture').disabled=false;$('#saveResearchCase').disabled=false;
  $('#outcomeTable').innerHTML='未来仍被隐藏。先做判断，再点击“显示未来”。';
  renderSnapshot(await buildSnapshot(p.decisionTime));
}
async function reveal(){
  if(!blind)return;
  api.showReplayRows(blind.fullRows,blind.fullContext);
  window.dispatchEvent(new CustomEvent('palab:replay-state',{detail:{active:true,decisionTime:blind.decisionTime,futureRevealed:true}}));
  const d=directionValue()||1,o=await computeOutcome(blind.decisionTime,d);renderOutcome(o);
  $('#blindStatus').textContent=`未来已显示 · 决策时点 ${api.fmtBJ(blind.decisionTime,true)}`;
}
async function snapshotCurrent(){
  const p=api.selectedPoint();
  if(!p){alert('先在主图点击一个决策位置。');return}
  const decisionTime=p.time+TF_SECONDS[api.currentTF()];
  renderSnapshot(await buildSnapshot(decisionTime));
  blind={decisionTime,row:[p.time],fullRows:api.baseRows().slice(),fullContext:api.fullContextRows().slice(),manual:true};
  $('#saveResearchCase').disabled=false;$('#blindStatus').textContent=`手动决策时点 ${api.fmtBJ(decisionTime,true)}`;
}
async function saveCurrentCase(){
  if(!blind||!lastSnapshot){alert('先开始 Blind Replay 或抓取当前快照。');return}
  const direction=directionValue(),setup=selectedSetup(),vetos=selectedVetos();
  const version=($('#strategyVersion').value||getStrategyVersion()).trim()||'PA_SETUP_V001';setStrategyVersion(version);
  const note=$('#researchNote').value.trim();
  const x={
    id:makeCaseId(),createdAt:new Date().toISOString(),decisionTime:blind.decisionTime,
    decisionBeijing:api.fmtBJ(blind.decisionTime,true),timeframe:api.currentTF(),strategyVersion:version,
    direction,setup,vetos,confidence:Number($('#researchConfidence').value),note,
    clarity:lastSnapshot.clarity,snapshot:lastSnapshot,outcome:lastOutcome
  };
  saveCase(x);$('#caseCount').textContent=getCases().length;$('#researchNote').value='';renderSimilar();
  $('#saveFeedback').textContent='已保存完整 Feature Snapshot';setTimeout(()=>$('#saveFeedback').textContent='',1800);
}
function populate(){
  $('#setupType').innerHTML=Object.entries(SETUPS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
  $('#vetoChecks').innerHTML=Object.entries(VETOS).map(([k,v])=>`<label class="checkItem"><input type="checkbox" value="${k}">${v}</label>`).join('');
  $('#strategyVersion').value=getStrategyVersion();$('#caseCount').textContent=getCases().length;
}
export function initResearchUI(x){
  api=x;populate();
  $('#startBlindReplay').onclick=startBlind;$('#nextBlindReplay').onclick=startBlind;$('#revealFuture').onclick=reveal;
  $('#snapshotCurrent').onclick=snapshotCurrent;$('#saveResearchCase').onclick=saveCurrentCase;
  $('#researchConfidence').oninput=()=>$('#researchConfidenceText').textContent=$('#researchConfidence').value;
  $$('.researchDirection button').forEach(b=>b.onclick=()=>{document.body.dataset.researchDirection=b.dataset.dir;$$('.researchDirection button').forEach(x=>x.classList.remove('active'));b.classList.add('active')});
}
export function researchDataChanged(){
  if(!api)return;blind=null;lastSnapshot=null;lastOutcome=null;
  window.dispatchEvent(new CustomEvent('palab:replay-state',{detail:{active:false,decisionTime:null,futureRevealed:false}}));
  $('#revealFuture').disabled=true;$('#saveResearchCase').disabled=true;
  $('#blindStatus').textContent='尚未开始 Blind Replay。';$('#tfSnapshot').innerHTML='';$('#stageProb').innerHTML='';$('#outcomeTable').innerHTML='';
}
