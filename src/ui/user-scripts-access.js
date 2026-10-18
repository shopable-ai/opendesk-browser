import {readNativeUserScripts} from '../scripting/user-scripts/native-access.js';

// Read-only UI probe. It is not a grant, an execution receipt, or a promise
// that a later operation will still be authorized. The native driver remains authoritative.
export const USER_SCRIPTS_RECOVERY_GUIDE =
  '在 Chrome 的「扩展程序 → 管理扩展程序 → OpenDesk Browser → 详情」中开启「允许用户脚本」（Chrome 138+），返回后重新检测并主动重新运行。浏览器不允许扩展替你开启此开关。';

export async function inspectUserScriptsAccess(api) {
  try { await readNativeUserScripts(api); return true; }
  catch (error) {
    if (error.code === 'E_USER_SCRIPTS_UNAVAILABLE') return false;
    throw error;
  }
}

// Only an actual Chrome extension ID may be inserted into this internal URL.
export function userScriptsSettingsURL(api) {
  const id = api?.runtime?.id;
  return typeof id === 'string' && /^[a-p]{32}$/.test(id)
    ? `chrome://extensions/?id=${id}`
    : null;
}
