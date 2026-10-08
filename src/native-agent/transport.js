import {createNativeAgentService} from './service-worker.js';

// The classic MV3 Service Worker loads ONLY this fixed, packaged local module.
// This exposes a factory, not a Controller, Worker, permission prompt or RPC port.
// The real source-of-truth remains the existing Sidebar RunHost.
export const NATIVE_TRANSPORT_KEY='__opendeskNativeAgentR1Factory';

export function installNativeTransport(scope=globalThis) {
  if (Object.hasOwn(scope,NATIVE_TRANSPORT_KEY)) throw Error('E_NATIVE_TRANSPORT_CONFLICT');
  Object.defineProperty(scope,NATIVE_TRANSPORT_KEY,{
    value:createNativeAgentService,configurable:false,writable:false,enumerable:false
  });
}
