// F1-only fixed adapter. No second product broker, journal, or public API.
const sourcePromise = fetch('worker-harness.js').then(response => response.text());
const records = [], operations = [], rejects = [], policy = [], retired = [], workers = [], deliveries = [], realmRetirements = [], effectDispatches = [], permissionBarrierEvidence = [];
const pendingOperations = new Set(), resourceReplies = new Map();
const permissionBarriers = new Map();
const nativePermissionsContains = chrome.permissions.contains;
const url = new URL(location.href);
const permittedOrigin = new URL(url.searchParams.get('network')).origin;
let port, frame, active, tabId, documentId, disposed = false, disposing = false, sandboxEpoch, ownedTab = true, targetEpoch = 0, nextPermissionBarrier;
const hostEpoch = crypto.randomUUID();
let initialization = bindSandbox();
function bindSandbox() { return new Promise(resolve => {
  const connectionFrame = document.createElement('iframe'); connectionFrame.src = 'sandbox.html'; frame = connectionFrame;
  sandboxEpoch = crypto.randomUUID();
  const listener = event => {
    if (event.source !== connectionFrame.contentWindow || event.origin !== 'null' || event.data?.kind !== 'sandbox-ready') return;
    window.removeEventListener('message', listener);
    window.sandboxEvidence = event.data;
    const channel = new MessageChannel(); port = channel.port1;
    port.onmessage = async ({data}) => {
      if (port !== channel.port1) return;
      if (data.kind === 'host-bound') { resolve(); return; }
      if (data.kind === 'retired') {
        retired.push({...data, sandboxEpoch});
        if (!disposing && ['stopped', 'timeout'].includes(data.reason)) {
          // A tight async-body loop can outlive Worker.terminate(); retire its owned realm too.
          const mode = url.searchParams.get('retire') || 'remove';
          const retirement = {runId: data.runId, sandboxEpoch, reason: data.reason, revokedURL: data.revokedURL, mode, at: Date.now()};
          realmRetirements.push(retirement);
          if (mode !== 'terminate-only') {
            channel.port1.onmessage = null; channel.port1.close();
            initialization = (async () => {
              if (mode === 'navigate') {
                await new Promise(resolve => { connectionFrame.onload = resolve; connectionFrame.src = 'sandbox.html?retire=' + data.runId; });
                retirement.committedAt = Date.now();
              }
              connectionFrame.remove(); retirement.removedAt = Date.now();
              await bindSandbox();
            })();
          }
        }
        return;
      }
      if (data.kind === 'resource-observation') { resourceReplies.get(data.requestId)?.({...data, sandboxEpoch, hostEpoch}); resourceReplies.delete(data.requestId); return; }
      if (!active || data.runId !== active.runId) { rejects.push({reason: 'fenced-or-wrong-run', data}); return; }
      if (data.kind === 'worker-created' || data.kind === 'worker-bound') { workers.push({...data, sandboxEpoch}); return; }
      if (data.kind === 'rejected-global') { rejects.push(data); return; }
      if (data.kind === 'policy') { policy.push(data); return; }
      if (data.kind === 'result' || data.kind === 'error') { finish(data.kind, {...data, valueType: typeof data.value, valuePresent: Object.hasOwn(data, 'value')}); return; }
      if (data.kind !== 'operation' || !Number.isSafeInteger(data.id) || data.id !== active.lastId + 1) {
        rejects.push({reason: 'invalid-or-replayed-request', data}); return;
      }
    active.lastId = data.id;
    const owner = active;
    const target = Object.freeze({runId: owner.runId, hostEpoch: owner.hostEpoch, sandboxEpoch: owner.sandboxEpoch,
      tabId: owner.tabId, documentId: owner.documentId, targetEpoch: owner.targetEpoch});
      const operationKey = owner.runId + ':' + data.id;
      pendingOperations.add(operationKey);
      operations.push({runId: owner.runId, id: data.id, method: data.method, args: data.args,
      targetBefore: target});
    try {
      const value = await operation(owner, target, data.method, data.args);
        if (active === owner) { deliveries.push({runId: owner.runId, id: data.id, kind: 'reply', value}); port.postMessage({kind: 'reply', runId: owner.runId, id: data.id, value}); }
    } catch (error) {
      if (error.code === 'E_RUN_FENCED') rejects.push({reason: 'operation-owner-fenced', runId: owner.runId, id: data.id, method: data.method});
        if (active === owner) port.postMessage({kind: 'reply', runId: owner.runId, id: data.id,
          error: {name: error.name, message: error.message, code: error.code || 'E_PAGE'}});
      } finally { pendingOperations.delete(operationKey); }
    };
    port.start(); connectionFrame.contentWindow.postMessage({kind: 'bind-host'}, '*', [channel.port2]);
  };
  window.addEventListener('message', listener); document.body.append(connectionFrame);
}); }
function finish(kind, payload) {
  if (!active) return;
  const terminalTriggeredAt = Date.now(), terminalTriggeredMonoMs = performance.now();
  const owner = active; owner.cancelled = true; active = undefined; const admissionClosedMonoMs = performance.now(); clearTimeout(owner.timer);
  port.postMessage({kind: 'stop', reason: kind, runId: owner.runId});
  chrome.scripting.executeScript({target: {tabId: owner.tabId, documentIds: [owner.documentId]}, func: runId => {
    for (const wait of globalThis.__f1Waits?.values() || []) if (wait.runId === runId) wait.cancel();
  }, args: [owner.runId]}).catch(() => {});
  const record = {runId: owner.runId, body: owner.body, kind, ...payload, terminalTriggeredAt, terminalTriggeredMonoMs, admissionClosedMonoMs, timerDueMonoMs: owner.timerDueMonoMs, deadlineFiredMonoMs: kind === 'timeout' ? terminalTriggeredMonoMs : null, settledAt: Date.now()};
  records.push(record); owner.resolve(record);
  document.getElementById('report').textContent = JSON.stringify({records, operations, rejects, policy, retired}, null, 2);
}
function requireOwner(owner, target) {
  if (disposed || disposing || owner.cancelled || active !== owner || owner.runId !== target.runId || target.hostEpoch !== hostEpoch || target.sandboxEpoch !== sandboxEpoch ||
      owner.hostEpoch !== target.hostEpoch || owner.sandboxEpoch !== target.sandboxEpoch ||
      owner.targetEpoch !== targetEpoch || target.targetEpoch !== targetEpoch || owner.tabId !== target.tabId || tabId !== target.tabId ||
      owner.documentId !== target.documentId || documentId !== target.documentId) {
    const error = new Error('Original run/epoch/target is fenced'); error.code = 'E_RUN_FENCED'; throw error;
  }
}
async function operation(owner, target, method, args) {
  // The private request entry supplies a frozen identity before any await.
  requireOwner(owner, target);
  if (method === 'mark') return args[0];
  const permission = chrome.permissions.contains({origins: [permittedOrigin + '/*']});
  const barrier = owner.permissionBarrier;
  if (barrier && !barrier.used) {
    barrier.used = true; barrier.evidence.runId = owner.runId; barrier.evidence.method = method;
    barrier.evidence.target = {...target}; barrier.evidence.nativeCallMonoMs = performance.now();
    barrier.evidence.apiUnchanged = chrome.permissions.contains === nativePermissionsContains;
  }
  const granted = await permission;
  if (barrier?.used && !barrier.evidence.nativeSettledMonoMs) {
    barrier.evidence.nativeSettledMonoMs = performance.now(); barrier.evidence.nativeResult = granted; barrier.evidence.held = true;
    await barrier.promise;
    barrier.evidence.resumedMonoMs = performance.now(); barrier.evidence.held = false;
  }
  requireOwner(owner, target);
  if (!granted) throw new Error('Site access is not granted');
  if (method === 'goto') {
    if (new URL(args[0]).origin !== permittedOrigin) throw new Error('Origin not authorized');
    requireOwner(owner, target);
    effectDispatches.push({runId: owner.runId, method, api: 'chrome.tabs.update', target: {...target}, at: Date.now(), monoMs: performance.now()});
    await chrome.tabs.update(target.tabId, {url: args[0]});
    requireOwner(owner, target);
    for (let i = 0; i < 100; i++) {
      requireOwner(owner, target);
      const tab = await chrome.tabs.get(target.tabId);
      requireOwner(owner, target);
      if (tab.status === 'complete' && tab.url === args[0]) break;
      await new Promise(resolve => setTimeout(resolve, 20));
      requireOwner(owner, target);
    }
    requireOwner(owner, target);
    effectDispatches.push({runId: owner.runId, method, api: 'chrome.scripting.executeScript:identity', target: {...target}, at: Date.now(), monoMs: performance.now()});
    const [identity] = await chrome.scripting.executeScript({target: {tabId: target.tabId}, func: () => location.href});
    requireOwner(owner, target);
    if (identity.result !== args[0]) throw new Error('Navigation identity mismatch');
    owner.documentId = documentId = identity.documentId;
    return identity.result;
  }
  if (!['title','url','type','click','waitForSelector','text'].includes(method)) throw new Error('Unknown operation');
  requireOwner(owner, target);
  effectDispatches.push({runId: owner.runId, method, api: 'chrome.scripting.executeScript', target: {...target}, at: Date.now(), monoMs: performance.now()});
  const [response] = await chrome.scripting.executeScript({target: {tabId: target.tabId, documentIds: [target.documentId]},
    func: async (method, args, runId) => {
      if (method === 'title') return document.title;
      if (method === 'url') return location.href;
      if (method === 'waitForSelector') {
        if (document.querySelector(args[0])) return true;
        return new Promise((resolve, reject) => {
          const waits = globalThis.__f1Waits ||= new Map();
          const key = crypto.randomUUID();
          const cleanup = () => { observer.disconnect(); clearTimeout(timer); waits.delete(key); };
          const observer = new MutationObserver(() => {
            if (document.querySelector(args[0])) { cleanup(); resolve(true); }
          });
      const timer = setTimeout(() => { cleanup(); reject(new Error('Selector timeout')); }, 1500);
          waits.set(key, {runId, cancel() { cleanup(); reject(new Error('Run fenced')); }});
          observer.observe(document, {subtree: true, childList: true});
        });
      }
      const element = document.querySelector(args[0]);
      if (!element) throw new Error('Element not found');
      if (method === 'type') { element.value += args[1]; element.dispatchEvent(new Event('input', {bubbles: true})); return 'Typed'; }
      if (method === 'click') { element.click(); return 'clicked'; }
      return element.textContent;
    }, args: [method, args, owner.runId]});
  requireOwner(owner, target);
  if (response.documentId !== target.documentId) throw new Error('Old document rejected');
  if (response.error) throw new Error(response.error.message);
  return response.result;
}
window.harness = {
  async initialize() {
    await initialization;
    if (active || disposing || disposed) throw new Error('Cannot initialize a live or disposed owner');
    const tab = await chrome.tabs.create({url: permittedOrigin + '/form', active: false}); tabId = tab.id; ownedTab = true; targetEpoch++;
    for (let i = 0; i < 100; i++) { if ((await chrome.tabs.get(tabId)).status === 'complete') break; await new Promise(resolve => setTimeout(resolve, 20)); }
    const [identity] = await chrome.scripting.executeScript({target: {tabId}, func: () => location.href});
    documentId = identity.documentId;
    const positive = await fetch(url.searchParams.get('network') + '?positive=extension');
    return {sandbox: window.sandboxEvidence, positiveNetwork: await positive.text(), tabId, documentId, hostEpoch,
      runtimeId: chrome.runtime.id, manifest: chrome.runtime.getManifest(), world: 'ISOLATED fixed scripting adapter'};
  },
  async run(body, params = {}, timeout = 5000, held = false, observeResource = false) {
    await initialization;
    if (disposing || disposed || tabId === undefined || documentId === undefined) throw new Error('No live target');
    if (active) throw new Error('Only one run in F1 adapter');
    const source = await sourcePromise;
    return new Promise(resolve => {
      const runId = crypto.randomUUID();
      const timerDueMonoMs = performance.now() + timeout;
      const timer = setTimeout(() => finish('timeout', {error: {name: 'TimeoutError', message: 'Run deadline exceeded'}}), timeout);
      active = {runId, resolve, body, timer, timerDueMonoMs, lastId: 0, hostEpoch, sandboxEpoch, tabId, documentId, targetEpoch, cancelled: false, permissionBarrier: nextPermissionBarrier};
      nextPermissionBarrier = undefined;
      port.postMessage({kind: 'start', source, body, params, runId, held, observeResource});
    });
  },
  stop() { finish('stopped', {error: {name: 'AbortError', message: 'Stopped by host'}}); },
  armPermissionBarrier() {
    if (active || nextPermissionBarrier) throw new Error('Barrier requires an idle host');
    const id = crypto.randomUUID(), evidence = {id, armedMonoMs: performance.now(), held: false};
    let release; const promise = new Promise(resolve => { release = resolve; });
    const barrier = {promise, release, evidence, used: false};
    permissionBarriers.set(id, barrier); permissionBarrierEvidence.push(evidence); nextPermissionBarrier = barrier;
    return id;
  },
  releasePermissionBarrier(id) {
    const barrier = permissionBarriers.get(id); if (!barrier) throw new Error('Unknown permission barrier');
    barrier.evidence.releasedMonoMs = performance.now(); barrier.release(); permissionBarriers.delete(id);
    if (nextPermissionBarrier === barrier) nextPermissionBarrier = undefined;
  },
  rebindAttack() { port.postMessage({kind: 'fake-global'}); },
  replay() { port.postMessage({kind: 'replay'}); },
  wrongRun() { port.postMessage({kind: 'wrong-run'}); },
  release() { port.postMessage({kind: 'release', runId: active?.runId}); },
  async swIdentity() { return chrome.runtime.sendMessage({kind: 'f1-identity'}); },
  async permissions() { return {contains: await chrome.permissions.contains({origins: [permittedOrigin + '/*']}), actual: await chrome.permissions.getAll()}; },
  async networkPositive(urls) {
    const observations = [];
    for (const address of urls) {
      if (new URL(address.replace(/^ws:/, 'http:')).origin !== permittedOrigin) throw new Error('Origin not authorized');
      if (address.startsWith('ws:')) observations.push(await new Promise(resolve => {
        const socket = new WebSocket(address); socket.onopen = () => { socket.close(); resolve({url: address, opened: true}); };
        socket.onerror = () => resolve({url: address, opened: false});
      }));
      else { const response = await fetch(address); observations.push({url: address, status: response.status, body: await response.text()}); }
    }
    return observations;
  },
  async retireOwnedTab() { if (!ownedTab) return {removed: false, reason: 'borrowed'}; if (tabId) { const id = tabId; targetEpoch++; await chrome.tabs.remove(id); tabId = undefined; return {removed: true, tabId: id}; } return {removed: false, reason: 'none'}; },
  async borrowByUrl(address) {
    if (new URL(address).origin !== permittedOrigin) throw new Error('Origin not authorized');
    const matches = await chrome.tabs.query({url: address}); if (matches.length !== 1) throw new Error('Borrowed target ambiguous');
    await this.retireOwnedTab(); tabId = matches[0].id; ownedTab = false; targetEpoch++;
    const [identity] = await chrome.scripting.executeScript({target: {tabId}, func: () => location.href}); documentId = identity.documentId;
    return {tabId, documentId, owned: ownedTab, url: identity.result};
  },
  async armOwnedMainLoop(token) {
    if (!ownedTab) throw new Error('Borrowed MAIN loop retirement unsupported');
    await chrome.tabs.update(tabId, {active: true});
    return chrome.scripting.executeScript({target: {tabId, documentIds: [documentId]}, world: 'MAIN', args: [permittedOrigin + '/probe?mainLoop=' + encodeURIComponent(token)], func: enteredURL => {
      setTimeout(() => { document.body.dataset.loopEntered = 'true'; navigator.sendBeacon(enteredURL + '&documentURL=' + encodeURIComponent(location.href), 'entered'); while (true) {} }, 50);
      return {armed: true, world: 'MAIN', documentURL: location.href};
    }});
  },
  async resourceProbe() { const requestId = crypto.randomUUID(); return new Promise(resolve => { resourceReplies.set(requestId, resolve); port.postMessage({kind: 'resource-probe', requestId}); }); },
  async observeRunResource() {
    if (!active) throw new Error('No live resource owner');
    const requestId = crypto.randomUUID(), runId = active.runId;
    return new Promise(resolve => { resourceReplies.set(requestId, resolve); port.postMessage({kind: 'resource-before-retire', requestId, runId}); });
  },
  async resources() {
    if (!disposing && !disposed) await initialization;
    let pageWaits;
    try { const [r] = await chrome.scripting.executeScript({target: {tabId, documentIds: [documentId]}, func: () => globalThis.__f1Waits?.size || 0}); pageWaits = r.result; } catch { pageWaits = disposed ? 0 : null; }
    return {pending: pendingOperations.size, timer: active ? 1 : 0, port: disposed ? 0 : 1, frame: disposed ? 0 : 1, pageWaits, resourceReplies: resourceReplies.size, permissionBarriers: permissionBarriers.size};
  },
  evidence() { return {records, operations, deliveries, rejects, policy, retired, realmRetirements, workers, effectDispatches, permissionBarriers: permissionBarrierEvidence, hostEpoch, sandboxEpoch, active: active ? {runId: active.runId, lastId: active.lastId} : null}; },
  async dispose() {
    disposing = true;
    this.stop();
    for (const id of permissionBarriers.keys()) this.releasePermissionBarrier(id);
    for (let i = 0; i < 100 && (pendingOperations.size || retired.length !== records.length); i++) await new Promise(resolve => setTimeout(resolve, 20));
    if (tabId && ownedTab) await chrome.tabs.remove(tabId); port.onmessage = null; port.close(); frame.remove(); disposed = true;
    return this.resources();
  }
};
