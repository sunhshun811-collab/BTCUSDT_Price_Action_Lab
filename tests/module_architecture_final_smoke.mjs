import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const html=read('index.html');
const layout=read('src/module_layout.js');
const css=read('src/module_layout.css');
const main=read('src/main.js');
const caseLab=read('src/structure_case_lab.js');
const pkg=JSON.parse(read('package.json'));
const ok=(v,m)=>{if(!v)throw new Error(m)};

const expected=[
  ["M01","市场工作台"],
  ["M02","结构研究工作台"]
];

for(const [id,title] of expected){
  ok(layout.includes(`id:'${id}',title:'${title}'`) || layout.includes(`'${id}','${title}'`),
     `layout missing ${id} ${title}`);
  ok(css.includes(`module-${id.toLowerCase()}`),`CSS missing ${id}`);
}

for(const removed of ['M03','M04','M05','M06']){
  ok(!layout.includes(`id:'${removed}'`),`removed top-level module remains: ${removed}`);
}

ok(layout.includes('F01'),'F01 foundation label missing');
ok(layout.includes('研究基础层'),'F01 Chinese foundation wording missing');

ok(layout.includes("target:'#structureEntryLab'"),'M02 does not own Structure Case workspace');
ok(!layout.includes("target:'#researchPanel'"),'M03 Blind Replay target remains in layout');
ok(!html.includes('id="researchPanel"'),'M03 Blind Replay panel remains in HTML');
ok(!css.includes('module-m03'),'M03 module CSS remains');
for(const retired of ['src/research.js','src/research_ui.js','tests/research_smoke.mjs','tests/replay_integrity_smoke.mjs','tests/replay_ui_browser.mjs','docs/BLIND_REPLAY_INTEGRITY.md']){
  ok(!fs.existsSync(retired),`retired M03 artifact remains: ${retired}`);
}
ok(!pkg.scripts['test:browser'],'retired M03 browser test command remains');
ok(!pkg.devDependencies.playwright,'retired M03 browser dependency remains');

ok(!html.includes('先锁定 8H 趋势线'),'timeframe-specific M02/M04 instruction remains');
ok(main.includes('resolveTrendStyle'),'shared cross-timeframe trend style missing');
ok(caseLab.includes('trendlineRef'),'Structure Case does not reference live drawing');
ok(caseLab.includes('scanStale'),'structure-change scan invalidation missing');

console.log('MODULE_ARCHITECTURE_FINAL_SMOKE_OK');
