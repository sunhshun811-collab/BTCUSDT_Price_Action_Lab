import './module_layout.css';

const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>[...root.querySelectorAll(s)];

const MODULES=[
  {id:'M01',title:'主图与市场定位',mode:'editor',target:'[data-module-target="M01"]'},
  {id:'M02',title:'图形标注与趋势线',mode:'editor',target:'[data-module-target="M02"]'},
  {id:'M03',title:'人工判断',mode:'editor',target:'[data-module-target="M03"]'},
  {id:'M04',title:'Structure Case',mode:'editor',target:'#structureEntryLab'},
  {id:'M05',title:'永续衍生品上下文',mode:'editor',target:'.contextPanel'},
  {id:'M06',title:'Blind Replay',mode:'research',target:'#researchPanel'}
];

function mk(tag,cls,text=''){
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(text)el.textContent=text;
  return el;
}
function moduleHeader(code,title,subtitle){
  const el=mk('div','moduleCardHeader');
  el.innerHTML=`<div class="moduleCode">${code}</div><div class="moduleCardText"><strong>${title}</strong>${subtitle?`<span>${subtitle}</span>`:''}</div>`;
  return el;
}
function byText(root,selector,text){
  return $$(selector,root).find(el=>el.textContent.trim().includes(text))||null;
}
function append(target,...nodes){nodes.filter(Boolean).forEach(n=>target.appendChild(n))}
function card(code,title,subtitle){
  const el=mk('section',`moduleSideCard module-${code.toLowerCase()}`);
  el.dataset.moduleTarget=code;el.appendChild(moduleHeader(code,title,subtitle));return el;
}
function buildLeftModules(){
  const left=$('.leftPanel');if(!left||left.dataset.modularized==='1')return;
  left.dataset.modularized='1';

  const m01=card('M01','主图与市场定位','K线、周期、日期范围、成交量、十字光标与 OHLC');
  append(m01,
    $('#timeframe')?.closest('label'),
    byText(left,'.toolTitle','全局日期范围'),
    $('.dateGrid',left),$('#applyCustomRange'),$('#rangeHint'),
    byText(left,'h3','当前光标'),$('#cursorInfo')
  );

  const m02=card('M02','图形标注与趋势线','趋势线、水平位、磁吸、自动校准、锚点与研究导出');
  append(m02,
    byText(left,'.toolTitle','画图工具'),
    $('#toolSelect')?.closest('.toolGrid'),
    $('#trendMode')?.closest('label'),
    $('#trendCalibrationMode')?.closest('label'),
    $('#snapMode')?.closest('label'),
    $('#resetAnchorA')?.closest('.toolGrid'),
    $('#showHigherTfTrendlines')?.closest('label'),
    $('#drawingInfo'),$('#trendCalibrationPanel'),$('#exportDrawings')
  );

  const m03=card('M03','人工判断','方向、置信度、备注、历史标签管理与 JSON 导出');
  append(m03,
    $('#confidence')?.closest('label'),
    $('.labelGrid',left),$('#labelNote'),$('#saveLabel'),$('#humanLabelManager')
  );

  left.replaceChildren(m01,m02,m03);
}
function decorate(el,code,title,subtitle){
  if(!el||el.dataset.moduleDecorated==='1')return;
  el.dataset.moduleDecorated='1';el.dataset.moduleTarget=code;
  el.classList.add('modulePanel',`module-${code.toLowerCase()}`);
  el.insertBefore(moduleHeader(code,title,subtitle),el.firstChild);
}
function decorateViews(){
  const h=$('.chartHeader');
  if(h){
    h.dataset.moduleTarget='M01';h.classList.add('modulePrimaryHeader');
    if(!$('.moduleInlineBadge',h))h.insertBefore(mk('span','moduleInlineBadge','M01'),h.firstChild);
  }
  decorate($('#structureEntryLab'),'M04','Structure Case · 条件化买点研究','母结构 → Entry Research Zone → 五低周期扫描 → 候选与人工判断 → 买点阶梯 → 当前案例规则草案');
  decorate($('.contextPanel'),'M05','永续衍生品上下文','Funding / OI / Basis / Positioning / 主动买卖 · 与主图十字光标同步');
  decorate($('#researchPanel'),'M06','Blind Replay · 盲测研究','冻结未来 → 六周期因果快照 → 人工决策 → Feature Snapshot → 揭示未来 → MFE / MAE');
}
function foundation(){
  const badges=$('.badges');if(!badges||$('.foundationBadge',badges))return;
  const f=mk('span','foundationBadge');
  f.innerHTML='<b>F01</b> Data Foundation V10 · K线 / 多周期 / Futures Context / 人工标签存储';
  badges.prepend(f);
}
function rewriteModeLabels(){
  const names={editor:'M01–M05 研究工作台',research:'M06 Blind Replay'};
  $$('.mode').forEach(b=>{if(names[b.dataset.mode])b.textContent=names[b.dataset.mode]});
}
function rail(){
  if($('#moduleRail'))return;
  const bar=$('.modebar');if(!bar)return;
  const nav=mk('nav','moduleRail');nav.id='moduleRail';
  nav.appendChild(mk('div','moduleRailLabel','正式模块'));
  MODULES.forEach(m=>{
    const b=mk('button','moduleJump');
    b.innerHTML=`<b>${m.id}</b><span>${m.title}</span>`;
    b.onclick=()=>{
      $(`.mode[data-mode="${m.mode}"]`)?.click();
      setTimeout(()=>{
        $(m.target)?.scrollIntoView({behavior:'smooth',block:'start'});
        $$('.moduleJump').forEach(x=>x.classList.toggle('active',x===b));
      },80);
    };
    nav.appendChild(b);
  });
  bar.insertAdjacentElement('afterend',nav);
}
export function installModuleLayout(){
  document.body.classList.add('moduleWorkspaceFinal');
  foundation();rewriteModeLabels();buildLeftModules();decorateViews();rail();
}
