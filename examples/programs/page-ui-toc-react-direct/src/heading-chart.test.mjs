import test from 'node:test';
import assert from 'node:assert/strict';
import {mountHeadingChart, headingChartOption} from './heading-chart.js';
import {summarizeHeadingLevels} from './heading-stats.js';

// Instance lifecycle model, not a browser-rendering receipt. The integration
// driver separately checks the actual imported ECharts SVG in Chrome.
const stats = (...levels) => summarizeHeadingLevels(levels.map(level => ({level})));
function fixture(size = {width: 260, height: 208}, failure) {
  const frames = new Map(), calls = [], states = [];
  let next = 0, callback, disconnected = false;
  const element = {isConnected: true, getBoundingClientRect: () => size};
  const win = {requestAnimationFrame(fn) { frames.set(++next, fn); return next; },
    cancelAnimationFrame(id) { frames.delete(id); }};
  const instance = {setOption(...args) { calls.push(['setOption', ...args]); if (failure) throw Error(failure); },
    resize(value) { calls.push(['resize', value]); }, dispose() { calls.push(['dispose']); }};
  const echarts = {init(...args) { calls.push(['init', ...args]); return instance; }};
  class Observer {
    constructor(fn) { callback = fn; }
    observe(value) { assert.equal(value, element); }
    disconnect() { disconnected = true; }
  }
  const chart = mountHeadingChart({element, echarts, stats: stats(1, 2, 2),
    win, ResizeObserverClass: Observer, onState: state => states.push(state)});
  return {element, size, frames, calls, states, chart, callback: () => callback(),
    get disconnected() { return disconnected; },
    flush() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); }};
}

test('ECharts initializes only after a connected container has finite positive dimensions', () => {
  const f = fixture({width: 0, height: 208});
  f.flush(); assert.equal(f.calls.length, 0); assert.equal(f.states.at(-1).status, 'loading');
  f.size.width = NaN; f.callback(); f.flush(); assert.equal(f.calls.length, 0);
  f.size.width = 260; f.element.isConnected = false; f.callback(); f.flush(); assert.equal(f.calls.length, 0);
  f.element.isConnected = true; f.callback(); f.flush();
  assert.equal(f.calls[0][0], 'init'); assert.equal(f.calls[0][1], f.element);
  assert.deepEqual(f.calls[0][3], {renderer: 'svg', width: 260, height: 208});
  assert.equal(f.states.at(-1).status, 'ready'); f.chart.dispose();
});

test('data changes call setOption on the existing chart; observed size changes call resize', () => {
  const f = fixture(); f.flush();
  const next = stats(1, 3, 3, 6); f.chart.update(next);
  assert.deepEqual(f.calls.at(-1), ['setOption', headingChartOption(next), {notMerge: true, lazyUpdate: false}]);
  assert.equal(f.calls.filter(row => row[0] === 'init').length, 1);
  f.size.width = 218; f.callback(); f.callback(); assert.equal(f.frames.size, 1); f.flush();
  assert.deepEqual(f.calls.at(-1), ['resize', {width: 218, height: 208}]); f.chart.dispose();
});

test('Stop during loading cancels pending work and late observer/frame results cannot initialize', () => {
  const f = fixture(), late = [...f.frames.values()][0];
  f.chart.dispose(); f.chart.dispose(); late(); f.callback(); f.chart.update(stats(6)); f.flush();
  assert.equal(f.disconnected, true); assert.equal(f.frames.size, 0); assert.deepEqual(f.calls, []);
  assert.equal(f.states.length, 1);
});

test('mounted Stop disposes exactly once and stale updates cannot touch the old version', () => {
  const f = fixture(); f.flush(); f.callback(); const late = [...f.frames.values()][0];
  f.chart.dispose(); const count = f.calls.length;
  late(); f.callback(); f.chart.update(stats(4)); f.chart.dispose(); f.flush();
  assert.equal(f.disconnected, true); assert.equal(f.calls.length, count);
  assert.equal(f.calls.filter(row => row[0] === 'dispose').length, 1);
});

test('ECharts failures become a visible error and never select a fallback renderer or implementation', () => {
  const f = fixture(undefined, 'SET_OPTION_FAILED'); f.flush();
  assert.deepEqual(f.states.at(-1), {status: 'error', message: '图表绘制失败：SET_OPTION_FAILED'});
  const count = f.calls.length; f.callback(); f.chart.update(stats(1)); f.flush();
  assert.equal(f.calls.length, count); f.chart.dispose(); assert.equal(f.disconnected, true);
});
