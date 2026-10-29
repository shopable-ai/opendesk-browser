import {HistoryStore} from './history-store.mjs';
import {validateAlias} from './domain.mjs';
import {createCollector} from './collector.mjs';
import {probeCodexOAuth} from './codex-oauth.mjs';
import {probeCookieOnly} from './probe.mjs';

const fail = code => Object.assign(new Error(code), {code});
export function createAccountService({store = new HistoryStore(), accounts = [], requestImpl, clock = Date.now} = {}) {
  if (!Array.isArray(accounts) || accounts.length > 64) throw fail('E_SERVICE_CONFIG');
  const configured = new Map();
  let refreshQueue = Promise.resolve();
  for (const row of accounts) {
    if (!row || !validateAlias(row.alias) || configured.has(row.alias) ||
        !['CODEX_OAUTH', 'COOKIE_ONLY'].includes(row.mode) || typeof row.loadAuthorizedAccount !== 'function' ||
        typeof row.displayName !== 'string' || !row.displayName.trim() || row.displayName.trim() !== row.displayName ||
        row.displayName.length > 64 || /[\x00-\x1f\x7f]/.test(row.displayName)) throw fail('E_SERVICE_CONFIG');
    configured.set(row.alias, {...row});
  }
  let initialization;
  async function initialize() {
    if (!initialization) initialization = (async () => {
      const known = new Set((await store.accounts()).map(row => row.alias));
      for (const row of configured.values()) if (!known.has(row.alias))
        await store.register({alias: row.alias, displayName: row.displayName});
    })().catch(error => { initialization = undefined; throw error; });
    await initialization;
  }
  const collectors = new Map();
  for (const [alias, row] of configured) collectors.set(alias, createCollector({store, mode: row.mode, clock,
    loadAuthorizedAccount: async () => {
      const loaded = structuredClone(await row.loadAuthorizedAccount(alias));
      if (!loaded || loaded.alias !== alias || loaded.authorized !== true || !loaded.snapshot || !loaded.expectedIdentity)
        throw fail('E_AUTH_REQUIRED');
      const persisted = await store.accounts();
      const prior = persisted.find(account => account.alias === alias)?.identity;
      if (persisted.some(account => account.alias !== alias && account.identity?.userId === loaded.expectedIdentity.userId &&
          account.identity?.accountId === loaded.expectedIdentity.accountId)) throw fail('E_IDENTITY_DUPLICATE');
      for (const key of ['userId', 'accountId', 'email']) if (prior?.[key] != null) {
        const expected = loaded.expectedIdentity[key];
        const normalize = value => key === 'email' && typeof value === 'string' ? value.toLowerCase() : value;
        if (normalize(expected) !== normalize(prior[key])) throw fail('E_IDENTITY_BINDING');
      }
      return loaded;
    },
    probe: options => row.mode === 'CODEX_OAUTH'
      ? probeCodexOAuth({...options, clock, ...(requestImpl ? {requestImpl} : {})})
      : probeCookieOnly({...options, clock, ...(requestImpl ? {fetchImpl: requestImpl} : {})})
  }));
  async function query(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('E_QUERY');
    const {alias, aliases, operation = 'cache', limit = 100, windowKey = null} = input;
    if (!['cache', 'refresh', 'history'].includes(operation) || (alias !== undefined && aliases !== undefined)) throw fail('E_QUERY');
    const selected = alias !== undefined ? [alias] : aliases === undefined ? [...configured.keys()] : aliases;
    if (!Array.isArray(selected) || selected.length > 64 || selected.some(x => !validateAlias(x)) ||
        new Set(selected).size !== selected.length) throw fail('E_ACCOUNT_ALIASES');
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw fail('E_LIMIT');
    if (windowKey !== null && (typeof windowKey !== 'string' || !/^[A-Za-z0-9_-]{1,64}:(primary|secondary):\d{2,8}$/.test(windowKey))) throw fail('E_WINDOW_KEY');
    await initialize();
    const results = [];
    for (const name of selected) {
      if (!configured.has(name)) { results.push({alias: name, status: 'UNAVAILABLE', error: 'E_ACCOUNT_UNKNOWN'}); continue; }
      try {
        let account;
        if (operation === 'refresh') {
          const task = refreshQueue.then(() => collectors.get(name).refresh(name));
          refreshQueue = task.catch(() => {});
          account = await task;
        } else if (operation === 'cache') account = (await store.accounts()).find(row => row.alias === name);
        if (operation === 'history') results.push({alias: name, status: 'OK', history: await store.history(name, {limit, windowKey})});
        else {
          if (!account) throw fail('E_ACCOUNT_UNKNOWN');
          const status = operation === 'refresh' ? account.lastAttempt?.status ?? 'UNAVAILABLE' : 'OK';
          results.push({alias: name, status, ...(status === 'OK' ? {} : {error: 'E_REFRESH_FAILED'}), account});
        }
      } catch { results.push({alias: name, status: 'UNAVAILABLE', error: 'E_ACCOUNT_OPERATION'}); }
    }
    return {results};
  }
  return Object.freeze({initialize, query});
}
