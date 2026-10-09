import {invariant, newId, canonical, digestUtf8, iso, projectFoundationError} from '../protocol.js';
import {httpUrl, permissionPattern} from '../../environment.js';
import {canonicalValue, encodeValue, decodeValue} from '../page-port/codec.js';
import {ADMITTED_METHODS, SDK_VERSION, validateSdkRequest} from '../../framework/sdk/registry.js';
import {fields} from '../../framework/sdk/registry.js';
import {normalizeSdkTargetScope} from '../../framework/sdk/target-origins.js';

// Methods of the one run authority; this module owns no connection, router or slot.
export function sdkMethods({storage, api, session, clock, assertHost, currentHost}) {
  const contexts = new WeakMap(), now = () => iso(clock);
  // Persisted bases and observations in THIS worker are separate. Recovery must
  // never subtract an already observed removal from a stored baseline.
  const tabEpochs = new Map(), frameEpochs = new Map(), permissionBases = new Map();
  const tabRemovals = new Map(), frameRemovals = new Map(), permissionRemovals = [];
  const retiredGrants = new Set(), grantControllers = new Map();
  const workerIncarnation = newId();
  let notificationEpoch = 0, notificationRemovals = 0, notificationBaseKnown = false;
  const frameKey = doc => canonical([doc.tabId, doc.frameId]);
  const removalCount = origin => permissionRemovals.filter(origins => origins.some(pattern => matchesOrigin(pattern,origin))).length;
  function permissionEpoch(origin) {
    if (!permissionBases.has(origin)) permissionBases.set(origin,0);
    return permissionBases.get(origin) + removalCount(origin);
  }
  function epochs(doc) {
    if (!tabEpochs.has(doc.tabId)) tabEpochs.set(doc.tabId,0);
    if (!frameEpochs.has(frameKey(doc))) frameEpochs.set(frameKey(doc),0);
    notificationBaseKnown = true;
    return {tabEpoch:tabEpochs.get(doc.tabId) + (tabRemovals.get(doc.tabId) || 0),
      frameEpoch:frameEpochs.get(frameKey(doc)) + (frameRemovals.get(frameKey(doc)) || 0),
      permissionEpoch:permissionEpoch(doc.origin), notificationEpoch:notificationEpoch + notificationRemovals};
  }
  const scopeEpochs = (doc, origins) => ({...epochs(doc),
    originPermissionEpochs:origins.map(origin => [origin,permissionEpoch(origin)])});
  function assertFence(captured, deadline = true) {
    const current = epochs(captured.doc);
    invariant(current.tabEpoch === captured.tabEpoch && current.frameEpoch === captured.frameEpoch,
      'E_DOCUMENT_STALE', 'Observed document invalidation fences this SDK operation');
    invariant(!retiredGrants.has(captured.grantIncarnation) && current.permissionEpoch === captured.permissionEpoch &&
      (captured.originPermissionEpochs || []).every(([origin,epoch]) => permissionEpoch(origin) === epoch) &&
      (!(captured.capability === 'notifications' || captured.capabilities?.includes('notifications')) ||
        current.notificationEpoch === captured.notificationEpoch),
    'E_GRANT_REVOKED', 'Observed scope or permission removal fences this SDK operation');
    if (deadline) invariant(clock.now() < captured.deadlineAt, 'E_DEADLINE', 'SDK short service expired');
  }
  function isActive(grant) {
    return grant?.targetScopeVersion === undefined ? grant?.active === true :
      grant.targetScopeVersion === 1 && grant.active === false && grant.crossOriginActive === true;
  }
  function readGrant(grant, doc) {
    invariant(grant?.tag === 'sdk-grant' && isActive(grant), 'E_GRANT_REVOKED', 'SDK grant is inactive or has an unknown format');
    if (grant.targetScopeVersion === undefined) {
      invariant(!Object.hasOwn(grant,'targetScopeVersion') && !Object.hasOwn(grant,'targetOrigins') &&
        !Object.hasOwn(grant,'originPermissionEpochs') && !Object.hasOwn(grant,'crossOriginActive'),
      'E_GRANT_REVOKED', 'Malformed legacy SDK grant');
      invariant(canonical(grant.allowedOrigins ?? [doc.origin]) === canonical([doc.origin]),
        'E_GRANT_REVOKED', 'Legacy grants only authorize their source origin');
      return {...grant,allowedOrigins:[doc.origin]};
    }
    // active:false is intentional: the P1.1 reader ignores new fields but rejects
    // this record on its EXISTING active check. A version field alone is unsafe.
    invariant(grant.workerIncarnation === workerIncarnation, 'E_GRANT_REVOKED',
      'Cross-origin SDK authorization requires explicit approval after worker restart');
    const scope = normalizeSdkTargetScope(doc.origin,grant.targetOrigins);
    invariant(scope.targetOrigins.length > 0 && grant.capabilities?.includes('network') &&
      canonical(scope.allowedOrigins) === canonical(grant.allowedOrigins) &&
      Array.isArray(grant.originPermissionEpochs) && grant.originPermissionEpochs.length === scope.allowedOrigins.length &&
      grant.originPermissionEpochs.every((pair,index) => Array.isArray(pair) && pair.length === 2 &&
        pair[0] === scope.allowedOrigins[index] && Number.isSafeInteger(pair[1]) && pair[1] >= 0),
    'E_GRANT_REVOKED', 'Malformed cross-origin SDK scope');
    return grant;
  }
  function retire(grantIncarnation, code = 'E_GRANT_REVOKED') {
    if (!grantIncarnation) return;
    retiredGrants.add(grantIncarnation);
    const live = grantControllers.get(grantIncarnation);
    if (live) {
      const error = new Error('The original SDK document or grant was invalidated'); error.code = code;
      live.controller.abort(error); grantControllers.delete(grantIncarnation);
    }
  }
  function signalFor(grant, doc) {
    let live = grantControllers.get(grant.grantIncarnation);
    if (!live) {
      live = {grant,doc,controller:new AbortController()};
      grantControllers.set(grant.grantIncarnation,live);
    }
    return live.controller.signal;
  }
  const grantFence = (grant,doc) => ({...grant,doc});
  function grantResult(grant,doc) {
    return {grantIncarnation:grant.grantIncarnation,documentId:doc.documentId,
      sourceOrigin:doc.origin,capabilities:grant.capabilities,
      targetOrigins:grant.allowedOrigins.filter(origin => origin !== doc.origin),allowedOrigins:grant.allowedOrigins,
      requiresReapprovalAfterWorkerRestart:grant.targetScopeVersion === 1};
  }
  function requestOrigin(request) {
    return ADMITTED_METHODS[request.method]?.capability === 'network' ? httpUrl(request.args.url ?? request.args.server).origin : undefined;
  }
  const grantKey = doc => `sdk-grant:${canonical([doc.tabId, doc.frameId, doc.documentId])}`;
  function document(sender) {
    invariant(sender?.id === api.runtime.id && Number.isSafeInteger(sender.tab?.id) && sender.tab.id >= 0 &&
      sender.tab.incognito === false && Number.isSafeInteger(sender.frameId) && sender.frameId >= 0 &&
      typeof sender.documentId === 'string' && sender.documentId.length > 0 && sender.documentLifecycle === 'active',
      'E_OWNER', 'SDK needs the actual active Chrome document sender');
    const origin = httpUrl(sender.url).origin;
    return {tabId:sender.tab.id, frameId:sender.frameId, documentId:sender.documentId, origin, principal:`sdk:${origin}`};
  }
  async function native(doc) {
    const frames = await api.webNavigation.getAllFrames({tabId:doc.tabId});
    invariant(frames?.some(frame => frame.frameId === doc.frameId && frame.documentId === doc.documentId &&
      frame.documentLifecycle === 'active' && !frame.errorOccurred && httpUrl(frame.url).origin === doc.origin), 'E_DOCUMENT_STALE', 'SDK document is no longer current');
    invariant(await api.permissions.contains({origins:[permissionPattern(doc.origin)]}), 'E_PERMISSION', 'SDK site permission was revoked');
  }
  async function activeGrant(tx, doc, incarnation) {
    const grant = readGrant(await tx.get('commandJournal', grantKey(doc)),doc);
    invariant(grant.browserSessionIncarnation === session && grant.principal === doc.principal &&
      (incarnation === undefined || grant.grantIncarnation === incarnation), 'E_GRANT_REVOKED', 'SDK grant is absent or fenced');
    assertFence(grantFence(grant,doc), false);
    return grant;
  }
  async function grantSdk(request, sender) {
    const host = await assertHost(sender);
    fields(request,['tabId','frameId','documentId','capabilities','targetOrigins'],['tabId','frameId','documentId','capabilities']);
    invariant(request && Number.isSafeInteger(request.tabId) && Number.isSafeInteger(request.frameId) &&
      typeof request.documentId === 'string' && Array.isArray(request.capabilities), 'E_SCHEMA', 'Invalid SDK grant');
    const frames = await api.webNavigation.getAllFrames({tabId:request.tabId});
    const frame = frames?.find(frame => frame.frameId === request.frameId && frame.documentId === request.documentId);
    invariant(frame?.documentLifecycle === 'active' && !frame.errorOccurred,
      'E_DOCUMENT_STALE', 'Selected SDK document is no longer active');
    const origin = httpUrl(frame.url).origin;
    const doc = {tabId:request.tabId, frameId:request.frameId, documentId:request.documentId, origin, principal:`sdk:${origin}`};
    const scope = normalizeSdkTargetScope(origin,request.targetOrigins);
    const capturedEpochs = scopeEpochs(doc,scope.allowedOrigins);
    await native(doc);
    for (const target of scope.targetOrigins)
      invariant(await api.permissions.contains({origins:[permissionPattern(target)]}), 'E_PERMISSION', 'Target permission was not approved');
    const supported = new Set(Object.values(ADMITTED_METHODS).map(method => method.capability));
    invariant(request.capabilities.length > 0 && request.capabilities.every(capability => supported.has(capability)), 'E_CAPABILITY', 'Unknown SDK grant capability');
    const capabilities = [...new Set(request.capabilities)].sort(), key = grantKey(doc);
    invariant(!scope.targetOrigins.length || capabilities.includes('network'), 'E_CAPABILITY', 'Additional targets require the network capability');
    return storage.transaction(['commandJournal'], 'readwrite', async tx => {
      await currentHost(tx, host, sender);
      assertFence({...capturedEpochs,doc,capabilities}, false);
      const previous = await tx.get('commandJournal', key);
      let reusable;
      try { reusable = readGrant(previous,doc); assertFence(grantFence(reusable,doc),false); } catch { reusable = undefined; }
      if (reusable && reusable.browserSessionIncarnation === session && reusable.principal === doc.principal &&
        canonical(reusable.capabilities) === canonical(capabilities) &&
        canonical(reusable.allowedOrigins) === canonical(scope.allowedOrigins))
        return grantResult(reusable,doc);
      // Close the in-memory incarnation BEFORE awaiting persistence. Even a
      // failed transaction must not resurrect an already observed scope change.
      if (previous) {
        retire(previous.grantIncarnation);
        await tx.put('commandJournal', {...previous,active:false,crossOriginActive:false,closedAt:now()}, `sdk-closed-grant:${previous.grantIncarnation}`);
      }
      const grant = {tag:'sdk-grant', ...doc, ...epochs(doc), key, namespace:`page:${origin}`, capabilities,
        allowedOrigins:[...scope.allowedOrigins],grantIncarnation:newId(),browserSessionIncarnation:session,
        active:true,grantedAt:now(),registrationId:host.registrationId};
      if (scope.targetOrigins.length) Object.assign(grant,{targetScopeVersion:1,active:false,crossOriginActive:true,
        targetOrigins:[...scope.targetOrigins],originPermissionEpochs:capturedEpochs.originPermissionEpochs,workerIncarnation});
      assertFence({...capturedEpochs,doc,capabilities},false);
      await tx.put('commandJournal', grant, key);
      assertFence({...capturedEpochs,doc,capabilities},false);
      return grantResult(grant,doc);
    });
  }
  async function readHello(request, sender) {
    invariant(request && Object.keys(request).length === 1 && request.sdkVersion === SDK_VERSION, 'E_VERSION', 'SDK version differs');
    const doc = document(sender), entry = {...epochs(doc),doc};
    await native(doc);
    const grant = await storage.transaction(['commandJournal'], 'readonly', async tx => {
      const grant = await activeGrant(tx,doc);
      assertFence(entry,false); assertFence(grantFence(grant,doc),false);
      return grant;
    });
    assertFence(entry,false); assertFence(grantFence(grant,doc),false);
    return {doc,grant};
  }
  async function helloSdk(request, sender) {
    const {grant} = await readHello(request,sender);
    return {sdkVersion:SDK_VERSION,ready:true,methods:Object.entries(ADMITTED_METHODS)
      .filter(([,method]) => grant.capabilities.includes(method.capability)).map(([name]) => name)};
  }
  // Internal read-side of the SAME authority. No admission, renewal, replay or
  // persistent writes. The original deadline is a digest field, not a new lease.
  async function lookupSdkInvocation(payload, sender) {
    const {doc:source,grant:initial} = await readHello({sdkVersion:SDK_VERSION},sender);
    const captured = grantFence(initial,source);
    const doc = [source.principal,source.tabId,source.frameId,source.documentId];
    const request = validateSdkRequest({requestId:payload.requestId,method:payload.method,
      args:decodeValue(payload.argsWire),deadlineAt:payload.deadlineAt});
    const requestDigest = await digestUtf8(canonical([request.method,canonicalValue(request.args),request.deadlineAt]));
    const targetOrigin = requestOrigin(request);
    if (targetOrigin) {
      invariant(initial.allowedOrigins.includes(targetOrigin), 'E_PERMISSION', 'SDK target was not approved');
      if (targetOrigin !== source.origin)
        invariant(await api.permissions.contains({origins:[permissionPattern(targetOrigin)]}), 'E_PERMISSION', 'SDK target permission was revoked');
    }
    assertFence(captured,false);
    const operation = await storage.transaction(['commandJournal'],'readonly',async tx => {
      const grant = await activeGrant(tx,source,initial.grantIncarnation);
      const lock = await tx.get('commandJournal',`sdk-request:${canonical([...doc,payload.requestId])}`);
      if (lock?.tag !== 'sdk-request' || lock.grantIncarnation !== grant.grantIncarnation) return;
      const original = await tx.get('commandJournal',lock.opKey);
      assertFence(captured,false);
      if (original?.tag !== 'sdk-operation' || original.opKey !== lock.opKey ||
        original.browserSessionIncarnation !== session || original.grantIncarnation !== grant.grantIncarnation ||
        canonical([original.principal,original.tabId,original.frameId,original.documentId]) !== canonical(doc) ||
        original.requestId !== payload.requestId || original.requestDigest !== requestDigest ||
        !['dispatched','effect_unknown'].includes(original.state)) return;
      return original;
    });
    assertFence(captured,false);
    return operation ? {invocation:projectFoundationError({invocation:operation}).invocation} : undefined;
  }
  async function authorizeSdkInjection(request, sender, grantIncarnation) {
    const host = await assertHost(sender);
    const doc = {tabId:request.tabId,frameId:request.frameId,documentId:request.documentId};
    const frames = await api.webNavigation.getAllFrames({tabId:doc.tabId});
    const frame = frames?.find(frame => frame.frameId === doc.frameId && frame.documentId === doc.documentId);
    invariant(frame,'E_DOCUMENT_STALE','SDK installation document changed');
    doc.origin = httpUrl(frame.url).origin; doc.principal = `sdk:${doc.origin}`;
    await native(doc);
    return storage.transaction(['commandJournal'],'readonly',async tx => {
      await currentHost(tx,host,sender);
      return activeGrant(tx,doc,grantIncarnation);
    });
  }
  async function authorizeSdkInTransaction(tx, context) {
    const captured = contexts.get(context);
    invariant(captured, 'E_OWNER', 'SDK context was not issued by the shared authority');
    assertFence(captured);
    const grant = await activeGrant(tx, captured.doc, captured.grantIncarnation);
    invariant(grant.namespace === captured.namespace && grant.capabilities.includes(captured.capability), 'E_PERMISSION', 'SDK capability is not granted');
    const operation = await tx.get('commandJournal', captured.opKey);
    invariant(operation?.opId === captured.opId && operation.requestDigest === captured.requestDigest &&
      operation.grantIncarnation === captured.grantIncarnation, 'E_REQUEST_CONFLICT', 'SDK admission changed');
    invariant(operation.state !== 'effect_unknown' && !operation.cancelSeq, 'E_EFFECT_UNKNOWN', 'Unknown SDK effect cannot be replayed');
    invariant(clock.now() < captured.deadlineAt, 'E_DEADLINE', 'SDK short service expired');
    assertFence(captured);
    return {grant, operation};
  }
  async function authorizeSdk(context, request = {}) {
    const captured = contexts.get(context);
    invariant(captured, 'E_OWNER', 'SDK context was not issued by the shared authority');
    await native(captured.doc);
    let targetOrigin = captured.targetOrigin;
    if (request.url !== undefined) {
      targetOrigin = httpUrl(request.url).origin;
      invariant(targetOrigin === captured.targetOrigin, 'E_PERMISSION', 'Driver target differs from the admitted request');
    }
    if (targetOrigin) {
      invariant(await api.permissions.contains({origins:[permissionPattern(targetOrigin)]}), 'E_PERMISSION', 'SDK request origin is not permitted');
    }
    if (request.capability === 'notifications') invariant(await api.permissions.contains({permissions:['notifications']}), 'E_PERMISSION', 'Notifications permission is absent');
    return storage.transaction(['commandJournal'], request.phase === 'pre' ? 'readwrite' : 'readonly', async tx => {
      const admitted = await authorizeSdkInTransaction(tx, context);
      if (request.capability) invariant(admitted.grant.capabilities.includes(request.capability), 'E_PERMISSION', 'SDK request capability is not granted');
      if (targetOrigin) invariant(admitted.grant.allowedOrigins.includes(targetOrigin), 'E_PERMISSION', 'SDK cross-origin capability is absent');
      if (request.phase === 'pre' && ['network','notifications','storage.session','service.log','service.time','resources.packaged'].includes(request.capability)) {
        invariant(admitted.operation.state === 'admitted', 'E_EFFECT_UNKNOWN', 'SDK external effect already dispatched');
        admitted.operation.state = 'dispatched'; admitted.operation.submissionCount = 1; admitted.operation.dispatchAt = now();
        await tx.put('commandJournal', admitted.operation, captured.opKey);
      }
      assertFence(captured);
      return admitted;
    });
  }
  async function recordSdkEffect(context, value) {
    const captured = contexts.get(context);
    invariant(captured, 'E_OWNER', 'Effect receipt requires the original trusted driver context');
    const valueWire = encodeValue(value);
    return storage.transaction(['commandJournal','results','runs'], 'readwrite', async tx => {
      const operation = await tx.get('commandJournal', captured.opKey);
      return recordSdkResult(tx, captured, operation, valueWire);
    });
  }
  async function recordSdkResult(tx, captured, operation, valueWire, httpErrorWire) {
    invariant(operation?.opId === captured.opId && operation.requestDigest === captured.requestDigest &&
      (['admitted','dispatched','durable'].includes(operation.state) ||
        operation.state === 'effect_unknown' && operation.submissionCount === 1), 'E_EFFECT_UNKNOWN', 'Effect receipt differs from admission');
    const old = await tx.get('results', captured.resultId);
    if (old) {
      invariant(old.tag === 'sdk-result' && old.state === 'durable' && old.resultId === captured.resultId &&
        old.runId === captured.runId && old.opId === captured.opId && old.namespace === captured.namespace &&
        old.grantIncarnation === captured.grantIncarnation && old.requestDigest === captured.requestDigest,
      'E_EFFECT_UNKNOWN', 'Existing SDK result differs from admission');
      const run = await tx.get('runs',captured.runId);
      if (run && run.state !== 'completed') await tx.put('runs',{...run,state:'completed',resultId:old.resultId,completedAt:now()},run.runId);
      return old;
    }
    const result = {tag:'sdk-result', state:'durable', resultId:captured.resultId, opId:captured.opId, runId:captured.runId,
      namespace:captured.namespace, principal:captured.principal, requestId:captured.requestId,
      opKey:captured.opKey, requestDigest:captured.requestDigest, browserSessionIncarnation:captured.browserSessionIncarnation,
      valueWire, ...(httpErrorWire ? {httpErrorWire} : {}), receiptAt:now(), grantIncarnation:captured.grantIncarnation};
    operation.state = 'durable'; operation.resultId = result.resultId; operation.receiptAt = result.receiptAt;
    await tx.put('results', result, result.resultId);
    await tx.put('commandJournal', operation, captured.opKey);
    const run = await tx.get('runs', captured.runId);
    if (run) await tx.put('runs', {...run,state:'completed',resultId:result.resultId,completedAt:now()}, run.runId);
    return result;
  }
  async function recordSdkNativeReceipt(context, receipt) {
    const captured = contexts.get(context);
    invariant(captured, 'E_OWNER', 'Native receipt requires the original driver context');
    const receiptWire = encodeValue(receipt);
    // The trusted network driver calls this only after reading and validating the body.
    const httpFailure = captured.method.startsWith('AXIOS_') && receipt?.status >= 300 && receipt.status <= 599 &&
      Object.hasOwn(receipt, 'data');
    return storage.transaction(httpFailure ? ['commandJournal','results','runs'] : ['commandJournal'], 'readwrite', async tx => {
      const operation = await tx.get('commandJournal', captured.opKey);
      invariant(operation?.opId === captured.opId && operation.requestDigest === captured.requestDigest &&
        (['dispatched','durable'].includes(operation.state) ||
          operation.state === 'effect_unknown' && operation.submissionCount === 1), 'E_EFFECT_UNKNOWN', 'Native receipt has no matching dispatch');
      operation.nativeReceiptWire = receiptWire; operation.nativeReceiptAt = now();
      await tx.put('commandJournal', operation, captured.opKey);
      if (httpFailure) return recordSdkResult(tx, captured, operation,
        encodeValue(undefined), receiptWire);
    }).then(result => captured.httpErrorReceipt = result);
  }
  async function failSdk(context, error) {
    const captured = contexts.get(context);
    invariant(captured, 'E_OWNER', 'Failure requires the original driver context');
    return storage.transaction(['commandJournal','runs'], 'readwrite', async tx => {
      const operation = await tx.get('commandJournal', captured.opKey);
      if (!operation || operation.opId !== captured.opId) return;
      operation.deliveryError = {code:error.code || 'E_EFFECT_UNKNOWN', message:String(error.message || error)};
      operation.deliveryState = 'denied';
      if (!['durable','effect_unknown'].includes(operation.state)) operation.state = operation.state === 'dispatched' ? 'effect_unknown' : 'failed';
      await tx.put('commandJournal', operation, captured.opKey);
      const run = await tx.get('runs', captured.runId);
      if (run) await tx.put('runs', {...run,
        state:operation.state === 'durable' ? 'completed' : operation.state === 'effect_unknown' ? 'paused_unknown' : 'failed',
        ...(operation.state === 'durable' ? {resultId:operation.resultId} : {terminalReason:operation.deliveryError.message})},run.runId);
    });
  }
  async function admitSdk(request, sender) {
    const doc = document(sender), targetOrigin = requestOrigin(request);
    const entry = {...scopeEpochs(doc,targetOrigin ? [...new Set([doc.origin,targetOrigin])].sort() : [doc.origin]),doc,
      capability:ADMITTED_METHODS[request.method]?.capability};
    await native(doc);
    const method = Object.hasOwn(ADMITTED_METHODS, request.method) && ADMITTED_METHODS[request.method];
    invariant(method, 'E_SERVICE_UNSUPPORTED', 'Unknown SDK method');
    invariant(Number.isSafeInteger(request.deadlineAt) && request.deadlineAt > clock.now(), 'E_DEADLINE', 'SDK request expired');
    const requestDigest = await digestUtf8(canonical([request.method, canonicalValue(request.args), request.deadlineAt]));
    const result = await storage.transaction(['commandJournal','runs','results'], 'readwrite', async tx => {
      const grant = await activeGrant(tx, doc);
      assertFence(entry,false);
      if (targetOrigin) invariant(grant.allowedOrigins.includes(targetOrigin), 'E_PERMISSION', 'SDK target was not approved');
      invariant(grant.capabilities.includes(method.capability), 'E_PERMISSION', 'SDK method capability is not granted');
      const lockKey = `sdk-request:${canonical([doc.principal, doc.tabId, doc.frameId, doc.documentId, request.requestId])}`;
      const lock = await tx.get('commandJournal', lockKey);
      invariant(!lock || lock.grantIncarnation === grant.grantIncarnation, 'E_GRANT_REVOKED', 'Old request belongs to a closed grant');
      const opKey = `sdk-operation:${canonical([doc.principal, doc.tabId, doc.frameId, doc.documentId, grant.grantIncarnation, request.requestId])}`;
      let operation = await tx.get('commandJournal', opKey);
      if (operation) invariant(operation.requestDigest === requestDigest, 'E_REQUEST_CONFLICT', 'SDK request ID has conflicting arguments');
      else {
        operation = {tag:'sdk-operation', opKey, ...doc, namespace:grant.namespace, grantIncarnation:grant.grantIncarnation,
          runId:newId(), opId:newId(), resultId:newId(), requestId:request.requestId, requestDigest, method:request.method,
          capability:method.capability, effect:method.effect, ...(targetOrigin ? {targetOrigin} : {}), deadlineAt:Math.min(request.deadlineAt, clock.now() + 15000),
          browserSessionIncarnation:session, state:'admitted', cancelSeq:0, submissionCount:0, admittedAt:now()};
        await tx.put('commandJournal', operation, opKey);
        await tx.put('commandJournal', {tag:'sdk-request', grantIncarnation:grant.grantIncarnation, opKey}, lockKey);
        await tx.put('runs', {tag:'sdk-service', driver:'framework.sdk-service.v1', runId:operation.runId, opId:operation.opId,
          namespace:operation.namespace, browserSessionIncarnation:session, state:'preparing', createdAt:now()}, operation.runId);
      }
      const receipt = await tx.get('results', operation.resultId);
      assertFence(entry,false); assertFence(grantFence(grant,doc),false);
      return {operation,receipt,grant};
    });
    const captured = {...grantFence(result.grant,doc),...result.operation,targetOrigin,doc};
    assertFence(entry,false); assertFence(captured);
    const signal = signalFor(result.grant,doc);
    let context;
    context = Object.freeze({...result.operation,...(result.grant.targetScopeVersion === 1 ? {signal} : {}),
      authorize:request => authorizeSdk(context, request), authorizeInTransaction:tx => authorizeSdkInTransaction(tx, context),
      recordEffect:value => recordSdkEffect(context, value),
      recordNativeReceipt:receipt => recordSdkNativeReceipt(context, receipt),
      get httpErrorReceipt() { return captured.httpErrorReceipt; },
      assertDispatch:() => assertFence(captured)});
    contexts.set(context, captured);
    return {operation:result.operation,receipt:result.receipt,context};
  }
  async function revokeSdkGrants({tabId, frameId, documentId, grantIncarnation, origins, permissions, reason = 'revoked'} = {}) {
    // Called synchronously by native listeners: invalidate in-flight closures
    // before an asynchronous IDB transaction or a native permission regrant.
    if (grantIncarnation !== undefined) {
      invariant(typeof grantIncarnation === 'string' && grantIncarnation.length > 0 &&
        Number.isSafeInteger(tabId) && Number.isSafeInteger(frameId) && typeof documentId === 'string' &&
        documentId.length > 0 && origins === undefined && permissions === undefined,
      'E_SCHEMA', 'Installation cleanup requires one exact document and grant incarnation');
      // Internal installation rollback is NOT a native document/permission
      // event. Fence its original closures before IDB without aging a new grant.
      retire(grantIncarnation);
    } else {
      if (tabId !== undefined && frameId !== undefined) {
        const key = canonical([tabId,frameId]); frameRemovals.set(key,(frameRemovals.get(key) || 0) + 1);
      } else if (tabId !== undefined) tabRemovals.set(tabId,(tabRemovals.get(tabId) || 0) + 1);
      if (permissions?.includes('notifications')) notificationRemovals++;
      if (origins?.length) permissionRemovals.push([...origins]);
    }
    const affected = grant => {
      if (grantIncarnation !== undefined && grant.grantIncarnation !== grantIncarnation) return false;
      if (tabId !== undefined && grant.tabId !== tabId || frameId !== undefined && grant.frameId !== frameId ||
        documentId !== undefined && grant.documentId !== documentId) return false;
      if (origins || permissions) return Boolean(origins?.some(pattern =>
        (grant.allowedOrigins || [grant.origin]).some(origin => matchesOrigin(pattern,origin))) ||
        permissions?.some(permission => grant.capabilities.includes(permission)));
      return true;
    };
    for (const [incarnation,live] of grantControllers)
      if (affected(live.grant)) retire(incarnation,grantIncarnation !== undefined || tabId === undefined ? 'E_GRANT_REVOKED' : 'E_DOCUMENT_STALE');
    return storage.transaction(['commandJournal'], 'readwrite', async tx => {
      for (const grant of await tx.all('commandJournal')) {
        if (grant.tag !== 'sdk-grant' || !isActive(grant) || !affected(grant)) continue;
        // A fresh grant created AFTER this observed native event must not be
        // closed by an older delayed persistence callback.
        if (tabId !== undefined || origins || permissions) {
          try { assertFence(grantFence(grant,grant),false); continue; } catch { /* Original incarnation is fenced. */ }
        }
        retire(grant.grantIncarnation);
        grant.active = false; if (grant.targetScopeVersion !== undefined) grant.crossOriginActive = false;
        grant.closedAt = now(); grant.closeReason = reason;
        await tx.put('commandJournal', grant, grant.key);
      }
    });
  }

  function matchesOrigin(pattern, origin) {
    if (pattern === '<all_urls>') return true;
    const match = /^(\*|https?|file):\/\/([^/]+)\//.exec(pattern);
    if (!match) return false;
    const url = new URL(origin), host = match[2];
    return (match[1] === '*' || `${match[1]}:` === url.protocol) &&
      (host === '*' || host === url.hostname || host.startsWith('*.') &&
        (url.hostname === host.slice(2) || url.hostname.endsWith(`.${host.slice(2)}`)));
  }
  async function settleSdkDelivery(context, error) {
    const captured = contexts.get(context);
    invariant(captured, 'E_OWNER', 'Delivery requires original SDK context');
    return storage.transaction(['commandJournal'], 'readwrite', async tx => {
      const operation = await tx.get('commandJournal',captured.opKey);
      invariant(operation?.opId === captured.opId, 'E_REQUEST_CONFLICT', 'SDK delivery admission changed');
      if (error) {
        if (operation.deliveryState !== 'delivered') {
          operation.deliveryState = 'denied'; operation.deliveryError = {code:error.code || 'E_EFFECT_UNKNOWN',message:String(error.message || error)};
        }
      } else {
        await authorizeSdkInTransaction(tx,context);
        invariant(operation.state === 'durable','E_EFFECT_UNKNOWN','SDK result is not durable');
        // Returning a response proves authorization, not page Promise receipt.
        operation.deliveryState = 'response_ready'; operation.responseReadyAt = now(); delete operation.deliveryError;
      }
      await tx.put('commandJournal',operation,captured.opKey);
    });
  }
  async function recoverSdk() {
    return storage.transaction(['commandJournal','runs','results'], 'readwrite', async tx => {
      const rows = await tx.all('commandJournal');
      const recoveredTabs = new Map(), recoveredFrames = new Map(), recoveredPermissions = new Map();
      let recoveredNotifications = 0;
      const maximum = (map,key,value) => map.set(key,Math.max(map.get(key) || 0,value));
      for (const grant of rows) {
        if (grant.tag !== 'sdk-grant' || !isActive(grant) || grant.browserSessionIncarnation !== session) continue;
        if (grant.targetScopeVersion === 1 && grant.workerIncarnation !== workerIncarnation) {
          // Conservative boundary: never recover cross-origin authority across
          // a worker gap in which native revocation persistence may be lost.
          retire(grant.grantIncarnation); grant.active = false; grant.crossOriginActive = false;
          grant.closeReason = 'worker-restart-reapproval-required'; grant.closedAt = now();
          await tx.put('commandJournal',grant,grant.key); continue;
        }
        for (const field of ['tabEpoch','frameEpoch','permissionEpoch','notificationEpoch'])
          invariant(Number.isSafeInteger(grant[field]) && grant[field] >= 0,'E_GRANT_REVOKED','SDK grant epoch is malformed');
        maximum(recoveredTabs,grant.tabId,grant.tabEpoch);
        maximum(recoveredFrames,frameKey(grant),grant.frameEpoch);
        maximum(recoveredPermissions,grant.origin,grant.permissionEpoch);
        for (const [origin,epoch] of grant.originPermissionEpochs || []) maximum(recoveredPermissions,origin,epoch);
        recoveredNotifications = Math.max(recoveredNotifications,grant.notificationEpoch);
      }
      // Restore only previously unknown bases. Runtime observations remain additive,
      // and calling recover twice cannot double-count or cancel an observed event.
      for (const [key,value] of recoveredTabs) if (!tabEpochs.has(key)) tabEpochs.set(key,value);
      for (const [key,value] of recoveredFrames) if (!frameEpochs.has(key)) frameEpochs.set(key,value);
      for (const [key,value] of recoveredPermissions) if (!permissionBases.has(key)) permissionBases.set(key,value);
      if (!notificationBaseKnown) { notificationEpoch = recoveredNotifications; notificationBaseKnown = true; }
      for (const operation of rows) {
        if (operation.tag !== 'sdk-operation') continue;
        if (operation.state === 'dispatched') {
          operation.state = 'effect_unknown'; operation.recoveredAt = now();
          operation.deliveryState = 'denied';
          operation.deliveryError = {code:'E_EFFECT_UNKNOWN', message:'Worker restarted after SDK dispatch; no effect replay'};
          await tx.put('commandJournal', operation, operation.opKey);
        }
        const run = await tx.get('runs',operation.runId);
        invariant(run?.tag === 'sdk-service' && run.opId === operation.opId && run.namespace === operation.namespace,
          'E_EFFECT_UNKNOWN','SDK recovery run binding differs');
        if (operation.state === 'durable') {
          const result = await tx.get('results',operation.resultId);
          invariant(result?.tag === 'sdk-result' && result.state === 'durable' && result.resultId === operation.resultId &&
            result.runId === operation.runId && result.opId === operation.opId && result.namespace === operation.namespace &&
            result.grantIncarnation === operation.grantIncarnation && result.opKey === operation.opKey &&
            result.requestDigest === operation.requestDigest,'E_EFFECT_UNKNOWN','SDK durable result binding differs');
          await tx.put('runs',{...run,state:'completed',resultId:result.resultId},run.runId);
        } else if (operation.state === 'effect_unknown' || operation.state === 'failed') {
          await tx.put('runs',{...run,state:operation.state === 'effect_unknown' ? 'paused_unknown' : 'failed',
            terminalReason:operation.deliveryError?.message || operation.state},run.runId);
        }
      }
    });
  }
  return {grantSdk, helloSdk, lookupSdkInvocation, authorizeSdkInjection, admitSdk, authorizeSdk, authorizeSdkInTransaction, recordSdkEffect,
    recordSdkNativeReceipt, failSdk, revokeSdkGrants, recoverSdk, settleSdkDelivery};
}
