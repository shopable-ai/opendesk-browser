import {createSiteProfileRegistry} from './site-profiles.js';

// The runtime chooses only statically supplied adapters. It neither grants
// site access nor treats a site's candidate as authority to run a task.
export function startSiteRuntime({win=globalThis.window,profiles,adapters,protocolIds}={}){
  if(!win||win!==win.top)return null;
  const registry=createSiteProfileRegistry({profiles,adapterIds:Object.keys(adapters),protocolIds});
  const profile=registry.select(win.location.href);
  if(!profile)return null;
  const adapter=Object.hasOwn(adapters,profile.adapter)?adapters[profile.adapter]:null;
  if(!adapter||typeof adapter.start!=='function'||adapter.version!==profile.adapterVersion)
    throw Object.assign(new Error('Site adapter version mismatch'),{code:'E_SITE_ADAPTER_VERSION'});
  return adapter.start({win,profile});
}
