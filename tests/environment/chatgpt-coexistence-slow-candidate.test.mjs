import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { waitForCoexistenceDelay } from '../../scripts/build-chatgpt-coexistence-slow-candidate.mjs';

const attribute = 'data-opendesk-coexistence-test-delay';
const token = 'fixture-token';
function documentFixture(marker, origin = 'https://chatgpt.com', top = true) {
  const location = { origin, href: origin + '/c/test-a' };
  const window = { location };
  window.top = top ? window : {};
  const markers = new Map([[attribute, marker]]);
  const document = { documentElement: {
    getAttribute: key => markers.get(key) ?? null,
    removeAttribute: key => markers.delete(key),
  } };
  const disposers = new Set();
  let active = true;
  let now = 75;
  let timeout;
  const owner = {
    active: () => active,
    onDispose(callback) { disposers.add(callback); return () => disposers.delete(callback); },
    setTimeout(callback, ms) { assert.equal(ms, 2000); timeout = () => { now += ms; callback(); }; },
  };
  const wait = runInNewContext('(' + waitForCoexistenceDelay.toString() + ')', {
    window, document, performance: { timeOrigin: 20000, now: () => now },
  });
  return {
    wait: () => wait(owner, token, attribute, 2000),
    hasTimer: () => Boolean(timeout),
    expire: () => timeout(),
    retire: () => { active = false; disposers.forEach(callback => callback()); },
    window, document,
  };
}

test('an unarmed, different-origin or child document does not wait', async () => {
  for (const f of [documentFixture(null), documentFixture('wrong-token'),
    documentFixture(token, 'https://gemini.google.com'), documentFixture(token, 'https://chatgpt.com', false)]) {
    assert.equal(await f.wait(), null);
    assert.equal(f.hasTimer(), false);
  }
});

test('arming is one-use and returns the navigation-clock interval', async () => {
  const f = documentFixture(token);
  const pending = f.wait();
  assert.equal(f.hasTimer(), true);
  assert.equal(await f.wait(), null);
  f.expire();
  assert.deepEqual({ ...await pending }, { token, timeOrigin: 20000, startedMs: 75, endedMs: 2075 });
});

test('retirement, route change and replacing the original document root reject before mounting can continue', async () => {
  const retirement = documentFixture(token);
  const retired = retirement.wait();
  retirement.retire();
  await assert.rejects(retired, /document or managed owner retired/);
  for (const change of [f => { f.window.location.href += '-b'; }, f => { f.document.documentElement = {}; }]) {
    const f = documentFixture(token);
    const pending = f.wait();
    change(f);
    f.expire();
    await assert.rejects(pending, /document or managed owner retired/);
  }
});
