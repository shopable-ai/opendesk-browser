import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const html = await readFile('examples/tasks/demo-form.html', 'utf8');
const source = html.split('// CHATGPT_CORE_DOM_EVIDENCE_START')[1].split('// CHATGPT_CORE_DOM_EVIDENCE_END')[0];
function harness(query = '') {
  const values = new Map(), listeners = new Map(), windowListeners = new Map();
  const nodes = new Map(['lab-search', 'search-form', 'keyword', 'search-status', 'results', 'search-count'].map(id => [id,
    {value: '', textContent: '', hidden: false, prepend() {}, addEventListener(type, fn) { listeners.set(type, fn); }}]));
  nodes.get('keyword').value = '旧的预填内容';
  nodes.get('search-status').hidden = true;
  nodes.get('search-count').textContent = '提交次数：0';
  const created = [];
  let mutation;
  const context = {URL, location: {href: 'http://127.0.0.1:43111/demo-form.html' + query},
    crypto: {randomUUID: () => 'unique-document'}, Date, queueMicrotask,
    document: {getElementById: id => nodes.get(id), createElement: () => {
      const node = {style: {}, setAttribute() {}, append() {}}; created.push(node); return node;
    }},
    window: {addEventListener: (type, fn) => windowListeners.set(type, fn)},
    localStorage: {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)},
    MutationObserver: class {constructor(fn) { mutation = fn; } observe() {}}};
  runInNewContext(source, context);
  return {nodes, values, listeners, windowListeners, created, context, mutate: () => mutation()};
}

test('ordinary and invalid URLs do not observe, store or modify the fixture', () => {
  for (const query of ['', '?od-evidence=bad!', '?od-watch=x']) {
    const h = harness(query);
    assert.equal(h.values.size, 0);
    assert.equal(h.listeners.size, 0);
    assert.equal(h.created.length, 0);
  }
});

test('evidence records actual DOM effects, counts and clicks without inferring completion', async () => {
  const h = harness('?od-evidence=unique-search');
  const read = () => JSON.parse([...h.values.values()][0]);
  assert.equal(read().records.at(-1).result, '');
  h.nodes.get('keyword').value = 'unique-value';
  h.listeners.get('input')();
  h.listeners.get('click')({target: {closest: () => true}});
  h.nodes.get('search-count').textContent = '提交次数：1';
  h.listeners.get('submit')();
  await Promise.resolve();
  assert.equal(read().records.at(-1).result, '', 'submit alone does not become success');
  h.nodes.get('search-status').hidden = false;
  h.nodes.get('search-status').textContent = '搜索完成';
  h.nodes.get('results').textContent = '结果：unique-value';
  h.mutate();
  const last = read().records.at(-1);
  assert.equal(last.keyword, 'unique-value');
  assert.equal(last.result, '结果：unique-value');
  assert.equal(last.count, '提交次数：1');
  assert.equal(last.clicks, 1);
  assert.equal(read().documentId, 'unique-document');
  for (let i = 0; i < 20; ++i) h.mutate();
  assert.equal(read().records.length, 16);
  assert.equal(h.values.size, 1);
});

test('watch mode only renders matching stored DOM evidence as text', () => {
  const h = harness('?od-watch=unique-search');
  assert.equal(h.values.size, 0);
  assert.equal(h.listeners.size, 0);
  const output = h.created[2];
  assert.match(output.textContent, /尚无证据/);
  const key = 'opendesk.demo.dom-evidence.v1:unique-search';
  h.values.set(key, JSON.stringify({protocol: 'opendesk.demo.dom-evidence.v1', token: 'unique-search', result: '<script>unsafe</script>'}));
  h.windowListeners.get('storage')({key});
  assert.match(output.textContent, /<script>unsafe<\/script>/);
  assert.equal(output.innerHTML, undefined);
});
