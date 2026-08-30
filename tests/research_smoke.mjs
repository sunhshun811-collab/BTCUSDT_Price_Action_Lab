
globalThis.localStorage={_:{},getItem(k){return this._[k]??null},setItem(k,v){this._[k]=String(v)},removeItem(k){delete this._[k]}};
const m=await import('../src/research.js');
const rows=[];let price=100;
for(let i=0;i<300;i++){
  const open=price;
  price=price*(1+(Math.sin(i/17)+0.4)/1000);
  const high=Math.max(open,price)*1.002;
  const low=Math.min(open,price)*0.998;
  rows.push([i*60,open,high,low,price,100+i%10,0,0,0,0]);
}
const f=m.computeFeatures(rows,'1m',300*60);
if(!f.available)throw new Error('features unavailable');
const snap={
  timeframes:{'1m':f,'5m':f,'15m':f,'1h':f,'4h':f,'8h':f},
  context:{funding_z7d:1,basis_bps_z7d:-0.5,taker_ls_ratio:1.2,oi_change_1h:0.02}
};
snap.stage=m.marketStage(snap);
snap.clarity=m.setupClarity(snap);
const o=m.outcomeFrom1m(rows,120*60,1);
if(!o.available)throw new Error('outcome unavailable');
console.log('research smoke OK',Math.round(snap.clarity),Object.keys(o.horizons).length);
