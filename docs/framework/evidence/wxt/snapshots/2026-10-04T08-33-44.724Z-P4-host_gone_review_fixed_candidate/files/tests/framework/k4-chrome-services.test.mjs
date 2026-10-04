import test from 'node:test';
import assert from 'node:assert/strict';
import {createCookieService, extractDomainFromUrl} from '../../src/platform/chrome/cookies.js';
import {chromeCall, checkLastError, createTabsService} from '../../src/platform/chrome/tabs.js';
import {createNotificationService} from '../../src/platform/chrome/notifications.js';
import {SDK_FILES, fail} from '../../src/framework/sdk/registry.js';
const code = expected => error => error?.code === expected;

test('SVC cookie reads use exact URL; no public-suffix or neighboring-domain expansion', async () => {
  const calls = [], phases = [];
  const api = {runtime: {}, cookies: {getAll(details, callback) { calls.push(details); callback([]); }}};
  const driver = createCookieService({api, authorize: async request => { phases.push(request); }});
  assert.deepEqual(await driver.getCookies('https://a.example.co.uk/path'), []);
  assert.deepEqual(calls, [{url: 'https://a.example.co.uk/path'}]); assert.equal(extractDomainFromUrl('a.example.co.uk/path'), 'a.example.co.uk');
  assert.throws(() => extractDomainFromUrl('https://['), code('E_SCHEMA')); assert.deepEqual(phases.map(request => request.phase), ['pre', 'post']);
});
test('SVC cookie batch preserves explicit expiry/default session and Host-prefix rules', async () => {
  const set = [], api = {runtime: {}, cookies: {set(item, callback) { set.push(item); setImmediate(() => callback(item)); }}};
  const driver = createCookieService({api, authorize: async () => {}});
  await driver.setCookies([{domain: 'example.test', name: 'persistent', value: '0', expirationDate: 2000000000},
    {domain: 'example.test', name: 'session', value: 'false'}, {url: 'https://example.test/', domain: '.example.test', name: '__Host-id', value: 'x', path: '/wrong'}]);
  assert.equal(set[0].expirationDate, 2000000000); assert.equal(Object.hasOwn(set[1], 'expirationDate'), false);
  assert.equal(Object.hasOwn(set[2], 'domain'), false); assert.equal(set[2].path, '/'); assert.equal(set[2].secure, true);
  await assert.rejects(driver.setCookies([{url: 'https://a.example.test', domain: '.example.test', name: 'x', value: 'x'}]), code('E_SCHEMA'));
  await assert.rejects(driver.setCookies([{domain: 'example.test', name: '__Host-id', value: 'x'}]), code('E_SCHEMA'));
});
test('SVC cookie removal awaits all callbacks and checks each permission', async () => {
  const removed = [], phases = []; let done = false;
  const api = {runtime: {}, cookies: {getAll(details, callback) { callback([{name: 'a', path: '/foo', storeId: '0'}, {name: 'b', path: '/bar'}]); },
    remove(details, callback) { removed.push(details); setTimeout(() => callback(details), 2); }}};
  const driver = createCookieService({api, authorize: async request => { phases.push(request); }});
  const pending = driver.deleteCookiesByUrl('https://example.test/foo').then(() => { done = true; });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(done, false); await pending;
  assert.equal(removed.length, 2); assert.equal(removed[0].url, 'https://example.test/foo');
  assert.equal(phases.filter(request => request.method === 'remove' && request.phase === 'pre').length, 2);
});
test('SVC Chrome lastError and missing cookie callbacks are typed failures', async () => {
  const api = {runtime: {lastError: {message: 'native failure'}}, cookies: {getAll(details, callback) { callback([]); }}};
  assert.throws(() => checkLastError(api), code('E_CHROME'));
  await assert.rejects(createCookieService({api, authorize: async () => {}}).getCookies('https://example.test'), code('E_CHROME'));
  delete api.runtime.lastError; api.cookies.set = (details, callback) => callback(null);
  await assert.rejects(createCookieService({api, authorize: async () => {}}).setCookies([{domain: 'example.test', name: 'x', value: 'x'}]), code('E_CHROME'));
  await assert.rejects(chromeCall(api, {}, 'unknown'), code('E_CAPABILITY'));
});
test('SVC fixed injection requires exact doc and correct resource/world before Chrome call', async () => {
  const calls = [], api = {runtime: {}, scripting: {executeScript(details, callback) { calls.push(details); callback([]); }}};
  const driver = createTabsService({api, authorize: async () => {}});
  const target = {tabId: 7, documentIds: ['docA']};
  await driver.injectFixed({target, file: SDK_FILES.relay, world: 'ISOLATED'});
  await driver.injectFixed({target, file: SDK_FILES.main, world: 'MAIN'});
  await assert.rejects(driver.injectFixed({target, file: 'arbitrary.js', world: 'MAIN'}), code('E_SCHEMA'));
  await assert.rejects(driver.injectFixed({target: {tabId: 7, allFrames: true}, file: SDK_FILES.main, world: 'MAIN'}), code('E_SCHEMA'));
  assert.equal(calls.length, 2); await assert.rejects(createTabsService({api}).injectFixed({target, file: SDK_FILES.main, world: 'MAIN'}), code('E_PERMISSION'));
});
test('SVC notification click has no page URL, clears once, close/late events do not resettle', async () => {
  const listeners = () => { const set = new Set(); return {addListener: cb => set.add(cb), removeListener: cb => set.delete(cb), emit: (...args) => { for (const cb of set) cb(...args); }, count: () => set.size}; };
  const onClosed = listeners(), onClicked = listeners(), events = [], clears = [];
  const api = {runtime: {}, notifications: {onClosed, onClicked, create(id, options, callback) { callback('notification-id'); }, clear(id, callback) { clears.push(id); callback(true); }}};
  const driver = createNotificationService({api, authorize: async () => {}, iconUrl: 'fixed.svg', onLifecycle: event => events.push(event)});
  assert.equal(await driver.create({title: 'x', content: 'x'}, {requestId: 'request'}), undefined);
  assert.equal(events[0].delivery, 'unobserved'); onClicked.emit('notification-id'); onClicked.emit('notification-id'); onClosed.emit('notification-id', true);
  assert.deepEqual(clears, ['notification-id']); assert.equal(events.filter(event => event.kind === 'clicked').length, 1);
  assert.equal(driver.diagnostics().active, 0); driver.dispose(); assert.equal(onClicked.count() + onClosed.count(), 0);
});
