// Browser-owned public build-time settings: no secrets or installation authority.
import source from './browser-config.json' with {type:'json'};

export const BROWSER_PUBLIC_CONFIG_SCHEMA='opendesk.browser.public-config.v1';
const exactKeys=(input,keys)=>input&&typeof input==='object'&&!Array.isArray(input)&&
  Object.getPrototypeOf(input)===Object.prototype&&
  Object.keys(input).sort().join(',')===keys.slice().sort().join(',');
const referenceModes=['controller','page','react','vue'];
const guideKeys=['apiIndex','typeSelection','localSidebarProject','completeProject',
  'sidebarTool','sidebarExample','runtime','dependencies'];
const isReferenceUrl=value=>{
  if(typeof value!=='string'||value.length>2048||!/^https:\/\//i.test(value)||
    /[\u0000-\u0020\u007f\\]/.test(value))return false;
  try{
    const url=new URL(value);
    return url.protocol==='https:'&&Boolean(url.hostname)&&!url.username&&!url.password;
  }catch{return false;}
};

// Future public namespaces must be explicitly validated here.
export function resolveBrowserPublicConfig(input=source){
  if(!exactKeys(input,['schema','navigation'])||
    input.schema!==BROWSER_PUBLIC_CONFIG_SCHEMA||
    !exactKeys(input.navigation,['extensionStore','developerReferences','developerGuides']))return null;
  const value=input.navigation.extensionStore;
  if(value!==null&&typeof value!=='string')return null;
  const references=input.navigation.developerReferences;
  if(!exactKeys(references,referenceModes))return null;
  const developerReferences={};
  for(const mode of referenceModes){
    const entry=references[mode];
    if(!exactKeys(entry,['examples','help'])||
      !isReferenceUrl(entry.examples)||!isReferenceUrl(entry.help))return null;
    developerReferences[mode]=Object.freeze({examples:entry.examples,help:entry.help});
  }
  const guides=input.navigation.developerGuides;
  if(!exactKeys(guides,guideKeys))return null;
  const developerGuides={};
  for(const key of guideKeys){
    if(!isReferenceUrl(guides[key]))return null;
    developerGuides[key]=guides[key];
  }
  return Object.freeze({schema:BROWSER_PUBLIC_CONFIG_SCHEMA,
    navigation:Object.freeze({extensionStore:value,developerReferences:Object.freeze(developerReferences),
      developerGuides:Object.freeze(developerGuides)})});
}
export const BROWSER_PUBLIC_CONFIG=resolveBrowserPublicConfig();
