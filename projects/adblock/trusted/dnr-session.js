import {ADBLOCK_PERMISSION,ADBLOCK_DNR_CLEANUP_STORE as cleanupKey,adblockError} from './policy.js';
import {writeVerifiedLocalValue} from '../../../src/ui/sidebar-tools/storage-state.js';

const key='opendesk.adblock.dnr-session-ready.v1';
const valid=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).sort().join(',')==='ready,version'&&value.version===1&&typeof value.ready==='boolean';

// Caller holds the existing per-tool lock. A worker restart cannot promote the
// first-grant fence; Chrome clears this record when the extension is reloaded.
export async function adblockDnrSessionReady(api){
  const unknown=message=>{throw adblockError('E_OUTCOME_UNKNOWN',message);};
  const session=api.storage?.session;
  if(typeof session?.get!=='function'||typeof session?.set!=='function')
    unknown('Chrome storage.session 不可用，无法验证原生 DNR 会话');
  try{
    const row=await session.get(key);
    if(!row||typeof row!=='object'||Array.isArray(row))
      unknown('Chrome DNR 会话记录无法读取');
    const current=row[key];
    if(current!==undefined){
      if(!valid(current))unknown('DNR 会话围栏损坏，不能确认原生规则状态');
      return current.ready;
    }
    const granted=await api.permissions.contains({permissions:[ADBLOCK_PERMISSION]});
    if(typeof granted!=='boolean')unknown('Chrome DNR 授权读取状态未知');
    const next={version:1,ready:granted};
    await session.set({[key]:next});
    const readback=(await session.get(key))?.[key];
    if(!valid(readback)||readback.ready!==next.ready)
      unknown('Chrome DNR 会话围栏写入未获读回确认');
    return next.ready;
  }catch(error){
    if(error?.code==='E_OUTCOME_UNKNOWN')throw error;
    unknown('Chrome DNR 会话存储失败，禁止继续原生操作');
  }
}

// Extension reload clears session storage, but cannot prove that a matcher left
// by optional-permission revocation disappeared. Retain that uncertainty locally.
export async function adblockDnrCleanupPending(api,{ready=false,granted=true,beforeWrite=async()=>{}}={}){
  const value=(await api.storage.local.get(cleanupKey))[cleanupKey];
  if(value!==undefined&&typeof value!=='boolean')
    throw adblockError('E_OUTCOME_UNKNOWN','广告过滤规则清理记录损坏，禁止报告清理完成');
  if(ready&&!granted&&value!==true){
    await beforeWrite();
    await writeVerifiedLocalValue(api,cleanupKey,true,value,'广告过滤规则清理未确认');
    return true;
  }
  return value===true;
}

// Only call after a successful native rules readback, under the tool lock.
export async function confirmAdblockDnrCleanup(api,beforeWrite=async()=>{}){
  const value=(await api.storage.local.get(cleanupKey))[cleanupKey];
  if(value===false||value===undefined)return;
  if(value!==true)throw adblockError('E_OUTCOME_UNKNOWN','广告过滤规则清理记录损坏');
  await beforeWrite();
  await writeVerifiedLocalValue(api,cleanupKey,false,value,'广告过滤规则清理确认');
}
