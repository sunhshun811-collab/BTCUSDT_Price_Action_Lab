import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {addMovingAverages,simpleMovingAverage} from '../src/moving_averages.js';

const row=(time,close)=>[time,close,close,close,close,1];
const rows=Array.from({length:65},(_,i)=>row(i*60,i+1));

for(const period of [10,30,60]){
  const average=simpleMovingAverage(rows,period);
  assert.equal(average.length,rows.length-period+1,`MA${period} needs a full window`);
  assert.deepEqual(average[0],{time:(period-1)*60,value:(period+1)/2},`MA${period} first point`);
  assert.deepEqual(average.at(-1),{time:64*60,value:(131-period)/2},`MA${period} latest point`);
}
assert.deepEqual(simpleMovingAverage(rows.slice(0,9),10),[],'an incomplete window must stay empty');
assert.throws(()=>simpleMovingAverage(rows,0),RangeError);
assert.throws(()=>simpleMovingAverage(rows,1.5),RangeError);

const frozen=rows.slice(0,40);
const frozenAverage=simpleMovingAverage(frozen,10);
const revealed=rows.map((r,i)=>i<40?r:[r[0],r[1],r[2],r[3],r[4]*100,1]);
assert.deepEqual(
  simpleMovingAverage(revealed,10).slice(0,frozenAverage.length),
  frozenAverage,
  'future closes must not alter values already visible in a frozen replay'
);

const interrupted=[
  ...Array.from({length:10},(_,i)=>row(i*60,i+1)),
  row(10*60,null),
  ...Array.from({length:10},(_,i)=>row((i+11)*60,i+20))
];
assert.deepEqual(simpleMovingAverage(interrupted,10),[
  {time:9*60,value:5.5},
  {time:20*60,value:24.5}
],'an invalid close must restart the warm-up window');

const makeElement=()=>({className:'',style:{},title:'',textContent:''});
globalThis.document={createElement:makeElement};
const legend={
  children:[],
  replaceChildren(){this.children=[]},
  appendChild(element){this.children.push(element)}
};
const series=[];
const chart={
  addSeries(type,options){
    const item={type,options,data:null,setData(data){this.data=data}};
    series.push(item);
    return item;
  }
};
const LineSeries=Symbol('LineSeries');
const movingAverages=addMovingAverages(chart,LineSeries,rows,legend);

assert.equal(series.length,3,'the main chart needs exactly MA10, MA30 and MA60');
assert.deepEqual(series.map(x=>x.type),[LineSeries,LineSeries,LineSeries]);
assert.deepEqual(series.map(x=>x.options.color),['#f5ce68','#53c7f0','#c39bff']);
assert.deepEqual(series.map(x=>x.data.length),[56,36,6]);
assert.deepEqual(legend.children.map(x=>x.textContent),['MA10 60.50','MA30 50.50','MA60 35.50']);

movingAverages.updateLegend(new Map([
  [series[0],{value:42.125}],
  [series[1],{value:84.5}],
  [series[2],{value:126}]
]));
assert.deepEqual(legend.children.map(x=>x.textContent),['MA10 42.13','MA30 84.50','MA60 126.00']);
movingAverages.updateLegend(new Map());
assert.deepEqual(legend.children.map(x=>x.textContent),['MA10 —','MA30 —','MA60 —']);
movingAverages.updateLegend();
assert.deepEqual(legend.children.map(x=>x.textContent),['MA10 60.50','MA30 50.50','MA60 35.50']);

const main=readFileSync('src/main.js','utf8');
assert.match(main,/movingAverages=addMovingAverages\(chart,LineSeries,currentRows,\$\('#movingAverageLegend'\)\)/,
  'the chart rebuild path must attach the moving averages');
assert.match(main,/movingAverages\?\.updateLegend\(p\.point&&p\.time\?p\.seriesData:null\)/,
  'the chart crosshair must update the moving-average legend');

console.log('MOVING_AVERAGES_SMOKE_OK: MA10/30/60, causal prefix, legend and crosshair values');
