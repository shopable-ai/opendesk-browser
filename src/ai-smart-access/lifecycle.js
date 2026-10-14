// Reused by the existing installation transaction. It already holds the
// per-tool/catalog lock; never re-enter that lock from here.
import {AI_ID,AI_STORE,AI_ALARM,controlLevel,aiError} from './policy.js';
import {writeVerifiedLocalValue} from '../ui/sidebar-tools/storage-state.js';
export const EMPTY_AI_STATE=Object.freeze({schema:1,desired:false,releasePending:false,deviceId:null,lease:null});
export function parseAiState(value){
  if(value===undefined)return {...EMPTY_AI_STATE};
  if(!value||typeof value!=='object'||Array.isArray(value)||
      Object.keys(value).sort().join(',')!=='desired,deviceId,lease,releasePending,schema'||
      value.schema!==1||typeof value.desired!=='boolean'||typeof value.releasePending!=='boolean'||
      !(value.deviceId===null||typeof value.deviceId==='string'&&
        /^[a-f0-9-]{36}$/i.test(value.deviceId))||
      !(value.lease===null||typeof value.lease==='object'&&!Array.isArray(value.lease)))
    throw aiError('E_AI_STATE','AI 代理本地状态损坏，需要人工检查');
  return structuredClone(value);
}
export async function storeAiState(api,previous,next){
  await writeVerifiedLocalValue(api,AI_STORE,next,previous,'AI 智能访问状态');
  return next;
}
export async function releaseAiProxy(api){
  if(await api.permissions.contains({permissions:['proxy']})){
    if(!api.proxy?.settings?.clear||!api.proxy.settings?.get)
      throw aiError('E_AI_RUNTIME','Chrome 代理接口不可用');
    // Clear this extension's preference even if a newer extension masks it.
    // Never set global "direct", which would hide other extensions' settings.
    await api.proxy.settings.clear({scope:'regular'});
    const after=await api.proxy.settings.get({incognito:false});
    if(controlLevel(after?.levelOfControl)==='controlled_by_this_extension')
      throw aiError('E_AI_RELEASE','Chrome 未确认释放代理控制权');
  }
}
export async function stopAiAccessForTool(api,toolId){
  if(toolId!==AI_ID)return;
  const previous=(await api.storage.local.get(AI_STORE))[AI_STORE];
  const state=parseAiState(previous);
  const stopping={...state,desired:false,releasePending:true};
  await storeAiState(api,previous,stopping);
  // Durable STOP precedes side effects; any failure is retried on worker wake.
  await releaseAiProxy(api);
  await api.alarms?.clear?.(AI_ALARM);
  await storeAiState(api,stopping,{...stopping,releasePending:false});
}
export async function cleanupUninstalledAiAccess(api,toolId,removeVerifiedKey){
  if(toolId!==AI_ID)return;
  await stopAiAccessForTool(api,toolId);
  await removeVerifiedKey(api,AI_STORE);
}
