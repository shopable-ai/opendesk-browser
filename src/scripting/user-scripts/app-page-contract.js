import {invariant,digestUtf8} from '../../platform/protocol.js';
import {verifySidebarToolBackground,verifySidebarToolPackageWithHash,SIDEBAR_TOOL_STORE,sidebarToolStorageKey,SIDEBAR_TOOL_DATA_LIMITS} from '../../ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,requireToolEnableRecords,requireToolRevocationEpochs} from '../../ui/sidebar-tools/lifecycle.js';
import {stableStorageString,writeVerifiedLocalValue} from '../../ui/sidebar-tools/storage-state.js';
import {resolveToolLocaleState,toolLocaleStorageKey} from '../../ui/sidebar-tools/locale-packs.js';
import {UI_LOCALE_STORE,resolveGlobalUiLocale} from '../../ui/app-localization.js';

export const APP_PAGE_ACTION='app-page';
export const appPageEtag=value=>digestUtf8(stableStorageString(value));
export async function verifyAppPageTool(value){
  const tool=await verifySidebarToolBackground(value);
  invariant(tool.pageModule&&tool.capabilities.includes('page.module'),'E_APP_PAGE_OWNER','Missing reviewed Page companion');
  return tool;
}
export async function readAppPageParent(api,owner,{requireEnabled=true,withState=false}={}){
  invariant(owner&&/^[a-z][a-z0-9-]{1,39}$/.test(owner.toolId)&&
    /^[a-f0-9]{64}$/.test(owner.packageHash)&&typeof owner.installEpoch==='string'&&owner.installEpoch.length>0,
    'E_APP_PAGE_OWNER','Invalid parent installation identity');
  const raw=await api.storage.local.get([SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE]);
  invariant(Array.isArray(raw[SIDEBAR_TOOL_STORE]),'E_APP_PAGE_OWNER','Parent registry unavailable');
  const rows=raw[SIDEBAR_TOOL_STORE].filter(tool=>tool?.id===owner.toolId);
  const enabled=requireToolEnableRecords(raw[SIDEBAR_TOOL_ENABLE_STORE])[owner.toolId]!==false;
  invariant(rows.length===1&&(!requireEnabled||enabled)&&
    requireToolRevocationEpochs(raw[TOOL_REVOCATION_EPOCHS_STORE])[owner.toolId]===owner.installEpoch,
    'E_APP_PAGE_OWNER','Parent missing, disabled or replaced');
  const {tool,packageHash}=await verifySidebarToolPackageWithHash(rows[0]);
  invariant(tool.pageModule&&tool.capabilities.includes('page.module'),'E_APP_PAGE_OWNER','Missing reviewed Page companion');
  invariant(packageHash===owner.packageHash,'E_APP_PAGE_OWNER','Parent package changed');
  return withState?{tool,enabled}:tool;
}
export async function appPageStorage({api,owner,operation,payload={},authorize,lockManager=globalThis.navigator?.locks}){
  const work=async()=>{
    const tool=await readAppPageParent(api,owner);await authorize();
    const canStore=tool.capabilities.includes('storage.local');
    invariant(operation==='readContext'||canStore,'E_CAPABILITY','Companion storage requires storage.local');
    const namespace=sidebarToolStorageKey(owner.toolId),raw=canStore?(await api.storage.local.get(namespace))[namespace]:undefined;
    const data=raw??{};
    invariant(data&&typeof data==='object'&&!Array.isArray(data),'E_STORAGE_CORRUPT','Invalid tool namespace');
    if(operation==='readContext'){
      const localeKey=toolLocaleStorageKey(tool.id),locales=await api.storage.local.get([localeKey,UI_LOCALE_STORE]);
      const resolved=resolveToolLocaleState(tool,locales[localeKey],resolveGlobalUiLocale(locales[UI_LOCALE_STORE]));
      const locale=resolved?.locale??resolveGlobalUiLocale(locales[UI_LOCALE_STORE]);
      const sourceLocale=resolved?.sourceLocale??locale;
      const catalog={sourceLocale,messages:{
        [sourceLocale]:tool.localization?.messages[sourceLocale]??{},[locale]:resolved?.messages??{}}};
      await authorize();
      return {locale,catalog,data};
    }
    invariant(['storage.get','storage.set'].includes(operation),'E_CAPABILITY','Unknown companion operation');
    const key=payload.key;
    invariant(typeof key==='string'&&/^[a-zA-Z][a-zA-Z0-9._-]{0,59}$/.test(key)&&
      !['__proto__','constructor','prototype'].includes(key),'E_SCHEMA','Invalid tool data key');
    const value=Object.hasOwn(data,key)?data[key]:null,etag=await appPageEtag(value);
    if(operation==='storage.get'){await authorize();return {value,etag};}
    invariant(typeof payload.ifMatch==='string'&&payload.ifMatch===etag,'E_STORAGE_CONFLICT','Tool data changed');
    const encoded=JSON.stringify(payload.value),bytes=value=>new TextEncoder().encode(value).byteLength;
    invariant(typeof encoded==='string'&&bytes(encoded)<=SIDEBAR_TOOL_DATA_LIMITS.itemBytes,'E_TOOL_DATA_LIMIT','Item exceeds 8 KiB');
    const next={...data,[key]:JSON.parse(encoded)};
    invariant(Object.keys(next).length<=SIDEBAR_TOOL_DATA_LIMITS.maxKeys&&bytes(JSON.stringify(next))<=SIDEBAR_TOOL_DATA_LIMITS.totalBytes,
      'E_TOOL_DATA_LIMIT','Tool namespace exceeds limits');
    await authorize();await readAppPageParent(api,owner);
    const receipt=await writeVerifiedLocalValue(api,namespace,next,raw,'App Page data');
    try{await authorize();await readAppPageParent(api,owner);}
    catch(cause){throw Object.assign(new Error('App Page write completed but authorization changed; do not replay'),
      {code:'E_EFFECT_UNKNOWN',effectConfirmed:true,cause});}
    return {saved:true,etag:await appPageEtag(next[key]),...receipt};
  };
  if(operation!=='storage.set')return work();
  invariant(lockManager?.request,'E_TOOL_LOCK','Web Locks required');
  return lockManager.request('opendesk.sidebar-tools:tool:'+owner.toolId,work);
}
