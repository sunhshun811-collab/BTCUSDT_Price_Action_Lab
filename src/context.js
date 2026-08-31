
const BJ='Asia/Shanghai';
const $=s=>document.querySelector(s);
const fmt=(x,d=2)=>x==null||!Number.isFinite(Number(x))?'—':Number(x).toFixed(d);
const pct=(x,d=2)=>x==null||!Number.isFinite(Number(x))?'—':`${(Number(x)*100).toFixed(d)}%`;
const bp=(x,d=2)=>x==null||!Number.isFinite(Number(x))?'—':`${Number(x).toFixed(d)} bp`;
const compact=x=>x==null||!Number.isFinite(Number(x))?'—':new Intl.NumberFormat('zh-CN',{notation:'compact',maximumFractionDigits:2}).format(Number(x));
const dt=t=>new Intl.DateTimeFormat('zh-CN',{timeZone:BJ,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(Number(t)*1000));

let rows=[];

function nearest(t){
  if(!rows.length)return null;
  let lo=0,hi=rows.length-1;
  while(lo<hi){const m=(lo+hi+1)>>1;if(rows[m].time<=t)lo=m;else hi=m-1}
  return rows[lo]||null;
}
function card(label,value,sub=''){
  return `<div class="ctxCard"><div class="ctxK">${label}</div><div class="ctxV">${value}</div><div class="ctxS">${sub}</div></div>`;
}
function line(canvas,key,label,formatter=x=>fmt(x)){
  const ctx=canvas.getContext('2d'),dpr=devicePixelRatio||1,w=Math.max(canvas.clientWidth,320),h=150;
  canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const raw=rows.map(x=>[x.time,x[key]]).filter(x=>x[1]!=null&&Number.isFinite(Number(x[1])));
  const stride=Math.max(1,Math.ceil(raw.length/6000));const data=raw.filter((_,i)=>i%stride===0||i===raw.length-1);
  ctx.fillStyle='#0a131d';ctx.fillRect(0,0,w,h);
  ctx.font='10px system-ui';ctx.fillStyle='#9aafc4';ctx.fillText(label,10,16);
  if(data.length<2){ctx.fillText('暂无数据',10,38);return}
  const vals=data.map(x=>Number(x[1]));let mn=Math.min(...vals),mx=Math.max(...vals);
  if(mx===mn){mx+=1;mn-=1}const pad=(mx-mn)*.08;mx+=pad;mn-=pad;
  const L=46,R=9,T=25,B=18,W=w-L-R,H=h-T-B;
  ctx.strokeStyle='#1e3041';ctx.lineWidth=1;
  for(let i=0;i<4;i++){const y=T+i*H/3;ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(w-R,y);ctx.stroke()}
  ctx.strokeStyle='#4d95ff';ctx.lineWidth=1.5;ctx.beginPath();
  data.forEach(([t,v],i)=>{const x=L+i/(data.length-1)*W,y=T+(mx-Number(v))/(mx-mn)*H;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();
  ctx.fillStyle='#9aafc4';ctx.fillText(formatter(mx),3,T+3);ctx.fillText(formatter(mn),3,T+H);
  ctx.fillText(dt(data[0][0]),L,h-4);const end=dt(data.at(-1)[0]);ctx.fillText(end,w-R-70,h-4);
}
function renderCharts(){
  line($('#ctxFunding'),'funding','资金费率',x=>pct(x,4));
  line($('#ctxOI'),'oi_usd','持仓量（OI，USD）',compact);
  line($('#ctxBasis'),'basis_bps','Mark / Index 基差',x=>bp(x,1));
  line($('#ctxTaker'),'taker_ls_ratio','主动买卖比',x=>fmt(x,2));
}
export function setContextData(x){
  rows=(x?.rows||[]).sort((a,b)=>a.time-b.time);
  renderCharts();
  if(rows.length)renderContextAt(rows.at(-1).time);
}
export function renderContextAt(t){
  const x=nearest(Number(t));if(!x)return;
  $('#contextCards').innerHTML=[
    card('北京时间',dt(x.time),'5分钟衍生品状态'),
    card('资金费率',pct(x.funding,4),`7日Z ${fmt(x.funding_z7d,2)} · 30日Z ${fmt(x.funding_z30d,2)}`),
    card('持仓量（OI）',compact(x.oi_usd),`5m ${pct(x.oi_change_5m)} · 1h ${pct(x.oi_change_1h)} · 4h ${pct(x.oi_change_4h)}`),
    card('基差（Basis）',bp(x.basis_bps),`7日Z ${fmt(x.basis_bps_z7d,2)}`),
    card('Premium',bp(x.premium_bps),'Binance Premium Index'),
    card('全市场多空比',fmt(x.global_ls_ratio,3),'账户多空比'),
    card('大户持仓多空比',fmt(x.top_pos_ratio,3),'Top Position L/S'),
    card('主动买卖比',fmt(x.taker_ls_ratio,3),`主动买入占比 ${pct(x.taker_buy_share)}`)
  ].join('');
}
window.addEventListener('resize',()=>{if(rows.length)renderCharts()});
