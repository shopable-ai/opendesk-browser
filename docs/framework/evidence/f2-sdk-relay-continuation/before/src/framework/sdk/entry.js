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

const installations = new WeakMap();
export function installPageSdk({global = globalThis, transport} = {}) {
  if (installations.has(global)) return installations.get(global);
  const names = ['OpenDeskSDK', 'service', 'CHROME_PAGE_TYPE', 'axiosx', 'AppStorage', 'AppLocal', 'createNotify', 'serverUtils', 'sleep', 'getFingerprint',
    'generateEventId', 'decodeBase64', 'ChromeBridgeEvents', 'ChromeBridgeOperationCompleted', 'callChromeBridgeInterface', 'executeInBg', 'executeScript',
    'getObjectFromLocalStorage', 'saveObjectInLocalStorage', 'removeObjectFromLocalStorage'];
  for (const name of names) {
    if (name in global) throw fail('E_SDK_GLOBAL_CONFLICT', `SDK global already exists: ${name}`);
  }
  const bridge = createSdkBridge({transport: transport ?? createWindowTransport({window: global.window, CustomEvent: global.CustomEvent})});
  const storage = createStorageFacades(bridge.call);
  const service = Object.freeze({storage: storage.storage});
  const sdk = Object.freeze({sdkVersion: SDK_VERSION, ready: bridge.ready, call: bridge.call, service,
    axiosx: createHttp(bridge.call), ...storage, createNotify: createNotifications(bridge.call), serverUtils: createServers(bridge.call),
    sleep: createSleep(), getFingerprint, UtilDevice: createDeviceUtils({call: bridge.call, navigator: global.navigator, context: global}),
    UtilInfo: createNetworkInfo(bridge.call), formatJSON, dispose: bridge.dispose, diagnostics: bridge.diagnostics});
  const storageExports = {AppStorage: storage.AppStorage, AppLocal: storage.AppLocal, getObjectFromLocalStorage: storage.getObjectFromLocalStorage,
    saveObjectInLocalStorage: storage.saveObjectInLocalStorage, removeObjectFromLocalStorage: storage.removeObjectFromLocalStorage};
  const exports = {OpenDeskSDK: sdk, service, CHROME_PAGE_TYPE, axiosx: sdk.axiosx, ...storageExports, createNotify: sdk.createNotify, serverUtils: sdk.serverUtils,
    sleep: sdk.sleep, getFingerprint, generateEventId, decodeBase64,
    ChromeBridgeEvents: bridge.ChromeBridgeEvents,
    ChromeBridgeOperationCompleted: bridge.ChromeBridgeOperationCompleted, callChromeBridgeInterface: bridge.callChromeBridgeInterface,
    executeInBg: bridge.executeScript, executeScript: bridge.executeScript};
  for (const [name, value] of Object.entries(exports)) Object.defineProperty(global, name, {value, enumerable: true, writable: false, configurable: false});
  global.window?.addEventListener('pagehide', () => bridge.dispose(), {once: true});
  installations.set(global, sdk);
  return sdk;
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // Fixed packaged MAIN entry. The actual Hello goes through the already injected relay.
  const sdk = installPageSdk();
  sdk.ready().catch(error => { sdk.dispose(error); });
}
