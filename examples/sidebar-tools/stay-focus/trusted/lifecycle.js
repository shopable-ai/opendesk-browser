// Fixed product adapter, invoked inside the existing installation transaction.
// The caller holds tool/catalog locks and checks absence before uninstall cleanup.
import {FOCUS_ID,FOCUS_STORE,FOCUS_SESSION,FOCUS_ALARM,focusError} from './policy.js';
import {clearFocusRules} from './rule-ownership.js';

export async function stopStayFocusForTool(api,toolId){
  if(toolId!==FOCUS_ID)return;
  // DNR is shared: only retire this product's fixed rule range.
  if(await api.permissions.contains({permissions:['declarativeNetRequestWithHostAccess']}))
    await clearFocusRules(api);
  // An interrupted native STOP remains recoverable rather than reported clean.
  if(api.alarms?.clear&&api.alarms?.get){
    await api.alarms.clear(FOCUS_ALARM);
    if(await api.alarms.get(FOCUS_ALARM))
      throw focusError('专注后台计时提醒尚未清除，请重新执行停用','E_OUTCOME_UNKNOWN');
  }
}
export async function cleanupUninstalledStayFocus(api,toolId,removeVerifiedKey,removeVerifiedSessionKey){
  if(toolId!==FOCUS_ID)return;
  if(typeof removeVerifiedSessionKey!=='function')
    throw focusError('缺少可核验的专注会话清理能力','E_FOCUS_SESSION');
  await stopStayFocusForTool(api,toolId);
  await removeVerifiedKey(api,FOCUS_STORE);
  // Existing uninstall journal stays pending on a failed session readback.
  // Peer application data and shared Chrome permissions remain untouched.
  await removeVerifiedSessionKey(FOCUS_SESSION);
}
