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

function chromeRequest(value) {
  const request = {};
  for (const name of ['origins', 'permissions']) {
    if (value?.[name] === undefined) continue;
    if (!Array.isArray(value[name]) || value[name].some(item => typeof item !== 'string' || !item))
      throw fail('E_SCHEMA', 'Chrome 权限范围无效');
    const entries = [...new Set(value[name])].sort();
    if (entries.length) request[name] = entries;
  }
  if (!Object.keys(request).length) throw fail('E_SCHEMA', 'Chrome 权限范围不能为空');
  return request;
}

// Runtime is read-only. A missing grant must never turn Run/Preview/Verify into
// a permission prompt, even if Chrome would consider the click a user gesture.
export async function requireChromePermissions({api, request}) {
  if (await api.permissions.contains(chromeRequest(request)) !== true)
    throw fail('E_PERMISSION', '访问受限：请先在网站权限或脚本管理中点击「恢复访问」，再手动运行');
  return true;
}

// Ephemeral UI observation, not an authorization database. Prepare on selection
// or refresh; only a separate trusted Install/Restore click can request missing
// entries synchronously. Chrome and the program authority are checked again at
// admission. An observation invalidated by an event cannot issue a new prompt.
export function createChromePermissionConsent({api, onChange = () => {}}) {
  const observations = new Map();
  let generation = 0, disposed = false;
  const changed = () => { generation++; observations.clear(); if (!disposed) onChange(); };
  api.permissions.onAdded?.addListener(changed);
  api.permissions.onRemoved?.addListener(changed);
  async function prepare(value) {
    const request = chromeRequest(value), key = JSON.stringify(request), epoch = generation;
    const missing = {};
    // Check entries separately only in the installation UI, to request exactly
    // the missing subset instead of re-requesting an already approved scope.
    for (const name of ['origins', 'permissions']) {
      const entries = request[name] || [];
      const allowed = await Promise.all(entries.map(entry => api.permissions.contains({[name]: [entry]})));
      const denied = entries.filter((entry, i) => allowed[i] !== true);
      if (denied.length) missing[name] = denied;
    }
    if (disposed || epoch !== generation) return null;
    const state = Object.freeze({request, missing, granted: !Object.keys(missing).length});
    observations.set(key, state);
    return state;
  }
  function confirm(event, value) {
    if (!event?.isTrusted) return Promise.reject(fail('E_GESTURE', '请主动点击安装或恢复访问'));
    if (disposed) return Promise.reject(fail('E_HOST_CLOSED', '权限面板已关闭'));
    let request, state, pending;
    try {
      request = chromeRequest(value); state = observations.get(JSON.stringify(request));
      if (!state) throw fail('E_PERMISSION_CHECK_REQUIRED', '权限状态正在更新；请稍后再次点击安装或恢复访问');
      if (state.granted) return requireChromePermissions({api, request});
      pending = api.permissions.request(structuredClone(state.missing));
    } catch (error) { return Promise.reject(error); }
    return (async () => {
      if (await pending !== true) throw fail('E_PERMISSION', '未授予新增访问范围；原安装保持不变');
      if (disposed) throw fail('E_HOST_CLOSED', '权限面板已关闭');
      return requireChromePermissions({api, request});
    })();
  }
  return Object.freeze({prepare, confirm, dispose() {
    disposed = true; generation++; observations.clear();
    api.permissions.onAdded?.removeListener(changed);
    api.permissions.onRemoved?.removeListener(changed);
  }});
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
