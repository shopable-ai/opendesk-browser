import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

const html = readFileSync(new URL('../preview/ai-proxy-interactive-preview-r18.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'R18 interactive script should exist');

function harness() {
  const listeners = {};
  const elements = {};
  const element = id => elements[id] ??= {
    id, innerHTML: '', hidden: false, value: 'normal', scrollTop: 0, dataset: {},
    setAttribute() {}, addEventListener(type, handler) { (listeners[id] ??= {})[type] = handler; },
    querySelector() { return null; }, scrollIntoView() {}, focus() {}
  };
  const document = {
    getElementById: element,
    querySelectorAll(selector) { return selector === '[data-ui]' ? [element('mode-before'), element('mode-after')] : []; },
    querySelector() { return null; },
    addEventListener(type, handler) { listeners[type] = handler; }
  };
  element('mode-before').dataset = {ui: 'before'};
  element('mode-after').dataset = {ui: 'after'};
  const context = vm.createContext({document, setTimeout, clearTimeout, console});
  vm.runInContext(script + '\nglobalThis.inspectR18 = {state:()=>s, selectScene, render};', context);
  function click(action, extras = {}) {
    listeners.click({target: {closest: () => ({dataset: {action, ...extras}})}});
  }
  return {state: context.inspectR18.state, selectScene: context.inspectR18.selectScene,
    click, markup: () => element('app').innerHTML,
    compareBefore: () => listeners['mode-before'].click()};
}

test('PC management template remains byte-for-byte unchanged from R17', () => {
  const from = html.indexOf('function managementHeader(');
  const to = html.indexOf('function render(){', from);
  assert.ok(from > 0 && to > from);
  const hash = createHash('sha256').update(html.slice(from, to)).digest('hex');
  assert.equal(hash, '9aa1b9d9ea8dc8e2e53e29bb0d9eefb82bd410c0ec7ecb28d6fda42a001ac353');
});

test('running proxy switch is not reported as paused, pending is distinct', async () => {
  const h = harness();
  assert.equal(h.state().activeProfile, 'p1');
  assert.match(h.markup(), /使用中/);
  h.click('select-profile', {value: 'p2'});
  assert.equal(h.state().switchingTo, 'p2');
  assert.equal(h.state().activeProfile, 'p1', 'old applied route is retained during switch');
  assert.equal(h.state().applied, true);
  await new Promise(resolve => setTimeout(resolve, 360));
  assert.equal(h.state().activeProfile, 'p2');
  assert.equal(h.state().switchingTo, null);
  assert.equal(h.state().applied, true);
  h.click('status-button');
  assert.equal(h.state().applied, false);
  h.click('select-profile', {value: 'p3'});
  assert.equal(h.state().selected, 'p3');
  assert.equal(h.state().activeProfile, 'p2');
  assert.match(h.markup(), /待启用/);
  h.click('status-button');
  assert.equal(h.state().activeProfile, 'p3');
  assert.equal(h.state().applied, true);
});

test('mode selection does not silently pause browser; conflict stays blocked', async () => {
  const h = harness();
  h.click('set-mode', {value: 'direct'});
  assert.equal(h.state().applied, true);
  assert.equal(h.state().activeMode, 'profile');
  assert.match(h.markup(), /应用更改/);
  h.click('status-button');
  assert.equal(h.state().activeMode, 'direct');
  h.click('select-profile', {value: 'p2'});
  await new Promise(resolve => setTimeout(resolve, 360));
  assert.equal(h.state().activeMode, 'profile');
  assert.equal(h.state().activeProfile, 'p2');
  h.selectScene('conflict');
  h.click('select-profile', {value: 'p1'});
  assert.equal(h.state().scene, 'conflict');
  assert.equal(h.state().applied, false);
});
