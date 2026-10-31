export const time = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN') : '未知';
export function duration(seconds) {
  if (!Number.isFinite(seconds)) return '未知窗口';
  return seconds % 86400 === 0 ? `${seconds / 86400} 天` : seconds % 3600 === 0 ? `${seconds / 3600} 小时` : `${seconds / 60} 分钟`;
}
export function sampleStale(account, window, now = Date.now()) {
  const observed = Date.parse(window.observedAt), reset = Date.parse(window.resetsAt);
  return !Number.isFinite(observed) ||
    now - observed > 15 * 60_000 || !Number.isFinite(reset) || reset <= now;
}
export function accountStale(account, now = Date.now()) {
  return !account.windows?.length || account.windows.some(window => sampleStale(account, window, now));
}
export function matches(account, query) {
  return [account.alias, account.displayName, account.identity?.email, account.identity?.displayName,
    account.identity?.accountId, account.identity?.userId].some(value => String(value ?? '').toLowerCase().includes(query.trim().toLowerCase()));
}
// Only these same-origin endpoints are exposed. Browser-managed HttpOnly session only.
// Public UI errors never interpolate server bodies or provider diagnostics.
const refreshMessage = (http, status) => {
  if (http === 401 || http === 403) return '本机管理会话无效，请使用启动终端给出的连接链接重新进入。';
  if (http === 409) return '已有账号查询正在执行，请结束后手动重试。';
  if (http === 429 || status === 'RATE_LIMITED') return '上游额度查询受到速率限制；未自动重试，旧缓存和历史仍保留。';
  if (status === 'AUTH_REQUIRED') return '该账号授权不可用，请在本机核实授权后手动重试。';
  if (status === 'IDENTITY_UNVERIFIED') return '账号身份无法核实；未采用本次额度响应。';
  if (status === 'SCHEMA_UNKNOWN') return '额度响应格式未识别；未覆盖上次有效数据。';
  if (http === 404) return '该账号已不在本机授权配置中。';
  if (http === 504) return '本机查询超时；未自动重试。';
  return '本次额度查询失败；未自动重试，旧缓存和历史仍保留。';
};
export function createApi(fetcher = globalThis.fetch) {
  async function request(path, method = 'GET', acceptFailure = false) {
    let response;
    try { response = await fetcher(path, {method, credentials:'same-origin', cache:'no-store', redirect:'error',
      headers:{Accept:'application/json', ...(method === 'POST' ? {'Content-Type':'application/json'} : {})},
      ...(method === 'POST' ? {body:'{}'} : {})}); }
    catch { throw new Error('无法连接本地服务。请检查服务后手动重试。'); }
    if (!response.ok && !acceptFailure) throw new Error(response.status === 401 || response.status === 403
      ? '请从本机启动终端的连接链接打开' : '请求失败，未自动重试。');
    let data;
    try { data = await response.json(); }
    catch {
      if (!response.ok && acceptFailure) data = {};
      else throw new Error('服务返回格式无效。');
    }
    return acceptFailure ? {ok:response.ok,httpStatus:response.status,data} : data;
  }
  const path = alias => `/api/v1/accounts/${encodeURIComponent(alias)}`;
  const checkedAccount = (value,alias) => {
    if (!value?.account || value.account.alias !== alias) throw new Error('账号读回身份不匹配。');
    return value.account;
  };
  return {
    accounts: async () => { const data = await request('/api/v1/accounts'); if (!Array.isArray(data.accounts)) throw new Error('账号列表格式无效。'); return data.accounts; },
    account: async alias => checkedAccount(await request(path(alias)),alias),
    history: async (alias,{limit=20,windowKey=null}={}) => { const query = new URLSearchParams({limit:String(limit)}); if (windowKey !== null) query.set('windowKey',windowKey); const data = await request(`${path(alias)}/history?${query}`); if (!Array.isArray(data.observations) || !Array.isArray(data.rollovers)) throw new Error('历史格式无效。'); return data; },
    refresh: async alias => {
      const {ok,httpStatus,data} = await request(`${path(alias)}/refresh`, 'POST', true);
      // A 200 transport response is not proof of a verified usage observation.
      if (data?.account && data.account.alias !== alias) throw new Error('刷新结果身份不匹配。');
      const attempt = data?.account?.lastAttempt?.status;
      if (!ok || data?.status !== 'OK' || attempt !== 'OK') {
        const status = data?.status && data.status !== 'OK' ? data.status : attempt;
        const error = new Error(refreshMessage(httpStatus,status));
        // Server returns only the sanitized, persisted account profile on failure.
        // The UI may update lastAttempt while retaining previous quota/history.
        if (data?.account && attempt && attempt !== 'OK') error.account = data.account;
        throw error;
      }
      return checkedAccount(data,alias);
    }
  };
}
