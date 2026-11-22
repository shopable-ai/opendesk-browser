import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {JSDOM} from 'jsdom';
import {bindI18n, createTranslator, translateStatic} from '../src/i18n.js';
import {mountVideoSidebar} from '../src/main.js';

const author = JSON.parse(readFileSync(new URL('../locales.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const locales = ['zh-CN', 'en', 'ja', 'zh-TW'];
const sources = author.messages[author.sourceLocale];
const catalog = {sourceLocale: author.sourceLocale,
  messages: Object.fromEntries(locales.map(locale => [locale, Object.fromEntries(
    Object.entries(author.messages[locale]).map(([key, value]) =>
      [key, locale === author.sourceLocale ? value : value.text]))]))};
const placeholders = value => [...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)]
  .map(match => match[1]).sort();

test('all four language catalogs stay within official budget and keep source/placeholder contracts', () => {
  assert.equal(author.sourceLocale, 'zh-CN');
  assert.ok(Buffer.byteLength(JSON.stringify(author)) <= 96000);
  const keys = Object.keys(sources);
  assert.ok(keys.length > 100 && keys.length <= 160);
  for (const locale of locales) {
    assert.deepEqual(Object.keys(author.messages[locale]).sort(), keys.slice().sort());
    for (const key of keys) {
      assert.match(key, /^[a-z][a-zA-Z0-9]{0,63}$/);
      const base = sources[key];
      const raw = author.messages[locale][key];
      const text = locale === author.sourceLocale ? raw : raw.text;
      if (locale !== author.sourceLocale) assert.equal(raw.source, base, locale + ':' + key);
      assert.deepEqual(placeholders(text), placeholders(base), locale + ':' + key);
      assert.ok(text.trim() && text.length <= 380, locale + ':' + key);
      assert.doesNotMatch(text, /<|>|(?:javascript|data):|[\u202A-\u202E\u2066-\u2069]/i, locale + ':' + key);
    }
  }
});

test('source fallback, language selection, interpolation and End token', () => {
  assert.equal(createTranslator(catalog, 'en')('saveSettings'), 'Save settings');
  assert.equal(createTranslator(catalog, 'ja-JP')('saveSettings'), '設定を保存');
  assert.equal(createTranslator(catalog, 'zh-TW')('saveSettings'), '儲存設定');
  assert.equal(createTranslator(catalog, 'fr')('saveSettings'), '保存设置');
  const incomplete = structuredClone(catalog);
  delete incomplete.messages.ja.saveSettings;
  assert.equal(createTranslator(incomplete, 'ja')('saveSettings'), '保存设置');
  assert.match(createTranslator(catalog, 'en')('episodeLabel', {episode: '12'}), /12/);
  assert.match(createTranslator(catalog, 'en')('tailHelp'), /End/);
  const hostile = createTranslator(catalog, 'en')('episodeLabel', {episode: '<script>'});
  assert.ok(hostile.includes('<script>'), 'translator outputs plain text; DOM must use textContent');
});

test('HTML localization never parses translated strings as markup', t => {
  const dom = new JSDOM('<main><button data-i18n="saveSettings"></button></main>');
  t.after(() => dom.window.close());
  const evil = structuredClone(catalog);
  evil.messages.en.saveSettings = '<img src=x onerror=alert(1)>';
  const dispose = bindI18n({locale: 'en', messages: evil}, () => translateStatic(dom.window.document));
  t.after(dispose);
  assert.equal(dom.window.document.querySelector('button').textContent, evil.messages.en.saveSettings);
  assert.equal(dom.window.document.querySelector('img'), null);
});

const snap = {state: 'ready', binding: 'p1', draftTarget: 'p1',
  context: {seriesKey: 'local:show', episodeKey: 'ep1', title: 'Example Show',
    season: 1, episode: 1, line: 'Main'},
  media: {duration: 1200, revision: 1, time: 30, paused: true}};
const settle = () => new Promise(resolve => setImmediate(resolve));

test('live locale change preserves draft, focus, four time inputs, End and causes no business request', async t => {
  const dom = new JSDOM(html, {pretendToBeVisual: true});
  t.after(() => dom.window.close());
  const root = dom.window.document.body;
  const calls = [];
  let onChange, unregistered = false, stateCalls = 0;
  const tool = {root, locale: 'zh-CN', messages: catalog,
    onLocaleChange(listener) { onChange = listener; return () => {unregistered = true; }; },
    setState() { stateCalls++; },
    async request(name, args) {
      calls.push(name === 'page.request' ? args.operation : name);
      if (name === 'storage.get') return {value: {series: {}}, etag: 'etag-1'};
      assert.equal(name, 'page.request');
      assert.equal(args.operation, 'video.snapshot');
      return snap;
    }};
  const dispose = mountVideoSidebar(tool);
  t.after(dispose);
  await settle();
  const ids = ['intro-start', 'intro-end', 'outro-start', 'outro-end'];
  const inputs = ids.map(id => root.querySelector('#vas-' + id));
  assert.ok(inputs.every(input => input?.matches('input')));
  const end = root.querySelector('#vas-outro-end');
  assert.equal(end.placeholder, 'End');
  const intro = root.querySelector('#vas-intro-end');
  intro.value = '01:30';
  intro.dispatchEvent(new dom.window.Event('input', {bubbles: true}));
  assert.equal(root.querySelector('#vas-save').disabled, false);
  intro.focus();
  const before = calls.slice(), beforeState = stateCalls;
  tool.locale = 'en'; onChange('en');
  assert.deepEqual(calls, before, 'locale switch cannot request player or storage');
  assert.equal(stateCalls, beforeState, 'locale switch cannot mutate dirty/busy state');
  assert.equal(dom.window.document.activeElement, intro, 'keyboard focus stays on the same input');
  assert.equal(intro.value, '01:30', 'unsaved text stays untouched');
  assert.equal(root.querySelector('.vas-match-label').textContent, 'Ending status');
  assert.match(root.querySelector('#vas-tail-match').textContent, /No ending rule is set/);
  const endingSwitch = root.querySelector('#vas-rule-outro');
  const name = endingSwitch.getAttribute('aria-labelledby').split(' ')
    .map(id => root.querySelector('#' + id).textContent).join(' ');
  assert.equal(name, 'Ending Enable rule');
  assert.equal(end.placeholder, 'End');
  assert.equal(root.querySelector('#vas-refresh').textContent, 'Detect again');
  assert.equal(root.querySelector('#vas-save').textContent, 'Save settings');
  assert.equal(root.querySelector('#vas-intro-start').getAttribute('aria-label'), 'Opening Start time');
  assert.match(root.querySelector('.vas-track').getAttribute('aria-label'), /Opening/);
  tool.locale = 'ja'; onChange('ja');
  assert.equal(intro.value, '01:30');
  assert.equal(root.querySelector('#vas-save').textContent, '設定を保存');
  tool.locale = 'zh-TW'; onChange('zh-TW');
  assert.equal(root.querySelector('#vas-save').textContent, '儲存設定');
  assert.equal(end.placeholder, 'End');
  assert.deepEqual(calls, before);
  dispose();
  assert.equal(unregistered, true);
});
