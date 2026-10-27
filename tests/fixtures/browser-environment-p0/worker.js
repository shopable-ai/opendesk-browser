export const BASE = 'http://127.0.0.1:43128/browser-env-p0/';
export const OVERRIDE = Object.freeze({
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OpenDeskP0/1.2',
  acceptLanguage: 'en-US,en', platform: 'Linux x86_64',
  userAgentMetadata: {
    brands: [{brand: 'Chromium', version: '131'}, {brand: 'OpenDesk P0', version: '1'}],
    fullVersionList: [{brand: 'Chromium', version: '131.0.0.0'}, {brand: 'OpenDesk P0', version: '1.2.0.0'}],
    platform: 'Linux', platformVersion: '6.0.0', architecture: 'x86', model: '', mobile: false, bitness: '64', wow64: false
  }
});
export function isAllowedTab(tab) {
  try { const u = new URL(tab.url); return Number.isInteger(tab.id) && u.origin === new URL(BASE).origin && u.pathname === '/browser-env-p0/'; }
  catch { return false; }
}

// Runs in the actual target's MAIN world. It never changes navigator properties.
export async function readEnvironment() {
  let highEntropy = null;
  try { highEntropy = await navigator.userAgentData?.getHighEntropyValues(['architecture', 'bitness', 'model', 'platform', 'platformVersion', 'fullVersionList', 'wow64']); } catch {}
  const response = await fetch('/browser-env-p0/echo?nonce=' + crypto.randomUUID(), {cache: 'no-store'});
  if (!response.ok) throw new Error('HTTP echo failed: ' + response.status);
  return {
    href: location.href, observedAt: new Date().toISOString(),
    js: {userAgent: navigator.userAgent, platform: navigator.platform, language: navigator.language,
      languages: [...navigator.languages], userAgentData: navigator.userAgentData ? {...navigator.userAgentData.toJSON(), highEntropy} : null,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      viewport: {innerWidth, innerHeight, outerWidth, outerHeight, devicePixelRatio}},
    http: await response.json()
  };
}

export function createController(api) {
  let state = {phase: 'IDLE', binding: null, owned: false, detachedConfirmed: false, before: null, logs: []};
  let tail = Promise.resolve();
  let generation = 0;
  // One explicit local-page refresh, never a claim of debugger ownership.
  // Deliberately not persisted: Worker recovery must not replay this intent.
  let canceledRefreshGeneration = null;
  const serial = fn => { const next = tail.then(fn); tail = next.catch(() => {}); return next; };
  const log = (kind, detail = {}) => { state.logs.push({at: new Date().toISOString(), kind, ...detail}); state.logs = state.logs.slice(-250); };
  const save = () => api.storage.session.set({p0: state});
  const snapshot = () => structuredClone(state);
  const authorize = sender => {
    if (sender?.id !== api.runtime.id || sender?.url !== api.runtime.getURL('panel.html')) throw new Error('UNTRUSTED_SENDER');
  };
  async function guard() {
    if (!state.binding || state.phase === 'BINDING_INVALIDATED') throw new Error('BIND_REQUIRED');
    const {target, control} = state.binding;
    const [t, c] = await Promise.all([api.tabs.get(target.id), api.tabs.get(control.id)]);
    if (!isAllowedTab(t) || !isAllowedTab(c) || t.id === c.id || t.windowId !== c.windowId || t.windowId !== target.windowId || t.url !== target.url || c.url !== control.url) throw new Error('TARGET_IDENTITY_CHANGED');
    return {target: t, control: c};
  }
  async function command(method, params) {
    try {
      const result = await api.debugger.sendCommand({tabId: state.binding.target.id}, method, params);
      log('CDP', {method, params, ok: true, result}); await save(); return result;
    } catch (error) { log('CDP', {method, params, ok: false, error: String(error)}); await save(); throw error; }
  }
  async function readTab(tab) {
    const rows = await api.scripting.executeScript({target: {tabId: tab.id}, world: 'MAIN', func: readEnvironment});
    const row = rows.find(row => row.frameId === 0);
    const result = row?.result;
    if (!result) throw new Error('OBSERVATION_MISSING');
    return {tabId: tab.id, windowId: tab.windowId, documentId: row.documentId ?? null, ...result};
  }
  async function observe() {
    const tabs = await guard();
    const [target, control] = await Promise.all([readTab(tabs.target), readTab(tabs.control)]);
    await guard(); // Refuse a result that raced navigation or window movement.
    return {target, control};
  }
  async function reloadTarget() {
    const {target} = await guard();
    await api.tabs.reload(target.id, {bypassCache: true});
    // Wait for the replacement document, rather than reading the departing page.
    for (let i = 0; i < 80; i++) {
      const tab = await api.tabs.get(target.id);
      if (tab.status === 'complete') { await guard(); return; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('RELOAD_TIMEOUT');
  }
  async function release() {
    if (!state.owned) return;
    let resetError = null;
    for (const [method, params] of [
      ['Emulation.clearDeviceMetricsOverride', {}], ['Emulation.setTimezoneOverride', {timezoneId: ''}],
      ['Emulation.setUserAgentOverride', {userAgent: ''}]
    ]) { try { await command(method, params); } catch (error) { resetError = String(error); } }
    try {
      await api.debugger.detach({tabId: state.binding.target.id});
      state.owned = false; state.detachedConfirmed = true; log('DETACH', {ok: true});
    } catch (error) {
      log('DETACH', {ok: false, error: String(error)}); state.phase = 'RESTORE_UNVERIFIED'; await save(); throw error;
    }
    if (resetError) log('RESET_ERROR', {error: resetError});
    state.phase = 'RESTORE_UNVERIFIED'; await save();
  }
  async function stop() {
    if (state.phase === 'RECOVERY_REQUIRED') throw new Error('RECOVERY_REQUIRED_CLOSE_LOCAL_TARGET');
    const ownedStop = state.owned;
    const canceledRefresh = state.phase === 'RESTORE_UNVERIFIED' && canceledRefreshGeneration === generation;
    canceledRefreshGeneration = null;
    const reloadNeeded = ownedStop || canceledRefresh;
    if (state.owned) await release();
    if (!state.binding) return {ok: true, state: snapshot(), observation: null};
    if (reloadNeeded) {
      await guard();
      if (canceledRefresh) log('CANCELED_TARGET_REFRESH', {debuggerReconnected: false});
      await reloadTarget();
    }
    let observation = await observe();
    const core = o => ({js: o.js, headers: o.http.headers});
    const matches = () => state.before && ['target', 'control'].every(who => JSON.stringify(core(observation[who])) === JSON.stringify(core(state.before[who])));
    const withoutLayout = o => { const {viewport, ...js} = o.js; return {js, devicePixelRatio: viewport.devicePixelRatio, headers: o.http.headers}; };
    const onlyLayoutDiffers = () => state.before && ['target', 'control'].every(who => JSON.stringify(withoutLayout(observation[who])) === JSON.stringify(withoutLayout(state.before[who])));
    // Chrome removes its debugger infobar asynchronously; observe the settled
    // viewport instead of either ignoring the mismatch or declaring restoration.
    for (let i = 0; i < 100 && !matches() && onlyLayoutDiffers(); i++) {
      await new Promise(resolve => setTimeout(resolve, 100)); observation = await observe();
    }
    // CFT 138 can retain a one-pixel document layout from the departing
    // debugger infobar. Only this user-initiated, owned Stop may refresh once
    // more; a recovered session stays read-only and never replays mutations.
    if (ownedStop && !matches() && onlyLayoutDiffers()) {
      log('LAYOUT_REFRESH'); await reloadTarget(); observation = await observe();
    }
    const restored = matches();
    state.phase = restored ? 'RESTORED_OBSERVED' : 'RESTORE_UNVERIFIED';
    log('STOP_OBSERVED', {restored: Boolean(restored)}); await save();
    return {ok: true, state: snapshot(), observation};
  }
  return {
    recover: () => serial(async () => {
      const stored = (await api.storage.session.get('p0')).p0;
      if (stored) {
        state = {...stored, owned: false};
        const readbackOnly = stored.phase === 'RESTORE_UNVERIFIED' && stored.owned === false && stored.detachedConfirmed === true;
        if (!readbackOnly && (stored.owned || ['STARTING', 'MODIFIED', 'RESTORE_UNVERIFIED', 'RECOVERY_REQUIRED'].includes(stored.phase))) {
          state.phase = 'RECOVERY_REQUIRED'; log('WORKER_RECOVERY', {replayed: false, ownership: 'UNVERIFIED'});
        }
      }
      await save(); return snapshot();
    }),
    dispatch: (message, sender) => serial(async () => {
      authorize(sender);
      if (message.type === 'P0_LIST') return {ok: true, tabs: (await api.tabs.query({})).filter(isAllowedTab), state: snapshot()};
      if (message.type === 'P0_STATUS') return {ok: true, state: snapshot()};
      if (message.type === 'P0_BIND') {
        if (state.owned || ['RECOVERY_REQUIRED', 'RESTORE_UNVERIFIED'].includes(state.phase)) throw new Error('STOP_OR_RECOVER_FIRST');
        const [target, control] = await Promise.all([api.tabs.get(message.targetId), api.tabs.get(message.controlId)]);
        if (!isAllowedTab(target) || !isAllowedTab(control) || target.id === control.id || target.windowId !== control.windowId) throw new Error('INVALID_BINDING');
        state.binding = {target: {id: target.id, windowId: target.windowId, url: target.url}, control: {id: control.id, windowId: control.windowId, url: control.url}};
        state.phase = 'BOUND'; state.before = null; log('BIND', state.binding); await save();
        return {ok: true, state: snapshot()};
      }
      if (message.type === 'P0_OBSERVE') {
        const observation = await observe();
        if (!state.before && !state.owned && state.phase !== 'RECOVERY_REQUIRED') state.before = observation;
        log('OBSERVE'); await save(); return {ok: true, state: snapshot(), observation};
      }
      if (message.type === 'P0_START') {
        if (state.phase === 'RECOVERY_REQUIRED') throw new Error('RECOVERY_REQUIRED_CLOSE_LOCAL_TARGET');
        if (state.phase === 'RESTORE_UNVERIFIED') throw new Error('RESTORE_VERIFICATION_REQUIRED');
        await guard();
        if (state.owned) return {ok: true, repeated: true, state: snapshot(), observation: await observe()};
        if (!state.before) throw new Error('BEFORE_REQUIRED');
        generation++;
        state.phase = 'STARTING'; state.detachedConfirmed = false; await save();
        try {
          await api.debugger.attach({tabId: state.binding.target.id}, '1.3');
          state.owned = true; log('ATTACH', {ok: true}); await save();
          await guard();
          await command('Emulation.setUserAgentOverride', OVERRIDE);
          await guard();
          await command('Emulation.setTimezoneOverride', {timezoneId: 'Pacific/Honolulu'});
          await guard();
          await command('Emulation.setDeviceMetricsOverride', {width: 1024, height: 768, deviceScaleFactor: 1.5, mobile: false});
          await reloadTarget();
          const observation = await observe(); state.phase = 'MODIFIED'; await save();
          return {ok: true, state: snapshot(), observation};
        } catch (error) {
          log('START_ERROR', {error: String(error), hadOwnership: state.owned});
          if (state.owned) { try { await release(); } catch {} }
          else if (state.phase !== 'RESTORE_UNVERIFIED') state.phase = 'START_FAILED';
          await save(); throw error;
        }
      }
      if (message.type === 'P0_STOP') return stop();
      if (message.type === 'P0_CLOSE_TARGET') {
        if (!state.binding) throw new Error('BIND_REQUIRED');
        const tab = await api.tabs.get(state.binding.target.id);
        if (!isAllowedTab(tab) || tab.windowId !== state.binding.target.windowId) throw new Error('TARGET_IDENTITY_CHANGED');
        await api.tabs.remove(tab.id); state.owned = false; state.binding = null; state.before = null;
        state.phase = 'CLOSED_LOCAL_TARGET'; log('SAFE_CLOSE'); await save(); return {ok: true, state: snapshot()};
      }
      throw new Error('UNKNOWN_MESSAGE');
    }),
    onUpdated: (tabId, changeInfo, tab) => serial(async () => {
      if (!state.binding || ![state.binding.target.id, state.binding.control.id].includes(tabId)) return;
      const bound = tabId === state.binding.target.id ? state.binding.target : state.binding.control;
      if (tab.url !== bound.url || tab.windowId !== bound.windowId) {
        log('IDENTITY_INVALIDATED', {tabId, url: tab.url, windowId: tab.windowId});
        if (state.owned) { try { await release(); } catch {} }
        if (!state.owned && !['RECOVERY_REQUIRED', 'RESTORE_UNVERIFIED'].includes(state.phase)) state.phase = 'BINDING_INVALIDATED'; await save();
      }
    }),
    onRemoved: tabId => serial(async () => {
      if (!state.binding || ![state.binding.target.id, state.binding.control.id].includes(tabId)) return;
      log('TAB_CLOSED', {tabId});
      if (tabId === state.binding.target.id) {
        state.owned = false; state.binding = null; state.before = null; state.phase = 'CLOSED';
      } else {
        if (state.owned) { try { await release(); } catch {} }
        // The missing control must not erase an unresolved target's ownership
        // or baseline. Closing the original local target is the safe exit.
        if (!['RECOVERY_REQUIRED', 'RESTORE_UNVERIFIED'].includes(state.phase)) {
          state.binding = null; state.before = null; state.phase = 'CLOSED';
        }
      }
      await save();
    }),
    onDetached: (source, reason) => {
      const eventGeneration = generation;
      return serial(async () => {
      if (source.tabId !== state.binding?.target.id) return;
      if (eventGeneration !== generation) { log('STALE_ON_DETACH', {reason}); await save(); return; }
      canceledRefreshGeneration = state.owned && ['MODIFIED', 'STARTING'].includes(state.phase) && reason === 'canceled_by_user' ? generation : null;
      log('ON_DETACH', {reason}); state.owned = false;
      if (state.phase === 'MODIFIED' || state.phase === 'STARTING') state.phase = 'RESTORE_UNVERIFIED';
      await save();
      });
    }
  };
}

if (globalThis.chrome?.runtime?.id) {
  const controller = createController(chrome);
  const ready = controller.recover();
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    ready.then(() => controller.dispatch(message, sender)).then(reply, error => reply({ok: false, error: String(error)})); return true;
  });
  chrome.action.onClicked.addListener(tab => { if (tab.windowId) chrome.sidePanel.open({windowId: tab.windowId}).catch(console.error); });
  chrome.tabs.onUpdated.addListener((...args) => { ready.then(() => controller.onUpdated(...args)).catch(console.error); });
  chrome.tabs.onAttached.addListener(tabId => { ready.then(async () => controller.onUpdated(tabId, {}, await chrome.tabs.get(tabId))).catch(console.error); });
  chrome.tabs.onRemoved.addListener(tabId => { ready.then(() => controller.onRemoved(tabId)).catch(console.error); });
  chrome.debugger.onDetach.addListener((...args) => { ready.then(() => controller.onDetached(...args)).catch(console.error); });
}
