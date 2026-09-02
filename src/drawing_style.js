export const DEFAULT_TREND_STYLE=Object.freeze({
  color:'#55a7ff',
  lineWidth:2,
  lineStyle:0
});
export const DEFAULT_HORIZONTAL_STYLE=Object.freeze({
  color:'#e7bf55',
  lineWidth:1,
  lineStyle:2
});
export function resolveTrendStyle(drawing){
  const s=drawing?.style||{};
  return {
    color:typeof s.color==='string'&&s.color?s.color:DEFAULT_TREND_STYLE.color,
    lineWidth:Number.isFinite(Number(s.lineWidth))?Number(s.lineWidth):DEFAULT_TREND_STYLE.lineWidth,
    lineStyle:Number.isFinite(Number(s.lineStyle))?Number(s.lineStyle):DEFAULT_TREND_STYLE.lineStyle
  };
}
export function resolveHorizontalStyle(drawing){
  const s=drawing?.style||{};
  return {
    color:typeof s.color==='string'&&s.color?s.color:DEFAULT_HORIZONTAL_STYLE.color,
    lineWidth:Number.isFinite(Number(s.lineWidth))?Number(s.lineWidth):DEFAULT_HORIZONTAL_STYLE.lineWidth,
    lineStyle:Number.isFinite(Number(s.lineStyle))?Number(s.lineStyle):DEFAULT_HORIZONTAL_STYLE.lineStyle
  };
}
export function newTrendStyle(){return {...DEFAULT_TREND_STYLE}}
export function newHorizontalStyle(){return {...DEFAULT_HORIZONTAL_STYLE}}
