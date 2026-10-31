import type { ConfigState, ConfigSource, LocalClientInput, Profile, ProxyEndpoint, ProxyScheme, RuleTarget, SiteRule, SubscriptionFormat } from './types';

const schemes = new Set(['http', 'https', 'socks4', 'socks5']);
const modes = new Set(['system', 'direct', 'profile', 'rules']);
const manual: ConfigSource = { id: 'manual', kind: 'manual', displayName: '手动创建', trustedByUser: true };

export function freshConfig(): ConfigState {
  return {
    schemaVersion: 2,
    sources: [manual], endpoints: [], profiles: [], rules: [],
    defaultTarget: { action: 'direct' },
    selection: { mode: 'profile' }, managed: false
  };
}

export function asObject(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('需要对象格式的配置');
  return v as Record<string, unknown>;
}
function requiredId(v: unknown): string {
  if (typeof v !== 'string' || !/^[\w-]{1,80}$/.test(v)) throw new Error('无效配置 ID');
  return v;
}
function label(v: unknown): string {
  if (typeof v !== 'string' || !v.trim() || v.length > 80) throw new Error('名称长度须为 1–80 字符');
  return v.trim();
}
export function validateHost(v: unknown): string {
  if (typeof v !== 'string') throw new Error('代理主机不能为空');
  const host = v.trim().toLowerCase().replace(/\.$/, '');
  if (host.length > 253 || !host || !/^[a-z0-9.-]+$/.test(host) ||
    host.split('.').some(x => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x))) {
    throw new Error('代理主机必须是 ASCII 域名或 IPv4（不包含协议、路径或账号）');
  }
  if (/^\d+(?:\.\d+){3}$/.test(host) && host.split('.').some(part => Number(part) > 255)) throw new Error('非法 IPv4 地址');
  return host;
}
/**
 * Presentation-only helper: users may paste a website URL or a host name.
 * Only the validated hostname is returned; URLs, paths, queries and tokens
 * never enter the persisted rule model.
 */
export function normalizeRuleSiteInput(value: string): string {
  const input = value.trim();
  if (!input || input.length > 2048 || /\s/.test(input)) throw new Error('请输入有效的网站域名或网址');
  const raw = input.startsWith('*.') ? input.slice(2) : input;
  const normalized = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : 'https://' + raw;
  let url: URL;
  try { url = new URL(normalized); }
  catch { throw new Error('请输入有效的网站域名或网址'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('只允许 HTTP(S) 网站域名，不能包含账号密码');
  return validateDomain(url.hostname);
}


/** Choose a deterministic priority for a site-specific quick rule.
 * Do not pretend that a new rule overrides an already higher-priority match.
 */
export function priorityForSiteQuickRule(
  domain: string, rules: SiteRule[], existingId?: string, existingPriority?: number
): number {
  const hostname = validateDomain(domain);
  if (existingId !== undefined)
    return existingPriority ?? rules.find(rule => rule.id === existingId)?.priority ?? 100;
  const overlapping = rules.filter(r => r.enabled && r.id !== existingId &&
    (r.domain === hostname || (r.includeSubdomains && hostname.endsWith('.' + r.domain))));
  const minimum = 100;
  if (!overlapping.length) return minimum;
  const highest = Math.min(...overlapping.map(r => r.priority));
  if (highest === 0) throw new Error('已有优先级 0 的网站规则，需要在完整规则管理中调整');
  return Math.min(minimum, highest - 1);
}

export function validateDomain(v: unknown): string {
  const host = validateHost(v);
  if (/^\d+(?:\.\d+){3}$/.test(host)) throw new Error('站点规则要求域名，不接受 IP');
  return host;
}
function validPort(v: unknown): number {
  if (!Number.isInteger(v) || Number(v) < 1 || Number(v) > 65535) throw new Error('端口必须在 1–65535');
  return Number(v);
}
const subscriptionFormats = new Set(['auto', 'clash', 'sing-box', 'uri-list', 'unknown']);
/** Persist non-secret source identity only; does not authorize a remote request. */
export function sourceFrom(raw: unknown): ConfigSource {
  const x = asObject(raw);
  if (['url', 'subscriptionUrl', 'token', 'password', 'username', 'authorization', 'apiKey'].some(k => k in x))
    throw new Error('来源元数据不得包含订阅链接或凭证');
  const id = requiredId(x.id), displayName = label(x.displayName);
  if (x.kind === 'manual' || x.kind === 'import')
    return { id, kind: x.kind, displayName, trustedByUser: x.trustedByUser === true };
  if (x.kind === 'local-client') {
    if (x.trustedByUser !== true) throw new Error('本地客户端来源需要用户确认');
    return { id, kind: 'local-client', displayName, trustedByUser: true };
  }
  if (x.kind === 'subscription') {
    if (x.trustedByUser !== true) throw new Error('第三方来源需要用户确认');
    const originHost = validateDomain(x.originHost);
    if (!originHost.includes('.') || /\.(?:local|localhost|internal|test|invalid|example)$/.test(originHost))
      throw new Error('只记录合法的外部 HTTPS 服务商域名');
    if (!subscriptionFormats.has(String(x.format))) throw new Error('未知订阅格式声明');
    if (x.syncStatus !== 'not-synced') throw new Error('尚未实现订阅同步，不能伪造同步成功');
    return { id, kind: 'subscription', displayName, trustedByUser: true,
      originHost, format: x.format as SubscriptionFormat, syncStatus: 'not-synced' };
  }
  throw new Error('不支持的配置来源');
}
/** Force loopback server-side; local client input cannot specify remote hosts. */
export function localClientFrom(raw: unknown): LocalClientInput {
  const x = asObject(raw);
  if (['host', 'url', 'username', 'password', 'token', 'credentialRef'].some(k => k in x))
    throw new Error('本地客户端只允许 127.0.0.1 上的无认证代理端口');
  if (!schemes.has(String(x.scheme))) throw new Error('本地客户端协议必须为 HTTP/HTTPS/SOCKS4/SOCKS5');
  return { id: requiredId(x.id), name: label(x.name), scheme: x.scheme as ProxyScheme, port: validPort(x.port) };
}
function uniqueIds(rows: {id:string}[], kind: string) {
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error(kind + ' 的 ID 重复');
}
export function endpointFrom(raw: unknown): ProxyEndpoint {
  const x = asObject(raw);
  if (!schemes.has(String(x.scheme))) throw new Error('不支持的代理协议');
  const sourceId = x.sourceId === undefined ? 'manual' : requiredId(x.sourceId);
  const credentialRef = x.credentialRef === undefined ? undefined : requiredId(x.credentialRef);
  // 常规配置永远不会接受密码、用户名或 token 字段。
  if ('password' in x || 'username' in x || 'token' in x) throw new Error('普通代理配置不能包含凭证');
  return { id: requiredId(x.id), name: label(x.name), scheme: x.scheme as ProxyEndpoint['scheme'],
    host: validateHost(x.host), port: validPort(x.port), sourceId, ...(credentialRef ? { credentialRef } : {}) };
}
export function pacTextFrom(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 65536 || !/\bfunction\s+FindProxyForURL\s*\(/.test(raw)) {
    throw new Error('PAC 需包含 FindProxyForURL 且不超过 64 KiB；未执行代码检查');
  }
  return raw;
}
export function profileFrom(raw: unknown): Profile {
  const x = asObject(raw), id = requiredId(x.id), name = label(x.name);
  const sourceId = x.sourceId === undefined ? 'manual' : requiredId(x.sourceId);
  if (x.kind === 'endpoint') return { id, name, kind: 'endpoint', endpointId: requiredId(x.endpointId), sourceId };
  if (x.kind === 'pac-inline') return { id, name, kind: 'pac-inline', pacText: pacTextFrom(x.pacText), sourceId };
  throw new Error('不支持的配置类型（远程 PAC 未开放）');
}
function targetFrom(raw: unknown): RuleTarget {
  const x = asObject(raw);
  if (x.action === 'direct') return { action: 'direct' };
  if (x.action === 'endpoint') return { action: 'endpoint', endpointId: requiredId(x.endpointId) };
  throw new Error('规则目标必须是 DIRECT 或已存在的代理');
}
export function ruleFrom(raw: unknown): SiteRule {
  const x = asObject(raw), target = targetFrom(x);
  const p = Number(x.priority);
  if (!Number.isInteger(p) || p < 0 || p > 99999) throw new Error('规则优先级须为 0–99999');
  return { id: requiredId(x.id), domain: validateDomain(x.domain),
    includeSubdomains: x.includeSubdomains === true, priority: p,
    enabled: x.enabled !== false, ...target };
}
export function validateConfig(raw: unknown): ConfigState {
  const x = asObject(raw);
  if (x.schemaVersion !== 2) throw new Error('不支持的 schemaVersion；请显式迁移 v1');
  for (const key of ['sources', 'endpoints', 'profiles', 'rules']) {
    if (!Array.isArray(x[key])) throw new Error(key + ' 必须是数组');
  }
  if (Array.isArray(x.sources) && x.sources.length > 250) throw new Error('来源数量超过限制');
  const sources: ConfigSource[] = Array.isArray(x.sources) ? x.sources.map(sourceFrom) : [manual];
  if ((Array.isArray(x.endpoints) && x.endpoints.length > 200) ||
      (Array.isArray(x.profiles) && x.profiles.length > 300) ||
      (Array.isArray(x.rules) && x.rules.length > 1000)) throw new Error('配置数量超过限制');
  const endpoints = (Array.isArray(x.endpoints) ? x.endpoints : []).map(endpointFrom);
  const profiles = (Array.isArray(x.profiles) ? x.profiles : []).map(profileFrom);
  const rules = (Array.isArray(x.rules) ? x.rules : []).map(ruleFrom);
  uniqueIds(sources, '来源'); uniqueIds(endpoints, '代理'); uniqueIds(profiles, '配置'); uniqueIds(rules, '规则');
  const hasEndpoint = (id: string) => endpoints.some(v => v.id === id);
  const hasSource = (id: string) => sources.some(v => v.id === id);
  for (const p of profiles) if (p.kind === 'endpoint' && !hasEndpoint(p.endpointId)) throw new Error('配置引用了不存在的代理');
  for (const p of profiles) if (!hasSource(p.sourceId)) throw new Error('配置引用了不存在的来源');
  for (const e of endpoints) {
    const source = sources.find(v => v.id === e.sourceId);
    if (!source) throw new Error('代理引用了不存在的来源');
    if (source.kind === 'subscription') throw new Error('未同步订阅不能生成可连接代理');
    if (source.kind === 'local-client' && (e.host !== '127.0.0.1' || e.credentialRef))
      throw new Error('本地客户端入口只能是 127.0.0.1 上的无认证代理');
  }
  for (const r of rules) if (r.action === 'endpoint' && !hasEndpoint(r.endpointId!)) throw new Error('规则引用了不存在的代理');
  const defaultTarget = targetFrom(x.defaultTarget ?? { action: 'direct' });
  if (defaultTarget.action === 'endpoint' && !hasEndpoint(defaultTarget.endpointId!)) throw new Error('默认路由代理不存在');
  const selected = asObject(x.selection ?? { mode: 'system' });
  if (!modes.has(String(selected.mode))) throw new Error('未知的运行模式');
  const selection = { mode: selected.mode as ConfigState['selection']['mode'],
    ...(selected.profileId === undefined ? {} : { profileId: requiredId(selected.profileId) }) };
  if (selection.profileId && !profiles.some(p => p.id === selection.profileId)) throw new Error('已选配置不存在');
  return { schemaVersion: 2, sources, endpoints, profiles, rules, defaultTarget, selection, managed: x.managed === true };
}
/** 从 R1 单 HTML 无密码备份迁移；只迁移安全数据，不带入旧运行状态。 */
export function migrateV1(raw: unknown): ConfigState {
  const x = asObject(raw);
  if (x.schemaVersion !== 1 || !Array.isArray(x.proxies) || !Array.isArray(x.rules)) throw new Error('不是 AI Proxy v1 无密码备份');
  if (x.proxies.length > 200 || x.rules.length > 2000) throw new Error('备份超出安全大小限制');
  const config = freshConfig();
  // Old backups never establish a route; migration is deliberately conservative.
  config.selection = { mode: 'system' };
  for (const item of x.proxies) {
    const p = asObject(item);
    if (p.password || p.token) throw new Error('发现旧版凭证字段，拒绝自动导入');
    const endpoint = endpointFrom({ id: p.id, name: p.name, scheme: p.protocol, host: p.host, port: p.port });
    config.endpoints.push(endpoint);
    config.profiles.push({ id: 'profile-' + endpoint.id, name: endpoint.name, kind: 'endpoint', endpointId: endpoint.id, sourceId: 'manual' });
  }
  for (const item of x.rules) {
    const r = asObject(item);
    config.rules.push(ruleFrom({ id: r.id, domain: r.host, includeSubdomains: r.includeSubdomains,
      action: r.action === 'proxy' ? 'endpoint' : 'direct', endpointId: r.action === 'proxy' ? r.proxyId : undefined,
      priority: r.priority, enabled: r.enabled }));
  }
  // 旧 settings.mode 仅仅是导入来源的意图，绝不自动接管浏览器代理。
  return validateConfig(config);
}
export function exportShare(config: ConfigState): ConfigState {
  const copy = structuredClone(config);
  // 分享备份不包括 PAC 文本、凭证引用、当前运行意图。
  copy.profiles = copy.profiles.filter(v => v.kind === 'endpoint').map(profile => {
    const source = copy.sources.find(source => source.id === profile.sourceId);
    if (source?.kind !== 'subscription') return profile;
    // Keep the usable profile when its private subscription metadata is removed.
    const endpoint = copy.endpoints.find(endpoint => endpoint.id === profile.endpointId);
    return endpoint ? {...profile, sourceId: endpoint.sourceId} : profile;
  });
  copy.endpoints = copy.endpoints.map(({ credentialRef: _unused, ...safe }) => safe);
  // Provider identity is private metadata, never a shared backup.
  copy.sources = copy.sources.filter(source => source.kind !== 'subscription');
  copy.selection = { mode: 'system' };
  copy.managed = false;
  return validateConfig(copy);
}
