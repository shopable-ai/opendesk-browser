import {getEnvironment} from './environment';
import {Button} from '@opendesk/ui';
import { useI18n } from './i18n/LocaleProvider';
import type { UiLocalePreference } from './i18n/locale';
import { useEffect, useRef, useState } from 'react';
import { copyableOptionsHash, optionsHash, parseOptionsHash, parseSubscriptionRoute, subscriptionRouteHash,
  type OptionsSection, type SubscriptionRoute } from './ui/optionsRoute';
import { OptionsPageHeader } from './ui/OptionsShell';
import { FormField } from './ui/FormField';
import { BACKUP_MAX_BYTES, BackupImportValidationError, parseBackupForImport } from './ui/backupImport';
import { Status, statusLabelKey, statusTone } from './ui/Status';
import { ClearableInput, HostQuickPick, PortQuickPick } from './ui/ProxyEntry';
import { isValidProxyPort, parseProxyAddressPaste } from './domain/proxy-entry';
import { SourcesPage } from './ui/SourcesPage';
import { RotationSettings } from './ui/RotationPlan';
import { DiagnosticsPage } from './ui/DiagnosticsPage';
import { OfficialServicePage } from './ui/OfficialServicePage';
import { useProxy } from './ui/useProxy';
import type { Profile, ProxyEndpoint, ProxyScheme, RouteMode, SiteRule } from './domain/types';
import { createPacStarter, type PacStarterMode } from './domain/pac-starters';
import { normalizeRuleSiteInput, priorityForSiteQuickRule } from './domain/config';

type Page = OptionsSection;
const emptyEndpoint = {name:'', scheme:'http' as ProxyScheme,host:'',port:''};

export default function App() {
  const { t, preference, setPreference } = useI18n();
  const modes:{mode:RouteMode;name:string}[]=[
  // Keep the same primary action order as the persistent R8.3 Side Panel.
  {mode:'profile',name:t('popupModeProfile')},{mode:'rules',name:t('popupModeRules')},
  {mode:'direct',name:t('popupModeDirect')},{mode:'system',name:t('popupModeSystem')}
];
const tabs: {id:Page; name:string; caption:string}[] = [
  {id:'profiles',name:t('proxyProfiles'),caption:t('haveAnHttpHttpsSocksProxyOrLocalGateway')},
  {id:'rules',name:t('websiteRules2'),caption:t('routeByDomainThroughAProxyOrDirect')},
  {id:'subscriptions',name:t('subscriptionManageTitle'),caption:t('subscriptionManageDescription')},
  {id:'backup',name:t('importAndBackup'),caption:t('importAndExportNonSecretSettings')},
  {id:'diagnostic',name:t('networkDiagnostics2'),caption:t('statusExtensionProbesAndTroubleshooting')},
  {id:'general',name:t('generalSettings'),caption:t('privacyPermissionsAndLimitations')},
  {id:'official',name:t('officialNetwork'),caption:t('officialIntro')}
];

  const {state, busy, error, setError, setErrorKey, act, refresh} = useProxy();
  const navigation = getEnvironment().navigation;
  const [locationHash,setLocationHash] = useState(() => navigation.getRoute());
  const tab: Page = parseOptionsHash(locationHash);
  const [copiedPageLink,setCopiedPageLink] = useState(false);
  const [pageLinkCopyFailed,setPageLinkCopyFailed] = useState(false);
  const pageLinkCopyRequest = useRef(0);
  const sectionContent=useRef<HTMLElement>(null);
  const lastSection=useRef(tab);
  const pacDetails=useRef<HTMLDetailsElement>(null);
  // The native selector keeps all seven sections discoverable without a
  // horizontally scrolling desktop navigation. Reset only on section changes.
  useEffect(() => {
    if(lastSection.current===tab)return;
    lastSection.current=tab;
    sectionContent.current?.closest('.proxy-route')?.scrollTo({top:0});
  },[tab]);
  useEffect(() => {
    const syncLocation = () => {
      setLocationHash(navigation.getRoute());
      setCopiedPageLink(false);
      setPageLinkCopyFailed(false);
      pageLinkCopyRequest.current += 1;
    };
    const unsubscribe = navigation.subscribe(syncLocation);
    syncLocation();
    return unsubscribe;
  }, [navigation]);
  function navigate(section: Page) { getEnvironment().navigate(optionsHash(section)); }
  function navigateSubscription(route: SubscriptionRoute) { getEnvironment().navigate(subscriptionRouteHash(route)); }
  function navigateAction(section: 'profiles' | 'subscriptions', action: 'add' | 'local' | 'new' | 'pac') { getEnvironment().navigate(optionsHash(section)+'/'+action); }
  async function copyCurrentPageLink() {
    const request = ++pageLinkCopyRequest.current;
    const hash = navigation.getRoute();
    const isCurrentRequest = () => request === pageLinkCopyRequest.current && hash === navigation.getRoute();
    setCopiedPageLink(false);
    setPageLinkCopyFailed(false);
    // Copy only the internal route, without the host URL, queries or form credentials.
    const route = copyableOptionsHash(navigation.getRoute());
    try {
      const href = route;
      try { await navigator.clipboard.writeText(href); }
      catch {
        if (!isCurrentRequest()) return;
        // Fallback for clipboard-permission-limited extension pages.
        const fallback = document.createElement('textarea');
        fallback.value = href;
        fallback.readOnly = true;
        fallback.style.position = 'fixed';
        fallback.style.left = '-9999px';
        document.body.appendChild(fallback);
        fallback.select();
        try { if (!document.execCommand('copy')) throw new Error('copy unavailable'); }
        finally { fallback.remove(); }
      }
      if (isCurrentRequest()) setCopiedPageLink(true);
    } catch { if (isCurrentRequest()) setPageLinkCopyFailed(true); }
  }
  const [editingId,setEditingId] = useState('');
  const [proxy,setProxy] = useState(emptyEndpoint);
  const [username,setUsername] = useState('');
  const [password,setPassword] = useState('');
  const { locale } = useI18n();
  const [addressPasteError,setAddressPasteError] = useState(false);
  const [pacName,setPacName] = useState('');
  const [pacText,setPacText] = useState('');
  const [pacStarterMode,setPacStarterMode] = useState<PacStarterMode>('site');
  const [pacStarterEndpoint,setPacStarterEndpoint] = useState('');
  const [pacStarterSite,setPacStarterSite] = useState('');
  const [pacStarterError,setPacStarterError] = useState<''|'pacStarterChooseEndpoint'|'pacStarterInvalidDomain'>('');
  const [editingPacId,setEditingPacId] = useState('');
  const [rule,setRule] = useState({domain:'', includeSubdomains:true, action:'endpoint' as 'direct'|'endpoint', endpointId:'', priority:'100'});
  const [ruleError,setRuleError] = useState(false);
  const [ruleSaved,setRuleSaved]=useState(false);
  const [editingRuleId,setEditingRuleId] = useState('');
  const [defaultAction,setDefaultAction] = useState('direct');
  const [defaultEndpointId,setDefaultEndpointId] = useState('');
  const [backup,setBackup] = useState('');
  const [backupImported,setBackupImported] = useState(false);
  const backupReadGeneration = useRef(0);
  const [editorOpen,setEditorOpen] = useState(false);
  const editorDialog = useRef<HTMLDialogElement>(null);
  const editorReturnFocus = useRef<HTMLElement | null>(null);
  const deepLinkedEditor = useRef(false);
  const editorOriginHash = useRef<string | null>(null);
  useEffect(() => {
    const dialog = editorDialog.current;
    if (!dialog) return;
    if (editorOpen && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLInputElement>('#ep-host')?.focus();
    }
    if (!editorOpen && dialog.open) dialog.close();
  }, [editorOpen]);
  function closeEditor() {
    getEnvironment().setDraftDirty(false,'settings-proxy');
    // Validation errors belong to this editor, not to a different Options page.
    setError('');
    setEditorOpen(false);
    setEditingId('');
    setProxy(emptyEndpoint);
    setUsername('');
    setPassword('');
    setAddressPasteError(false);
    deepLinkedEditor.current = false;
    editorOriginHash.current = null;
    if (navigation.getRoute() === '#/profiles/add') {
      navigation.navigate(optionsHash('profiles'), { force: true, replace: true });
    }
  }
  async function requestCloseEditor() {
    const environment = getEnvironment();
    const revision = environment.getDraftRevision('settings-proxy');
    if (environment.isDraftDirty('settings-proxy') &&
      !await environment.confirm(t('apDiscardProxyDraft'))) return;
    if (!environment.setDraftDirty(false,'settings-proxy',revision)) return;
    closeEditor();
  }
  function openEditor(endpoint?: ProxyEndpoint) {
    setError('');
    editorOriginHash.current = navigation.getRoute();
    editorReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditingId(endpoint?.id ?? '');
    setProxy(endpoint ? {name:endpoint.name,scheme:endpoint.scheme,host:endpoint.host,port:String(endpoint.port)} : emptyEndpoint);
    // Never expose session credentials in an edit form or export.
    setUsername('');
    setPassword('');
    setAddressPasteError(false);
    setEditorOpen(true);
  }
  function handleProxyPaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData('text').trim();
    if (!text.includes(':')) return;
    const parsed = parseProxyAddressPaste(text);
    if (parsed) {
      event.preventDefault();
      getEnvironment().setDraftDirty(true,'settings-proxy');
      setProxy(previous => ({...previous,...parsed}));
      if (parsed.scheme === 'socks4' || parsed.scheme === 'socks5') {
        // A pasted SOCKS URI changes the draft protocol. Chrome cannot use
        // HTTP session credentials on SOCKS, so discard only the auth draft.
        setUsername('');
        setPassword('');
      }
      setAddressPasteError(false);
    } else if (text.includes('://') || /^\[/.test(text) || /:\d/.test(text)) {
      event.preventDefault();
      setAddressPasteError(true);
    }
  }
  useEffect(() => {
    if (!state) return;
    if (locationHash === '#/profiles/add') {
      deepLinkedEditor.current = true;
      openEditor();
    } else if (deepLinkedEditor.current ||
      (editorOriginHash.current !== null && editorOriginHash.current !== locationHash)) {
      // Any route departure discards the open editor, including ordinary Add/Edit.
      closeEditor();
    }
  }, [Boolean(state), locationHash]);
  useEffect(() => {
    if (state && locationHash === '#/profiles/pac') {
      requestAnimationFrame(() => {
        if (pacDetails.current) {
          pacDetails.current.open = true;
          pacDetails.current.scrollIntoView({ block:'start', behavior:'auto' });
        }
      });
    }
  }, [Boolean(state), locationHash]);
  // Reflect imported/persisted default routing without resetting an in-progress edit.
  useEffect(() => {
    if (!state) return;
    if(getEnvironment().isDraftDirty('settings-default'))return;
    setDefaultAction(state.config.defaultTarget.action);
    setDefaultEndpointId(state.config.defaultTarget.endpointId ?? '');
  }, [state?.config.defaultTarget.action, state?.config.defaultTarget.endpointId]);
  // New website rules prefer an existing proxy rather than silently defaulting to DIRECT.
  useEffect(() => {
    const firstEndpointId = state?.config.endpoints[0]?.id;
    if (!editingRuleId && firstEndpointId) {
      setRule(previous => previous.action === 'endpoint' && !previous.endpointId
        ? {...previous,endpointId:firstEndpointId} : previous);
    }
  }, [editingRuleId, state?.config.endpoints]);
  if (!state) return <main className="options"><h1>AI Proxy</h1>
    <p>{t('readingBrowserState')}</p>{error && <p role="alert" className="notice error">{error}</p>}
    <Button onClick={() => void refresh()}>{t('retry')}</Button></main>;
  const config = state.config;
  const endpoints = config.endpoints;
  const profiles = config.profiles;
  const endpointRefs = (id:string) => profiles.filter(p => p.kind === 'endpoint' && p.endpointId === id);
  const selectedProfile = profiles.find(p => p.id === config.selection.profileId);
  async function insertPacStarter() {
    const revision = getEnvironment().getDraftRevision('settings-pac');
    const endpoint = endpoints.find(item => item.id === pacStarterEndpoint);
    if (!endpoint) { setPacStarterError('pacStarterChooseEndpoint'); return; }
    let draft: string;
    try {
      draft = createPacStarter(endpoint, pacStarterMode, pacStarterSite);
    } catch {
      setPacStarterError('pacStarterInvalidDomain');
      return;
    }
    // Inserting a starter only edits the form. Saving and applying remain separate.
    if (pacText.trim() && !await getEnvironment().confirm(t('pacStarterReplaceDraft'))) return;
    if (getEnvironment().getDraftRevision('settings-pac') !== revision) return;
    getEnvironment().setDraftDirty(true,'settings-pac');
    setPacText(draft);
    if (!pacName.trim()) setPacName(t('pacStarterDefaultName',{name:endpoint.name}));
    setPacStarterError('');
  }
  async function applyRoute() {
    if(config.selection.mode==='profile' && selectedProfile?.kind==='pac-inline' &&
      !await getEnvironment().confirm(t('chromeWillRunYourLocalPacScriptAndChange')))return;
    await act({type:'APPLY',approvedPac:selectedProfile?.kind==='pac-inline'});
  }
  async function saveProxy(event: React.FormEvent) {
    event.preventDefault();
    const draftRevision=getEnvironment().getDraftRevision('settings-proxy');
    const saveAnother = !editingId && (event.nativeEvent as SubmitEvent).submitter
      ?.getAttribute('data-add-another') === 'true';
    if ((username && !password) || (!username && password)) {
      setErrorKey('enterBothAUsernameAndPasswordTheProxyWas');
      return;
    }
    if ((proxy.scheme === 'socks4' || proxy.scheme === 'socks5') && (username || password)) {
      setErrorKey('chromeDoesNotSupportSocksUsernamePasswordAuthenticationHere');
      return;
    }
    const existing = endpoints.find(p => p.id === editingId);
    const httpAuth = proxy.scheme === 'http' || proxy.scheme === 'https';
    // SET_CREDENTIAL is not wired. Reject before any write rather than leave
    // a saved endpoint pointing at credentials that were never stored.
    if (username || password || (httpAuth && existing?.credentialRef)) {
      setError({
        'zh-CN': '代理认证尚未接入，代理未保存。全部输入已保留。',
        'zh-TW': '代理認證尚未接入，代理未儲存。全部輸入已保留。',
        en: 'Proxy authentication is not connected yet. The proxy was not saved. All inputs have been kept.'
      }[locale]);
      return;
    }
    if (!isValidProxyPort(proxy.port)) { setErrorKey('errInvalidPort'); return; }
    const displayName = proxy.name.trim() || (proxy.scheme.toUpperCase() + ' · ' + proxy.host.trim() + ':' + proxy.port);
    const id = editingId || crypto.randomUUID();
    const result = await act({type:'SAVE_ENDPOINT', endpoint:{
      id,name:displayName,scheme:proxy.scheme,host:proxy.host,port:Number(proxy.port),
      sourceId:'manual'
    }});
    if (!result) return;
    if (!existing && !await act({type:'SAVE_PROFILE',profile:{id:'profile-'+id,name:displayName,kind:'endpoint',endpointId:id,sourceId:'manual'}})) return;
    if(!getEnvironment().setDraftDirty(false,'settings-proxy',draftRevision))return;
    if (saveAnother) {
      setEditingId('');
      setProxy(emptyEndpoint);
      setUsername('');
      setPassword('');
    } else closeEditor();
  }
  async function editPac(profile: Profile) {
    if (profile.kind !== 'pac-inline') return;
    const environment = getEnvironment();
    const revision = environment.getDraftRevision('settings-pac');
    if (environment.isDraftDirty('settings-pac') &&
      !await environment.confirm(t('apReplacePacDraft'))) return;
    if (!environment.setDraftDirty(false,'settings-pac',revision)) return;
    setEditingPacId(profile.id);
    setPacName(profile.name);
    setPacText(profile.pacText);
    requestAnimationFrame(() => document.getElementById('pac-name')?.focus());
  }
  async function savePac(event: React.FormEvent) {
    event.preventDefault();
    const draftRevision=getEnvironment().getDraftRevision('settings-pac');
    if (await act({type:'SAVE_PROFILE',profile:{
      id:editingPacId || crypto.randomUUID(),kind:'pac-inline',name:pacName,pacText,sourceId:'manual'
    }})) {if(!getEnvironment().setDraftDirty(false,'settings-pac',draftRevision))return;setPacName('');setPacText('');setEditingPacId('');}
  }
  async function saveRule(event: React.FormEvent) {
    event.preventDefault();
    setRuleSaved(false);
    const draftRevision=getEnvironment().getDraftRevision('settings-rule');
    let domain: string;
    try { domain = normalizeRuleSiteInput(rule.domain); }
    catch { setRuleError(true); return; }
    if (rule.action === 'endpoint' && !rule.endpointId) {
      setErrorKey('ruleChooseProxyFirst');
      return;
    }
    const duplicate = config.rules.find(r => r.domain === domain && r.includeSubdomains === rule.includeSubdomains && r.id!==editingRuleId);
    if(duplicate){setErrorKey('apRuleAlreadyExists');return;}
    let priority = Number(rule.priority);
    if (!editingRuleId && priority === 100) {
      try {priority=priorityForSiteQuickRule(domain,config.rules);}
      catch {setErrorKey('siteRulePriorityConflict');return;}
    }
    const item: SiteRule = {
      id:editingRuleId || crypto.randomUUID(),domain,
      includeSubdomains:rule.includeSubdomains,priority,enabled:config.rules.find(r=>r.id===editingRuleId)?.enabled??true,
      action:rule.action,...(rule.action==='endpoint'?{endpointId:rule.endpointId}:{})
    };
    if (await act({type:'SAVE_RULE',rule:item})) {
      if(!getEnvironment().setDraftDirty(false,'settings-rule',draftRevision))return;
      setRule({domain:'',includeSubdomains:true,action:'endpoint',
        endpointId:config.endpoints[0]?.id||'',priority:'100'});
      setRuleError(false);
      setEditingRuleId('');setRuleSaved(true);
      document.getElementById('rule-domain')?.focus();
    }
  }

  async function editRule(item: SiteRule) {
    const environment = getEnvironment();
    const revision = environment.getDraftRevision('settings-rule');
    if (environment.isDraftDirty('settings-rule') &&
      !await environment.confirm(t('apReplaceRuleDraft'))) return;
    if (!environment.setDraftDirty(false,'settings-rule',revision)) return;
    setRuleSaved(false);setEditingRuleId(item.id);
    setRuleError(false);
    setRule({domain:item.domain,includeSubdomains:item.includeSubdomains,
      action:item.action,endpointId:item.endpointId||'',priority:String(item.priority)});
    requestAnimationFrame(() => document.getElementById('rule-domain')?.focus());
  }
  async function removeRule(item: SiteRule) {
    const revision = getEnvironment().getDraftRevision('settings-rule');
    if (!await getEnvironment().confirm(t('confirmDeleteRule',{domain:item.domain}))) return;
    if (await act({type:'DELETE_RULE',id:item.id}) && editingRuleId === item.id) {
      if (!getEnvironment().setDraftDirty(false,'settings-rule',revision)) return;
      setEditingRuleId('');
      setRuleError(false);
      setRule({domain:'',includeSubdomains:true,action:'endpoint',
        endpointId:config.endpoints[0]?.id || '',priority:'100'});
    }
  }
  async function loadBackupFile(file: File) {
    const generation = ++backupReadGeneration.current;
    const revision = getEnvironment().getDraftRevision('settings-backup');
    setBackupImported(false);
    setError('');
    if (file.size > BACKUP_MAX_BYTES) {
      setErrorKey('errBackupTooLarge');
      return;
    }
    try {
      const text = await file.text();
      if (generation !== backupReadGeneration.current ||
        getEnvironment().getDraftRevision('settings-backup') !== revision) return;
      parseBackupForImport(text);
      if (backup.trim() && !await getEnvironment().confirm(t('apReplaceBackupDraft'))) return;
      if (generation !== backupReadGeneration.current ||
        getEnvironment().getDraftRevision('settings-backup') !== revision) return;
      setBackup(text);
      getEnvironment().setDraftDirty(true,'settings-backup');
    } catch (cause) {
      if (generation !== backupReadGeneration.current) return;
      setErrorKey(cause instanceof BackupImportValidationError ? cause.key : 'backupFileFailed');
    }
  }
  async function importBackup() {
    const draftRevision=getEnvironment().getDraftRevision('settings-backup');
    setBackupImported(false);
    let incoming: unknown;
    try { incoming = parseBackupForImport(backup); }
    catch (cause) {
      setErrorKey(cause instanceof BackupImportValidationError ? cause.key : 'backupInvalidFormat');
      return;
    }
    // Confirmation only follows format validation. Background checks Chrome
    // proxy control and validates again before replacing any configuration.
    if (!await getEnvironment().confirm(t('importWillReplaceYourCurrentConfigurationWithoutEnablingIt'))) return;
    if (await act({type:'IMPORT',config:incoming})) {
      if(!getEnvironment().setDraftDirty(false,'settings-backup',draftRevision))return;
      setBackup('');
      setBackupImported(true);
    }
  }
  async function exportConfig() {
    const response = await act({type:'EXPORT'});
    if (!response?.share) return;
    const data = new Blob([JSON.stringify(response.share,null,2)],{type:'application/json'});
    const href = URL.createObjectURL(data);
    const a = document.createElement('a');a.href=href;a.download='ai-proxy-share-v2.json';a.click();
    setTimeout(()=>URL.revokeObjectURL(href),3000);
  }
  return <main className={'options' + (tab==='subscriptions' ? ' sourcesOptions' : '')}>
    <header className="optionsHead">
      <Button className="proxy-back" variant="quiet" aria-label={t('apBackToPanel')} title={t('apBackToPanel')} onClick={()=>getEnvironment().navigate('')}>{t('apPanelBack')}</Button>
      <nav className="settingsSectionNav" aria-label={t('settingsSections')}>
        <label htmlFor="settings-section" className="settingsSectionLabel">{t('settingsSections')}</label>
        <select id="settings-section" aria-label={t('settingsSections')} value={tab}
          onChange={event=>navigate(event.target.value as Page)}>
          <optgroup label={t('proxyManagement')}>
            {tabs.filter(item=>item.id!=='official').map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
          </optgroup>
          <optgroup label={t('optionalServices')}><option value="official">{t('officialNetwork')} · {t('officialOptional')}</option></optgroup>
        </select>
      </nav>
      <div className="optionsHeadActions">
        <Button type="button" className="optionsCopyLink" aria-label={copiedPageLink?t('pageLinkCopied'):t('copyPageLink')}
          title={t('copyPageLink')} onClick={() => void copyCurrentPageLink()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg>
        </Button>
        <Button className="settingsRefresh" disabled={busy} aria-label={t('refreshStatus')} title={t('refreshStatus')} onClick={() => void refresh()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M19 11a7 7 0 0 0-12-5L4 9m16 6-3 3A7 7 0 0 1 5 13"/></svg>
        </Button>
      </div>
    </header>
    <div className="layout">
      <section ref={sectionContent} className={'panel optionsContent optionsContent--' + tab}>
        {pageLinkCopyFailed && <p className="notice error" role="alert">{t('pageLinkCopyFailed')}</p>}
        {copiedPageLink && <p className="settingsCopyFeedback" role="status">{t('pageLinkCopied')}</p>}
        {error && !editorOpen && <p className="notice error" role="alert">{error}</p>}
        {tab!=='official' && !(tab==='subscriptions' && parseSubscriptionRoute(locationHash).kind==='official') &&
          <OptionsPageHeader
          title={tabs.find(item=>item.id===tab)?.name ?? ''}
          description={tab==='profiles'?t('apProfileIntro'):tabs.find(item=>item.id===tab)?.caption ?? ''}
          className={tab==='profiles'?'profilePanelHead':''}
          actions={tab==='profiles' && endpoints.length>0?<>
            <Button variant="primary" className="primary" onClick={()=>openEditor()}>{t('addProxy2')}</Button>
            <details className="settingsAddWays"><summary>{t('apMoreSetup')}</summary><div className="settingsAddWayActions">
              <Button onClick={()=>navigate('backup')}>{t('importSettings')}</Button>
              <Button onClick={()=>navigateAction('subscriptions','local')}>{t('addLocalProxyClient')}</Button>
              <Button type="button" onClick={()=>{sectionContent.current?.querySelector<HTMLDetailsElement>('.settingsAddWays')?.removeAttribute('open');navigateAction('profiles','pac');}}>{t('localPac')}</Button>
            </div></details>
          </>:undefined}
        />}
        {tab==='profiles' && <>
          <section className="listSection">
            <div className="sectionHeading">
              <div><h2>{t('proxyServers')} <span className="countTag">{endpoints.length}</span></h2>
                <p className="hint">{t('selectAProfileThenApplyItEditingAProfile')}</p></div>
              <Button className="textAction" onClick={()=>navigate('subscriptions')}>{t('alreadyHaveAProxySubscription')}</Button>
            </div>
            {endpoints.length===0 ? <div className="emptyState">
               <div className="actions"><Button variant="primary" className="primary" onClick={()=>openEditor()}>{t('addYourProxy2')}</Button>
                 <Button onClick={()=>navigateAction('subscriptions','new')}>{t('recordSubscriptionSource')}</Button>
                 <Button onClick={()=>navigateAction('subscriptions','local')}>{t('addLocalProxyClient')}</Button></div>
             </div> : <div className="records profileRecords">{endpoints.map(p=>{
              const profile=endpointRefs(p.id)[0];
              const source=config.sources.find(s=>s.id===p.sourceId);
              const chosen=config.selection.mode==='profile'&&config.selection.profileId===profile?.id;
              const applied=state.runtime.applied&&state.runtime.activeSelection?.mode==='profile'&&state.runtime.activeSelection.profileId===profile?.id;
              return <article className="record proxyRecord" key={p.id}>
                <div className="proxyRecordMain">
                  <span className="proxyAvatar" aria-hidden="true">{p.scheme.startsWith('socks')?'S':'P'}</span>
                  <div><strong>{p.name}</strong><small className="mono">{p.scheme.toUpperCase()} · {p.host}:{p.port}</small>
                    <div className="rowBadges">{source?.kind==='local-client'&&<span>{t('localClientPortNotTested')}</span>}{p.credentialRef&&<span>{t('sessionAuthenticationRequired')}</span>}{applied&&<span className="appliedBadge">{t('appliedToChrome2')}</span>}</div></div>
                </div>
                <div className="recordActions">
                  <Button className={chosen?'selectedAction':''} disabled={busy||!profile} aria-label={t('selectNamedProxy',{name:p.name})}
                    onClick={()=>void act({type:'SELECT',selection:{mode:'profile',profileId:profile?.id}})}>{chosen?t('selected'):t('select2')}</Button>
                  <Button onClick={()=>source?.kind==='local-client'?navigate('subscriptions'):openEditor(p)}
                    aria-label={t('editNamedProxy',{name:p.name})}>{t('edit')}</Button>
                  <Button className="quietDanger" disabled={busy||config.managed} title={config.managed?t('stopManagingTheProxyBeforeDeletingIt'):''}
                    onClick={async()=>{if(await getEnvironment().confirm(t('confirmDeleteProxy',{name:p.name})))void act({type:'DELETE_ENDPOINT',id:p.id});}}
                    aria-label={t('deleteNamedProxy',{name:p.name})}>{t('delete')}</Button>
                </div>
              </article>;
            })}</div>}
          </section>
          <section className="optionsModeBar" aria-label={t('browserRoutingMode')}>
            <div className="settingsRuntimeStatus" role="status"><span className={'controlChip ' + (statusTone(state.runtime) === 'ok' ? 'isApplied' : statusTone(state.runtime) === 'danger' ? 'isError' : statusTone(state.runtime) === 'pending' ? 'isPending' : '')}>{t(statusLabelKey(state.runtime))}</span></div>
            <div className="sectionHeading"><div><h2>{t('currentProxyMode')}</h2><p className="hint">{t('selectionSavesAPendingRouteOnlyApplySelectionRequests')}</p></div>
              <span className="subtleTag">{t('ruleCount',{count:config.rules.filter(r=>r.enabled).length})}</span></div>
            <div className="optionsModeGrid" role="group" aria-label={t('fourProxyModes')}>
              {modes.map(item=><Button key={item.mode} variant={config.selection.mode===item.mode?'primary':'secondary'} disabled={busy}
                className={config.selection.mode===item.mode?'selected':''}
                aria-pressed={config.selection.mode===item.mode}
                onClick={()=>void act({type:'SELECT',selection:{...config.selection,mode:item.mode}})}>{item.name}</Button>)}
            </div>
            {config.selection.mode==='profile' && <div className="optionsProfileSelect">
              <label htmlFor="options-profile">{t('useASavedProfile')}</label>
              <select id="options-profile" disabled={busy} value={config.selection.profileId||''}
                onChange={e=>void act({type:'SELECT',selection:{mode:'profile',profileId:e.target.value||undefined}})}>
                <option value="">{t('selectASavedProxyOrPac')}</option>
                {profiles.map(p=><option key={p.id} value={p.id}>{p.name} · {p.kind==='pac-inline'?t('localPac'):t('proxy')}</option>)}
              </select>
            </div>}
            {config.selection.mode==='rules' && <Button className="textAction" onClick={()=>navigate('rules')}>
              {t('viewAndEditWebsiteRules')}
            </Button>}
            <div className="actions modeActions">
              <Button variant="primary" className="primary" disabled={busy||(config.selection.mode==='profile'&&!selectedProfile)}
                onClick={()=>void applyRoute()}>{t('applySelection')}</Button>
              <Button disabled={busy||!(state.runtime.canStop||state.runtime.stopFinalizationPending)} onClick={()=>void act({type:'STOP'})}>{t(state.runtime.stopFinalizationPending?'apFinishStop':'stopManagingProxy')}</Button>
              <small>{t('appliedSettingsWebsiteAccess')}</small>
            </div>
            <details className="runtimeDetails" open={!!error || !!state.runtime.proxyError || state.runtime.credentialRequired ||
              state.runtime.control==='controlled_by_other_extensions' || state.runtime.control==='not_controllable' ||
              (state.runtime.managedIntent&&!state.runtime.applied) ||
              (!state.runtime.managedIntent&&state.runtime.control==='controlled_by_this_extension')}>
              <summary>{t('controlAndApplicationDetails')}</summary>
              <Status status={state.runtime} compact/>
            </details>
          </section>
          <details className="pacDetails" ref={pacDetails}>
            <summary><span><strong>{t('localPacProfiles')}</strong><small>{t('pacCount',{count:profiles.filter(p=>p.kind==='pac-inline').length})}</small></span><span className="summaryAction">{t('expandSettings')}</span></summary>
            <div className="pacContent">
              <p className="hint">{t('onlyUserSuppliedLocalPacScriptsAreSupportedNot')}</p>
              <section data-draft-scope="settings-pac" className="pacStarterGuide" aria-label={t('pacStarterTitle')}>
                <h3>{t('pacStarterTitle')}</h3>
                <p className="hint">{t('pacStarterIntro')}</p>
                {endpoints.length===0 ? <div className="pacStarterEmpty">
                  <p>{t('pacStarterNoEndpoints')}</p>
                  <Button type="button" onClick={()=>openEditor()}>{t('addProxy2')}</Button>
                </div> : <>
                  <div className="pacStarterFields">
                    <div>
                      <label htmlFor="pac-starter-mode">{t('pacStarterModeLabel')}</label>
                      <select id="pac-starter-mode" value={pacStarterMode}
                        onChange={e=>{setPacStarterMode(e.target.value as PacStarterMode);setPacStarterError('');}}>
                        <option value="site">{t('pacStarterSiteMode')}</option>
                        <option value="all">{t('pacStarterAllMode')}</option>
                      </select>
                    </div>
                    <FormField id="pac-starter-endpoint" label={t('pacStarterEndpointLabel')}
                      error={pacStarterError==='pacStarterChooseEndpoint' ? t(pacStarterError) : undefined}>
                      {controlProps => <select {...controlProps} value={pacStarterEndpoint}
                        onChange={e=>{setPacStarterEndpoint(e.target.value);setPacStarterError('');}}>
                        <option value="">{t('pacStarterChooseEndpoint')}</option>
                        {endpoints.map(endpoint=><option key={endpoint.id} value={endpoint.id}>
                          {endpoint.name} · {endpoint.scheme.toUpperCase()} · {endpoint.host}:{endpoint.port}
                        </option>)}
                      </select>}
                    </FormField>
                    {pacStarterMode==='site' && <FormField id="pac-starter-site" className="pacStarterSite"
                      label={t('pacStarterSiteLabel')} hint={t('pacStarterSiteHelp')}
                      error={pacStarterError==='pacStarterInvalidDomain' ? t(pacStarterError) : undefined}>
                      {controlProps => <ClearableInput {...controlProps} type="text" spellCheck={false} fieldLabel={t('pacStarterSiteLabel')} value={pacStarterSite}
                         onValueChange={value=>{setPacStarterSite(value);setPacStarterError('');}}
                         placeholder={t('pacStarterSitePlaceholder')}/>}
                    </FormField>}
                  </div>
                  <div className="actions">
                    <Button type="button" disabled={busy} onClick={insertPacStarter}>{t('pacStarterInsert')}</Button>
                  </div>
                </>}
                <p className="hint">{t('pacStarterNoAutoApply')}</p>
                <p className="hint">{t('pacStarterPreferRules')}</p>
              </section>
              <div className="records">{profiles.filter(p=>p.kind==='pac-inline').map(p=><article className="record" key={p.id}>
                <div><strong>{p.name}</strong><small>{t('localPacScriptConnectivityUnverified')}</small></div>
                <div className="recordActions">
                  <Button onClick={()=>void editPac(p)}>{t('edit')}</Button>
                  <Button disabled={busy||config.managed} onClick={async()=>{
                    if (await getEnvironment().confirm(t('confirmDeletePac',{name:p.name}))) void act({type:'DELETE_PROFILE',id:p.id});
                  }}>{t('delete')}</Button>
                </div>
              </article>)}</div>
              <form data-draft-scope="settings-pac" onSubmit={e=>void savePac(e)}>
                <label htmlFor="pac-name">{t('pacName')}</label><ClearableInput id="pac-name" fieldLabel={t('pacName')} required value={pacName} onValueChange={setPacName} placeholder={t('myLocalPac')}/>
                <label htmlFor="pac-text" className="fieldSpacing">{t('findproxyforurlScript')}</label>
                <textarea id="pac-text" required spellCheck={false} value={pacText} onChange={e=>setPacText(e.target.value)}
                  placeholder={'function FindProxyForURL(url, host) { return "DIRECT"; }'}/>
                <div className="actions"><Button variant="primary" className="primary" disabled={busy} type="submit">{editingPacId?t('savePacChanges'):t('saveLocalPac')}</Button>
                  {editingPacId&&<Button type="button" onClick={()=>{getEnvironment().setDraftDirty(false,'settings-pac');setEditingPacId('');setPacName('');setPacText('')}}>{t('cancelEditing')}</Button>}</div>
              </form>
            </div>
          </details>
           <RotationSettings endpoints={endpoints}/>
          <aside className="serviceNote">
            <div><strong>{t('noProxyService')}</strong><p>{t('aiProxyManagesYourProxiesItDoesNotProvide')}</p></div>
            <Button onClick={()=>navigate('official')}>{t('learnAboutTheOfficialNetwork')}</Button>
          </aside>
        </>}
        {tab==='rules' && <div className="rulesPage">
          <div className="rulesGrid">
            <section className="rulesList">
              <h2>{t('websiteRules2')} <span className="countTag">{config.rules.length}</span></h2>
              <p className="hint">{t('ruleEditorIntro')}</p>
              {config.rules.length === 0 ? <div className="sourceEmpty rulesEmpty">{t('rulesEmpty')}</div> :
                <div className="records">{config.rules.map(r=><article className="record" key={r.id}><div><strong>{r.domain}{r.includeSubdomains?t('subdomains'):''}</strong>
            <small>{t('priority')} {r.priority} · {r.action==='direct'?'DIRECT':endpoints.find(e=>e.id===r.endpointId)?.name || t('missingProxy2')}</small></div>
            <div className="actions"><Button onClick={()=>void editRule(r)}>{t('edit')}</Button>
              <Button disabled={busy} onClick={()=>void removeRule(r)}>{t('delete')}</Button></div></article>)}</div>}
            </section>
            <section className="rulesEditor">
              <h2>{editingRuleId?t('editRule'):t('addRule')}</h2>
              {ruleSaved&&<p className="r86Notice" role="status">{t('r86Saved')}</p>}
              <form data-draft-scope="settings-rule" className="ruleEditorForm" onSubmit={e=>void saveRule(e)}>
            <FormField id="rule-domain" label={t('ruleWebsiteInput')} hint={t('ruleWebsiteHelp')}
              error={ruleError ? t('ruleWebsiteInvalid') : undefined}>
              {controlProps => <ClearableInput {...controlProps} fieldLabel={t('ruleWebsiteInput')} required value={rule.domain}
                 onValueChange={value=>{setRuleError(false);setRule({...rule,domain:value});}}
                 onBlur={()=>{
                   if (!rule.domain.trim()) return;
                   try {
                     const domain = normalizeRuleSiteInput(rule.domain);
                     setRule(prev=>({...prev,domain}));
                     setRuleError(false);
                   }
                   catch {setRuleError(true);}
                 }}
                 placeholder={t('ruleWebsitePlaceholder')}/>}
            </FormField>
            <div className="ruleRouteFields">
              <div><label htmlFor="rule-action">{t('ruleWebsiteUse')}</label>
                <select id="rule-action" value={rule.action}
                  onChange={e=>setRule({...rule,action:e.target.value as 'direct'|'endpoint'})}>
                  <option value="endpoint">{t('specificProxy')}</option>
                  <option value="direct">{t('directConnection2')}</option>
                </select>
              </div>
              {rule.action==='endpoint' && <div><label htmlFor="rule-endpoint">{t('specificProxy')}</label>
                <select id="rule-endpoint" required value={rule.endpointId} onChange={e=>setRule({...rule,endpointId:e.target.value})}>
                  <option value="">{t('pleaseSelect')}</option>
                  {endpoints.map(p=><option key={p.id} value={p.id}>{p.name} · {p.scheme.toUpperCase()}</option>)}
                </select>
              </div>}
            </div>
            <details className="ruleAdvanced">
              <summary>{t('ruleAdvancedOptions')}</summary>
              <div className="ruleAdvancedFields">
                <label className="ruleCheckbox"><input type="checkbox" checked={rule.includeSubdomains}
                  onChange={e=>setRule({...rule,includeSubdomains:e.target.checked})}/>{t('includeSubdomains')}</label>
                <div><label htmlFor="rule-priority">{t('priority')}</label>
                  <input id="rule-priority" type="number" min="0" max="99999" required
                    value={rule.priority} onChange={e=>setRule({...rule,priority:e.target.value})}/>
                  <p className="hint">{t('rulePriorityHelp')}</p>
                </div>
              </div>
            </details>
            <div className="actions">
              <Button variant="primary" className="primary" disabled={busy || rule.action==='endpoint'&&!endpoints.length}
                type="submit">{t('saveRule')}</Button>
              <Button type="button" onClick={()=>{
                setRuleSaved(false);getEnvironment().setDraftDirty(false,'settings-rule');setEditingRuleId('');setRuleError(false);
                setRule({domain:'',includeSubdomains:true,action:'endpoint',endpointId:endpoints[0]?.id||'',priority:'100'});
                document.getElementById('rule-domain')?.focus();
              }}>{t('cancel')}</Button>
              <p className="hint">{t('ruleSaveDoesNotApply')}</p>
            </div>
              </form>
            </section>
          </div>
          <section className="rulesDefault" data-draft-scope="settings-default">
            <h2>{t('whenNoRuleMatches')}</h2>
            <p className="hint">{t('directByDefaultTrafficUsesAProxyOnlyWhen')}</p>
          <div className="formGrid"><div><label htmlFor="default-action">{t('defaultRoute')}</label><select id="default-action" value={defaultAction}
            onChange={e=>setDefaultAction(e.target.value)}><option value="direct">DIRECT</option><option value="endpoint">{t('specificProxy')}</option></select></div>
            <div><label htmlFor="default-endpoint">{t('proxy')}</label><select id="default-endpoint" disabled={defaultAction==='direct'} value={defaultEndpointId}
              onChange={e=>setDefaultEndpointId(e.target.value)}><option value="">{t('pleaseSelect')}</option>{endpoints.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div></div>
          <div className="actions"><Button disabled={busy || (defaultAction==='endpoint' && !defaultEndpointId)} onClick={async()=>{const revision=getEnvironment().getDraftRevision('settings-default');if(await act({type:'SET_DEFAULT',target:defaultAction==='direct'?
            {action:'direct'}:{action:'endpoint',endpointId:defaultEndpointId}}))getEnvironment().setDraftDirty(false,'settings-default',revision);}}>{t('saveDefaultRoute')}</Button>
            <small>{t('current')}{config.defaultTarget.action==='direct'?'DIRECT':endpoints.find(e=>e.id===config.defaultTarget.endpointId)?.name}</small></div>
          </section>
        </div>}
        {tab==='subscriptions' && <SourcesPage config={config} runtime={state.runtime}
          busy={busy} act={act} setError={setError} setErrorKey={setErrorKey} navigate={navigate}
          route={parseSubscriptionRoute(locationHash)} navigateSubscription={navigateSubscription}
          quickEntry={locationHash==='#/subscriptions/local'?'local':locationHash==='#/subscriptions/new'?'subscription':null}/>}
        {tab==='backup' && <div className="backupPage">
          <div className="backupGrid">
            <section className="backupCard backupExport">
              
              <h2>{t('backupExportTitle')}</h2>
              <p className="hint">{t('shareBackupsContainNonSecretSettingsOnlyExcludingPac')}</p>
              <Button variant="primary" className="primary" onClick={()=>void exportConfig()}>{t('exportShareableBackupV2NoPasswords')}</Button>
              <p className="hint">{t('aShareableBackupCannotFullyRestoreLocalPacScripts')}</p>
            </section>
            <section className="backupCard backupImport" data-draft-scope="settings-backup">
              
              <h2>{t('backupImportTitle')}</h2>
              <label htmlFor="backup-file">{t('backupChooseFile')}</label>
              <input id="backup-file" type="file" accept=".json,application/json" disabled={busy}
                aria-describedby="backup-file-hint" onChange={e=>{
                  // File selection is not a changed backup until validation and
                  // replacement review succeed. Avoid a later bubble revision.
                  e.stopPropagation();
                  const file=e.currentTarget.files?.[0];
                  e.currentTarget.value='';
                  if (file) void loadBackupFile(file);
                }}/>
              <p id="backup-file-hint" className="hint">{t('backupFileSizeHelp')}</p>
              <label htmlFor="import-data">{t('pasteJsonBackup')}</label>
              <textarea id="import-data" value={backup} disabled={busy} onChange={e=>{
                backupReadGeneration.current++;
                setBackup(e.target.value);
                setBackupImported(false);
                setError('');
              }} placeholder='{"schemaVersion":2,...}' spellCheck={false}/>
              <Button disabled={busy||!backup.trim()} onClick={()=>void importBackup()}>
                {t('validateAndImportStopManagingFirst')}
              </Button>
              {backupImported&&<p role="status" className="backupSuccess">{t('backupImportSucceeded')}</p>}
            </section>
          </div>
        </div>}
        {tab==='diagnostic' && <DiagnosticsPage state={state} busy={busy}
          onRefresh={refresh} onProbe={() => act({type:'PROBE'})}
          onStop={() => act({type:'STOP'})} onProfiles={() => navigate('profiles')} />}
        {tab==='general' && <div className="generalPage">
          <div className="generalGrid">
            <article className="record languageRecord"><div>
              <strong>{t('interfaceLanguage')}</strong>
              <small>{t('languageHelp')}</small>
            </div><label htmlFor="ui-locale" className="languageSelect">
              <select id="ui-locale" aria-label={t('interfaceLanguage')} value={preference} onChange={e => {
                void setPreference(e.target.value as UiLocalePreference).catch(() => setErrorKey('languageSettingFailure'));
              }}>
                <option value="auto">{t('autoBrowserLanguage')}</option>
                <option value="zh-CN">{t('simplifiedChinese')}</option>
                <option value="en">{t('englishLanguage')}</option>
                <option value="zh-TW">{t('traditionalChinese')}</option>
              </select>
            </label></article>
            <article className="record generalInfoCard"><div><strong>{t('freeThirdPartyProxyManagement')}</strong><small>{t('noSignUpPurchaseOrTopUpRequiredNo')}</small></div></article>
            <article className="record generalInfoCard"><div><strong>{t('privacyAndData')}</strong><small>{t('settingsAreStoredLocallyInTheBrowserProxyPasswords')}</small></div></article>
            <article className="record generalInfoCard"><div><strong>{t('helpAndFeedback')}</strong><small>{t('theRepositoryIsPrivateAPublicCommunityIsNot')}</small></div>
              <a href="https://github.com/shopable-ai/ai-proxy" target="_blank" rel="noreferrer">{t('projectRepository')}</a></article>
          </div>
          <p className="hint">{t('thisExtensionDoesNotGuaranteeProxyCoverageForDns')}</p>
        </div>}
        {tab==='official' && <OfficialServicePage onBack={()=>navigate('profiles')}
          chromeApplied={state.runtime.applied} />}
      </section>
    </div>
    <dialog className="proxyEditorDialog" ref={editorDialog}
      aria-labelledby="proxy-editor-title"
      onCancel={e=>{e.preventDefault();void requestCloseEditor();}}
      onClose={event=>{
        // A queued close event from the previous opening must not dismiss a
        // dialog that the user has already reopened.
        if (event.currentTarget.open) return;
        if(editorOpen)closeEditor();
        editorReturnFocus.current?.focus();
      }}>
      <form onSubmit={e=>void saveProxy(e)} data-draft-scope="settings-proxy" className="proxyEditorForm">
        <header className="editorHead"><div><p className="eyebrow">{t('localProxyConfiguration')}</p>
          <h2 id="proxy-editor-title">{editingId?t('editProxy'):t('addProxy')}</h2></div>
          <Button type="button" className="iconButton" onClick={()=>void requestCloseEditor()} aria-label={t('closeProxyEditor')}>×</Button>
        </header>
        <p className="hint">{t('proxyEditorIntro')}</p>
        <div className="proxyPrimaryFields">
          <div><label htmlFor="ep-host">{t('host')}</label>
            <ClearableInput id="ep-host" autoFocus required fieldLabel={t('host')} value={proxy.host}
               aria-describedby={addressPasteError?'ep-host-error':undefined}
               onValueChange={host=>{setProxy({...proxy,host});setAddressPasteError(false);}}
               onPaste={handleProxyPaste} placeholder={t('127001OrProxyExampleCom')}/>
             <HostQuickPick value={proxy.host} onChoose={host=>{setProxy({...proxy,host});setAddressPasteError(false);}}/>
             {addressPasteError&&<small id="ep-host-error" className="proxyEntryError" role="alert">{t('proxyPasteUnsupported')}</small>}
           </div>
          <div><label htmlFor="ep-scheme">{t('protocol')}</label>
            <select id="ep-scheme" value={proxy.scheme}
              onChange={e=>{
                const scheme=e.target.value as ProxyScheme;
                if (scheme.startsWith('socks')) { setUsername(''); setPassword(''); }
                setProxy({...proxy,scheme});
              }}>
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
              <option value="socks4">SOCKS4</option>
              <option value="socks5">SOCKS5</option>
            </select></div>
          <div><label htmlFor="ep-port">{t('port')}</label>
            <ClearableInput id="ep-port" type="number" min={1} max={65535} required fieldLabel={t('port')}
               aria-invalid={proxy.port!==''&&!isValidProxyPort(proxy.port)}
               aria-describedby={proxy.port!==''&&!isValidProxyPort(proxy.port)?'ep-port-error':undefined}
               value={proxy.port} onValueChange={port=>setProxy({...proxy,port})} placeholder="7890"/>
             <PortQuickPick scheme={proxy.scheme} value={proxy.port} onChoose={port=>setProxy({...proxy,port})}/>
             {proxy.port!==''&&!isValidProxyPort(proxy.port)&&<small id="ep-port-error" className="proxyEntryError" role="alert">{t('errInvalidPort')}</small>}
           </div>
        </div>
        <p className="hint">{t('proxyEditorProtocolHelp')}</p>
        <div className="proxyNameField"><label htmlFor="ep-name">{t('nameOptional')}</label>
          <ClearableInput id="ep-name" fieldLabel={t('name')} maxLength={80} value={proxy.name}
             onValueChange={name=>setProxy({...proxy,name})} placeholder={t('eGMyLocalProxy')}/></div>
        <details className="proxyAuthDetails">
          <summary>{t('proxyEditorAuthOptions')}</summary>
          <p className="notice">{t('apAuthHelp')}</p>
          <div className="proxyAuthFields">
            <div><label htmlFor="ep-username">{t('proxyUsernameOptional')}</label>
              <ClearableInput id="ep-username" autoComplete="off" fieldLabel={t('proxyUsernameOptional')} value={username}
                 onValueChange={setUsername} disabled={proxy.scheme.startsWith('socks')}/></div>
            <div><label htmlFor="ep-password">{t('sessionPasswordNotBackedUp')}</label>
              <ClearableInput id="ep-password" type="password" revealPassword autoComplete="new-password" fieldLabel={t('sessionPasswordNotBackedUp')} value={password}
                 onValueChange={setPassword} disabled={proxy.scheme.startsWith('socks')}/></div>
          </div>
          <p className="hint">{t('httpSPasswordsAreSessionOnlyChangesToHost')}</p>
        </details>
        {error&&<p className="notice error" role="alert">{error}</p>}
        <footer className="editorActions">
          <Button type="button" disabled={busy} onClick={closeEditor}>{t('cancel')}</Button>
          <Button variant="primary" className="primary" disabled={busy} type="submit">{editingId?t('saveChanges'):t('saveProxy')}</Button>
          {!editingId&&<Button type="submit" data-add-another="true" disabled={busy}>{t('proxySaveAndAddAnother')}</Button>}
        </footer>
      </form>
    </dialog>
  </main>;
}

