// Browser-owned public build-time settings: no secrets or installation authority.
import source from './browser-config.json' with {type:'json'};

export const BROWSER_PUBLIC_CONFIG_SCHEMA='opendesk.browser.public-config.v1';
const exactKeys=(input,keys)=>input&&typeof input==='object'&&!Array.isArray(input)&&
  Object.getPrototypeOf(input)===Object.prototype&&
  Object.keys(input).sort().join(',')===keys.slice().sort().join(',');

// Future public namespaces must be explicitly validated here.
export function resolveBrowserPublicConfig(input=source){
  if(!exactKeys(input,['schema','navigation'])||
    input.schema!==BROWSER_PUBLIC_CONFIG_SCHEMA||
    !exactKeys(input.navigation,['extensionStore']))return null;
  const value=input.navigation.extensionStore;
  if(value!==null&&typeof value!=='string')return null;
  return Object.freeze({schema:BROWSER_PUBLIC_CONFIG_SCHEMA,
    navigation:Object.freeze({extensionStore:value})});
}
export const BROWSER_PUBLIC_CONFIG=resolveBrowserPublicConfig();
