// The installation transaction already holds its per-tool/catalog lock.
// Lock order: existing tool/catalog locks -> same-origin AI proxy Web Lock.
// No callback under the proxy lock may acquire a tool/catalog lock or re-enter
// this lock. UI installation and worker recovery share it across worlds.
// This is private lifecycle coordination, not a public Managed Proxy SDK.
import {AI_ID,AI_STORE,AI_ALARM,LEGACY_AI_ID,LEGACY_AI_STORE,LEGACY_AI_ALARM,
  controlLevel,aiError,matchesAiProxy,validAiProxyOwner,validEndpoint} from './policy.js';
import {writeVerifiedLocalValue,sameStorageValue} from '../ui/sidebar-tools/storage-state.js';
export const EMPTY_AI_STATE=Object.freeze({schema:1,desired:false,releasePending:false,deviceId:null,lease:null});
const namespaces={
  [AI_ID]:{store:AI_STORE,alarm:AI_ALARM},
  [LEGACY_AI_ID]:{store:LEGACY_AI_STORE,alarm:LEGACY_AI_ALARM}
};
export function withAiProxyMutation(lockManager,task){
  if(!lockManager?.request)throw aiError('E_TOOL_LOCK','缺少跨上下文代理资源锁，未修改代理');
  return lockManager.request('opendesk.ai-access:proxy',task);
}
export function parseAiState(value,toolId){
  if(value===undefined)return {...EMPTY_AI_STATE};
  if(!value||typeof value!=='object'||Array.isArray(value)||
      Object.keys(value).filter(key=>!['proxyOwner','previousEndpoint','pendingApply'].includes(key))
        .sort().join(',')!=='desired,deviceId,lease,releasePending,schema'||
      value.schema!==1||typeof value.desired!=='boolean'||typeof value.releasePending!=='boolean'||
      !(value.deviceId===null||typeof value.deviceId==='string'&&
        /^[a-f0-9-]{36}$/i.test(value.deviceId))||
      !(value.lease===null||typeof value.lease==='object'&&!Array.isArray(value.lease)))
    throw aiError('E_AI_STATE','AI 代理本地状态损坏，需要人工检查');
  if(Object.hasOwn(value,'proxyOwner'))validAiProxyOwner(value.proxyOwner,toolId);
  if(Object.hasOwn(value,'pendingApply')&&
     (value.pendingApply!==true||!value.releasePending))
    throw aiError('E_AI_STATE','代理设置回执无效');
  if(Object.hasOwn(value,'previousEndpoint')){
    if(!value.releasePending)throw aiError('E_AI_STATE','代理中断回执无效');
    validEndpoint(value.previousEndpoint);
  }
  return structuredClone(value);
}
export async function readAiStates(api){
  const saved=await api.storage.local.get([AI_STORE,LEGACY_AI_STORE]);
  return Object.fromEntries(Object.entries(namespaces).map(([id,{store}])=>
    [id,{raw:saved[store],state:parseAiState(saved[store],id)}]));
}
export async function storeAiState(api,previous,next,toolId=AI_ID){
  await writeVerifiedLocalValue(api,namespaces[toolId].store,next,previous,'AI 智能访问状态');
  return next;
}
export function matchesAiStateProxy(value,state){
  // Expiry prevents use, not release: keep the original endpoint as evidence.
  try{return Boolean(state.lease&&matchesAiProxy(value,state.lease.endpoint,state.proxyOwner)||
    state.previousEndpoint&&matchesAiProxy(value,state.previousEndpoint,state.proxyOwner));}
  catch{return false;}
}
export async function releaseAiProxy(api,toolId,guard=async()=>{}){
  if(!namespaces[toolId])throw aiError('E_AI_OWNERSHIP','缺少代理工具身份');
  const records=await readAiStates(api),state=records[toolId].state;
  if(!await api.permissions.contains({permissions:['proxy']}))
    throw aiError('E_AI_PERMISSION','缺少代理权限，保留停止回执等待核对');
  if(!api.proxy?.settings?.clear||!api.proxy.settings?.get)
    throw aiError('E_AI_RUNTIME','Chrome 代理接口不可用');
  const before=await api.proxy.settings.get({incognito:false});
  const level=controlLevel(before?.levelOfControl);
  if(level==='controllable_by_this_extension')return;
  if(level!=='controlled_by_this_extension')
    throw aiError('E_AI_OWNERSHIP','代理控制权不可核对，未清理扩展代理');
  const peer=records[toolId===AI_ID?LEGACY_AI_ID:AI_ID].state;
  const own=matchesAiStateProxy(before.value,state),other=matchesAiStateProxy(before.value,peer);
  if(other&&!own)return;
  if(!state.releasePending||!own||other)
    throw aiError('E_AI_OWNERSHIP','代理归属不明确，保留停止回执等待核对');
  // Extension-level control alone is never proof of this tool's ownership.
  // Never clear a masked preference or set global "direct".
  await guard();
  await api.proxy.settings.clear({scope:'regular'});
  const after=await api.proxy.settings.get({incognito:false});
  // Clear removes our preference; a previously masked extension may now be
  // visible. Its control is a valid release outcome and must never be cleared.
  if(!['controllable_by_this_extension','controlled_by_other_extensions'].includes(
      controlLevel(after?.levelOfControl)))
    throw aiError('E_AI_RELEASE','Chrome 未确认释放代理控制权，保留回执');
}
// Called only with the proxy resource lock held; cleanup keeps that same
// lock through verified deletion, so a queued recovery cannot resurrect data.
async function stopLocked(api,toolId,options){
    const {dropLease=false,guard=async()=>{}}=options;
    await guard();
    const {store,alarm}=namespaces[toolId];
    const previous=(await api.storage.local.get(store))[store];
    // A background snapshot is not authority to create or replace state.
    // Compare after waiting for the proxy lock, before every STOP effect.
    if(Object.hasOwn(options,'expectedRaw')&&
       (previous===undefined||!sameStorageValue(previous,options.expectedRaw)))return false;
    const state=parseAiState(previous,toolId);
    const {pendingApply,...evidence}=state;
    const stopping={...evidence,desired:false,releasePending:true};
    await guard();
    await storeAiState(api,previous,stopping,toolId);
    // Durable STOP and the full lease/receipt precede every native effect.
    // Legacy installations may no longer have a lease alarm. Arm recovery
    // before clear so a missing acknowledgement can be retried on alarm wake.
    await guard();
    await api.alarms.create(alarm,{periodInMinutes:1});
    await releaseAiProxy(api,toolId,guard);
    await guard();
    await api.alarms?.clear?.(alarm);
    const {previousEndpoint,...settled}=stopping;
    await guard();
    await storeAiState(api,stopping,{...settled,releasePending:false,
      ...(dropLease?{lease:null}:{})},toolId);
    return true;
}
export async function stopAiAccessForTool(api,toolId,options={}){
  if(!namespaces[toolId])return;
  const {lockManager=globalThis.navigator?.locks}=options;
  return withAiProxyMutation(lockManager,async()=>{
    await stopLocked(api,toolId,options);
  });
}
export async function cleanupUninstalledAiAccess(api,toolId,removeVerifiedKey,options={}){
  if(!namespaces[toolId])return;
  const {lockManager=globalThis.navigator?.locks}=options;
  return withAiProxyMutation(lockManager,async()=>{
    if(!await stopLocked(api,toolId,options))return;
    await options.guard?.();
    await removeVerifiedKey(api,namespaces[toolId].store);
  });
}
