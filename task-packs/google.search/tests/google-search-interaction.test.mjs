import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {verifyTaskPackage, validateTaskParams} from '../../../src/platform/tasks/contract.js';
import {digestUtf8} from '../../../src/platform/protocol.js';

const source = await readFile(new URL('../src/google-search-interaction-top3.js', import.meta.url), 'utf8');
const selectors = {
  input: 'form[action="/search"] textarea[name="q"]',
  submit: 'form[action="/search"] input[name="btnK"]',
  links: '#rso a:has(h3)',
  ads: '#rso [data-text-ad] a:has(h3),#rso [data-ad] a:has(h3),#rso [data-ad-slot] a:has(h3)'
};
const plain = value => JSON.parse(JSON.stringify(value));
const error = code => Object.assign(new Error(code), {code});

async function run({url = 'https://www.google.com/', params = {query: 'OpenDesk Browser', limit: 3},
  calls = [], failAt, failure = error('E_PERMISSION'), readbacks = [],
  beforeSubmitUrl, navigationUrl, submitUrl, initialBody = 'Google', body = 'Public results',
  links = [{title: 'Public result', href: 'https://example.org/one'}], ads = []} = {}) {
  let value = '', documentId = 'initial', submitted = false, reads = 0;
  async function step(action, details = {}) {
    calls.push({action, ...plain(details)});
    if (action === failAt) throw failure;
  }
  function locator(selector, index) {
    assert.ok(['body', '#rso', 'h3', ...Object.values(selectors)].includes(selector), `Unexpected locator: ${selector}`);
    const row = () => links[index];
    return {
      nth(n) { return locator(selector, n); },
      first() { return locator(selector, 'first'); },
      locator(child) {
        assert.equal(selector, selectors.links);
        assert.equal(child, 'h3');
        return locator(child, index);
      },
      async count() {
        if (selector === selectors.links) { await step('results.count'); return links.length; }
        if (selector === selectors.ads) return ads.length;
        if (selector === 'h3') return row().headings ?? 1;
        assert.fail(`Unexpected count: ${selector}`);
      },
      async fill(text, options) {
        assert.equal(selector, selectors.input);
        await step('fill', {text, options}); value = text;
      },
      async inputValue() {
        assert.equal(selector, selectors.input);
        const actual = reads < readbacks.length ? readbacks[reads] : value;
        await step('readback', {value: actual}); reads++;
        return actual;
      },
      async click(options) {
        assert.equal(selector, selectors.submit);
        assert.equal(index, 'first', 'Only the autocomplete submit button may be clicked');
        await step('submit.click', {options});
        submitted = true; documentId = 'results';
        url = submitUrl ?? `https://www.google.com/search?q=${encodeURIComponent(value)}`;
      },
      async waitFor(options) {
        if (selector === selectors.submit) {
          assert.equal(index, 'first');
          await step('submit.visible', {options});
          if (beforeSubmitUrl) url = beforeSubmitUrl;
          return;
        }
        assert.equal(selector, '#rso');
        assert.equal(submitted, true, 'Results must be observed after submission');
        await step('results.visible', {options});
      },
      async innerText() {
        if (selector === 'body') return submitted ? body : initialBody;
        assert.equal(selector, 'h3'); return row().title;
      },
      async getAttribute(name) {
        assert.equal(name, 'href');
        assert.ok(selector === selectors.links || selector === selectors.ads);
        return selector === selectors.ads ? ads[index] : row().href;
      },
      async isVisible() { assert.equal(selector, selectors.links); return row().visible !== false; }
    };
  }
  const result = await vm.runInNewContext(`${source}\nmain()`, {
    params, URL, Date,
    page: {
      url: async () => url,
      bringToFront: async () => step('bringToFront'),
      goto: async (next, options) => {
        await step('goto', {url: next, options}); url = navigationUrl ?? next; documentId = 'homepage';
      },
      observe: async () => ({document: {documentId}}),
      locator
    }
  });
  return {calls, result: plain(result)};
}

const actions = calls => calls.map(call => call.action);
const interaction = ['fill', 'readback', 'submit.visible', 'readback', 'submit.click'];

test('interaction package verifies its independent identity, exact source, Origin and permission', async () => {
  const pkg = JSON.parse(await readFile(new URL('../releases/google.search.interaction.top3.v1.opendesk-task.json', import.meta.url), 'utf8'));
  await verifyTaskPackage(pkg);
  assert.equal(pkg.manifest.taskId, 'google.search.interaction.top3');
  assert.equal(pkg.manifest.version, '1.0.0');
  assert.notEqual(pkg.manifest.taskId, 'google.search.top3');
  assert.equal(pkg.sourceUtf8, source);
  assert.equal(pkg.manifest.program.sourceHash, await digestUtf8(source));
  assert.deepEqual(pkg.manifest.siteOrigins, ['https://www.google.com']);
  assert.deepEqual(pkg.manifest.permissions, ['page.automation']);
  for (const extra of [{}, {showExecutionTab: true}, {showExecutionTab: false}]) {
    const params = validateTaskParams(pkg.manifest.paramsSchema, {query: 'Google 测试', limit: 3, ...extra});
    assert.equal(params.showExecutionTab, extra.showExecutionTab !== false);
  }
  for (const params of [{query: '', limit: 3}, {query: 'test', limit: 2},
    {query: 'test', limit: 3, extra: true}, {query: 'test', limit: 3, showExecutionTab: 'false'}]) {
    assert.throws(() => validateTaskParams(pkg.manifest.paramsSchema, params));
  }
});

test('homepage reads actual input, waits for the popup submit, then clicks once without goto', async () => {
  const query = '时间清单 & + #';
  for (const url of ['https://www.google.com/', 'https://www.google.com/webhp?hl=zh-CN']) {
    const {calls, result} = await run({url, params: {query, limit: 3}});
    assert.deepEqual(actions(calls), ['bringToFront', ...interaction, 'results.visible', 'results.count']);
    assert.deepEqual(calls.filter(x => x.action === 'readback').map(x => x.value), [query, query]);
    assert.equal(calls.find(x => x.action === 'fill').text, query);
    assert.deepEqual(calls.find(x => x.action === 'submit.visible').options, {state: 'visible', timeout: 8000});
    assert.deepEqual(calls.find(x => x.action === 'submit.click').options, {waitUntil: 'domcontentloaded', timeout: 15000});
    assert.equal(result.kind, 'google.search.interaction.top3.result');
    assert.equal(result.status, 'success'); assert.equal(result.inputMode, 'isolated-dom');
    assert.equal(result.query, query); assert.equal(new URL(result.sourceUrl).searchParams.get('q'), query);
    assert.deepEqual(result.trace.find(x => x.action === 'submit'), {
      action: 'submit', count: 1, waitUntil: 'domcontentloaded', beforeDocumentId: 'initial', documentId: 'results'
    });
  }
});

test('same and changed queries on results pages first load homepage, then interact once', async () => {
  for (const previous of ['OpenDesk Browser', 'other query']) {
    const {calls, result} = await run({url: `https://www.google.com/search?q=${encodeURIComponent(previous)}`});
    assert.deepEqual(actions(calls), ['bringToFront', 'goto', ...interaction, 'results.visible', 'results.count']);
    assert.deepEqual(calls[1], {action: 'goto', url: 'https://www.google.com/', options: {waitUntil: 'load', timeout: 15000}});
    assert.equal(result.trace.find(x => x.action === 'submit').beforeDocumentId, 'homepage');
    assert.equal(result.status, 'success');
  }
});

test('missing autocomplete submit stops before clicking without dismissal or URL fallback', async () => {
  const calls = [];
  await assert.rejects(run({calls, failAt: 'submit.visible', failure: error('E_TIMEOUT')}), {code: 'E_TIMEOUT'});
  assert.deepEqual(actions(calls), ['bringToFront', 'fill', 'readback', 'submit.visible']);
});

test('both input readbacks are enforced before submitting', async () => {
  for (const readbacks of [['different'], ['OpenDesk Browser', 'different']]) {
    const calls = [];
    await assert.rejects(run({calls, readbacks}), {code: 'E_SEARCH_INPUT'});
    assert.equal(actions(calls).at(-1), 'readback');
    assert.equal(calls.filter(x => x.action === 'fill').length, 1);
    assert.equal(calls.some(x => ['goto', 'submit.click', 'results.count'].includes(x.action)), false);
  }
});

test('permission, Stop and unknown effects reject at the failed action without replay or success', async () => {
  for (const code of ['E_PERMISSION', 'E_CANCELLED', 'E_EFFECT_UNKNOWN']) {
    for (const failAt of ['bringToFront', 'goto', 'fill', 'readback', 'submit.visible', 'submit.click', 'results.visible']) {
      const calls = [], failure = error(code);
      const expected = ['bringToFront', 'goto', ...interaction, 'results.visible'];
      await assert.rejects(run({url: 'https://www.google.com/search?q=old', calls, failAt, failure}), thrown => thrown === failure);
      assert.deepEqual(actions(calls), expected.slice(0, expected.indexOf(failAt) + 1));
      assert.ok(calls.filter(x => x.action === 'submit.click').length <= 1);
    }
  }
});

test('changed targets before submit or unexpected destinations reject without fallback', async () => {
  const targets = ['https://elsewhere.example/', 'https://www.google.com/maps',
    'https://user:pass@www.google.com/', 'https://www.google.com:444/', 'https://www.google.com/?changed=1'];
  for (const beforeSubmitUrl of targets) {
    const calls = [];
    await assert.rejects(run({calls, beforeSubmitUrl}), {code: 'E_TARGET'});
    assert.equal(calls.some(x => ['goto', 'submit.click'].includes(x.action)), false);
  }
  for (const submitUrl of [...targets, 'https://www.google.com/', 'https://www.google.com/search?q=other']) {
    const calls = [];
    await assert.rejects(run({calls, submitUrl}), {code: 'E_TARGET'});
    assert.deepEqual(actions(calls), ['bringToFront', ...interaction]);
  }
  for (const navigationUrl of ['https://www.google.com/search?q=old', 'https://elsewhere.example/']) {
    const calls = [];
    await assert.rejects(run({calls, url: 'https://www.google.com/search?q=old', navigationUrl}), {code: 'E_TARGET'});
    assert.deepEqual(actions(calls), ['bringToFront', 'goto']);
  }
});

test('invalid exact Origins, credentials and page paths reject before interaction', async () => {
  for (const url of ['http://www.google.com/', 'https://google.com/', 'https://www.google.com.evil.test/',
    'https://www.google.com:444/', 'https://user:pass@www.google.com/', 'https://www.google.com/maps']) {
    const calls = [];
    await assert.rejects(run({url, calls}), {code: 'E_TARGET'});
    assert.deepEqual(calls, []);
  }
});

test('invalid parameters reject before any interaction', async () => {
  const invalid = [null, {}, ...['', ' ', 'a'.repeat(121), null, 3].map(query => ({query, limit: 3})),
    ...[undefined, null, 2, '3'].map(limit => ({query: 'test', limit})),
    ...[undefined, null, 'false', 0, {}, []].map(showExecutionTab => ({query: 'test', limit: 3, showExecutionTab})),
    {query: 'test', limit: 3, unknown: true}];
  for (const params of invalid) {
    const calls = [];
    await assert.rejects(run({params, calls}), {code: 'E_TASK_PARAMS'});
    assert.deepEqual(calls, []);
  }
});

test('foreground defaults on and may be disabled without skipping interaction', async () => {
  for (const extra of [{}, {showExecutionTab: true}, {showExecutionTab: false}]) {
    const {calls, result} = await run({params: {query: 'OpenDesk Browser', limit: 3, ...extra}});
    assert.deepEqual(actions(calls), [...(extra.showExecutionTab === false ? [] : ['bringToFront']), ...interaction, 'results.visible', 'results.count']);
    assert.equal(result.status, 'success');
  }
});

test('challenges stop before input or after submission without retry', async () => {
  for (const text of ['unusual traffic CAPTCHA', '验证码', '异常流量']) {
    const calls = [];
    await assert.rejects(run({calls, initialBody: text}), {code: 'E_SEARCH_BLOCKED'});
    assert.deepEqual(actions(calls), ['bringToFront']);
    const after = [];
    await assert.rejects(run({calls: after, body: text}), {code: 'E_SEARCH_BLOCKED'});
    assert.deepEqual(actions(after), ['bringToFront', ...interaction]);
  }
});

test('result extraction excludes ads, hidden and invalid links, normalizes and deduplicates URLs, and caps at three', async () => {
  const links = [
    {title: 'Sponsored', href: 'https://ad.example/'},
    {title: 'Hidden', href: 'https://hidden.example/', visible: false},
    {title: 'No heading', href: 'https://noheading.example/', headings: 0},
    {title: 'Blank link', href: null}, {title: '  ', href: 'https://blank.example/'},
    {title: 'Script', href: 'javascript:alert(1)'}, {title: 'Credentials', href: 'https://user:pass@example.org/'},
    {title: 'Invalid', href: 'https://['}, {title: 'Long', href: `https://example.org/${'x'.repeat(1000)}`},
    {title: '  First\n result  ', href: 'https://example.org/one'},
    {title: 'Duplicate', href: 'https://example.org/one'},
    {title: 'Redirect', href: '/goto?url=public-result&gsessionid=one'},
    {title: 'Duplicate redirect', href: '/goto?url=public-result&gsessionid=two'},
    {title: 'Third', href: 'http://example.org/three'}, {title: 'Fourth', href: 'https://example.org/four'}
  ];
  const {result} = await run({links, ads: ['https://ad.example/']});
  assert.equal(result.count, 3);
  assert.deepEqual(result.results, [
    {position: 1, title: 'First result', url: 'https://example.org/one'},
    {position: 2, title: 'Redirect', url: 'https://www.google.com/goto?url=public-result'},
    {position: 3, title: 'Third', url: 'http://example.org/three'}
  ]);
});

test('explicit no results is distinct from unrecognized or unavailable result content', async () => {
  for (const body of ['did not match any documents', '找不到和您查询', '没有找到']) {
    for (const failAt of [undefined, 'results.visible']) {
      const {result} = await run({links: [], body, failAt, failure: error('E_TIMEOUT')});
      assert.equal(result.status, 'no_results'); assert.equal(result.count, 0); assert.deepEqual(result.results, []);
    }
  }
  await assert.rejects(run({links: []}), {code: 'E_SEARCH_RESULTS'});
  await assert.rejects(run({failAt: 'results.visible', failure: error('E_TIMEOUT')}), {code: 'E_TIMEOUT'});
  await assert.rejects(run({body: '没有找到', failAt: 'results.visible', failure: error('E_PERMISSION')}), {code: 'E_PERMISSION'});
});
