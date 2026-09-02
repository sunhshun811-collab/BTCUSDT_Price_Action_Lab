import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const html=read('index.html');
const layout=read('src/module_layout.js');
const css=read('src/module_layout.css');
const main=read('src/main.js');
const caseLab=read('src/structure_case_lab.js');
const ok=(v,m)=>{if(!v)throw new Error(m)};

const expected=[
  ["M01","市场工作台"],
  ["M02","结构研究工作台"],
  ["M03","盲测研究"]
];

for(const [id,title] of expected){
  ok(layout.includes(`id:'${id}',title:'${title}'`) || layout.includes(`'${id}','${title}'`),
     `layout missing ${id} ${title}`);
  ok(css.includes(`module-${id.toLowerCase()}`),`CSS missing ${id}`);
}

for(const old of ['M04','M05','M06']){
  ok(!layout.includes(`id:'${old}'`),`legacy top-level module remains: ${old}`);
}

ok(layout.includes('F01'),'F01 foundation label missing');
ok(layout.includes('研究基础层'),'F01 Chinese foundation wording missing');

ok(layout.includes("target:'#structureEntryLab'"),'M02 does not own Structure Case workspace');
ok(layout.includes("target:'#researchPanel'"),'M03 does not own Blind Replay workspace');

ok(!html.includes('先锁定 8H 趋势线'),'timeframe-specific M02/M04 instruction remains');
ok(main.includes('resolveTrendStyle'),'shared cross-timeframe trend style missing');
ok(caseLab.includes('trendlineRef'),'Structure Case does not reference live drawing');
ok(caseLab.includes('scanStale'),'structure-change scan invalidation missing');

console.log('MODULE_ARCHITECTURE_FINAL_SMOKE_OK');
