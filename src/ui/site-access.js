import {REQUIRED_HOST_PATTERNS} from '../platform/chrome/permission-gate.js';

// Chrome owns durable grants. Never store a boolean "approved" substitute:
// it would survive revocation or a fresh browser test profile incorrectly.
export const ALL_WEB_ORIGINS = REQUIRED_HOST_PATTERNS;

function error(code, message) {
  const value = new Error(message);
  value.code = code;
  return value;
}

export function siteAccessPermissionRequest() {
  // Required hosts can be re-requested only if Chrome has withheld access.
  return {origins: [...ALL_WEB_ORIGINS]};
}

export function siteAccessSatisfies(state) {
  return state?.websites === true && state.cookies === true && state.notifications === true;
}

// This controller changes only native Chrome permission state. It does NOT
// authorize a JavaScript task or grant a page the independent OpenDesk SDK.
export function createSiteAccess({api, onState = () => {}}) {
  let disposed = false, busy = false, sequence = 0, snapshot = null;
  let last = {phase: 'checking', message: '正在读取 Chrome 网站权限', snapshot, busy};
  const publish = (phase, message) => {
    last = {phase, message, snapshot, busy};
    if (!disposed) onState(last);
  };

  async function readNativePermissions() {
    const [websites, cookies, notifications] = await Promise.all([
      api.permissions.contains({origins: [...ALL_WEB_ORIGINS]}),
      api.permissions.contains({permissions: ['cookies']}),
      api.permissions.contains({permissions: ['notifications']})
    ]);
    return Object.freeze({websites: websites === true, cookies: cookies === true,
      notifications: notifications === true});
  }

  async function refresh() {
    if (disposed) throw error('E_HOST_CLOSED', '授权面板已关闭');
    const token = ++sequence;
    try {
      const actual = await readNativePermissions();
      if (disposed || token !== sequence) return null;
      snapshot = actual;
      publish(siteAccessSatisfies(snapshot) ? 'granted' : 'limited', snapshot.websites
        ? (siteAccessSatisfies(snapshot)
          ? 'Chrome 已授予默认全网站和核心 API 权限'
          : '全网站权限可用，但核心 API 权限不完整；请检查扩展的权限设置')
        : 'Chrome 已限制网站访问；可点击恢复或在扩展详情中选择所有网站');
      return snapshot;
    } catch (cause) {
      if (!disposed && token === sequence) {
        snapshot = null;
        publish('error', `无法读取 Chrome 权限：${cause.message || cause}`);
      }
      throw cause;
    }
  }

  function grant(event) {
    if (!event?.isTrusted) return Promise.reject(error('E_GESTURE', '必须由真实用户点击授权'));
    if (disposed) return Promise.reject(error('E_HOST_CLOSED', '授权面板已关闭'));
    if (busy) return Promise.reject(error('E_BUSY', '授权申请正在处理中'));
    if (!snapshot) return Promise.reject(error('E_PERMISSION_CHECK_REQUIRED', '正在读取权限，请稍后点击恢复访问'));
    if (snapshot.websites) return refresh();
    let request, pending;
    try {
      request = siteAccessPermissionRequest();
      busy = true;
      publish('requesting', '正在请求 Chrome 恢复全部网站访问；尚未确认授权');
      // Must be invoked synchronously inside the trusted click, without an
      // await/contains/IPC beforehand, or Chrome may lose the user gesture.
      pending = api.permissions.request(request);
    } catch (cause) {
      busy = false;
      publish('error', `无法申请权限：${cause.message || cause}`);
      return Promise.reject(cause);
    }
    return (async () => {
      try {
        if (await pending !== true)
          throw error('E_PERMISSION', 'Chrome 未授予所选权限；既有授权仍以浏览器状态为准');
        // onAdded may race with a UI refresh: verify native state independently
        // rather than treating a superseded UI refresh as a denied grant.
        const actual = await readNativePermissions();
        if (!actual.websites)
          throw error('E_PERMISSION', 'Chrome 权限状态与申请不一致；请检查扩展的网站访问设置');
        await refresh();
        return actual;
      } catch (cause) {
        try { await refresh(); } catch { /* Preserve the original failure. */ }
        publish('denied', `${cause.code || 'E_PERMISSION'}：${cause.message || cause}`);
        throw cause;
      } finally {
        busy = false;
        if (!disposed) publish(last.phase, last.message);
      }
    })();
  }

  const changed = () => {
    // The browser event, not a local setting, invalidates our observed state.
    snapshot = null;
    publish('checking', 'Chrome 权限已变化，正在重新读取');
    void refresh().catch(() => {});
  };
  api.permissions.onAdded?.addListener(changed);
  api.permissions.onRemoved?.addListener(changed);

  return Object.freeze({
    grant, refresh,
    get snapshot() { return snapshot; },
    dispose() {
      if (disposed) return;
      disposed = true; sequence++;
      api.permissions.onAdded?.removeListener(changed);
      api.permissions.onRemoved?.removeListener(changed);
    }
  });
}
