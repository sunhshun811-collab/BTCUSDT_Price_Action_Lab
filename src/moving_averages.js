const AVERAGES=[
  {period:10,color:'#f5ce68'},
  {period:30,color:'#53c7f0'},
  {period:60,color:'#c39bff'}
];

// Each point uses only this candle's close and the preceding period - 1 closes.
// Require a full window; an invalid close restarts the warm-up.
export function simpleMovingAverage(rows,period){
  if(!Number.isInteger(period)||period<1)throw new RangeError('均线周期必须为正整数');
  const result=[],window=[];let sum=0;
  for(const row of rows){
    const close=Number(row[4]);
    if(row[4]==null||!Number.isFinite(close)){window.length=0;sum=0;continue}
    window.push(close);sum+=close;
    if(window.length>period)sum-=window.shift();
    if(window.length===period)result.push({time:Number(row[0]),value:sum/period});
  }
  return result;
}

export function addMovingAverages(chart,LineSeries,rows,legend){
  legend.replaceChildren();
  const averages=AVERAGES.map(({period,color})=>{
    const series=chart.addSeries(LineSeries,{
      title:`MA${period}`,color,lineWidth:1,priceScaleId:'right',
      priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:true
    });
    const data=simpleMovingAverage(rows,period);series.setData(data);
    const label=document.createElement('span');label.className='movingAverageItem';label.style.color=color;
    label.title=`最近 ${period} 根 K 线收盘价的简单平均值`;
    legend.appendChild(label);
    return {period,series,label,latest:data.at(-1)?.value};
  });
  function updateLegend(seriesData=null){
    for(const {period,series,label,latest} of averages){
      const value=seriesData?seriesData.get(series)?.value:latest;
      label.textContent=`MA${period} ${Number.isFinite(value)?value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—'}`;
    }
  }
  updateLegend();
  return {updateLegend};
}
