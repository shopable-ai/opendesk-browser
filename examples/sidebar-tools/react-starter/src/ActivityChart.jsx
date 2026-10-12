import React,{useEffect,useRef,useState} from 'react';
import sparklineLibrary from '@fnando/sparkline';

// Deliberately fixed sample data: chart switching neither fetches a CDN
// script at runtime nor requests new OpenDesk permissions.
const PERIODS={
  current:{label:'本周',values:[32,47,39,62,74,58,83]},
  previous:{label:'上周',values:[25,40,35,43,51,46,59]}
};
const DAYS=['周一','周二','周三','周四','周五','周六','周日'];

// @fnando/sparkline 0.3.10 publishes a CommonJS browser build.
// Handle its CJS/ESM interop without expecting a global window.sparkline.
const drawSparkline=[
  sparklineLibrary,
  sparklineLibrary?.sparkline,
  sparklineLibrary?.default,
  sparklineLibrary?.default?.sparkline
].find(value=>typeof value==='function');

export default function ActivityChart(){
  const svgRef=useRef(null);
  const [period,setPeriod]=useState('current');
  const [error,setError]=useState('');
  const selected=PERIODS[period];
  const total=selected.values.reduce((sum,value)=>sum+value,0);
  const maximum=Math.max(...selected.values);

  useEffect(()=>{
    const svg=svgRef.current;
    if(!svg)return;
    try {
      if(!drawSparkline)throw new Error('sparkline renderer unavailable');
      drawSparkline(svg,selected.values,{interactive:false});
      setError('');
    } catch {
      svg.replaceChildren();
      setError('图表未能绘制，请展开下方数据查看数值。');
    }
    // Remove the SVG children and any attached listeners when switching data
    // or when this tool's sandbox is unmounted.
    return ()=>svg.replaceChildren();
  },[selected]);

  return <section className="chart-panel" aria-labelledby="activity-heading">
    <div className="chart-heading">
      <div>
        <h2 id="activity-heading">趋势图表示例</h2>
        <p>第三方 JavaScript 库 · 仅本地打包 · 模拟数据</p>
      </div>
      <div className="period-switch" role="group" aria-label="选择示例数据">
        {Object.entries(PERIODS).map(([key,item])=>
          <button type="button" key={key} className="period-button"
            aria-pressed={key===period} onClick={()=>setPeriod(key)}>
            {item.label}
          </button>
        )}
      </div>
    </div>
    <div className="chart-surface">
      <svg ref={svgRef} className="demo-sparkline" xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 480 120" width="480" height="120" strokeWidth="3"
        role="img" aria-label={selected.label+'模拟趋势，7天合计'+total+'次，峰值'+maximum+'次'}/>
      {error?<p className="chart-error" role="status">{error}</p>:null}
      <div className="chart-stat">
        <span>{selected.label}合计 <strong>{total}</strong> 次</span>
        <span>单日峰值 <strong>{maximum}</strong> 次</span>
      </div>
    </div>
    <details className="chart-data">
      <summary>查看 7 天原始数据</summary>
      <table>
        <caption>{selected.label}模拟数据（次）</caption>
        <thead><tr><th scope="col">日期</th><th scope="col">数量</th></tr></thead>
        <tbody>{DAYS.map((day,index)=><tr key={day}>
          <th scope="row">{day}</th><td>{selected.values[index]}</td>
        </tr>)}</tbody>
      </table>
    </details>
  </section>;
}
