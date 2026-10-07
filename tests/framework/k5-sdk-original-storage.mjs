import assert from 'node:assert/strict';
import {parse} from 'acorn';
import {decodeValue} from '../../src/platform/page-port/codec.js';

const SDK004_SOURCE = 'tests/framework/k2-sdk-broker.test.mjs:176';
const SDK005_SOURCE = 'tests/framework/k2-sdk-broker.test.mjs:187';

export const SDK004_ORIGINAL_STORAGE_PLAN = Object.freeze({
  caseId: 'F2-K2-SDK-004',
  source: SDK004_SOURCE,
  method: 'APPSTORAGE_SETITEM',
  requestId: 'same-id',
  args: Object.freeze({key: 'x', value: false}),
  concurrentCalls: Object.freeze({
    total: 100,
    originalPublicCalls: 1,
    duplicateRelayMessages: 99
  }),
  expected: Object.freeze({
    successfulTypedReplies: 100,
    frameworkKvWrites: 1,
    results: 1,
    sdkOperations: 1,
    sdkServiceRuns: 1,
    slotRuns: 0,
    brokerPending: 0
  })
});

export const SDK005_ORIGINAL_STORAGE_PLAN = Object.freeze({
  caseId: 'F2-K2-SDK-005',
  source: SDK005_SOURCE,
  method: 'APPSTORAGE_SETITEM',
  requestId: 'conflict',
  args: Object.freeze({key: 'x', value: 0}),
  conflicts: Object.freeze([
    Object.freeze({kind: 'args', args: Object.freeze({key: 'x', value: 1}), expectedCode: 'E_REQUEST_CONFLICT'}),
    Object.freeze({kind: 'deadline', deadlineDelta: 1, expectedCode: 'E_REQUEST_CONFLICT'})
  ]),
  readback: Object.freeze({method: 'APPSTORAGE_GETITEM', args: Object.freeze({key: 'x'}), expectedData: '0'}),
  expected: Object.freeze({frameworkKvWrites: 1})
});

export const SDK_ORIGINAL_STORAGE_PLANS = Object.freeze([
  SDK004_ORIGINAL_STORAGE_PLAN,
  SDK005_ORIGINAL_STORAGE_PLAN
]);

export function assertSdk004OriginalStorageOracle(facts) {
  assert.equal(facts?.caseId, SDK004_ORIGINAL_STORAGE_PLAN.caseId);
  assertSdk004ConcurrencyProof(facts.concurrencyProof);
  assertTypedReplyCount(facts, SDK004_ORIGINAL_STORAGE_PLAN.expected.successfulTypedReplies);
  assert.equal(frameworkKvWriteCount(facts), 1, 'SDK004 must produce exactly one native frameworkKV write');
  assert.equal(rows(facts, 'results').length, 1, 'SDK004 must persist one result');
  assert.equal(rows(facts, 'commandJournal').filter(row => row.tag === 'sdk-operation').length, 1,
    'SDK004 must persist one sdk-operation');
  assert.equal(rows(facts, 'runs').filter(row => row.tag === 'sdk-service').length, 1,
    'SDK004 must persist one sdk-service run');
  assert.equal(rows(facts, 'runs').some(row => row.tag === 'slot'), false,
    'SDK004 must not claim a controller slot');
  assert.equal(facts.brokerDiagnostics?.pending, 0, 'SDK004 broker pending must drain to zero');
}

export function assertSdk005OriginalStorageOracle(facts) {
  assert.equal(facts?.caseId, SDK005_ORIGINAL_STORAGE_PLAN.caseId);
  assertErrorCode(facts.argsConflict, 'E_REQUEST_CONFLICT', 'SDK005 args conflict');
  assertErrorCode(facts.deadlineConflict, 'E_REQUEST_CONFLICT', 'SDK005 deadline conflict');
  assert.equal(readbackData(facts.readback), '0', 'SDK005 must preserve string0 after conflicts');
  if ('writes' in facts || 'storageWrites' in facts || 'nativeWrites' in facts)
    assert.equal(frameworkKvWriteCount(facts), 1, 'SDK005 conflicts must not add a second frameworkKV write');
}

export function discoverOriginalFrameworkKvWrite(source, options = {}) {
  const {entries} = parseEntries(source, options.sourceName ?? 'src/platform/storage/repository.js');
  const calls = entries.filter(({node}) => node.type === 'CallExpression' &&
    memberName(node.callee) === 'put' &&
    literalValue(node.arguments[0]) === 'frameworkKV' &&
    isFrameworkKvValue(node.arguments[1]) &&
    node.arguments.length === 3);
  const call = exactlyOne(calls, 'unique source tx.put frameworkKV write').node;
  return freezePoint(call, source, {
    kind: 'source-framework-kv-write',
    breakpointType: 'call',
    expressions: Object.freeze({
      store: sourceText(source, call.arguments[0]),
      value: sourceText(source, call.arguments[1]),
      key: sourceText(source, call.arguments[2])
    })
  });
}

export function discoverNativeFrameworkKvWrite(source, options = {}) {
  const {entries} = parseEntries(source, options.sourceName ?? 'dist/*/sw.js');
  const nativePut = discoverNativePutProperty(entries, source);

  const frameworkWrites = entries.filter(({node}) => node.type === 'CallExpression' &&
    memberName(node.callee) === 'put' &&
    literalValue(node.arguments[0]) === 'frameworkKV' &&
    isFrameworkKvValue(node.arguments[1]) &&
    node.arguments.length === 3);
  const frameworkCall = exactlyOne(frameworkWrites, 'unique compiled frameworkKV SDK write').node;

  return Object.freeze({
    nativePut: freezePoint(nativePut.call, source, {
      kind: 'native-idb-put',
      breakpointType: 'call',
      callLocation: Object.freeze({lineNumber:nativePut.call.callee.property.loc.start.line-1,columnNumber:nativePut.call.callee.property.loc.start.column}),
      storeExpression: nativePut.storeExpression,
      valueExpression: nativePut.valueExpression,
      keyExpression: nativePut.keyExpression,
      helperExpression: nativePut.helperExpression,
      expressions: Object.freeze(nativePut.expressions)
    }),
    frameworkKvWrite: freezePoint(frameworkCall, source, {
      kind: 'compiled-framework-kv-write',
      breakpointType: 'call',
      expressions: Object.freeze({
        store: sourceText(source, frameworkCall.arguments[0]),
        value: sourceText(source, frameworkCall.arguments[1]),
        key: sourceText(source, frameworkCall.arguments[2])
      })
    })
  });
}

export function assertSdk004ConcurrencyProof(proof) {
  assert.equal(proof?.originalPublicCalls, SDK004_ORIGINAL_STORAGE_PLAN.concurrentCalls.originalPublicCalls,
    'SDK004 must include exactly one original public call');
  assert.equal(proof?.duplicateRelayMessages, SDK004_ORIGINAL_STORAGE_PLAN.concurrentCalls.duplicateRelayMessages,
    'SDK004 must include 99 duplicate relay messages');
  assert.equal(proof?.totalConcurrentSameId, SDK004_ORIGINAL_STORAGE_PLAN.concurrentCalls.total,
    'SDK004 total must be original1 plus duplicate99');
  assert.equal(proof.originalPublicCalls + proof.duplicateRelayMessages, proof.totalConcurrentSameId,
    'SDK004 total must not include an extra 101st request');
  assert.equal(proof.firstNativeWritePausedBeforeBurst, true,
    'SDK004 must prove the first real native write paused before the duplicate burst');
  assert.equal(proof.awaitPromiseAfterResume, true,
    'SDK004 must await the original public Promise after resuming the native write');
}

function assertTypedReplyCount(facts, expected) {
  const replies = facts.replyValueWires?.map(decodeValue) ?? facts.decodedReplies ?? facts.replies ?? [];
  assert.equal(replies.length, expected, 'SDK004 must produce 100 replies');
  assert(replies.every(reply => Object.hasOwn(reply, 'data') || Object.hasOwn(reply?.response ?? {}, 'data')),
    'SDK004 replies must be typed legacy results with an own data field');
}

function assertErrorCode(error, expected, label) {
  assert.equal(error?.code ?? error?.error?.code, expected, label);
}

function readbackData(readback) {
  return readback?.data ?? readback?.response?.data;
}

function frameworkKvWriteCount(facts) {
  return (facts.nativeWrites ?? facts.storageWrites ?? facts.writes ?? []).filter(write =>
    (write.store ?? write.value?.store) === 'frameworkKV').length;
}

function rows(facts, store) {
  const raw = facts.rows?.[store] ?? facts.snapshot?.data?.[store] ?? [];
  return raw.map(row => row?.value ?? row);
}

function parseEntries(source, sourceName) {
  let ast;
  try {
    ast = parse(source, {ecmaVersion: 'latest', sourceType: 'module', locations: true});
  } catch (error) {
    ast = parse(source, {ecmaVersion: 'latest', sourceType: 'script', locations: true});
  }
  const entries = [];
  const visit = (node, ancestors = []) => {
    if (!node?.type) return;
    entries.push({node, ancestors});
    for (const key of Object.keys(node)) {
      if (key === 'start' || key === 'end' || key === 'loc') continue;
      const value = node[key];
      if (Array.isArray(value)) for (const child of value) visit(child, [...ancestors, node]);
      else if (value?.type) visit(value, [...ancestors, node]);
    }
  };
  visit(ast);
  assert(entries.length > 0, `No AST entries parsed from ${sourceName}`);
  return {ast, entries};
}

function helperReturnsObjectStore(entries, scope, callee) {
  if (callee?.type !== 'Identifier' || !scope) return false;
  const declarations = entries.filter(({node, ancestors}) => ancestors.includes(scope) &&
    node.type === 'VariableDeclarator' &&
    node.id.type === 'Identifier' &&
    node.id.name === callee.name &&
    functionNode(node.init));
  if (declarations.length !== 1) return false;
  return helperFunctionReturnsObjectStore(entries, declarations[0].node.init);
}

function helperReturnsObjectStoreInAncestors(entries, entry, callee) {
  if (callee?.type !== 'Identifier') return false;
  return entry.ancestors.toReversed().filter(functionNode).some(scope =>
    helperReturnsObjectStore(entries, scope, callee));
}

function discoverNativePutProperty(entries, source) {
  const candidates = entries.filter(({node}) =>
    node.type === 'Property' &&
    propertyName(node.key) === 'put' &&
    functionNode(node.value) &&
    node.value.params.length === 3).map(({node}) => {
    const [storeParam, valueParam, keyParam] = node.value.params;
    if (![storeParam, valueParam, keyParam].every(param => param.type === 'Identifier')) return null;
    const calls = entries.filter(entry => entry.ancestors.includes(node.value) &&
      entry.node.type === 'CallExpression' &&
      memberName(entry.node.callee) === 'put' &&
      entry.node.callee.object?.type === 'CallExpression' &&
      entry.node.arguments.length === 2 &&
      sameIdentifier(entry.node.callee.object.arguments[0], storeParam) &&
      sameIdentifier(entry.node.arguments[0], valueParam) &&
      sameIdentifier(entry.node.arguments[1], keyParam) &&
      helperReturnsObjectStoreInAncestors(entries, entry, entry.node.callee.object.callee));
    if (calls.length !== 1) return null;
    const call = calls[0].node;
    return {
      call,
      storeExpression: sourceText(source, call.callee.object.arguments[0]),
      valueExpression: sourceText(source, call.arguments[0]),
      keyExpression: sourceText(source, call.arguments[1]),
      helperExpression: sourceText(source, call.callee.object.callee),
      expressions: Object.freeze({
        store: sourceText(source, call.callee.object.arguments[0]),
        value: sourceText(source, call.arguments[0]),
        key: sourceText(source, call.arguments[1])
      })
    };
  }).filter(Boolean);
  return exactlyOne(candidates, 'unique compiled native idb.js put property with objectStore helper');
}

function helperFunctionReturnsObjectStore(entries, helper) {
  const params = new Set(helper.params.filter(param => param.type === 'Identifier').map(param => param.name));
  return entries.some(({node, ancestors}) => ancestors.includes(helper) &&
    node.type === 'CallExpression' &&
    memberName(node.callee) === 'objectStore' &&
    node.arguments.length === 1 &&
    node.arguments[0].type === 'Identifier' &&
    params.has(node.arguments[0].name));
}

function nearestFunction(entries, child) {
  return entries.find(entry => entry.node === child)?.ancestors.toReversed().find(functionNode);
}

function functionNode(node) {
  return ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node?.type);
}

function sameIdentifier(node, expected) {
  return node?.type === 'Identifier' && expected?.type === 'Identifier' && node.name === expected.name;
}

function isFrameworkKvValue(node) {
  if (node?.type !== 'ObjectExpression') return false;
  const props = new Map(node.properties.filter(prop => prop.type === 'Property').map(prop => [propertyName(prop.key), prop.value]));
  return literalValue(props.get('tag')) === 'framework-kv' &&
    props.has('namespace') &&
    props.has('area') &&
    props.has('key') &&
    props.has('valueWire');
}

function propertyName(node) {
  return node?.type === 'Identifier' ? node.name : node?.value;
}

function memberName(node) {
  return node?.type === 'MemberExpression' ? propertyName(node.property) : undefined;
}

function literalValue(node) {
  return node?.type === 'Literal' ? node.value : undefined;
}

function exactlyOne(matches, label) {
  assert.equal(matches.length, 1, `${label}; observed ${matches.length}`);
  return matches[0];
}

function freezePoint(node, source, extra) {
  return Object.freeze({
    ...extra,
    text: sourceText(source, node),
    range: Object.freeze([node.start, node.end]),
    location: Object.freeze({lineNumber: node.loc.start.line - 1, columnNumber: node.loc.start.column}),
    endLocation: Object.freeze({lineNumber: node.loc.end.line - 1, columnNumber: node.loc.end.column})
  });
}

function sourceText(source, node) {
  return source.slice(node.start, node.end);
}
