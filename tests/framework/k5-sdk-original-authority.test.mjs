import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  SDK002_ORIGINAL_AUTHORITY_PLAN,
  SDK003_ORIGINAL_AUTHORITY_PLAN,
  assertNativeSdkBrokerResponseShape,
  assertSdk002OriginalAuthorityOracle,
  assertSdk003OriginalAuthorityOracle
} from './k5-sdk-original-authority.mjs';
import {encodeValue} from '../../src/platform/page-port/codec.js';

test('SDK002 plan and oracle preserve original authority/namespace/bare-args rejection shape', () => {
  assert.equal(SDK002_ORIGINAL_AUTHORITY_PLAN.source, 'tests/framework/k2-sdk-broker.test.mjs:160');
  assert.deepEqual(SDK002_ORIGINAL_AUTHORITY_PLAN.invalidRequestFields, ['sender', 'namespace', 'ownGrant', 'host', 'args']);
  assertSdk002OriginalAuthorityOracle({
    caseId: 'F2-K2-SDK-002',
    requestRejections: SDK002_ORIGINAL_AUTHORITY_PLAN.invalidRequestFields.map(field => ({
      field,
      method: 'APPSTORAGE_GETITEM',
      args: {key: 'x'},
      addedOwnField: true,
      actual: {ok: false, error: {code: 'E_SCHEMA'}}
    })),
    grantRejection: {
      extraField: 'namespace',
      extraValue: 'foreign',
      capabilities: ['storage.persistent'],
      actual: {ok: false, error: {code: 'E_SCHEMA'}}
    },
    rows: {runs: [], results: [], commandJournal: [], frameworkKV: []}
  });
  assert.throws(() => assertSdk002OriginalAuthorityOracle({
    caseId: 'F2-K2-SDK-002',
    requestRejections: SDK002_ORIGINAL_AUTHORITY_PLAN.invalidRequestFields.filter(field => field !== 'args').map(field => ({
      field,
      method: 'APPSTORAGE_GETITEM',
      args: {key: 'x'},
      addedOwnField: true,
      actual: {ok: false, error: {code: 'E_SCHEMA'}}
    })),
    grantRejection: {
      extraField: 'namespace',
      extraValue: 'foreign',
      capabilities: ['storage.persistent'],
      actual: {ok: false, error: {code: 'E_SCHEMA'}}
    },
    rows: {runs: [], results: [], commandJournal: [], frameworkKV: []}
  }), /exact original invalid request fields/);
  assert.throws(() => assertSdk002OriginalAuthorityOracle({
    caseId: 'F2-K2-SDK-002',
    requestRejections: SDK002_ORIGINAL_AUTHORITY_PLAN.invalidRequestFields.map(field => ({
      field,
      method: 'APPSTORAGE_GETITEM',
      args: {key: 'x'},
      addedOwnField: true,
      actual: {ok: false, error: {code: 'E_SCHEMA'}}
    })),
    grantRejection: {
      extraField: 'namespace',
      extraValue: 'foreign',
      capabilities: ['storage.persistent'],
      actual: {ok: false, error: {code: 'E_SCHEMA'}}
    },
    rows: {runs: [{tag: 'sdk-service'}], results: [], commandJournal: [], frameworkKV: []}
  }), /zero runs/);
});

test('SDK003 plan and oracle preserve original invalid sender/document variants with zero effects', () => {
  assert.equal(SDK003_ORIGINAL_AUTHORITY_PLAN.source, 'tests/framework/k2-sdk-broker.test.mjs:168');
  assert.deepEqual(SDK003_ORIGINAL_AUTHORITY_PLAN.invalidSenders.map(row => row.variant), [
    'foreign-extension-id',
    'cached-document-lifecycle',
    'incognito-tab',
    'stale-document-id'
  ]);
  assertSdk003OriginalAuthorityOracle({
    caseId: 'F2-K2-SDK-003',
    senderRejections: SDK003_ORIGINAL_AUTHORITY_PLAN.invalidSenders.map(row => ({
      variant: row.variant,
      patch: row.patch,
      method: 'APPSTORAGE_SETITEM',
      args: {key: 'x', value: 1},
      actual: {ok: false, error: {code: row.expectedCode}}
    })),
    rows: {runs: [], results: [], commandJournal: [], frameworkKV: []}
  });
  assert.throws(() => assertSdk003OriginalAuthorityOracle({
    caseId: 'F2-K2-SDK-003',
    senderRejections: SDK003_ORIGINAL_AUTHORITY_PLAN.invalidSenders.map(row => ({
      variant: row.variant,
      patch: row.patch,
      method: 'APPSTORAGE_SETITEM',
      args: {key: 'x', value: 1},
      actual: {ok: false, error: {code: row.variant === 'stale-document-id' ? 'E_OWNER' : row.expectedCode}}
    })),
    rows: {runs: [], results: [], commandJournal: [], frameworkKV: []}
  }), /stale-document-id rejection code/);
  assert.throws(() => assertSdk003OriginalAuthorityOracle({
    caseId: 'F2-K2-SDK-003',
    senderRejections: SDK003_ORIGINAL_AUTHORITY_PLAN.invalidSenders.map(row => ({
      variant: row.variant,
      patch: row.patch,
      method: 'APPSTORAGE_SETITEM',
      args: {key: 'x', value: 1},
      actual: {ok: false, error: {code: row.expectedCode}}
    })),
    rows: {runs: [], results: [], commandJournal: [], frameworkKV: [{tag: 'framework-kv'}]}
  }), /zero frameworkKV writes/);
});

test('native broker response shape remains the strict public relay contract', () => {
  assertNativeSdkBrokerResponseShape({ok: true, data: {valueWire: encodeValue({PageBrigeCode: 0, data: undefined})}}, {ok: true});
  assertNativeSdkBrokerResponseShape({ok: false, error: {code: 'E_SCHEMA', message: 'Invalid SDK request'}}, {ok: false, errorCode: 'E_SCHEMA'});
  assert.throws(() => assertNativeSdkBrokerResponseShape({
    ok: true,
    data: {valueWire: encodeValue({PageBrigeCode: 0, data: undefined}), namespace: 'page:https://fixture.example'}
  }, {ok: true}), /must not expose namespace/);
  assert.throws(() => assertNativeSdkBrokerResponseShape({
    ok: false,
    error: {code: 'E_SCHEMA', message: 'Invalid SDK request', context: {}}
  }, {ok: false, errorCode: 'E_SCHEMA'}), /must not expose driver context/);
});

test('original anchors are still the exact current component tests', async () => {
  const source = await readFile(new URL('./k2-sdk-broker.test.mjs', import.meta.url), 'utf8');
  assert.match(source, /SDK grant and request payload cannot carry page authority\/namespace\/bare args/);
  assert.match(source, /for \(const field of \['sender','namespace','ownGrant','host','args'\]/);
  assert.match(source, /capabilities:\['storage\.persistent'\],namespace:'foreign'/);
  assert.match(source, /SDK sender\/document\/lifecycle fences reject before any storage effect/);
  assert.match(source, /documentLifecycle:'cached'/);
  assert.match(source, /documentId:'other'/);
  assert.match(source, /rows\('frameworkKV'\)\)\.length,0/);
});
