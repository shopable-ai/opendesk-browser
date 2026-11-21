import assert from 'node:assert/strict';
import test from 'node:test';
import { COOKIE_JOURNAL_KEY, readCookieJournal } from '../src/cookie-journal.js';
import { createLocalFixture } from '../dev/local-test/local-fixture-server.mjs';
import { runtime, fixtureRequest, EXTENSION_ORIGIN, NEW_ORIGIN, MANUAL_ORIGIN, PREFERENCE, RECOVERY } from './helpers/controller-fixture.mjs';

const manualTarget = MANUAL_ORIGIN + '/manual-session/';
const preference = serviceOrigin => ({ schemaVersion: 2, enabled: true, serviceOrigin });

test('explicit development switch stays read-only until the user previews a fresh code', async () => {
  const manual = createLocalFixture({
    extensionOrigin: EXTENSION_ORIGIN,
    sessionTarget: manualTarget,
    voucherAssignments: { 'MANUAL-TEST-01': 'shared-a' },
  });
  const store = new Map([[PREFERENCE, preference(NEW_ORIGIN)]]);
  const ui = await runtime({
    shippedDom: true,
    store,
    network: (args, original) => fixtureRequest(
      new URL(args.url).origin === MANUAL_ORIGIN ? manual : original,
      { ...args, headers: args.config.headers },
    ),
  });
  assert.equal(ui.get('manual-development').hidden, false);
  await ui.click('manual-connect', false);
  assert.deepEqual(store.get(PREFERENCE), preference(NEW_ORIGIN));

  await ui.click('manual-connect');
  assert.deepEqual(store.get(PREFERENCE), preference(MANUAL_ORIGIN));
  assert.equal(ui.get('manual-connect').textContent, '返回 7903 测试服务');
  assert.ok(ui.calls.some(call => call.url === MANUAL_ORIGIN + '/api/member'));
  assert.equal(manual.ledger.size, 0);
  assert.equal(ui.cookieCalls.length, 0);
  assert.equal(ui.tabCalls.length, 0);

  await ui.preview('MANUAL-TEST-01');
  assert.ok(ui.calls.some(call => call.url === MANUAL_ORIGIN + '/api/preview'));
  assert.equal(manual.ledger.size, 0);
  await ui.click('manual-connect');
  assert.deepEqual(store.get(PREFERENCE), preference(MANUAL_ORIGIN));
  await ui.click('redeem-cancel');
  await ui.click('manual-connect');
  assert.deepEqual(store.get(PREFERENCE), preference(NEW_ORIGIN));
  assert.equal(ui.fixture.ledger.size, 0);
  assert.equal(ui.cookieCalls.length, 0);
  assert.equal(ui.tabCalls.length, 0);
});

test('the manual connection is hidden without trusted development configuration', async () => {
  const { get, click, store, calls } = await runtime({ shippedDom: true, developmentProfile: null });
  assert.equal(get('manual-development').hidden, true);
  await click('manual-connect');
  assert.equal(store.has(PREFERENCE), false);
  assert.equal(calls.length, 0);
});

test('after a 7903 login, 7904 issues only its isolated session and survives independent reads', async t => {
  const originalTarget = NEW_ORIGIN + '/session/';
  const original = createLocalFixture({ extensionOrigin: EXTENSION_ORIGIN, sessionTarget: originalTarget });
  const manual = createLocalFixture({
    extensionOrigin: EXTENSION_ORIGIN,
    sessionTarget: manualTarget,
    voucherAssignments: { 'MANUAL-TEST-01': 'shared-b' },
  });
  await new Promise(resolve => manual.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => manual.server.close(resolve)));
  const page = 'http://127.0.0.1:' + manual.server.address().port + '/manual-session/';
  assert.match(await (await fetch(page)).text(), /data-session-reason="missing"/);
  const ui = await runtime({
    shippedDom: true,
    store: new Map([[PREFERENCE, preference(NEW_ORIGIN)]]),
    network: args => fixtureRequest(
      new URL(args.url).origin === MANUAL_ORIGIN ? manual : original,
      { ...args, headers: args.config.headers },
    ),
  });
  await ui.preview('DEMO-VIP-01');
  await ui.click('redeem-confirm');
  await ui.click('cookie-install');
  assert.equal(ui.cookieCalls[0]?.url, originalTarget);
  const originalJournal = JSON.stringify(ui.store.get(COOKIE_JOURNAL_KEY));
  await ui.click('manual-connect');
  await ui.preview('MANUAL-TEST-01');
  await ui.click('redeem-confirm');
  assert.equal(manual.ledger.size, 1);
  assert.match(await (await fetch(page)).text(), /data-session-reason="missing"/);
  assert.equal(ui.get('proxy-toggle').disabled, true);
  assert.equal(ui.activation.activationCodeFromPage({
    status: 'available', url: NEW_ORIGIN + '/activate?activation_code=DEMO-VIP-02',
  }), null);
  await ui.click('cookie-install');
  const write = ui.cookieCalls[1];
  assert.equal(write?.url, manualTarget);
  assert.deepEqual(write.cookies.map(({ name, path, domain }) => [name, path, domain]), [
    ['opendesk_manual_session', '/manual-session/', undefined],
    ['opendesk_manual_context', '/manual-session/', undefined],
  ]);
  assert.deepEqual(ui.tabCalls, [{ url: originalTarget }, { url: manualTarget }]);
  assert.equal(JSON.stringify(ui.store.get(COOKIE_JOURNAL_KEY)), originalJournal);
  const { value: manualJournal } = await readCookieJournal(async () => ({
    value: ui.store.get('aiVipManualCookieJournalV1'), etag: '0'.repeat(64),
  }));
  assert.equal(manualJournal.attempts.length, 1);
  assert.equal(manualJournal.attempts[0].state, 'success');
  const cookie = write.cookies.map(row => row.name + '=' + row.value).join('; ');
  for (let read = 0; read < 2; read++) {
    const response = await fetch(page, { headers: { Cookie: cookie } });
    const html = await response.text();
    assert.match(html, /data-session-reason="valid"/);
    assert.match(html, /b\*\*\*@fixture\.test/);
    assert.equal(response.headers.get('set-cookie'), null);
  }
  await ui.click('manual-connect');
  assert.deepEqual(ui.store.get(PREFERENCE), preference(NEW_ORIGIN));
  assert.equal(original.ledger.size, 1);
  assert.equal(manual.ledger.size, 1);
});

test('a pending 7903 redemption takes precedence over a concurrently saved 7904 preference', async () => {
  const recovery = {
    schemaVersion: 2, toolId: 'ai-vip-share', packageVersion: '1.4.35',
    serviceOrigin: NEW_ORIGIN, accountId: 'local-fixture-account', idempotencyKey: '285b3cab-5b58-46f2-987a-3e1accd20950',
    createdAt: Date.now(),
  };
  const original = createLocalFixture({ extensionOrigin: EXTENSION_ORIGIN, sessionTarget: NEW_ORIGIN + '/session/' });
  const store = new Map([[PREFERENCE, preference(MANUAL_ORIGIN)], [RECOVERY, recovery]]);
  const ui = await runtime({ shippedDom: true, store, fixture: original });
  assert.equal(ui.get('manual-connect').disabled, true);
  assert.equal(ui.get('recovery-check').disabled, false);
  await ui.click('recovery-check');
  assert.ok(ui.calls.some(call=>call.url===NEW_ORIGIN+'/api/status'));
  assert.deepEqual(store.get(RECOVERY), recovery);
  assert.equal(ui.calls.some(call=>call.url.endsWith('/api/redeem')), false);
});

test('the manual site only serves its own path and rejects a real cookie source', async t => {
  assert.throws(() => createLocalFixture({ sessionTarget: manualTarget }));
  assert.throws(() => createLocalFixture({
    extensionOrigin: EXTENSION_ORIGIN, sessionTarget: manualTarget, cookieSource: () => ({}),
  }));
  const { server } = createLocalFixture({ extensionOrigin: EXTENSION_ORIGIN, sessionTarget: manualTarget });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const response = await fetch(origin + '/manual-session/');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /data-session-reason="missing"/);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal((await fetch(origin + '/session/')).status, 403);
  assert.equal((await fetch(origin + '/proxy.pac')).status, 404);
});
