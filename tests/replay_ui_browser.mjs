// Browser integration for the real research controller, storage and V10 decoder.
// The chart host is a fixture; this does not replace a full application build.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {gzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
let chromium;
try{({chromium}=require('playwright'))}
catch(err){
  if(!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)throw err;
  ({chromium}=require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright')));
}
const root=fileURLToPath(new URL('../',import.meta.url)),start=1704067200;
const rows=Array.from({length:1800},(_,i)=>[start+i*60,100,102,99,101,10]);
const bytes=Buffer.alloc(rows.length*6*8);
rows.flat().forEach((x,i)=>bytes.writeDoubleLE(x,i*8));
const shard=gzipSync(bytes),manifest={version:10,revision:'replay-test',timeframes:{'1m':['2024-01']},kline_schema:['time','open','high','low','close','volume']};
const html=(await readFile(path.join(root,'index.html'),'utf8'))
  .replace('src="/src/main.js"','src="/harness.js"')
  .replace('</head>','<link rel="stylesheet" href="/src/style.css"><link rel="stylesheet" href="/src/module_layout.css"></head>');
const harness=`
import {initResearchUI,researchDataChanged} from '/src/research_ui.js';
const rows=${JSON.stringify(rows)};
window.testRows=rows;window.rng=.2;Math.random=()=>window.rng;
window.addEventListener('palab:replay-state',e=>{window.replayState=e.detail;document.body.classList.toggle('blindReplayFrozen',e.detail.active&&!e.detail.futureRevealed)});
initResearchUI({indexData:()=>(${JSON.stringify(manifest)}),currentTF:()=>'1m',baseRows:()=>rows,fullContextRows:()=>[],selectedPoint:()=>({time:rows[100][0]}),showReplayRows:(r)=>{window.visibleRows=r},fmtBJ:t=>String(t)});
window.resetResearch=researchDataChanged;window.ready=true;
`;
let shardRequests=0,legacyRequests=0;
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost'),p=url.pathname;
    if(p==='/'){res.setHeader('Content-Type','text/html');res.end(html);return}
    if(p==='/harness.js'){res.setHeader('Content-Type','text/javascript');res.end(harness);return}
    if(p==='/data/v10/manifest.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(manifest));return}
    if(p==='/data/v10/klines/1m/2024-01.f64.gz'){
      shardRequests++;await new Promise(resolve=>setTimeout(resolve,60));res.end(shard);return;
    }
    if(p.startsWith('/data/')){legacyRequests++;res.statusCode=404;res.end();return}
    if(p.startsWith('/src/')&&!p.includes('..')){
      let data=await readFile(path.join(root,p));
      res.setHeader('Content-Type',p.endsWith('.css')?'text/css':'text/javascript');
      if(p.endsWith('.js'))data=data.toString().replaceAll('import.meta.env.BASE_URL',JSON.stringify('/'));
      res.end(data);return;
    }
    res.statusCode=404;res.end();
  }catch(err){res.statusCode=500;res.end(String(err))}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(()=>window.ready);
  const records=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('priceActionLab.strategyCases.v3')||'[]'));
  const startTrial=async()=>{
    await page.click('#startBlindReplay');
    await page.waitForFunction(()=>!document.querySelector('#saveResearchCase').disabled);
  };
  const choose=dir=>page.click(`.researchDirection button[data-dir="${dir}"]`);
  const reveal=async()=>{
    await page.click('#revealFuture');
    await page.waitForFunction(()=>document.querySelector('#blindStatus').textContent.includes('结果已保存'));
  };
  await startTrial();
  assert.equal(await page.locator('#revealFuture').isDisabled(),true);
  assert.equal(await page.locator('#structureEntryLab').isVisible(),false);
  assert.equal(await page.locator('.leftPanel').isVisible(),false);
  assert.ok((await page.locator('#similarCases').textContent()).includes('保存决策'));
  await page.click('#saveResearchCase');assert.equal((await records()).length,0,'direction must be explicit');
  await choose(-1);await page.fill('#researchNote','原始偏空判断');
  await page.click('#saveResearchCase');
  const original=(await records())[0];
  assert.equal(original.outcome,null);assert.equal(original.researchMode,'blind_replay');
  assert.equal(await page.locator('#researchNote').isDisabled(),true);
  // Even direct handler re-entry must not duplicate or overwrite the decision.
  await page.evaluate(()=>document.querySelector('#saveResearchCase').onclick());
  assert.equal((await records()).length,1);
  await reveal();
  const completed=(await records())[0];
  assert.equal(completed.note,original.note);assert.equal(completed.direction,-1);
  assert.equal(completed.outcome.direction,-1);assert.ok(completed.futureRevealedAt);
  assert.equal(await page.locator('.leftPanel').isVisible(),true);

  await startTrial();
  assert.equal(await page.evaluate(()=>document.body.dataset.researchDirection),undefined);
  assert.equal(await page.locator('#researchNote').inputValue(),'');
  assert.equal(await page.locator('#outcomeTable table').count(),0);
  await choose(0);await page.click('#saveResearchCase');
  assert.equal((await records())[1].outcome,null,'new trial must not inherit the old result');
  await reveal();assert.equal((await records())[1].outcome.reason,'no_trade');
  await page.click('#endBlindReplay');
  await page.click('#snapshotCurrent');
  await page.waitForFunction(()=>!document.querySelector('#saveResearchCase').disabled);
  await choose(1);await page.click('#saveResearchCase');
  assert.equal((await records())[2].researchMode,'manual_review');

  // Storage failure must not unlock the future.
  await startTrial();await choose(1);
  await page.evaluate(()=>{
    window.originalSetItem=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){if(k==='priceActionLab.strategyCases.v3')throw new Error('quota test');return window.originalSetItem.call(this,k,v)};
    document.querySelector('#saveResearchCase').onclick();
  });
  assert.equal(await page.locator('#revealFuture').isDisabled(),true);
  assert.ok((await page.locator('#saveFeedback').textContent()).includes('保存失败'));
  await page.evaluate(()=>Storage.prototype.setItem=window.originalSetItem);

  // Two overlapping snapshots must leave the latest trial in control.
  const latestTime=await page.evaluate(async()=>{
    window.rng=.1;const first=document.querySelector('#startBlindReplay').onclick();
    window.rng=.8;const second=document.querySelector('#startBlindReplay').onclick();
    const latest=window.replayState.decisionTime;await Promise.all([first,second]);return latest;
  });
  await choose(1);await page.click('#saveResearchCase');
  const latest=(await records()).at(-1);
  assert.equal(latest.decisionTime,latestTime);assert.equal(latest.snapshot.decisionTime,latestTime);
  // Result completion may update its own record after switching, not the new UI.
  await page.evaluate(async()=>{
    const pending=document.querySelector('#revealFuture').onclick();
    window.rng=.4;await document.querySelector('#startBlindReplay').onclick();await pending;
  });
  assert.equal(await page.locator('#outcomeTable table').count(),0);
  assert.equal(await page.locator('#revealFuture').isDisabled(),true);
  assert.ok((await records()).find(x=>x.id===latest.id).outcome);
  assert.ok(shardRequests>0,'real V10 gzip decoder must have been exercised');
  assert.equal(legacyRequests,0,'research must use the V10 data source');
  assert.deepEqual(errors,[]);
  console.log('REPLAY_UI_BROWSER_OK: 决策锁定、结果隔离、非盲测标记、失败保护、并发换例、V10 数据读取');
}finally{
  await browser?.close();await new Promise(resolve=>server.close(resolve));
}
