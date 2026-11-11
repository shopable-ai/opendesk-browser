import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import '../src/insight-core.js';

const html = readFileSync(new URL('../preview/index.html', import.meta.url), 'utf8');
const preview = readFileSync(new URL('../preview/preview.js', import.meta.url), 'utf8');

function harness() {
  const nodes = new Map();
  const listeners = {};
  function el(id, dataset = {}) {
    const handlers = {};
    const o = {
      id, dataset, hidden: false, innerHTML: '', textContent: '', value: '',
      isConnected: true, open: false, attrs: {},
      classList: { toggle() {} },
      addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
      setAttribute(name, value) { o.attrs[name] = value; },
      focus() {}, showModal() { o.open = true; }, close() { o.open = false; },
      emit(type, value) { for (const fn of handlers[type] || []) fn({ target: { value }, preventDefault() {} }); },
    };
    return o;
  }
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) nodes.set(match[1], el(match[1]));
  const surfaceButtons = [...html.matchAll(/<button\b[^>]*data-act="surface"[^>]*data-val="([^"]+)"/g)].map((m,i)=>el('surface_'+i,{act:'surface',val:m[1]}));
  const tabButtons = [...html.matchAll(/<button\b[^>]*data-act="tab"[^>]*data-val="([^"]+)"/g)].map((m,i)=>el('tab_'+i,{act:'tab',val:m[1]}));
  const panelButtons = ['current','all'].map((val,i)=>el('panel_'+i,{act:'panel-view',val}));
  const panes = [...html.matchAll(/data-pane="([^"]+)"/g)].map((m,i)=>el('pane_'+i,{pane:m[1]}));
  const panelSections = Array.from({length:6},(_,i)=>el('panel_section_'+i));
  const doc = {
    documentElement: {dataset: {}},
    querySelector(selector) {
      if (selector.startsWith('#')) return nodes.get(selector.slice(1)) ?? null;
      if (selector==='dialog[open]') return [...nodes.values()].find(x=>x.id.endsWith('-dialog') && x.open) ?? null;
      throw new Error('Unexpected selector: '+selector);
    },
    querySelectorAll(selector) {
      if(selector==='[data-act=surface]')return surfaceButtons;
      if(selector==='[data-act=tab]')return tabButtons;
      if(selector==='[data-act=panel-view]')return panelButtons;
      if(selector==='[data-pane]')return panes;
      if(selector==='#panel-current > section, #panel-current > details')return panelSections;
      throw new Error('Unexpected selectorAll: '+selector);
    },
    addEventListener(type,fn) {(listeners[type] ||= []).push(fn);}
  };
  runInNewContext(preview,{globalThis:{AIInsightCore:globalThis.AIInsightCore},document:doc},{filename:'ai-insight-preview.js'});
  return {
    doc, nodes, n:id=>{const o=nodes.get(id);assert.ok(o,'Missing #'+id);return o;},
    click(act,val='',label=act) {
      const b={dataset:{act,val},textContent:label};
      for(const fn of listeners.click||[])fn({target:{closest:selector=>selector==='button[data-act]'?b:null}});
      assert.doesNotMatch(nodes.get('feedback').textContent,/模拟操作失败/);
    },
    change(id,value){nodes.get(id).emit('change',value);},
    key(key){for(const fn of listeners.keydown||[])fn({key});},
  };
}

test('R5.5 preview keeps existing surface roots and new controls in the same HTML',()=>{
  for(const id of ['pc','panel','site','pc-drill','panel-current','panel-all','panel-focus','panel-next',
    'site-dock','site-chip','site-mini','site-conversation','site-visibility-btn','feedback'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/DESIGN_REVIEW_ONLY_NOT_SOURCE_PARITY/);
  assert.match(html,/禁 止|禁止发送/);
});

test('site miniature expands, confirms Claude B and reversibly recomputes shared metrics',()=>{
  const h=harness();
  assert.match(h.n('pc-stats').innerHTML,/<strong>2<\/strong>/);
  h.click('surface','site');assert.equal(h.n('site').hidden,false);
  h.click('site-expand');assert.equal(h.n('site-mini').hidden,false);
  h.change('site-conversation','conv_b');
  assert.match(h.n('site-mini').innerHTML,/确认关联/);
  h.click('link','candidate_b','确认关联');
  const updated=h.n('pc-stats').innerHTML;
  assert.match(updated,/<strong>3<\/strong>[\s\S]*<strong>2<\/strong>/);
  assert.match(updated,/<strong>65 分钟<\/strong>[\s\S]*<strong>40 分钟<\/strong>/);
  assert.match(h.n('site-mini').innerHTML,/撤销关联/);
  h.click('undo','link_conv_b','撤销关联');
  const restored=h.n('pc-stats').innerHTML;
  assert.match(restored,/<strong>2<\/strong>[\s\S]*<strong>1<\/strong>/);
  assert.match(restored,/<strong>40 分钟<\/strong>[\s\S]*<strong>40 分钟<\/strong>/);
  assert.match(h.n('pc-candidates').innerHTML,/确认关联/);
});

test('site pause differs from UI hide; theme and Escape collapse are UI-only',()=>{
  const h=harness();h.click('surface','site');h.click('site-expand');
  assert.match(h.n('site-mini').innerHTML,/暂停观察（模拟撤权）/);
  h.click('site-pause','https://chatgpt.com','暂停观察（模拟撤权）');
  assert.match(h.n('site-chip-label').textContent,/站点未授权或已暂停/);
  assert.match(h.n('site-mini').innerHTML,/模拟重新授权/);
  h.click('site-visibility','','隐藏提示');assert.equal(h.n('site-dock').hidden,true);
  assert.equal(h.n('site-hidden-note').hidden,false);
  h.click('site-visibility','','显示提示');assert.equal(h.n('site-dock').hidden,false);
  h.click('site-regrant','https://chatgpt.com','模拟重新授权');
  assert.match(h.n('site-chip-label').textContent,/已观察页面完成/);
  h.click('site-expand');h.key('Escape');
  assert.equal(h.n('site-mini').hidden,true);
  h.click('theme');assert.equal(h.doc.documentElement.dataset.theme,'dark');
});

test('compact side panel and PC drill keep one problem identity, not fake Attempt count',()=>{
  const h=harness();h.click('surface','panel');h.click('panel-view','all');
  assert.equal(h.n('panel-all').hidden,false);
  assert.match(h.n('panel-problems').innerHTML,/修复浏览器扩展的保存失败/);
  h.click('panel-view','current');assert.equal(h.n('panel-current').hidden,false);
  assert.match(h.n('pc-drill').innerHTML,/Attempt · 尚无独立持久化演示记录/);
  h.click('split','link_c','拆分为新问题');
  assert.match(h.n('pc-problems').innerHTML,/独立复测问题/);
  h.click('select-problem','prob_new_001');
  assert.match(h.n('pc-summary').innerHTML,/独立复测问题/);
  assert.match(h.n('pc-drill').innerHTML,/需要用户明确填写/);
});

test('unknown execution is a start marker, not a fabricated interval; evidence stays DEMO',()=>{
  const h=harness();
  assert.match(h.n('pc-timeline').innerHTML,/终点未知/);
  assert.match(h.n('pc-timeline').innerHTML,/width:2%/);
  assert.doesNotMatch(preview,/beg\+14/);
  h.click('demo-test','','记录模拟测试通过');
  assert.match(h.n('pc-outcome').innerHTML,/模拟本地测试通过/);
  assert.match(h.n('site-chip-label').textContent,/模拟证据已记录/);
  h.change('scenario','error');assert.match(h.n('pc-message').innerHTML,/状态未知/);
});

test('reject SIMILAR candidate without merging and keep all-surface statistics',()=>{
  const h=harness();
  const before=h.n('pc-stats').innerHTML;
  h.click('reject','candidate_x','拒绝错误关联');
  assert.doesNotMatch(h.n('pc-candidates').innerHTML,/相似但不同的登录 Bug/);
  assert.equal(h.n('pc-stats').innerHTML,before);
});
