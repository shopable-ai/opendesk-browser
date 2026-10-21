// Fixed product lifecycle adapter; caller owns the existing registry locks,
// uninstall journal and verified storage removal.
import {ADBLOCK_ID,ADBLOCK_STORE,ADBLOCK_PERMISSION,ADBLOCK_DNR_CLEANUP_STORE,adblockError} from './policy.js';
import {clearAdblockRules} from './rules.js';
import {ADBLOCK_COSMETIC_STORE} from './cosmetic-policy.js';
import {adblockDnrSessionReady,adblockDnrCleanupPending,confirmAdblockDnrCleanup} from './dnr-session.js';
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
