import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext, runInContext} from 'node:vm';

// Deliberately a manual DOM/event model, following ui-r03. These tests execute
// the actual preview Host and product JS; they are NOT MAC_CHROME evidence,
// media playback tests, or evidence of real-site/R031 recognition.
const previewURL = new URL('../preview/index.html', import.meta.url);
const mainURL = new URL('../src/main.js', import.meta.url);
const plain = value => JSON.parse(JSON.stringify(value));
const ticks = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };

class Node {
  constructor(tagName = 'div', attrs = {}) {
    this.tagName = tagName; this.attrs = new Map(); this.dataset = {};
    this.children = []; this.listeners = new Map(); this.parentNode = null;
    this.value = ''; this.hidden = false; this.disabled = false; this._text = '';
    this.style = {setProperty() {}};
    for (const [name, value] of Object.entries(attrs)) this.setAttribute(name, value);
  }
  setAttribute(name, value) {
    this.attrs.set(name, String(value));
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
    if (['id', 'value', 'href', 'class'].includes(name)) this[name === 'class' ? 'className' : name] = String(value);
    if (['hidden', 'disabled', 'selected', 'open'].includes(name)) this[name] = true;
  }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  removeAttribute(name) { this.attrs.delete(name); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  append(...children) { for (const child of children) { child.parentNode = this; this.children.push(child); } }
  replaceChildren(...children) { this._text = ''; this.children = []; this.append(...children); }
  addEventListener(kind, fn, options = {}) {
    const listeners = this.listeners.get(kind) || [];
    listeners.push({fn, once: options.once}); this.listeners.set(kind, listeners);
  }
  removeEventListener(kind, fn) { this.listeners.set(kind, (this.listeners.get(kind) || []).filter(item => item.fn !== fn)); }
  dispatchEvent(event) {
    event.target ??= this; event.currentTarget = this;
    for (const {fn, once} of [...this.listeners.get(event.type) || []]) {
      if (once) this.removeEventListener(event.type, fn);
      fn(event);
    }
    if (event.bubbles && this.parentNode) this.parentNode.dispatchEvent(event);
    return true;
  }
  fire(type, fields = {}) {
    this.dispatchEvent({type, bubbles: true, preventDefault() {}, ...fields});
  }
  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return (this.className || '').split(/\s+/).includes(selector.slice(1));
    const match = selector.match(/^([\w-]+)?(?:\[([^=\]]+)(?:=["']?([^\]"']+)["']?)?\])?$/);
    if (!match) throw Error('Unsupported manual selector: ' + selector);
    const [, tag, attr, value] = match;
    if (tag && tag !== this.tagName) return false;
    if (!attr) return true;
    const actual = attr === 'open' ? (this.open ? '' : null) :
      attr.startsWith('data-') ? this.dataset[attr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] : this.getAttribute(attr);
    return actual !== undefined && actual !== null && (value === undefined || actual === value);
  }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) || null; }
  contains(node) {
    for (let current = node; current; current = current.parentNode) if (current === this) return true;
    return false;
  }
  focus() {
    let document = this;
    while (document.parentNode) document = document.parentNode;
    if (document.tagName === 'document') {
      if (document.activeElement) document.activeElement.focused = false;
      document.activeElement = this;
    }
    this.focused = true;
  }
  select() { this.selected = true; }
  // No simulated successful media observations; playback is outside this suite.
  pause() { this.paused = true; }
  load() {}
  play() { throw Error('Media playback is outside preview-ui VM coverage'); }
}

function parseBody(html) {
  const document = new Node('document'), stack = [document];
  const body = html.slice(html.indexOf('<body>'), html.indexOf('<script>'));
  const voidTags = new Set(['input', 'br', 'hr', 'img', 'meta', 'link', 'source']);
  for (const token of body.matchAll(/<!--[\s\S]*?-->|<\/([\w-]+)\s*>|<([\w-]+)\b([^>]*)>|([^<]+)/g)) {
    if (token[0].startsWith('<!--')) continue;
    if (token[1]) { if (stack.at(-1).tagName === token[1]) stack.pop(); continue; }
    if (!token[2]) { stack.at(-1)._text += token[4]; continue; }
    const attrs = {};
    for (const attr of token[3].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[attr[1]] = attr[2] ?? attr[3] ?? attr[4] ?? '';
    const node = new Node(token[2], attrs); stack.at(-1).append(node);
    if (!voidTags.has(token[2]) && !token[3].endsWith('/')) stack.push(node);
  }
  document.getElementById = id => document.querySelector('#' + id);
  document.createElement = tag => new Node(tag);
  document.documentElement = new Node('html');
  document.activeElement = document.querySelector('body');
  for (const select of document.querySelectorAll('select')) {
    select.value = (select.children.find(option => option.selected) || select.children[0])?.value || '';
  }
  return document;
}

async function harness(scene = 'tencent', {clipboard = true, product = true} = {}) {
  const html = await readFile(previewURL, 'utf8');
  const document = parseBody(html), root = document.getElementById('tool-root');
  const location = new URL('https://preview.invalid/projects/video-svip/preview/index.html?scene=' + scene);
  const window = new Node('window'), timers = new Map(), calls = [], copied = [], states = [];
  let timerId = 0;
  const sandbox = {document, window, location, URL, URLSearchParams, structuredClone,
    console, queueMicrotask, AbortController, Event: class { constructor(type) { this.type = type; } },
    navigator: {clipboard: {writeText: async text => { if (!clipboard) throw Error('clipboard denied'); copied.push(text); }}},
    setTimeout(fn, delay = 0) { const id = ++timerId; timers.set(id, {fn, delay}); return id; },
    clearTimeout(id) { timers.delete(id); }};
  // Browser window and globalThis share properties; preserve that for the bridge.
  Object.defineProperty(sandbox, 'OpenDeskTool', {get: () => window.OpenDeskTool});
  const context = createContext(sandbox);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  for (const script of scripts.filter(script => !/\bsrc\s*=/.test(script[1]))) {
    runInContext(script[2], context, {filename: previewURL.pathname});
  }
  assert.ok(window.OpenDeskTool, 'actual preview inline script installs its Host');
  const setState = window.OpenDeskTool.setState;
  window.OpenDeskTool.setState = state => { states.push(plain(state)); return setState(state); };
  const request = window.OpenDeskTool.request;
  window.OpenDeskTool.request = (op, args) => {
    calls.push({op, args: args && plain(args)});
    return request(op, args);
  };
  if (product) {
    const entry = scripts.find(script => /\bsrc=["']\.\.\/src\/main\.js["']/.test(script[1]));
    assert.ok(entry, 'preview loads the formal product entry');
    runInContext(await readFile(mainURL, 'utf8'), context, {filename: mainURL.pathname});
    await ticks();
  }
  const node = id => { const result = document.getElementById(id); assert.ok(result, 'missing preview control #' + id); return result; };
  const flush = async () => {
    await ticks();
    // Only execute one batch: no recursive polling or fake media-time advance.
    const active = [...timers]; timers.clear();
    for (const [, {fn}] of active) fn();
    await ticks();
  };
  const click = async id => { node(id).fire('click'); await flush(); };
  const choose = async mode => {
    const button = document.querySelectorAll('button').find(button => button.dataset.demo === mode);
    assert.ok(button, 'missing scene ' + mode); button.fire('click'); await flush();
  };
  return {document, root, node, calls, copied, states, location, choose, click, flush,
    request: (...args) => window.OpenDeskTool.request(...args)};
}

const originalScenes = ['tencent', 'bilibili', 'youtube', 'switch', 'total', 'changing',
  'unsupported', 'permission', 'watchfail', 'iframe', 'storagefail'];
const reads = h => h.request('storage.get', {key: 'memberships', withEtag: true});
const sets = h => h.calls.filter(call => call.op === 'storage.set');
async function save(h, id, expiry) {
  h.node('vp-member-provider').value = id;
  h.node('vp-member-provider').fire('change');
  h.node('vp-member-expiry').value = expiry;
  h.node('vp-member-expiry').fire('input');
  await h.click('vp-member-save');
}

test('all original scenes execute actual Host + UI and expose only safe official entries', async t => {
  for (const scene of originalScenes) await t.test(scene, async () => {
    const h = await harness(scene);
    for (const original of originalScenes) assert.ok(h.document.querySelectorAll('button').some(button => button.dataset.demo === original));
    const open = h.node('vp-open');
    if (['permission', 'unsupported'].includes(scene)) {
      assert.equal(open.hidden, true); assert.equal(h.node('vp-copy').disabled, true);
    } else {
      assert.equal(open.hidden, false);
      const url = new URL(open.href);
      assert.equal(url.protocol, 'https:');
      assert.ok(['v.qq.com', 'www.bilibili.com', 'www.youtube.com'].includes(url.hostname));
      assert.equal(open.getAttribute('target'), '_blank');
      assert.equal(open.getAttribute('rel'), 'noopener noreferrer');
    }
    if (scene === 'permission') assert.match(h.node('vp-page-state').textContent, /权限不足/);
    if (scene === 'tencent') {
      assert.equal(h.node('vp-title').textContent, '演示作品 · 星海来信');
      assert.equal(h.node('vp-episode').textContent, '第 12 集');
    }
    if (scene === 'bilibili') {
      assert.equal(h.node('vp-title').textContent, '演示番剧 · 风从海边来');
      assert.equal(h.node('vp-episode').textContent, '第 6 话');
      assert.doesNotMatch(h.node('vp-title').textContent + h.node('vp-episode').textContent, /3854821/);
    }
    if (scene === 'watchfail') assert.match(h.node('vp-evidence-text').textContent, /自动监听不可用/);
    if (scene === 'iframe') assert.match(h.node('vp-evidence-text').textContent, /iframe 未全面检测/);
    if (['total', 'changing', 'iframe'].includes(scene)) assert.equal(h.node('vp-episode').textContent, '集数未知');
    assert.equal(h.node('vp-source-play').hidden, true);
    assert.equal(sets(h).length, 0);
  });
});

test('loading snapshots every pending A response; release drains all after same-URL B wins', async () => {
  const h = await harness('loading');
  assert.ok(h.calls.some(call => call.op === 'videoSVIP.inspect'));
  assert.equal(h.node('vp-copy').disabled, true);
  let first, second;
  const p1 = h.request('videoSVIP.inspect').then(value => { first = value; });
  const p2 = h.request('videoSVIP.inspect').then(value => { second = value; });
  await ticks(); assert.equal(first, undefined); assert.equal(second, undefined);
  await h.choose('switch');
  const current = await h.request('videoSVIP.inspect');
  assert.equal(current.episode.number, 3);
  assert.equal(h.node('vp-title').textContent, current.title);
  const before = h.node('vp-title').textContent;
  await h.click('demo-release');
  // Assert before awaiting: a broken release must fail instead of hanging tests.
  assert.ok(first, 'release resolves first pending response');
  assert.ok(second, 'release resolves every pending response');
  await Promise.all([p1, p2]);
  assert.equal(first.canonicalPageUrl, current.canonicalPageUrl);
  assert.equal(first.siteId, 'tencent');
  assert.notEqual(first.title, current.title); assert.equal(first.episode.number, 12);
  assert.deepEqual(plain(first), plain(second));
  assert.equal(h.node('vp-title').textContent, before);
  assert.match(h.node('vp-episode').textContent, /3/);
  await h.click('demo-release'); // drained, harmless repeat
  assert.equal(h.node('vp-title').textContent, before);
});

for (const resume of ['vp-refresh', 'vp-recheck']) test(`Stop survives scene changes and late release; ${resume} explicitly resumes`, async () => {
  const h = await harness('loading');
  await h.click('vp-stop');
  assert.equal(h.root.dataset.paused, 'true');
  const inspected = h.calls.filter(call => call.op === 'videoSVIP.inspect').length;
  await h.choose('switch'); await h.click('demo-release');
  assert.equal(h.calls.filter(call => call.op === 'videoSVIP.inspect').length, inspected);
  assert.equal(h.root.dataset.paused, 'true');
  assert.equal(h.node('demo-stop-note').hidden, false);
  assert.equal(h.node('vp-title').textContent, '已停止识别');
  assert.equal(h.node('vp-copy').disabled, true);
  await h.click(resume);
  assert.equal(h.root.dataset.paused, 'false');
  assert.equal(h.node('demo-stop-note').hidden, true);
  const current = await h.request('videoSVIP.inspect');
  assert.equal(h.node('vp-title').textContent, current.title);
  assert.equal(h.node('vp-copy').disabled, false);
});

test('inspectfail is a general read error and can recover through another scene', async () => {
  const h = await harness('inspectfail');
  await assert.rejects(h.request('videoSVIP.inspect'), error => {
    assert.notEqual(error.code, 'E_VIDEO_SITE_ACCESS');
    assert.doesNotMatch(error.message, /权限|授权|permission/i); return true;
  });
  assert.equal(h.node('vp-page-state').dataset.kind, 'error');
  assert.doesNotMatch(h.node('vp-page-state').textContent, /权限不足/);
  assert.equal(h.node('vp-open').hidden, true);
  await h.choose('tencent');
  assert.equal(h.node('vp-page-state').dataset.kind, 'ready');
  assert.equal(h.node('vp-copy').disabled, false);
});

test('unrecognized supplies no invented title or episode', async () => {
  const h = await harness('unrecognized');
  const value = await h.request('videoSVIP.inspect');
  assert.equal(value.title, null); assert.equal(value.episode, 'unknown');
  assert.equal(value.recognitionState, 'unrecognized');
  assert.equal(h.node('vp-title').textContent, '未识别影片');
  assert.equal(h.node('vp-episode').textContent, '集数未知');
});

test('YouTube demo uses an explicit demo title and a watch URL with unknown episode', async () => {
  const h = await harness('youtube'), ctx = await h.request('videoSVIP.inspect');
  const url = new URL(ctx.canonicalPageUrl);
  assert.equal(url.pathname, '/watch'); assert.equal(url.searchParams.get('v'), 'aqz-KE-bpKQ');
  assert.match(ctx.title, /演示|demo/i); assert.equal(ctx.episode, 'unknown');
  assert.equal(h.node('vp-title').textContent, ctx.title);
});

test('copy succeeds through clipboard and fallback selects the same official link', async () => {
  for (const clipboard of [true, false]) {
    const h = await harness('youtube', {clipboard}); await h.click('vp-copy');
    if (clipboard) {
      assert.deepEqual(h.copied, [h.node('vp-open').href]);
      assert.equal(h.node('vp-manual-wrap').hidden, true);
    } else {
      assert.equal(h.node('vp-manual-wrap').hidden, false);
      assert.equal(h.node('vp-manual').value, h.node('vp-open').href);
      assert.equal(h.node('vp-manual').focused, true);
      assert.equal(h.node('vp-manual').selected, true);
    }
  }
});

test('document Escape closes details/manual copy and restores summary/copy focus in the manual DOM', async () => {
  const h = await harness('tencent', {clipboard: false});
  const details = h.root.querySelectorAll('details');
  assert.ok(details.length > 0);
  for (const detail of details) detail.open = true;
  const evidence = h.node('vp-evidence'), content = h.node('vp-evidence-text');
  content.focus();
  assert.equal(h.document.activeElement, content);
  h.document.fire('keydown', {key: 'Escape'});
  for (const detail of details) assert.equal(detail.open, false);
  assert.equal(h.node('vp-manual-wrap').hidden, true);
  assert.equal(h.document.activeElement, evidence.querySelector('summary'));
  assert.equal(content.focused, false);

  await h.click('vp-copy');
  assert.equal(h.node('vp-manual-wrap').hidden, false);
  assert.equal(h.document.activeElement, h.node('vp-manual'));
  evidence.open = true;
  h.document.fire('keydown', {key: 'Escape'});
  assert.equal(evidence.open, false);
  assert.equal(h.node('vp-manual-wrap').hidden, true);
  assert.equal(h.document.activeElement, h.node('vp-copy'));
  assert.equal(h.node('vp-manual').focused, false);
});

test('membership add/update/delete and invalid date survive preview tab listeners', async () => {
  const h = await harness();
  let version = (await reads(h)).etag;
  const advanced = async () => {
    const next = (await reads(h)).etag;
    assert.match(next, /^[0-9a-f]{64}$/);
    assert.ok(BigInt('0x' + next) > BigInt('0x' + version)); version = next;
  };
  const tab = mode => h.root.querySelector(`[data-vp-tab=${mode}]`);
  tab('member').fire('click'); await h.flush();
  assert.equal(h.node('vp-member').hidden, false); assert.equal(h.node('vp-watch').hidden, true);
  await save(h, 'tencent', '2031-02-30');
  assert.equal(sets(h).length, 0); assert.match(h.node('vp-flash').textContent, /有效/);
  await save(h, 'tencent', '2031-03-05');
  await advanced();
  assert.deepEqual(plain((await reads(h)).value), [{id: 'tencent', expiry: '2031-03-05'}]);
  assert.deepEqual(h.states.at(-1), {dirty: false, busy: false});
  assert.equal(h.node('vp-member-expiry').value, '2031-03-05');
  assert.match(h.node('vp-member-list').textContent, /2031-03-05/);
  assert.match(h.node('vp-member-save').textContent, /更新/);
  tab('watch').fire('click'); await h.flush();
  assert.equal(h.node('vp-watch').hidden, false); assert.equal(h.node('vp-member').hidden, true);
  tab('member').fire('click'); await h.flush();
  await save(h, 'tencent', '2032-04-06');
  await advanced();
  assert.deepEqual(plain((await reads(h)).value), [{id: 'tencent', expiry: '2032-04-06'}]);
  const remove = h.node('vp-member-list').querySelector('button');
  assert.ok(remove); remove.fire('click'); await h.flush();
  await advanced();
  assert.deepEqual(plain((await reads(h)).value), []);
  assert.equal(h.node('vp-member-expiry').value, '');
  assert.equal(sets(h).length, 3);
});

test('member-row clicks preserve dirty platform/date and cannot retarget a busy write', async () => {
  const h = await harness();
  h.root.querySelector('[data-vp-tab=member]').fire('click'); await h.flush();
  await save(h, 'iqiyi', '2032-02-02');
  await save(h, 'tencent', '2031-01-01');
  const otherRow = () => {
    const row = h.node('vp-member-list').children.find(row => row.querySelector('strong')?.textContent === '爱奇艺');
    assert.ok(row); return row;
  };
  h.node('vp-member-expiry').value = '2033-03-03';
  h.node('vp-member-expiry').fire('input');
  assert.deepEqual(h.states.at(-1), {dirty: true, busy: false});
  const writes = sets(h).length;
  otherRow().querySelector('strong').fire('click'); await h.flush();
  assert.equal(h.node('vp-member-provider').value, 'tencent');
  assert.equal(h.node('vp-member-expiry').value, '2033-03-03');
  assert.equal(sets(h).length, writes);
  assert.match(h.node('demo-storage-status').textContent, /未切换记录/);
  await h.click('vp-member-save');
  assert.deepEqual(plain((await reads(h)).value), [
    {id: 'iqiyi', expiry: '2032-02-02'}, {id: 'tencent', expiry: '2033-03-03'}
  ]);
  assert.deepEqual(h.states.at(-1), {dirty: false, busy: false});

  // A clean-draft deletion isolates busy from dirty before the Host responds.
  const deleting = h.node('vp-member-list').children.find(row => row.querySelector('strong')?.textContent === '腾讯视频');
  assert.ok(deleting); deleting.querySelector('button').fire('click');
  assert.deepEqual(h.states.at(-1), {dirty: false, busy: true});
  otherRow().querySelector('span').fire('click');
  assert.equal(h.node('vp-member-provider').value, 'tencent');
  assert.equal(h.node('vp-member-expiry').value, '2033-03-03');
  await h.flush();
  assert.deepEqual(plain((await reads(h)).value), [{id: 'iqiyi', expiry: '2032-02-02'}]);
  assert.equal(h.node('vp-member-provider').value, 'tencent');
});

test('paused storagefail selection cannot navigate or restart recognition before explicit resume', async () => {
  const h = await harness(), start = h.location.href;
  await h.click('vp-stop');
  const inspected = h.calls.filter(call => call.op === 'videoSVIP.inspect').length;
  await h.choose('storagefail');
  assert.equal(h.location.href, start);
  assert.equal(h.root.dataset.demo, 'tencent');
  assert.equal(h.root.dataset.paused, 'true');
  assert.equal(h.node('vp-title').textContent, '已停止识别');
  assert.equal(h.node('vp-copy').disabled, true);
  assert.equal(h.node('demo-stop-note').hidden, false);
  assert.match(h.node('demo-storage-status').textContent, /先.*重新识别/);
  assert.equal(h.calls.filter(call => call.op === 'videoSVIP.inspect').length, inspected);
  await h.click('vp-refresh');
  assert.equal(h.root.dataset.paused, 'false');
  assert.equal(h.node('vp-copy').disabled, false);
  await h.choose('storagefail');
  assert.equal(new URL(h.location.href).searchParams.get('scene'), 'storagefail');
});

test('storagefail navigation guards real dirty/busy state and only requests reload when clean', async () => {
  const h = await harness(), start = h.location.href;
  h.node('vp-member-expiry').value = '2031-07-08';
  h.node('vp-member-expiry').fire('input');
  assert.deepEqual(h.states.at(-1), {dirty: true, busy: false});
  await h.choose('storagefail');
  assert.equal(h.location.href, start);
  assert.match(h.node('demo-storage-status').textContent, /未保存|尚未确认/);
  assert.equal(h.node('vp-member-expiry').value, '2031-07-08');
  await h.click('vp-member-save');
  assert.deepEqual(h.states.at(-1), {dirty: false, busy: false});
  assert.equal(h.node('vp-member-expiry').value, '2031-07-08');
  // Deletion has a clean draft but an unresolved write: exercise busy alone
  // before the real Host's microtask responds, without replacing its storage.
  h.node('vp-member-list').querySelector('button').fire('click');
  assert.deepEqual(h.states.at(-1), {dirty: false, busy: true});
  await h.choose('storagefail');
  assert.equal(h.location.href, start);
  assert.deepEqual(h.states.at(-1), {dirty: false, busy: false});
  await h.choose('storagefail');
  assert.equal(new URL(h.location.href).searchParams.get('scene'), 'storagefail');
  assert.equal(h.root.dataset.demo, 'tencent', 'VM records explicit navigation intent; it does not fake a reload');
  const failed = await harness('storagefail');
  await failed.choose('tencent');
  assert.equal(new URL(failed.location.href).searchParams.get('scene'), 'tencent');
});

test('external-window conflict changes etag and refuses stale ifMatch without losing its record', async () => {
  const h = await harness(), old = await reads(h);
  await h.click('demo-conflict');
  const changed = await reads(h);
  assert.match(changed.etag, /^[0-9a-f]{64}$/);
  assert.ok(BigInt('0x' + changed.etag) > BigInt('0x' + old.etag));
  assert.deepEqual(plain(changed.value), [{id: 'tencent', expiry: '2035-05-05'}]);
  await assert.rejects(h.request('storage.set', {key: 'memberships', value: [], ifMatch: old.etag}));
  await save(h, 'tencent', '2031-01-01');
  assert.deepEqual(plain(await reads(h)), plain(changed));
  assert.match(h.node('vp-flash').textContent, /未确认保存成功/);
  assert.equal(h.node('vp-member-save').disabled, true);
  assert.deepEqual(h.states.at(-1), {dirty: true, busy: false});
  await h.click('demo-conflict');
  assert.ok(BigInt('0x' + (await reads(h)).etag) > BigInt('0x' + changed.etag));
});

test('writefail toggle explicitly rejects writes without mutating records or etag', async () => {
  const h = await harness();
  await save(h, 'tencent', '2031-01-01');
  const before = await reads(h);
  await h.click('demo-writefail');
  await assert.rejects(h.request('storage.set', {key: 'memberships', value: [], ifMatch: before.etag}), /保存|写入|失败/);
  await save(h, 'tencent', '2032-01-01');
  assert.deepEqual(plain(await reads(h)), plain(before));
  assert.match(h.node('vp-flash').textContent, /未确认保存成功/);
  assert.equal(h.node('vp-member-save').disabled, true);
  await h.click('demo-writefail');
  const result = await h.request('storage.set', {key: 'memberships', value: [], ifMatch: before.etag});
  assert.match(result.etag, /^[0-9a-f]{64}$/);
  assert.deepEqual(plain((await reads(h)).value), []);
});

test('storagefail startup disables edits and never attempts storage.set', async () => {
  const h = await harness('storagefail');
  await assert.rejects(reads(h));
  assert.equal(h.node('vp-member-save').disabled, true);
  assert.match(h.node('vp-flash').textContent, /存储读取失败/);
  await save(h, 'tencent', '2031-01-01');
  h.node('vp-member-form').fire('submit'); await h.flush();
  assert.equal(sets(h).length, 0);
});
