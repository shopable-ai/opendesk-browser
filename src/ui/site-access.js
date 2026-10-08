// Chrome owns durable grants. Never store a boolean "approved" substitute:
// it would survive revocation or a fresh browser test profile incorrectly.
export const ALL_WEB_ORIGINS = Object.freeze(['http://*/*', 'https://*/*']);

function error(code, message) {
  const value = new Error(message);
  value.code = code;
  return value;
}

export function siteAccessPermissionRequest({cookies = false, notifications = false} = {}) {
  if (typeof cookies !== 'boolean' || typeof notifications !== 'boolean')
    throw error('E_SCHEMA', '可选浏览器权限必须明确选择');
  const permissions = [
    ...(cookies ? ['cookies'] : []),
    ...(notifications ? ['notifications'] : [])
  ];
  return {origins: [...ALL_WEB_ORIGINS], ...(permissions.length ? {permissions} : {})};
}

export function siteAccessSatisfies(state, options = {}) {
  if (!state) return false;
  return state.websites === true &&
    (!options.cookies || state.cookies === true) &&
    (!options.notifications || state.notifications === true);
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

  async function refresh() {
    if (disposed) throw error('E_HOST_CLOSED', '授权面板已关闭');
    const token = ++sequence;
    try {
      const [websites, cookies, notifications] = await Promise.all([
        api.permissions.contains({origins: [...ALL_WEB_ORIGINS]}),
        api.permissions.contains({permissions: ['cookies']}),
        api.permissions.contains({permissions: ['notifications']})
      ]);
      if (disposed || token !== sequence) return null;
      snapshot = Object.freeze({websites: websites === true, cookies: cookies === true,
        notifications: notifications === true});
      publish(snapshot.websites ? 'granted' : 'limited', snapshot.websites
        ? '已授权全部 HTTP/HTTPS 网站；Chrome 会在后续运行中复用授权'
        : '尚未集中授权；运行其他网站可能需要单独批准');
      return snapshot;
    } catch (cause) {
      if (!disposed && token === sequence) {
        snapshot = null;
        publish('error', `无法读取 Chrome 权限：${cause.message || cause}`);
      }
      throw cause;
    }
  }

  function grant(event, options = {}) {
    if (!event?.isTrusted) return Promise.reject(error('E_GESTURE', '必须由真实用户点击授权'));
    if (disposed) return Promise.reject(error('E_HOST_CLOSED', '授权面板已关闭'));
    if (busy) return Promise.reject(error('E_BUSY', '授权申请正在处理中'));
    let request, pending;
    try {
      request = siteAccessPermissionRequest(options);
      busy = true;
      publish('requesting', '等待 Chrome 确认所选权限；尚未完成授权');
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
        const actual = await refresh();
        if (!siteAccessSatisfies(actual, options))
          throw error('E_PERMISSION', 'Chrome 权限状态与申请不一致；请检查扩展的网站访问设置');
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
