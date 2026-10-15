// Browser-wide, audited Managed Proxy Driver. No AI site, membership, Provider,
// license or product knowledge belongs here. Never expose raw ProxyConfig/PAC.
import {writeVerifiedLocalValue,sameStorageValue} from '../../ui/sidebar-tools/storage-state.js';

export const MANAGED_PROXY_STORE='opendesk.browser.proxy.managed.v1';
export const MANAGED_PROXY_ALARM='opendesk.browser.proxy.managed.recover.v1';
// Historical lock identity is deliberately preserved across the migration;
// there must never be two concurrent writers to chrome.proxy.settings.
const PROXY_LOCK='opendesk.ai-access:proxy';
const LEGACY_STORES=['opendesk.ai-vip-share.state.v1','opendesk.ai-access.state.v1'];
const LEVELS=['not_controllable','controlled_by_other_extensions',
  'controllable_by_this_extension','controlled_by_this_extension'];
const fail=(code,message)=>Object.assign(new Error(message),{code});
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,names)=>plain(value)&&
  Object.keys(value).sort().join(',')===[...names].sort().join(',');
const hostname=value=>typeof value==='string'&&value.length<=253&&
  value===value.toLowerCase()&&!value.endsWith('.')&&value.includes('.')&&
  !/^(?:localhost|.*\.localhost|.*\.local|.*\.internal)$/.test(value)&&
  !/^[0-9.]+$/.test(value)&&!value.includes(':')&&
  value.split('.').every(label=>label.length>0&&label.length<=63&&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));

export function validateManagedProxyConfig(config){
  if(!exact(config,['endpoint','domains'])||
     !exact(config.endpoint,['scheme','host','port'])||
     !['https','socks5'].includes(config.endpoint.scheme)||
     !hostname(config.endpoint.host)||
     !Number.isInteger(config.endpoint.port)||config.endpoint.port<1||
     config.endpoint.port>65535||
     !Array.isArray(config.domains)||config.domains.length<1||
     config.domains.length>16||new Set(config.domains).size!==config.domains.length||
     config.domains.some(domain=>!hostname(domain)))
    throw fail('E_PROXY_CONFIG','Only finite HTTPS/SOCKS5 endpoints and public ASCII domains are admitted');
  return {endpoint:{scheme:config.endpoint.scheme,host:config.endpoint.host,
      port:config.endpoint.port},domains:[...config.domains].sort()};
}
function ownerOf(context){
  const owner={toolId:context?.toolId,packageHash:context?.packageHash,
    installEpoch:context?.epoch??null};
  if(typeof owner.toolId!=='string'||!/^[a-z][a-z0-9-]{1,39}$/.test(owner.toolId)||
     typeof owner.packageHash!=='string'||!/^[0-9a-f]{64}$/.test(owner.packageHash)||
     !(owner.installEpoch===null||typeof owner.installEpoch==='string'&&
       /^[A-Za-z0-9._-]{1,180}$/.test(owner.installEpoch)))
    throw fail('E_PROXY_OWNER','Verified installed package identity is required');
  return owner;
}
const sameOwner=(a,b)=>Boolean(a&&b&&sameStorageValue(a,b));
function parseState(raw){
  if(raw===undefined)return null;
  if(!exact(raw,['schema','phase','owner','config'])||raw.schema!==1||
     !['applying','enabled','stopping','released'].includes(raw.phase))
    throw fail('E_PROXY_STATE','Managed Proxy journal is damaged; native settings have not been changed');
  ownerOf({...raw.owner,epoch:raw.owner?.installEpoch});
  validateManagedProxyConfig(raw.config);
  return raw;
}
function levelOf(row){
  return LEVELS.includes(row?.levelOfControl)?row.levelOfControl:'unknown';
}
export function compileManagedProxyPac(config,owner){
  const safe=validateManagedProxyConfig(config);
  const identity=ownerOf({...owner,epoch:owner?.installEpoch});
  const directive=(safe.endpoint.scheme==='socks5'?'SOCKS5 ':'HTTPS ')+
    safe.endpoint.host+':'+safe.endpoint.port;
  const lines=['// OpenDesk Managed Proxy owner '+JSON.stringify(identity),
    'function FindProxyForURL(url, host) {',
    '  host = String(host).toLowerCase().replace(/\\.$/, "");'];
  for(const domain of safe.domains)lines.push(
    '  if (host === '+JSON.stringify(domain)+' || dnsDomainIs(host, '+
    JSON.stringify('.'+domain)+')) return '+JSON.stringify(directive)+';');
  lines.push('  return "DIRECT";','}');
  return lines.join('\n');
}
function desiredSettings(record){
  return {mode:'pac_script',pacScript:{
    data:compileManagedProxyPac(record.config,record.owner),mandatory:true}};
}
function matchesSettings(actual,record){
  try{return actual?.mode==='pac_script'&&actual.pacScript?.mandatory===true&&
    actual.pacScript?.data===desiredSettings(record).pacScript.data;}
  catch{return false;}
}
async function legacyHold(api){
  let values;
  try{values=await api.storage.local.get(LEGACY_STORES);}
  catch{throw fail('E_PROXY_LEGACY_UNKNOWN','Cannot confirm historical proxy ownership');}
  for(const key of LEGACY_STORES){
    const value=values[key];
    if(value===undefined)continue;
    if(!plain(value)||typeof value.desired!=='boolean'||
       typeof value.releasePending!=='boolean'||
       value.pendingApply!==undefined&&value.pendingApply!==true)
      throw fail('E_PROXY_LEGACY_UNKNOWN','Historical proxy state is not readable');
    if(value.desired||value.releasePending||value.pendingApply)
      throw fail('E_PROXY_LEGACY_HOLD','Stop the verified historical proxy before changing owners');
  }
}
async function storageState(api){
  return parseState((await api.storage.local.get(MANAGED_PROXY_STORE))[MANAGED_PROXY_STORE]);
}
async function chromeState(api){
  if(!api.proxy?.settings?.get||!api.proxy.settings?.set||!api.proxy.settings?.clear)
    throw fail('E_PROXY_RUNTIME','Chrome proxy APIs are unavailable');
  if(!api.permissions?.contains||await api.permissions.contains({permissions:['proxy']})!==true)
    throw fail('E_CHROME_PERMISSION_REQUIRED','Chrome proxy permission is unavailable');
  return api.proxy.settings.get({incognito:false});
}
async function persist(api,previous,next){
  await writeVerifiedLocalValue(api,MANAGED_PROXY_STORE,next,previous,'Managed Proxy durable journal');
  return next;
}
function mutex(lockManager,run){
  if(typeof lockManager?.request!=='function')
    throw fail('E_TOOL_LOCK','Global cross-context proxy mutation lock is unavailable');
  return lockManager.request(PROXY_LOCK,run);
}
async function releaseLocked(api,record){
  if(record.phase!=='stopping')
    throw fail('E_PROXY_STATE','Only an explicitly persisted STOP may release Chrome proxy settings');
  const before=await chromeState(api),level=levelOf(before);
  if(level==='controllable_by_this_extension'){
    await persist(api,record,{...record,phase:'released'});
    await api.alarms?.clear?.(MANAGED_PROXY_ALARM);
    return;
  }
  if(level!=='controlled_by_this_extension'||!matchesSettings(before.value,record))
    throw fail('E_PROXY_OWNERSHIP','Chrome proxy belongs to another owner or is not verifiable; STOP remains pending');
  // Ownership = actual exact, approved, package-bound PAC, not levelOfControl alone.
  let error=null;
  try{await api.proxy.settings.clear({scope:'regular'});}catch(cause){error=cause;}
  let after;
  try{after=await chromeState(api);}catch{
    throw fail('E_OUTCOME_UNKNOWN','Chrome STOP acknowledgement/readback is unknown; no retry was assumed');
  }
  if(levelOf(after)!=='controllable_by_this_extension')
    throw fail('E_OUTCOME_UNKNOWN','Chrome has not confirmed exclusive proxy release');
  await persist(api,record,{...record,phase:'released'});
  await api.alarms?.clear?.(MANAGED_PROXY_ALARM);
  // A lost native acknowledgement is settled only after independent readback.
  void error;
}
async function stopLocked(api,record){
  if(record.phase==='released')return;
  const stopping=record.phase==='stopping'?record:
    await persist(api,record,{...record,phase:'stopping'});
  // Persist wake hint after STOP intent. Missing alarm does not erase STOP.
  await api.alarms?.create?.(MANAGED_PROXY_ALARM,{periodInMinutes:1});
  await releaseLocked(api,stopping);
}
async function getState(api,owner){
  const saved=await storageState(api);
  const permission=Boolean(await api.permissions?.contains?.({permissions:['proxy']}).catch(()=>false));
  let snapshot=null,control='unknown';
  try{if(permission){snapshot=await chromeState(api);control=levelOf(snapshot);}}catch{}
  const owns=sameOwner(saved?.owner,owner);
  let state='disabled',reason=null,canStop=false;
  if(!permission){state='unavailable';reason='Chrome proxy permission unavailable';}
  else if(control==='controlled_by_other_extensions'||control==='not_controllable'){
    state='conflict';reason='Chrome proxy controlled outside OpenDesk';
  }else if(saved&&saved.phase!=='released'&&!owns){
    state='conflict';reason='Browser-wide proxy is owned by another verified installation';
  }else if(saved&&owns&&saved.phase!=='released'){
    canStop=true;
    state=saved.phase==='enabled'&&control==='controlled_by_this_extension'&&
      matchesSettings(snapshot?.value,saved)?'enabled':'unavailable';
    if(state!=='enabled')reason='Proxy operation is pending or native ownership cannot be confirmed';
  }else if(control==='controlled_by_this_extension'){
    state='conflict';reason='Another extension-owned proxy configuration must not be overwritten';
  }
  if(state==='disabled'){
    try{await legacyHold(api);}
    catch{state='conflict';reason='Historical proxy configuration requires explicit STOP';}
  }
  return {state,control,permission,canStop,reason};
}
export function createBrowserManagedProxy({api=globalThis.chrome,
  lockManager=globalThis.navigator?.locks}={}){
  return Object.freeze({
    async getStatus(_input={},context){
      return getState(api,ownerOf(context));
    },
    async requestEnable(input,context){
      const config=validateManagedProxyConfig(input?.config);
      const owner=ownerOf(context);
      return mutex(lockManager,async()=>{
        const current=await storageState(api);
        if(current&&current.phase!=='released')
          throw fail('E_PROXY_OWNERSHIP','Another proxy operation or owner already exists');
        await legacyHold(api);
        const before=await chromeState(api);
        if(levelOf(before)!=='controllable_by_this_extension')
          throw fail('E_PROXY_CONFLICT','Chrome proxy control must be exclusively available before ENABLE');
        const applying={schema:1,phase:'applying',owner,config};
        await persist(api,current,applying); // Durable uncertainty fence precedes native effect.
        try{await api.proxy.settings.set({value:desiredSettings(applying),scope:'regular'});}
        catch{throw fail('E_OUTCOME_UNKNOWN','Chrome proxy set outcome is unknown; explicit STOP required');}
        const after=await chromeState(api);
        if(levelOf(after)!=='controlled_by_this_extension'||!matchesSettings(after.value,applying))
          throw fail('E_OUTCOME_UNKNOWN','Chrome did not verify the exact Managed Proxy PAC');
        await persist(api,applying,{...applying,phase:'enabled'});
        return getState(api,owner);
      });
    },
    async requestDisable(_input={},context){
      const owner=ownerOf(context);
      return mutex(lockManager,async()=>{
        const saved=await storageState(api);
        if(saved&&!sameOwner(saved.owner,owner))
          throw fail('E_PROXY_OWNERSHIP','Cannot STOP another installation proxy');
        if(saved)await stopLocked(api,saved);
        return getState(api,owner);
      });
    }
  });
}
// Installation disable/uninstall holds its own tool + catalog lock FIRST.
// This function acquires only the shared historical global proxy lock.
export async function stopManagedProxyForTool(api,toolId,{
  lockManager=globalThis.navigator?.locks,removeVerifiedKey=null
}={}){
  return mutex(lockManager,async()=>{
    const state=await storageState(api);
    if(!state||state.owner.toolId!==toolId)return false;
    await stopLocked(api,state);
    if(typeof removeVerifiedKey==='function'){
      const released=await storageState(api);
      if(released?.phase!=='released')
        throw fail('E_PROXY_OWNERSHIP','Pending proxy cannot be forgotten on uninstall');
      await removeVerifiedKey(api,MANAGED_PROXY_STORE);
    }
    return true;
  });
}
export async function reconcileManagedProxy(api=globalThis.chrome,{
  lockManager=globalThis.navigator?.locks
}={}){
  return mutex(lockManager,async()=>{
    const state=await storageState(api);
    // A lost ENABLE acknowledgement is NOT a STOP command.
    if(state?.phase==='stopping')await releaseLocked(api,state);
    return state?.phase??'absent';
  });
}
