import {getEnvironment} from '../environment';
import {Button} from '@opendesk/ui';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n/LocaleProvider';
import { request, type Request } from '../domain/messages';
import type { DiagnosticSite, SitePriority } from '../diagnostics/types';
import type { UsageSettings, UsageSite, UsageSnapshot, UsageSort } from '../usage/types';
import { rankUsageSites } from '../usage/ranking';
import { prioritizeFavorites } from '../diagnostics/favorites';
import { usageDomainFromHostname } from '../usage/domain';

type UsageCommand = Extract<Request, { type: 'SET_USAGE_SETTINGS' | 'CLEAR_USAGE' | 'IGNORE_USAGE_SITE' }>;

/** Overview reads local usage only; authorization remains in the Top panel. */
export function UsageOverview() {
  const { t } = useI18n();
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    let generation = 0;
    const load = async () => {
      const revision = ++generation;
      try {
        const result = await request({ type: 'GET_USAGE' });
        if (!mounted || revision !== generation) return;
        if (!result.ok || !result.usage) throw new Error('Usage unavailable');
        setUsage(result.usage);
        setError(false);
      } catch {
        if (mounted && revision === generation) setError(true);
      }
    };
    const onChanged = (changes: Record<string, any>, area: string) => {
      if (area === 'local' && Object.keys(changes).some(key => key.startsWith('aiProxy.usage'))) void load();
    };
    const onFocus = () => { void load(); };
    void load();
    getEnvironment().storage.onChanged.addListener(onChanged);
    window.addEventListener('focus', onFocus);
    return () => {
      mounted = false;
      generation++;
      getEnvironment().storage.onChanged.removeListener(onChanged);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return <>
    <p className="usageOverview" data-testid="usage-overview" aria-live="polite">
      <strong>{error ? t('usageUnavailable') : !usage ? t('usageLoading') :
        usage.settings.enabled ? t('usageEnabled') : t('usageDisabled')}</strong>
      {usage && !error && <><br /><span>{t('usageOverviewCount', { count: usage.sites.length })}</span>
        {!usage.permissionGranted && <><br /><span>{t('usageOverviewPermissionMissing')}</span></>}
      </>}
    </p>
    <p className="usageOverviewPrivacy">{t('usageOverviewPrivacy')}</p>
  </>;
}

export function UsageControls({ favorites, locked, saving, submit, test, renderResult, children }: {
  favorites: DiagnosticSite[];
  locked: boolean;
  saving: boolean;
  submit: (command: Request) => Promise<boolean>;
  test: (ids: string[]) => Promise<void>;
  renderResult: (site: DiagnosticSite) => ReactNode;
  children: ReactNode;
}) {
  const { t, locale } = useI18n();
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState('');
  const mutation = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(false);

  const load = useCallback(async (force = false) => {
    if (mutation.current && !force) return;
    const revision = ++generation.current;
    try {
      const result = await request({ type: 'GET_USAGE' });
      if (!mounted.current || revision !== generation.current) return;
      if (!result.ok || !result.usage) throw new Error('Usage unavailable');
      setUsage(result.usage);
      setError(false);
      return true;
    } catch {
      if (mounted.current && revision === generation.current) setError(true);
      return false;
    } finally {
      if (mounted.current && revision === generation.current) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    const onChanged = (changes: Record<string, any>, area: string) => {
      if ((area === 'local' || area === 'session') &&
        Object.keys(changes).some(key => key.startsWith('aiProxy.usage'))) void load();
    };
    const onFocus = () => { void load(); };
    getEnvironment().storage.onChanged.addListener(onChanged);
    window.addEventListener('focus', onFocus);
    return () => {
      mounted.current = false;
      generation.current++;
      getEnvironment().storage.onChanged.removeListener(onChanged);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  async function change(command: UsageCommand) {
    if (mutation.current) return;
    mutation.current = true;
    generation.current++;
    setPending(true);
    setNotice('');
    try {
      const result = await request(command);
      if (!result.ok) throw new Error('Usage operation failed');
      // Read back persisted state, including permission denial and atomic clear.
      const refreshed = await load(true);
      if (mounted.current && refreshed && command.type === 'CLEAR_USAGE') setNotice(t('usageCleared'));
    } catch {
      // A rejected enable may mean permission was revoked in another window.
      await load(true);
      if (mounted.current) setError(true);
    } finally {
      mutation.current = false;
      if (mounted.current) setPending(false);
    }
  }

  const settings = usage?.settings;
  const limit = settings?.topLimit ?? 5;
  const ranking = useMemo<{ sites: (DiagnosticSite & { usage?: UsageSite })[]; failed: boolean }>(() => {
    if (!usage) return { sites: prioritizeFavorites(favorites), failed: false };
    try {
      return { sites: rankUsageSites(favorites, usage), failed: false };
    } catch {
      // Usage failure must never take away saved sites or manual diagnostics.
      return { sites: prioritizeFavorites(favorites), failed: true };
    }
  }, [favorites, usage]);
  const pinned = favorites.filter(site => site.pinnedByUser === true ||
    (site.pinnedByUser === undefined && site.priority === 'P0'));
  const canChange = !!usage && !pending;
  const date = (value: number | null | undefined) => value && Number.isFinite(value) && value > 0
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(value)
    : t('usageNoVisit');
  const update = (next: Partial<Pick<UsageSettings, 'enabled' | 'topLimit' | 'sort'>>) =>
    change({ type: 'SET_USAGE_SETTINGS', settings: next });
  const usageWindow = usage?.sites.some(site => site.activeDays7d > 0) ? 7 : 30;
  const savedAi = favorites.filter(site => site.kind === 'ai' && site.provenance !== 'auto');

  return <div className="usageSection" data-testid="usage-section">
    <div className="diagnosticSectionHead">
      <div><h3>{t('prioritySitesTop510')}</h3><p className="hint">{t('usageTopHelp')}</p></div>
      <Button variant="primary" className="primary" disabled={locked || savedAi.length === 0}
        onClick={() => void test(savedAi.slice(0, 10).map(site => site.id))}>{t('diagCheckSaved')}</Button>
    </div>
    <section className="usageControls" data-testid="usage-controls" aria-label={t('usageTitle')} aria-busy={pending}>
      <div className="usageControlHead">
        <h4>{t('usageTitle')}</h4>
        <span className="subtleTag" role="status" data-testid="usage-state">{!loaded ? t('usageLoading') : !usage ? t('usageUnavailable') :
          settings?.enabled ? t('usageEnabled') : t('usageDisabled')}</span>
      </div>
      <p className="hint" id="usage-privacy">{t('usagePrivacy')}</p>
      <p className="hint">{t('usageNoAutomation')}</p>
      {usage && <p className="hint">{settings?.enabled
        ? t('usageSince', { time: date(settings.enabledAt) })
        : usage.sites.length > 0 ? t('usagePaused') : t('usageOffHelp')}</p>}
      {usage && <p className="hint">{usage.permissionGranted ? t('usagePermissionGranted') : t('usagePermissionNeeded')}</p>}
      <div className="usageActions">
        <Button data-testid="usage-toggle" className={settings?.enabled ? undefined : 'primary'} disabled={!canChange}
          aria-describedby="usage-privacy" onClick={() => void update({ enabled: !settings?.enabled })}>
          {settings?.enabled ? t('usageDisable') : t('usageEnableConsent')}
        </Button>
        <Button data-testid="usage-clear" disabled={pending} onClick={() => void change({ type: 'CLEAR_USAGE' })}>
          {t('usageDisableClear')}
        </Button>
      </div>
      <p className="hint">{t('usageClearHelp')}</p>
      <p className="hint">{t('usageIgnoreHelp')}</p>
      <div className="usagePreferences">
        <label htmlFor="usage-top-limit">{t('usageTopLimit')}</label>
        <select id="usage-top-limit" data-testid="usage-top-limit" value={limit} disabled={!canChange}
          onChange={event => void update({ topLimit: event.target.value === '10' ? 10 : 5 })}>
          <option value="5">{t('usageTopFive')}</option><option value="10">{t('usageTopTen')}</option>
        </select>
        <label htmlFor="usage-sort">{t('usageSort')}</label>
        <select id="usage-sort" data-testid="usage-sort" value={settings?.sort ?? 'smart'} disabled={!canChange}
          onChange={event => void update({ sort: event.target.value as UsageSort })}>
          <option value="smart">{t('usageSortSmart')}</option>
          <option value="visits">{t('usageSortVisits')}</option>
          <option value="recent">{t('usageSortRecent')}</option>
        </select>
      </div>
      {notice && <p role="status" className="hint" data-testid="usage-notice">{notice}</p>}
      {(error || ranking.failed) && <div className="usageError" role="alert" data-testid="usage-error">
        <p>{t('usageError')}</p><Button disabled={pending} onClick={() => void load()}>{t('usageRetry')}</Button>
      </div>}
      {usage && usage.sites.length === 0 && <p className="hint">{settings?.enabled ? t('usageEmpty') : t('usageNoRecords')}</p>}
      {!!settings?.ignored.length && <details className="usageIgnored" data-testid="usage-ignored">
        <summary>{t('usageIgnored', { count: settings.ignored.length })}</summary>
        <ul>{settings.ignored.map(domain => <li key={domain}><span>{domain}</span>
          <Button disabled={!canChange} aria-label={t('usageRestoreFor', { site: domain })}
            onClick={() => void change({ type: 'IGNORE_USAGE_SITE', domain, ignored: false })}>{t('usageRestore')}</Button>
        </li>)}</ul><p className="hint">{t('usageRestoreHelp')}</p>
      </details>}
    </section>
    {pinned.length > limit && <p className="hint" role="status" data-testid="usage-pinned-overflow">{t('usagePinnedOverflow', { count: pinned.length, limit })}</p>}
    {children}
    <div className="diagnosticSiteList usageSiteList usageRows" data-testid="usage-rows">{ranking.sites.slice(0, limit).map(site => {
      const saved = favorites.find(favorite => favorite.id === site.id || favorite.domain === site.domain);
      const source = site.provenance ?? (saved ? 'user' : 'auto');
      const isAuto = source === 'auto';
      const isPinned = !!saved && pinned.some(item => item.id === saved.id);
      const pinnedIndex = saved ? pinned.findIndex(item => item.id === saved.id) : -1;
      const stats = site.usage;
      const isIgnored = settings?.ignored.includes(usageDomainFromHostname(site.domain)?.domain ?? site.domain) ?? false;
      const canTest = site.kind === 'ai' && !isAuto;
      return <article key={site.id} className="diagnosticSite usageSite" data-testid="usage-site"
        data-site-id={site.id} data-site-domain={site.domain}>
        <div className="usageSiteInfo">
          <div className="diagnosticSiteName"><strong>{site.name}</strong><small>{site.domain}</small></div>
          <div className="usageBadges"><span className="subtleTag">{source === 'builtin' ? t('usageSourceBuiltin') :
            isAuto ? t('usageSourceAuto') : t('usageSourceUser')}</span>
            {isPinned && <span className="subtleTag">{t('usagePinned')}</span>}
          </div>
          <p className="hint">{isPinned ? t('usageReasonPinned') : source === 'user' ? t('usageReasonSaved') : stats
            ? settings?.sort === 'recent' ? t('usageReasonRecent', { time: date(stats.lastVisitedAt) })
              : settings?.sort === 'visits' ? t('usageReasonVisits', { count: usageWindow === 7 ? stats.visits7d : stats.visits30d, window: usageWindow })
              : t('usageReasonActive', { days: usageWindow === 7 ? stats.activeDays7d : stats.activeDays30d, window: usageWindow })
            : t('usageReasonBuiltin')}</p>
          {stats && <details className="usageMetrics" data-testid="usage-metrics">
            <summary>{t('usageVisitSummary', { visits7: stats.visits7d, visits30: stats.visits30d })}</summary>
            <dl>
              <div><dt>{t('usageVisits')}</dt><dd>{t('usageWindowValues', { seven: stats.visits7d, thirty: stats.visits30d })}</dd></div>
              <div><dt>{t('usageActiveDays')}</dt><dd>{t('usageWindowValues', { seven: stats.activeDays7d, thirty: stats.activeDays30d })}</dd></div>
              <div><dt>{t('usageSessions')}</dt><dd>{t('usageWindowValues', { seven: stats.sessions7d, thirty: stats.sessions30d })}</dd></div>
              <div><dt>{t('usageLastVisit')}</dt><dd>{date(stats.lastVisitedAt)}</dd></div>
            </dl><p className="hint">{t('usageMetricsHelp')}</p>
          </details>}
        </div>
        {canTest ? renderResult(site) : <span className="subtleTag">{t('diagManualOnly')}</span>}
        <div className="diagnosticSiteActions usageSiteActions">
          {saved && !isAuto && <>
            <select value={saved.priority} disabled={saving || pending}
              aria-label={t('diagPriorityFor', { site: site.name })}
              onChange={event => void submit({ type: 'SAVE_DIAGNOSTIC_SITE', domain: site.domain,
                priority: event.target.value as SitePriority, name: site.name })}>
              <option value="P0">P0</option><option value="P1">P1</option>
            </select>
            <Button disabled={saving || pending} aria-label={t(isPinned ? 'usageUnpinFor' : 'usagePinFor', { site: site.name })}
              onClick={() => void submit({ type: 'SAVE_DIAGNOSTIC_SITE', domain: site.domain,
                priority: isPinned ? 'P1' : 'P0', name: site.name })}>{t(isPinned ? 'usageUnpin' : 'usagePin')}</Button>
          </>}
          {isPinned && saved && <>
            <Button disabled={saving || pending || pinnedIndex <= 0} aria-label={t('usageMoveUpFor', { site: site.name })}
              onClick={() => void submit({ type: 'MOVE_DIAGNOSTIC_SITE', id: saved.id, direction: 'up' })}>{t('usageMoveUp')}</Button>
            <Button disabled={saving || pending || pinnedIndex === pinned.length - 1} aria-label={t('usageMoveDownFor', { site: site.name })}
              onClick={() => void submit({ type: 'MOVE_DIAGNOSTIC_SITE', id: saved.id, direction: 'down' })}>{t('usageMoveDown')}</Button>
          </>}
          {canTest && <Button disabled={locked} onClick={() => void test([site.id])}>{t('diagTestOne')}</Button>}
          <a href={'https://' + site.domain} target="_blank" rel="noopener noreferrer" aria-label={t('usageOpenFor', { site: site.name })}>{t('diagOpenManually')}</a>
          {isAuto ? <Button disabled={saving || pending} aria-label={t('usageSaveFor', { site: site.name })}
            onClick={() => void submit({ type: 'SAVE_DIAGNOSTIC_SITE', domain: site.domain, priority: 'P1', name: site.name })}>
            {t('usageSaveAsUser')}</Button> : saved && <Button disabled={saving || pending}
            aria-label={t('usageRemoveFor', { site: site.name })}
            onClick={() => void submit({ type: 'REMOVE_DIAGNOSTIC_SITE', id: saved.id })}>{t('diagRemoveFavorite')}</Button>}
          <Button disabled={!canChange} aria-label={t(isIgnored ? 'usageRestoreFor' : 'usageIgnoreFor', { site: site.name })}
            onClick={() => void change({ type: 'IGNORE_USAGE_SITE', domain: site.domain, ignored: !isIgnored })}>
            {t(isIgnored ? 'usageRestore' : 'usageIgnore')}</Button>
        </div>
      </article>;
    })}{ranking.sites.length === 0 && <p className="hint">{t('usageNoSites')}</p>}</div>
  </div>;
}
