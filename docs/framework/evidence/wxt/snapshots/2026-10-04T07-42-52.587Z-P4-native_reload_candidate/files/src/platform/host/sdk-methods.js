import {invariant, newId, canonical, digestUtf8, iso} from '../protocol.js';
import {httpUrl, permissionPattern} from '../../environment.js';
import {canonicalValue, encodeValue} from '../page-port/codec.js';
import {SDK_METHODS, SDK_VERSION} from '../../framework/sdk/registry.js';
import {fields} from '../../framework/sdk/registry.js';

// Methods of the one run authority; this module owns no connection, router or slot.
export function sdkMethods({storage, api, session, clock, assertHost, currentHost}) {
  const contexts = new WeakMap(), now = () => iso(clock);
  const tabEpochs = new Map(), frameEpochs = new Map(), permissionBases = new Map(), permissionRemovals = [];
  let notificationEpoch = 0;
  const frameKey = doc => canonical([doc.tabId, doc.frameId]);
  const removalCount = origin => permissionRemovals.filter(origins => origins.some(pattern => matchesOrigin(pattern,origin))).length;
  const epochs = doc => ({tabEpoch:tabEpochs.get(doc.tabId) || 0,
    frameEpoch:frameEpochs.get(frameKey(doc)) || 0,
    permissionEpoch:(permissionBases.get(doc.origin) || 0) + removalCount(doc.origin), notificationEpoch});
  function assertFence(captured, deadline = true) {
    const current = epochs(captured.doc);
    invariant(current.tabEpoch === captured.tabEpoch && current.frameEpoch === captured.frameEpoch,
      'E_DOCUMENT_STALE', 'Observed document invalidation fences this SDK operation');
    invariant(current.permissionEpoch === captured.permissionEpoch &&
      (!(captured.capability === 'notifications' || captured.capabilities?.includes('notifications')) ||
        current.notificationEpoch === captured.notificationEpoch),
    'E_GRANT_REVOKED', 'Observed permission removal fences this SDK operation');
    if (deadline) invariant(clock.now() < captured.deadlineAt, 'E_DEADLINE', 'SDK short service expired');
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
      httpUrl(frame.url).origin === doc.origin), 'E_DOCUMENT_STALE', 'SDK document is no longer current');
    invariant(await api.permissions.contains({origins:[permissionPattern(doc.origin)]}), 'E_PERMISSION', 'SDK site permission was revoked');
  }
  async function activeGrant(tx, doc, incarnation) {
    const grant = await tx.get('commandJournal', grantKey(doc));
    invariant(grant?.active && grant.browserSessionIncarnation === session && grant.principal === doc.principal &&
      (incarnation === undefined || grant.grantIncarnation === incarnation), 'E_GRANT_REVOKED', 'SDK grant is absent or fenced');
    assertFence({...grant,doc}, false);
    return grant;
  }
  async function grantSdk(request, sender) {
    const host = await assertHost(sender);
    fields(request,['tabId','frameId','documentId','capabilities'],['tabId','frameId','documentId','capabilities']);
    invariant(request && Number.isSafeInteger(request.tabId) && Number.isSafeInteger(request.frameId) &&
      typeof request.documentId === 'string' && Array.isArray(request.capabilities), 'E_SCHEMA', 'Invalid SDK grant');
    const frames = await api.webNavigation.getAllFrames({tabId:request.tabId});
    const frame = frames?.find(frame => frame.frameId === request.frameId && frame.documentId === request.documentId);
    invariant(frame, 'E_DOCUMENT_STALE', 'Selected SDK document is no longer current');
    const origin = httpUrl(frame.url).origin;
    const doc = {tabId:request.tabId, frameId:request.frameId, documentId:request.documentId, origin, principal:`sdk:${origin}`};
    const capturedEpochs = epochs(doc);
    await native(doc);
    const supported = new Set(Object.values(SDK_METHODS).map(method => method.capability));
    invariant(request.capabilities.length > 0 && request.capabilities.every(capability => supported.has(capability)), 'E_CAPABILITY', 'Unknown SDK grant capability');
    const capabilities = [...new Set(request.capabilities)].sort(), key = grantKey(doc);
    return storage.transaction(['commandJournal'], 'readwrite', async tx => {
      await currentHost(tx, host, sender);
      assertFence({...capturedEpochs,doc}, false);
      const previous = await tx.get('commandJournal', key);
      if (previous?.active && previous.browserSessionIncarnation === session &&
        previous.tabEpoch === capturedEpochs.tabEpoch && previous.frameEpoch === capturedEpochs.frameEpoch &&
        previous.permissionEpoch === capturedEpochs.permissionEpoch && previous.notificationEpoch === capturedEpochs.notificationEpoch &&
        canonical(previous.capabilities) === canonical(capabilities))
        return {grantIncarnation:previous.grantIncarnation, documentId:doc.documentId};
      if (previous) await tx.put('commandJournal', {...previous, active:false, closedAt:now()}, `sdk-closed-grant:${previous.grantIncarnation}`);
      const grant = {tag:'sdk-grant', ...doc, ...capturedEpochs, key, namespace:`page:${origin}`, capabilities, allowedOrigins:[origin],
        grantIncarnation:newId(), browserSessionIncarnation:session, active:true, grantedAt:now(), registrationId:host.registrationId};
      await tx.put('commandJournal', grant, key);
      return {grantIncarnation:grant.grantIncarnation, documentId:doc.documentId};
    });
  }
  async function helloSdk(request, sender) {
    invariant(request && Object.keys(request).length === 1 && request.sdkVersion === SDK_VERSION, 'E_VERSION', 'SDK version differs');
    const doc = document(sender);
    await native(doc);
    return storage.transaction(['commandJournal'], 'readonly', async tx => {
      const grant = await activeGrant(tx, doc);
      return {sdkVersion:SDK_VERSION, ready:true, methods:Object.entries(SDK_METHODS)
        .filter(([,method]) => grant.capabilities.includes(method.capability)).map(([name]) => name)};
    });
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
    return {grant, operation};
  }
  async function authorizeSdk(context, request = {}) {
    const captured = contexts.get(context);
    invariant(captured, 'E_OWNER', 'SDK context was not issued by the shared authority');
    await native(captured.doc);
    let targetOrigin;
    if (request.url !== undefined) {
      targetOrigin = httpUrl(request.url).origin;
      invariant(await api.permissions.contains({origins:[permissionPattern(targetOrigin)]}), 'E_PERMISSION', 'SDK request origin is not permitted');
    }
    if (request.capability === 'notifications') invariant(await api.permissions.contains({permissions:['notifications']}), 'E_PERMISSION', 'Notifications permission is absent');
    return storage.transaction(['commandJournal'], request.phase === 'pre' ? 'readwrite' : 'readonly', async tx => {
      const admitted = await authorizeSdkInTransaction(tx, context);
      if (request.capability) invariant(admitted.grant.capabilities.includes(request.capability), 'E_PERMISSION', 'SDK request capability is not granted');
      if (targetOrigin) invariant(admitted.grant.allowedOrigins.includes(targetOrigin), 'E_PERMISSION', 'SDK cross-origin capability is absent');
      if (request.phase === 'pre' && ['network','notifications','storage.session'].includes(request.capability)) {
        invariant(admitted.operation.state === 'admitted', 'E_EFFECT_UNKNOWN', 'SDK external effect already dispatched');
        admitted.operation.state = 'dispatched'; admitted.operation.submissionCount = 1; admitted.operation.dispatchAt = now();
        await tx.put('commandJournal', admitted.operation, captured.opKey);
      }
      return admitted;
    });
  }
  async function recordSdkEffect(context, value) {
    const captured = contexts.get(context);
    invariant(captured, 'E_OWNER', 'Effect receipt requires the original trusted driver context');
    const valueWire = encodeValue(value);
    return storage.transaction(['commandJournal','results','runs'], 'readwrite', async tx => {
      const operation = await tx.get('commandJournal', captured.opKey);
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
        valueWire, receiptAt:now(), grantIncarnation:captured.grantIncarnation};
      operation.state = 'durable'; operation.resultId = result.resultId; operation.receiptAt = result.receiptAt;
      await tx.put('results', result, result.resultId);
      await tx.put('commandJournal', operation, captured.opKey);
      const run = await tx.get('runs', captured.runId);
      if (run) await tx.put('runs', {...run,state:'completed',resultId:result.resultId,completedAt:now()}, run.runId);
      return result;
    });
  }
  async function recordSdkNativeReceipt(context, receipt) {
    const captured = contexts.get(context);
    invariant(captured, 'E_OWNER', 'Native receipt requires the original driver context');
    const receiptWire = encodeValue(receipt);
    return storage.transaction(['commandJournal'], 'readwrite', async tx => {
      const operation = await tx.get('commandJournal', captured.opKey);
      invariant(operation?.opId === captured.opId && operation.requestDigest === captured.requestDigest &&
        (['dispatched','durable'].includes(operation.state) ||
          operation.state === 'effect_unknown' && operation.submissionCount === 1), 'E_EFFECT_UNKNOWN', 'Native receipt has no matching dispatch');
      operation.nativeReceiptWire = receiptWire; operation.nativeReceiptAt = now();
      await tx.put('commandJournal', operation, captured.opKey);
    });
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
    const doc = document(sender);
    await native(doc);
    const method = Object.hasOwn(SDK_METHODS, request.method) && SDK_METHODS[request.method];
    invariant(method, 'E_SERVICE_UNSUPPORTED', 'Unknown SDK method');
    invariant(Number.isSafeInteger(request.deadlineAt) && request.deadlineAt > clock.now(), 'E_DEADLINE', 'SDK request expired');
    const requestDigest = await digestUtf8(canonical([request.method, canonicalValue(request.args), request.deadlineAt]));
    const result = await storage.transaction(['commandJournal','runs','results'], 'readwrite', async tx => {
      const grant = await activeGrant(tx, doc);
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
          capability:method.capability, effect:method.effect, deadlineAt:Math.min(request.deadlineAt, clock.now() + 15000),
          browserSessionIncarnation:session, state:'admitted', cancelSeq:0, submissionCount:0, admittedAt:now()};
        await tx.put('commandJournal', operation, opKey);
        await tx.put('commandJournal', {tag:'sdk-request', grantIncarnation:grant.grantIncarnation, opKey}, lockKey);
        await tx.put('runs', {tag:'sdk-service', driver:'framework.sdk-service.v1', runId:operation.runId, opId:operation.opId,
          namespace:operation.namespace, browserSessionIncarnation:session, state:'preparing', createdAt:now()}, operation.runId);
      }
      return {operation, receipt:await tx.get('results', operation.resultId)};
    });
    const captured = {...result.operation, ...epochs(doc), doc};
    let context;
    context = Object.freeze({...result.operation,
      authorize:request => authorizeSdk(context, request), authorizeInTransaction:tx => authorizeSdkInTransaction(tx, context),
      recordEffect:value => recordSdkEffect(context, value), recordNativeReceipt:receipt => recordSdkNativeReceipt(context, receipt),
      assertDispatch:() => assertFence(captured)});
    contexts.set(context, captured);
    return {...result, context};
  }
  async function revokeSdkGrants({tabId, frameId, documentId, origins, permissions, reason = 'revoked'} = {}) {
    // Called synchronously by native listeners: invalidate in-flight closures
    // before an asynchronous IDB transaction or a native permission regrant.
    if (tabId !== undefined && frameId !== undefined) {
      const key = canonical([tabId,frameId]); frameEpochs.set(key,(frameEpochs.get(key) || 0) + 1);
    } else if (tabId !== undefined) tabEpochs.set(tabId,(tabEpochs.get(tabId) || 0) + 1);
    if (permissions?.includes('notifications')) notificationEpoch++;
    if (origins?.length) permissionRemovals.push([...origins]);
    return storage.transaction(['commandJournal'], 'readwrite', async tx => {
      for (const grant of await tx.all('commandJournal')) {
        if (grant.tag !== 'sdk-grant' || !grant.active) continue;
        if (tabId !== undefined && grant.tabId !== tabId) continue;
        if (frameId !== undefined && grant.frameId !== frameId) continue;
        if (documentId !== undefined && grant.documentId !== documentId) continue;
        if (origins || permissions) {
          const originRemoved = origins?.some(pattern => matchesOrigin(pattern,grant.origin));
          const permissionRemoved = permissions?.some(permission => grant.capabilities.includes(permission));
          if (!originRemoved && !permissionRemoved) continue;
        }
        grant.active = false; grant.closedAt = now(); grant.closeReason = reason;
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
      // Active grants already contain committed event baselines. Restore only
      // their current-session epochs, never a closed incarnation. Native frame
      // and permission facts are still rechecked by Hello and every dispatch.
      for (const grant of rows) {
        if (grant.tag !== 'sdk-grant' || !grant.active || grant.browserSessionIncarnation !== session) continue;
        for (const field of ['tabEpoch','frameEpoch','permissionEpoch','notificationEpoch'])
          invariant(Number.isSafeInteger(grant[field]) && grant[field] >= 0,'E_GRANT_REVOKED','SDK grant epoch is malformed');
        tabEpochs.set(grant.tabId,Math.max(tabEpochs.get(grant.tabId) || 0,grant.tabEpoch));
        const key = frameKey(grant);
        frameEpochs.set(key,Math.max(frameEpochs.get(key) || 0,grant.frameEpoch));
        permissionBases.set(grant.origin,Math.max(permissionBases.get(grant.origin) || 0,
          grant.permissionEpoch - removalCount(grant.origin)));
        notificationEpoch = Math.max(notificationEpoch,grant.notificationEpoch);
      }
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
          await tx.put('runs',{...run,state:'completed',resultId:operation.resultId},run.runId);
        } else if (operation.state === 'effect_unknown' || operation.state === 'failed') {
          await tx.put('runs',{...run,state:operation.state === 'effect_unknown' ? 'paused_unknown' : 'failed',
            terminalReason:operation.deliveryError?.message || operation.state},run.runId);
        }
      }
    });
  }
  return {grantSdk, helloSdk, authorizeSdkInjection, admitSdk, authorizeSdk, authorizeSdkInTransaction, recordSdkEffect,
    recordSdkNativeReceipt, failSdk, revokeSdkGrants, recoverSdk, settleSdkDelivery};
}
