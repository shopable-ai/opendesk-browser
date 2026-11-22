import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {JSDOM} from 'jsdom';
import {updateScope} from '../src/rules.js';
import {mountVideoSidebar} from '../src/main.js';

const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const author = JSON.parse(readFileSync(new URL('../locales.json', import.meta.url), 'utf8'));
const sourceCatalog = {sourceLocale: author.sourceLocale,
  messages: {[author.sourceLocale]: author.messages[author.sourceLocale]}};
const linked = {state: 'ready', binding: 'player-1', draftTarget: 'draft-1', context: {
  seriesKey: 'iyf:series', episodeKey: 'episode-1', title: '测试作品', episode: '1',
}, media: {duration: 1200, revision: 1, time: 42, paused: false}};
const localLinked = {...linked, context: {
  ...linked.context, seriesKey: 'local:series:season-1', season: 'season-1', line: 'primary',
}};
const failure = code => Object.assign(new Error(code), {code});
const settle = () => new Promise(resolve => setImmediate(resolve));

function mount(t, initial, defaults = {}, episodes = {}) {
  const {window} = new JSDOM(html, {pretendToBeVisual: true});
  const root = window.document.body;
  let poll, result = initial;
  window.setInterval = callback => { poll = callback; return 1; };
  const calls = [], writes = [];
  const seriesKey = initial?.context?.seriesKey ?? linked.context.seriesKey;
  let stored = {series: {[seriesKey]: {defaults, episodes}}};
  const dispose = mountVideoSidebar({root, messages: sourceCatalog, locale: 'zh-CN', async request(name, args) {
    calls.push(args.operation ?? name);
    if (name === 'storage.get') return {value: stored, etag: 'saved'};
    assert.equal(name, 'page.request');
    if (args.operation === 'video.save') {
      const {scope, rules} = args.payload;
      writes.push({scope, rules});
      stored = updateScope(stored, result.context, scope, rules);
      return {saved: true};
    }
    assert.ok(['video.snapshot', 'video.refresh'].includes(args.operation));
    if (result instanceof Error) throw result;
    return result;
  }});
  t.after(() => { dispose(); window.close(); });
  return {calls, writes, get: id => root.querySelector('#vas-' + id),
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

test('the same inherited tail displays both points for the currently bound duration without saving again', async t => {
  const ui = mount(t, {...localLinked, media: {...localLinked.media, duration: 1243.563}},
    {outro: {kind: 'tail', seconds: 88}}, {'episode-1': {next: false}});
  const points = () => [ui.get('outro-start').value, ui.get('outro-end').value];
  await settle();
  assert.deepEqual(points(), ['19:15', 'End']);
  await ui.next({...localLinked, media: {...localLinked.media, duration: 1156.011, revision: 2}});
  assert.deepEqual(points(), ['17:48', 'End']);
  assert.match(ui.get('tail-match').textContent, /当前视频 17:48–19:16.*自动计算.*来自作品规则.*已生效/);
  assert.equal(ui.get('outro-start').disabled, false);
  assert.equal(ui.get('outro-start').parentElement.dataset.endpointState, 'calculated');
  ui.get('clear-outro-start').click();
  assert.deepEqual(points(), ['17:48', 'End']);
  assert.match(ui.get('tail-match').textContent, /本集无自定义开始时间可清除/);
  assert.equal(ui.get('save').disabled, true);
  assert.equal(ui.get('preview-outro').disabled, false);
  await ui.next({...localLinked, media: {...localLinked.media, duration: null, revision: 3}});
  assert.deepEqual(points(), ['', '']);
  assert.match(ui.get('tail-match').textContent, /等待当前视频时长/);
  assert.equal(ui.get('preview-outro').disabled, true);
  assert.deepEqual(ui.calls, ['storage.get', 'video.snapshot', 'video.snapshot', 'video.snapshot']);
});

test('a suggested start is a placeholder and never reads as an active rule', async t => {
  const ui = mount(t, linked);
  await settle();
  const start = ui.get('outro-start');
  assert.equal(start.value, '');
  assert.equal(start.placeholder, '18:30');
  assert.match(ui.get('tail-match').textContent, /尚未设置片尾规则，不会自动跳过/);
  assert.equal(ui.get('save').disabled, true);
  ui.edit('outro-start', '18:30');
  assert.match(ui.get('tail-match').textContent, /手动设置.*来自本集设置.*待保存/);
  assert.doesNotMatch(ui.get('tail-match').textContent, /已生效/);
});

test('an out-of-bounds fixed default is only a reference and can be corrected for the current episode', async t => {
  const ui = mount(t, {...localLinked, media: {...localLinked.media, duration: 1156.011}},
    {outro: {kind: 'fixed', start: 1155, end: 1243}}, {'episode-1': {next: false}});
  await settle();
  assert.equal(ui.get('outro-start').value, '');
  assert.equal(ui.get('outro-end').value, '');
  assert.match(ui.get('tail-match').textContent, /无可用片尾区间，不会自动跳过/);
  assert.match(ui.get('summary-outro').textContent, /作品默认 · 19:15–20:43（当前视频未采用）/);
  assert.equal(ui.get('preview-outro').disabled, true);
  assert.equal(ui.get('save').disabled, true);
  ui.edit('outro-start', '18:30');
  ui.edit('outro-end', '19:10');
  assert.match(ui.get('tail-match').textContent, /18:30–19:10.*待保存/);
  assert.match(ui.get('summary-outro').textContent, /已保存：19:15–20:43（当前视频未采用）/);
  assert.equal(ui.get('save').disabled, false);
  ui.get('cancel').click();
  assert.match(ui.get('tail-match').textContent, /不会自动跳过/);
  assert.equal(ui.get('outro-start').value, '');
  assert.deepEqual(ui.calls, ['storage.get', 'video.snapshot']);
});

test('matching an unavailable fixed default uses its length as a draft and requires a valid duration', async t => {
  const defaults = {outro: {kind: 'fixed', start: 1155, end: 1243}};
  const withDuration = duration => ({...localLinked, media: {...localLinked.media, duration}});
  const ui = mount(t, withDuration(1156.011), defaults, {'episode-1': {next: false}});
  const match = ui.get('match-outro-length');
  await settle();
  assert.equal(match.hidden, false);
  assert.match(match.textContent, /01:28/);
  match.click();
  assert.deepEqual([ui.get('outro-start').value, ui.get('outro-end').value], ['17:48', 'End']);
  assert.match(ui.get('tail-match').textContent, /手动设置.*倒数 01:28.*待保存/);
  assert.equal(ui.get('outro-end-slider').dataset.bound, 'true');
  assert.equal(ui.get('save').disabled, false);
  assert.equal(match.hidden, true);
  ui.get('cancel').click();
  assert.equal(ui.get('outro-start').value, '');
  assert.match(ui.get('tail-match').textContent, /不会自动跳过/);
  await ui.next(withDuration(null));
  assert.equal(match.hidden, true);
  assert.match(ui.get('tail-match').textContent, /等待当前视频时长/);
  await ui.next(withDuration(88));
  assert.equal(match.hidden, true, 'would skip the entire video');
  assert.equal(ui.get('save').disabled, true);
  await ui.next(withDuration(1243.72));
  assert.equal(match.hidden, true, 'a usable fixed end stays fixed');
  assert.equal(ui.get('outro-end-slider').dataset.bound, 'false');
  assert.match(ui.get('tail-match').textContent, /固定区间/);
  assert.deepEqual(ui.calls, ['storage.get', 'video.snapshot', 'video.snapshot', 'video.snapshot', 'video.snapshot']);
});

for (const method of ['clear button', 'empty input']) test('episode outro ' + method + ' restores the work End rule after saving', async t => {
  const ui = mount(t, localLinked, {outro: {kind: 'tail', seconds: 88}},
    {'episode-1': {outro: {kind: 'fixed', start: 1050, end: 1160}}});
  await settle();
  if (method === 'clear button') ui.get('clear-outro-start').click();
  else ui.edit('outro-start', '');
  assert.equal(ui.get('save').disabled, false);
  ui.get('save').click();
  await settle();
  assert.deepEqual(ui.writes, [{scope: 'episode', rules: {}}]);
  assert.match(ui.get('tail-match').textContent, /18:32–20:00.*自动计算.*来自作品规则/);
  assert.equal(ui.get('restore-outro').hidden, true);
});

test('verified local disabled exception stays off until explicitly restored', async t => {
  const ui = mount(t, {...localLinked, media: {...localLinked.media, duration: 1156.011}},
    {outro: {kind: 'tail', seconds: 88}}, {'episode-1': {outro: null, next: false}});
  await settle();
  assert.match(ui.get('tail-match').textContent, /自动跳过已关闭/);
  assert.equal(ui.get('restore-outro').hidden, false);
  assert.equal(ui.get('rule-outro').checked, false);
  ui.get('restore-outro').click();
  ui.get('save').click();
  await settle();
  assert.deepEqual(ui.writes.at(-1), {scope: 'episode', rules: {next: false}});
  assert.match(ui.get('tail-match').textContent, /17:48–19:16.*自动计算.*来自作品规则/);
  ui.get('rule-outro').click();
  ui.get('save').click();
  await settle();
  assert.deepEqual(ui.writes.at(-1), {scope: 'episode', rules: {next: false, outro: {kind: 'tail', seconds: 88, enabled: false}}});
  assert.match(ui.get('tail-match').textContent, /自动跳过已关闭/);
});

test('R13: archived iYF work defaults do not silently become active episode rules', async t => {
  const ui = mount(t, linked, {
    intro: {kind: 'fixed', start: 0, end: 140},
    outro: {kind: 'tail', seconds: 88},
  });
  await settle();
  assert.deepEqual([ui.get('outro-start').value, ui.get('outro-end').value], ['', '']);
  assert.match(ui.get('tail-match').textContent, /尚未设置片尾规则，不会自动跳过/);
  assert.match(ui.get('scope-help').textContent, /兼容验证/);
  assert.match(ui.get('summary-outro').textContent, /当前视频未采用/);
  assert.equal(ui.get('save').disabled, true);
});

test('R13: archived iYF fixed outro remains usable only as an explicit R10 episode draft', async t => {
  const ui = mount(t, {...linked, media: {...linked.media, duration: 1156.011}},
    {outro: {kind: 'fixed', start: 1155, end: 1243}});
  await settle();
  const match = ui.get('match-outro-length');
  assert.equal(match.hidden, false);
  assert.match(match.textContent, /01:28/);
  assert.match(ui.get('tail-match').textContent, /不会自动跳过/);
  match.click();
  assert.deepEqual([ui.get('outro-start').value, ui.get('outro-end').value], ['17:48', 'End']);
  assert.equal(ui.get('save').disabled, false);
  assert.deepEqual(ui.writes, [], 'preview and match must not persist a rule before Save');
});
