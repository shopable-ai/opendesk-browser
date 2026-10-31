import { endpointFrom, exportShare, localClientFrom, migrateV1, profileFrom, ruleFrom, sourceFrom, validateConfig } from './domain/config';
import { errorCodeOf } from './domain/error-codes';
import type { ConfigState, RuleTarget, ViewState } from './domain/types';
import type { Request, Response } from './domain/messages';
import { defaultFavorites, safePublicDomain, siteForDomain } from './diagnostics/catalog';
import { MAX_FAVORITES } from './diagnostics/favorites';
import type { DiagnosticsSnapshot } from './diagnostics/types';
import type { UsageSnapshot } from './usage/types';

/** Adapter owns native confirmation and permissions; the service never retries Enable. */
export interface ManagedStatus {
  state: 'enabled' | 'disabled' | 'unavailable' | 'conflict';
  canStop: boolean;
  control: ViewState['runtime']['control'];
  reason: string | null;
  statusErrorCode?: string;
  permission?: boolean | null;
}
export interface ProxyServiceOptions {
  load(): Promise<{ config: ConfigState; etag: string }>;
  /** Return the confirmed new ETag (or {etag}); otherwise the service reloads. */
  save(config: ConfigState, etag: string): Promise<unknown>;
  status(): Promise<ManagedStatus>;
  apply(config: ConfigState): Promise<ManagedStatus>;
  stop(): Promise<ManagedStatus>;
  preview?: boolean;
}
export type ServiceState = ViewState & {
  runtime: ViewState['runtime'] & { state: ManagedStatus['state']; canStop: boolean; reason: string | null; statusErrorCode?: string; permission?: boolean | null; outcomeUnknown: boolean; stopFinalizationPending: boolean; preview: boolean };
};
export type ServiceResponse =
  | (Omit<Extract<Response, { ok: true }>, 'diagnostics'> & { state: ServiceState; preview: boolean; diagnostics?: DiagnosticsSnapshot & { preview: true; generation: number } })
  | { ok: false; error: string; errorCode: string; code?: string };
// Diagnostic syntax is not evidence that an operation had no side effect.
const isStatusCode = (value: unknown): value is string => typeof value === 'string' &&
  /^E_[A-Z0-9_]{1,60}$/.test(value) && value.trim() === value;
const safeStatusCode = (value: unknown) => isStatusCode(value) ? value : 'E_OUTCOME_UNKNOWN';
function statusRefusal(value: ManagedStatus) {
  return value.statusErrorCode ?? (value.permission === false ? 'E_PERMISSION_DENIED' : undefined);
}
const clone = <T>(value: T): T => structuredClone(value);
function fail(code: string, detail: string): never { throw Object.assign(new Error(detail), { code }); }
function upsert<T extends { id: string }>(rows: T[], record: T): T[] {
  return rows.some(row => row.id === record.id) ? rows.map(row => row.id === record.id ? record : row) : [...rows, record];
}

/** Only inputs used by the selected route; metadata and unused drafts are excluded. */
function routeSignature(config: ConfigState): string {
  const endpoint = (id: string | undefined) => {
    const value = config.endpoints.find(row => row.id === id);
    return value ? [value.scheme, value.host, value.port, value.credentialRef ?? null] : null;
  };
  const target = (value: RuleTarget) => value.action === 'direct' ? ['direct'] : ['endpoint', endpoint(value.endpointId)];
  const mode = config.selection.mode;
  if (mode === 'profile') {
    const profile = config.profiles.find(row => row.id === config.selection.profileId);
    return JSON.stringify([mode, profile?.kind,
      profile?.kind === 'endpoint' ? endpoint(profile.endpointId) : profile?.pacText]);
  }
  if (mode === 'rules') {
    const rules = config.rules.filter(rule => rule.enabled)
      .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
      .map(rule => [rule.domain, rule.includeSubdomains, target(rule)]);
    return JSON.stringify([mode, rules, target(config.defaultTarget)]);
  }
  return JSON.stringify([mode]);
}

export function createProxyService({ load, save, status, apply, stop, preview = false }: ProxyServiceOptions) {
  let config: ConfigState;
  let etag: string;
  let active: ConfigState | null = null;
  let actual: ManagedStatus = { state: 'unavailable', canStop: false, control: 'unknown', reason: 'Status not connected' };
  let unknown = false;
  // A confirmed release may still need storage-only finalization in this session.
  let stopFinalizationPending = false;
  let latestError: string | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let revision = 0;
  let generation = 0;
  let lastNotification = '';
  let disposed = false;
  const listeners = new Set<Function>();
  let diagnostics: DiagnosticsSnapshot = {
    configRevision: 'preview:0', favorites: defaultFavorites(), observations: [], statistics: {}, activeRun: null
  };
  let usage: UsageSnapshot = {
    settings: { enabled: false, enabledAt: null, topLimit: 5, sort: 'smart', ignored: [] },
    permissionGranted: false, sites: [], retentionDays: 30, maxSites: 200
  };
  function assertLive() { if (disposed) fail('E_TOOL_CHANGED', 'AI Proxy session closed; do not replay'); }
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = () => { assertLive(); return task(); };
    const next = queue.then(run, run);
    queue = next.then(() => undefined, () => undefined);
    return next;
  }
  function invalidate() {
    generation++;
    diagnostics.activeRun = null;
    diagnostics.configRevision = `preview:${++revision}`;
    diagnostics.observations = [];
    diagnostics.statistics = {};
  }
  async function read() {
    assertLive();
    const loaded = await load();
    assertLive();
    const next = validateConfig(loaded.config);
    if (typeof loaded.etag !== 'string' || !loaded.etag) fail('E_OUTCOME_UNKNOWN', 'Storage read was not confirmed');
    if (config && JSON.stringify(config) !== JSON.stringify(next)) invalidate();
    config = clone(next); etag = loaded.etag;
  }
  async function persist(next: ConfigState) {
    assertLive();
    const checked = validateConfig(next);
    // Drop the old ETag before awaiting a write; an unknown write is never replayed.
    const prior = etag; etag = '';
    const receipt = await save(clone(checked), prior);
    assertLive();
    const nextEtag = typeof receipt === 'string' ? receipt : receipt && typeof receipt === 'object' && 'etag' in receipt ? receipt.etag : undefined;
    if (typeof nextEtag === 'string' && nextEtag) { config = clone(checked); etag = nextEtag; }
    else await read();
    assertLive();
    invalidate();
  }
  async function edit(change: (state: ConfigState) => ConfigState): Promise<void> {
    await read();
    await persist(change(clone(config)));
  }
  function confirmedDisabled(value: ManagedStatus) {
    return value.state === 'disabled' && value.canStop === false &&
      value.control === 'controllable_by_this_extension' && !value.statusErrorCode && value.permission !== false;
  }
  function observe(value: ManagedStatus) {
    assertLive();
    if (!value || !['enabled', 'disabled', 'unavailable', 'conflict'].includes(value.state) ||
        typeof value.canStop !== 'boolean' || !['unknown', 'not_controllable', 'controlled_by_other_extensions',
          'controllable_by_this_extension', 'controlled_by_this_extension'].includes(value.control) ||
        (value.permission !== undefined && value.permission !== null && typeof value.permission !== 'boolean') ||
        (value.statusErrorCode !== undefined && !isStatusCode(value.statusErrorCode))) {
      unknown = true;
      fail('E_OUTCOME_UNKNOWN', 'Managed status was not confirmed');
    }
    // Copy only public status fields; adapter extras must not enter service state.
    actual = { state: value.state, canStop: value.canStop && !['not_controllable', 'controlled_by_other_extensions'].includes(value.control), control: value.control,
      reason: typeof value.reason === 'string' ? value.reason : null,
      ...(value.permission !== undefined ? { permission: value.permission } : {}),
      ...(value.statusErrorCode !== undefined ? { statusErrorCode: value.statusErrorCode } : {}) };
    // A newly observed own route supersedes the historical release receipt.
    if (actual.control === 'controlled_by_this_extension' && (actual.state === 'enabled' || actual.canStop))
      stopFinalizationPending = false;
    if (confirmedDisabled(value)) { unknown = false; active = null; latestError = null; }
    else if (value.statusErrorCode || value.permission === false || value.control === 'unknown' || (value.state === 'unavailable' && value.canStop)) unknown = true;
  }
  async function refresh() {
    assertLive();
    try { observe(await status()); }
    catch (error) {
      assertLive();
      unknown = true;
      const code = safeStatusCode(error && typeof error === 'object' && 'code' in error ? error.code : undefined);
      actual = { state: 'unavailable', canStop: actual.canStop, control: 'unknown',
        reason: 'Status unavailable; do not replay Apply', statusErrorCode: code,
        ...(actual.permission !== undefined ? { permission: actual.permission } : {}) };
      fail(code, 'Managed status unavailable; do not replay Apply');
    }
  }
  function view(): ServiceState {
    const applied = actual.state === 'enabled' && actual.control === 'controlled_by_this_extension' && !!active && !unknown && !actual.statusErrorCode && actual.permission !== false;
    return clone({ config, runtime: {
      desired: config.selection, ...(active ? { activeSelection: active.selection } : {}),
      managedIntent: config.managed,
      browserMode: active && actual.state === 'enabled' ? active.selection.mode : null,
      applied,
      pendingChanges: !applied || !active || routeSignature(active) !== routeSignature(config),
      proxyError: latestError ?? actual.reason, probe: null, credentialRequired: false,
      ...actual, outcomeUnknown: unknown, stopFinalizationPending, preview
    } });
  }
  function notify() {
    if (disposed || !config) return;
    const signature = JSON.stringify({ state: view(), diagnostics, usage });
    if (signature === lastNotification) return;
    lastNotification = signature;
    for (const listener of listeners) { try { listener(view()); } catch { /* A UI listener cannot fail a committed operation. */ } }
  }
  function previewOnly() { if (!preview) fail('E_NOT_CONNECTED', 'E_NOT_CONNECTED: this capability has no connected runtime'); }

  async function dispatch(message: Request): Promise<ServiceResponse> {
    if (message.type === 'STOP') {
      assertLive();
      if (stopFinalizationPending) {
        // Refresh observation only: a config retry must never replay Disable.
        // Status failure remains unknown but does not prevent storage cleanup.
        try { await refresh(); } catch { assertLive(); }
        if (!stopFinalizationPending)
          fail('E_CONTROL_HELD', 'Own proxy control changed; confirm a new STOP before release');
      } else {
        // Only a previously observed own capability permits release, even offline.
        if (!actual.canStop) fail('E_CONTROL_HELD', 'No confirmed own proxy control to stop');
        invalidate();
        try { observe(await stop()); }
        catch (error) { assertLive(); unknown = true; throw error; }
        const refusal = statusRefusal(actual);
        if (refusal) { unknown = true; fail(refusal, 'Managed proxy stop refused'); }
        if (!confirmedDisabled(actual)) { unknown = true; fail('E_OUTCOME_UNKNOWN', 'STOP did not confirm disabled status'); }
        stopFinalizationPending = true;
      }
      await read();
      if (config.managed) await persist({ ...config, managed: false });
      if (config.managed) fail('E_OUTCOME_UNKNOWN', 'STOP configuration finalization was not confirmed');
      stopFinalizationPending = false;
      latestError = null;
      return { ok: true, state: view(), preview };
    }
    await read();
    assertLive();
    if (message.type === 'GET_STATE' || message.type === 'APPLY' ||
        message.type === 'IMPORT' || message.type === 'DELETE_ENDPOINT' || message.type === 'DELETE_PROFILE') {
      try { await refresh(); }
      catch (error) { assertLive(); if (message.type !== 'GET_STATE') throw error; }
      assertLive();
    }
    if (['DELETE_ENDPOINT', 'DELETE_PROFILE', 'IMPORT'].includes(message.type) &&
        (unknown || actual.canStop || actual.state === 'enabled'))
      fail('E_CONTROL_HELD', '请先停止管理，再删除或导入代理配置');
    switch (message.type) {
      case 'GET_STATE': break;
      case 'SAVE_LOCAL_CLIENT': {
        await edit(c => {
          const client = localClientFrom(message.client);
          const sourceId = 'local-' + client.id;
          const oldEndpoint = c.endpoints.find(e => e.id === client.id);
          const oldSource = c.sources.find(s => s.id === sourceId);
          if ((oldEndpoint && oldEndpoint.sourceId !== sourceId) ||
            (oldSource && oldSource.kind !== 'local-client'))
            throw new Error('本地入口 ID 与已有配置冲突');
          const profileId = 'profile-' + client.id;
          const oldProfile = c.profiles.find(p => p.id === profileId);
          if (oldProfile && (oldProfile.kind !== 'endpoint' || oldProfile.endpointId !== client.id))
            throw new Error('本地入口配置 ID 与已有配置冲突');
          const source = sourceFrom({ id:sourceId, kind:'local-client',
            displayName:client.name, trustedByUser:true });
          const endpoint = endpointFrom({ id:client.id, name:client.name,
            scheme:client.scheme, host:'127.0.0.1', port:client.port, sourceId });
          c.sources = upsert(c.sources, source);
          c.endpoints = upsert(c.endpoints, endpoint);
          c.profiles = upsert(c.profiles, { id:profileId, name:client.name,
            kind:'endpoint', endpointId:client.id, sourceId });
          return c;
        });
        break;
      }
      case 'SAVE_SUBSCRIPTION': {
        await edit(c => {
          const source = sourceFrom(message.source);
          if (source.kind !== 'subscription') throw new Error('需要第三方订阅来源');
          const old = c.sources.find(s => s.id === source.id);
          if (old && old.kind !== 'subscription') throw new Error('来源 ID 与现有配置冲突');
          if (!old && c.sources.filter(s => s.kind === 'subscription').length >= 40)
            throw new Error('最多保存 40 个未同步订阅来源');
          c.sources = upsert(c.sources, source);
          return c;
        });
        break;
      }
      case 'DELETE_SUBSCRIPTION':
        await edit(c => {
          const source = c.sources.find(s => s.id === message.id);
          if (!source || source.kind !== 'subscription') throw new Error('订阅来源不存在');
          if (c.endpoints.some(e => e.sourceId === source.id) ||
              c.profiles.some(p => p.sourceId === source.id))
            throw new Error('请先解除订阅来源的所有配置引用');
          c.sources = c.sources.filter(s => s.id !== source.id);
          return c;
        });
        break;
      case 'SAVE_ENDPOINT': {
        await edit(c => {
          const e = endpointFrom(message.endpoint);
          const old = c.endpoints.find(row => row.id === e.id);
          if (c.sources.some(source => (source.id === e.sourceId || source.id === old?.sourceId) && source.kind === 'local-client'))
            throw new Error('本地客户端入口请在第三方订阅页面编辑');
          // Session references are bound to an exact proxy authority.
          if (old?.credentialRef && (old.host !== e.host || old.port !== e.port || old.scheme !== e.scheme)) delete e.credentialRef;
          c.endpoints = upsert(c.endpoints, e);
          c.profiles = c.profiles.map(p => p.kind === 'endpoint' && p.id === 'profile-' + e.id && p.endpointId === e.id ? { ...p, name: e.name } : p);
          return c;
        });
        break;
      }
      case 'DELETE_ENDPOINT':
        await edit(c => {
          if (c.managed) throw new Error('请先停止管理，再删除代理配置');
          if (c.profiles.some(p => p.kind === 'endpoint' && p.endpointId === message.id &&
              p.id !== 'profile-' + message.id) ||
            c.rules.some(r => r.action === 'endpoint' && r.endpointId === message.id) ||
            (c.defaultTarget.action === 'endpoint' && c.defaultTarget.endpointId === message.id))
            throw new Error('该代理仍被规则、默认路由或自定义配置引用，请先解除引用');
          c.profiles = c.profiles.filter(p => !(p.kind === 'endpoint' &&
            p.endpointId === message.id && p.id === 'profile-' + message.id));
          if (c.selection.profileId === 'profile-' + message.id)
            c.selection = { mode: 'system' };
          const removed = c.endpoints.find(e => e.id === message.id);
          c.endpoints = c.endpoints.filter(e => e.id !== message.id);
          if (removed && c.sources.some(s => s.id === removed.sourceId && s.kind === 'local-client') &&
            !c.endpoints.some(e => e.sourceId === removed.sourceId))
            c.sources = c.sources.filter(s => s.id !== removed.sourceId);
          return c;
        });
        break;
      case 'SAVE_PROFILE':
        await edit(c => {
          const p = profileFrom(message.profile);
          const old = c.profiles.find(v => v.id === p.id);
          if (c.managed && c.selection.mode === 'profile' && c.selection.profileId === p.id &&
            (p.kind === 'pac-inline' || old?.kind === 'pac-inline'))
            throw new Error('编辑正在使用的 PAC 前请先停止管理');
          c.profiles = upsert(c.profiles, p); return c;
        }); break;
      case 'DELETE_PROFILE':
        await edit(c => {
          if (c.managed) throw new Error('请先停止管理，再删除代理配置');
          if (c.selection.mode === 'profile' && c.selection.profileId === message.id)
            throw new Error('请先切换运行模式，再删除已选配置');
          c.profiles = c.profiles.filter(p => p.id !== message.id); return c;
        }); break;
      case 'SAVE_RULE':
        await edit(c => { c.rules = upsert(c.rules, ruleFrom(message.rule)); return c; }); break;
      case 'DELETE_RULE':
        await edit(c => { c.rules = c.rules.filter(r => r.id !== message.id); return c; }); break;
      case 'SET_DEFAULT':
        await edit(c => { c.defaultTarget = message.target; return c; }); break;
      case 'SELECT':
        await edit(c => { c.selection = message.selection; return c; }); break;
      case 'SELECT_AND_APPLY':
        // Compatibility command: selection is a draft; only APPLY enables proxy.
        await edit(c => { c.selection = message.selection; return c; });
        break;
      case 'SET_CREDENTIAL':
      case 'PROBE': fail('E_NOT_CONNECTED', 'E_NOT_CONNECTED: authentication and network probes are not connected');
      case 'APPLY': {
        if (actual.statusErrorCode) fail(actual.statusErrorCode, 'Managed status unavailable; Apply refused');
        if (actual.permission === false) fail('E_PERMISSION_DENIED', 'Managed proxy permission denied');
        if (unknown) fail('E_OUTCOME_UNKNOWN', 'Confirm STOP or disabled status before applying again');
        if (actual.state === 'conflict' || actual.state === 'unavailable') fail('E_NOT_CONNECTED', actual.reason ?? 'Managed proxy unavailable');
        if (config.selection.mode === 'profile') {
          const selected = config.profiles.find(profile => profile.id === config.selection.profileId);
          if (!selected) throw new Error('请先选择要使用的配置');
          if (selected.kind === 'pac-inline' && message.approvedPac !== true) throw new Error('启用用户 PAC 必须明确确认');
        }
        const submitted = clone(config);
        invalidate();
        // A new Enable attempt invalidates any previous release confirmation.
        stopFinalizationPending = false;
        try {
          observe(await apply(clone(submitted)));
        } catch (error) {
          assertLive();
          const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
          // Only explicit preflight/authorization refusals prove no Enable effect.
          if (!['E_NOT_CONNECTED', 'E_UNSUPPORTED', 'E_PERMISSION_DENIED', 'E_REVOKED',
            'E_TOOL_CHANGED', 'E_CONFLICT', 'E_PROXY_PROFILE_NOT_APPROVED'].includes(String(code))) unknown = true;
          throw error;
        }
        const refusal = statusRefusal(actual);
        if (refusal) { unknown = true; fail(refusal, 'Managed proxy apply refused'); }
        if (actual.state !== 'enabled' || actual.control !== 'controlled_by_this_extension' || !actual.canStop) {
          unknown = true;
          fail('E_OUTCOME_UNKNOWN', 'Apply did not confirm an enabled managed proxy');
        }
        active = submitted;
        latestError = null;
        await persist({ ...submitted, managed: true });
        break;
      }
      case 'IMPORT': {
        if (config.managed) throw new Error('请先停止管理，再导入配置');
        const incoming = message.config && typeof message.config === 'object' &&
          'schemaVersion' in message.config && message.config.schemaVersion === 1
          ? migrateV1(message.config) : validateConfig(message.config);
        await persist({ ...incoming, managed: false, selection: { mode: 'system' } });
        break;
      }
      case 'EXPORT': return { ok: true, state: view(), share: exportShare(config), preview };
      case 'GET_USAGE': case 'SET_USAGE_SETTINGS': case 'CLEAR_USAGE': case 'IGNORE_USAGE_SITE': {
        previewOnly();
        const next = clone(usage);
        if (message.type === 'SET_USAGE_SETTINGS') {
          const settings = message.settings;
          if (!settings || typeof settings !== 'object' || Array.isArray(settings) ||
              Object.keys(settings).some(key => !['enabled', 'topLimit', 'sort'].includes(key)) ||
              (settings.enabled !== undefined && typeof settings.enabled !== 'boolean') ||
              (settings.topLimit !== undefined && ![5, 10].includes(settings.topLimit)) ||
              (settings.sort !== undefined && !['smart', 'visits', 'recent'].includes(settings.sort)))
            throw new Error('Invalid usage settings');
          Object.assign(next.settings, settings);
          next.settings.enabledAt = next.settings.enabled ? usage.settings.enabledAt ?? Date.now() : null;
        }
        if (message.type === 'IGNORE_USAGE_SITE') {
          const domain = safePublicDomain(message.domain);
          if (!domain || typeof message.ignored !== 'boolean') throw new Error('Invalid usage domain');
          const ignored = new Set(next.settings.ignored);
          if (message.ignored) ignored.add(domain); else ignored.delete(domain);
          if (ignored.size > 200) throw new Error('Too many ignored sites');
          next.settings.ignored = [...ignored];
        }
        // Preview never collects visits, even after opt-in. Clear retains privacy settings.
        next.sites = []; usage = next;
        return { ok: true, state: view(), usage: clone(usage), preview };
      }
      case 'GET_DIAGNOSTICS': case 'RUN_DIAGNOSTICS': case 'CANCEL_DIAGNOSTICS':
      case 'SAVE_DIAGNOSTIC_SITE': case 'REMOVE_DIAGNOSTIC_SITE': case 'MOVE_DIAGNOSTIC_SITE': {
        previewOnly();
        if (message.type === 'SAVE_DIAGNOSTIC_SITE') {
          if (!['P0', 'P1'].includes(message.priority) || (message.name !== undefined && typeof message.name !== 'string')) throw new Error('Invalid diagnostic site');
          const site = siteForDomain(message.domain, message.priority, message.name);
          if (!site) throw new Error('Invalid diagnostic domain');
          if (!diagnostics.favorites.some(row => row.id === site.id) && diagnostics.favorites.length >= MAX_FAVORITES) throw new Error('Too many diagnostic favorites');
          diagnostics.favorites = upsert(diagnostics.favorites, { ...site, provenance: 'user', pinnedByUser: message.priority === 'P0' });
          invalidate();
        } else if (message.type === 'REMOVE_DIAGNOSTIC_SITE') {
          diagnostics.favorites = diagnostics.favorites.filter(row => row.id !== message.id); invalidate();
        } else if (message.type === 'MOVE_DIAGNOSTIC_SITE') {
          if (!['up', 'down'].includes(message.direction)) throw new Error('Invalid diagnostic direction');
          const from = diagnostics.favorites.findIndex(row => row.id === message.id);
          const to = from + (message.direction === 'up' ? -1 : 1);
          if (from >= 0 && to >= 0 && to < diagnostics.favorites.length)
            [diagnostics.favorites[from], diagnostics.favorites[to]] = [diagnostics.favorites[to]!, diagnostics.favorites[from]!];
          invalidate();
        } else if (message.type === 'CANCEL_DIAGNOSTICS') {
          generation++; diagnostics.activeRun = null;
        } else if (message.type === 'RUN_DIAGNOSTICS') {
          if (!Array.isArray(message.siteIds) || !message.siteIds.length || message.siteIds.length > MAX_FAVORITES ||
              message.siteIds.some(id => !diagnostics.favorites.some(row => row.id === id))) throw new Error('Invalid diagnostic selection');
          const ids = [...new Set(message.siteIds)];
          const runGeneration = ++generation;
          const runRevision = diagnostics.configRevision;
          diagnostics.activeRun = { startedAt: Date.now(), total: ids.length, completed: 0 };
          setTimeout(() => { void serial(async () => {
            if (disposed || generation !== runGeneration || diagnostics.configRevision !== runRevision) return;
            // Explicit preview failures, never successful real HTTP evidence.
            diagnostics.observations = ids.map(id => ({ siteId: id,
              domain: diagnostics.favorites.find(row => row.id === id)!.domain,
              checkedAt: Date.now(), configRevision: runRevision, kind: 'network_error',
              httpStatus: null, elapsedMs: null, scope: 'extension-http-only' }));
            diagnostics.statistics = Object.fromEntries(ids.map(id => [id, { attempts: 1, successes: 0, failures: 1, p50Ms: null, p95Ms: null }]));
            diagnostics.activeRun = null; notify();
          }).catch(() => {}); }, 20);
        }
        return { ok: true, state: view(), diagnostics: { ...clone(diagnostics), preview: true, generation }, preview };
      }
      default: throw new Error('未知消息类型');
    }
    return { ok: true, state: view(), preview };
  }
  return {
    async request(input: unknown): Promise<ServiceResponse> {
      // Capture before queueing; callers cannot mutate an enqueued configuration.
      let message: Request;
      try {
        if (!input || typeof input !== 'object' || Array.isArray(input) || !('type' in input) || typeof input.type !== 'string') throw new Error('消息格式不正确');
        message = clone(input) as Request;
      } catch (error) { return { ok: false, error: error instanceof Error ? error.message : '消息格式不正确', errorCode: 'errBadMessage' }; }
      return serial(async () => {
        try { const response = await dispatch(message); assertLive(); notify(); return response; }
        catch (error) {
          assertLive();
          const detail = error instanceof Error ? error.message : '发生未知错误';
          const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
          const errorCode = code ? safeStatusCode(code) : errorCodeOf(detail);
          // Retain known business validation text, never arbitrary adapter error details.
          latestError = errorCodeOf(detail) !== 'errGeneric' ? detail : 'Operation failed; check status before retrying';
          notify();
          return { ok: false, error: latestError, errorCode, ...(code ? { code: errorCode } : {}) };
        }
      });
    },
    subscribe(listener: Function) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose() { disposed = true; generation++; listeners.clear(); }
  };
}
