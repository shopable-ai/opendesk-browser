import {encode, functionCode, exactTarget, verifyCurrent, accept} from './adapter.js';

const errorRecord = error => ({name: error?.name || 'Error', message: String(error?.message || error), stack: error?.stack});
const operations = new Map();
const trace = [];
const packagedTrace = [];
const permissionEvents = [];
const acceptanceBarriers = new Map();
let observationTimers = 0;
chrome.permissions.onRemoved.addListener(value => {
  permissionEvents.push({event: 'removed', value, at: Date.now()});
  for (const entry of operations.values()) {
    if (entry.state === 'pending' && value.origins?.some(pattern => new URL(pattern).hostname === new URL(entry.target.url).hostname)) {
      entry.fence = {name: 'Error', message: 'E_HOST_PERMISSION_REVOKED', observedBy: 'chrome.permissions.onRemoved', at: Date.now()};
    }
  }
});
chrome.permissions.onAdded.addListener(value => permissionEvents.push({event: 'added', value, at: Date.now()}));

async function raw(injection) {
  const entry = {injection, started: Date.now(), apiInvoked: false};
  trace.push(entry);
  try {
    entry.executeType = typeof chrome.userScripts?.execute;
    if (entry.executeType !== 'function') throw new Error('E_USER_SCRIPTS_API_UNAVAILABLE_BEFORE_NATIVE_CALL');
    entry.apiInvoked = true;
    const results = await chrome.userScripts.execute(injection);
    entry.outcome = {kind: 'resolved', elapsedMs: Date.now() - entry.started, results: results.map(item => ({
      documentId: item.documentId, frameId: item.frameId,
      keys: Object.keys(item), hasResult: Object.hasOwn(item, 'result'), resultIsUndefined: item.result === undefined,
      result: item.result, hasError: Object.hasOwn(item, 'error'), error: item.error
    }))};
  } catch (error) {
    entry.outcome = {kind: 'rejected', elapsedMs: Date.now() - entry.started, error: errorRecord(error)};
  }
  return entry.outcome;
}

async function evaluate({target, source, args = [], world, worldId, acceptanceBarrier}, entry) {
  const traceStart = trace.length;
  let native;
  try {
    const injection = {target: exactTarget(target), world, ...(worldId ? {worldId} : {}), js: [{code: functionCode(source, args)}]};
    const admission = await verifyCurrent(target);
    native = await raw(injection);
    if (acceptanceBarrier) {
      entry.native = native;
      entry.nativeCompletedAt = Date.now();
      await new Promise(resolve => acceptanceBarriers.set(acceptanceBarrier, resolve));
    }
    const settlement = await verifyCurrent(target);
    if (entry?.fence) throw new Error(entry.fence.message);
    return {native, admission, settlement, accepted: accept(native, target), dispatchCount: trace.length - traceStart};
  } catch (error) {
    return {native, accepted: {kind: 'rejected', error: errorRecord(error)}, dispatchCount: trace.length - traceStart};
  }
}

window.fixture = {
  async availability() {
    const result = {defined: typeof chrome.userScripts !== 'undefined', executeType: typeof chrome.userScripts?.execute};
    try { result.scripts = await chrome.userScripts.getScripts(); result.available = true; }
    catch (error) { result.available = false; result.error = errorRecord(error); }
    return result;
  },
  async frames(tabId) { return chrome.webNavigation.getAllFrames({tabId}); },
  async tabs() { return chrome.tabs.query({}); }, // inventory only; runner selects explicit owned URLs
  async config() { return chrome.userScripts.getWorldConfigurations(); },
  async configureWorld(value) { await chrome.userScripts.configureWorld(value); return chrome.userScripts.getWorldConfigurations(); },
  async permissions() { return chrome.permissions.getAll(); },
  async containsHosts() { return chrome.permissions.contains({origins: ['http://127.0.0.1/*']}); },
  async authorization(target) { try { return {kind: 'authorized', actual: await verifyCurrent(target)}; } catch (error) { return {kind: 'rejected', error: errorRecord(error)}; } },
  async removeHosts() { return chrome.permissions.remove({origins: ['http://127.0.0.1/*', 'http://localhost/*']}); },
  raw, evaluate,
  async observeRaw({injection, timeoutMs = 1000}) {
    let timer;
    observationTimers++;
    try { return await Promise.race([raw(injection), new Promise(resolve => {timer = setTimeout(() => resolve({kind: 'pending-at-observation-deadline', timeoutMs, note: 'Native call remains pending; not a rejection or cancellation'}), timeoutMs);})]); }
    finally { clearTimeout(timer); observationTimers--; }
  },
  prepare({target, source, args = [], world}) { return {target: exactTarget(target), world, js: [{code: functionCode(source, args)}]}; },
  async legacy({target, statement, ignoredArgs, world}) {
    // Separate legacy statement completion contract. args are deliberately ignored.
    return raw({target: exactTarget(target), world, js: [{code: `(function(){${statement}\n;return true;})()`}]});
  },
  async callback({target, eventId, value}) {
    const entry = {target: exactTarget(target), world: 'MAIN', eventId, value, started: Date.now(), apiInvoked: true};
    packagedTrace.push(entry);
    try {
    const results = await chrome.scripting.executeScript({target: entry.target, world: 'MAIN',
      func: (id, result) => {
        if (typeof globalThis.ChromeBridgeOperationCompleted !== 'function') throw new Error('E_CALLBACK_MISSING');
        globalThis.ChromeBridgeOperationCompleted(id, result);
        return {eventId: id, delivered: true};
      }, args: [eventId, value]});
    entry.outcome = {kind: 'resolved', results};
    return results;
    } catch (error) { entry.outcome = {kind: 'rejected', error: errorRecord(error)}; throw error; }
  },
  start(id, spec) {
    if (operations.has(id)) throw new Error('E_OPERATION_DUPLICATE');
    const entry = {state: 'pending', started: Date.now(), target: spec.target};
    operations.set(id, entry);
    evaluate(spec, entry).then(result => Object.assign(entry, {state: 'settled', result, finished: Date.now(), settlementCount: 1}));
    return {id, state: entry.state};
  },
  poll(id) { return operations.get(id); },
  async recheck(id) {
    const entry = operations.get(id);
    if (!entry || entry.state !== 'pending') throw new Error('E_PENDING_REQUIRED');
    const check = await window.fixture.authorization(entry.target);
    if (check.kind === 'rejected') entry.fence = {...check.error, observedBy: 'actual browser authorization recheck', at: Date.now()};
    return {check, fence: entry.fence};
  },
  releaseAcceptance(id) { const release = acceptanceBarriers.get(id); if (!release) throw new Error('E_ACCEPTANCE_BARRIER'); acceptanceBarriers.delete(id); release(); },
  operationSnapshots() { return [...operations.entries()].map(([id, entry]) => ({id, ...entry})); },
  resources() { return {pending: [...operations.values()].filter(item => item.state === 'pending').length, acceptanceBarriers: acceptanceBarriers.size, observationTimers, rawPending: trace.filter(item => !item.outcome).length}; },
  trace() { return trace; },
  packagedTrace() { return packagedTrace; },
  permissionEvents() { return permissionEvents; },
  codecProbe(kind) {
    const target = {tabId: 999999, frameId: 0, documentId: 'validation-only'};
    const variants = {
      native: () => functionCode(Math.max, []),
      bound: () => functionCode((function sample() {}).bind(null), []),
      nonfinite: () => functionCode('x => x', [Infinity]),
      functionArg: () => functionCode('x => x', [() => 1]),
      bigint: () => functionCode('x => x', [1n]),
      cycle: () => { const item = {}; item.self = item; return encode(item); },
      missingTarget: () => exactTarget({tabId: target.tabId, frameId: 0})
    };
    const before = trace.length;
    try { return {value: variants[kind](), dispatchCount: trace.length - before}; }
    catch (error) { return {error: errorRecord(error), dispatchCount: trace.length - before}; }
  },
  show(value) { document.querySelector('#results').textContent = JSON.stringify(value, null, 2); }
};

document.querySelector('#restore-hosts').addEventListener('click', async () => {
  try { window.restoreResult = {granted: await chrome.permissions.request({origins: ['http://127.0.0.1/*', 'http://localhost/*']})}; }
  catch (error) { window.restoreResult = {error: errorRecord(error)}; }
});
window.fixture.show({ready: true});
