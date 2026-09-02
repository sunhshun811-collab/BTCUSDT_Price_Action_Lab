import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const lab=read('src/structure_case_lab.js');
const research=read('src/case_entry_research.js');
const html=read('index.html');
const ok=(v,m)=>{if(!v)throw new Error(m)};

ok(!lab.includes('sc.sourceTf!==d.timeframe'),'same-timeframe condition remains');
ok(!lab.includes('趋势线/水平线仍建议在同一结构周期锁定'),'same-timeframe alert remains');
ok(!lab.includes('结构母周期 ${TF_LABEL[c.sourceTf]'),'mother timeframe display remains');
ok(lab.includes("sc.structureScope='cross_timeframe'"),'lockSelected scope marker missing');
ok(lab.includes('趋势线 / 水平位全周期共享'),'cross-timeframe badge missing');
ok(lab.includes("title:'结构水平位'"),'mini horizontal level still timeframe-specific');
ok(!html.includes('先锁定 8H 趋势线'),'8H-specific instruction remains');
ok(html.includes('结构对象跨周期共享'),'cross-timeframe instruction missing');
ok(research.includes("structureScope:'CROSS_TIMEFRAME'"),'draft semantic scope missing');
ok(research.includes('trendlineDrawnOnTimeframe'),'trendline provenance missing');
ok(research.includes('horizontalDrawnOnTimeframe'),'horizontal provenance missing');

console.log('M04_CROSS_TIMEFRAME_STRUCTURE_V3_SMOKE_OK');
