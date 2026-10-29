export const time = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN') : '未知';
export function duration(seconds) {
  if (!Number.isFinite(seconds)) return '未知窗口';
  return seconds % 86400 === 0 ? `${seconds / 86400} 天` : seconds % 3600 === 0 ? `${seconds / 3600} 小时` : `${seconds / 60} 分钟`;
}
export function sampleStale(account, window, now = Date.now()) {
  const observed = Date.parse(window.observedAt), reset = Date.parse(window.resetsAt);
  return account.lastAttempt?.status !== 'OK' || !Number.isFinite(observed) ||
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
export function createApi(fetcher = globalThis.fetch) {
  async function request(path, method = 'GET') {
    let response;
    try { response = await fetcher(path, {method, credentials:'same-origin', cache:'no-store', redirect:'error',
      headers:{Accept:'application/json', ...(method === 'POST' ? {'Content-Type':'application/json'} : {})},
      ...(method === 'POST' ? {body:'{}'} : {})}); }
    catch { throw new Error('无法连接本地服务。请检查服务后手动重试。'); }
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403
      ? '请从本机启动终端的连接链接打开' : '请求失败，未自动重试。');
    try { return await response.json(); } catch { throw new Error('服务返回格式无效。'); }
  }
  const path = alias => `/api/v1/accounts/${encodeURIComponent(alias)}`;
  return {
    accounts: async () => { const data = await request('/api/v1/accounts'); if (!Array.isArray(data.accounts)) throw new Error('账号列表格式无效。'); return data.accounts; },
    history: async alias => { const data = await request(`${path(alias)}/history?limit=20`); if (!Array.isArray(data.observations) || !Array.isArray(data.rollovers)) throw new Error('历史格式无效。'); return data; },
    refresh: async alias => { const data = await request(`${path(alias)}/refresh`, 'POST'); if (!data.account || data.account.alias !== alias) throw new Error('刷新结果身份不匹配。'); return data.account; }
  };
}
