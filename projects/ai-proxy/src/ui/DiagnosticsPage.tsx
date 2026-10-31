import {getEnvironment} from '../environment';
import {Button} from '@opendesk/ui';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/LocaleProvider';
import type { TranslationKey } from '../i18n/locale';
import { request, type Request } from '../domain/messages';
import type { ViewState } from '../domain/types';
import { AI_SITES } from '../diagnostics/catalog';
import { diagnosisCodes, observationIsCurrent, type DiagnosisCode } from '../diagnostics/logic';
import type { CheckKind, DiagnosticSite, DiagnosticsSnapshot, HttpObservation, SitePriority } from '../diagnostics/types';
import { Status } from './Status';
import { ClearableInput } from './ProxyEntry';
import { UsageControls, UsageOverview } from './UsageControls';
import { diagnosticHash, parseDiagnosticHash, type DiagnosticSection } from './optionsRoute';

type Panel = DiagnosticSection;
const statusKeys: Record<CheckKind, TranslationKey> = {
  http_ok: 'diagHttpOk', auth_required: 'diagAuthRequired',
  forbidden: 'diagForbidden', rate_limited: 'diagRateLimited',
  proxy_auth: 'diagProxyAuth', redirect: 'diagRedirect',
  http_error: 'diagHttpError', timeout: 'diagTimeout',
  network_error: 'diagNetworkError', permission: 'diagPermission',
  cancelled: 'diagCancelled'
};
const diagnosisKeys: Record<DiagnosisCode, [TranslationKey, TranslationKey]> = {
  control_conflict: ['diagIssueControl', 'diagFixControl'],
  not_applied: ['diagIssueNotApplied', 'diagFixNotApplied'],
  credentials: ['diagIssueCredentials', 'diagFixCredentials'],
  local_gateway: ['diagIssueLocalGateway', 'diagFixLocalGateway'],
  proxy_auth: ['diagIssueProxyAuth', 'diagFixProxyAuth'],
  site_blocked: ['diagIssueForbidden', 'diagFixForbidden'],
  site_rate_limited: ['diagIssueRateLimited', 'diagFixRateLimited'],
  network_failure: ['diagIssueNetwork', 'diagFixNetwork'],
  limited_evidence: ['diagIssueEvidence', 'diagFixEvidence']
};
function latestFor(siteId: string, data: DiagnosticsSnapshot | null): HttpObservation | null {
  return data?.observations.find(v => v.siteId === siteId) ?? null;
}
export function DiagnosticsPage({ state, busy, onRefresh, onProbe, onStop, onProfiles }: {
  state: ViewState;
  busy: boolean;
  onRefresh: () => Promise<unknown>;
  onProbe: () => Promise<unknown>;
  onStop: () => Promise<unknown>;
  onProfiles: () => void;
}) {
  const { t, locale } = useI18n();
  const panelContent = useRef<HTMLElement>(null);
  const focusPanelAfterNavigation = useRef(false);
  const navigation = getEnvironment().navigation;
  const [panel, updatePanel] = useState<Panel>(() => parseDiagnosticHash(navigation.getRoute()));
  function setPanel(next: Panel) {
    const hash = diagnosticHash(next);
    if (navigation.getRoute() !== hash) getEnvironment().navigate(hash);
  }
  useEffect(() => {
    const restorePanel = () => updatePanel(parseDiagnosticHash(navigation.getRoute()));
    const unsubscribe = navigation.subscribe(restorePanel);
    restorePanel();
    return unsubscribe;
  }, [navigation]);
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [selectedIds, setSelectedIds] = useState<string[]>(AI_SITES.slice(0, 5).map(s => s.id));
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [domain, setDomain] = useState('');
  const [priority, setPriority] = useState<SitePriority>('P0');
  useEffect(() => {
    if (!focusPanelAfterNavigation.current) return;
    focusPanelAfterNavigation.current = false;
    panelContent.current?.focus();
  }, [panel]);
  function openPanel(next: Panel) {
    // Overview actions disappear after navigation. Transfer focus only for
    // those actions; the tablist retains its existing roving keyboard focus.
    focusPanelAfterNavigation.current = true;
    setPanel(next);
  }
  const load = useCallback(async () => {
    try {
      const result = await request({ type: 'GET_DIAGNOSTICS' });
      if (result.ok && result.diagnostics) setSnapshot(result.diagnostics);
    } catch { /* Last completed evidence is kept with its revision marker. */ }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    // A clock update is display-only; it must never trigger network scanning.
    const updateClock = () => setNow(Date.now());
    const timer = window.setInterval(updateClock, 60_000);
    window.addEventListener('focus', updateClock);
    document.addEventListener('visibilitychange', updateClock);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', updateClock);
      document.removeEventListener('visibilitychange', updateClock);
    };
  }, []);
  useEffect(() => {
    // Keep multiple Options/Popup tabs in agreement: saved checks and route
    // changes can originate from a different extension page or the worker.
    const watched = new Set([
      'aiProxy.config.v2', 'aiProxy.applied.v1', 'aiProxy.diagnostics.epoch.v1',
      'aiProxy.diagnostics.favorites.v1', 'aiProxy.diagnostics.favorites.v2',
      'aiProxy.diagnostics.observations.v1'
    ]);
    const onChanged = (changes: Record<string, any>, area: string) => {
      if (area !== 'local' || !Object.keys(changes).some(key => watched.has(key))) return;
      const routeChanged = Boolean(changes['aiProxy.config.v2'] ||
        changes['aiProxy.applied.v1'] || changes['aiProxy.diagnostics.epoch.v1']);
      if (routeChanged) {
        setSnapshot(null);
        void onRefresh();
      }
      void load();
    };
    getEnvironment().storage.onChanged.addListener(onChanged);
    return () => getEnvironment().storage.onChanged.removeListener(onChanged);
  }, [load, onRefresh]);
  useEffect(() => {
    // A third-party extension or browser policy can change the actual Chrome
    // proxy setting without touching our storage namespace.
    const onProxyChanged = () => {
      setSnapshot(null);
      void onRefresh();
      void load();
    };
    getEnvironment().proxy.settings.onChange.addListener(onProxyChanged);
    return () => getEnvironment().proxy.settings.onChange.removeListener(onProxyChanged);
  }, [load, onRefresh]);
  useEffect(() => {
    if (!running && !snapshot?.activeRun) return;
    const timer = setInterval(() => { void load(); }, 650);
    return () => clearInterval(timer);
  }, [running, snapshot?.activeRun, load]);
  // On a route/settings transition, show old observations as stale until the new
  // context digest is read; never reuse an old success as a new route's result.
  useEffect(() => { setSnapshot(null); void load(); }, [state.config, state.runtime.control, state.runtime.applied, load]);

  const submit = useCallback(async (command: Request): Promise<boolean> => {
    try {
      const result = await request(command);
      if (!result.ok) { setError(result.error.includes('Invalid public HTTPS domain')
        ? t('diagInvalidDomain') : t('diagOperationFailed')); return false; }
      if (result.diagnostics) setSnapshot(result.diagnostics);
      setError('');
      return true;
    } catch { setError(t('diagBackgroundUnavailable')); return false; }
  }, [t]);
  async function test(ids: string[]) {
    if (running || snapshot?.activeRun || !ids.length) return;
    setRunning(true);
    setError('');
    try { await submit({ type: 'RUN_DIAGNOSTICS', siteIds: ids }); }
    finally { setRunning(false); void load(); }
  }
  async function save(event: FormEvent) {
    const revision=getEnvironment().getDraftRevision('diagnostic-site');
    event.preventDefault();
    setSaving(true);
    try {
      if (await submit({ type: 'SAVE_DIAGNOSTIC_SITE', domain: domain.trim(), priority }) && getEnvironment().setDraftDirty(false,'diagnostic-site',revision)) setDomain('');
    } finally { setSaving(false); }
  }
  const favorites = useMemo(() => [...(snapshot?.favorites ?? [])].sort((a, b) =>
    Number(a.priority === 'P1') - Number(b.priority === 'P1') ||
    // A user-specified work domain must never disappear behind the five built-in AI defaults.
    Number(a.kind === 'ai') - Number(b.kind === 'ai')), [snapshot?.favorites]);
  const current = useMemo(() => {
    const seen = new Set<string>();
    const checkedNow = Date.now();
    return (snapshot?.observations ?? []).filter(o => {
      if (!snapshot || !observationIsCurrent(o, snapshot.configRevision, checkedNow) ||
        seen.has(o.siteId)) return false;
      seen.add(o.siteId);
      return true;
    });
  }, [snapshot, now]);
  const selectedProfile = state.config.profiles.find(v => v.id === state.config.selection.profileId);
  const localEndpoint = selectedProfile?.kind === 'endpoint' &&
    state.config.endpoints.some(e => e.id === selectedProfile.endpointId &&
      (e.host === '127.0.0.1' || e.host === 'localhost' || e.host === '::1'));
  const issues = diagnosisCodes({
    control: state.runtime.control, applied: state.runtime.applied,
    managedIntent: state.runtime.managedIntent,
    credentialRequired: state.runtime.credentialRequired,
    // Never blame the desired local client when Chrome did not apply that route.
    localEndpoint: state.runtime.applied && !!localEndpoint, results: current
  });
  const locked = running || !!snapshot?.activeRun;
  const latestObservation = (id: string) => latestFor(id, snapshot);
  const renderResult = (site: DiagnosticSite | typeof AI_SITES[number]) => {
    const result = latestObservation(site.id);
    // The page may have been open before this request completed. Never compare
    // a fresh network observation against an older time cached at mount.
    const stale = !!result && (!snapshot ||
      !observationIsCurrent(result, snapshot.configRevision, Date.now()));
    return <div className="diagnosticResult" aria-live="polite">
      {!result ? <span className="subtleTag">{t('notTested')}</span> :
        <><span className={stale ? 'subtleTag' : 'diagnosticResultLabel'}>{stale ? t('diagStale') : t(statusKeys[result.kind])}</span>
          {!stale && result.httpStatus !== null && <small>HTTP {result.httpStatus}</small>}
          {!stale && result.elapsedMs !== null && <small>{result.elapsedMs} ms</small>}
          <small title={t('diagExtensionEvidence')}>{new Intl.DateTimeFormat(locale, {
            dateStyle: 'short', timeStyle: 'short'
          }).format(result.checkedAt)}</small></>}
    </div>;
  };
  return <>
    <div className="diagnosticLead">
      <h2>{t('checkBrowserSettingsSeparatelyFromNetworkConnectivity')}</h2>
      <p>{t('diagLeadExplanation')}</p>
      <span className="diagnosticEvidence">{t('diagEvidenceOnly')}</span>
    </div>
    <div className="diagnosticMetrics" aria-label={t('currentDiagnosticsSummary')}>
      <div><small>{t('proxyControl')}</small><strong>{state.runtime.control === 'controlled_by_this_extension'
        ? t('controlledByThisExtension') : state.runtime.control === 'controlled_by_other_extensions'
          ? t('controlledByAnotherExtension2') : t('controlNotConfirmed')}</strong>
        <small>Chrome Proxy API</small></div>
      <div><small>{t('configurationStatus')}</small><strong>{state.runtime.applied ? t('applied') : t('notConfirmed')}</strong>
        <small>{t('doesNotProveReachability')}</small></div>
      <div><small>{t('diagSitesChecked')}</small><strong>{current.length} / {AI_SITES.length}</strong>
        <small>{current.length === 0 ? t('notTested') : t('diagCurrentRouteOnly')}</small></div>
      <div><small>{t('diagRunStatus')}</small><strong>{locked ? t('diagRunning') : t('diagIdle')}</strong>
        <small>{snapshot?.activeRun ? t('diagProgress', {
          done: snapshot.activeRun.completed, total: snapshot.activeRun.total
        }) : t('diagOnDemandOnly')}</small></div>
    </div>
    <div className="diagnosticTabs" role="tablist" aria-label={t('diagnosticCategories')}>
      {([
        ['overview',t('overview')],['ai',t('aiSites')],['top',t('prioritySites')],
        ['speed',t('speedTest')],['proxy',t('basicDiagnostics')]
      ] as const).map(([id,label]) => <Button key={id} role="tab" id={'diagnostic-tab-' + id}
        aria-selected={panel === id} aria-controls="diagnostic-panel"
        tabIndex={panel === id ? 0 : -1}
        onKeyDown={event => {
          if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
          event.preventDefault();
          const tabs = Array.from(event.currentTarget.parentElement!
            .querySelectorAll<HTMLButtonElement>('[role="tab"]'));
          const index = tabs.indexOf(event.currentTarget);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
          const target = tabs[next];
          if (!target) return;
          target.click();
          target.focus();
          target.scrollIntoView({block:'nearest',inline:'nearest'});
        }}
        onClick={() => setPanel(id)}>{label}</Button>)}
    </div>
    {error && <p className="notice error" role="alert">{error}</p>}
    {locked && <div className="diagnosticRunProgress" role="status">
      <span>{t('diagRunning')} · {snapshot?.activeRun
        ? t('diagProgress', {done:snapshot.activeRun.completed, total:snapshot.activeRun.total}) : t('diagStarting')}</span>
      <Button onClick={() => void submit({ type:'CANCEL_DIAGNOSTICS' })}>{t('diagCancel')}</Button>
    </div>}
    <section ref={panelContent} id="diagnostic-panel" role="tabpanel" tabIndex={0} aria-labelledby={'diagnostic-tab-' + panel} className="diagnosticPanel">
      {panel === 'overview' && <div className="diagnosticOverview">
        <article className="diagnosticFeature">
          <small>{t('selected')}</small>
          <h3>{state.config.selection.mode === 'profile'
            ? selectedProfile?.name ?? t('noProfileSelected')
            : t(({ rules: 'popupModeRules', direct: 'popupModeDirect', system: 'popupModeSystem' } as const)[state.config.selection.mode])}</h3>
          <p>{state.runtime.applied ? t('diagProxyAppliedCaveat') : t('diagCheckProxySettings')}</p>
          <Button onClick={() => openPanel('proxy')}>{t('viewActualControlStatus')}</Button>
        </article>
        <article className="diagnosticFeature">
          <small>{t('priorityScenario')}</small><h3>{t('aiSiteAvailability')}</h3>
          <p>{t('diagAiFirstFive')}</p>
          <div className="actions">
            <Button variant="primary" className="primary" disabled={locked} onClick={() =>
              void test(AI_SITES.slice(0, 5).map(s => s.id))}>{t('diagStartFive')}</Button>
            <Button onClick={() => openPanel('ai')}>{t('diagManageTests')}</Button>
          </div>
        </article>
        <article className="diagnosticFeature">
          <small>{t('customTargets')}</small><h3>{t('prioritySitesTop510')}</h3>
          <p>{t('diagFavoritesCount', {count: favorites.length})}</p>
          <UsageOverview />
          <Button data-testid="usage-manage" onClick={() => openPanel('top')}>{t('usageManage')}</Button>
        </article>
        <article className="diagnosticFeature">
          <small>{t('connectionSpeed')}</small><h3>{t('diagHttpTiming')}</h3>
          <p>{t('diagSpeedCaveat')}</p>
          <Button onClick={() => openPanel('speed')}>{t('diagSeeTiming')}</Button>
        </article>
      </div>}
      {panel === 'ai' && <div className="diagnosticSection">
        <div className="diagnosticSectionHead"><div><h3>{t('aiSiteAvailability')}</h3>
          <p className="hint">{t('diagAiListHelp')}</p></div>
          <div className="actions">
            <Button variant="primary" className="primary" disabled={locked || selectedIds.length === 0}
              onClick={() => void test(selectedIds)}>{t('diagCheckSelected', {count:selectedIds.length})}</Button>
          </div></div>
        <div className="diagnosticSiteList">{AI_SITES.map(site => {
          const favorite = favorites.some(f => f.id === site.id);
          return <article className="diagnosticSite" key={site.id}>
            <label className="diagnosticSiteName">
              <input type="checkbox" checked={selectedIds.includes(site.id)} disabled={locked}
                onChange={e => setSelectedIds(v => e.target.checked
                  ? [...v, site.id] : v.filter(id => id !== site.id))} />
              <span><strong>{site.name}</strong><small>{site.domain}</small></span>
            </label>
            {renderResult(site)}
            <div className="diagnosticSiteActions">
              <Button disabled={locked} onClick={() => void test([site.id])}>{t('diagTestOne')}</Button>
              <Button disabled={saving} onClick={() => void submit(favorite
                ? {type:'REMOVE_DIAGNOSTIC_SITE',id:site.id}
                : {type:'SAVE_DIAGNOSTIC_SITE',domain:site.domain,priority:'P1'})}
                aria-label={favorite ? t('diagRemoveFavorite') : t('diagAddFavorite')}>
                {favorite ? t('diagSaved') : t('diagAddFavorite')}</Button>
            </div>
          </article>;
        })}</div>
        <p className="hint">{t('diagExtensionEvidence')}</p>
      </div>}
      {panel === 'top' && <div className="diagnosticSection">
        <UsageControls favorites={snapshot?.favorites ?? []} locked={locked} saving={saving}
          submit={submit} test={test} renderResult={renderResult}>
          <form data-draft-scope="diagnostic-site" className="diagnosticAddSite" onSubmit={e => void save(e)}>
            <label htmlFor="diag-add-domain">{t('diagAddDomain')}</label>
            <ClearableInput id="diag-add-domain" fieldLabel={t('diagAddDomain')} value={domain} onValueChange={setDomain}
              placeholder="example.org" required maxLength={253} autoComplete="off"/>
            <select value={priority} onChange={e => setPriority(e.target.value as SitePriority)}
              aria-label={t('diagPriority')}><option value="P0">P0</option><option value="P1">P1</option></select>
            <Button type="submit" disabled={saving}>{t('diagSaveSite')}</Button>
          </form>
          <p className="hint">{t('diagCustomManualOnly')}</p>
        </UsageControls>
      </div>}

      {panel === 'speed' && <div className="diagnosticSection">
        <h3>{t('diagHttpTiming')}</h3><p className="hint">{t('diagSpeedCaveat')}</p>
        <div className="diagnosticSiteList">{AI_SITES.map(site => {
          const stats = snapshot?.statistics[site.id];
          return <article className="diagnosticSite" key={site.id}>
            <div className="diagnosticSiteName"><strong>{site.name}</strong><small>{site.domain}</small></div>
            <div className="diagnosticResult">
              <small>{t('diagAttemptSummary', {success:stats?.successes ?? 0,
                attempts:stats?.attempts ?? 0})}</small>
              <small>p50: {stats?.p50Ms === null || stats?.p50Ms === undefined ? '—' : stats.p50Ms + ' ms'}</small>
              <small>p95: {stats?.p95Ms === null || stats?.p95Ms === undefined ? '—' : stats.p95Ms + ' ms'}</small>
            </div>
            <Button disabled={locked} onClick={() => void test([site.id])}>{t('diagTestOne')}</Button>
          </article>;
        })}</div>
        <p className="hint">{t('diagNoThroughput')}</p>
      </div>}
      {panel === 'proxy' && <div className="basicDiagnostic diagnosticSection">
        <h3>{t('basicProxyDiagnostics')}</h3>
        <p className="hint">{t('theseValuesComeFromRealChromeApisExtensionOnly')}</p>
        <Status status={state.runtime} />
        <div className="actions">
          <Button variant="primary" className="primary" disabled={busy} onClick={() => void onProbe()}>{t('probeApiIpifyOrg')}</Button>
          <Button disabled={busy} onClick={() => { void onRefresh(); void load(); }}>{t('refreshState')}</Button>
          <Button disabled={busy} onClick={() => void onStop()}>{t('stopManagingAndReleaseControl')}</Button>
        </div>
        <p className="hint">{t('theProbeTargetsApiIpifyOrgExtensionRequestsAlone')}</p>
      </div>}
      {(panel === 'proxy' || panel === 'overview') && <div className="diagnosticIssues">
        <h3>{t('diagTroubleshoot')}</h3>
        {issues.map(code => <article key={code} className="diagnosticIssue">
          <strong>{t(diagnosisKeys[code][0])}</strong>
          <p>{t(diagnosisKeys[code][1])}</p>
          <div className="actions">
            <Button onClick={onProfiles}>{t('diagCheckSettings')}</Button>
            <Button disabled={locked} onClick={() => void test([selectedIds[0] ?? 'chatgpt'])}>{t('diagRetest')}</Button>
          </div>
        </article>)}
      </div>}
    </section>
  </>;
}
