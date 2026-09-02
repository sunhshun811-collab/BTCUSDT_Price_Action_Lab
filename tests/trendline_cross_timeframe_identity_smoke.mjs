import fs from 'node:fs';
const r=p=>fs.readFileSync(p,'utf8');
const main=r('src/main.js');
const ann=r('src/annotations.js');
const engine=r('src/drawing_engine.js');
const style=r('src/drawing_style.js');
const lab=r('src/structure_case_lab.js');
const html=r('index.html');
const ok=(v,m)=>{if(!v)throw new Error(m)};

ok(style.includes("color:'#55a7ff'"),'canonical trend color missing');
ok(style.includes('lineWidth:2'),'canonical trend width missing');
ok(style.includes('lineStyle:0'),'canonical trend style missing');
ok(engine.includes('style:newTrendStyle()'),'new trendline does not persist style');

ok(ann.includes("return ['trend','horizontal'].includes(x.type)"),'cross-timeframe drawing visibility missing');
ok(!ann.includes('(TF_RANK[x.timeframe]??99)<rank'),'higher-only projection rule remains');

ok(main.includes('const style=resolveTrendStyle(d);'),'main chart not using intrinsic trend style');
ok(main.includes('color:style.color'),'main trend color not intrinsic');
ok(main.includes('lineWidth:style.lineWidth'),'main trend width not intrinsic');
ok(main.includes('lineStyle:style.lineStyle'),'main trend lineStyle not intrinsic');
ok(!main.includes("projected=d.timeframe!==currentTF"),'projection styling flag remains');
ok(!main.includes("'#6f8da8'"),'projected grey trend color remains');
ok(!main.includes("d.type==='trend'&&d.timeframe===currentTF"),'cross-timeframe edit restriction remains');
ok(!main.includes("currentTF=$('#timeframe').value;selectedDrawingId=null"),'timeframe switch still clears trend selection');

ok(!lab.includes('sc.sourceTf!==d.timeframe'),'M04 same-timeframe structure guard remains');
ok(lab.includes('style:resolveTrendStyle(d)'),'M04 does not copy trend intrinsic style');
ok(lab.includes('const trendStyle=resolveTrendStyle(c.trendline);'),'M04 mini chart does not use intrinsic style');
ok(lab.includes('lineStyle:trendStyle.lineStyle'),'M04 mini line style mismatch');
ok(lab.includes("if(mode==='segment')"),'M04 mini geometry ignores segment mode');
ok(lab.includes("}else if(mode==='ray'){"),'M04 mini geometry ignores ray mode');

ok(html.includes('显示全部周期结构线（趋势线样式完全一致）'),'UI does not state all-timeframe identity');

console.log('TRENDLINE_CROSS_TIMEFRAME_IDENTITY_SMOKE_OK');
