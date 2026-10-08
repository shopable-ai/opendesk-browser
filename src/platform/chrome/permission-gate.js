// Chrome permission declarations are explicit; there is no "all API permissions" wildcard.
// Mirror this catalog in manifest.json. verifyManifest enforces their exact parity.
export const REQUIRED_BROWSER_API_PERMISSIONS = Object.freeze([
  "storage",
  "scripting",
  "sidePanel",
  "activeTab",
  "downloads",
  "tabs",
  "webNavigation",
  "userScripts",
  "cookies",
  "notifications"
]);
export const OPTIONAL_PLUGIN_API_PERMISSIONS = Object.freeze([
  "bookmarks",
  "history",
  "contextMenus",
  "clipboardRead",
  "clipboardWrite",
  "tabGroups",
  "webRequest",
  "declarativeNetRequestWithHostAccess",
  "nativeMessaging"
]);
export const REQUIRED_HOST_PATTERNS = Object.freeze(['<all_urls>']);

const optionalSet = new Set(OPTIONAL_PLUGIN_API_PERMISSIONS);
function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

// Only declared optional browser APIs are requestable. This does not create an
// OpenDesk task grant or expose the chrome object to an untrusted page script.
export function optionalPluginPermissionRequest(permissions) {
  if (!Array.isArray(permissions) || !permissions.length ||
      permissions.length > OPTIONAL_PLUGIN_API_PERMISSIONS.length ||
      permissions.some(name => typeof name !== 'string' || !optionalSet.has(name)) ||
      new Set(permissions).size !== permissions.length)
    throw fail('E_SCHEMA', '插件请求了未声明、重复或无效的 Chrome API 权限');
  return {permissions: [...permissions]};
}

export async function hasOptionalPluginPermissions({api, permissions}) {
  const request = optionalPluginPermissionRequest(permissions);
  return (await api.permissions.contains(request)) === true;
}

// Call directly from a trusted extension UI click, BEFORE the first await.
// Never call this from a service worker or silently during task execution.
export function requestOptionalPluginPermissions({api, event, permissions}) {
  if (!event?.isTrusted) return Promise.reject(fail('E_GESTURE', '额外浏览器权限必须由用户点击申请'));
  let request, pending;
  try {
    request = optionalPluginPermissionRequest(permissions);
    pending = api.permissions.request(request);
  } catch (cause) {
    return Promise.reject(cause);
  }
  return (async () => {
    if (await pending !== true)
      throw fail('E_PERMISSION', '用户未授予额外浏览器权限');
    if (await api.permissions.contains(request) !== true)
      throw fail('E_PERMISSION', '浏览器权限状态已变化，未能确认授权');
    return Object.freeze({permissions: Object.freeze([...request.permissions])});
  })();
}

export async function requireOptionalPluginPermissions({api, permissions}) {
  if (!await hasOptionalPluginPermissions({api, permissions}))
    throw fail('E_PERMISSION', '插件所需的 Chrome API 权限未获授权或已撤销');
  return true;
}
