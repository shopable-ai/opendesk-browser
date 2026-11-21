import * as React from 'react';
import {getEnvironment} from '../environment';
import {Button} from '@opendesk/ui';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/LocaleProvider';
import type { TranslationKey } from '../i18n/locale';
import { request, type Request } from '../domain/messages';
import type { ViewState } from '../domain/types';
import { AI_SITES, PUBLIC_HTTPS_CHECK } from '../diagnostics/catalog';
import { diagnosisCodes, observationIsCurrent, type DiagnosisCode } from '../diagnostics/logic';
import type { CheckKind, DiagnosticSite, DiagnosticsSnapshot, HttpObservation, SitePriority } from '../diagnostics/types';
import { Status, statusLabelKey } from './Status';
import { ClearableInput } from './ProxyEntry';
import { prioritizeFavorites, favoriteGroup, MAX_FAVORITES } from '../diagnostics/favorites';
import { diagnosticHash, parseDiagnosticHash, type DiagnosticSection } from './optionsRoute';

type Panel = DiagnosticSection;
const statusKeys: Record<CheckKind, TranslationKey> = {
  response_limit: 'diagResponseLimit', http_ok: 'diagHttpOk', auth_required: 'diagAuthRequired',
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
export function DiagnosticsPage({ state, busy, onRefresh, onStop, onProfiles, presentation = 'sidebar', currentSiteRevision = 0 }: {
  state: ViewState;
  busy: boolean;
  onRefresh: () => Promise<unknown>;
  onStop: () => Promise<unknown>;
  onProfiles: () => void;
  presentation?: 'sidebar' | 'management' | 'quick';
  currentSiteRevision?: number;
}) {
  const { t, locale } = useI18n();
  const management = presentation === 'management';
  const quick = presentation === 'quick';
  const panelContent = useRef<HTMLElement>(null);
  const focusPanelAfterNavigation = useRef(false);
  const navigation = getEnvironment().navigation;
  // Only the isolated preview adapter has simulated diagnostics and usage state.
  const simulatedDiagnostics = getEnvironment().preview === true;
  const httpDiagnostics = simulatedDiagnostics || getEnvironment().httpDiagnostics === true;
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
  const [siteHost,setSiteHost]=useState('');
  const [currentDomain,setCurrentDomain]=useState('');
  const [currentReason,setCurrentReason]=useState<string | null>('unavailable');
  const [currentObservation,setCurrentObservation]=useState<HttpObservation | undefined>(undefined);
  const pageGeneration=useRef(0);
  const currentTarget=useRef('');
  const currentCheckStarted=useRef<number | null>(null);
  useEffect(()=>{
    if(management)return;
    const env=getEnvironment();let mounted=true;
    const read=async()=>{
      const generation=++pageGeneration.current;
      currentTarget.current='';setSiteHost('');setCurrentDomain('');
      currentCheckStarted.current=null;
      setCurrentReason('unavailable');setCurrentObservation(undefined);
      try {
        const info=await env.currentSite();
        if(!mounted||generation!==pageGeneration.current)return;
        setSiteHost(info.status==='available'?info.host:'');
        const domain=info.status==='available'?info.diagnosticDomain:null;
        currentTarget.current=domain??'';setCurrentDomain(domain??'');
        setCurrentReason(info.diagnosticReason??'unavailable');
      } catch { /* The target was already cleared before this read. */ }
    };
    void read();env.events.addEventListener('ai-proxy-page-changed',read);
    return()=>{mounted=false;pageGeneration.current++;currentTarget.current='';env.events.removeEventListener('ai-proxy-page-changed',read);};
  },[management,currentSiteRevision]);
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [selectedIds, setSelectedIds] = useState<string[]>(AI_SITES.slice(0, 5).map(s => s.id));
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadError,setLoadError]=useState(false);
  const operationGeneration=useRef(0);
  const mutationPending=useRef(false);
  const runPending=useRef(false);
  const [domain, setDomain] = useState('');
  const [priority, setPriority] = useState<SitePriority>('P0');
  const active = useRef(true);
  const readGeneration = useRef(0);
  useEffect(()=>{
    active.current=true;
    return()=>{
      active.current=false;readGeneration.current++;operationGeneration.current++;
      if(httpDiagnostics)void request({type:'CANCEL_DIAGNOSTICS'}).catch(()=>{});
    };
  },[httpDiagnostics]);
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
    const token=++readGeneration.current;
    if (!httpDiagnostics) { setSnapshot(null); return; }
    try {
      const result = await request({ type: 'GET_DIAGNOSTICS' });
      if (!active.current || token!==readGeneration.current) return;
      if (!result.ok || !result.diagnostics) {setLoadError(true);return;}
      setSnapshot(result.diagnostics);setLoadError(false);
      const observation=result.diagnostics.observations.find(item=>item.siteId==='current:'+currentTarget.current);
      setCurrentObservation(currentCheckStarted.current!==null&&observation&&observation.checkedAt>=currentCheckStarted.current&&
        observationIsCurrent(observation,result.diagnostics.configRevision,Date.now())?observation:undefined);
    } catch { if(active.current&&token===readGeneration.current)setLoadError(true); }
  }, [httpDiagnostics]);
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
  // context digest is read. A status refresh clones config even when its ETag
  // is unchanged, so use the revision to avoid interrupting active polling.
  useEffect(() => { setSnapshot(null); void load(); }, [state.configEtag, state.runtime.control, state.runtime.applied, load]);

  const submit = useCallback(async (command: Request, page?: number): Promise<boolean> => {
    if (!httpDiagnostics) { setError(t('diagProductionUnavailable')); return false; }
    const mutation=['SAVE_DIAGNOSTIC_SITE','REMOVE_DIAGNOSTIC_SITE','MOVE_DIAGNOSTIC_SITE'].includes(command.type);
    if(mutation&&(mutationPending.current||runPending.current||busy||snapshot?.activeRun))return false;
    if(mutation){mutationPending.current=true;setSaving(true);}
    const token=++operationGeneration.current;
    readGeneration.current++;
    const valid=()=>active.current&&token===operationGeneration.current&&(page===undefined||page===pageGeneration.current);
    try {
      const result = await request(command);
      if(!valid())return false;
      if (!result.ok) { setError(result.error.includes('Invalid public HTTPS domain')
        ? t('diagInvalidDomain') : t('diagOperationFailed')); return false; }
      if (result.diagnostics) {
        readGeneration.current++;
        setSnapshot(result.diagnostics);
        if(page!==undefined){
          const observation=result.diagnostics.observations.find(item=>item.siteId==='current:'+currentTarget.current);
          setCurrentObservation(!result.diagnostics.activeRun&&currentCheckStarted.current!==null&&observation&&
            observation.checkedAt>=currentCheckStarted.current&&observationIsCurrent(observation,result.diagnostics.configRevision,Date.now())?observation:undefined);
        }
      } else await load();
      if(valid())setError('');
      return valid();
    } catch { if(valid())setError(t('diagBackgroundUnavailable')); return false; }
    finally {if(mutation){mutationPending.current=false;if(active.current)setSaving(false);}}
  }, [httpDiagnostics, t, load, busy, snapshot?.activeRun]);
  async function test(ids: string[], currentPage = false) {
    if (!httpDiagnostics || busy || runPending.current || mutationPending.current || snapshot?.activeRun || !ids.length || !ids[0]) return;
    const page=pageGeneration.current;
    if(currentPage&&ids[0]!==currentTarget.current)return;
    if(currentPage){currentCheckStarted.current=Date.now();setCurrentObservation(undefined);}
    runPending.current=true;setRunning(true);setError('');
    try { await submit(currentPage
      ? {type:'RUN_CURRENT_DIAGNOSTIC',expectedDomain:ids[0]!}
      : {type:'RUN_DIAGNOSTICS',siteIds:ids},currentPage?page:undefined); }
    finally {runPending.current=false;if(active.current)setRunning(false);}
  }
  async function save(event: FormEvent) {
    const revision=getEnvironment().getDraftRevision('diagnostic-site');
    event.preventDefault();
    if(!httpDiagnostics||locked||saving||!snapshot||favorites.length>=MAX_FAVORITES)return;
    if (await submit({ type: 'SAVE_DIAGNOSTIC_SITE', domain: domain.trim(), priority }) && active.current &&
      getEnvironment().setDraftDirty(false,'diagnostic-site',revision)) setDomain('');
  }
  const favorites = useMemo(() => prioritizeFavorites(snapshot?.favorites ?? []), [snapshot?.favorites]);
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
  const modeKeys = { system: 'popupModeSystem', direct: 'popupModeDirect',
    profile: 'useAProfile', rules: 'popupModeRules' } as const;
  const activeSelection = state.runtime.activeSelection;
  // Only the selection is retained, not historical profile names or endpoints.
  const activeLabel = activeSelection ? t(modeKeys[activeSelection.mode]) +
    (activeSelection.mode === 'profile' && activeSelection.profileId ? ` (${activeSelection.profileId})` : '') : null;
  const selectionApplied = state.runtime.applied && !state.runtime.pendingChanges;
  const localEndpoint = selectedProfile?.kind === 'endpoint' &&
    state.config.endpoints.some(e => e.id === selectedProfile.endpointId &&
      (e.host === '127.0.0.1' || e.host === 'localhost' || e.host === '::1'));
  const issues = diagnosisCodes({
    control: state.runtime.control, applied: state.runtime.applied,
    managedIntent: state.runtime.managedIntent,
    credentialRequired: state.runtime.credentialRequired,
    // Never blame the desired local client when Chrome did not apply that route.
    localEndpoint: selectionApplied && !!localEndpoint, results: current
  });
  const diagnosticRunning = running || !!snapshot?.activeRun;
  const locked = busy || diagnosticRunning;
  const latestObservation = (id: string) => latestFor(id, snapshot);
  const renderResult = (site: Pick<DiagnosticSite,'id'|'domain'|'name'>, currentSite = false) => {
    const result = currentSite ? currentObservation : latestObservation(site.id);
    // The page may have been open before this request completed. Never compare
    // a fresh network observation against an older time cached at mount.
    const stale = !!result && (!snapshot ||
      !observationIsCurrent(result, snapshot.configRevision, Date.now()));
    return <div className="diagnosticResult" aria-live="polite">
      {!result ? <span className="subtleTag">{t('notTested')}</span> :
        <><span className={stale ? 'subtleTag' : 'diagnosticResultLabel'}>{stale ? t('diagStale') : (simulatedDiagnostics ? t('diagSimulated') : '') + t(statusKeys[result.kind])}</span>
          {!stale && result.httpStatus !== null && <small>HTTP {result.httpStatus}</small>}
          {!stale && result.elapsedMs !== null && <small>{result.elapsedMs} ms</small>}
          <small title={t(simulatedDiagnostics?'diagExtensionEvidence':'diagEvidenceBoundary')}>{new Intl.DateTimeFormat(locale, {
            dateStyle: 'short', timeStyle: 'short'
          }).format(result.checkedAt)}</small></>}
    </div>;
  };
  const currentSiteCard = <article className={quick?'diagnosticCurrentSite':'diagnosticFeature diagnosticCurrentSite'}>
    {!quick&&<><div className="diagnosticCardHeading"><small>{t('currentWebsite')}</small></div>
    <h3>{t('pcDiagCurrentTitle')}</h3></>}
    <strong className="diagnosticHost">{currentDomain?'https://'+currentDomain+'/':siteHost||t('apSiteUnavailable')}</strong>
    {currentDomain&&renderResult({id:'current:'+currentDomain,domain:currentDomain,name:currentDomain},true)}
    <p className="hint" id="current-site-check-help">{t(!httpDiagnostics?'pcDiagCurrentUnavailable':currentDomain?'diagCurrentSafeHelp':
      currentReason==='https-required'?'diagCurrentHttpsRequired':currentReason==='public-host-required'?'diagCurrentPublicRequired':'diagCurrentUnavailable')}</p>
    <div className="actions"><Button variant="primary" className="primary" disabled={!httpDiagnostics||!currentDomain||locked||saving}
      aria-describedby="current-site-check-help" onClick={()=>void test([currentDomain],true)}>{t('pcDiagCheckCurrent')}</Button>
      {!quick&&<Button onClick={()=>openPanel('proxy')}>{t('pcDiagProxySettings')}</Button>}</div>
  </article>;
  if(quick)return <div className="quickCurrentDiagnostic">
    {currentSiteCard}
    <p className="r86Help">{t('diagEvidenceBoundary')}</p>
    {loadError&&<div className="notice error" role="alert"><p>{t('diagLoadFailed')}</p><Button onClick={()=>void load()}>{t('usageRetry')}</Button></div>}
    {error&&<p className="notice error" role="alert">{error}</p>}
    {diagnosticRunning&&<div role="status"><span>{t('diagRunning')}</span><Button onClick={()=>void submit({type:'CANCEL_DIAGNOSTICS'})}>{t('diagCancel')}</Button></div>}
  </div>;
  return <>
    <header className="diagnosticLead" data-presentation={presentation}>
      <div className="diagnosticLeadMain">
        <h2>{t(management?'pcDiagLead':'diagWorkbenchTitle')}</h2>
        {!management && <p>{t(simulatedDiagnostics ? 'diagLeadExplanation' : 'diagEvidenceBoundary')}</p>}
        <span className="diagnosticCurrentRoute">{t('selected')}: {state.config.selection.mode === 'profile'
          ? selectedProfile?.name ?? t('noProfileSelected')
          : t(({ rules: 'popupModeRules', direct: 'popupModeDirect', system: 'popupModeSystem' } as const)[state.config.selection.mode])}</span>
        <span className="diagnosticEvidence">{t(simulatedDiagnostics ? 'diagEvidenceOnly' : 'diagOnDemandOnly')}</span>
      </div>
      <div className="diagnosticLeadState" aria-label={t(management || simulatedDiagnostics ? 'diagModelVerification' : 'configurationStatus')}>
        <strong>{t(management || simulatedDiagnostics ? 'notTested' : statusLabelKey(state.runtime))}</strong>
        <small>{t(management || simulatedDiagnostics ? 'diagModelVerification' : 'configurationStatus')}</small>
      </div>
    </header>
    {(!management || panel !== 'overview') && <p className="diagnosticActiveRoute">{activeLabel
      ? t('chromeStillUsingLastConfirmedMode', {mode: activeLabel})
      : t('chromeSettingsAreUnverifiedTheActualWebsiteRouteCannot')}</p>}
    {management&&(state.runtime.permission===false||state.runtime.control==='unknown'||state.runtime.credentialRequired||state.runtime.outcomeUnknown||state.runtime.proxyError)&&<Status status={state.runtime} compact/>}
    <div className="diagnosticMetrics" aria-label={t('currentDiagnosticsSummary')}>
      <div><small>{t('proxyControl')}</small><strong>{state.runtime.control === 'controlled_by_this_extension'
        ? t('controlledByThisExtension') : state.runtime.control === 'controlled_by_other_extensions'
          ? t('controlledByAnotherExtension2') : t('controlNotConfirmed')}</strong>
        <small>Chrome Proxy API</small></div>
      {management?<>
        <div><small>{t('pcDiagFavoriteTests')}</small><strong>{httpDiagnostics?`${current.filter(result=>favorites.some(site=>site.id===result.siteId)).length} / ${favorites.length}`:t('notTested')}</strong></div>
        <div><small>{t('currentWebsite')}</small><strong>{t('diagCurrentInSidebar')}</strong></div>
        <div><small>{t('pcDiagModel')}</small><strong>{t('notTested')}</strong></div>
      </>:<>      <div><small>{t('configurationStatus')}</small><strong>{t(statusLabelKey(state.runtime))}</strong>
        <small>{t('doesNotProveReachability')}</small></div>
      <div><small>{t(simulatedDiagnostics ? 'diagSitesChecked' : 'diagSitesLive')}</small><strong>{httpDiagnostics ? `${current.filter(item=>item.siteId!==PUBLIC_HTTPS_CHECK.id).length} / ${AI_SITES.length}` : t('notTested')}</strong>
        <small>{!simulatedDiagnostics ? t('diagModelVerification') : current.length === 0 ? t('notTested') : t('diagCurrentRouteOnly')}</small></div>
      <div><small>{t('diagRunStatus')}</small><strong>{!httpDiagnostics ? t('notAvailable') : diagnosticRunning ? t('diagRunning') : t('diagIdle')}</strong>
        <small>{snapshot?.activeRun ? t('diagProgress', {
          done: snapshot.activeRun.completed, total: snapshot.activeRun.total
        }) : t('diagOnDemandOnly')}</small></div>
</>}
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
        onClick={() => setPanel(id)}>{management ? <><span className="diagnosticTabGlyph" aria-hidden="true">{({overview:'⌂',ai:'◉',top:'☆',speed:'↗',proxy:'≡'} as const)[id]}</span>{label}</> : label}</Button>)}
    </div>
    {!simulatedDiagnostics && <p className="diagnosticRuntimeNotice" role="status">{t(httpDiagnostics?'diagLiveBoundary':'diagProductionUnavailable')}</p>}
    {simulatedDiagnostics && <p className="diagnosticRuntimeNotice" role="status">{t('diagPreviewOnly')}</p>}
    {loadError && <div className="notice error" role="alert"><p>{t('diagLoadFailed')}</p><Button onClick={()=>void load()}>{t('usageRetry')}</Button></div>}
    {error && <p className="notice error" role="alert">{error}</p>}
    {diagnosticRunning && <div className="diagnosticRunProgress" role="status">
      <span>{t('diagRunning')} · {snapshot?.activeRun
        ? t('diagProgress', {done:snapshot.activeRun.completed, total:snapshot.activeRun.total}) : t('diagStarting')}</span>
      <Button variant="secondary" onClick={() => void submit({ type:'CANCEL_DIAGNOSTICS' })}>{t('diagCancel')}</Button>
    </div>}
    <section ref={panelContent} id="diagnostic-panel" role="tabpanel" tabIndex={0} aria-labelledby={'diagnostic-tab-' + panel} className="diagnosticPanel">
      {panel === 'overview' && management && <div className="diagnosticOverviewManagement">
        <div className="diagnosticOverviewCards">
          <article className="diagnosticFeature diagnosticCurrentSite"><div className="diagnosticCardHeading"><small>{t('currentWebsite')}</small></div><h3>{t('diagCurrentInSidebar')}</h3><p>{t('diagCurrentSidebarHelp')}</p><div className="actions"><Button onClick={()=>openPanel('proxy')}>{t('pcDiagProxySettings')}</Button></div></article>
          <article className="diagnosticFeature diagnosticAiSummary">
            <div className="diagnosticCardHeading"><small>{t('aiSites')}</small><span className="diagnosticCornerBadge">{AI_SITES.length} · {t('aiSites')}</span></div><h3>{t('pcDiagAiTitle')}</h3><p>{t('pcDiagAiHelp')}</p>
            <div className="diagnosticQuickSites">{AI_SITES.slice(0,3).map(site=><div className="diagnosticQuickSite" key={site.id}><span className="diagnosticSiteGlyph" aria-hidden="true">{site.name[0]}</span><div><strong>{site.name}</strong>{renderResult(site)}</div></div>)}</div>
            <div className="actions"><Button variant="primary" className="primary" disabled={!httpDiagnostics||locked} onClick={()=>void test(AI_SITES.slice(0,5).map(s=>s.id))}>{t('diagStartFive')}</Button><Button onClick={()=>openPanel('ai')}>{t('pcDiagViewAll')}</Button></div>
          </article>
        </div>
        <div className="diagnosticOverviewShortcuts">
          <article><span className="diagnosticShortcutGlyph" aria-hidden="true">☆</span><div><small>{t('pcDiagFavorites')}</small><h3>{t('prioritySites')}</h3><p>{httpDiagnostics?t('diagFavoritesCount',{count:favorites.length}):t('notAvailable')}</p></div><Button data-testid="usage-manage" onClick={()=>openPanel('top')}>{t('pcDiagView')}</Button></article>
          <article><span className="diagnosticShortcutGlyph" aria-hidden="true">↗</span><div><small>{t('connectionSpeed')}</small><h3>{t('pcDiagQuality')}</h3><p>{t(httpDiagnostics?'diagHttpTiming':'diagSpeedNotConnected')}</p></div><Button onClick={()=>openPanel('speed')}>{t('pcDiagTest')}</Button></article>
        </div>
      </div>}
      {panel === 'overview' && !management && <div className={'diagnosticOverview' + (management ? ' diagnosticOverviewManagement' : simulatedDiagnostics ? '' : ' diagnosticOverviewRuntime')}>
        {currentSiteCard}
        <article className={'diagnosticFeature' + (simulatedDiagnostics ? '' : ' diagnosticFeaturePrimary')}>
          <small>{t(simulatedDiagnostics ? 'selected' : 'proxyControl')}</small>
          <h3>{simulatedDiagnostics ? (state.config.selection.mode === 'profile'
            ? selectedProfile?.name ?? t('noProfileSelected')
            : t(({ rules: 'popupModeRules', direct: 'popupModeDirect', system: 'popupModeSystem' } as const)[state.config.selection.mode]))
            : t('basicProxyDiagnostics')}</h3>
          {simulatedDiagnostics ? <p>{t(statusLabelKey(state.runtime))}</p> : <Status status={state.runtime} compact />}
          {management && <p className="diagnosticActiveRoute">{activeLabel
            ? t('chromeStillUsingLastConfirmedMode', {mode: activeLabel})
            : t('chromeSettingsAreUnverifiedTheActualWebsiteRouteCannot')}</p>}
          <p>{selectionApplied ? t('diagProxyAppliedCaveat') : t('diagCheckProxySettings')}</p>
          <Button variant="secondary" onClick={() => openPanel('proxy')}>{t('viewActualControlStatus')}</Button>
        </article>
        <article className={'diagnosticFeature' + (simulatedDiagnostics ? '' : ' diagnosticFeatureSecondary')}>
          <small>{t('priorityScenario')}</small><h3>{t('aiSiteAvailability')}</h3>
          <p>{t(simulatedDiagnostics ? 'diagAiFirstFive' : httpDiagnostics?'diagLiveChecksHelp':'notAvailable')}</p>
          {management && <div className="diagnosticSiteList diagnosticQuickSites">
            {AI_SITES.slice(0, 3).map(site => <div className="diagnosticQuickSite" key={site.id}>
              <div className="diagnosticSiteName"><strong>{site.name}</strong></div>
              {renderResult(site)}
            </div>)}
          </div>}
          <div className="actions">
            <Button variant="primary" className="primary" disabled={!httpDiagnostics || locked} onClick={() =>
              void test(AI_SITES.slice(0, 5).map(s => s.id))}>{t('diagStartFive')}</Button>
            <Button variant="secondary" onClick={() => openPanel('ai')}>{t('diagManageTests')}</Button>
          </div>
        </article>
        <article className={'diagnosticFeature' + (simulatedDiagnostics ? '' : ' diagnosticFeatureSecondary')}>
          <small>{t('customTargets')}</small><h3>{t('prioritySites')}</h3>
          <p>{httpDiagnostics ? t('diagFavoritesCount', {count: favorites.length}) : t('notAvailable')}</p>
          <Button variant="secondary" data-testid="usage-manage" onClick={() => openPanel('top')}>{t('usageManage')}</Button>
        </article>
        <article className={'diagnosticFeature' + (simulatedDiagnostics ? '' : ' diagnosticFeatureSecondary')}>
          <small>{t('connectionSpeed')}</small><h3>{t(httpDiagnostics ? 'diagHttpTiming' : 'speedTest')}</h3>
          <p>{t(simulatedDiagnostics ? 'diagSpeedCaveat' : httpDiagnostics?'diagLiveTiming':'notAvailable')}</p>
          <Button variant="secondary" onClick={() => openPanel('speed')}>{t('diagSeeTiming')}</Button>
        </article>
      </div>}
      {panel === 'ai' && <div className="diagnosticSection">
        <div className="diagnosticSectionHead"><div><h3>{t('aiSiteAvailability')}</h3>
          <p className="hint">{t(simulatedDiagnostics?'diagAiListHelp':httpDiagnostics?'diagLiveChecksHelp':'notAvailable')}</p></div>
          <div className="actions">
            <Button variant="primary" className="primary" disabled={!httpDiagnostics || locked || selectedIds.length === 0}
              onClick={() => void test(selectedIds)}>{t('diagCheckSelected', {count:selectedIds.length})}</Button>
          </div></div>
        <div className="diagnosticSiteList">{AI_SITES.map(site => {
          const favorite = favorites.some(f => f.id === site.id);
          return <article className="diagnosticSite" key={site.id}>
            <label className="diagnosticSiteName">
              <input type="checkbox" checked={selectedIds.includes(site.id)} disabled={!httpDiagnostics || locked}
                onChange={e => setSelectedIds(v => e.target.checked
                  ? [...v, site.id] : v.filter(id => id !== site.id))} />
              <span><strong>{site.name}</strong><small>{site.domain}</small></span>
            </label>
            {renderResult(site)}
            <div className="diagnosticSiteActions">
              <Button variant="secondary" disabled={!httpDiagnostics || locked} onClick={() => void test([site.id])}>{t('diagTestOne')}</Button>
              <Button variant="secondary" disabled={!httpDiagnostics || locked || saving || !snapshot} onClick={() => void submit(favorite
                ? {type:'REMOVE_DIAGNOSTIC_SITE',id:site.id}
                : {type:'SAVE_DIAGNOSTIC_SITE',domain:site.domain,priority:'P1'})}
                aria-label={favorite ? t('diagRemoveFavorite') : t('diagAddFavorite')}>
                {favorite ? t('diagSaved') : t('diagAddFavorite')}</Button>
            </div>
          </article>;
        })}</div>
        <p className="hint">{t(simulatedDiagnostics ? 'diagExtensionEvidence' : 'diagEvidenceBoundary')}</p>
      </div>}
      {panel === 'top' && <div className="diagnosticSection">
        <div className="diagnosticSectionHead"><div><h3>{t('pcDiagFavorites')}</h3><p className="hint">{t('diagTopHelp')}</p></div>
          <Button disabled={!httpDiagnostics||locked||saving||!favorites.length} onClick={()=>void test(favorites.map(site=>site.id))}>{t('diagCheckSaved')}</Button></div>
        <form data-draft-scope="diagnostic-site" className="diagnosticAddSite" onSubmit={e=>void save(e)}>
          <label htmlFor="diag-add-domain">{t('diagAddDomain')}</label>
          <ClearableInput id="diag-add-domain" fieldLabel={t('diagAddDomain')} value={domain} onValueChange={setDomain}
            placeholder="example.org" required maxLength={253} autoComplete="off" disabled={!httpDiagnostics||saving||!snapshot}/>
          <select value={priority} onChange={e=>setPriority(e.target.value as SitePriority)} aria-label={t('diagPriority')} disabled={!httpDiagnostics||saving||!snapshot}>
            <option value="P0">P0</option><option value="P1">P1</option></select>
          <Button type="submit" disabled={!httpDiagnostics||locked||saving||!snapshot||favorites.length>=MAX_FAVORITES}>{t('diagSaveSite')}</Button>
        </form>
        <p className="hint">{t('diagCustomManualOnly')}</p>
        <p role="status">{t('diagFavoritesCapacity',{count:favorites.length,limit:MAX_FAVORITES})}</p>
        <div className="diagnosticSiteList">{favorites.map((site,index)=>{
          return <article className="diagnosticSite" key={site.id} data-site-id={site.id}>
            <div className="diagnosticSiteName"><strong>{site.name}</strong><small>{'https://'+site.domain+'/'}</small></div>
            {renderResult(site)}
            <div className="diagnosticSiteActions">
              <select value={site.priority} disabled={!httpDiagnostics||locked||saving} aria-label={t('diagPriorityFor',{site:site.name})}
                onChange={e=>void submit({type:'SAVE_DIAGNOSTIC_SITE',domain:site.domain,name:site.name,priority:e.target.value as SitePriority})}>
                <option value="P0">P0</option><option value="P1">P1</option></select>
              <Button disabled={!httpDiagnostics||locked||saving||index===0||favoriteGroup(favorites[index-1]!)!==favoriteGroup(site)} aria-label={t('usageMoveUpFor',{site:site.name})}
                onClick={()=>void submit({type:'MOVE_DIAGNOSTIC_SITE',id:site.id,direction:'up'})}>{t('usageMoveUp')}</Button>
              <Button disabled={!httpDiagnostics||locked||saving||index===favorites.length-1||favoriteGroup(favorites[index+1]!)!==favoriteGroup(site)} aria-label={t('usageMoveDownFor',{site:site.name})}
                onClick={()=>void submit({type:'MOVE_DIAGNOSTIC_SITE',id:site.id,direction:'down'})}>{t('usageMoveDown')}</Button>
              <Button disabled={!httpDiagnostics||locked||saving} onClick={()=>void test([site.id])}>{t('diagTestOne')}</Button>
              <Button disabled={!httpDiagnostics||locked||saving} aria-label={t('usageRemoveFor',{site:site.name})}
                onClick={()=>void submit({type:'REMOVE_DIAGNOSTIC_SITE',id:site.id})}>{t('diagRemoveFavorite')}</Button>
            </div>
          </article>;
        })}</div>
        {httpDiagnostics&&snapshot&&!favorites.length&&<p className="hint">{t('diagNoFavorites')}</p>}
      </div>}

      {panel === 'speed' && <div className="diagnosticSection">
        <h3>{t(httpDiagnostics ? 'diagHttpTiming' : 'speedTest')}</h3>
        <p className="hint">{t(simulatedDiagnostics?'diagSpeedCaveat':httpDiagnostics?'diagLiveTiming':'diagSpeedNotConnected')}</p>
        {httpDiagnostics && <p className="hint">{t(simulatedDiagnostics?'diagNoThroughput':'diagLiveNoThroughput')}</p>}
        {httpDiagnostics ? <div className="diagnosticSiteList">{AI_SITES.map(site => {
          const stats = snapshot?.statistics[site.id];
          return <article className="diagnosticSite" key={site.id}>
            <div className="diagnosticSiteName"><strong>{site.name}</strong><small>{site.domain}</small></div>
            <div className="diagnosticResult">
              <small>{t(simulatedDiagnostics ? 'diagAttemptSummary' : 'diagLiveAttemptSummary', {success:stats?.successes ?? 0,
                attempts:stats?.attempts ?? 0})}</small>
              <small>p50: {stats?.p50Ms === null || stats?.p50Ms === undefined ? '—' : stats.p50Ms + ' ms'}</small>
              <small>p95: {stats?.p95Ms === null || stats?.p95Ms === undefined ? '—' : stats.p95Ms + ' ms'}</small>
            </div>
            <Button variant="secondary" disabled={!httpDiagnostics || locked} onClick={() => void test([site.id])}>{t('diagTestOne')}</Button>
          </article>;
        })}</div> : <div className="diagnosticUnavailable" role="status">
          <p>{t('diagSpeedNotConnected')}</p>
        </div>}
      </div>}
      {panel === 'proxy' && <div className="basicDiagnostic diagnosticSection">
        <h3>{t('basicProxyDiagnostics')}</h3>
        <p className="hint">{t('theseValuesComeFromRealChromeApisExtensionOnly')}</p>
        <Status status={state.runtime} />
        {httpDiagnostics && <article className="diagnosticSite">
          <div><strong>{PUBLIC_HTTPS_CHECK.name}</strong><p className="hint">{t('diagLiveBoundary')}</p></div>
          {renderResult(PUBLIC_HTTPS_CHECK)}
          <Button disabled={busy||locked} onClick={()=>void test([PUBLIC_HTTPS_CHECK.id])}>{t('diagPublicHttps')}</Button>
        </article>}
        <div className="actions">
          <Button variant="secondary" disabled={busy} onClick={() => { void onRefresh(); void load(); }}>{t('refreshState')}</Button>
          <Button variant="secondary" className="diagnosticStopAction" disabled={busy || !(state.runtime.canStop || state.runtime.stopFinalizationPending)} onClick={() => void onStop()}>{t(state.runtime.stopFinalizationPending ? 'apFinishStop' : 'stopManagingAndReleaseControl')}</Button>
        </div>
        <div className="diagnosticUnavailable">
          <h4>{t('diagExitAndThroughput')}</h4>
          <p>{t(simulatedDiagnostics ? 'diagExitAndThroughputPreview' : 'diagExitAndThroughputUnavailable')}</p>
        </div>
      </div>}
      {(panel === 'proxy' || (panel === 'overview' && (!management || issues.some(code=>code!=='limited_evidence')))) && <div className="diagnosticIssues">
        <h3>{t('diagTroubleshoot')}</h3>
        {issues.map(code => <article key={code} className="diagnosticIssue">
          <strong>{simulatedDiagnostics?t('diagSimulated'):''}{t(diagnosisKeys[code][0])}</strong>
          <p>{!simulatedDiagnostics && code === 'limited_evidence' ? t('diagEvidenceBoundary') : t(diagnosisKeys[code][1])}</p>
          <div className="actions">
            <Button variant="secondary" onClick={onProfiles}>{t('diagCheckSettings')}</Button>
            <Button variant="secondary" disabled={!httpDiagnostics || locked} onClick={() => void test([selectedIds[0] ?? "chatgpt"])}>{t('diagRetest')}</Button>
          </div>
        </article>)}
      </div>}
    </section>
    {management && <><p className="hint diagnosticEvidenceFootnote">{t(simulatedDiagnostics ? 'diagLeadExplanation' : 'diagEvidenceBoundary')}</p>
    <details className="diagnosticEvidenceDetails"><summary>{t('pcDiagEvidenceTitle')}<span>{t('pcDiagView')}</span></summary>
      <p className="hint">{t('pcDiagEvidenceLayers')}</p>
    </details></>}
  </>;
}
