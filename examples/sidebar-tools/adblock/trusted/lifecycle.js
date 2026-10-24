// Fixed product lifecycle adapter; caller owns the existing registry locks,
// uninstall journal and verified storage removal.
import {ADBLOCK_ID,ADBLOCK_CAPABILITY,ADBLOCK_STORE,ADBLOCK_PERMISSION,ADBLOCK_DNR_CLEANUP_STORE,
  readAdblockState,adblockError} from './policy.js';
import {validateSidebarToolPackage,sidebarToolPackageHash} from '../../../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,requireToolEnableRecords} from '../../../../src/ui/sidebar-tools/lifecycle.js';
import {clearAdblockRules} from './rules.js';
import {ADBLOCK_COSMETIC_STORE} from './cosmetic-policy.js';
import {adblockDnrSessionReady,adblockDnrCleanupPending,confirmAdblockDnrCleanup} from './dnr-session.js';
// Called only by the reviewed Installer under its existing tool/catalog locks.
// The returned policy commits WITH the new package and epoch; no old request
// receives new authority, and no candidate JavaScript is executed here.
export async function prepareReviewedAdblockUpdate(api,{existing,candidate,oldEpoch,newEpoch}){
  const controlOnly=tool=>tool?.id===ADBLOCK_ID&&tool.capabilities.length===1&&
    tool.capabilities[0]===ADBLOCK_CAPABILITY;
  if(!controlOnly(existing)||!controlOnly(candidate))return null;
  const saved=await api.storage.local.get([ADBLOCK_STORE,SIDEBAR_TOOL_ENABLE_STORE]);
  const raw=saved[ADBLOCK_STORE];
  if(raw===undefined||requireToolEnableRecords(saved[SIDEBAR_TOOL_ENABLE_STORE])[ADBLOCK_ID]===false)
    return null;
  const state=readAdblockState(raw);
  if(!state.enabled||state.approvedEpoch!==oldEpoch||
     state.approvedHash!==await sidebarToolPackageHash(existing))return null;
  if(await api.permissions.contains({permissions:[ADBLOCK_PERMISSION]})!==true)return null;
  const ready=await adblockDnrSessionReady(api);
  if(!ready||await adblockDnrCleanupPending(api,{ready,granted:true}))return null;
  const uri=api.runtime.getURL('official-tools/adblock/adblock.opendesk-tool.json');
  const response=await fetch(uri,{cache:'no-store',redirect:'error',credentials:'omit'});
  if(!response?.ok||(response.url&&response.url!==uri))
    throw adblockError('E_ADBLOCK_PACKAGE','无法核实当前扩展内置的广告拦截包');
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(!bytes.length||bytes.length>320000)
    throw adblockError('E_ADBLOCK_PACKAGE','内置广告拦截包无效或超过产品容量');
  const bundled=validateSidebarToolPackage(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
  const hash=await sidebarToolPackageHash(candidate);
  if(await sidebarToolPackageHash(bundled)!==hash)return null;
  return {previous:raw,next:{...state,approvedHash:hash,approvedEpoch:newEpoch}};
}
export async function stopAdblockForTool(api,toolId){
  if(toolId!==ADBLOCK_ID)return;
  const ready=await adblockDnrSessionReady(api);
  const granted=await api.permissions.contains({permissions:[ADBLOCK_PERMISSION]});
  const pending=await adblockDnrCleanupPending(api,{ready,granted});
  if(typeof granted!=='boolean'||granted!==ready||!granted&&pending)
    throw adblockError('E_OUTCOME_UNKNOWN',
      'Chrome 广告过滤权限与会话状态不一致，无法确认自有规则已清理；请保存工作并完整重启 Chrome 后恢复清理');
  if(granted){await clearAdblockRules(api);await confirmAdblockDnrCleanup(api);}
}
export async function cleanupUninstalledAdblock(api,toolId,removeVerifiedKey){
  if(toolId!==ADBLOCK_ID)return;
  await stopAdblockForTool(api,toolId);
  await removeVerifiedKey(api,ADBLOCK_STORE);
  await removeVerifiedKey(api,ADBLOCK_COSMETIC_STORE);
  await removeVerifiedKey(api,ADBLOCK_DNR_CLEANUP_STORE);
}
