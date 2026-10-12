// Real ECharts instance lifecycle, owned by one React effect and container.
// Dependency injection is only for deterministic lifecycle tests; App supplies
// the actual statically imported ECharts API in production.
export function headingChartOption(stats) {
  return {
    animation: false,
    grid: {left: 32, right: 28, top: 8, bottom: 28},
    xAxis: {type: 'value', min: 0, max: Math.max(1, stats.peak), minInterval: 1,
      axisLabel: {fontSize: 10, color: '#728095'}, splitLine: {lineStyle: {color: '#edf1f7'}}},
    yAxis: {type: 'category', inverse: true, data: stats.levels.map(row => 'H' + row.level),
      axisTick: {show: false}, axisLine: {show: false}, axisLabel: {fontSize: 11, color: '#728095'}},
    series: [{id: 'heading-levels', type: 'bar', data: stats.levels.map(row => row.count),
      barMaxWidth: 13, itemStyle: {color: '#4269d9', borderRadius: [0, 3, 3, 0]},
      label: {show: true, position: 'right', color: '#273247', fontSize: 11}}]
  };
}

export function mountHeadingChart({element, echarts, stats, onState = () => {},
  ResizeObserverClass = ResizeObserver, win = element.ownerDocument.defaultView}) {
  let stopped = false, instance = null, observer = null, frame = 0, latest = stats;
  let failed = false;
  function report(error) {
    if (stopped) return;
    failed = true;
    try { instance?.dispose(); } catch (cleanupError) {
      error = new Error(String(error?.message || error) + '；清理失败：' + String(cleanupError?.message || cleanupError));
    } finally { instance = null; }
    onState({status: 'error', message: '图表绘制失败：' + String(error?.message || error)});
  }
  function sync() {
    frame = 0;
    if (stopped || failed || !element.isConnected) return;
    const {width, height} = element.getBoundingClientRect();
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    try {
      if (!instance) {
        instance = echarts.init(element, null, {renderer: 'svg', width, height});
        instance.setOption(headingChartOption(latest), {notMerge: true, lazyUpdate: false});
      } else instance.resize({width, height});
      onState({status: 'ready', message: ''});
    } catch (error) { report(error); }
  }
  function schedule() {
    if (!stopped && !failed && !frame) frame = win.requestAnimationFrame(sync);
  }
  onState({status: 'loading', message: '正在绘制图表…'});
  try {
    observer = new ResizeObserverClass(schedule);
    observer.observe(element);
    schedule();
  } catch (error) { report(error); }
  return {
    update(next) {
      if (stopped || failed) return;
      latest = next;
      try {
        if (instance) instance.setOption(headingChartOption(latest), {notMerge: true, lazyUpdate: false});
        else schedule();
      } catch (error) { report(error); }
    },
    dispose() {
      if (stopped) return;
      stopped = true;
      observer?.disconnect();
      if (frame) win.cancelAnimationFrame(frame);
      frame = 0;
      try { instance?.dispose(); } finally { instance = null; }
    }
  };
}
