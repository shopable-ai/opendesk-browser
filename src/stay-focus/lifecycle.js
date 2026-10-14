// Fixed product adapter, invoked inside the existing installation transaction.
// The caller holds tool/catalog locks and checks absence before uninstall cleanup.
import {FOCUS_ID,FOCUS_STORE} from './policy.js';
import {clearFocusRules} from './rule-ownership.js';

export async function stopStayFocusForTool(api,toolId){
  if(toolId===FOCUS_ID&&await api.permissions.contains({permissions:['declarativeNetRequestWithHostAccess']}))
    await clearFocusRules(api);
}
export async function cleanupUninstalledStayFocus(api,toolId,removeVerifiedKey){
  if(toolId!==FOCUS_ID)return;
  await stopStayFocusForTool(api,toolId);
  await removeVerifiedKey(api,FOCUS_STORE);
}
