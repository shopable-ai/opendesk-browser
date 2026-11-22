import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {JSDOM} from 'jsdom';
import {mountVideoSidebar} from '../src/main.js';

const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const author = JSON.parse(readFileSync(new URL('../locales.json', import.meta.url), 'utf8'));
const sourceCatalog = {sourceLocale: author.sourceLocale,
  messages: {[author.sourceLocale]: author.messages[author.sourceLocale]}};
const linked = {state: 'ready', binding: 'player-1', draftTarget: 'draft-1', context: {
  seriesKey: 'iyf:series', episodeKey: 'episode-1', title: '测试作品', episode: '1',
}, media: {duration: 1200, revision: 1, time: 42, paused: false}};
const failure = code => Object.assign(new Error(code), {code});
const settle = () => new Promise(resolve => setImmediate(resolve));

function mount(t, initial) {
  const {window} = new JSDOM(html, {pretendToBeVisual: true});
  const root = window.document.body;
  let poll, result = initial;
  window.setInterval = callback => { poll = callback; return 1; };
  const calls = [];
  const dispose = mountVideoSidebar({root, messages: sourceCatalog, locale: 'zh-CN', async request(name, args) {
    calls.push(args.operation ?? name);
    if (name === 'storage.get') return {value: {series: {}}, etag: 'saved'};
    assert.equal(name, 'page.request');
    assert.ok(['video.snapshot', 'video.refresh'].includes(args.operation));
    if (result instanceof Error) throw result;
    return result;
  }});
  t.after(() => { dispose(); window.close(); });
  return {calls, get: id => root.querySelector('#vas-' + id),
    async next(value) { result = value; poll(); await settle(); },
    async pageChanged(value) { result = value; root.dispatchEvent(new window.Event('opendesk-page-changed')); await settle(); },
    edit(id, value) {
      const input = root.querySelector('#vas-' + id);
      input.value = value;
      input.dispatchEvent(new window.Event('input', {bubbles: true}));
    }};
}

test('first open keeps the controls visible, explains webpage reload and recovers when the module connects', async t => {
  const ui = mount(t, failure('E_PAGE_AUTHORIZATION'));
  await settle();
  assert.equal(ui.get('settings').hidden, false);
  assert.equal(ui.get('save').disabled, true);
  assert.match(ui.get('page-status').textContent, /刷新当前播放页/);
  assert.equal(ui.get('feedback').hidden, true);
  await ui.next(linked);
  assert.match(ui.get('page-status').textContent, /播放器已连接/);
  assert.equal(ui.get('intro-end').disabled, false);
  assert.deepEqual(ui.calls, ['storage.get', 'video.snapshot', 'video.snapshot']);
});

test('offscreen playback stays editable; temporary detection loss preserves the visible draft and locks actions', async t => {
  const ui = mount(t, linked);
  await settle();
  ui.edit('intro-end', '01:30');
  assert.equal(ui.get('save').disabled, false);
  await ui.next({...linked, offscreen: true});
  assert.match(ui.get('page-status').textContent, /屏幕外/);
  assert.equal(ui.get('save').disabled, false);

  await ui.next({state: 'unavailable', reason: 'iYF 正片正在加载，或播放器当前无法唯一确认。'});
  assert.equal(ui.get('settings').hidden, false);
  assert.equal(ui.get('work').textContent, '测试作品');
  assert.equal(ui.get('intro-end').value, '01:30');
  assert.equal(ui.get('intro-end').disabled, true);
  assert.equal(ui.get('save').disabled, true);
  assert.equal(ui.get('player').hidden, true);
  assert.match(ui.get('page-status').textContent, /等待/);

  await ui.next({...linked, binding: 'player-2'});
  assert.equal(ui.get('intro-end').value, '01:30');
  assert.equal(ui.get('save').disabled, false);
  await ui.pageChanged({state: 'unsupported'});
  assert.equal(ui.get('work').textContent, '连播助手');
  assert.equal(ui.get('settings').hidden, false);
  assert.equal(ui.get('intro-end').value, '');
  assert.equal(ui.get('save').disabled, true);
  assert.match(ui.get('page-status').textContent, /打开支持的播放页/);
});

test('a different player in the same episode does not inherit the draft', async t => {
  const ui = mount(t, linked);
  await settle();
  ui.edit('intro-end', '01:30');
  await ui.next({state: 'unavailable'});
  await ui.next({...linked, binding: 'different-player', draftTarget: 'draft-2'});
  assert.equal(ui.get('work').textContent, '测试作品');
  assert.equal(ui.get('intro-end').value, '');
  assert.equal(ui.get('save').disabled, true);
  assert.match(ui.get('feedback').textContent, /旧草稿未保存/);
});

test('a required webpage reload is not retried until the browser reports a new page', async t => {
  const ui = mount(t, failure('E_APP_PAGE_RELOAD_REQUIRED'));
  await settle();
  assert.match(ui.get('page-status').textContent, /刷新当前播放页/);
  await ui.next(linked);
  assert.deepEqual(ui.calls, ['storage.get', 'video.snapshot']);
  await ui.pageChanged(linked);
  assert.match(ui.get('page-status').textContent, /播放器已连接/);
  assert.equal(ui.get('intro-end').disabled, false);
});
