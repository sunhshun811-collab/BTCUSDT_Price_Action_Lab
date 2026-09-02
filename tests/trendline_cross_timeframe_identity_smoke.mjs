import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const main=read('src/main.js');
const ann=read('src/annotations.js');
const engine=read('src/drawing_engine.js');
const style=read('src/drawing_style.js');
const lab=read('src/structure_case_lab.js');
const html=read('index.html');
const ok=(v,m)=>{if(!v)throw new Error(m)};

// Canonical intrinsic style belongs to the drawing object itself.
ok(style.includes("color:'#55a7ff'"),'canonical trend color missing');
ok(style.includes('lineWidth:2'),'canonical trend width missing');
ok(style.includes('lineStyle:0'),'canonical trend line style missing');
ok(engine.includes('style:newTrendStyle()'),'new trendline does not persist intrinsic style');

// Visibility is timeframe-neutral: trend/horizontal objects can be shown on every timeframe.
ok(
  ann.includes("includeCrossTimeframe&&['trend','horizontal'].includes(x.type)") ||
  ann.includes("['trend','horizontal'].includes(x.type)"),
  'cross-timeframe drawing visibility missing'
);
ok(!ann.includes('(TF_RANK[x.timeframe]??99)<rank'),'higher-timeframe-only projection rule remains');

// Main chart always resolves the drawing's own style; no projected grey/thin/dashed variant.
ok(main.includes('const style=resolveTrendStyle(d);'),'main chart not using intrinsic trend style');
ok(main.includes('color:style.color'),'main trend color not intrinsic');
ok(main.includes('lineWidth:style.lineWidth'),'main trend width not intrinsic');
ok(main.includes('lineStyle:style.lineStyle'),'main trend lineStyle not intrinsic');
ok(!main.includes("projected=d.timeframe!==currentTF"),'projection styling flag remains');
ok(!main.includes("'#6f8da8'"),'projected grey trend color remains');
ok(!main.includes("d.type==='trend'&&d.timeframe===currentTF"),'cross-timeframe edit restriction remains');
ok(!main.includes("currentTF=$('#timeframe').value;selectedDrawingId=null"),'timeframe switch still clears selected drawing');

// Structure research references the live drawing instead of owning an independently drifting copy.
ok(!lab.includes('sc.sourceTf!==d.timeframe'),'same-timeframe Structure guard remains');
ok(lab.includes('trendlineRef'), 'Structure Case does not keep a live trendline reference');
ok(lab.includes('horizontalRef'), 'Structure Case does not keep a live horizontal reference');
ok(lab.includes('sc.trendline=clone(d)'), 'Structure Case does not snapshot current live trendline');
ok(lab.includes('syncLiveStructure'), 'Structure Case does not synchronize live drawing revisions');
ok(lab.includes('scanStale'), 'geometry changes do not invalidate previous scan state');

// Mini charts still render the same geometry/style semantics.
ok(lab.includes('resolveTrendStyle(c.trendline)') || lab.includes('trendStyle=resolveTrendStyle(c.trendline)'),
   'Structure mini chart does not use intrinsic trend style');
ok(lab.includes('lineStyle:trendStyle.lineStyle'),'Structure mini chart line style mismatch');
ok(lab.includes("if(mode==='segment')"),'Structure mini geometry ignores segment mode');
ok(lab.includes("}else if(mode==='ray'){"),'Structure mini geometry ignores ray mode');

// Chinese UI states the all-timeframe identity rule.
ok(
  html.includes('显示全部结构线（所有周期完全一致）') ||
  html.includes('显示全部周期结构线（趋势线样式完全一致）'),
  'UI does not state all-timeframe trendline identity'
);

console.log('TRENDLINE_CROSS_TIMEFRAME_IDENTITY_SMOKE_OK');
