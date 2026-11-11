// Compatibility guard only. The original Task Authority owns all execution and
// results; these old AppStorage records remain recovery locators, never receipts.
import {sidebarToolStorageKey} from '../../../src/ui/sidebar-tools/package.js';

const sheetKey='opendesk.shared-task-run-sheet.webflow.v1';
const sheetLock='opendesk.shared-task-run-sheet.webflow.lock.v1';

export async function withWebflowTaskRunRecovery(api,work,{appId,verifyRecovery=async()=>false}={}){
  // Every lifecycle participant uses the same global ordering as original
  // snapshot disclosure. Pass held locks down explicitly, never reacquire one.
  const appIds=[...new Set(['webflow',...(appId?[appId]:[])])].sort();
  const check=async()=>{
    const key=sidebarToolStorageKey('webflow');
    const blocked=()=>{throw Object.assign(new Error(
      'Web Flow 有尚未核清的原请求，请到「记录」查询或停止原请求；不能新建任务补跑。'),
    {code:'E_TASK_RECOVERY_REQUIRED'});};
    // The previous trusted sheet used a separate durable fence. Keep its
    // original lock and terminal contract; never infer release from a missing
    // new journal entry or replay an old ready/submitted/unknown identity.
    const saved=await api.storage.local.get([key,sheetKey]);
    const sheet=saved[sheetKey];
    if(sheet!=null&&(typeof sheet!=='object'||Array.isArray(sheet)||
      sheet.format!=='opendesk.task-preparation.v1'||typeof sheet.id!=='string'||
      !['retired','cancelled'].includes(sheet.state)))blocked();
    const data=saved[key];
    if(data!=null&&(!data||typeof data!=='object'||Array.isArray(data)))blocked();
    const pending=data?.['webflow.pending.v1'];
    if(pending!=null&&!await verifyRecovery(pending,'webflow'))blocked();
    const recent=data?.['webflow.recent.v1'];
    if(recent!=null){
      if(!Array.isArray(recent)||recent.length>2048)blocked();
      // AppStorage is a locator, not a settlement receipt. Ignore cached
      // completed/released/notSubmittedFenced claims and ask original Authority.
      for(const row of recent)if(!await verifyRecovery(row,'webflow'))blocked();
    }
    return work(appIds);
  };
  const locks=globalThis.navigator?.locks;
  if(!locks?.request)throw Object.assign(new Error('任务恢复锁不可用'),{code:'E_TOOL_LOCK'});
  const acquire=index=>index===appIds.length?locks.request(sheetLock,check):
    locks.request('opendesk.sidebar-tools:tool:'+appIds[index],()=>acquire(index+1));
  return acquire(0);
}
