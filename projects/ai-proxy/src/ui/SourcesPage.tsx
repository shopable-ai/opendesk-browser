import {getEnvironment} from '../environment';
import {Button} from '@opendesk/ui';
import { useI18n } from '../i18n/LocaleProvider';
import type { TranslationKey } from '../i18n/locale';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Request, Response } from '../domain/messages';
import type { ConfigState, ProxyScheme, RuntimeStatus, SubscriptionFormat } from '../domain/types';
import { validateSubscriptionUrlShape } from '../subscription/download';
import type { OptionsSection, SubscriptionRoute } from './optionsRoute';
import { OfficialServicePage } from './OfficialServicePage';
import { requestOfficial } from '../official/messages';
import type { OfficialSnapshot } from '../official/contracts';
import { SubscriptionReader } from './SubscriptionReader';
import { ClearableInput, LocalClientQuickPreset } from './ProxyEntry';
import { isValidProxyPort } from '../domain/proxy-entry';

interface Props {
  config: ConfigState;
  runtime: RuntimeStatus;
  busy: boolean;
  act: (message: Request) => Promise<Response | null>;
  setError: (message: string) => void;
  setErrorKey: (key: TranslationKey) => void;
  navigate: (section: OptionsSection) => void;
  route: SubscriptionRoute;
  navigateSubscription: (route: SubscriptionRoute) => void;
  quickEntry?: 'local' | 'subscription' | null;
}
type Editor = 'local' | 'subscription' | null;
const emptyLocal = { name: '', scheme: 'http' as ProxyScheme, port: '7890' };
const emptySubscription = { name: '', url: '', format: 'auto' as SubscriptionFormat };

type SourceIconKind = 'overview' | 'local' | 'subscription';
function SourceIcon({ kind }: { kind: SourceIconKind }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">
    {kind === 'local' ? <>
      <rect x="3" y="4" width="18" height="12" rx="2.5" />
      <path d="M8 20h8M12 16v4M7 10h.01M11 10h6" />
    </> : kind === 'subscription' ? <>
      <path d="M5 7h10M5 12h14M5 17h9" />
      <path d="m17 4 3 3-3 3" />
    </> : <>
      <rect x="2.5" y="9" width="7" height="6" rx="1.5" />
      <rect x="14.5" y="3" width="7" height="6" rx="1.5" />
      <rect x="14.5" y="15" width="7" height="6" rx="1.5" />
      <path d="M9.5 12h2.5V6h2.5M12 12v6h2.5" />
    </>}
  </svg>;
}

/**
 * A browser extension settings section, not a full-screen onboarding app.
 * Editing is progressive disclosure; no subscription URL ever leaves this component.
 */
export function SourcesPage({ config, runtime, busy, act, setError, setErrorKey, navigate,
  route, navigateSubscription, quickEntry = null }: Props) {
  const { t } = useI18n();
  const [editor, setEditor] = useState<Editor>(null);
  const [local, setLocal] = useState(emptyLocal);
  const [localId, setLocalId] = useState('');
  const [sub, setSub] = useState(emptySubscription);
  const [subId, setSubId] = useState('');
  const localTrigger = useRef<HTMLButtonElement>(null);
  const subscriptionTrigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<Editor>(null);
  const editorOpener = useRef<HTMLElement | null>(null);
  const routeEditorOpened = useRef(false);
  const subscriptionUrls = useRef(new Map<string, string>());
  const listTitle = useRef<HTMLHeadingElement>(null);
  const detailTitle = useRef<HTMLHeadingElement>(null);
  const previousRoute = useRef<string | null>(null);
  const [official,setOfficial] = useState<OfficialSnapshot | null>(null);
  const routeKey = route.kind === 'source' ? 'source:' + route.id : route.kind;
  useEffect(() => {
    let live = true;
    async function loadOfficial() {
      try {
        const response = await requestOfficial({type:'OFFICIAL_STATUS'});
        if (live) setOfficial(response.ok ? response.snapshot : null);
      } catch { if (live) setOfficial(null); }
    }
    void loadOfficial();
    const onFocus = () => { if (document.visibilityState === 'visible') void loadOfficial(); };
    window.addEventListener('focus',onFocus);
    return () => { live = false; window.removeEventListener('focus',onFocus); };
  }, []);
  useEffect(() => {
    const last = previousRoute.current;
    previousRoute.current = routeKey;
    // Editor drafts belong to their original source, not the next route.
    if (last && last !== routeKey && editor && quickEntry === null) closeEditor(true);
    const frame = requestAnimationFrame(() => {
      if (route.kind === 'list') {
        const id = last?.startsWith('source:') ? last.slice('source:'.length) : null;
        const row = id ? Array.from(document.querySelectorAll<HTMLButtonElement>('[data-subscription-id]'))
          .find(button => button.dataset.subscriptionId === id) : null;
        (row ?? listTitle.current)?.focus();
      } else if (route.kind === 'source' || route.kind === 'official' || route.kind === 'invalid') {
        detailTitle.current?.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [routeKey]);
  useEffect(() => {
    if (!editor && returnFocus.current) {
      const fallback = (returnFocus.current === 'local' ? localTrigger : subscriptionTrigger).current;
      (editorOpener.current?.isConnected ? editorOpener.current : fallback)?.focus();
      returnFocus.current = null;
    }
  }, [editor]);
  const locals = config.endpoints.filter(endpoint =>
    config.sources.some(source => source.id === endpoint.sourceId && source.kind === 'local-client'));
  const subscriptions = config.sources.filter(source => source.kind === 'subscription');

  useEffect(() => {
    if (quickEntry === 'local') {
      routeEditorOpened.current = true;
      openLocal();
    } else if (quickEntry === 'subscription') {
      routeEditorOpened.current = true;
      openSubscription();
    } else if (routeEditorOpened.current) {
      routeEditorOpened.current = false;
      closeEditor(true);
    }
  }, [quickEntry]);
  function closeEditor(preserveRoute = false) {
    getEnvironment().setDraftDirty(false,'source-editor');
    const fromRoute = routeEditorOpened.current;
    if (!preserveRoute) routeEditorOpened.current = false;
    returnFocus.current = editor;
    setEditor(null);
    setLocal(emptyLocal);
    setLocalId('');
    // Discard the token-bearing URL even when the form is dismissed.
    setSub(emptySubscription);
    setSubId('');
    setError('');
    if (!preserveRoute && fromRoute && /^#\/subscriptions\/(?:new|local)$/.test(getEnvironment().navigation.getRoute())) {
      navigate('subscriptions');
    }
  }
  function openLocal(id?: string) {
    editorOpener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement : null;
    closeEditor(true);
    const endpoint = locals.find(candidate => candidate.id === id);
    if (endpoint) {
      setLocalId(endpoint.id);
      setLocal({ name:endpoint.name, scheme:endpoint.scheme, port:String(endpoint.port) });
    }
    setEditor('local');
  }
  function openSubscription(id?: string) {
    editorOpener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement : null;
    closeEditor(true);
    const source = subscriptions.find(candidate => candidate.id === id);
    if (source) {
      setSubId(source.id);
      setSub({ name:source.displayName, url:'', format:source.format });
    }
    setEditor('subscription');
  }
  async function saveLocal(event: FormEvent<HTMLFormElement>) {
    const revision=getEnvironment().getDraftRevision('source-editor');
    event.preventDefault();
    if (!isValidProxyPort(local.port)) { setErrorKey('errInvalidPort'); return; }
    const displayName = local.name.trim() || (local.scheme.toUpperCase() + ' · 127.0.0.1:' + local.port);
    if (await act({ type:'SAVE_LOCAL_CLIENT', client:{
      id:localId || crypto.randomUUID(), name:displayName, scheme:local.scheme, port:Number(local.port)
    }})) {if(getEnvironment().setDraftDirty(false,'source-editor',revision))closeEditor();}
  }
  async function saveSubscription(event: FormEvent<HTMLFormElement>) {
    const revision=getEnvironment().getDraftRevision('source-editor');
    event.preventDefault();
    let originHost = '';
    if (sub.url.trim()) {
      try {
        const parsed = validateSubscriptionUrlShape(sub.url);
        originHost = parsed.hostname.toLowerCase();
      } catch {
        setErrorKey('enterAValidHttpsUrlWithoutAUrlUsername');
        return;
      }
    } else {
      const previous = subscriptions.find(source => source.id === subId);
      if (!previous) { setErrorKey('enterAnHttpsSubscriptionUrl'); return; }
      originHost = previous.originHost;
    }
    // Never mention the path, query or credential even in confirmation text.
    if (!await getEnvironment().confirm(t('confirmSubscriptionHost',{host:originHost}))) return;
    const source = {
      id:subId || crypto.randomUUID(), kind:'subscription' as const,
      displayName:sub.name, originHost, format:sub.format,
      syncStatus:'not-synced' as const, trustedByUser:true as const
    };
    if (await act({ type:'SAVE_SUBSCRIPTION', source })) {
      if(!getEnvironment().setDraftDirty(false,'source-editor',revision))return;
      if (sub.url.trim()) subscriptionUrls.current.set(source.id, sub.url.trim());
      closeEditor(true);
      if (!subId) navigateSubscription({kind:'source',id:source.id});
    }
  }
  const editorMarkup = <>{editor && <section id="source-editor" className="sourceInlineEditor"
      aria-labelledby="source-editor-title" onKeyDown={event => {
        if (event.key === 'Escape' && !busy) { event.preventDefault(); closeEditor(); }
      }}>
      <div className="sourceEditorHead">
        <h2 id="source-editor-title">{editor==='local'
          ? (localId?t('editLocalClientEndpoint'):t('addLocalClientEndpoint'))
          : (subId?t('editSubscriptionSource'):t('recordThirdPartySubscriptionSource'))}</h2>
        <Button type="button" disabled={busy} onClick={() => closeEditor()}>{t('cancel')}</Button>
      </div>
      {editor==='local'
        ? <form data-draft-scope="source-editor" className="sourceForm" onSubmit={e => void saveLocal(e)}>
          <div><label htmlFor="r72-local-name">{t('localClientName')}</label>
            <ClearableInput id="r72-local-name" maxLength={80} autoFocus fieldLabel={t('localClientName')} value={local.name}
               onValueChange={name=>setLocal({...local,name})} placeholder={t('eGMihomoLocalProxy')}/></div>
          <div className="sourceFormPair">
            <div><label htmlFor="r72-local-scheme">{t('localClientProtocol')}</label>
              <select id="r72-local-scheme" value={local.scheme}
                onChange={e=>setLocal({...local,scheme:e.target.value as ProxyScheme})}>
                <option value="http">{t('httpSupportsHttpsConnect')}</option><option value="https">{t('httpsProxy')}</option>
                <option value="socks5">{t('socks5NoAuthentication')}</option><option value="socks4">SOCKS4</option>
              </select></div>
            <div><label htmlFor="r72-local-port">{t('localListeningPort')}</label>
              <ClearableInput id="r72-local-port" type="number" required min={1} max={65535} fieldLabel={t('localListeningPort')}
                 value={local.port} onValueChange={port=>setLocal({...local,port})}
                 aria-invalid={local.port!==''&&!isValidProxyPort(local.port)}/>
               <LocalClientQuickPreset scheme={local.scheme} value={local.port}
                 onChoose={(scheme,port)=>setLocal(previous=>({...previous,scheme,port}))}/>
               {local.port!==''&&!isValidProxyPort(local.port)&&<small role="alert" className="proxyEntryError">{t('errInvalidPort')}</small>}
             </div>
          </div>
          <p className="sourceFieldNote">{t('localPortExamples')}</p>
           <p className="sourceFieldNote">{t('only')} <strong className="mono">127.0.0.1</strong>{t('doesNotInstallOrStartTheClientSocksAuthentication')}</p>
          <div className="sourceFormActions"><Button disabled={busy} className="primary" type="submit">
            {localId?t('saveLocalEndpointChanges'):t('saveLocalEndpoint')}</Button></div>
        </form>
        : <form data-draft-scope="source-editor" className="sourceForm" onSubmit={e=>void saveSubscription(e)}>
        <p className="sourceFieldNote">{t('subscriptionMetadataNotice')}</p>
          <div><label htmlFor="r72-sub-name">{t('subscriptionSourceName')}</label>
            <ClearableInput id="r72-sub-name" fieldLabel={t('subscriptionSourceName')} maxLength={80} required autoFocus value={sub.name}
               onValueChange={name=>setSub({...sub,name})} placeholder={t('eGMySubscriptionProvider')}/></div>
          <div><label htmlFor="r72-sub-url">{t('subscriptionHttpsUrl')}</label>
            <ClearableInput id="r72-sub-url" fieldLabel={t('subscriptionHttpsUrl')} type="url" required={!subId} autoComplete="off" spellCheck={false}
               value={sub.url} onValueChange={url=>setSub({...sub,url})}
               placeholder={subId?t('leaveBlankToKeepTheCurrentDomain'):'https://provider.example.com/…'}/></div>
          <div><label htmlFor="r72-sub-format">{t('declaredFormatNotVerified')}</label>
            <select id="r72-sub-format" value={sub.format}
              onChange={e=>setSub({...sub,format:e.target.value as SubscriptionFormat})}>
          <option value="auto">{t('subscriptionAutoOnRead')}</option><option value="clash">Clash / Mihomo</option>
              <option value="sing-box">sing-box</option><option value="uri-list">{t('uriNodeList')}</option>
              <option value="unknown">{t('otherUnknown')}</option>
            </select></div>
          <div className="sourceFormActions"><Button disabled={busy} className="primary" type="submit">
            {subId?t('saveSourceChanges'):t('recordSubscriptionSource')}</Button></div>
        </form>}
    </section>}</>;
  const localListMarkup = <><section className="sourceList" aria-label={t('savedLocalClients')}>
      <header className="sourceListHead"><div><h2>{t('localProxyClients')} <span className="countTag">{locals.length}</span></h2>
        <p>{t('selectInThePopupUnderUseAProfileThen')}</p></div></header>
      {!locals.length ? <div className="sourceEmpty">{t('noLocalClientsYetAddAListeningPortTo')}</div> :
        <div className="records sourceCards">{locals.map(endpoint => {
          const profile=config.profiles.find(item=>item.kind==='endpoint'&&item.endpointId===endpoint.id);
          const chosen=config.selection.mode==='profile'&&config.selection.profileId===profile?.id;
          const applied=runtime.applied&&runtime.activeSelection?.mode==='profile'
            &&runtime.activeSelection.profileId===profile?.id;
          return <article className={'record sourceRecord' + (applied ? ' isApplied' : chosen ? ' isSelected' : '')}
            key={endpoint.id}>
            <div className="sourceCardTop">
              <span className="sourceCardIcon"><SourceIcon kind="local"/></span>
              <div className="sourceCardIdentity"><strong>{endpoint.name}</strong>
                <small className="mono">{endpoint.scheme.toUpperCase()} · 127.0.0.1:{endpoint.port}</small></div>
            </div>
            <div className="rowBadges"><span>{t('portNotTested')}</span>{chosen&&<span>{t('selected')}</span>}
              {applied&&<span className="appliedBadge">{t('appliedToChrome2')}</span>}</div>
            <div className="recordActions">
              <Button disabled={busy||!profile} aria-label={t('selectNamedLocal',{name:endpoint.name})}
                onClick={()=>void act({ type:'SELECT', selection:{mode:'profile',profileId:profile?.id} })}>
                {chosen?t('selected'):t('select2')}</Button>
              <Button disabled={busy} aria-label={t('editNamedLocal',{name:endpoint.name})}
                onClick={()=>openLocal(endpoint.id)}>{t('edit')}</Button>
              <Button disabled={busy||config.managed} className="quietDanger"
                onClick={async()=>{if(await getEnvironment().confirm(t('confirmDeleteLocal',{name:endpoint.name})))
                  void act({type:'DELETE_ENDPOINT',id:endpoint.id});}}>{t('delete')}</Button>
            </div>
          </article>;
        })}</div>}
    </section></>;
  const helpMarkup = <><details className="sourceHelp subscriptionCliDetails">
      <summary>{t('protocolSupportAndIntegrationNotes')}</summary>
      <p>{t('chromeSupportsHttpHttpsSocks4AndUnauthenticatedSocks5Proxies')}</p>
      <p>{t('subscriptionIntegrationNotice')}</p>
      <p>{t('subscriptionCliNotice')}</p>
      <p className="subscriptionCliCommand"><code>node --experimental-strip-types scripts/probe-subscription.mjs --report /tmp/ai-proxy-subscription-report.json</code></p>
      <div className="actions"><Button onClick={()=>navigate('profiles')}>{t('backToProxyProfiles')}</Button>
        <Button onClick={()=>navigate('diagnostic')}>{t('openNetworkDiagnostics')}</Button></div>
    </details></>;

  const subscriptionsCount = subscriptions.length;
  // Only show an official *subscription* after verified entitlement; no fake plan for guests.
  const verifiedOfficial = official?.configured && official.availability === 'online'
    && official.auth === 'signed-in' && official.entitlement
    && ['active','expiring','expired','revoked'].includes(official.entitlement.state)
    ? official.entitlement : null;
  const selectedSource = route.kind === 'source'
    ? subscriptions.find(source => source.id === route.id) : undefined;
  // Legacy user-provided labels may accidentally contain secret URLs. Do not echo those.
  const publicName = (name: string) => /https?:\/\/|(?:token|secret|password|api[_-]?key)\s*[:=]/i.test(name)
    ? t('subscriptionPrivateSourceName') : name;
  const viewName = selectedSource ? publicName(selectedSource.displayName) : '';
  const linkedProfile = selectedSource
    ? config.profiles.find(profile => profile.sourceId === selectedSource.id) : undefined;
  const isSelected = !!linkedProfile && config.selection.mode === 'profile'
    && config.selection.profileId === linkedProfile.id;
  const isApplied = !!linkedProfile && runtime.applied
    && runtime.activeSelection?.mode === 'profile'
    && runtime.activeSelection.profileId === linkedProfile.id;
  async function deleteSource(id: string, name: string) {
    if (!await getEnvironment().confirm(t('confirmDeleteSubscription',{name}))) return;
    if (await act({type:'DELETE_SUBSCRIPTION',id})) navigateSubscription({kind:'list'});
  }
  const back = () => navigateSubscription({kind:'list'});

  if (route.kind === 'official') return <div className="sourcesPage subscriptionDetailPage">
    <nav aria-label={t('subscriptionNavigation')} className="subscriptionBreadcrumb">
      <Button type="button" onClick={back}>{t('subscriptionBackToList')}</Button>
    </nav>
    <h2 className="subscriptionVisuallyHidden" tabIndex={-1} ref={detailTitle}>{t('officialNetwork')}</h2>
    <OfficialServicePage onBack={back} chromeApplied={runtime.applied} embedded/>
  </div>;

  if (route.kind === 'source' || route.kind === 'invalid') return <div className="sourcesPage subscriptionDetailPage">
    <nav aria-label={t('subscriptionNavigation')} className="subscriptionBreadcrumb">
      <Button type="button" onClick={back}>{t('subscriptionBackToList')}</Button>
      <span aria-hidden="true">/</span><span>{t('subscriptionDetailTitle')}</span>
    </nav>
    {selectedSource ? <>
      <article className="subscriptionDetailCard">
        <div className="subscriptionDetailHeading">
          <span className="sourceCardIcon"><SourceIcon kind="subscription"/></span>
          <div className="subscriptionDetailIdentity">
            <p className="subscriptionTypeLabel">{t('subscriptionThirdPartyType')}</p>
            <h2 tabIndex={-1} ref={detailTitle}>{viewName}</h2>
            <p className="hint mono">{selectedSource.originHost}</p>
          </div>
        </div>
        <div className="subscriptionDetailStats" aria-label={t('subscriptionStatusOverview')}>
          <div><small>{t('subscriptionSyncLabel')}</small><strong>{t('notSynced')}</strong></div>
          <div><small>{t('subscriptionNodeLabel')}</small><strong>{t('unknown')}</strong></div>
          <div><small>{t('subscriptionConnectionLabel')}</small><strong>{t('unknown')}</strong></div>
        </div>
        <div className="subscriptionDetailMeta">
          <span>{t('declaredFormatNotVerified')}: {selectedSource.format}</span>
          {isSelected && <span>{t('selected')}</span>}
          {isApplied && <span className="appliedBadge">{t('appliedToChrome2')}</span>}
        </div>
        <p className="sourceFieldNote">{t('subscriptionDetailSafety')}</p>
        <div className="subscriptionDetailActions">
          <Button disabled={busy} onClick={() => openSubscription(selectedSource.id)}>{t('edit')}</Button>
          <Button disabled={busy || config.managed} className="quietDanger"
            onClick={() => void deleteSource(selectedSource.id,viewName)}>{t('delete')}</Button>
        </div>
      </article>
      {editorMarkup}
      <section className="subscriptionReadSection" aria-label={t('subscriptionReadLocalTitle')}>
        <SubscriptionReader key={selectedSource.id} source={selectedSource} config={config}
          busy={busy} act={act} openLocal={() => openLocal()}
          initialUrl={subscriptionUrls.current.get(selectedSource.id) ?? ''}/>
      </section>
      {helpMarkup}
    </> : <section className="sourceEmpty subscriptionMissing" role="status">
      <h2 tabIndex={-1} ref={detailTitle}>{t('subscriptionMissingTitle')}</h2>
      <p>{t('subscriptionMissingDescription')}</p>
      <Button onClick={back}>{t('subscriptionBackToList')}</Button>
    </section>}
  </div>;

  if (route.kind === 'new' || route.kind === 'local') return <div className="sourcesPage subscriptionDetailPage">
    <nav aria-label={t('subscriptionNavigation')} className="subscriptionBreadcrumb">
      <Button type="button" onClick={back}>{t('subscriptionBackToList')}</Button>
    </nav>
    {editorMarkup}
  </div>;

  return <div className="sourcesPage subscriptionIndexPage">
    <div className="subscriptionIndexHead">
      <div><h2 ref={listTitle} tabIndex={-1}>{t('subscriptionListHeading')} <span className="countTag">
        {subscriptionsCount + (verifiedOfficial ? 1 : 0)}</span></h2>
        <p>{t('subscriptionListDescription')}</p></div>
      <Button variant="primary" className="primary" disabled={busy}
        onClick={() => navigateSubscription({kind:'new'})}>{t('recordSubscriptionSource')}</Button>
    </div>
    {editorMarkup}
    <section className="subscriptionIndex" aria-label={t('subscriptionListHeading')}>
      {verifiedOfficial && <Button className="subscriptionIndexRow" type="button" data-subscription-id="official"
        onClick={() => navigateSubscription({kind:'official'})}
        aria-label={t('subscriptionViewNamed',{name:t('officialNetwork')})}>
        <span className="subscriptionRowSymbol" aria-hidden="true"><SourceIcon kind="overview"/></span>
        <span className="subscriptionRowMain"><strong>{t('officialNetwork')}</strong>
          <small>{t('subscriptionOfficialType')} · {verifiedOfficial.planName ?? t('officialSubscription')}</small></span>
        <span className="subscriptionRowStatus">{t(verifiedOfficial.state === 'active'
          ? 'officialEntitlementActive' : verifiedOfficial.state === 'expiring'
          ? 'officialEntitlementExpiring' : verifiedOfficial.state === 'expired'
          ? 'officialEntitlementExpired' : verifiedOfficial.state === 'revoked'
          ? 'officialEntitlementRevoked' : 'officialEntitlementUnknown')}</span>
        <span className="subscriptionRowArrow" aria-hidden="true">›</span>
      </Button>}
      {subscriptions.map(source => <Button type="button" key={source.id}
        data-subscription-id={source.id} className="subscriptionIndexRow"
        onClick={() => navigateSubscription({kind:'source',id:source.id})}
        aria-label={t('subscriptionViewNamed',{name:publicName(source.displayName)})}>
        <span className="subscriptionRowSymbol" aria-hidden="true"><SourceIcon kind="subscription"/></span>
        <span className="subscriptionRowMain"><strong>{publicName(source.displayName)}</strong>
          <small>{t('subscriptionThirdPartyType')} · {source.originHost}</small></span>
        <span className="subscriptionRowStatus">{t('notSynced')}</span>
        <span className="subscriptionRowArrow" aria-hidden="true">›</span>
      </Button>)}
      {!subscriptionsCount && !verifiedOfficial && <div className="sourceEmpty subscriptionIndexEmpty">
        <p>{t('subscriptionEmptyNotice')}</p>
      </div>}
    </section>
    <section className="subscriptionOtherAccess">
      <div><h3>{t('subscriptionOtherAccess')}</h3>
        <p>{t('subscriptionOtherAccessDescription')}</p></div>
      <div className="subscriptionOtherActions">
        <Button type="button" onClick={() => navigateSubscription({kind:'official'})}>
          {t('subscriptionOfficialEntry')}</Button>
        <Button type="button" onClick={() => navigateSubscription({kind:'local'})}>
          {t('addLocalClient')}</Button>
      </div>
    </section>
    {!!locals.length && <details className="subscriptionLocalDetails">
      <summary>{t('savedLocalClients')} · {locals.length}</summary>
      {localListMarkup}
    </details>}
    {helpMarkup}
  </div>;
}
