import {createSiteProfileRegistry} from './site-profiles.js';
import {SITE_PROFILES_KEY,WEB_TASK_INTENT_PROTOCOL} from './web-task-contract.js';

// Code-owned compatibility catalog. Profiles contain routing data, never code.
export const SITE_ADAPTER_VERSIONS=Object.freeze({generic:'1.0.0'});
export function registeredSiteRegistry(profiles){
  const registry=createSiteProfileRegistry({profiles,adapterIds:Object.keys(SITE_ADAPTER_VERSIONS),
    protocolIds:[WEB_TASK_INTENT_PROTOCOL]});
  for(const profile of profiles)if(profile.adapterVersion!==SITE_ADAPTER_VERSIONS[profile.adapter]||
    profile.origin==='https://chatgpt.com')
    throw Object.assign(new Error('Unsupported site adapter version or static ChatGPT registration'),{code:'E_SITE_ADAPTER_VERSION'});
  return registry;
}
export async function loadSiteProfiles(api){
  const profiles=(await api.storage.local.get(SITE_PROFILES_KEY))?.[SITE_PROFILES_KEY]??[];
  registeredSiteRegistry(profiles);
  return profiles;
}
