import {PageError, requireValue, frozenCopy, encodeValue as controlEncodeValue, decodeValue as controlDecodeValue,
  httpURL, options, duration, selector, VALUE_LIMITS, newPageRequestId} from './value.js';
import {chromeCall} from '../../platform/chrome/tabs.js';
import {validateLocatorDescriptor, validateLocatorOperation, validateObservationOptions} from './locator-contract.js';
import {createCookieService} from '../../platform/chrome/cookies.js';
import {buildPageEvaluation, readPageEvaluationResult, buildCancelPageWaits} from '../../scripting/user-scripts/page-evaluator.js';

export const PACKAGED_PAGE_FILE = 'scripting/packaged/page-session.js';
const MESSAGE = 'OPENDESK_CONTROLLER_PAGE_SESSION_V1';
const unavailableByAPI = new WeakMap();
const methods = Object.freeze({
  packaged: new Set(['title', 'content', 'url', 'snapshot', 'snapshots', 'click', 'type', 'keyboard',
    'waitForTimeout', 'waitForSelector', 'uploadChunk', 'uploadCommit', 'addScriptTag', 'addStyleTag',
    'locatorRead', 'locatorWait', 'locatorAction', 'locatorObserve']),
  browser: new Set(['goto', 'reload', 'cookies', 'setCookie', 'deleteCookie', 'screenshot', 'uploadFromUrl']),
  'user-script': new Set(['evaluate', '$eval', '$$eval', 'evaluateExpression', 'eval', 'waitForFunction'])
});
const ownerKey = run => JSON.stringify([run.runId, run.ownerEpoch]);
const injectionTarget = target => ({tabId: target.tabId, documentIds: [target.documentId]});
const messageTarget = target => ({documentId: target.documentId, frameId: target.frameId});
const error = code => new PageError(code);
export function validateControllerEnvelope(envelope) {
  requireValue(envelope?.operation && Object.hasOwn(methods, envelope.operation.kind) &&
    methods[envelope.operation.kind].has(envelope.operation.method), 'E_OPERATION_UNSUPPORTED');
  const {identity, revision, target, requestId} = envelope;
  requireValue(identity?.tag === 'controller-run' && typeof identity.runId === 'string' && identity.runId &&
    Number.isSafeInteger(identity.ownerEpoch) && identity.ownerEpoch > 0, 'E_OWNER_CHANGED');
  requireValue(typeof requestId === 'string' && requestId && revision && typeof revision.scriptId === 'string' && revision.scriptId &&
    Number.isSafeInteger(revision.revision) && revision.revision > 0 && /^[a-f0-9]{64}$/.test(revision.sourceHash) &&
    // Draft revisions are immutable admission snapshots bound to this run,
    // not saved script pins. Never invent or demand a permanent draft pin.
    (revision.kind === 'draft'
      ? revision.scriptId === `draft:${identity.runId}` && revision.pinKey === undefined
      : revision.kind === undefined && typeof revision.pinKey === 'string' && revision.pinKey),
    'E_PAGE_CONTEXT_REQUIRED');
  requireValue(Number.isSafeInteger(target?.tabId) && target.tabId >= 0 && Number.isSafeInteger(target.frameId) && target.frameId >= 0 &&
    typeof target.documentId === 'string' && target.documentId, 'E_TARGET');
  if (identity.target !== undefined) requireValue(JSON.stringify(identity.target) === JSON.stringify(target), 'E_TARGET');
  const args = controlDecodeValue(envelope.operation.args, {maxBytes: envelope.operation.method === 'uploadChunk' ? 131072 : 65536});
  requireValue(Array.isArray(args), 'E_ARGUMENT_TYPE'); return args;
}

// Authority owns admission, revision/lease/grants, durable navigation intent and
// result persistence. This driver only observes and dispatches exact native APIs.
export const COOKIE_PREFLIGHT_METHODS=Object.freeze(['cookies','setCookie','deleteCookie']);
export const COOKIE_PREFLIGHT_CODES=Object.freeze(['E_COOKIE_FORMAT','E_COOKIE_SCOPE','E_COOKIE_PARTITION_UNSUPPORTED','E_PERMISSION_DENIED']);
export function createControllerDriver({api = globalThis.chrome, authorize, clock = Date, withWrite = async (_owner, fn) => fn()} = {}) {
  requireValue(api && typeof authorize === 'function' && typeof clock.now === 'function' && typeof withWrite === 'function', 'E_PAGE_CONTEXT_REQUIRED');
  const runs = new Map(), retired = new Set();
  const finalFailures = new WeakMap();
  if (!unavailableByAPI.has(api)) unavailableByAPI.set(api, new Set());
  const unavailable = unavailableByAPI.get(api);
  function guard(state) {
    if (state.controller.signal.aborted) throw state.controller.signal.reason;
    if (state.run.closed) throw state.run.closed;
    if (state.deadlineAt !== null && clock.now() >= state.deadlineAt) throw error('E_TIMEOUT');
    if (state.locatorAbort?.signal.aborted) throw state.locatorAbort.signal.reason;
    if (state.locatorExpiryAt !== undefined && clock.now() >= state.locatorExpiryAt) throw error('E_TIMEOUT');
  }
  async function permission(state, phase, extra = {}) {
    guard(state);
    const decision = await race(state, authorize(state.envelope, {phase,
      ...(state.navigationPending && (!state.handoff || phase === 'pre') ? {navigationPending: true} : {}),
      ...(state.handoff && phase === 'post' ? {handoff: state.handoff} : {}), ...extra}));
    requireValue(decision !== false, 'E_PERMISSION'); guard(state);
  }
  function race(state, promise) {
    // A per-Locator clock can stop one operation without retiring the run.
    const signals = [state.controller.signal, state.locatorAbort?.signal].filter(Boolean);
    return new Promise((resolve, reject) => {
      let settled = false;
      const listeners = signals.map(signal => () => finish(reject, signal.reason));
      function finish(done, value) {
        if (settled) return;
        settled = true;
        signals.forEach((signal, index) => signal.removeEventListener('abort', listeners[index]));
        done(value);
      }
      Promise.resolve(promise).then(value => finish(resolve, value), cause => finish(reject, cause));
      const aborted = signals.find(signal => signal.aborted);
      if (aborted) finish(reject, aborted.reason);
      else signals.forEach((signal, index) => signal.addEventListener('abort', listeners[index], {once: true}));
    });
  }
  async function wait(state, promise, extra = {}) {
    let timer, ended = false;
    async function poll() {
      try { await permission(state, 'pre', extra); if (!ended) timer = setTimeout(poll, 25); }
      catch (cause) {
        if (state.locatorAbort && cause?.code === 'E_TIMEOUT' && !state.controller.signal.aborted)
          state.locatorAbort.abort(cause);
        else state.controller.abort(cause);
      }
    }
    // Revalidate while an admitted native wait is pending, including when no
    // Chrome callback arrives. A late callback can never revive delivery.
    timer = setTimeout(poll, 25);
    try { const value = await race(state, promise); await permission(state, 'post', extra); return value; }
    finally { ended = true; clearTimeout(timer); }
  }
  async function saveReceipt(state, stage, receipt) {
    if (state.recordReceipt) await state.recordReceipt({requestId: state.envelope.requestId, stage, receipt: frozenCopy(receipt)});
  }
  async function step(state, dispatch, extra = {}, stage) {
    await permission(state, 'pre', extra); guard(state);
    const dispatched = Promise.resolve(dispatch()).then(async value => {
      if (stage) await saveReceipt(state, stage, value); return value;
    });
    return wait(state, dispatched, extra);
  }
  async function native(state, owner, method, args, extra) {
    const namespace = ['tabs', 'windows', 'cookies', 'scripting', 'webNavigation'].find(name => api[name] === owner);
    return step(state, () => chromeCall(api, owner, method, ...args), extra, `${namespace}.${method}`);
  }
  async function verifyTarget(state, target = state.handoff?.to || state.envelope.target) {
    const frames = await native(state, api.webNavigation, 'getAllFrames', [{tabId: target.tabId}]);
    const frame = frames?.find(row => row.frameId === target.frameId);
    requireValue(frame && frame.documentId === target.documentId && !frame.errorOccurred &&
      (!frame.documentLifecycle || frame.documentLifecycle === 'active'), 'E_DOCUMENT_REPLACED');
    const url = httpURL(frame.url);
    requireValue(!target.allowedOrigin || new URL(url).origin === target.allowedOrigin, 'E_DOCUMENT_REPLACED');
    await permission(state, 'post', {url}); return url;
  }
  async function pageReady(state) {
    const target = state.envelope.target, key = JSON.stringify([target.tabId, target.documentId]);
    if (state.run.pages.has(key)) { await wait(state, state.run.pages.get(key)); return; }
    const ready = (async () => {
      await verifyTarget(state);
      let reply;
      try { reply = await native(state, api.tabs, 'sendMessage', [target.tabId, {type: MESSAGE, action: 'ping'}, messageTarget(target)]); }
      catch (cause) {
        if (cause.code !== 'E_CHROME' || !/Receiving end does not exist|Could not establish connection/i.test(cause.message)) throw cause;
      }
      if (reply !== undefined) requireValue(reply?.type === MESSAGE && reply.ready === true, 'E_RESULT_FORMAT');
      else {
        await verifyTarget(state);
        const receipts = await native(state, api.scripting, 'executeScript', [{target: injectionTarget(target), world: 'ISOLATED', files: [PACKAGED_PAGE_FILE]}]);
        requireValue(Array.isArray(receipts) && receipts.length === 1 && receipts[0].documentId === target.documentId && receipts[0].frameId === target.frameId, 'E_TARGET');
      }
      await verifyTarget(state);
    })();
    state.run.pages.set(key, ready); state.run.pageTargets.set(key, state.envelope);
    try { await wait(state, ready); } catch (cause) { state.run.pages.delete(key); throw cause; }
  }
  async function packaged(state, method = state.envelope.operation.method, args = state.args) {
    await pageReady(state); await verifyTarget(state);
    const envelope = method === state.envelope.operation.method && args === state.args ? state.envelope :
      {...state.envelope, requestId: newPageRequestId(), operation: {kind: 'packaged', method,
        args: controlEncodeValue(args, {maxBytes: method === 'uploadChunk' ? 131072 : 65536})}};
    const reply = await native(state, api.tabs, 'sendMessage', [envelope.target.tabId,
      {type: MESSAGE, action: 'execute', envelope}, messageTarget(envelope.target)]);
    await verifyTarget(state);
    requireValue(reply?.requestId === envelope.requestId && reply.runId === envelope.identity.runId &&
      reply.ownerEpoch === envelope.identity.ownerEpoch, 'E_RESULT_FORMAT');
    if (reply.error) {
      requireValue(typeof reply.error.code === 'string' && reply.error.code && typeof reply.error.message === 'string', 'E_RESULT_FORMAT');
      const failure = new PageError(reply.error.code, reply.error.message);
      // Only this admitted operation is complete. A derived packaged call may
      // fail before its enclosing browser operation has a known final effect.
      if (state.envelope.operation.kind !== 'packaged' || envelope !== state.envelope) throw failure;
      const projected = {code: failure.code, name: failure.name, message: failure.message};
      await saveReceipt(state, 'packaged.finalFailure', {frameId: envelope.target.frameId,
        documentId: envelope.target.documentId, runId: reply.runId, ownerEpoch: reply.ownerEpoch, error: projected});
      const marker = {}; finalFailures.set(marker, projected); return marker;
    }
    return controlDecodeValue(reply.value);
  }
  async function userScriptsAvailable(state) {
    requireValue(!unavailable.has(ownerKey(state.envelope.identity)), 'E_USER_SCRIPTS_UNAVAILABLE');
    await permission(state, 'pre');
    let scripts;
    try {
      requireValue(typeof api.userScripts?.getScripts === 'function' && typeof api.userScripts?.execute === 'function', 'E_USER_SCRIPTS_UNAVAILABLE');
      scripts = await race(state, api.userScripts.getScripts());
    } catch (cause) {
      if (state.controller.signal.aborted) throw state.controller.signal.reason;
      unavailable.add(ownerKey(state.envelope.identity)); throw new PageError('E_USER_SCRIPTS_UNAVAILABLE', cause.message);
    }
    requireValue(Array.isArray(scripts), 'E_RESULT_FORMAT'); await permission(state, 'post');
  }
  async function userScript(state) {
    const descriptor = state.descriptor;
    await verifyTarget(state); await userScriptsAvailable(state);
    if (descriptor.wait) state.run.waits.set(state.envelope.requestId, {envelope: state.envelope, descriptor});
    try {
      const replies = await step(state, () => api.userScripts.execute({target: injectionTarget(state.envelope.target),
        world: descriptor.world, js: [{code: descriptor.code}]}), {}, 'userScripts.execute');
      await userScriptsAvailable(state); await verifyTarget(state);
      requireValue(Array.isArray(replies) && replies.length === 1 && replies[0].frameId === state.envelope.target.frameId &&
        replies[0].documentId === state.envelope.target.documentId, 'E_TARGET');
      if (replies[0].error) throw new PageError('E_PAGE_EXECUTION', replies[0].error);
      if(replies[0].result?.ok===false){
        const error=replies[0].result.error;
        requireValue(error&&typeof error.code==='string'&&error.code&&typeof error.message==='string'&&
          error.cause&&typeof error.cause.message==='string','E_RESULT_FORMAT');
        let failure;
        try{readPageEvaluationResult(replies[0].result);}catch(cause){failure=cause;}
        requireValue(failure instanceof PageError&&typeof failure.code==='string'&&typeof failure.message==='string','E_RESULT_FORMAT');
        const original=failure.cause, projected={code:failure.code,name:failure.name,message:failure.message,
          ...(original&&typeof original.message==='string'?{cause:{...(typeof original.name==='string'?{name:original.name}:{}),message:original.message}}:{})};
        // A raw execute callback is not enough. This receipt is recorded only
        // after exact frame/document validation and decoding its final failure.
        await saveReceipt(state,'userScripts.finalFailure',{frameId:replies[0].frameId,documentId:replies[0].documentId,error:projected});
        const marker={};finalFailures.set(marker,projected);return marker;
      }
      return readPageEvaluationResult(replies[0].result);
    } finally { if (!state.controller.signal.aborted) state.run.waits.delete(state.envelope.requestId); }
  }
  async function listen(state, event, listener) {
    requireValue(typeof event?.addListener === 'function' && typeof event.removeListener === 'function', 'E_CAPABILITY_UNAVAILABLE');
    await permission(state, 'pre'); guard(state); event.addListener(listener);
    state.cleanups.push(() => event.removeListener(listener));
  }
  async function navigate(state) {
    const {method} = state.envelope.operation, from = state.envelope.target;
    const config = method === 'goto' ? state.args[1] : state.args[0];
    const startURL = await verifyTarget(state), url = method === 'goto' ? state.args[0] : startURL;
    let candidate, chain = Promise.resolve(), armed = false, resolve, reject;
    const completed = new Promise((yes, no) => { resolve = yes; reject = no; }); completed.catch(() => {});
    function observe(kind, details) {
      if (!armed || details.tabId !== from.tabId || details.frameId !== 0) return;
      // Chrome supplies the new binding at commit, before the method's selected
      // readiness event. Pre-checks during the remaining wait use that binding.
      if (kind === 'commit' && typeof details.documentId === 'string' && details.documentId !== from.documentId) {
        try {
          const observedURL = httpURL(details.url);
          candidate = {...from, documentId: details.documentId, url: observedURL, allowedOrigin: new URL(observedURL).origin,
            targetVersion: (from.targetVersion || 0) + 1};
          state.handoff = {from, to: frozenCopy(candidate)};
        } catch (cause) { reject(cause); state.controller.abort(cause); return; }
      }
      chain = chain.then(async () => {
        guard(state);
        if (kind === 'error') throw error('E_NAVIGATION');
        const observedURL = httpURL(details.url);
        await permission(state, 'pre', {url: observedURL});
        if (kind === 'commit') {
          requireValue(typeof details.documentId === 'string' && details.documentId && details.documentId !== from.documentId, 'E_DOCUMENT_REPLACED');
        }
        if ((kind === 'dom' && config.waitUntil === 'domcontentloaded') ||
          (kind === 'complete' && config.waitUntil !== 'domcontentloaded')) {
          if (!candidate || candidate.documentId !== details.documentId) return;
          state.handoff = {from, to: frozenCopy(candidate)};
          await verifyTarget(state); await permission(state, 'post', {url: observedURL}); resolve();
        }
      }).catch(cause => { reject(cause); state.controller.abort(cause); });
    }
    for (const [name, kind] of [['onBeforeNavigate', 'before'], ['onCommitted', 'commit'], ['onDOMContentLoaded', 'dom'], ['onCompleted', 'complete'], ['onErrorOccurred', 'error']]) {
      await listen(state, api.webNavigation?.[name], details => observe(kind, details));
    }
    await verifyTarget(state); await permission(state, 'pre', {url});
    // The parent's durable intent MUST already be admitted by this pre-check.
    armed = true; state.navigationPending = true;
    await native(state, api.tabs, method === 'goto' ? 'update' : 'reload', method === 'goto' ? [from.tabId, {url}] : [from.tabId], {url});
    await wait(state, completed, {url}); await verifyTarget(state); return undefined;
  }
  async function screenshot(state) {
    let changed = false, windowId;
    await listen(state, api.tabs.onActivated, details => { if (windowId === undefined || details.windowId === windowId) changed = true; });
    await listen(state, api.tabs.onUpdated, (tabId, changes) => { if (tabId === state.envelope.target.tabId && (changes.url !== undefined || changes.status === 'loading')) changed = true; });
    await listen(state, api.webNavigation.onCommitted, details => { if (details.tabId === state.envelope.target.tabId && details.frameId === 0) changed = true; });
    async function visible(after = false) {
      await verifyTarget(state);
      const tab = await native(state, api.tabs, 'get', [state.envelope.target.tabId]);
      requireValue(tab?.id === state.envelope.target.tabId && tab.active && !tab.hidden && Number.isInteger(tab.windowId), after ? 'E_CAPTURE_TARGET_CHANGED' : 'E_CAPTURE_TARGET_UNAVAILABLE');
      if (windowId !== undefined) requireValue(windowId === tab.windowId, 'E_CAPTURE_TARGET_CHANGED');
      windowId = tab.windowId;
      const win = await native(state, api.windows, 'get', [windowId]);
      requireValue(win?.id === windowId && win.state !== 'minimized', after ? 'E_CAPTURE_TARGET_CHANGED' : 'E_CAPTURE_TARGET_UNAVAILABLE');
      if (state.envelope.target.windowId !== undefined) requireValue(windowId === state.envelope.target.windowId, 'E_CAPTURE_TARGET_CHANGED');
      requireValue(!changed, 'E_CAPTURE_TARGET_CHANGED');
    }
    await visible();
    const value = await native(state, api.tabs, 'captureVisibleTab', [windowId, {format: state.args[0].format}]);
    await visible(true); requireValue(typeof value === 'string' && value.startsWith(`data:image/${state.args[0].format};base64,`), 'E_RESULT_FORMAT');
    return value;
  }
  async function cookieOperation(state) {
    const currentURL = await verifyTarget(state), method = state.envelope.operation.method;
    // Validate every input and grant before native cookie reads or writes.
    let values;
    try {
      if (method === 'cookies') {
        requireValue(state.args.length === 1 && Array.isArray(state.args[0]) && state.args[0].length <= 100, 'E_COOKIE_SCOPE');
        values = [...new Set((state.args[0].length ? state.args[0] : [currentURL]).map(httpURL))];
      } else values = state.args.map(value => normalizeCookie(value, currentURL, method === 'deleteCookie', clock.now()));
      for (const value of values) {
        const url=typeof value==='string'?value:value.url;
        requireValue(new URL(url).origin===state.envelope.target.allowedOrigin,'E_PERMISSION_DENIED');
        await permission(state,'pre',{url});
      }
    } catch(cause) {
      // This checkpoint is input validation, not a Chrome cookie callback.
      // Permission/owner/target loss and every post-dispatch error stay fenced.
      if(!COOKIE_PREFLIGHT_CODES.includes(cause.code))throw cause;
      guard(state);const projected={code:cause.code,name:'PageError',message:String(cause.message||cause.code)};
      const {identity,target}=state.envelope;
      await saveReceipt(state,'cookies.preflightFailure',{phase:'input-preflight',method,frameId:target.frameId,
        documentId:target.documentId,runId:identity.runId,ownerEpoch:identity.ownerEpoch,error:projected});
      const marker={};finalFailures.set(marker,projected);return marker;
    }
    const stores = await native(state, api.cookies, 'getAllCookieStores', []);
    const matched = stores?.filter(store => store.tabIds?.includes(state.envelope.target.tabId));
    requireValue(matched?.length === 1 && typeof matched[0].id === 'string', 'E_COOKIE_SCOPE');
    const storeId = matched[0].id;
    for (const value of values) if (typeof value !== 'string') {
      requireValue(value.storeId === undefined || value.storeId === storeId, 'E_COOKIE_SCOPE'); value.storeId = storeId;
    }
    let fault, selection;
    // Only createCookieService drives getAll/set/remove. The local facade adds
    // the observed tab store and narrows delete candidates, without mutating api.
    const scopedAPI = {runtime: api.runtime, cookies: {
      getAll(details, callback) {
        guard(state);
        api.cookies.getAll({...details, storeId}, rows => {
          if (api.runtime.lastError) { callback(rows); return; }
          saveReceipt(state, 'cookies.getAll', rows).then(() => { try {
            if (Array.isArray(rows)) {
              requireValue(rows.every(row => row.storeId === storeId), 'E_COOKIE_SCOPE');
              requireValue(rows.every(row => row.partitionKey === undefined), 'E_COOKIE_PARTITION_UNSUPPORTED');
              if (selection) {
                const candidates = rows.filter(row => row.name === selection.name && row.path === selection.path);
                requireValue(candidates.length <= 1, 'E_COOKIE_SCOPE');
                rows = candidates.filter(row => !selection.domain || row.domain.replace(/^\./, '') === selection.domain.replace(/^\./, ''));
              }
            }
            callback(rows);
          } catch (cause) { fault = cause; callback(undefined); } }, cause => { fault = cause; callback(undefined); });
        });
      },
      set(details, callback) { guard(state); api.cookies.set({...details, storeId}, receipt => {
        if (api.runtime.lastError) { callback(receipt); return; }
        saveReceipt(state, 'cookies.set', receipt).then(() => callback(receipt), cause => { fault = cause; callback(undefined); });
      }); },
      remove(details, callback) { guard(state); api.cookies.remove({...details, storeId}, receipt => {
        if (api.runtime.lastError) { callback(receipt); return; }
        if (!receipt) fault = error('E_COOKIE_OPERATION');
        saveReceipt(state, 'cookies.remove', receipt).then(() => callback(receipt), cause => { fault = cause; callback(undefined); });
      }); }
    }};
    const service = createCookieService({api: scopedAPI, authorize: async request => {
      if (request.phase === 'pre') await verifyTarget(state);
      await permission(state, request.phase, {url: request.url});
    }});
    try {
      if (method === 'cookies') {
        const all = new Map();
        for (const url of values) for (const cookie of await wait(state, service.getCookies(url))) {
          all.set(JSON.stringify([cookie.storeId, cookie.name, cookie.domain, cookie.path]), {
            name: cookie.name, value: cookie.value, domain: cookie.domain, path: cookie.path,
            expires: cookie.expirationDate, httpOnly: cookie.httpOnly, secure: cookie.secure, sameSite: cookie.sameSite
          });
        }
        return [...all.values()];
      }
      if (method === 'setCookie') await wait(state, service.setCookies(values));
      else {
        // Preflight the whole batch before the first removal. Missing precise
        // candidates are harmless; ambiguous candidates never become guesses.
        const removals = [];
        for (const value of values) {
          selection = value; const rows = await wait(state, service.getCookies(value.url));
          if (rows.length) removals.push(value);
        }
        for (const value of removals) {
          selection = value; await wait(state, service.deleteCookiesByUrl(value.url));
          if (fault) throw fault;
        }
      }
      await verifyTarget(state); return undefined;
    } catch (cause) {
      if (fault) throw fault;
      if (cause.code === 'E_CHROME') throw new PageError('E_COOKIE_OPERATION', cause.message);
      if (cause.code === 'E_SCHEMA') throw new PageError('E_COOKIE_FORMAT', cause.message);
      throw cause;
    }
  }
  const fetchImpl = globalThis.fetch?.bind(globalThis);
  async function uploadFromURL(state) {
    const [css, input] = state.args; selector(css); let url = httpURL(input), response;
    requireValue(typeof fetchImpl === 'function', 'E_CAPABILITY_UNAVAILABLE');
    await verifyTarget(state);
    for (let redirects = 0;; redirects++) {
      try { response = await step(state, () => fetchImpl(url, {method: 'GET', redirect: 'manual', credentials: 'omit',
        signal: state.controller.signal}).then(async response => {
        await saveReceipt(state, 'fetch.response', {url, status: response.status, type: response.type}); return response;
      }), {url}); }
      catch (cause) { if (cause.code) throw cause; throw new PageError('E_NETWORK', cause.message); }
      requireValue(!['opaque', 'opaqueredirect'].includes(response.type), 'E_NETWORK');
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      await response.body?.cancel(); requireValue(redirects < 5, 'E_LIMIT');
      const location = response.headers.get('location'); requireValue(location, 'E_NETWORK');
      const next = httpURL(new URL(location, url).href);
      requireValue(!(url.startsWith('https:') && next.startsWith('http:')), 'E_UPLOAD_URL_UNSUPPORTED');
      url = next;
    }
    if (!response.ok) { await response.body?.cancel(); throw new PageError('E_HTTP', `HTTP ${response.status}`); }
    const length = Number(response.headers.get('content-length'));
    if (length > VALUE_LIMITS.uploadBytes) { await response.body?.cancel(); throw error('E_LIMIT'); }
    const chunks = []; let total = 0;
    if (response.body) {
      const reader = response.body.getReader();
      const cancel = () => { reader.cancel().catch(() => {}); };
      state.controller.signal.addEventListener('abort', cancel, {once: true});
      try {
        for (;;) {
          const {done, value} = await step(state, () => reader.read(), {url}); if (done) break;
          total += value.byteLength; requireValue(total <= VALUE_LIMITS.uploadBytes, 'E_LIMIT'); chunks.push(value);
        }
      } catch (cause) { await reader.cancel().catch(() => {}); if (cause.code) throw cause; throw error('E_NETWORK'); }
      finally { state.controller.signal.removeEventListener('abort', cancel); reader.releaseLock(); }
    }
    await permission(state, 'post', {url}); await verifyTarget(state);
    const uploadId = newPageRequestId(), bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; } chunks.length = 0;
    try {
      for (offset = 0; offset < total; offset += VALUE_LIMITS.chunkBytes) {
        let binary = ''; for (const byte of bytes.subarray(offset, offset + VALUE_LIMITS.chunkBytes)) binary += String.fromCharCode(byte);
        await permission(state, 'pre', {url});
        await packaged(state, 'uploadChunk', [uploadId, offset, total, btoa(binary)]);
      }
      await permission(state, 'pre', {url}); await packaged(state, 'uploadCommit', [css, uploadId, total]); return true;
    } finally { bytes.fill(0); }
  }
  async function cleanupCall(envelope, dispatch) {
    let timer;
    try {
      await Promise.race([(async () => {
        const decision = await authorize(envelope, {phase: 'pre'}); requireValue(decision !== false, 'E_PERMISSION');
        await dispatch(); await authorize(envelope, {phase: 'post'});
      })(), new Promise(resolve => { timer = setTimeout(resolve, 250); })]);
    } catch { /* Authority/grant loss can prevent remote cleanup; pagehide still disposes the isolated registry. */ }
    finally { clearTimeout(timer); }
  }
  async function cancel(run) {
    const identity = run?.identity || run;
    requireValue(identity?.tag === 'controller-run' && typeof identity.runId === 'string' &&
      Number.isSafeInteger(identity.ownerEpoch), 'E_OWNER_CHANGED');
    const key = ownerKey(identity); retired.add(key); const record = runs.get(key);
    if (!record) {
      // Authority may create a fresh short-lived driver for retirement. It must
      // supply the original epoch identity and exact run binding, not an active
      // tab selection. The cleanup envelope is never passed to execute().
      if (!identity.target || !run?.revision) return;
      const envelope = {requestId: newPageRequestId(), identity, revision: run.revision, target: identity.target,
        operation: {kind: 'packaged', method: 'cancel', args: controlEncodeValue([])}};
      await cleanupCall(envelope, () => chromeCall(api, api.tabs, 'sendMessage', envelope.target.tabId,
        {type: MESSAGE, action: 'cancel', run: identity}, messageTarget(envelope.target)));
      if (!unavailable.has(key)) await cancelWaits(envelope, {world: 'USER_SCRIPT', runId: key});
      return;
    }
    if (record.cancelling) return record.cancelling;
    record.closed = error('E_CANCELLED');
    for (const state of record.pending) state.controller.abort(record.closed);
    record.cancelling = (async () => {
      for (const envelope of record.pageTargets.values()) await cleanupCall(envelope, () => chromeCall(api, api.tabs, 'sendMessage',
        envelope.target.tabId, {type: MESSAGE, action: 'cancel', run: identity}, messageTarget(envelope.target)));
      for (const {envelope, descriptor} of record.waits.values()) {
        if (!unavailable.has(key)) await cancelWaits(envelope, descriptor);
      }
      record.pages.clear(); record.pageTargets.clear(); record.waits.clear(); runs.delete(key);
    })();
    return record.cancelling;
  }
  async function cancelWaits(envelope, descriptor) {
    await cleanupCall(envelope, async () => {
      // Only the generated framework wait harness is cancelled. This never
      // promises to interrupt arbitrary synchronous user page code.
      try { await api.userScripts.getScripts(); }
      catch (cause) { unavailable.add(ownerKey(envelope.identity)); throw cause; }
      const decision = await authorize(envelope, {phase: 'pre'}); requireValue(decision !== false, 'E_PERMISSION');
      await api.userScripts.execute({target: injectionTarget(envelope.target), world: descriptor.world,
        js: [{code: buildCancelPageWaits(descriptor.runId)}]});
      await authorize(envelope, {phase: 'pre'});
      try { await api.userScripts.getScripts(); }
      catch (cause) { unavailable.add(ownerKey(envelope.identity)); throw cause; }
    });
  }
  // Prepare is always read-only. Every loop iteration re-enters native target
  // validation and the authority; only the short commit window holds a write
  // gate. No prepare response can itself authorize a later click/fill.
  async function locatorStages(state) {
    const {method} = state.envelope.operation, [description, raw] = state.args;
    requireValue(state.args.length === 2, 'E_ARGUMENT_TYPE');
    const descriptor = validateLocatorDescriptor(description), op = validateLocatorOperation(raw);
    requireValue(method === 'locatorWait' ? op.action === 'waitFor' :
      method === 'locatorAction' && ['click','fill'].includes(op.action), 'E_OPERATION_UNSUPPORTED');
    // The single clock starts before the first authorization and document RPC.
    const expiry = state.locatorExpiryAt;
    let submitted = false, lastReason = 'E_SELECTOR_NOT_FOUND';
    try {
      for (;;) {
        guard(state);
        if (clock.now() >= expiry) throw new PageError('E_TIMEOUT', 'Locator ' + op.action + ' timed out (' + lastReason + ')');
        if (method === 'locatorWait') {
          const reply = await packaged(state, 'locatorRead', [descriptor, {action:'waitFor',state:op.state}]);
          if (reply?.ready) return undefined;
          lastReason = 'E_WAIT_CONDITION';
        } else {
          const prepared = await packaged(state, 'locatorPrepare', [descriptor, op]);
          requireValue(prepared && typeof prepared.ready === 'boolean', 'E_RESULT_FORMAT');
          if (prepared.ready) {
            requireValue(typeof prepared.token === 'string', 'E_RESULT_FORMAT');
            const outcome = await withWrite(state.envelope.identity, async () => {
              await permission(state, 'pre'); await verifyTarget(state);
              // Persist the uncertainty boundary before sending a page effect.
              await saveReceipt(state, 'locator.commitIntent', {documentId:state.envelope.target.documentId});
              submitted = true;
              return packaged(state, 'locatorCommit', [descriptor, op, prepared.token]);
            });
            requireValue(outcome && typeof outcome.committed === 'boolean', 'E_RESULT_FORMAT');
            if (outcome.committed) return undefined;
            // The selected document explicitly confirmed no focus, scroll,
            // setter or click happened. A fresh prepare is safe.
            await saveReceipt(state, 'locator.commitNoEffect', {documentId:state.envelope.target.documentId});
            submitted = false; lastReason = outcome.reason || 'E_ELEMENT_DETACHED';
          } else lastReason = prepared.reason || 'E_WAIT_CONDITION';
        }
        const remaining = expiry - clock.now();
        if (remaining <= 0) continue;
        await wait(state, new Promise(resolve => setTimeout(resolve, Math.min(40, remaining))));
      }
    } catch (cause) {
      // A clear read-only rejection can be persisted as a target-bound, final
      // failure rather than incorrectly poisoning the run as effect-unknown.
      // No such proof exists after a commit was dispatched.
      if (submitted || !['E_TIMEOUT','E_STRICT_MODE_VIOLATION','E_SELECTOR_INVALID','E_SELECTOR_NOT_FOUND',
        'E_INPUT_TARGET_UNSUPPORTED','E_WRITE_CONFLICT'].includes(cause.code)) throw cause;
      // No commit was sent: remove only the *local* deadline to record a
      // target-bound no-effect failure under the original run deadline.
      clearTimeout(state.locatorTimer);
      delete state.locatorAbort; delete state.locatorExpiryAt;
      await permission(state, 'pre'); await verifyTarget(state);
      const projected = {code:cause.code,name:'PageError',message:cause.message};
      await saveReceipt(state, 'packaged.finalFailure', {frameId:state.envelope.target.frameId,
        documentId:state.envelope.target.documentId,runId:state.envelope.identity.runId,
        ownerEpoch:state.envelope.identity.ownerEpoch,error:projected});
      const marker = {}; finalFailures.set(marker, projected); return marker;
    }
  }
  async function execute(input, {signal, deadlineAt = null, recordReceipt} = {}) {
    const envelope = frozenCopy(input), args = validateControllerEnvelope(envelope), {kind, method} = envelope.operation;
    requireValue(deadlineAt === null || Number.isFinite(deadlineAt), 'E_ARGUMENT_TYPE');
    requireValue(recordReceipt === undefined || typeof recordReceipt === 'function', 'E_ARGUMENT_TYPE');
    let descriptor;
    if (kind === 'packaged' && method.startsWith('locator')) {
      if (method === 'locatorObserve') { requireValue(args.length === 1, 'E_ARGUMENT_TYPE'); validateObservationOptions(args[0]); }
      else {
        requireValue(args.length === 2, 'E_ARGUMENT_TYPE'); validateLocatorDescriptor(args[0]);
        const op = validateLocatorOperation(args[1]);
        requireValue(method === 'locatorAction' ? ['click','fill'].includes(op.action) :
          method === 'locatorWait' ? op.action === 'waitFor' : ['count','textContent','getAttribute'].includes(op.action), 'E_OPERATION_UNSUPPORTED');
      }
    }
    if (kind === 'user-script') descriptor = buildPageEvaluation(method, args,
      {operationId: envelope.requestId, runId: ownerKey(envelope.identity)});
    if (kind === 'browser' && ['goto', 'reload'].includes(method)) {
      requireValue(envelope.target.frameId === 0, 'E_TOP_FRAME_REQUIRED');
      requireValue(args.length === (method === 'goto' ? 2 : 1), 'E_ARGUMENT_TYPE');
      if (method === 'goto') args[0] = httpURL(args[0]);
      const config = args[method === 'goto' ? 1 : 0]; options(config, ['timeout', 'waitUntil']); duration(config.timeout);
      requireValue(['complete', 'load', 'domcontentloaded'].includes(config.waitUntil), 'E_OPTION_UNSUPPORTED');
      if (config.timeout > 0) deadlineAt = Math.min(deadlineAt ?? Infinity, clock.now() + config.timeout);
    }
    if (method === 'screenshot') {
      requireValue(envelope.target.frameId === 0, 'E_TOP_FRAME_REQUIRED');
      requireValue(args.length === 1, 'E_ARGUMENT_TYPE'); options(args[0], ['format', 'fullPage']);
      requireValue(args[0].fullPage === undefined || typeof args[0].fullPage === 'boolean', 'E_ARGUMENT_TYPE');
      requireValue(!args[0].fullPage, 'E_FULL_PAGE_UNSUPPORTED');
      requireValue(['png', 'jpeg'].includes(args[0].format), 'E_OPTION_UNSUPPORTED');
    }
    if (method === 'uploadFromUrl') { requireValue(args.length === 2, 'E_ARGUMENT_TYPE'); selector(args[0]); httpURL(args[1]); }
    const key = ownerKey(envelope.identity); requireValue(!retired.has(key), 'E_CANCELLED');
    let run = runs.get(key);
    if (!run) {
      run = {pending: new Set(), requests: new Set(), pages: new Map(), pageTargets: new Map(), waits: new Map(), userScriptsUnavailable: false}; runs.set(key, run);
    }
    requireValue(!run.requests.has(envelope.requestId), 'E_OPERATION_REPLAY'); run.requests.add(envelope.requestId);
    const controller = new AbortController(), state = {envelope, args, descriptor, run, controller, deadlineAt, recordReceipt, cleanups: []};
    if (kind === 'packaged' && (method === 'locatorAction' || method === 'locatorWait')) {
      state.locatorExpiryAt = Math.min(deadlineAt ?? Infinity, clock.now() + (args[1].timeout ?? 30000));
      state.locatorAbort = new AbortController();
      state.locatorTimer = setTimeout(() => state.locatorAbort?.abort(error('E_TIMEOUT')),
        Math.max(0, state.locatorExpiryAt - clock.now()));
    }
    const abort = () => controller.abort(signal.reason?.code ? signal.reason : error('E_CANCELLED'));
    let timer;
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, {once: true});
    if (deadlineAt !== null) timer = setTimeout(() => controller.abort(error('E_TIMEOUT')), Math.max(0, deadlineAt - clock.now()));
    run.pending.add(state);
    try {
      await permission(state, 'pre'); await verifyTarget(state);
      let result;
      if (kind === 'packaged') result = method === 'locatorAction' || method === 'locatorWait' ?
        await locatorStages(state) : await packaged(state);
      else if (kind === 'user-script') result = await userScript(state);
      else if (['goto', 'reload'].includes(method)) result = await navigate(state);
      else if (method === 'screenshot') result = await screenshot(state);
      else if (method === 'uploadFromUrl') result = await uploadFromURL(state);
      else result = await cookieOperation(state);
      const failure=finalFailures.get(result);
      const reply = failure ? {requestId:envelope.requestId,error:failure} :
        {requestId: envelope.requestId, value: controlEncodeValue(result), ...(state.handoff ? {handoff: state.handoff} : {})};
      await saveReceipt(state, 'result', reply);
      await verifyTarget(state); await permission(state, 'pre');
      await permission(state, 'post'); guard(state); return reply;
    } catch (cause) {
      if (controller.signal.aborted) { const reason = controller.signal.reason; await cancel(envelope.identity); throw reason; }
      throw cause;
    } finally {
      clearTimeout(timer); clearTimeout(state.locatorTimer);
      delete state.locatorAbort; delete state.locatorExpiryAt;
      signal?.removeEventListener('abort', abort); run.pending.delete(state);
      for (const dispose of state.cleanups.reverse()) dispose();
    }
  }
  return Object.freeze({execute, cancel});
}

function normalizeCookie(input, defaultURL, deleting, now) {
  let value;
  if (typeof input === 'string') {
    if (deleting) { requireValue(input && !/[;=\s]/.test(input), 'E_COOKIE_FORMAT'); value = {name: input, path: '/'}; }
    else {
      const [pair, ...attributes] = input.split(';'), index = pair.indexOf('=');
      requireValue(index > 0, 'E_COOKIE_FORMAT'); value = {name: pair.slice(0, index).trim(), value: pair.slice(index + 1).trim()};
      const seen = new Set();
      for (const attribute of attributes) {
        const index = attribute.indexOf('='), key = (index < 0 ? attribute : attribute.slice(0, index)).trim().toLowerCase();
        const text = index < 0 ? undefined : attribute.slice(index + 1).trim();
        requireValue(!seen.has(key), 'E_COOKIE_FORMAT'); seen.add(key);
        if (key === 'secure') { requireValue(text === undefined, 'E_COOKIE_FORMAT'); value.secure = true; }
        else if (key === 'path' || key === 'domain') { requireValue(text, 'E_COOKIE_FORMAT'); value[key] = text; }
        else if (key === 'samesite') value.sameSite = text;
        else if (key === 'expires') { const parsed = Date.parse(text); requireValue(Number.isFinite(parsed), 'E_COOKIE_FORMAT'); value.expires = parsed / 1000; }
        else if (key === 'max-age') { requireValue(/^-?\d+$/.test(text), 'E_COOKIE_FORMAT'); value.expirationDate = now / 1000 + Number(text); }
        else throw error(key === 'partitioned' ? 'E_COOKIE_PARTITION_UNSUPPORTED' : 'E_COOKIE_FORMAT');
      }
    }
  } else {
    requireValue(input && typeof input === 'object' && !Array.isArray(input), 'E_COOKIE_FORMAT'); value = {...input};
    requireValue(!Object.hasOwn(value, 'partitionKey') && !Object.hasOwn(value, 'partitioned'), 'E_COOKIE_PARTITION_UNSUPPORTED');
    for (const key of Object.keys(value)) requireValue(['name', 'value', 'url', 'domain', 'path', 'secure', 'httpOnly', 'sameSite',
      'expires', 'expirationDate', 'session', 'storeId', 'hostOnly'].includes(key), 'E_COOKIE_FORMAT');
  }
  requireValue(typeof value.name === 'string' && value.name && !/[;=\s\x00-\x1f\x7f]/.test(value.name), 'E_COOKIE_FORMAT');
  if (!deleting) requireValue(typeof value.value === 'string' && !/[;\r\n\x00]/.test(value.value), 'E_COOKIE_FORMAT');
  value.url = httpURL(value.url ?? defaultURL); const url = new URL(value.url);
  if (value.domain !== undefined) {
    requireValue(typeof value.domain==='string','E_COOKIE_SCOPE');
    requireValue(value.domain.replace(/^\./,'')===url.hostname,'E_PERMISSION_DENIED');
  }
  if (deleting && value.path === undefined) value.path = url.pathname.slice(0, url.pathname.lastIndexOf('/')) || '/';
  if (value.path !== undefined) requireValue(typeof value.path === 'string' && value.path.startsWith('/') && !/[;\r\n]/.test(value.path), 'E_COOKIE_FORMAT');
  if (deleting) { url.pathname = value.path; url.search = ''; url.hash = ''; value.url = url.href; }
  for (const key of ['secure', 'httpOnly', 'session', 'hostOnly']) if (value[key] !== undefined) requireValue(typeof value[key] === 'boolean', 'E_COOKIE_FORMAT');
  if (value.sameSite !== undefined) {
    const sites = {lax: 'lax', strict: 'strict', none: 'no_restriction', no_restriction: 'no_restriction', unspecified: 'unspecified'};
    requireValue(typeof value.sameSite === 'string' && Object.hasOwn(sites, value.sameSite.toLowerCase()), 'E_COOKIE_FORMAT'); value.sameSite = sites[value.sameSite.toLowerCase()];
  }
  if (value.expires !== undefined) { requireValue(Number.isFinite(value.expires), 'E_COOKIE_FORMAT'); value.expirationDate ??= value.expires; delete value.expires; }
  if (value.expirationDate !== undefined) requireValue(Number.isFinite(value.expirationDate), 'E_COOKIE_FORMAT');
  return value;
}
