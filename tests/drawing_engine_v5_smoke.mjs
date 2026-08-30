
import {calibrateTrendline,detectStructuralSwings} from '../src/trendline_calibration.js';

const rows=[];
for(let i=0;i<260;i++){
  const t=i*3600;
  const support=100+i*.035;
  const wave=4+Math.sin(i/8)*3.2;
  const close=support+wave;
  const open=close+Math.sin(i*.8)*.3;
  rows.push([t,open,Math.max(open,close)+.6,Math.min(open,close)-.6,close,100,0,0,0,0]);
}
const rawA={time:30*3600,price:102.8};
const rawB={time:190*3600,price:110.2};
const d=calibrateTrendline(rawA,rawB,rows,'1h','dual');
if(!d.candidates.length)throw new Error('no candidates');
const f=calibrateTrendline(rawA,rawB,rows,'1h','free');
if(f.candidates[0].anchorType!=='自由')throw new Error('free mode failed');
console.log('drawing engine calibration smoke OK',detectStructuralSwings(rows).length,d.candidates.length,d.candidates[0].anchorType,Math.round(d.candidates[0].score*100));
