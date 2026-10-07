import assert from 'node:assert/strict';

export class NotObserved extends Error {
  constructor(message) { super(message); this.code = 'E_NATIVE_NOT_OBSERVED'; }
}
const requireObserved = (value, message) => { if (!value) throw new NotObserved(message); return value; };

async function frameValue(client, callFrameId, expression, byValue = true) {
  const result = await client.send('Debugger.evaluateOnCallFrame', {callFrameId, expression,
    returnByValue: byValue, throwOnSideEffect: true, silent: true});
  if (result.exceptionDetails) throw new NotObserved(`Readonly paused-frame observation refused: ${JSON.stringify(result.exceptionDetails)}`);
  return byValue ? result.result.value : result.result;
}
async function properties(client, objectId) {
  const result = await client.send('Runtime.getProperties', {objectId, ownProperties: true});
  if (result.exceptionDetails) throw new NotObserved('Native object properties were not observable');
  return result;
}
async function readNative(client, objectId, functionDeclaration, args = [], byValue = true) {
  const result = await client.send('Runtime.callFunctionOn', {objectId, functionDeclaration,
    arguments: args, returnByValue: byValue, throwOnSideEffect: true, silent: true});
  if (result.exceptionDetails) throw new NotObserved(`Readonly native observation refused: ${JSON.stringify(result.exceptionDetails)}`);
  return byValue ? result.result.value : result.result;
}
async function functionTransaction(client, method, stateBindings) {
  const methodProperties = await properties(client, method.objectId);
  const scopeList = methodProperties.internalProperties?.find(item => item.name === '[[Scopes]]')?.value;
  requireObserved(scopeList?.objectId, 'Native transaction wrapper closure scopes unavailable');
  const scopes = (await properties(client, scopeList.objectId)).result.filter(item => /^\d+$/.test(item.name) && item.value?.objectId);
  const observations = [];
  for (const scope of scopes) {
    const contents = await properties(client, scope.value.objectId);
    const native = contents.result.filter(item => item.value?.className === 'IDBTransaction' && item.value.objectId);
    for (const transaction of native) observations.push({native: transaction.value,
      scopeName: scope.value.description, nativeBinding: transaction.name,
      workDone: contents.result.find(item => item.name === stateBindings.workDone)?.value?.value,
      ended: contents.result.find(item => item.name === stateBindings.ended)?.value?.value});
  }
  requireObserved(observations.length === 1, `Exactly one actual IDBTransaction in this wrapper closure required; observed ${observations.length}`);
  return observations[0];
}

export async function inspectPausedAdmission({client, paused, selector, payload, args, expected}) {
  const frame = paused.callFrames[0], b = selector.bindings;
  const observed = await frameValue(client, frame.callFrameId,
    `({operation:${b.operation},lockKey:${b.lockKey},request:${b.request},sender:${b.sender}})`);
  assert.equal(observed.request.requestId, payload.requestId);
  assert.equal(observed.request.method, payload.method);
  assert.equal(observed.request.deadlineAt, payload.deadlineAt);
  assert.deepEqual(observed.request.args, args);
  assert.equal(observed.sender.id, expected.extensionId);
  assert.equal(observed.sender.tab.id, expected.tabId);
  assert.equal(observed.sender.tab.incognito, false);
  assert.equal(observed.sender.frameId, 0);
  assert.equal(observed.sender.documentId, expected.documentId);
  assert.equal(observed.sender.documentLifecycle, 'active');
  const op = observed.operation;
  assert.equal(op.tag, 'sdk-operation'); assert.equal(op.state, 'admitted'); assert.equal(op.submissionCount, 0);
  assert.equal(op.requestId, payload.requestId); assert.equal(op.method, payload.method);
  assert.equal(op.grantIncarnation, expected.grant.grantIncarnation);
  assert.equal(op.documentId, expected.documentId); assert.equal(op.tabId, expected.tabId);
  assert.equal(op.browserSessionIncarnation, expected.grant.browserSessionIncarnation);
  assert.equal(op.namespace, expected.grant.namespace);
  for (const key of ['opKey', 'opId', 'runId', 'resultId', 'requestDigest']) assert.equal(typeof op[key], 'string');
  const wrapper = await frameValue(client, frame.callFrameId, b.tx, false);
  requireObserved(wrapper.objectId, 'Actual transaction wrapper was not observable');
  const wrapperProperties = await properties(client, wrapper.objectId);
  const get = wrapperProperties.result.find(item => item.name === 'get')?.value;
  const put = wrapperProperties.result.find(item => item.name === 'put')?.value;
  requireObserved(get?.objectId && put?.objectId, 'Original get/put transaction closures unavailable');
  const putScope = await functionTransaction(client, put, selector.nativeTransactionStateBindings),
    getScope = await functionTransaction(client, get, selector.nativeTransactionStateBindings);
  const same = await readNative(client, putScope.native.objectId, 'function(other){return this===other;}', [{objectId: getScope.native.objectId}]);
  requireObserved(same, 'Get and put closures do not refer to the same native IDBTransaction');
  requireObserved(putScope.workDone === false && putScope.ended === false, 'Transaction work-completion/termination state not observable as still pending');
  const transaction = await readNative(client, putScope.native.objectId,
    'function(){return {mode:this.mode,stores:Array.from(this.objectStoreNames),database:this.db.name,version:this.db.version,error:this.error?.name??null};}');
  assert.equal(transaction.mode, 'readwrite'); assert.equal(transaction.database, 'opendesk-browser');
  assert.deepEqual([...transaction.stores].sort(), [...selector.transactionStores].sort()); assert.equal(transaction.error, null);
  const prototype = await frameValue(client, frame.callFrameId, 'IDBRequest.prototype', false);
  requireObserved(prototype.objectId, 'Native IDBRequest prototype not observable');
  const requests = await client.send('Runtime.queryObjects', {prototypeObjectId: prototype.objectId, objectGroup: 'cp1-native-readonly'});
  const pending = await readNative(client, requests.objects.objectId,
    'function(tx){for(let i=0;i<this.length;i++){const r=this[i];if(r.transaction===tx&&r.readyState==="pending")return r;}return null;}',
    [{objectId: putScope.native.objectId}], false);
  requireObserved(pending.objectId && pending.className === 'IDBRequest', 'A real pending native request associated with this exact transaction was not observed');
  async function pendingFact() {
    const fact = await readNative(client, pending.objectId,
      'function(tx){return {sameTransaction:this.transaction===tx,readyState:this.readyState,sourceClass:this.source?.constructor?.name,sourceName:this.source?.name,mode:this.transaction.mode,stores:Array.from(this.transaction.objectStoreNames)};}',
      [{objectId: putScope.native.objectId}]);
    requireObserved(fact.sameTransaction && fact.readyState === 'pending' && fact.mode === 'readwrite' &&
      fact.sourceClass === 'IDBObjectStore' && selector.transactionStores.includes(fact.sourceName), 'Exact native transaction no longer has the observed pending request');
    return fact;
  }
  return {evidence: {observed, wrapperObjectId: wrapper.objectId, nativeTransactionObjectId: putScope.native.objectId,
    nativeClass: putScope.native.className, getPutNativeIdentityEqual: same, closureState: {workDone: putScope.workDone, ended: putScope.ended},
    nativeScopeName: putScope.scopeName, nativeBinding: putScope.nativeBinding,
    nativeStateBindings: selector.nativeTransactionStateBindings, transaction,
    pendingRequestObjectId: pending.objectId, pendingRequest: await pendingFact(),
    observationPolicy: 'Only readonly paused-frame evaluation, native getters, properties, and queryObjects; no IDB requests/writes/abort calls are injected'},
    pendingFact};
}
