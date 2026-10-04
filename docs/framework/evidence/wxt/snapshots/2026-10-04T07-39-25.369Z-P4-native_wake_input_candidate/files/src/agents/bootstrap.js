import {PROTOCOL} from '../platform/protocol.js';

export async function runBootstrap({api = chrome, location = globalThis.location} = {}) {
  const creationId = new URL(location.href).searchParams.get('creationId');
  if (!creationId) return;
  const registered = await api.runtime.sendMessage({protocol: PROTOCOL, type: 'BOOTSTRAP_READY', payload: {creationId, phase: 'ready'}});
  if (!registered?.ok || registered.retirementOnly) return;
  const navigation = await api.runtime.sendMessage({protocol: PROTOCOL, type: 'BOOTSTRAP_NAVIGATE', payload: {creationId, phase: 'navigate'}});
  if (navigation?.ok && navigation.navigate && navigation.creationId === creationId) location.assign(navigation.startUrl);
}

export function initBootstrap() {
if (typeof chrome !== 'undefined' && globalThis.location?.protocol === 'chrome-extension:') {
  const key = '__openDeskBootstrapV1';
  if (!globalThis[key]) {
    globalThis[key] = true;
    runBootstrap().catch(error => { document.body.textContent = `Execution page waiting: ${error.code || 'E_TARGET'}`; });
  }
}

}
