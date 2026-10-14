import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
import {BROWSER_OPERATIONS,normalizeBrowserOperation} from '../../src/framework/sdk/browser-contract.js';

// This checks PUBLIC WRAPPER routing only. No Chrome mock response here is
// evidence that Host admission or a native Chrome API actually worked.
import {REF,SESSION,ORIGIN,TARGET_URL,SAMPLE_ARGS} from './browser-sdk-r107-samples.mjs';

function functionPaths(value, prefix = []) {
  const paths = [];
  for (const [key, member] of Object.entries(value)) {
    const parts = [...prefix, key];
    if (typeof member === 'function') paths.push('browser.' + parts.join('.'));
    else if (member && typeof member === 'object')
      paths.push(...functionPaths(member, parts));
  }
  return paths;
}

function publicMethod(sdk, operation) {
  const path = operation.slice('browser.'.length).split('.');
  let member = sdk;
  for (const key of path) {
    assert(member && Object.hasOwn(member, key),
      operation + ': public wrapper path is missing at ' + key);
    member = member[key];
  }
  assert.equal(typeof member, 'function', operation + ': expected callable wrapper');
  return member;
}

test('R10.7 every registered public operation has exactly one canonical SDK method', () => {
  const sdk = createBrowserSdk({request: async () => ({})});
  const exposed = functionPaths(sdk).sort();
  const approved = Object.keys(BROWSER_OPERATIONS).sort();
  // watch is a documented convenience composed solely of canonical operations.
  assert.deepEqual(exposed, [...approved, 'browser.network.watch'].sort());
  assert.equal(sdk.history, undefined, 'Trusted History cannot enter the public SDK');
  assert.equal(sdk.permissions, undefined, 'Trusted permission prompts cannot enter the public SDK');
  assert.equal(sdk.chrome, undefined, 'Raw privileged Chrome API cannot enter the public SDK');
  assert.equal(sdk.apiVersion, '1.0.0');
});

test('R10.7 all public wrapper calls route to their own operation and preserve result', async () => {
  const calls = [];
  const sdk = createBrowserSdk({request: async (operation, args) => {
    calls.push({operation, args});
    return {receiptFor: operation};
  }});
  const operations = Object.keys(BROWSER_OPERATIONS).sort();
  for (const operation of operations) {
    const args = SAMPLE_ARGS[operation] ?? {};
    for (const key of BROWSER_OPERATIONS[operation].inputSchema.required ?? []) {
      assert(Object.hasOwn(args, key),
        operation + ': missing a required fixture argument: ' + key);
    }
    const method = publicMethod(sdk, operation);
    const result = await (operation === 'browser.clipboard.writeText'
      ? method(args.text) : method(args));
    assert.deepEqual(result, {receiptFor: operation},
      operation + ': lost or changed the Host result');
    assert.deepEqual(calls.at(-1), {operation, args},
      operation + ': routed to a different Host operation or changed arguments');
  }
  assert.equal(calls.length, operations.length);
});

test('R10.7 bad input is rejected BEFORE requesting the Host', () => {
  const calls = [];
  const sdk = createBrowserSdk({request: async (...args) => {
    calls.push(args);
    return {};
  }});
  const cases = [
    () => sdk.tabs.create({url: 'javascript:alert(1)'}),
    () => sdk.bookmarks.removeOwned({bookmarkRef: 'raw-id'}),
    () => sdk.storage.local.clear({confirm: false}),
    () => sdk.downloads.download({url: 'file:///tmp/not-allowed'}),
    () => sdk.cookies.clearSite({url: TARGET_URL}),
    () => sdk.network.observe.start({tabRef: REF, origins: [ORIGIN + '/path']}),
    () => sdk.scheduler.create({
      taskId: 'sdk-probe', revision: '0',
      schedule: {kind: 'interval', expression: '1m'}
    })
  ];
  for (const call of cases) assert.throws(call, {code: 'E_SCHEMA'});
  assert.equal(calls.length, 0, 'Rejected input must never reach Host request');
});


test('R10.7 each of 53 registered schemas rejects unknown top-level inputs before Host dispatch',()=>{
  for(const operation of Object.keys(BROWSER_OPERATIONS)){
    const args=SAMPLE_ARGS[operation]??{};
    assert.throws(()=>normalizeBrowserOperation(operation,{...args,r107UnexpectedInput:true}),
      {code:'E_SCHEMA'},operation+': reject an unknown top-level request field');
  }
});

test('R10.7 page context cannot reach installed-tool or trusted Host operations', async () => {
  let requests = 0;
  const page = createBrowserSdk({
    context: 'page-sdk',
    request: async () => {requests++; return {}; }
  });
  const rows = await page.capabilities.list();
  assert.equal(rows.length, Object.keys(BROWSER_OPERATIONS).length);
  const status = await page.capabilities.getStatus({operation: 'browser.tabs.create'});
  assert.equal(status.callableNow, false);
  assert.equal(status.reasonCode, 'E_CONTEXT');
  await assert.rejects(page.contextMenu.register(), {code: 'E_CONTEXT'});
  assert.equal(page.tabs, undefined);
  assert.equal(page.history, undefined);
  assert.equal(page.permissions, undefined);
  assert.equal(requests, 0, 'Page capability discovery must remain local');
});

test('R10.7 wrapper preserves Host rejection and network.watch reuses canonical operations', async () => {
  const rejected = createBrowserSdk({request: async () => {
    throw Object.assign(new Error('Owner rejected'), {code: 'E_OWNER'});
  }});
  await assert.rejects(rejected.tabs.listOwned(), {code: 'E_OWNER'});
  const calls = [];
  const sdk = createBrowserSdk({request: async (operation, args) => {
    calls.push({operation, args});
    if (operation === 'browser.network.observe.start') {
      return {
        observationId: SESSION, operationId: SESSION,
        expiresAt: 123456789, status: 'running'
      };
    }
    return {ok: true};
  }});
  const watch = await sdk.network.watch({tabRef: REF, origin: ORIGIN});
  await watch.read({cursor: '0', limit: 2});
  await watch.status();
  await watch.stop();
  await watch.export({format: 'json'});
  await watch.cancel();
  await watch.close();
  assert.deepEqual(calls.map(row => row.operation), [
    'browser.network.observe.start', 'browser.events.read',
    'browser.network.observe.getStatus', 'browser.network.observe.stop',
    'browser.network.observe.export', 'browser.operations.cancel',
    'browser.events.close'
  ]);
  assert.deepEqual(calls[0].args, {tabRef: REF, origins: [ORIGIN]});
  assert.deepEqual(calls[1].args, {cursor: '0', limit: 2, sessionRef: SESSION});
  assert.deepEqual(calls[5].args, {operationId: SESSION});
});
