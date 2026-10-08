import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parse} from 'acorn';
import {decodeValue} from '../../src/platform/page-port/codec.js';

export const SDK007_ORIGINAL_SESSION_PLAN = Object.freeze({
  caseId: 'F2-K2-SDK-007',
  source: 'tests/framework/k2-sdk-broker.test.mjs:194',
  method: 'APPLOCAL_SETITEM',
  expected: Object.freeze({
    nativeSessionSetCallsAcrossOldAndFreshWorker: 1,
    frameworkKvWrites: 0,
    durableNativeReceipt: true,
    durableResult: true,
    ownUndefinedPreserved: true
  }),
  status: 'pure-oracle-only'
});

export const SDK009_ORIGINAL_SESSION_PLAN = Object.freeze({
  caseId: 'F2-K2-SDK-009',
  source: 'tests/framework/k2-sdk-broker.test.mjs:205',
  method: 'APPLOCAL_SETITEM',
  expected: Object.freeze({
    cut: 'after actual chrome.storage.session.set dispatch at native callback entry before Promise resolution/native receipt/effect',
    retryCode: 'E_EFFECT_UNKNOWN',
    nativeSessionSetCallsAcrossOldAndFreshWorker: 1,
    dispatchObserved: true,
    callbackEnteredBeforeReceipt: true,
    actualEffectReadback: true,
    additionalSetsAfterRecovery: 0,
    runStateAfterRecovery: 'paused_unknown'
  }),
  status: 'pure-oracle-only'
});

export const SDK019_ORIGINAL_SESSION_PLAN = Object.freeze({
  caseId: 'F2-K2-SDK-019',
  source: 'tests/framework/k2-sdk-broker.test.mjs:219',
  method: 'APPLOCAL_SETITEM',
  expected: Object.freeze({
    cut: 'after actual chrome.storage.session.set dispatch at native callback entry before Promise resolution/native receipt/effect',
    retryCode: 'E_EFFECT_UNKNOWN',
    publicInvocationFields: Object.freeze(['requestId', 'runId', 'opId', 'grantIncarnation']),
    dispatchObserved: true,
    callbackEnteredBeforeReceipt: true,
    actualEffectReadback: true,
    additionalSetsAfterRecovery: 0,
    runStateAfterRecovery: 'paused_unknown'
  }),
  status: 'pure-oracle-only'
});

export const SDK_ORIGINAL_SESSION_PLANS = Object.freeze([
  SDK007_ORIGINAL_SESSION_PLAN,
  SDK009_ORIGINAL_SESSION_PLAN,
  SDK019_ORIGINAL_SESSION_PLAN
]);

export function discoverNativeChromeCall(source, options = {}) {
  const sourceName = options.sourceName ?? 'src/platform/chrome/tabs.js or dist/*/sw.js';
  const {entries} = parseEntries(source, sourceName);
  const nativeCalls = entries.filter(({node}) => node.type === 'CallExpression' &&
    node.callee?.type === 'MemberExpression' &&
    node.callee.computed === true &&
    node.callee.object?.type === 'Identifier' &&
    node.callee.property?.type === 'Identifier' &&
    node.arguments.some(arg => arg.type === 'SpreadElement') &&
    functionNode(node.arguments.at(-1)));
  const matches = [];
  for (const entry of nativeCalls) {
    const fn = entries.find(row => row.node === entry.node)?.ancestors.toReversed().find(node => {
      if (!functionNode(node)) return false;
      const params = node.params ?? [];
      return identifierParam(params[0]) && identifierParam(params[1]) && identifierParam(params[2]) &&
        params.some(param => param.type === 'RestElement' && param.argument?.type === 'Identifier');
    });
    if (!fn) continue;
    const params = fn.params ?? [];
    const api = identifierParam(params[0]), owner = identifierParam(params[1]), method = identifierParam(params[2]);
    const rest = params.find(param => param.type === 'RestElement' && param.argument?.type === 'Identifier')?.argument.name;
    if (!api || !owner || !method || !rest) continue;
    if (entry.node.callee.object.name !== owner || entry.node.callee.property.name !== method) continue;
    if (!entry.node.arguments.some(arg => arg.type === 'SpreadElement' && arg.argument?.name === rest)) continue;
    const callback = entry.node.arguments.at(-1);
    const value = identifierParam(callback.params?.[0]);
    if (!value) continue;
    const callbackFirstStatement = firstStatement(callback);
    const bodyEntries = entries.filter(row => row.ancestors.includes(callback));
    const resolvesValue = bodyEntries.some(({node}) => node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      node.arguments.some(arg => arg.type === 'Identifier' && arg.name === value));
    const lastError = discoverLastErrorRead(entries, fn, api);
    if (!resolvesValue || !lastError) continue;
    matches.push({entry, fn, api, owner, method, rest, value, callback, callbackFirstStatement, lastError});
  }
  const match = exactlyOne(matches, 'unique chromeCall native owner[method] callback anchored by runtime.lastError');
  const name = match.fn.id?.name ?? functionVariableName(entries, match.fn);
  return Object.freeze({
    kind: 'native-chrome-call',
    functionName: name ?? null,
    sourceIdentity: Object.freeze({sourceName, sha256: sha(source)}),
    frameIdentity: Object.freeze({
      apiExpression: match.api,
      objectExpression: match.owner,
      methodExpression: match.method,
      argsExpression: match.rest,
      callbackValueExpression: match.value
    }),
    nativeCall: freezePoint(match.entry.node, source, {
      breakpointType: 'call',
      callLocation: location(match.entry.node.callee.property),
      objectExpression: sourceText(source, match.entry.node.callee.object),
      methodExpression: sourceText(source, match.entry.node.callee.property),
      argsExpression: match.rest,
      callbackExpression: sourceText(source, match.callback),
      callbackLocation: location(match.callback)
    }),
    callbackEntry: freezePoint(match.callbackFirstStatement, source, {
      breakpointType: 'statement',
      valueExpression: match.value
    }),
    lastErrorRead: freezePoint(match.lastError, source, {
      expression: sourceText(source, match.lastError),
      apiExpression: match.api
    })
  });
}

export function discoverSessionNativeChromeCalls(source, options = {}) {
  const chromeCall = options.chromeCall ?? discoverNativeChromeCall(source, options).functionName;
  assert(chromeCall, 'Compiled/source chromeCall function name is required');
  const {entries} = parseEntries(source, options.sourceName ?? 'src/platform/storage/session.js or dist/*/sw.js');
  const calls = entries.filter(({node}) => node.type === 'CallExpression' &&
    node.callee?.type === 'Identifier' &&
    node.callee.name === chromeCall &&
    ['get', 'set', 'remove'].includes(literalValue(node.arguments[2])));
  const sessionFn = calls.map(entry => nearestFunction(entries, entry.node)).find(fn =>
    fn && ['APPLOCAL_GETITEM', 'APPLOCAL_SETITEM', 'APPLOCAL_REMOVEITEM'].every(lit =>
      entries.some(({node, ancestors}) => ancestors.includes(fn) && literalValue(node) === lit)));
  assert(sessionFn, 'Session adapter must be anchored by APPLOCAL method literals');
  const owned = calls.filter(({node}) => entries.find(e => e.node === node).ancestors.includes(sessionFn));
  const byMethod = Object.fromEntries(['get', 'set', 'remove'].map(method => {
    const row = owned.filter(({node}) => literalValue(node.arguments[2]) === method);
    const selected = exactlyOne(row, `unique APPLOCAL chromeCall ${method}`).node;
    return [method, freezePoint(selected, source, {
      kind: 'session-native-chrome-call',
      breakpointType: 'call',
      callLocation: location(selected.callee),
      apiExpression: sourceText(source, selected.arguments[0]),
      areaExpression: sourceText(source, selected.arguments[1]),
      nativeMethod: method,
      methodExpression: sourceText(source, selected.arguments[2]),
      argsExpressions: Object.freeze(selected.arguments.slice(3).map(arg => sourceText(source, arg)))
    })];
  }));
  const setArg = owned.find(({node}) => literalValue(node.arguments[2]) === 'set').node.arguments[3];
  assert.equal(setArg?.type, 'ObjectExpression', 'APPLOCAL_SETITEM must pass an object to chrome.storage.session.set');
  assert.equal(setArg.properties.length, 1, 'APPLOCAL_SETITEM must write exactly one session key');
  assert.equal(setArg.properties[0].computed, true, 'APPLOCAL_SETITEM key must be the computed framework session key');
  return Object.freeze({
    kind: 'session-native-chrome-calls',
    chromeCall,
    sourceIdentity: Object.freeze({sourceName: options.sourceName ?? 'src/platform/storage/session.js or dist/*/sw.js', sha256: sha(source)}),
    calls: Object.freeze(byMethod),
    actualSetCallbackBinding: Object.freeze({
      expectedAsyncStackTraceDescription: 'storage.session.set',
      callerSite: byMethod.set,
      callbackEntrySelector: 'discoverNativeChromeCall(source).callbackEntry',
      traceContract: 'Match the real chrome.storage.session.set invocation/key at this caller site before holding the native callback entry'
    }),
    setBinding: Object.freeze({
      keyExpression: sourceText(source, setArg.properties[0].key),
      valueExpression: sourceText(source, setArg.properties[0].value)
    })
  });
}

export function assertSdk007OriginalSessionOracle(facts) {
  assert.equal(facts?.caseId, SDK007_ORIGINAL_SESSION_PLAN.caseId);
  assertAppLocalPayload(facts.payload);
  assert.equal(facts.payload.method, 'APPLOCAL_SETITEM');
  assert.equal(sessionSetCallCount(facts), 1, 'SDK007 must make one actual chrome.storage.session.set across old+fresh worker');
  assert.equal(frameworkKvWriteCount(facts), 0, 'SDK007 APPLOCAL must not write frameworkKV');
  assertOkValueWireResponse(facts.setResponse ?? facts.original?.publicResponse ?? facts.original, {ownData: true, data: undefined});
  assertOwnUndefinedWire(facts.persistedValueWire ?? facts.sessionValueWire ?? facts.storedValueWire);
  const operation = firstOperation(facts);
  assert.equal(operation?.method, 'APPLOCAL_SETITEM');
  assert.equal(operation?.state, 'durable', 'SDK007 operation must be durable');
  assert(operation.nativeReceiptWire, 'SDK007 must persist the native callback receipt');
  assert.equal(decodeValue(operation.nativeReceiptWire).method, 'APPLOCAL_SETITEM');
  const result = firstResult(facts);
  assert.equal(result?.state, 'durable', 'SDK007 must persist a durable result');
  assertSameIdentity(operation, result, ['runId', 'opId', 'resultId', 'requestDigest', 'grantIncarnation']);
  if (facts.afterRetryOperation) assertSameIdentity(operation, facts.afterRetryOperation,
    ['runId', 'opId', 'resultId', 'requestDigest', 'grantIncarnation']);
  if (facts.retryResponse) assert.deepEqual(facts.retryResponse, facts.setResponse ?? facts.original?.publicResponse ?? facts.original,
    'SDK007 identical emitted payload must return the original durable response');
}

export function assertSdk009OriginalSessionOracle(facts) {
  assertUnknownSessionReplay(facts, SDK009_ORIGINAL_SESSION_PLAN, {requireInvocation: false});
}

export function assertSdk019OriginalSessionOracle(facts) {
  assertUnknownSessionReplay(facts, SDK019_ORIGINAL_SESSION_PLAN, {requireInvocation: true});
}

export function assertNativeSdkResponseShape(response, payload, operation, options = {}) {
  if (response?.ok === true) {
    assert(response.data && Object.hasOwn(response.data, 'valueWire'), 'Successful native SDK response must be {ok:true,data:{valueWire}}');
    return;
  }
  assert.equal(response?.ok, false, 'Native SDK error response must set ok:false');
  assert.equal(typeof response.error?.code, 'string', 'Native SDK error response must include error.code');
  if (options.requireInvocation || response.error.code === 'E_EFFECT_UNKNOWN') {
    const expected = publicInvocation(payload, operation);
    assert.deepEqual(response.error.invocation, expected, 'Unknown public error must expose exact original request/run/op/grant');
    assert.deepEqual(Object.keys(response.error.invocation).sort(), ['grantIncarnation', 'opId', 'requestId', 'runId']);
  }
  const allowed = new Set(['code', 'message', 'invocation']);
  assert(Object.keys(response.error).every(key => allowed.has(key)), 'Native SDK error response must not expose private operation fields');
}

function assertUnknownSessionReplay(facts, plan, {requireInvocation}) {
  assert.equal(facts?.caseId, plan.caseId);
  assert.equal(facts.payload.method, 'APPLOCAL_SETITEM', `${plan.caseId} must use APPLOCAL storage, not AXIOS`);
  assertAppLocalPayload(facts.payload);
  assert.equal(sessionSetCallCount(facts), 1, `${plan.caseId} must not issue a second native session set after recovery`);
  assertActualDispatchObserved(facts, plan);
  assertCallbackEnteredBeforeReceipt(facts, plan);
  assertActualEffectReadback(facts);
  assert.equal(postRecoverySetCallCount(facts), 0, `${plan.caseId} startup/retry must not issue an additional native set`);
  const before = facts.beforeOperation ?? facts.operationBefore ?? firstOperation(facts);
  const after = facts.afterOperation ?? facts.recoveredOperation ?? firstOperation({rows:facts.afterRows}) ?? before;
  assert.equal(before?.state, 'dispatched', `${plan.caseId} cut must be after dispatch before receipt/effect`);
  assert.equal(before?.submissionCount, 1);
  assert(!before.nativeReceiptWire, `${plan.caseId} cut must not have a native callback receipt`);
  assert.equal((facts.beforeResults ?? facts.rows?.beforeResults ?? []).length, 0, `${plan.caseId} cut must not have a durable result`);
  assert.equal(after?.state, 'effect_unknown', `${plan.caseId} recovered operation must be effect_unknown`);
  assert.equal(after?.submissionCount, 1);
  assertSameIdentity(before, after, ['requestId', 'runId', 'opId', 'resultId', 'requestDigest', 'grantIncarnation', 'deadlineAt']);
  const run = facts.afterRun ?? facts.recoveredRun ?? firstRun({rows:facts.afterRows}) ?? firstRun(facts);
  assert.equal(run?.state, 'paused_unknown', `${plan.caseId} original run must be paused_unknown`);
  const response = facts.retryResponse ?? facts.replay ?? facts.response;
  assert.equal(response?.ok, false);
  assert.equal(response.error?.code, 'E_EFFECT_UNKNOWN');
  assertNativeSdkResponseShape(response, facts.payload, after, {requireInvocation});
}

function assertActualEffectReadback(facts) {
  assert.equal(facts.actualEffectReadback?.method ?? facts.actualEffectReadback?.nativeMethod, 'get',
    'Actual effect readback must use real chrome.storage.session.get');
  assert(facts.actualEffectReadback.valueWire, 'Actual effect readback must return the stored valueWire');
  assert.deepEqual(decodeValue(facts.actualEffectReadback.valueWire), decodeValue(facts.payload.argsWire).value,
    'Actual storage.session readback must match the APPLOCAL_SETITEM value wire');
}

function assertActualDispatchObserved(facts, plan) {
  const observed = facts.dispatchObserved;
  assert.equal(observed?.method ?? observed?.nativeMethod, 'set',
    `${plan.caseId} must observe the actual chrome.storage.session.set call`);
  assert.equal(observed?.area ?? observed?.nativeArea, 'storage.session',
    `${plan.caseId} actual dispatch must be APPLOCAL storage.session`);
  assert.equal(observed?.outstandingTargetSetCount, 1,
    `${plan.caseId} must have one outstanding target set before callback hold`);
  assert(observed?.callerSiteRange, `${plan.caseId} must bind dispatch to the session driver caller-site range`);
  assert.equal(observed?.keyMatched, true, `${plan.caseId} must match the original APPLOCAL key before callback hold`);
}

function assertCallbackEnteredBeforeReceipt(facts, plan) {
  const observed = facts.callbackEnteredBeforeReceipt;
  assert.equal(observed?.entered, true,
    `${plan.caseId} must pause at callback entry before Promise resolution/native receipt`);
  assert.equal(observed?.asyncStackTraceDescription, 'storage.session.set',
    `${plan.caseId} callback entry must bind to native storage.session.set async stack`);
  assert(observed?.callbackEntryRange, `${plan.caseId} callback entry must expose an exact callback statement range`);
  assert(observed?.callerSiteRange, `${plan.caseId} callback entry must bind to the original session set caller-site range`);
}

function assertAppLocalPayload(payload) {
  assert(payload && typeof payload.requestId === 'string' && payload.requestId.length > 0);
  assert.equal(payload.method, 'APPLOCAL_SETITEM');
  assert(payload.argsWire, 'Original APPLOCAL payload must carry argsWire');
  const args = decodeValue(payload.argsWire);
  assert.equal(typeof args.key, 'string');
  assert(Object.hasOwn(args, 'value'), 'APPLOCAL_SETITEM payload must have own value');
}

function assertOkValueWireResponse(response, expected) {
  assert.equal(response?.ok, true);
  assert(response.data?.valueWire, 'Successful response must include valueWire');
  const decoded = decodeValue(response.data.valueWire);
  assert.equal(decoded.PageBrigeCode, 0);
  if (expected.ownData) assert(Object.hasOwn(decoded, 'data'), 'Typed response must preserve own data');
  assert.equal(decoded.data, expected.data);
}

function assertOwnUndefinedWire(valueWire) {
  assert(valueWire, 'Persisted APPLOCAL valueWire is required');
  const value = decodeValue(valueWire);
  assert(Object.hasOwn(value, 'present'), 'Codec wire must preserve own undefined property');
  assert(Object.hasOwn(value.list, 0), 'Codec wire must preserve own undefined array slot');
  assert.deepEqual(value, {present:undefined, zero:0, no:false, list:[undefined, null]});
}

function publicInvocation(payload, operation) {
  return Object.freeze({
    requestId: payload.requestId,
    runId: operation.runId,
    opId: operation.opId,
    grantIncarnation: operation.grantIncarnation
  });
}

function sessionSetCallCount(facts) {
  const rows = facts.nativeCalls ?? facts.sessionNativeCalls ?? facts.nativeSessionCalls ?? [];
  return rows.filter(call => (call.method ?? call.nativeMethod) === 'set' &&
    (call.area === undefined || call.area === 'storage.session' || call.area === 'session')).length;
}

function postRecoverySetCallCount(facts) {
  const rows = facts.postRecoveryNativeCalls ?? facts.startupNativeCalls ?? facts.recoveryNativeCalls ?? [];
  return rows.filter(call => (call.method ?? call.nativeMethod) === 'set' &&
    (call.area === undefined || call.area === 'storage.session' || call.area === 'session')).length;
}

function frameworkKvWriteCount(facts) {
  const rows = facts.frameworkKvWrites ?? facts.nativeWrites ?? [];
  return rows.filter(row => row.store === 'frameworkKV' || row.value?.store === 'frameworkKV').length;
}

function firstOperation(facts) {
  return rows(facts, 'commandJournal').find(row => row.tag === 'sdk-operation' && row.method === 'APPLOCAL_SETITEM');
}

function firstResult(facts) {
  return rows(facts, 'results').find(row => row.tag === 'sdk-result');
}

function firstRun(facts) {
  return rows(facts, 'runs').find(row => row.tag === 'sdk-service');
}

function rows(facts, store) {
  const raw = facts?.rows?.[store] ?? facts?.snapshot?.data?.[store] ?? [];
  return raw.map(row => row?.value ?? row);
}

function assertSameIdentity(left, right, fields) {
  for (const field of fields) assert.equal(right?.[field], left?.[field], `Original ${field} must be preserved`);
}

function parseEntries(source, sourceName) {
  let ast;
  try { ast = parse(source, {ecmaVersion: 'latest', sourceType: 'module', locations: true}); }
  catch { ast = parse(source, {ecmaVersion: 'latest', sourceType: 'script', locations: true}); }
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

function discoverLastErrorRead(entries, fn, api) {
  const functionNames = new Set([fn.id?.name, functionVariableName(entries, fn)].filter(Boolean));
  const helperCalls = entries.filter(({node, ancestors}) => ancestors.includes(fn) &&
    node.type === 'CallExpression' &&
    node.callee?.type === 'Identifier' &&
    functionNames.has(node.callee.name) === false &&
    node.arguments.some(arg => arg.type === 'Identifier' && arg.name === api));
  const helperFns = helperCalls.map(call => functionDeclarationFor(entries, call.node.callee.name)).filter(Boolean);
  const scopes = [fn, ...helperFns];
  const reads = entries.filter(({node, ancestors}) => scopes.some(scope => ancestors.includes(scope)) &&
    node.type === 'MemberExpression' &&
    memberName(node) === 'lastError' &&
    memberName(node.object) === 'runtime');
  return exactlyOne(reads, 'unique runtime.lastError read').node;
}

function functionDeclarationFor(entries, name) {
  return entries.find(({node}) => node.type === 'FunctionDeclaration' && node.id?.name === name)?.node ??
    entries.find(({node}) => node.type === 'VariableDeclarator' && node.id?.name === name && functionNode(node.init))?.node.init;
}

function functionVariableName(entries, fn) {
  return entries.find(({node}) => node.type === 'VariableDeclarator' && node.init === fn && node.id?.type === 'Identifier')?.node.id.name;
}

function nearestFunction(entries, child) {
  return entries.find(entry => entry.node === child)?.ancestors.toReversed().find(functionNode);
}

function functionNode(node) {
  return ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node?.type);
}

function firstStatement(fn) {
  const body = fn.body?.type === 'BlockStatement' ? fn.body.body.find(node => !node.directive) : fn.body;
  assert(body?.type, 'chromeCall callback must expose a first statement for callback-entry breakpoint');
  return body;
}

function identifierParam(node) {
  return node?.type === 'Identifier' ? node.name : undefined;
}

function memberName(node) {
  if (node?.type === 'ChainExpression') return memberName(node.expression);
  return node?.type === 'MemberExpression' ? propertyName(node.property) : undefined;
}

function propertyName(node) {
  return node?.type === 'Identifier' ? node.name : node?.value;
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
    location: location(node),
    endLocation: Object.freeze({lineNumber: node.loc.end.line - 1, columnNumber: node.loc.end.column})
  });
}

function location(node) {
  return Object.freeze({lineNumber: node.loc.start.line - 1, columnNumber: node.loc.start.column});
}

function sourceText(source, node) {
  return source.slice(node.start, node.end);
}

function sha(source) {
  return createHash('sha256').update(source).digest('hex');
}
