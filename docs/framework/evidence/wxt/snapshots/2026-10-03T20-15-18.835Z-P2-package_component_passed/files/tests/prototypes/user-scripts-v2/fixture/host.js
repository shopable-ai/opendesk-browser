import {encode, functionCode, exactTarget, verifyCurrent, accept} from './adapter.js';

const errorRecord = error => ({name: error?.name || 'Error', message: String(error?.message || error), stack: error?.stack});
const operations = new Map();
const trace = [];
const packagedTrace = [];
const permissionEvents = [];
const acceptanceBarriers = new Map();
let observationTimers = 0;
const activeOperations = new Set();
const ownGrantEvents = [];
let ownGrantEpoch = 1;
let ownGrantEnabled = true;
let authorizationMonitors = 0;
let authorizationProbes = 0;
let deadlineTimers = 0;

function invalidate(entry, error, observedBy) {
  // Only operation/native/browser/UI lifecycle code calls this. Renewal never
  // clears the first invalidation, even if a later current check succeeds.
  if (!entry.fence) entry.fence = {...errorRecord(error), observedBy, at: Date.now()};
}

function checkEntry(entry) {
  if (entry.deadlineAt !== undefined && Date.now() >= entry.deadlineAt) {
    invalidate(entry, new Error('E_OPERATION_DEADLINE'), 'operation-owned deadline');
  }
  if (!ownGrantEnabled || entry.ownGrantEpoch !== ownGrantEpoch) {
    invalidate(entry, new Error('E_OWN_GRANT_REVOKED'), 'trusted host grant epoch');
  }
  if (entry.fence) throw new Error(entry.fence.message);
}

async function currentAuthority(entry, stage) {
  checkEntry(entry);
  try {
    const actual = await verifyCurrent(entry.target);
    entry.actualOrigin = actual.origin;
    entry.authorityChecks.push({stage, at: Date.now(), actual});
    checkEntry(entry);
    return actual;
  } catch (error) {
    invalidate(entry, error, `operation-owned ${stage} authorization`);
    throw error;
  }
}

function startMonitor(entry) {
  entry.monitorStopped = false;
  authorizationMonitors++;
  const probe = async () => {
    if (entry.monitorStopped) return;
    const observation = {api: 'chrome.userScripts.getScripts', stage: 'pending-monitor', started: Date.now()};
    entry.availabilityObservations.push(observation);
    authorizationProbes++;
    try {
      const scripts = await chrome.userScripts.getScripts();
      Object.assign(observation, {available: true, scriptsCount: scripts.length});
    } catch (error) {
      Object.assign(observation, {available: false, error: errorRecord(error)});
      invalidate(entry, error, 'operation-owned chrome.userScripts.getScripts');
    } finally {
      observation.finished = Date.now();
      authorizationProbes--;
      if (!entry.monitorStopped && !entry.fence) {
        entry.monitorTimer = setTimeout(() => {
          entry.monitorTimer = undefined;
          entry.monitorTask = probe();
        }, 25);
      }
    }
  };
  entry.monitorTask = probe();
}

async function stopMonitor(entry) {
  if (entry.monitorStopped === undefined) return;
  entry.monitorStopped = true;
  clearTimeout(entry.monitorTimer);
  await entry.monitorTask;
  authorizationMonitors--;
  delete entry.monitorTimer;
  delete entry.monitorTask;
}

chrome.permissions.onRemoved.addListener(value => {
  permissionEvents.push({event: 'removed', value, at: Date.now()});
  for (const entry of activeOperations) {
    if (value.origins?.some(pattern => !entry.actualOrigin || new URL(pattern).hostname === new URL(entry.actualOrigin).hostname)) {
      invalidate(entry, new Error('E_HOST_PERMISSION_REVOKED'), 'chrome.permissions.onRemoved');
    }
  }
});
chrome.permissions.onAdded.addListener(value => permissionEvents.push({event: 'added', value, at: Date.now()}));
chrome.webNavigation.onCommitted.addListener(details => {
  for (const entry of activeOperations) {
    if (details.tabId === entry.target.tabId && details.frameId === entry.target.frameId && details.documentId !== entry.target.documentId) {
      invalidate(entry, new Error('E_DOCUMENT_STALE'), 'chrome.webNavigation.onCommitted');
    }
  }
});
chrome.tabs.onRemoved.addListener(tabId => {
  for (const entry of activeOperations) if (entry.target.tabId === tabId) invalidate(entry, new Error('E_TARGET_CLOSED'), 'chrome.tabs.onRemoved');
});
chrome.tabs.onReplaced.addListener((_added, removed) => {
  for (const entry of activeOperations) if (entry.target.tabId === removed) invalidate(entry, new Error('E_TARGET_REPLACED'), 'chrome.tabs.onReplaced');
});
addEventListener('pagehide', () => {
  for (const entry of activeOperations) invalidate(entry, new Error('E_HOST_DOCUMENT_CLOSED'), 'host pagehide');
});

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

async function evaluate({target, source, args = [], world, worldId, acceptanceBarrier, deadlineMs}, entry = {target}) {
  const traceStart = trace.length;
  let native;
  Object.assign(entry, {ownGrantEpoch, availabilityObservations: [], authorityChecks: []});
  activeOperations.add(entry);
  try {
    const injection = {target: exactTarget(target), world, ...(worldId ? {worldId} : {}), js: [{code: functionCode(source, args)}]};
    if (deadlineMs !== undefined) {
      if (!Number.isFinite(deadlineMs) || deadlineMs < 0) throw new Error('E_DEADLINE_INVALID');
      entry.deadlineAt = Date.now() + deadlineMs;
      deadlineTimers++;
      entry.deadlineTimer = setTimeout(() => {
        entry.deadlineTimer = undefined;
        deadlineTimers--;
        invalidate(entry, new Error('E_OPERATION_DEADLINE'), 'operation-owned deadline');
      }, deadlineMs);
    }
    startMonitor(entry);
    const admission = await currentAuthority(entry, 'dispatch');
    checkEntry(entry);
    native = await raw(injection);
    if (acceptanceBarrier) {
      entry.native = native;
      entry.nativeCompletedAt = Date.now();
      await new Promise(resolve => acceptanceBarriers.set(acceptanceBarrier, resolve));
    }
    const settlement = await currentAuthority(entry, 'acceptance');
    // Drain an already-issued native probe before accepting; its real OFF
    // observation must not arrive after a success has been delivered.
    await entry.monitorTask;
    checkEntry(entry);
    return {native, admission, settlement, accepted: accept(native, target), dispatchCount: trace.length - traceStart};
  } catch (error) {
    return {native, accepted: {kind: 'rejected', error: errorRecord(error)}, dispatchCount: trace.length - traceStart};
  } finally {
    await stopMonitor(entry);
    if (entry.deadlineTimer !== undefined) {
      clearTimeout(entry.deadlineTimer);
      deadlineTimers--;
      delete entry.deadlineTimer;
    }
    activeOperations.delete(entry);
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
  releaseAcceptance(id) { const release = acceptanceBarriers.get(id); if (!release) throw new Error('E_ACCEPTANCE_BARRIER'); acceptanceBarriers.delete(id); release(); },
  operationSnapshots() { return [...operations.entries()].map(([id, entry]) => ({id, ...entry})); },
  resources() { return {pending: [...operations.values()].filter(item => item.state === 'pending').length, activeOperations: activeOperations.size, acceptanceBarriers: acceptanceBarriers.size, observationTimers, authorizationMonitors, authorizationProbes, deadlineTimers, rawPending: trace.filter(item => !item.outcome).length}; },
  ownGrantState() { return {enabled: ownGrantEnabled, epoch: ownGrantEpoch, events: ownGrantEvents}; },
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
for (const [id, enabled] of [['revoke-own-grant', false], ['renew-own-grant', true]]) {
  document.querySelector(`#${id}`).addEventListener('click', event => {
    if (!event.isTrusted) return;
    ownGrantEpoch++;
    ownGrantEnabled = enabled;
    ownGrantEvents.push({action: enabled ? 'renew' : 'revoke', epoch: ownGrantEpoch, at: Date.now(), isTrusted: event.isTrusted});
    if (!enabled) for (const entry of activeOperations) invalidate(entry, new Error('E_OWN_GRANT_REVOKED'), 'trusted host grant UI');
  });
}
document.querySelector('#cancel-operations').addEventListener('click', event => {
  if (!event.isTrusted) return;
  ownGrantEvents.push({action: 'cancel-pending', at: Date.now(), isTrusted: event.isTrusted});
  for (const entry of activeOperations) invalidate(entry, new Error('E_OPERATION_CANCELLED'), 'trusted host cancel UI');
});
window.fixture.show({ready: true});
