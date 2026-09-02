const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];

const MODULES = [
  {id:'M01', title:'主图与市场定位', mode:'editor', target:'[data-module-target="M01"]'},
  {id:'M02', title:'图形标注与趋势线', mode:'editor', target:'[data-module-target="M02"]'},
  {id:'M03', title:'人工判断', mode:'editor', target:'[data-module-target="M03"]'},
  {id:'M04', title:'六周期同步总览', mode:'overview', target:'#overviewView'},
  {id:'M05', title:'人工教学数据', mode:'labels', target:'#labelsView'},
  {id:'M06', title:'Structure Case', mode:'editor', target:'#structureEntryLab'},
  {id:'M07', title:'永续衍生品上下文', mode:'editor', target:'.contextPanel'},
  {id:'M08', title:'Blind Replay', mode:'research', target:'#researchPanel'}
];

function mk(tag, cls, text=''){
  const el=document.createElement(tag);
  if(cls) el.className=cls;
  if(text) el.textContent=text;
  return el;
}

function moduleHeader(code, title, subtitle){
  const wrap=mk('div','moduleCardHeader');
  wrap.innerHTML=`<div class="moduleCode">${code}</div><div class="moduleCardText"><strong>${title}</strong>${subtitle?`<span>${subtitle}</span>`:''}</div>`;
  return wrap;
}

function childByText(root, selector, text){
  return $$(selector,root).find(el=>el.textContent.trim().includes(text))||null;
}

function safeAppend(target, ...nodes){
  nodes.filter(Boolean).forEach(n=>target.appendChild(n));
}

function makeSideModule(code,title,subtitle){
  const sec=mk('section',`moduleSideCard module-${code.toLowerCase()}`);
  sec.dataset.moduleTarget=code;
  sec.appendChild(moduleHeader(code,title,subtitle));
  return sec;
}

function buildLeftModules(){
  const left=$('.leftPanel');
  if(!left || left.dataset.modularized==='1') return;
  left.dataset.modularized='1';

  const timeframe=$('#timeframe')?.closest('label');
  const dateTitle=childByText(left,'.toolTitle','全局日期范围');
  const dateGrid=$('.dateGrid',left);
  const applyRange=$('#applyCustomRange');
  const rangeHint=$('#rangeHint');
  const cursorH=childByText(left,'h3','当前光标');
  const cursorInfo=$('#cursorInfo');

  const drawingTitle=childByText(left,'.toolTitle','画图工具');
  const drawingGrid=$('#toolSelect')?.closest('.toolGrid');
  const trendMode=$('#trendMode')?.closest('label');
  const calibrationMode=$('#trendCalibrationMode')?.closest('label');
  const snapMode=$('#snapMode')?.closest('label');
  const drawingActions=$('#resetAnchorA')?.closest('.toolGrid');
  const higherTf=$('#showHigherTfTrendlines')?.closest('label');
  const drawingInfo=$('#drawingInfo');
  const calibrationPanel=$('#trendCalibrationPanel');

  const confidence=$('#confidence')?.closest('label');
  const labelGrid=$('.labelGrid',left);
  const labelNote=$('#labelNote');
  const saveLabel=$('#saveLabel');

  const m01=makeSideModule('M01','主图与市场定位','周期、日期范围、光标与 OHLC');
  safeAppend(m01,timeframe,dateTitle,dateGrid,applyRange,rangeHint,cursorH,cursorInfo);

  const m02=makeSideModule('M02','图形标注与趋势线','Drawing Engine / Trendline Intelligence');
  safeAppend(m02,drawingTitle,drawingGrid,trendMode,calibrationMode,snapMode,drawingActions,higherTf,drawingInfo,calibrationPanel);

  const m03=makeSideModule('M03','人工判断','方向、置信度、备注与标签沉淀');
  safeAppend(m03,confidence,labelGrid,labelNote,saveLabel);

  left.replaceChildren(m01,m02,m03);
}

function decoratePanel(el, code, title, subtitle){
  if(!el || el.dataset.moduleDecorated==='1') return;
  el.dataset.moduleDecorated='1';
  el.dataset.moduleTarget=code;
  el.classList.add('modulePanel',`module-${code.toLowerCase()}`);
  el.insertBefore(moduleHeader(code,title,subtitle),el.firstChild);
}

function decorateViews(){
  const chartHeader=$('.chartHeader');
  if(chartHeader){
    chartHeader.dataset.moduleTarget='M01';
    chartHeader.classList.add('modulePrimaryHeader');
    if(!$('.moduleInlineBadge',chartHeader)){
      const b=mk('span','moduleInlineBadge','M01');
      chartHeader.insertBefore(b,chartHeader.firstChild);
    }
  }

  decoratePanel(
    $('#structureEntryLab'),
    'M06',
    'Structure Case · 条件化买点研究',
    '母结构 → Entry Research Zone → 五低周期扫描 → 候选与人工判断 → 买点阶梯 → 当前案例规则草案'
  );

  decoratePanel(
    $('.contextPanel'),
    'M07',
    '永续衍生品上下文',
    'Funding / OI / Basis / Positioning / 主动买卖 · 与主图十字光标同步'
  );

  decoratePanel(
    $('#researchPanel'),
    'M08',
    'Blind Replay · 盲测研究',
    '冻结未来 → 六周期因果快照 → 人工决策 → Feature Snapshot → 揭示未来 → MFE / MAE'
  );

  const ov=$('.overviewHeader');
  if(ov && !$('.moduleInlineBadge',ov)){
    ov.dataset.moduleTarget='M04';
    ov.insertBefore(mk('span','moduleInlineBadge','M04'),ov.firstChild);
    const strong=$('strong',ov);
    if(strong) strong.textContent='M04 六周期同步总览';
  }

  const labels=$('.labelsPanel');
  if(labels){
    labels.dataset.moduleTarget='M05';
    labels.classList.add('modulePanel','module-m05');
    const sh=$('.sectionHead',labels);
    if(sh){
      const h=$('h3',sh);
      if(h) h.textContent='M05 人工教学数据';
    }
  }
}

function installFoundationBadge(){
  const badges=$('.badges');
  if(!badges || $('.foundationBadge',badges)) return;
  const f=mk('span','foundationBadge');
  f.innerHTML='<b>F01</b> Data Foundation V10 · K线 / 多周期 / Futures Context';
  badges.prepend(f);
}

function rewriteModeLabels(){
  const map={
    editor:'M01–M03 主图工作台',
    overview:'M04 六周期总览',
    labels:'M05 人工教学数据',
    research:'M08 Blind Replay'
  };
  $$('.mode').forEach(btn=>{
    if(map[btn.dataset.mode]) btn.textContent=map[btn.dataset.mode];
  });
}

function installModuleRail(){
  if($('#moduleRail')) return;
  const bar=$('.modebar');
  if(!bar) return;
  const rail=mk('nav','moduleRail');
  rail.id='moduleRail';

  const label=mk('div','moduleRailLabel','模块');
  rail.appendChild(label);

  MODULES.forEach(m=>{
    const b=mk('button','moduleJump');
    b.dataset.module=m.id;
    b.innerHTML=`<b>${m.id}</b><span>${m.title}</span>`;
    b.onclick=()=>{
      const modeBtn=$(`.mode[data-mode="${m.mode}"]`);
      if(modeBtn) modeBtn.click();
      setTimeout(()=>{
        const target=$(m.target);
        target?.scrollIntoView({behavior:'smooth',block:'start'});
        $$('.moduleJump').forEach(x=>x.classList.toggle('active',x===b));
      },90);
    };
    rail.appendChild(b);
  });

  bar.insertAdjacentElement('afterend',rail);
}

export function installModuleLayout(){
  document.body.classList.add('moduleWorkspaceV2');
  installFoundationBadge();
  rewriteModeLabels();
  buildLeftModules();
  decorateViews();
  installModuleRail();
}
