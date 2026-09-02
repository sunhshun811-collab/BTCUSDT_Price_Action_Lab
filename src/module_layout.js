import './module_layout.css';

const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>[...root.querySelectorAll(s)];
const MODULES=[
  {id:'M01',title:'市场工作台',mode:'editor',target:'.chartHeader'},
  {id:'M02',title:'结构研究工作台',mode:'editor',target:'#structureEntryLab'},
  {id:'M03',title:'盲测研究',mode:'research',target:'#researchPanel'}
];
function mk(tag,cls,text=''){const el=document.createElement(tag);if(cls)el.className=cls;if(text)el.textContent=text;return el}
function byText(root,selector,text){return $$(selector,root).find(el=>el.textContent.trim().includes(text))||null}
function append(target,...nodes){nodes.filter(Boolean).forEach(n=>target.appendChild(n))}
function header(code,title,subtitle){
  const el=mk('div','moduleCardHeader');
  el.innerHTML=`<div class="moduleCode">${code}</div><div class="moduleCardText"><strong>${title}</strong>${subtitle?`<span>${subtitle}</span>`:''}</div>`;
  return el;
}
function card(code,title,subtitle){const el=mk('section',`moduleSideCard module-${code.toLowerCase()}`);el.dataset.moduleTarget=code;el.appendChild(header(code,title,subtitle));return el}
function buildLeft(){
  const left=$('.leftPanel');if(!left||left.dataset.workspaceMerged==='1')return;
  left.dataset.workspaceMerged='1';
  const m01=card('M01','市场工作台','看图、周期定位、光标信息、快速判断与人工标签');
  append(m01,
    $('#timeframe')?.closest('label'),byText(left,'.toolTitle','全局日期范围'),$('.dateGrid',left),
    $('#applyCustomRange'),$('#rangeHint'),byText(left,'h3','当前光标'),$('#cursorInfo'),
    byText(left,'h3','人工判断'),$('#confidence')?.closest('label'),$('.labelGrid',left),$('#labelNote'),$('#saveLabel'),$('#humanLabelManager')
  );
  const m02=card('M02','结构研究工作台','趋势线、水平位、磁吸、样式、智能校准与结构案例研究');
  const keep=document.createElement('label');keep.className='check';keep.innerHTML='<input id="keepDrawing" type="checkbox"> 连续画线';
  const shortcut=mk('div','workspaceShortcut','快捷键：Alt+T 趋势线 · Alt+H 水平位 · Ctrl 临时反转磁吸 · Ctrl+Z 撤销 · Ctrl+Shift+Z 重做');
  append(m02,
    byText(left,'.toolTitle','画图工具'),$('#toolSelect')?.closest('.toolGrid'),keep,
    $('#trendMode')?.closest('label'),$('#trendCalibrationMode')?.closest('label'),$('#snapMode')?.closest('label'),
    $('#resetAnchorA')?.closest('.toolGrid'),$('#showHigherTfTrendlines')?.closest('label'),
    $('#drawingInfo'),$('#trendCalibrationPanel'),shortcut,$('#exportDrawings')
  );
  left.replaceChildren(m01,m02);
}
function decorate(el,code,title,subtitle){
  if(!el)return;
  el.dataset.moduleTarget=code;el.classList.add('modulePanel',`module-${code.toLowerCase()}`);
  const old=el.querySelector(':scope > .moduleCardHeader');if(old)old.remove();
  el.insertBefore(header(code,title,subtitle),el.firstChild);
}
function foundation(){
  const badges=$('.badges');if(!badges)return;
  $('.foundationBadge',badges)?.remove();
  const f=mk('span','foundationBadge');f.innerHTML='<b>F01</b> 研究基础层 · K线 / 多周期 / 衍生品上下文 / 图形 / 案例 / 人工标签';
  badges.prepend(f);
}
function rewriteText(){
  const names={editor:'研究工作台',research:'盲测研究'};
  $$('.mode').forEach(b=>{if(names[b.dataset.mode])b.textContent=names[b.dataset.mode]});
  const replace=(sel,from,to)=>{const el=$(sel);if(el&&el.textContent.includes(from))el.textContent=el.textContent.replace(from,to)};
  replace('#lockSelectedStructure','锁定当前结构线','设为当前案例结构');
  replace('#selectCaseZone','选择买点研究区间','选择买点研究区间');
  replace('#selectIdealZone','选择理想买点区间','选择理想买点区间');
  replace('#scanCaseEntries','扫描当前案例低周期买点','扫描当前案例的低周期买点');
  replace('#generateCaseDraft','生成当前案例入场规则草案','生成当前案例规则草案');
  replace('#clearDrawings','清空本周期','清空全部图形');
  replace('#exportDrawings','导出趋势线 JSON','导出图形数据');
  const hist=$('.caseHistoryPanel>summary');if(hist)hist.textContent='案例研究记录 · 自动保存与历史版本';
  const rp=$('#researchPanel .sectionHead h3');if(rp)rp.textContent='盲测研究';
  const setupLabel=[...document.querySelectorAll('#researchPanel label')].find(x=>x.textContent.trim().startsWith('Setup'));if(setupLabel)setupLabel.childNodes[0].textContent='形态类型';
}
function shell(){
  const area=$('.mainArea'),head=$('.chartHeader'),chart=$('#chartWrap'),ctx=$('.contextPanel');
  if(!area||!head||!chart||!ctx||$('#marketCanvasShell'))return;
  const shell=mk('div','marketCanvasShell');shell.id='marketCanvasShell';
  const center=mk('div','marketCanvasCenter'),rail=mk('aside','marketContextRail');
  center.append(head,chart);rail.append(ctx);shell.append(center,rail);
  area.insertBefore(shell,$('#structureEntryLab'));
  const btn=mk('button','contextToggle','市场上下文');
  btn.id='toggleMarketContext';head.appendChild(btn);
  btn.onclick=()=>{shell.classList.toggle('contextCollapsed');btn.textContent=shell.classList.contains('contextCollapsed')?'展开市场上下文':'收起市场上下文'};
}
function floatingToolbar(){
  const wrap=$('#chartWrap');if(!wrap||$('#drawingFloatBar'))return;
  const bar=mk('div','drawingFloatBar');bar.id='drawingFloatBar';bar.classList.add('hidden');
  bar.innerHTML=`
    <span id="drawingFloatTitle">已选图形</span>
    <label>颜色 <input id="drawingColor" type="color" value="#55a7ff"></label>
    <label>粗细 <select id="drawingWidth"><option value="1">1</option><option value="2" selected>2</option><option value="3">3</option><option value="4">4</option></select></label>
    <label>线型 <select id="drawingLineStyle"><option value="0">实线</option><option value="1">点线</option><option value="2">虚线</option></select></label>
    <label id="drawingModeWrap">模式 <select id="drawingMode"><option value="ray">射线</option><option value="segment">线段</option><option value="infinite">无限直线</option></select></label>
    <button id="drawingUseCase" class="primary">用于当前案例</button>
    <button id="drawingClone">复制</button>
    <button id="drawingLock">锁定</button>
    <button id="drawingDelete" class="danger">删除</button>`;
  wrap.appendChild(bar);
}
function rail(){
  $('#moduleRail')?.remove();
  const bar=$('.modebar');if(!bar)return;
  const nav=mk('nav','moduleRail');nav.id='moduleRail';
  MODULES.forEach(m=>{
    const b=mk('button','moduleJump');b.innerHTML=`<b>${m.id}</b><span>${m.title}</span>`;
    b.onclick=()=>{$(`.mode[data-mode="${m.mode}"]`)?.click();setTimeout(()=>$(m.target)?.scrollIntoView({behavior:'smooth',block:'start'}),60)};
    nav.appendChild(b);
  });
  bar.insertAdjacentElement('afterend',nav);
}
export function installModuleLayout(){
  document.body.classList.add('moduleWorkspaceFinal','workspaceConverged');
  foundation();rewriteText();buildLeft();
  decorate($('#structureEntryLab'),'M02','结构研究工作台','画结构 → 设为当前案例 → 买点研究区间 → 低周期扫描 → 人工判断 → 案例记录');
  decorate($('.contextPanel'),'M01','市场上下文','资金费率 / 持仓量 / 基差 / 仓位结构 / 主动买卖，与主图光标联动');
  decorate($('#researchPanel'),'M03','盲测研究','冻结未来 → 多周期因果快照 → 人工决策 → 揭示未来 → 风险与结果复盘');
  shell();floatingToolbar();rail();
}
