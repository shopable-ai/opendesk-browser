// Read-only UI probe. It is not a grant, an execution receipt, or a promise
// that a later operation will still be authorized. The native driver remains authoritative.
export const USER_SCRIPTS_RECOVERY_GUIDE =
  '在 Chrome 的「扩展程序 → 管理扩展程序 → OpenDesk Browser → 详情」中开启「允许用户脚本」（Chrome 138+），返回后重新检测并主动重新运行。浏览器不允许扩展替你开启此开关。';

export async function inspectUserScriptsAccess(api) {
  const scripts = api?.userScripts;
  if (typeof scripts?.getScripts !== 'function' || typeof scripts?.execute !== 'function') return false;
  try {
    return Array.isArray(await scripts.getScripts());
  } catch {
    return false;
  }
}

// Only an actual Chrome extension ID may be inserted into this internal URL.
export function userScriptsSettingsURL(api) {
  const id = api?.runtime?.id;
  return typeof id === 'string' && /^[a-p]{32}$/.test(id)
    ? `chrome://extensions/?id=${id}`
    : null;
}
