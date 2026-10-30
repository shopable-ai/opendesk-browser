// Trusted-service-only collector. Authorized Cookie/OAuth snapshots are never persisted
// here and never accepted from browser HTTP endpoints.
import {probeCookieOnly} from './probe.mjs';
import {probeCodexOAuth} from './codex-oauth.mjs';
import {validateAlias} from './domain.mjs';

export function createCollector({store, loadAuthorizedAccount, mode = 'COOKIE_ONLY',
  probe = mode === 'CODEX_OAUTH' ? probeCodexOAuth : probeCookieOnly,
  clock = Date.now}={}) {
  if (!store || typeof store.record !== 'function' || typeof loadAuthorizedAccount !== 'function' ||
      !['COOKIE_ONLY','CODEX_OAUTH'].includes(mode) || typeof probe !== 'function')
    throw new Error('E_COLLECTOR_CONFIGURATION');
  let serial = Promise.resolve();
  return Object.freeze({
    refresh(alias) {
      if (!validateAlias(alias)) return Promise.reject(new Error('E_ACCOUNT_ALIAS'));
      const task=serial.then(async()=>{
        let attempt;
        try {
          const account=await loadAuthorizedAccount(alias);
          if (!account || account.alias !== alias || account.authorized !== true ||
              !account.snapshot || !account.expectedIdentity)
            throw new Error('E_AUTH_REQUIRED');
          attempt=await probe({snapshot:account.snapshot,expectedIdentity:account.expectedIdentity});
          if (attempt?.mode !== mode) throw new Error('E_PROBE_MODE');
        } catch(error) {
          // An aborted or denied credential handoff must not become an HTTP request.
          const binding=['E_IDENTITY_BINDING','E_IDENTITY_DUPLICATE'].includes(error?.code);
          attempt={mode,status:binding?'IDENTITY_UNVERIFIED':error?.message==='E_AUTH_REQUIRED'?'AUTH_REQUIRED':'UNAVAILABLE',
            reason:binding?(error.code==='E_IDENTITY_BINDING'?'ACCOUNT_BINDING_CHANGED':'DUPLICATE_ACCOUNT_BINDING'):
              error?.message==='E_AUTH_REQUIRED'?'TRUSTED_ACCOUNT_AUTH_REQUIRED':'TRUSTED_PROVIDER_ERROR',
            checkedAt:new Date(clock()).toISOString()};
        }
        await store.record(alias,attempt);
        return {alias,...(await store.accounts()).find(row=>row.alias===alias)};
      });
      serial=task.catch(()=>{});
      return task;
    }
  });
}
