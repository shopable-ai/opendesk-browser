import test from 'node:test';
import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import {waitForWorkflowSearchEffect} from '../../src/ui/workflow/search-effect-wait.js';

const captured = Object.freeze({status:'available', windowId:7, tabId:11,
  frameId:0, origin:'https://example.com', url:'https://example.com/search', documentId:'old'});

function fixture(overrides = {}) {
  let now = 0;
  const controller = new AbortController();
  const refreshes = [], reads = [], permissions = [];
  const target = {snapshot:captured, async refresh(options) {
    refreshes.push({at:now, options});
    this.snapshot = overrides.target?.(now) ?? captured;
    return this.snapshot;
  }};
  const options = {captured, currentPageTarget:target, signal:controller.signal,
    clock:() => now,
    delay:async (ms, signal) => {
      assert.ok(signal instanceof AbortSignal);
      assert.equal(signal.aborted, false);
      if (reads.length) assert.equal(signal, reads.at(-1).signal);
      now += ms;
      await overrides.onDelay?.(now, controller);
    },
    hasPermission:async next => {
      permissions.push(next);
      return overrides.permission ? overrides.permission(now, next) : true;
    },
    observe:async (next, {signal}) => {
      assert.notEqual(signal, controller.signal);
      assert.equal(signal.aborted, false);
      reads.push({at:now, next, signal});
      return overrides.observe ? overrides.observe(now, next, controller) : {ready:false};
    },
    verify:(after, next) => overrides.verify ? overrides.verify(after, next, controller) :
      after?.ready ? {kind:'search-inline'} : null};
  return {options, controller, target, reads, refreshes, permissions,
    now:() => now, run:() => waitForWorkflowSearchEffect(options)};
}

test('waits through old available documents and >2s navigation, preserving retry', async () => {
  const next = {...captured, documentId:'new', url:'https://example.com/results'};
  const f = fixture({target:now => now < 2750 ? captured : now < 3000 ?
    {status:'unavailable', windowId:7, tabId:11} : next,
  observe:(_now, target) => ({ready:target.documentId === 'new'})});
  const result = await f.run();
  assert.deepEqual(result, {effect:{kind:'search-inline'}, effectTarget:next});
  assert.notEqual(result.effectTarget, next);
  assert.ok(f.now() > 2000);
  assert.equal(f.reads.length, 2);
  assert.equal(f.reads[0].next.documentId, 'old');
  assert.equal(f.reads[1].next.documentId, 'new');
  assert.ok(f.reads.every(({signal}) => signal.aborted), 'successful exit also releases readers');
  for (const {options} of f.refreshes) assert.deepEqual(options, {preserveRetry:true});
});

test('accepts delayed inline results in the same Document', async () => {
  const f = fixture({observe:now => ({ready:now >= 6000})});
  const result = await f.run();
  assert.equal(result.effectTarget.documentId, 'old');
  assert.deepEqual(result.effect, {kind:'search-inline'});
  assert.equal(f.reads.length, 3);
});

test('timeout remains read-only, with four spaced observations and no fabricated effect', async () => {
  const f = fixture();
  f.target.fill = f.target.click = () => assert.fail('must never replay a write');
  assert.equal(await f.run(), null);
  assert.equal(f.now(), 10000);
  assert.equal(f.reads.length, 4);
  assert.ok(f.reads.at(-1).at >= 9000, 'keep a read for late rendering');
  for (let i = 1; i < f.reads.length; i++) assert.ok(f.reads[i].at - f.reads[i - 1].at >= 500);
  assert.equal(getEventListeners(f.controller.signal, 'abort').length, 0);
});

for (const change of [{tabId:12}, {windowId:8}, {origin:'https://other.example'}]) {
  test(`stops immediately on target mismatch ${JSON.stringify(change)}`, async () => {
    const f = fixture({target:now => now ? {...captured, ...change} : captured});
    assert.equal(await f.run(), null);
    assert.equal(f.now(), 250);
    assert.equal(f.reads.length, 1);
  });
}

test('a known switched tab is rejected even while unavailable', async () => {
  const f = fixture({target:() => ({status:'unavailable', windowId:7, tabId:12})});
  assert.equal(await f.run(), null);
  assert.equal(f.now(), 0);
  assert.equal(f.reads.length, 0);
});

test('permission revocation stops before another refresh or observation', async () => {
  const f = fixture({permission:now => now < 250});
  assert.equal(await f.run(), null);
  assert.equal(f.now(), 250);
  assert.equal(f.refreshes.length, 1);
  assert.equal(f.reads.length, 1);
});

test('revocation during a read discards a positive result', async () => {
  let permitted = true;
  const f = fixture({permission:() => permitted,
    observe:() => { permitted = false; return {ready:true}; }});
  assert.equal(await f.run(), null);
  assert.equal(f.reads.length, 1);
});

test('abort before entry or during delay never starts another observation', async () => {
  const before = fixture();
  before.controller.abort();
  assert.equal(await before.run(), null);
  assert.equal(before.refreshes.length, 0);
  const during = fixture({onDelay:(_now, controller) => controller.abort()});
  assert.equal(await during.run(), null);
  assert.equal(during.reads.length, 1);
  assert.equal(during.refreshes.length, 1);
});

for (const phase of ['refresh', 'permission', 'observe', 'verify', 'delay']) {
  test(`abort settles a pending ${phase} and cleans its listener`, async () => {
    const f = fixture();
    let entered;
    const started = new Promise(resolve => { entered = resolve; });
    let rejectPending;
    const pending = () => { entered(); return new Promise((_resolve, reject) => { rejectPending = reject; }); };
    if (phase === 'refresh') f.target.refresh = pending;
    else f.options[phase === 'permission' ? 'hasPermission' : phase] = pending;
    const running = f.run();
    await started;
    f.controller.abort();
    assert.equal(await running, null);
    assert.equal(getEventListeners(f.controller.signal, 'abort').length, 0);
    const count = f.reads.length;
    rejectPending(new Error('late failure'));
    await Promise.resolve();
    assert.equal(f.reads.length, count);
  });
}

test('does not observe resolving, loading, pending navigation or non-root targets', async () => {
  for (const change of [{status:'resolving'}, {status:'unavailable'}, {loading:true},
    {tabStatus:'loading'}, {pendingUrl:'https://example.com/next'}, {frameId:1}]) {
    const f = fixture({target:() => ({...captured, ...change})});
    assert.equal(await f.run(), null);
    assert.equal(f.reads.length, 0);
  }
});

test('short polling intervals cannot bypass the 500ms observation floor', async () => {
  const f = fixture();
  Object.assign(f.options, {timeoutMs:2000, intervalMs:10});
  assert.equal(await f.run(), null);
  assert.equal(f.reads.length, 3);
  for (let i = 1; i < f.reads.length; i++) assert.ok(f.reads[i].at - f.reads[i - 1].at >= 500);
});

for (const reason of ['deadline', 'external abort']) {
test(`${reason} aborts the active reader and never starts another read or write`, async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const f = fixture();
  let entered, readerSignal, finishLate, active = false, reads = 0, verifies = 0, writes = 0;
  const started = new Promise(resolve => { entered = resolve; });
  f.target.fill = f.target.click = () => { writes++; };
  f.options.verify = () => { verifies++; return {kind:'search-inline'}; };
  f.options.observe = (_next, {signal}) => {
    reads++;
    readerSignal = signal;
    active = true;
    // Model a RunHost that releases its running operation on signal abort,
    // while its transport promise may still deliver a late response.
    signal.addEventListener('abort', () => { active = false; }, {once:true});
    entered();
    return new Promise(resolve => { finishLate = resolve; });
  };
  const running = f.run();
  await started;
  assert.equal(readerSignal.aborted, false);
  assert.equal(active, true);
  if (reason === 'deadline') t.mock.timers.tick(10000);
  else f.controller.abort();
  assert.equal(readerSignal.aborted, true, 'cancel the RunHost before returning');
  assert.equal(active, false);
  assert.equal(await running, null);
  assert.equal(getEventListeners(f.controller.signal, 'abort').length, 0);
  assert.equal(getEventListeners(readerSignal, 'abort').length, 0);
  finishLate({ready:true});
  for (let i = 0; i < 12; i++) await Promise.resolve();
  t.mock.timers.tick(20000);
  assert.equal(reads, 1);
  assert.equal(verifies, 0);
  assert.equal(writes, 0);
  assert.equal(f.refreshes.length, 1);
});
}

test('default delay is cancelled and cleaned when the caller aborts', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const f = fixture();
  delete f.options.delay;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  f.options.verify = () => { entered(); return null; };
  const running = f.run();
  await started;
  // Allow verification and its permission/read continuations to reach delay.
  for (let i = 0; i < 12; i++) await Promise.resolve();
  f.controller.abort();
  assert.equal(await running, null);
  assert.equal(getEventListeners(f.controller.signal, 'abort').length, 0);
  t.mock.timers.tick(20000);
  assert.equal(f.reads.length, 1);
});

for (const phase of ['refresh', 'hasPermission', 'observe', 'verify', 'delay']) {
  test(`${phase} exceptions return null without retry or invented results`, async () => {
    const f = fixture();
    let calls = 0;
    const fail = () => { calls++; throw new Error('unavailable'); };
    if (phase === 'refresh') f.target.refresh = fail;
    else f.options[phase] = fail;
    assert.equal(await f.run(), null);
    assert.equal(calls, 1);
    assert.equal(getEventListeners(f.controller.signal, 'abort').length, 0);
  });
}
