import {createSdkBridge, CHROME_PAGE_TYPE, generateEventId} from './bridge.js';
import {createWindowTransport} from './transport.js';
import {createHttp} from './http.js';
import {createStorageFacades} from './storage.js';
import {createNotifications} from './notifications.js';
import {createServers} from './servers.js';
import {createSleep, getFingerprint} from './utils.js';
import {createDeviceUtils} from '../utils/device.js';
import {createNetworkInfo} from '../utils/network-info.js';
import {formatJSON} from '../utils/script.js';
import {decodeBase64} from '../../platform/page-port/codec.js';
import {SDK_VERSION, fail} from './registry.js';

// This immutable lifecycle survives fixed-file evaluation. It identifies an intact
// installation, not a grant: every replacement bridge obtains its own native Hello.
const installationKey = Symbol.for('opendesk.sdk.lifecycle.v1');
const installations = new WeakMap();
const names = ['OpenDeskSDK', 'service', 'CHROME_PAGE_TYPE', 'axiosx', 'AppStorage', 'AppLocal', 'createNotify', 'serverUtils', 'sleep', 'getFingerprint',
  'generateEventId', 'decodeBase64', 'ChromeBridgeEvents', 'ChromeBridgeOperationCompleted', 'callChromeBridgeInterface', 'executeInBg', 'executeScript',
  'getObjectFromLocalStorage', 'saveObjectInLocalStorage', 'removeObjectFromLocalStorage'];
function refreshInstallation(transport, global) {
  const state = installations.get(this);
  if (!state || state.global !== global) throw fail('E_SDK_GLOBAL_CONFLICT', 'SDK installation belongs to another global');
  if (state.disposed) throw fail('E_CANCELLED', 'SDK document disposed');
  const previous = state.current;
  // Serialize refreshes; the window transport separately correlates each Hello
  // so a previous timeout or native callback cannot settle this fresh handshake.
  const gate = previous ? previous.bridge.ready().catch(() => {}) : Promise.resolve();
  const frame = {transport, helloDone: false};
  frame.bridge = createSdkBridge({transport: {
    hello: payload => gate.then(() => transport.hello(payload)).finally(() => { frame.helloDone = true; state.cleanup(); }),
    request: payload => transport.request(payload), cancel: id => transport.cancel?.(id)
  }});
  state.current = frame; state.frames.add(frame);
  if (previous) frame.bridge.ready().catch(() => {});
  state.cleanup();
  return this.exports.OpenDeskSDK;
}
function ownInstallation(global) {
  const slot = Object.getOwnPropertyDescriptor(global, installationKey);
  if (!slot) return;
  const record = slot.value;
  const exports = Object.getOwnPropertyDescriptor(record ?? {}, 'exports')?.value;
  const refresh = Object.getOwnPropertyDescriptor(record ?? {}, 'refresh')?.value;
  if (!record || typeof record !== 'object' || !exports || typeof exports !== 'object' ||
      slot.writable || slot.configurable || !Object.isFrozen(record) || !Object.isFrozen(exports) ||
      typeof refresh !== 'function' || Function.prototype.toString.call(refresh) !== Function.prototype.toString.call(refreshInstallation) ||
      Object.keys(exports).length !== names.length || !names.every(name => {
        const descriptor = Object.getOwnPropertyDescriptor(global, name);
        return descriptor && !descriptor.writable && !descriptor.configurable && Object.hasOwn(descriptor, 'value') && descriptor.value === Object.getOwnPropertyDescriptor(exports, name)?.value && Object.hasOwn(Object.getOwnPropertyDescriptor(exports, name) ?? {}, 'value');
      })) throw fail('E_SDK_GLOBAL_CONFLICT', 'SDK installation is incompatible');
  return record;
}
export function installPageSdk({global = globalThis, transport} = {}) {
  const existing = ownInstallation(global);
  if (!existing) for (const name of names) {
    if (name in global) throw fail('E_SDK_GLOBAL_CONFLICT', `SDK global already exists: ${name}`);
  }
  if (transport && (typeof transport.hello !== 'function' || typeof transport.request !== 'function')) throw fail('E_SCHEMA', 'Explicit SDK transport required');
  const nextTransport = transport ?? createWindowTransport({window: global.window, CustomEvent: global.CustomEvent});
  if (existing) {
    try { return existing.refresh(nextTransport, global); }
    catch (error) { nextTransport.dispose?.(); throw error; }
  }
  const state = {global, frames: new Set(), current: undefined, disposed: false};
  const ChromeBridgeEvents = new Map();
  state.cleanup = () => {
    for (const frame of state.frames) {
      if (frame === state.current || !frame.helloDone || frame.bridge.diagnostics().pending) continue;
      state.frames.delete(frame); frame.bridge.dispose();
      if (![...state.frames].some(other => other.transport === frame.transport)) frame.transport.dispose?.();
    }
  };
  const invoke = (method, ...args) => {
    const frame = state.current, before = new Set(frame.bridge.ChromeBridgeEvents.keys());
    const result = frame.bridge[method](...args), ids = [];
    for (const [id, callback] of frame.bridge.ChromeBridgeEvents) if (!before.has(id)) { ids.push(id); ChromeBridgeEvents.set(id, callback); }
    return result.finally(() => { ids.forEach(id => ChromeBridgeEvents.delete(id)); state.cleanup(); });
  };
  const call = (...args) => invoke('call', ...args);
  const callChromeBridgeInterface = (...args) => invoke('callChromeBridgeInterface', ...args);
  const ChromeBridgeOperationCompleted = (...args) => {
    for (const frame of state.frames) frame.bridge.ChromeBridgeOperationCompleted(...args);
    return '';
  };
  const executeScript = () => { throw fail('E_CAPABILITY', 'Raw page scripts are not an admitted SDK service'); };
  const dispose = error => {
    if (state.disposed) return; state.disposed = true;
    global.window?.removeEventListener('pagehide', onPageHide);
    const transports = new Set();
    for (const frame of state.frames) { frame.bridge.dispose(error); transports.add(frame.transport); }
    transports.forEach(value => value.dispose?.()); ChromeBridgeEvents.clear();
  };
  const onPageHide = () => dispose();
  const storage = createStorageFacades(call);
  const service = Object.freeze({storage: storage.storage});
  const sdk = Object.freeze({sdkVersion: SDK_VERSION, ready: () => state.current.bridge.ready(), call, service,
    axiosx: createHttp(call), ...storage, createNotify: createNotifications(call), serverUtils: createServers(call),
    sleep: createSleep(), getFingerprint, UtilDevice: createDeviceUtils({call, navigator: global.navigator, context: global}),
    UtilInfo: createNetworkInfo(call), formatJSON, dispose,
    diagnostics: () => ({pending: [...state.frames].reduce((sum, frame) => sum + frame.bridge.diagnostics().pending, 0), disposed: state.disposed})});
  const storageExports = {AppStorage: storage.AppStorage, AppLocal: storage.AppLocal, getObjectFromLocalStorage: storage.getObjectFromLocalStorage,
    saveObjectInLocalStorage: storage.saveObjectInLocalStorage, removeObjectFromLocalStorage: storage.removeObjectFromLocalStorage};
  const exports = Object.freeze({OpenDeskSDK: sdk, service, CHROME_PAGE_TYPE, axiosx: sdk.axiosx, ...storageExports, createNotify: sdk.createNotify, serverUtils: sdk.serverUtils,
    sleep: sdk.sleep, getFingerprint, generateEventId, decodeBase64, ChromeBridgeEvents,
    ChromeBridgeOperationCompleted, callChromeBridgeInterface, executeInBg: executeScript, executeScript});
  const record = Object.freeze({exports, refresh: refreshInstallation});
  installations.set(record, state);
  record.refresh(nextTransport, global);
  for (const [name, value] of Object.entries(exports)) Object.defineProperty(global, name, {value, enumerable: true, writable: false, configurable: false});
  Object.defineProperty(global, installationKey, {value: record});
  global.window?.addEventListener('pagehide', onPageHide, {once: true});
  return sdk;
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // Failed Hello remains a typed refusal; a later trusted regrant can refresh it.
  const sdk = installPageSdk();
  sdk.ready().catch(() => {});
}
