import { usageDomainFromHostname } from './domain';
import type { UsageSettings, UsageSite } from './types';

export const LOCAL_KEY = 'aiProxy.usage.state.v1';
export const SESSION_KEY = 'aiProxy.usage.browser.v1';
export const MAX_SITES = 200;
export const MAX_TRANSIENT = 512;
export const REFRESH_MS = 2 * 60_000;
export const SITE_SESSION_MS = 30 * 60_000;
export const REQUEST_MS = 10 * 60_000;

export interface DayBucket { day: string; visits: number; sessions: number; lastAt: number }
export interface StoredSite { siteKey: string; domain: string; days: DayBucket[] }
export interface RefreshEntry { siteKey: string; tabId: number; at: number }
export interface SiteSession { siteKey: string; at: number }
export interface DoneRequest { requestId: string; at: number }
export interface UsageState {
  version: 1;
  revision: string;
  settings: UsageSettings;
  sites: StoredSite[];
  browserId: string;
  refresh: RefreshEntry[];
  sessions: SiteSession[];
  done: DoneRequest[];
}
export interface PendingRequest { requestId: string; tabId: number; startedAt: number; revision: string }
export interface BrowserState { id: string; requests: PendingRequest[] }

export function defaults(): UsageSettings {
  return { enabled: false, enabledAt: null, topLimit: 5, sort: 'smart', ignored: [] };
}
export function emptyState(): UsageState {
  return { version: 1, revision: crypto.randomUUID(), settings: defaults(), sites: [],
    browserId: '', refresh: [], sessions: [], done: [] };
}
export function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dayStart(now: number, days: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - days + 1);
  return dayKey(d.getTime());
}
export function validAt(value: unknown, now: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= now;
}
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}
export function validRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,128}$/.test(value);
}
function counter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000;
}
export function sanitizeState(raw: unknown, now: number): UsageState {
  const value = record(raw);
  if (value.version !== 1 || !validId(value.revision)) return emptyState();
  const state = emptyState();
  state.revision = value.revision;
  const settings = record(value.settings);
  const allowedSettings = ['enabled', 'enabledAt', 'topLimit', 'sort', 'ignored'];
  const settingsValid = Object.keys(settings).length === allowedSettings.length &&
    Object.keys(settings).every(key => allowedSettings.includes(key)) && typeof settings.enabled === 'boolean' &&
    (settings.enabled === true ? validAt(settings.enabledAt, now) : settings.enabledAt === null) &&
    (settings.topLimit === 5 || settings.topLimit === 10) &&
    (settings.sort === 'smart' || settings.sort === 'visits' || settings.sort === 'recent') &&
    Array.isArray(settings.ignored) && settings.ignored.length <= MAX_SITES && settings.ignored.every(domain =>
      typeof domain === 'string' && usageDomainFromHostname(domain)?.domain === domain);
  if (settingsValid) {
    state.settings.enabled = settings.enabled === true;
    state.settings.enabledAt = validAt(settings.enabledAt, now) ? settings.enabledAt : null;
    if (settings.topLimit === 10) state.settings.topLimit = 10;
    if (settings.sort === 'recent' || settings.sort === 'visits') state.settings.sort = settings.sort;
    state.settings.ignored = [...new Set(array(settings.ignored).filter((domain): domain is string => typeof domain === 'string'))];
  }
  const oldest = dayStart(now, 30), today = dayKey(now);
  const keys = new Set<string>();
  for (const entry of array(value.sites).slice(0, 1000)) {
    const site = record(entry);
    const normalized = typeof site.domain === 'string' ? usageDomainFromHostname(site.domain) : null;
    if (!normalized || normalized.domain !== site.domain || normalized.siteKey !== site.siteKey ||
      keys.has(normalized.siteKey) || state.settings.ignored.includes(normalized.domain)) continue;
    const days: DayBucket[] = [];
    const dates = new Set<string>();
    for (const entry of array(site.days).slice(0, 60)) {
      const b = record(entry);
      if (typeof b.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.day) || b.day < oldest || b.day > today || dates.has(b.day) ||
        !validAt(b.lastAt, now) || !counter(b.visits) || b.visits === 0 || !counter(b.sessions) || b.sessions > b.visits) continue;
      // A time zone change can shift a historical bucket by one natural day.
      const date = new Date(b.day + 'T12:00:00');
      if (dayKey(date.getTime()) !== b.day || Math.abs(date.getTime() - b.lastAt) > 36 * 60 * 60_000) continue;
      dates.add(b.day);
      days.push({ day: b.day, visits: b.visits, sessions: b.sessions, lastAt: b.lastAt });
    }
    if (!days.length) continue;
    keys.add(normalized.siteKey);
    state.sites.push({ ...normalized, days });
  }
  trimSites(state);
  const known = new Set(state.sites.map(site => site.siteKey));
  if (validId(value.browserId)) state.browserId = value.browserId;
  for (const entry of array(value.refresh).slice(-MAX_TRANSIENT)) {
    const r = record(entry);
    if (typeof r.siteKey === 'string' && known.has(r.siteKey) && Number.isSafeInteger(r.tabId) && (r.tabId as number) >= 0 &&
      validAt(r.at, now) && now - r.at <= REFRESH_MS) state.refresh.push({ siteKey: r.siteKey, tabId: r.tabId as number, at: r.at });
  }
  for (const entry of array(value.sessions).slice(-MAX_SITES)) {
    const s = record(entry);
    if (typeof s.siteKey === 'string' && known.has(s.siteKey) && validAt(s.at, now) && now - s.at < SITE_SESSION_MS)
      state.sessions.push({ siteKey: s.siteKey, at: s.at });
  }
  for (const entry of array(value.done).slice(-MAX_TRANSIENT)) {
    const d = record(entry);
    if (validRequestId(d.requestId) && validAt(d.at, now) && now - d.at <= REQUEST_MS)
      state.done.push({ requestId: d.requestId, at: d.at });
  }
  return state;
}
export function sanitizeBrowser(raw: unknown, now: number): BrowserState {
  const b = record(raw);
  const state: BrowserState = { id: validId(b.id) ? b.id : crypto.randomUUID(), requests: [] };
  for (const entry of array(b.requests).slice(-MAX_TRANSIENT)) {
    const r = record(entry);
    if (validRequestId(r.requestId) && validId(r.revision) && Number.isSafeInteger(r.tabId) && (r.tabId as number) >= 0 &&
      validAt(r.startedAt, now) && now - r.startedAt <= REQUEST_MS)
      state.requests.push({ requestId: r.requestId, revision: r.revision, tabId: r.tabId as number, startedAt: r.startedAt });
  }
  return state;
}
export function resetDedupe(state: UsageState): void { state.refresh = []; state.sessions = []; state.done = []; }
export function trimSites(state: UsageState): void {
  state.sites.sort((a, b) => Math.max(...b.days.map(d => d.lastAt)) - Math.max(...a.days.map(d => d.lastAt)) || a.domain.localeCompare(b.domain));
  state.sites = state.sites.slice(0, MAX_SITES);
  const keys = new Set(state.sites.map(s => s.siteKey));
  state.refresh = state.refresh.filter(r => keys.has(r.siteKey)).slice(-MAX_TRANSIENT);
  state.sessions = state.sessions.filter(s => keys.has(s.siteKey));
}
export function summarize(state: UsageState, now: number): UsageSite[] {
  const oldest7 = dayStart(now, 7);
  return state.sites.map(site => {
    const week = site.days.filter(day => day.day >= oldest7);
    const sum = (days: DayBucket[], key: 'visits' | 'sessions') => days.reduce((count, day) => count + day[key], 0);
    return { siteKey: site.siteKey, domain: site.domain,
      visits7d: sum(week, 'visits'), visits30d: sum(site.days, 'visits'),
      sessions7d: sum(week, 'sessions'), sessions30d: sum(site.days, 'sessions'),
      activeDays7d: week.length, activeDays30d: site.days.length,
      lastVisitedAt: Math.max(...site.days.map(day => day.lastAt)) };
  });
}
