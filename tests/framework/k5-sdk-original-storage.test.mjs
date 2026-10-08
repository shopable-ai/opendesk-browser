import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  SDK004_ORIGINAL_STORAGE_PLAN,
  SDK005_ORIGINAL_STORAGE_PLAN,
  assertSdk004OriginalStorageOracle,
  assertSdk005OriginalStorageOracle,
  discoverNativeFrameworkKvWrite,
  discoverOriginalFrameworkKvWrite
} from './k5-sdk-original-storage.mjs';

test('SDK004 plan and oracle preserve original one public plus 99 duplicate same-ID shape', () => {
  assert.equal(SDK004_ORIGINAL_STORAGE_PLAN.source, 'tests/framework/k2-sdk-broker.test.mjs:176');
  assert.deepEqual(SDK004_ORIGINAL_STORAGE_PLAN.concurrentCalls, {
    total: 100,
    originalPublicCalls: 1,
    duplicateRelayMessages: 99
  });
  assertSdk004OriginalStorageOracle({
    caseId: 'F2-K2-SDK-004',
    concurrencyProof: {
      originalPublicCalls: 1,
      duplicateRelayMessages: 99,
      totalConcurrentSameId: 100,
      firstNativeWritePausedBeforeBurst: true,
      awaitPromiseAfterResume: true
    },
    decodedReplies: Array.from({length: 100}, () => ({data: undefined})),
    nativeWrites: [{store: 'frameworkKV'}],
    rows: {
      results: [{tag: 'sdk-result'}],
      commandJournal: [{tag: 'sdk-operation'}],
      runs: [{tag: 'sdk-service'}]
    },
    brokerDiagnostics: {pending: 0}
  });
  assert.throws(() => assertSdk004OriginalStorageOracle({
    caseId: 'F2-K2-SDK-004',
    concurrencyProof: {
      originalPublicCalls: 1,
      duplicateRelayMessages: 100,
      totalConcurrentSameId: 101,
      firstNativeWritePausedBeforeBurst: true,
      awaitPromiseAfterResume: true
    },
    decodedReplies: Array.from({length: 100}, () => ({data: undefined})),
    nativeWrites: [{store: 'frameworkKV'}],
    rows: {results: [{}], commandJournal: [{tag: 'sdk-operation'}], runs: [{tag: 'sdk-service'}]},
    brokerDiagnostics: {pending: 0}
  }), /99 duplicate relay messages/);
  assert.throws(() => assertSdk004OriginalStorageOracle({
    caseId: 'F2-K2-SDK-004',
    concurrencyProof: {
      originalPublicCalls: 1,
      duplicateRelayMessages: 99,
      totalConcurrentSameId: 100,
      firstNativeWritePausedBeforeBurst: false,
      awaitPromiseAfterResume: true
    },
    decodedReplies: Array.from({length: 100}, () => ({data: undefined})),
    nativeWrites: [{store: 'frameworkKV'}],
    rows: {results: [{}], commandJournal: [{tag: 'sdk-operation'}], runs: [{tag: 'sdk-service'}]},
    brokerDiagnostics: {pending: 0}
  }), /first real native write paused before/);
});

test('SDK005 plan and oracle preserve args/deadline conflicts and string0', () => {
  assert.equal(SDK005_ORIGINAL_STORAGE_PLAN.source, 'tests/framework/k2-sdk-broker.test.mjs:187');
  assert.deepEqual(SDK005_ORIGINAL_STORAGE_PLAN.conflicts.map(conflict => conflict.kind), ['args', 'deadline']);
  assertSdk005OriginalStorageOracle({
    caseId: 'F2-K2-SDK-005',
    argsConflict: {code: 'E_REQUEST_CONFLICT'},
    deadlineConflict: {code: 'E_REQUEST_CONFLICT'},
    readback: {data: '0'},
    nativeWrites: [{store: 'frameworkKV'}]
  });
  assert.throws(() => assertSdk005OriginalStorageOracle({
    caseId: 'F2-K2-SDK-005',
    argsConflict: {code: 'E_REQUEST_CONFLICT'},
    deadlineConflict: {code: 'E_REQUEST_CONFLICT'},
    readback: {data: 0},
    nativeWrites: [{store: 'frameworkKV'}]
  }), /preserve string0/);
  assert.throws(() => assertSdk005OriginalStorageOracle({
    caseId: 'F2-K2-SDK-005',
    argsConflict: {code: 'E_REQUEST_CONFLICT'},
    deadlineConflict: {code: 'E_REQUEST_CONFLICT'},
    readback: {data: '0'},
    nativeWrites: [{store: 'frameworkKV'}, {store: 'frameworkKV'}]
  }), /second frameworkKV write/);
});

test('source discovery finds the exact APPSTORAGE frameworkKV write shape', async () => {
  const source = await readFile(new URL('../../src/platform/storage/repository.js', import.meta.url), 'utf8');
  const point = discoverOriginalFrameworkKvWrite(source);
  assert.equal(point.expressions.store, "'frameworkKV'");
  assert.match(point.expressions.value, /tag: 'framework-kv'/);
  assert.match(point.expressions.key, /kvKey/);
  assert.match(point.text, /tx\.put\('frameworkKV'/);
});

test('current production and development sw.js expose exact native IDB put locators', async () => {
  for (const mode of ['production', 'development']) {
    const source = await readFile(new URL(`../../dist/${mode}/sw.js`, import.meta.url), 'utf8');
    const point = discoverNativeFrameworkKvWrite(source);
    assert.equal(point.nativePut.kind, 'native-idb-put');
    assert.equal(point.nativePut.breakpointType, 'call');
    assert.equal(point.nativePut.storeExpression, point.nativePut.expressions.store);
    assert.equal(point.nativePut.valueExpression, point.nativePut.expressions.value);
    assert.equal(point.nativePut.keyExpression, point.nativePut.expressions.key);
    assert.match(point.nativePut.text, /\.put\(/);
    assert.match(point.frameworkKvWrite.text, /"frameworkKV"/);
    assert.match(point.frameworkKvWrite.text, /"framework-kv"/);
  }
});

test('native discovery fails ambiguity instead of selecting a neighbouring put', () => {
  const source = `
    function transaction(native, enqueue, stores) {
      const object = store => native.objectStore(store);
      const keyRequired = key => {};
      return {
        put: (store, value, key) => enqueue(() => { keyRequired(key); return object(store).put(value, key); })
      };
    }
    function secondTransaction(native, enqueue, stores) {
      const object = store => native.objectStore(store);
      const keyRequired = key => {};
      return {
        put: (store, value, key) => enqueue(() => { keyRequired(key); return object(store).put(value, key); })
      };
    }
    async function persistent(tx, context, area, input) {
      await tx.put("frameworkKV", {tag:"framework-kv", namespace:context.namespace, area, key:input.key, valueWire:"a"}, "k");
    }
  `;
  assert.throws(() => discoverNativeFrameworkKvWrite(source), /unique compiled native idb\.js put property/);
});
