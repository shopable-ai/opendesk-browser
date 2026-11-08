import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {load} from 'cheerio';
import vm from 'node:vm';

// preview.html is now the portable R18-sidebar/R16-management integration.
// Keep the linked historical R18 consumer covered too; its PC UI lives in R16,
// so the former inline R17 managementHeader byte hash no longer has an owner.
const previews = ['preview.html', 'ai-proxy-interactive-preview-r18.html'];

function harness(file, t) {
  const html = readFileSync(new URL('../preview/' + file, import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, `${file} interactive script should exist`);
  const portable = file === 'preview.html';
  const listeners = {};
  const elements = {};
  const timers = new Set();
  const element = id => elements[id] ??= {
    id, innerHTML: '', hidden: false, value: 'normal', scrollTop: 0, dataset: {},
    classList: {toggle() {}},
    setAttribute() {}, getAttribute(name) { return load(html)(`#${id}`).attr(name); },
    addEventListener(type, handler) { (listeners[id] ??= {})[type] = handler; },
    querySelector() { return null; }, scrollIntoView() {}, focus() {}
  };
  const document = {
    body: {dataset: {}},
    getElementById: element,
    querySelectorAll(selector) {
      return load(html)(selector).toArray().map(node => {
        const el = element(node.attribs.id || node.attribs['data-compare']);
        el.dataset = Object.fromEntries(Object.entries(node.attribs)
          .filter(([name]) => name.startsWith('data-')).map(([name, value]) => [name.slice(5), value]));
        return el;
      });
    },
    querySelector() { return null; },
    addEventListener(type, handler) { listeners[type] = handler; }
  };
  const messages = [];
  element('pc-preview-frame').contentWindow = {postMessage(data) { messages.push(data); }};
  const window = {addEventListener(type, handler) { listeners['window:' + type] = handler; }};
  const context = vm.createContext({document, window, URL, console, clearTimeout,
    setTimeout(callback, delay) { const timer = setTimeout(callback, delay); timers.add(timer); return timer; }});
  t.after(() => { for (const timer of timers) clearTimeout(timer); });
  const inspect = '\nglobalThis.inspectPreview = {state:()=>s};\n';
  vm.runInContext(portable ? script.replace(/\}\)\(\);\s*$/, inspect + '})();') : script + inspect, context);
  const actions = portable ? {'select-profile': 'pick', 'status-button': 'status', 'set-mode': 'mode', 'go-pc': 'open-pc'} : {};
  function click(action, extras = {}) {
    const dataset = {action: actions[action] || action, ...extras};
    if (portable && 'value' in extras) { dataset.id = extras.value; delete dataset.value; }
    if (portable && 'section' in extras) { dataset.id = extras.section; delete dataset.section; }
    const handler = portable ? listeners.app.click : listeners.click;
    handler({target: {closest: () => ({dataset})}});
  }
  return {state: context.inspectPreview.state, click,
    switching: () => portable ? context.inspectPreview.state().switching : context.inspectPreview.state().switchingTo,
    selectScene(value) {
      const event = {target: {id: 'scene', value}};
      if (portable) listeners.scene.change(event); else listeners.change(event);
    },
    markup: () => element('app').innerHTML,
    element, messages,
    loadPc() { listeners['pc-preview-frame'].load(); },
    backFromPc() {
      const init = messages.find(message => message.type === 'init');
      assert.ok(init, 'R16 frame received initialization');
      listeners['window:message']({source: element('pc-preview-frame').contentWindow,
        data: {protocol: init.protocol, nonce: init.nonce, type: 'back'}});
    }
  };
}

for (const file of previews) {
const portable = file === 'preview.html';
test(`${file}: management opens the current PC consumer and returns without changing the applied route`, t => {
  const h = harness(file, t);
  assert.ok(load(h.markup())(`[data-action="${portable ? 'open-pc' : 'go-pc'}"]`).length);
  h.click('go-pc', {section: portable ? 'proxies' : 'profiles'});
  assert.equal(h.state().view, 'pc');
  if (portable) {
    const nav = load(h.markup())('.pc-nav button');
    assert.deepEqual(nav.toArray().map(node => node.attribs['data-id']),
      ['proxies', 'rules', 'thirdparty', 'import', 'diagnostics', 'general', 'official']);
    for (const node of nav.toArray()) {
      h.click('go-pc', {section: node.attribs['data-id']});
      const page = load(h.markup());
      assert.equal(page('.pc-nav [aria-current="page"]').attr('data-id'), node.attribs['data-id']);
      assert.ok(page('#pcContent').text().trim(), 'each management section renders content');
    }
    assert.ok(load(h.markup())('[data-action="back-side"]').length);
    h.click('back-side');
  } else {
    assert.equal(h.element('app').hidden, true);
    assert.equal(h.element('pc-host').hidden, false);
    assert.equal(h.element('pc-preview-frame').getAttribute('src'), './ai-proxy-interactive-preview-r16.html?embed=pc#options/proxies');
    h.loadPc();
    assert.equal(h.messages.find(message => message.type === 'navigate')?.section, 'profiles');
    h.backFromPc();
    assert.equal(h.element('app').hidden, false);
    assert.equal(h.element('pc-host').hidden, true);
  }
  assert.equal(h.state().view, 'side');
  assert.equal(h.state().activeProfile, 'p1');
  assert.equal(h.state().applied, true);
  assert.match(h.markup(), /使用中/);
});

test(`${file}: running proxy switch is not reported as paused, pending is distinct`, async t => {
  const h = harness(file, t);
  assert.equal(h.state().activeProfile, 'p1');
  assert.match(h.markup(), /使用中/);
  h.click('select-profile', {value: 'p2'});
  assert.equal(h.switching(), 'p2');
  assert.equal(h.state().activeProfile, 'p1', 'old applied route is retained during switch');
  assert.equal(h.state().applied, true);
  assert.match(h.markup(), /切换中/);
  assert.doesNotMatch(load(h.markup())('.status-card, .status-box').text(), /已暂停/);
  await new Promise(resolve => setTimeout(resolve, 360));
  assert.equal(h.state().activeProfile, 'p2');
  assert.equal(h.switching(), null);
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

test(`${file}: mode selection does not silently pause browser; conflict stays blocked`, async t => {
  const h = harness(file, t);
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
}
