// Trusted host data only. Never evaluate translations or expose this store through tool storage.
import {canonicalUiLocale,resolveUiLocale} from '../app-localization.js';
import {validateToolLocalization,verifyToolLocalization} from './localization.js';
import {SIDEBAR_TOOL_STORE,MAX_INSTALLED_TOOLS,validateSidebarToolPackage,serializeSidebarToolPackage} from './package.js';
import {writeVerifiedLocalValue} from './storage-state.js';

export const LOCALE_PACK_FORMAT='opendesk.locale-pack.v1';
export const LOCALE_PACK_STORE='opendesk.sidebar-tools.locales.v1:'; // Per-tool key prefix, not a shared map.
export const TOOL_LOCALE_STORE_PREFIX=LOCALE_PACK_STORE;
export const LOCALE_PACK_MAX_BYTES=262144;
const MAX_STORE_BYTES=1048576,MAX_PACKS=12;
const forbidden=new Set(['__proto__','prototype','constructor']);
const fail=(message,code='E_LOCALE_PACK')=>{throw Object.assign(new Error(message),{code});};
function record(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    ![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('Expected plain data object');
  for(const key of Reflect.ownKeys(value)){
    const field=Object.getOwnPropertyDescriptor(value,key);
    if(typeof key!=='string'||forbidden.has(key)||!field.enumerable||!Object.hasOwn(field,'value'))
      fail('Unsafe data field');
  }
  return value;
}
function exact(value,keys){
  record(value);
  if(Object.keys(value).sort().join(',')!==[...keys].sort().join(','))fail('Unknown or missing field');
}
function toolId(id){
  if(typeof id!=='string'||!/^[a-z][a-z0-9-]{1,39}$/.test(id)||forbidden.has(id))fail('Invalid tool ID');
  return id;
}
export const toolLocaleStorageKey=id=>TOOL_LOCALE_STORE_PREFIX+toolId(id);
function locale(value){
  if(typeof value!=='string'||!canonicalUiLocale(value)||canonicalUiLocale(value)!==value)
    fail('Expected canonical BCP47 language');
  return value;
}
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
function metadata(tool){
  toolId(tool?.id);
  if(!tool.localization)fail('Tool has no business UI localization catalog','E_TOOL_NO_LOCALIZATION');
  return validateToolLocalization(tool.localization);
}
function parse(input){
  if(typeof input==='string'){
    if(new TextEncoder().encode(input).byteLength>LOCALE_PACK_MAX_BYTES)fail('Locale pack too large');
    try{input=JSON.parse(input);}catch{fail('Invalid JSON');}
  }
  exact(input,['format','toolId','sourceLocale','targetLocale','sourceCatalogHash','messages']);
  if(input.format!==LOCALE_PACK_FORMAT)fail('Invalid locale pack format');
  toolId(input.toolId);locale(input.sourceLocale);locale(input.targetLocale);
  if(input.sourceLocale===input.targetLocale)fail('Target must differ from source language');
  if(typeof input.sourceCatalogHash!=='string'||!/^[a-f0-9]{64}$/.test(input.sourceCatalogHash))fail('Invalid source SHA-256');
  record(input.messages);
  const entries=Object.entries(input.messages);
  if(entries.length>160)fail('Too many messages');
  const source={},target={};
  for(const [key,row] of entries){
    if(!/^[a-z][a-zA-Z0-9]{0,63}$/.test(key))fail('Invalid semantic key');
    exact(row,['source','text']);
    source[key]=row.source;target[key]=row.text;
  }
  // Reuse the shared pure-text and exact placeholder-multiset admission contract.
  if(entries.length)validateToolLocalization({sourceLocale:input.sourceLocale,
    sourceCatalogHash:input.sourceCatalogHash,
    messages:{[input.sourceLocale]:source,[input.targetLocale]:target}});
  if(bytes(input)>LOCALE_PACK_MAX_BYTES)fail('Locale pack too large');
  return structuredClone(input);
}
export function parseLocalePack(input,tool){
  const pack=parse(input);
  if(tool){
    const catalog=metadata(tool);
    if(pack.toolId!==tool.id||pack.sourceLocale!==catalog.sourceLocale)fail('Locale pack belongs to a different tool/source language');
  }
  return pack;
}
export function evaluateLocalePack(input,tool){
  const pack=parseLocalePack(input,tool),catalog=metadata(tool),source=catalog.messages[catalog.sourceLocale];
  const messages={},stale=[];
  for(const [key,row] of Object.entries(pack.messages)){
    if(Object.hasOwn(source,key)&&row.source===source[key])messages[key]=row.text;
    else stale.push(key);
  }
  return {pack,messages,missing:Object.keys(source).filter(key=>!Object.hasOwn(messages,key)),stale,
    hashMatches:pack.sourceCatalogHash===catalog.sourceCatalogHash};
}
function readStore(raw,id){
  if(raw===undefined)return {locale:null,packs:{}};
  exact(raw,['locale','packs']);
  if(raw.locale!==null)locale(raw.locale);
  record(raw.packs);
  if(Object.keys(raw.packs).length>MAX_PACKS)fail('Locale storage exceeds limit','E_STORAGE_CORRUPT');
  for(const [language,value] of Object.entries(raw.packs)){
    locale(language);const pack=parse(value);
    if(pack.toolId!==id||pack.targetLocale!==language)fail('Invalid stored pack identity','E_STORAGE_CORRUPT');
  }
  if(bytes(raw)>MAX_STORE_BYTES)fail('Locale storage exceeds limit','E_STORAGE_CORRUPT');
  return structuredClone(raw);
}


function availableLocales(row,catalog){
  return [...new Set([...Object.keys(catalog.messages),...Object.entries(row.packs)
    .filter(([,pack])=>pack.sourceLocale===catalog.sourceLocale).map(([language])=>language)])].sort();
}
// Pure read-only projection for verified installed records in trusted consumers.
// Callers establish official/package identity first; an ID alone grants no trust.
export function resolveToolLocaleState(tool,storedState,globalLocale){
  if(!tool?.localization)return null;
  const catalog=metadata(tool),row=readStore(storedState,tool.id);
  const selected=resolveUiLocale(row.locale??globalLocale,availableLocales(row,catalog),catalog.sourceLocale);
  const source=catalog.messages[catalog.sourceLocale],official=catalog.messages[selected]||{};
  const pack=row.packs[selected];
  const custom=pack&&pack.sourceLocale===catalog.sourceLocale?evaluateLocalePack(pack,tool).messages:{};
  const translated=selected===catalog.sourceLocale?source:{...official,...custom};
  return {sourceLocale:catalog.sourceLocale,sourceCatalogHash:catalog.sourceCatalogHash,locale:selected,
    messages:{...source,...translated},missing:Object.keys(source).filter(key=>!Object.hasOwn(translated,key))};
}

// Only trusted management UI calls mutations. Bridge consumers receive getCatalog results.
// Lock order matches Installer exactly: tool -> catalog. Per-tool independent keys
// allow confirmed uninstall cleanup under those same locks, with no lock inversion.
export function createToolLocaleService({api=globalThis.chrome,lockManager=globalThis.navigator?.locks}={}){
  let closed=false,state={status:'loading',tools:{},error:null};
  let recoveryGeneration=0,recoveryError=null;
  const listeners=new Set();
  const snapshot=()=>structuredClone(state);
  const notify=()=>{if(!closed)for(const listener of [...listeners]){try{listener(snapshot());}catch{ /* observer cannot change persistence outcome */ }}};
  const active=()=>{if(closed)fail('Locale service disposed','E_DISPOSED');};
  const lock=(id,work)=>{
    active();if(!lockManager?.request)fail('Web Locks required','E_TOOL_LOCK');
    return id?lockManager.request('opendesk.sidebar-tools:tool:'+toolId(id),()=>
      lockManager.request('opendesk.sidebar-tools:catalog',work)):
      lockManager.request('opendesk.sidebar-tools:catalog',work);
  };
  async function installed(){
    const raw=(await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE];
    if(raw===undefined)return [];
    if(!Array.isArray(raw)||raw.length>MAX_INSTALLED_TOOLS)fail('Invalid installed tool registry','E_STORAGE_CORRUPT');
    const tools=raw.map(validateSidebarToolPackage);
    if(new Set(tools.map(tool=>tool.id)).size!==tools.length)fail('Duplicate installed tool','E_STORAGE_CORRUPT');
    return tools;
  }
  async function loadLocked(){
    const tools=await installed(),rows={};
    for(const tool of tools){
      if(tool.localization)await verifyToolLocalization(tool.localization);
      const key=toolLocaleStorageKey(tool.id);
      rows[tool.id]=readStore((await api.storage.local.get(key))[key],tool.id);
    }
    return rows;
  }
  async function refresh(recover=false){
    active();
    const generation=recoveryGeneration;
    try{
      await lock(null,async()=>{
        const rows=await loadLocked();active();
        // Storage events refresh the projection, never acknowledge an uncertain
        // operation. An explicit reload cannot recover a newer failure either.
        if(recover&&generation===recoveryGeneration)recoveryError=null;
        state={status:recoveryError?'unknown':'ready',tools:rows,error:recoveryError};
      });
      notify();return snapshot();
    }catch(cause){
      if(!closed){state={...state,status:recoveryError?'unknown':'error',
        error:recoveryError??{code:cause.code||'E_HOST_STORAGE_READ',message:cause.message}};notify();}
      throw cause;
    }
  }
  const reload=()=>refresh(true);
  async function mutate(id,expected,update){
    const generation=recoveryGeneration;
    await ready.catch(()=>{});active();
    const requireRecovered=()=>{
      if(generation!==recoveryGeneration||recoveryError||state.status!=='ready')
        fail('Reload locale storage before another mutation','E_LOCALE_RECOVERY_REQUIRED');
    };
    requireRecovered();
    try{
      await lock(id,async()=>{
        active();
        requireRecovered();
        const tool=(await installed()).find(row=>row.id===id);
        if(!tool||expected&&serializeSidebarToolPackage(tool)!==serializeSidebarToolPackage(expected))
          fail('Tool updated or uninstalled; reopen management','E_TOOL_CHANGED');
        if(tool.localization)await verifyToolLocalization(tool.localization);
        const key=toolLocaleStorageKey(id),raw=(await api.storage.local.get(key))[key];
        const next=await update(readStore(raw,id),tool);
        readStore(next,id);
        try{await writeVerifiedLocalValue(api,key,next,raw,'工具语言包');}
        catch(cause){
          // Fence already queued mutations before releasing either install lock.
          if(cause.code==='E_OUTCOME_UNKNOWN'){
            recoveryGeneration++;
            recoveryError={code:cause.code,message:cause.message};
            state={...state,status:'unknown',error:recoveryError};
          }
          throw cause;
        }
        state={status:'ready',tools:{...state.tools,[id]:next},error:null};
      });
      notify();return snapshot();
    }catch(cause){
      if(!['E_OUTCOME_UNKNOWN','E_LOCALE_RECOVERY_REQUIRED'].includes(cause.code))
        state={...state,error:recoveryError??{code:cause.code||'E_LOCALE_PACK',message:cause.message}};
      notify();throw cause;
    }
  }
  function getCatalog(tool,requested){
    return resolveToolLocaleState(tool,state.tools[tool?.id],requested);
  }
  function getAvailableLocales(tool){
    if(!tool?.localization)return [];
    return availableLocales(readStore(state.tools[tool.id],tool.id),metadata(tool));
  }
  const onChange=(changes,area)=>{
    if(area==='local'&&(Object.hasOwn(changes,SIDEBAR_TOOL_STORE)||Object.keys(changes).some(key=>key.startsWith(TOOL_LOCALE_STORE_PREFIX))))
      void refresh().catch(()=>{});
  };
  api?.storage?.onChanged?.addListener(onChange);
  const ready=refresh();
  // Keep an observable rejected ready promise without an unhandled rejection if a UI subscribes first.
  void ready.catch(()=>{});
  return {
    ready,reload,getState:snapshot,
    subscribe(listener){active();listeners.add(listener);return ()=>listeners.delete(listener);},
    dispose(){closed=true;listeners.clear();api?.storage?.onChanged?.removeListener(onChange);},
    getToolLocale(id){return state.tools[toolId(id)]?.locale??null;},getCatalog,getAvailableLocales,
    preview:evaluateLocalePack,
    install(input,tool){const pack=parseLocalePack(input,tool);return mutate(tool.id,tool,(row)=>({...row,packs:{...row.packs,[pack.targetLocale]:pack}}));},
    remove(id,language){locale(language);return mutate(id,null,row=>{delete row.packs[language];return row;});},
    exportPack(id,language){locale(language);return structuredClone(state.tools[toolId(id)]?.packs[language]??null);},
    setToolLocale(id,language){if(language!==null)locale(language);return mutate(id,null,row=>({...row,locale:language}));},
    exportTranslationTask(tool,language){
      locale(language);const catalog=metadata(tool);
      if(language===catalog.sourceLocale)fail('Target must differ from source language');
      const resolved=resolveToolLocaleState(tool,{...readStore(state.tools[tool.id],tool.id),locale:language},language);
      const missing=resolved.locale===language?resolved.missing:Object.keys(catalog.messages[catalog.sourceLocale]);
      const source=catalog.messages[catalog.sourceLocale];
      const translated=resolved.locale===language?resolved.messages:source;
      return {translationKeys:missing,
        instructions:'Translate only the supplied business UI messages locally. No upload or network call is performed. Return only the complete pack JSON. Translate text only for keys listed in translationKeys; preserve every other row unchanged. Keep source, keys, identity, locales and hash unchanged. Preserve each {name} placeholder and its occurrence count. Plain text only: no markup, code, control/bidi characters, event handlers or URL schemes. Host permission, authorization and security copy is excluded.',
        schema:{format:LOCALE_PACK_FORMAT,additionalProperties:false,required:['format','toolId','sourceLocale','targetLocale','sourceCatalogHash','messages'],
          maxBytes:LOCALE_PACK_MAX_BYTES,maxMessages:160,semanticKey:'^[a-z][a-zA-Z0-9]{0,63}$',
          message:{required:['source','text'],additionalProperties:false,minLength:1,maxLength:380},locales:'canonical BCP47',scope:'business UI only'},
        pack:{format:LOCALE_PACK_FORMAT,toolId:tool.id,sourceLocale:catalog.sourceLocale,targetLocale:language,
          sourceCatalogHash:catalog.sourceCatalogHash,
          messages:Object.fromEntries(Object.keys(source).map(key=>[key,{source:source[key],text:translated[key]}]))}};
    }
  };
}
