import assert from 'node:assert/strict';

const SDK002_SOURCE = 'tests/framework/k2-sdk-broker.test.mjs:160';
const SDK003_SOURCE = 'tests/framework/k2-sdk-broker.test.mjs:168';

export const SDK002_ORIGINAL_AUTHORITY_PLAN = Object.freeze({
  caseId: 'F2-K2-SDK-002',
  source: SDK002_SOURCE,
  title: 'SDK grant and request payload cannot carry page authority/namespace/bare args',
  admittedAnchor: Object.freeze({
    method: 'APPSTORAGE_GETITEM',
    args: Object.freeze({key: 'x'})
  }),
  invalidRequestFields: Object.freeze(['sender', 'namespace', 'ownGrant', 'host', 'args']),
  invalidGrant: Object.freeze({
    extraField: 'namespace',
    extraValue: 'foreign',
    capabilities: Object.freeze(['storage.persistent'])
  }),
  expected: Object.freeze({
    requestErrorCode: 'E_SCHEMA',
    grantErrorCode: 'E_SCHEMA',
    runs: 0,
    sdkOperations: 0,
    results: 0,
    frameworkKvWrites: 0
  })
});

export const SDK003_ORIGINAL_AUTHORITY_PLAN = Object.freeze({
  caseId: 'F2-K2-SDK-003',
  source: SDK003_SOURCE,
  title: 'SDK sender/document/lifecycle fences reject before any storage effect',
  admittedAnchor: Object.freeze({
    method: 'APPSTORAGE_SETITEM',
    args: Object.freeze({key: 'x', value: 1})
  }),
  invalidSenders: Object.freeze([
    Object.freeze({variant: 'foreign-extension-id', patch: Object.freeze({id: 'foreign'}), expectedCode: 'E_OWNER'}),
    Object.freeze({variant: 'cached-document-lifecycle', patch: Object.freeze({documentLifecycle: 'cached'}), expectedCode: 'E_OWNER'}),
    Object.freeze({variant: 'incognito-tab', patch: Object.freeze({tab: Object.freeze({id: 2, incognito: true})}), expectedCode: 'E_OWNER'}),
    Object.freeze({variant: 'stale-document-id', patch: Object.freeze({documentId: 'other'}), expectedCode: 'E_DOCUMENT_STALE'})
  ]),
  expected: Object.freeze({
    frameworkKvWrites: 0,
    sdkOperations: 0,
    results: 0,
    sdkServiceRuns: 0
  })
});

export const SDK_ORIGINAL_AUTHORITY_PLANS = Object.freeze([
  SDK002_ORIGINAL_AUTHORITY_PLAN,
  SDK003_ORIGINAL_AUTHORITY_PLAN
]);

export function assertSdk002OriginalAuthorityOracle(facts) {
  assert.equal(facts?.caseId, SDK002_ORIGINAL_AUTHORITY_PLAN.caseId);
  assertRequestRejections(facts.requestRejections, SDK002_ORIGINAL_AUTHORITY_PLAN.invalidRequestFields,
    SDK002_ORIGINAL_AUTHORITY_PLAN.expected.requestErrorCode);
  assertGrantRejection(facts.grantRejection);
  assertZeroAuthorityEffects(facts, SDK002_ORIGINAL_AUTHORITY_PLAN.expected);
}

export function assertSdk003OriginalAuthorityOracle(facts) {
  assert.equal(facts?.caseId, SDK003_ORIGINAL_AUTHORITY_PLAN.caseId);
  assertSenderRejections(facts.senderRejections);
  assertZeroAuthorityEffects(facts, SDK003_ORIGINAL_AUTHORITY_PLAN.expected);
}

export function assertNativeSdkBrokerResponseShape(response, {ok, errorCode} = {}) {
  assert.equal(typeof response, 'object', 'Native broker response must be an object');
  assert.equal(response?.ok, ok, 'Native broker response ok flag differs');
  if (ok) {
    assert.deepEqual(Object.keys(response).sort(), ['data', 'ok'], 'Native success response must be {ok,data}');
    assert.equal(typeof response.data, 'object', 'Native success data must be an object');
    assert.equal(typeof response.data.valueWire, 'object', 'SDK_REQUEST success data must carry valueWire');
    assert(!Object.hasOwn(response.data, 'namespace'), 'Native success must not expose namespace as page authority');
    assert(!Object.hasOwn(response.data, 'context'), 'Native success must not expose driver context');
  } else {
    assert.deepEqual(Object.keys(response).sort(), ['error', 'ok'], 'Native failure response must be {ok,error}');
    assert.equal(response.error?.code, errorCode, 'Native failure error code differs');
    assert(!Object.hasOwn(response.error ?? {}, 'namespace'), 'Native error must not expose namespace as page authority');
    assert(!Object.hasOwn(response.error ?? {}, 'context'), 'Native error must not expose driver context');
  }
}

function assertRequestRejections(actual, expectedFields, expectedCode) {
  assert.deepEqual(new Set(actual?.map(row => row.field)), new Set(expectedFields),
    'SDK002 must cover the exact original invalid request fields');
  assert.equal(actual.length, expectedFields.length, 'SDK002 must not add or omit invalid request variants');
  for (const field of expectedFields) {
    const row = actual.find(item => item.field === field);
    assert.equal(errorCode(row), expectedCode, `SDK002 ${field} rejection code`);
    assert.equal(row.method, SDK002_ORIGINAL_AUTHORITY_PLAN.admittedAnchor.method, `SDK002 ${field} anchor method`);
    assert.deepEqual(row.args, SDK002_ORIGINAL_AUTHORITY_PLAN.admittedAnchor.args, `SDK002 ${field} anchor args`);
    assert.equal(row.addedOwnField, true, `SDK002 ${field} must be an own page-supplied field`);
  }
}

function assertGrantRejection(actual) {
  assert.equal(errorCode(actual), SDK002_ORIGINAL_AUTHORITY_PLAN.expected.grantErrorCode, 'SDK002 grant rejection code');
  assert.equal(actual.extraField, SDK002_ORIGINAL_AUTHORITY_PLAN.invalidGrant.extraField);
  assert.equal(actual.extraValue, SDK002_ORIGINAL_AUTHORITY_PLAN.invalidGrant.extraValue);
  assert.deepEqual(actual.capabilities, SDK002_ORIGINAL_AUTHORITY_PLAN.invalidGrant.capabilities);
}

function assertSenderRejections(actual) {
  const expected = SDK003_ORIGINAL_AUTHORITY_PLAN.invalidSenders;
  assert.deepEqual(new Set(actual?.map(row => row.variant)), new Set(expected.map(row => row.variant)),
    'SDK003 must cover the exact original invalid sender variants');
  assert.equal(actual.length, expected.length, 'SDK003 must not add or omit invalid sender variants');
  for (const expectation of expected) {
    const row = actual.find(item => item.variant === expectation.variant);
    assert.equal(errorCode(row), expectation.expectedCode, `SDK003 ${expectation.variant} rejection code`);
    assert.deepEqual(row.patch, expectation.patch, `SDK003 ${expectation.variant} sender patch`);
    assert.equal(row.method, SDK003_ORIGINAL_AUTHORITY_PLAN.admittedAnchor.method, `SDK003 ${expectation.variant} anchor method`);
    assert.deepEqual(row.args, SDK003_ORIGINAL_AUTHORITY_PLAN.admittedAnchor.args, `SDK003 ${expectation.variant} anchor args`);
  }
}

function assertZeroAuthorityEffects(facts, expected) {
  const stores = collectStores(facts);
  assert.equal(stores.frameworkKV.length, expected.frameworkKvWrites, 'Original authority negative case must have zero frameworkKV writes');
  if ('runs' in expected) assert.equal(stores.runs.length, expected.runs, 'SDK002 must create zero runs');
  if ('sdkServiceRuns' in expected) assert.equal(stores.sdkServiceRuns.length, expected.sdkServiceRuns, 'SDK003 must create zero sdk-service runs');
  assert.equal(stores.sdkOperations.length, expected.sdkOperations, 'Original authority negative case must create zero sdk-operation rows');
  assert.equal(stores.results.length, expected.results, 'Original authority negative case must create zero results');
}

function collectStores(facts) {
  const rawRows = facts.rows ?? facts.snapshot?.data ?? {};
  const fromRows = name => (rawRows[name] ?? []).map(row => row?.value ?? row);
  const writes = facts.nativeWrites ?? facts.storageWrites ?? facts.writes ?? [];
  const frameworkKV = [
    ...fromRows('frameworkKV'),
    ...writes.filter(write => (write.store ?? write.value?.store) === 'frameworkKV')
  ];
  const commandJournal = fromRows('commandJournal');
  return {
    frameworkKV,
    results: fromRows('results'),
    runs: fromRows('runs'),
    sdkServiceRuns: fromRows('runs').filter(row => row?.tag === 'sdk-service'),
    sdkOperations: commandJournal.filter(row => row?.tag === 'sdk-operation')
  };
}

function errorCode(row) {
  return row?.code ?? row?.error?.code ?? row?.actual?.error?.code ?? row?.response?.error?.code;
}
