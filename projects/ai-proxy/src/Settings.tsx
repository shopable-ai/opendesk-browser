import * as React from 'react';
import {getEnvironment} from './environment';
import {Button} from '@opendesk/ui';
import { useI18n } from './i18n/LocaleProvider';
import type { UiLocalePreference } from './i18n/locale';
import { useEffect, useRef, useState } from 'react';
import { copyableOptionsHash, diagnosticHash, optionsHash, parseOptionsHash, parseSubscriptionRoute, subscriptionRouteHash,
  type OptionsSection, type SubscriptionRoute } from './ui/optionsRoute';
import { OptionsPageHeader, OptionsNavIcon } from './ui/OptionsShell';
import { ProxyIcon } from './ui/ProxyIcon';
import { BACKUP_MAX_BYTES, BackupImportValidationError, parseBackupForImport } from './ui/backupImport';
import { Status, statusLabelKey, statusTone } from './ui/Status';
import { ProxyEditor } from './ui/ProxyEditor';
import { FormField } from './ui/FormField';
import { ClearableInput } from './ui/ProxyEntry';
import { SourcesPage } from './ui/SourcesPage';
import { RotationSettings } from './ui/RotationPlan';
import { DiagnosticsPage } from './ui/DiagnosticsPage';
import { OfficialServicePage } from './ui/OfficialServicePage';
import { HeaderActionsEditor } from './ui/HeaderActionsEditor';
import { useProxy } from './ui/useProxy';
import type { Profile, ProxyEndpoint, RouteMode, SiteRule } from './domain/types';
import { createPacStarter, type PacStarterMode } from './domain/pac-starters';
import { normalizeRuleSiteInput, priorityForSiteQuickRule } from './domain/config';

type Page = OptionsSection;

export default function App({onClose,navigationBusy=false,presentation='sidebar',headerNavigation=false,headerActionsStore}:{headerActionsStore?:any;onClose?:()=>void;navigationBusy?:boolean;presentation?:'sidebar'|'management';headerNavigation?:boolean}={}) {
  const { t, preference, setPreference } = useI18n();
  const modes:{mode:RouteMode;name:string}[]=[
  // Keep the same primary action order as the persistent R8.3 Side Panel.
  {mode:'profile',name:t('popupModeProfile')},{mode:'rules',name:t('popupModeRules')},
  {mode:'direct',name:t('popupModeDirect')},{mode:'system',name:t('popupModeSystem')}
];
const tabs: {id:Page; name:string; caption:string}[] = [
  {id:'profiles',name:t('proxyProfiles'),caption:t('haveAnHttpHttpsSocksProxyOrLocalGateway')},
  {id:'rules',name:t('websiteRules2'),caption:t('routeByDomainThroughAProxyOrDirect')},
  {id:'subscriptions',name:t('apSubscriptionsNav'),caption:t('subscriptionManageDescription')},
  {id:'backup',name:t('importAndBackup'),caption:t('importAndExportNonSecretSettings')},
  {id:'diagnostic',name:t('networkDiagnostics2'),caption:t('statusExtensionProbesAndTroubleshooting')},
  {id:'general',name:t('generalSettings'),caption:t('privacyPermissionsAndLimitations')},
  {id:'official',name:t('officialNetwork'),caption:t('officialIntro')}
];

  const {state, busy, error, setError, setErrorKey, clearErrorKey, act, refresh} = useProxy();
  const navigation = getEnvironment().navigation;
  const confirmationRequest=useRef<AbortController|null>(null);
  const editorGeneration=useRef(0);
  const mounted=useRef(true),latestEtag=useRef(state?.configEtag);
  latestEtag.current=state?.configEtag;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;confirmationRequest.current?.abort();};},[]);
  async function confirmIntent(text:string) {
    if(confirmationRequest.current||!mounted.current)return false;
    const controller=new AbortController();confirmationRequest.current=controller;
    const environment=getEnvironment(),draftVersion=environment.getDraftVersion?.();
    const etag=latestEtag.current,generation=editorGeneration.current;
    let approved=false;
    try {
      const accepted=await environment.confirm(text,{signal:controller.signal});
      approved=accepted===true&&mounted.current&&!controller.signal.aborted&&
        getEnvironment()===environment&&generation===editorGeneration.current&&
        etag===latestEtag.current&&draftVersion===environment.getDraftVersion?.();
      return approved;
    } catch { return false; }
    finally {
      if(confirmationRequest.current===controller)confirmationRequest.current=null;
    }
  }
  const [locationHash,setLocationHash] = useState(() => navigation.getRoute());
  const tab: Page = parseOptionsHash(locationHash);
  const [pendingSection,setPendingSection]=useState<{section:Page;route:string;etag:string;revision:number}|null>(null);
  function chooseSection(section:Page) {
    if(!tabs.some(item=>item.id===section)||busy)return;
    const environment=getEnvironment();
    if(section===tab){setPendingSection(null);return;}
    if(!environment.hasDrafts()){setPendingSection(null);navigate(section);return;}
    // A native select change is not a click/key/cancel confirmation gesture.
    setPendingSection({section,route:navigation.getRoute(),etag:latestEtag.current,
      revision:environment.getDraftVersion()});
  }
  function activateSection() {
    const target=pendingSection,environment=getEnvironment();
    if(!target||busy)return;
    setPendingSection(null);
    if(target.route!==navigation.getRoute()||target.etag!==latestEtag.current||
      target.revision!==environment.getDraftVersion())return;
    // Invoke the existing guard synchronously in this explicit button click.
    navigate(target.section);
  }
  const [copiedPageLink,setCopiedPageLink] = useState(false);
  const [pageLinkCopyFailed,setPageLinkCopyFailed] = useState(false);
  const [proxyNotice,setProxyNotice] = useState<''|'apProxySavedNotice'|'apProxyDeletedNotice'>('');
  const pageLinkCopyRequest = useRef(0);
  const sectionContent=useRef<HTMLElement>(null);
  const lastSection=useRef(tab);
  const localEditOrigin=useRef<{top:number;focusId:string}|null>(null);
  const pacDetails=useRef<HTMLDetailsElement>(null);
  // The native selector keeps all seven sections discoverable without a
  // horizontally scrolling desktop navigation. Reset only on section changes.
  useEffect(() => {
    if(lastSection.current===tab)return;
    lastSection.current=tab;
    const scroller=sectionContent.current?.closest('.proxy-route');
    const origin=tab==='profiles'?localEditOrigin.current:null;
    scroller?.scrollTo({top:origin?.top??0});
    if(origin){
      localEditOrigin.current=null;
      requestAnimationFrame(()=>document.getElementById(origin.focusId)?.focus({preventScroll:true}));
    }
  },[tab]);
  useEffect(() => {
    const syncLocation = () => {
      setLocationHash(navigation.getRoute());
      setPendingSection(null);
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
  function editLocal(endpoint: ProxyEndpoint) {
    localEditOrigin.current={top:sectionContent.current?.closest('.proxy-route')?.scrollTop??0,
      focusId:'settings-proxy-'+endpoint.id};
    navigateSubscription({kind:'local',id:endpoint.id});
  }
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
  const [ruleEditorOpen,setRuleEditorOpen] = useState(false);
  const [dismissedRuleDetail,setDismissedRuleDetail] = useState('');
  const ruleEditorGeneration=useRef(0);
  const ruleListPosition=useRef({top:0,focusId:'settings-rule-add'});
  useEffect(()=>()=>{ruleEditorGeneration.current++;},[]);
  useEffect(()=>{
    if(tab==='rules')return;
    ruleEditorGeneration.current++;
    setRuleEditorOpen(false);
  },[tab]);
  const [defaultAction,setDefaultAction] = useState('direct');
  const [defaultEndpointId,setDefaultEndpointId] = useState('');
  const [backup,setBackup] = useState('');
  const [backupImported,setBackupImported] = useState(false);
  const [pendingBackup,setPendingBackup]=useState<any>(null);
  const backupCandidate=useRef<any>(null);
  function stageBackup(candidate:any){backupCandidate.current=candidate;setPendingBackup(candidate);}
  const backupReadGeneration = useRef(0);
  useEffect(()=>()=>{backupReadGeneration.current++;},[]);
  const [editorOpen,setEditorOpen] = useState(false);
  const [editingEndpoint,setEditingEndpoint]=useState<ProxyEndpoint|undefined>();
  const [proxyOpeningEtag,setProxyOpeningEtag]=useState('');
  const deepLinkedEditor = useRef(false);
  const editorOriginHash = useRef<string | null>(null);
  function closeEditor(saved=false) {
    editorGeneration.current++;
    setEditorOpen(false);
    setEditingEndpoint(undefined);
    if(saved)setProxyNotice('apProxySavedNotice');
    deepLinkedEditor.current = false;
    editorOriginHash.current = null;
    if (navigation.getRoute() === '#/profiles/add') {
      navigation.navigate(optionsHash('profiles'), { force: true, replace: true });
    }
  }
  function openEditor(endpoint?: ProxyEndpoint) {
    if(editorOpen)return;
    editorGeneration.current++;
    setProxyNotice('');
    editorOriginHash.current = navigation.getRoute();
    setEditingEndpoint(endpoint);
    setProxyOpeningEtag(state.configEtag);
    setEditorOpen(true);
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
  if (!state) return <main className={'options' + (presentation==='management'?' optionsLoading':'')}>
    {presentation==='management'&&<header className="optionsHead"><div className="managementIdentity">
      <span className="managementAppIcon" aria-hidden="true">AI</span>
      <div className="managementBrandCopy"><h1 className="managementTitle">AI Proxy</h1><p>{t('apManageSettings')}</p></div>
    </div></header>}
    <section className={presentation==='management'?'managementLoadingState':'optionsLoadingState'} role="status">
      {presentation!=='management'&&<h1>AI Proxy</h1>}
      <p>{t('readingBrowserState')}</p>
      {error&&<p role="alert" className="notice error">{error}</p>}
      <Button type="button" onClick={() => void refresh()}>{t('retry')}</Button>
    </section></main>;
  const config = state.config;
  const endpoints = config.endpoints;
  const profiles = config.profiles;
  let ruleDomain='';
  try{ruleDomain=normalizeRuleSiteInput(rule.domain);}catch{/* Invalid input has no matching preview. */}
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
    if (pacText.trim() && !await confirmIntent(t('pacStarterReplaceDraft'))) return;
    if (getEnvironment().getDraftRevision('settings-pac') !== revision) return;
    getEnvironment().setDraftDirty(true,'settings-pac');
    setPacText(draft);
    if (!pacName.trim()) setPacName(t('pacStarterDefaultName',{name:endpoint.name}));
    setPacStarterError('');
  }
  async function applyRoute() {
    if(config.selection.mode==='profile' && selectedProfile?.kind==='pac-inline' &&
      !await confirmIntent(t('chromeWillRunYourLocalPacScriptAndChange')))return;
    await act({type:'APPLY',approvedPac:selectedProfile?.kind==='pac-inline'});
  }
  async function editPac(profile: Profile) {
    if (profile.kind !== 'pac-inline') return;
    const environment = getEnvironment();
    const openedEtag=state.configEtag;
    const revision = environment.getDraftRevision('settings-pac');
    if (environment.isDraftDirty('settings-pac') &&
      !await confirmIntent(t('apReplacePacDraft'))) return;
    if (!environment.setDraftDirty(false,'settings-pac',revision)) return;
    environment.beginDraft('settings-pac',openedEtag);
    setEditingPacId(profile.id);
    setPacName(profile.name);
    setPacText(profile.pacText);
    requestAnimationFrame(() => document.getElementById('pac-name')?.focus());
  }
  async function savePac(event: React.FormEvent) {
    event.preventDefault();
    const draftRevision=getEnvironment().getDraftRevision('settings-pac');
    if (await act({type:'SAVE_PROFILE',draftScope:'settings-pac',profile:{
      id:editingPacId || crypto.randomUUID(),kind:'pac-inline',name:pacName,pacText,sourceId:'manual'
    }})) {if(!getEnvironment().setDraftDirty(false,'settings-pac',draftRevision))return;setPacName('');setPacText('');setEditingPacId('');}
  }
  async function saveRule(event: React.FormEvent) {
    event.preventDefault();
    setRuleSaved(false);
    const generation=ruleEditorGeneration.current;
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
    if (await act({type:'SAVE_RULE',draftScope:'settings-rule',rule:item})) {
      if(generation!==ruleEditorGeneration.current||
        !getEnvironment().setDraftDirty(false,'settings-rule',draftRevision))return;
      finishRuleEditor('settings-rule-'+item.id);
      setRuleSaved(true);
    }
  }

  function finishRuleEditor(focusId=ruleListPosition.current.focusId) {
    const generation=++ruleEditorGeneration.current;
    setRuleEditorOpen(false);setEditingRuleId('');setRuleError(false);setError('');
    setRule({domain:'',includeSubdomains:true,action:'endpoint',
      endpointId:config.endpoints[0]?.id||'',priority:'100'});
    requestAnimationFrame(()=>{
      if(generation!==ruleEditorGeneration.current||parseOptionsHash(navigation.getRoute())!=='rules')return;
      sectionContent.current?.closest('.proxy-route')?.scrollTo({top:ruleListPosition.current.top});
      const target=document.getElementById(focusId)||document.getElementById('settings-rule-add');
      target?.focus({preventScroll:true});
      target?.scrollIntoView({block:'nearest'});
    });
  }
  async function requestCloseRuleEditor() {
    if(busy)return;
    const environment=getEnvironment(),generation=ruleEditorGeneration.current;
    const revision=environment.getDraftRevision('settings-rule');
    if(environment.isDraftDirty('settings-rule')&&!await confirmIntent(t('apDiscardHelp')))return;
    if(generation!==ruleEditorGeneration.current||!environment.setDraftDirty(false,'settings-rule',revision))return;
    setRuleSaved(false);finishRuleEditor();
  }
  function editRule(item?: SiteRule) {
    getEnvironment().beginDraft('settings-rule',state.configEtag);
    ruleListPosition.current={
      top:sectionContent.current?.closest('.proxy-route')?.scrollTop??0,
      focusId:item?'settings-rule-'+item.id:'settings-rule-add'
    };
    const generation=++ruleEditorGeneration.current;
    setError('');setRuleSaved(false);setEditingRuleId(item?.id||'');setRuleError(false);
    setRule(item?{domain:item.domain,includeSubdomains:item.includeSubdomains,
      action:item.action,endpointId:item.endpointId||'',priority:String(item.priority)}:
      {domain:'',includeSubdomains:true,action:'endpoint',endpointId:config.endpoints[0]?.id||'',priority:'100'});
    setRuleEditorOpen(true);
    requestAnimationFrame(()=>{
      if(generation!==ruleEditorGeneration.current)return;
      sectionContent.current?.closest('.proxy-route')?.scrollTo({top:0});
      document.getElementById('rule-domain')?.focus({preventScroll:true});
    });
  }
  async function removeRule(item: SiteRule) {
    if(busy)return;
    const environment=getEnvironment();
    const generation=ruleEditorGeneration.current;
    const revision=environment.getDraftRevision('settings-rule');
    const index=config.rules.findIndex(rule=>rule.id===item.id);
    const neighbor=config.rules[index+1]||config.rules[index-1];
    const position={
      top:sectionContent.current?.closest('.proxy-route')?.scrollTop??0,
      focusId:neighbor?'settings-rule-'+neighbor.id:'settings-rule-add'
    };
    const ifMatch=state.configEtag;
    if (!await confirmIntent(t('confirmDeleteRule',{
      domain:item.domain,
      scope:t(item.includeSubdomains?'apRuleSubdomainScope':'apRuleExactScope')
    }))) return;
    if(generation!==ruleEditorGeneration.current||environment.getDraftRevision('settings-rule')!==revision)return;
    if(parseOptionsHash(navigation.getRoute())!=='rules')return;
    if (await act({type:'DELETE_RULE',id:item.id,ifMatch})) {
      if(generation!==ruleEditorGeneration.current)return;
      if(!environment.setDraftDirty(false,'settings-rule',revision))return;
      ruleListPosition.current=position;
      setRuleSaved(false);
      finishRuleEditor();
    }
  }
  async function loadBackupFile(file: File) {
    const environment = getEnvironment();
    const generation = ++backupReadGeneration.current;
    const etag=latestEtag.current;
    stageBackup(null);
    const revision = environment.getDraftRevision('settings-backup');
    const current = () => {
      try { return generation === backupReadGeneration.current &&
        getEnvironment() === environment && latestEtag.current===etag && environment.getDraftRevision('settings-backup') === revision; }
      catch { return false; } // The trusted portal may have been disposed while reading.
    };
    setBackupImported(false);
    setError('');
    if (file.size > BACKUP_MAX_BYTES) {
      setErrorKey('errBackupTooLarge');
      return;
    }
    try {
      const text = await file.text();
      if (!current()) return;
      parseBackupForImport(text);
      if (backup.trim()) {
        // Reading and validation finish first; only the explicit button asks UI.
        stageBackup({text,generation,revision,etag,environment});return;
      }
      if (!current()) return;
      setBackup(text);
      environment.setDraftDirty(true,'settings-backup');
    } catch (cause) {
      if (!current()) return;
      setErrorKey(cause instanceof BackupImportValidationError ? cause.key : 'backupFileFailed');
    }
  }
  async function acceptBackupCandidate() {
    const candidate=backupCandidate.current;
    if(!candidate||busy||confirmationRequest.current)return;
    const current=()=>mounted.current&&backupCandidate.current===candidate&&
      candidate.generation===backupReadGeneration.current&&candidate.etag===latestEtag.current&&
      candidate.environment===getEnvironment()&&
      candidate.revision===candidate.environment.getDraftRevision('settings-backup');
    try {
      if(!current()){if(backupCandidate.current===candidate)stageBackup(null);return;}
      // Start before the first await, in the new trusted click/key dispatch.
      if(!await confirmIntent(t('apReplaceBackupDraft'))||!current())return;
      stageBackup(null);setBackup(candidate.text);setBackupImported(false);
      candidate.environment.setDraftDirty(true,'settings-backup');
    } catch { /* Rejection retains the original draft and candidate; never replay. */ }
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
    if (!await confirmIntent(t('importWillReplaceYourCurrentConfigurationWithoutEnablingIt'))) return;
    if(getEnvironment().getDraftRevision('settings-backup')!==draftRevision)return;
    if (await act({type:'IMPORT',draftScope:'settings-backup',config:incoming})) {
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
    <header className={'optionsHead'+(presentation==='sidebar'&&proxyNotice?' hasProxyFeedback':'')}>
      {presentation==='management'?<div className="managementIdentity">
        <span className="managementAppIcon" aria-hidden="true">AI</span>
        <div className="managementBrandCopy">
          <h2 className="managementTitle">AI Proxy</h2>
          <p>{t('settings')} · {t('browserProxyManager')}</p>
        </div>
      </div>:<nav className="settingsSectionNav" aria-label={t('settingsSections')}>
        <label htmlFor="settings-section" className="settingsSectionLabel">{t('settingsSections')}</label>
        <select id="settings-section" aria-label={t('settingsSections')} value={pendingSection?.section??tab} disabled={busy}
          onChange={event=>chooseSection(event.target.value as Page)}>
          <optgroup label={t('proxyManagement')}>
            {tabs.filter(item=>item.id!=='official').map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
          </optgroup>
          <optgroup label={t('optionalServices')}><option value="official">{t('officialNetwork')} · {t('officialOptional')}</option></optgroup>
        </select>
        {pendingSection&&<span className="actions">
          <Button id="settings-section-activate" type="button" disabled={busy} onClick={activateSection}>
            {t('apConfirm')} · {tabs.find(item=>item.id===pendingSection.section)?.name}
          </Button>
          <Button type="button" disabled={busy} onClick={()=>setPendingSection(null)}>{t('apKeepEditing')}</Button>
        </span>}
      </nav>}
      {presentation==='management'?<>
        {proxyNotice&&<p className="managementFeedback" role="status">{t(proxyNotice)}</p>}
        <Button className="settingsRefresh" disabled={busy} onClick={()=>void refresh()}><ProxyIcon name="refresh"/>{t('refreshStatus')}</Button>
      </>:<>
      <details className="settingsMore"><summary title={t('copyPageLink')+' / '+t('refreshStatus')} aria-label={t('copyPageLink')+' / '+t('refreshStatus')}><ProxyIcon name="more"/></summary><div className="optionsHeadActions">
        <Button type="button" className="optionsCopyLink" aria-label={copiedPageLink?t('pageLinkCopied'):t('copyPageLink')}
          title={t('copyPageLink')} onClick={() => void copyCurrentPageLink()}>
          <ProxyIcon name="copy"/>{t('copyPageLink')}
        </Button>
        <Button className="settingsRefresh" disabled={busy} aria-label={t('refreshStatus')} title={t('refreshStatus')} onClick={() => void refresh()}>
          <ProxyIcon name="refresh"/>{t('refreshStatus')}
        </Button>
      </div></details>
      {presentation!=='management'&&!headerNavigation&&<Button id="settings-close" className="settingsClose proxyIconButton" disabled={busy||navigationBusy}
        title={t('apBackToPanel')} aria-label={t('apBackToPanel')} onClick={()=>onClose?.()}><ProxyIcon name="close"/></Button>}
      {proxyNotice&&<p className="settingsProxyFeedback" role="status">{t(proxyNotice)}</p>}
      </>}
    </header>
    {presentation==='management'&&<div className="managementConnectionBar" role="status" aria-label={t('browserStatus')}>
      <span className="managementConnectionLabel">{t('browserStatus')}</span>
      <strong className={'controlChip ' + (statusTone(state.runtime)==='ok'?'isApplied':statusTone(state.runtime)==='danger'?'isError':statusTone(state.runtime)==='pending'?'isPending':'')}>
        {t(statusLabelKey(state.runtime))}
      </strong>
      <span className="managementSelectionLabel">{state.runtime.pendingChanges
        ? t('apPendingSelection')+' · '+(modes.find(item=>item.mode===config.selection.mode)?.name ?? t('unableToVerify'))
        : t('selectedModeLabel',{mode:modes.find(item=>item.mode===config.selection.mode)?.name ?? t('unableToVerify')})}</span>
      <Button className="textAction" disabled={busy||navigationBusy} onClick={()=>getEnvironment().navigate(diagnosticHash('proxy'))}>{t('viewActualControlStatus')}</Button>
    </div>}
    <div className="layout">
      {presentation==='management'&&<nav className="managementNav" aria-label={t('settingsSections')}>
        <p className="managementNavLabel">{t('apManagementCenter')}</p>
        {tabs.map(item=><Button key={item.id} disabled={busy||navigationBusy}
          className={item.id==='official'?'managementOptional':''} aria-current={tab===item.id?'page':undefined}
          onClick={()=>navigate(item.id)}><OptionsNavIcon section={item.id}/><span>{item.name}</span>
          </Button>)}
      </nav>}
      <section ref={sectionContent} className={'panel optionsContent optionsContent--' + tab}>
        {pageLinkCopyFailed && <p className="notice error" role="alert">{t('pageLinkCopyFailed')}</p>}
        {copiedPageLink && <p className="settingsCopyFeedback" role="status">{t('pageLinkCopied')}</p>}
        {error && !editorOpen && !(tab==='rules' && ruleEditorOpen) && <p className="notice error" role="alert">{error}</p>}
        {tab!=='official' && tab!=='rules' && !(tab==='subscriptions' && parseSubscriptionRoute(locationHash).kind==='official') &&
          <OptionsPageHeader
          title={tabs.find(item=>item.id===tab)?.name ?? ''}
          eyebrow={presentation==='management'?t('settings'):undefined}
          description={tab==='profiles'?t('apProfileIntro'):tabs.find(item=>item.id===tab)?.caption ?? ''}
          className={tab==='profiles'?'profilePanelHead':''}
          actions={tab==='profiles'?<>
            <Button variant="primary" className="primary" onClick={()=>openEditor()}>{t('addProxy2')}</Button>
            <Button id="settings-import" className="settingsImport" title={presentation==='management'?t('backupImportTitle'):t('importSettings')} aria-label={presentation==='management'?t('backupImportTitle'):t('importSettings')}
              onClick={()=>navigate('backup')}><ProxyIcon name="import"/>{presentation==='management'?t('backupImportTitle'):t('importSettings')}</Button>
          </>:undefined}
          badge={tab==='profiles'?endpoints.length:undefined}
        />}
        {tab==='profiles' && <>
          <section className="optionsModeBar" aria-label={t('browserRoutingMode')}>
            <div className="settingsRuntimeStatus" role="status"><span className={'controlChip ' + (statusTone(state.runtime) === 'ok' ? 'isApplied' : statusTone(state.runtime) === 'danger' ? 'isError' : statusTone(state.runtime) === 'pending' ? 'isPending' : '')}>{t(statusLabelKey(state.runtime))}</span></div>
            <div className="sectionHeading"><div><h2>{t('currentProxyMode')}</h2><p className="hint">{t('selectionSavesAPendingRouteOnlyApplySelectionRequests')}</p></div>
              <span className="subtleTag">{t('ruleCount',{count:config.rules.filter(r=>r.enabled).length})}</span></div>
            <div className="optionsModeGrid" role="group" aria-label={t('fourProxyModes')}>
              {modes.map(item=><Button key={item.mode} variant={config.selection.mode===item.mode?'primary':'secondary'} disabled={busy}
                className={config.selection.mode===item.mode?'selected':''}
                aria-pressed={config.selection.mode===item.mode}
                onClick={()=>void act({type:'SELECT',selection:{...config.selection,mode:item.mode}})}><ProxyIcon name={item.mode}/><span>{item.name}</span></Button>)}
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
            {config.selection.mode==='direct'&&<p className="hint">{t('apDirectScope')}</p>}
            <div className="actions modeActions">
              <Button variant="primary" className="primary" disabled={busy||(config.selection.mode==='profile'&&!selectedProfile)}
                onClick={()=>void applyRoute()}>{t(config.selection.mode==='direct'?'apApplyDirect':'applySelection')}</Button>
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
          <section className="listSection">
            {presentation==='management'&&<div className="sectionHeading"><div><h2>{t('apProxyServers')} <span className="countTag">{endpoints.length}</span></h2><p className="hint">{t('apProxyServersHelp')}</p></div></div>}
            {endpoints.length===0 ? (presentation==='management'
              ? <div className="managementEmptyState" role="status"><p className="hint">{t('sideNoProxiesHelp')}</p></div>
              : <p className="hint">{t('sideNoProxiesHelp')}</p>) : <div className="records profileRecords">{endpoints.map(p=>{
              const profile=endpointRefs(p.id)[0];
              const source=config.sources.find(s=>s.id===p.sourceId);
              const chosen=config.selection.mode==='profile'&&config.selection.profileId===profile?.id;
              const applied=state.runtime.applied&&state.runtime.activeSelection?.mode==='profile'&&state.runtime.activeSelection.profileId===profile?.id;
              return <article className={'record proxyRecord'+(chosen?' isChosen':'')} key={p.id}>
                <Button className="proxyIconButton proxySelect" disabled={busy||!profile}
                  title={chosen?t('selected'):t('selectNamedProxy',{name:p.name})}
                  aria-label={t('selectNamedProxy',{name:p.name})} aria-pressed={chosen}
                  onClick={()=>void act({type:'SELECT',selection:{mode:'profile',profileId:profile?.id}})}>{presentation==='management'
                     ? <span className="managementProtocolLetter" aria-hidden="true">{p.scheme.startsWith('socks')?'S':'H'}</span>
                     : <ProxyIcon name={chosen?'selected':'circle'}/>}</Button>
                <div className="proxyRecordMain">
                  <div className="proxyRecordText"><div className="proxyRecordTitle"><strong title={p.name}>{p.name}</strong>
                    {source?.kind==='local-client'&&<span role="img" aria-label={t('localClientPortNotTested')} title={t('localClientPortNotTested')}><ProxyIcon name="system"/></span>}
                    {p.credentialRef&&<span role="img" aria-label={t('sessionAuthenticationRequired')} title={t('sessionAuthenticationRequired')}><ProxyIcon name="lock"/></span>}
                    {applied&&<span className="proxyApplied" role="img" aria-label={t('appliedToChrome2')} title={t('appliedToChrome2')}><ProxyIcon name="play"/></span>}
                    {presentation==='management'&&chosen&&<span className="managementRecordTag">{t('selected')}</span>}
                    {presentation==='management'&&applied&&<span className="managementRecordTag managementAppliedTag">{t('appliedToChrome2')}</span>}
                  </div><small className="mono" title={p.scheme.toUpperCase()+' · '+p.host+':'+p.port}>{p.scheme.toUpperCase()} · {p.host}:{p.port}</small></div>
                </div>
                <div className="recordActions">
                  <Button id={'settings-proxy-'+p.id} className="proxyIconButton" disabled={busy} onClick={()=>source?.kind==='local-client'?editLocal(p):openEditor(p)}
                    title={t('editNamedProxy',{name:p.name})} aria-label={t('editNamedProxy',{name:p.name})}><ProxyIcon name="edit"/></Button>
                  <Button className="proxyIconButton quietDanger" disabled={busy||config.managed} title={config.managed?t('stopManagingTheProxyBeforeDeletingIt'):t('deleteNamedProxy',{name:p.name})}
                    onClick={async()=>{setProxyNotice('');const ifMatch=state.configEtag;
                      if(await confirmIntent(t('confirmDeleteProxy',{name:p.name}))){
                        if(await act({type:'DELETE_ENDPOINT',id:p.id,ifMatch}))setProxyNotice('apProxyDeletedNotice');
                      }}}
                    aria-label={t('deleteNamedProxy',{name:p.name})}><ProxyIcon name="trash"/></Button>
                </div>
              </article>;
            })}</div>}
            <div className="profileSourceLinks">
              <Button className="textAction" disabled={busy} onClick={()=>navigateAction('subscriptions','new')}><ProxyIcon name="link"/>{t('recordSubscriptionSource')}</Button>
              <Button className="textAction" disabled={busy} onClick={()=>navigateAction('subscriptions','local')}><ProxyIcon name="system"/>{t('addLocalProxyClient')}</Button>
            </div>
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
              <div className="records">{profiles.filter(p=>p.kind==='pac-inline').map(p=><article className="record pacRecord" key={p.id}>
                <div><strong title={p.name}>{p.name}</strong><small title={t('localPacScriptConnectivityUnverified')}>{t('localPacScriptConnectivityUnverified')}</small></div>
                <div className="recordActions">
                  <Button className="proxyIconButton" disabled={busy} title={t('editNamedProxy',{name:p.name})} aria-label={t('editNamedProxy',{name:p.name})} onClick={()=>void editPac(p)}><ProxyIcon name="edit"/></Button>
                  <Button className="proxyIconButton quietDanger" disabled={busy||config.managed} title={config.managed?t('stopManagingTheProxyBeforeDeletingIt'):t('deleteNamedProxy',{name:p.name})} aria-label={t('deleteNamedProxy',{name:p.name})} onClick={async()=>{
                    const ifMatch=state.configEtag;
                    if (await confirmIntent(t('confirmDeletePac',{name:p.name}))) void act({type:'DELETE_PROFILE',id:p.id,ifMatch});
                  }}><ProxyIcon name="trash"/></Button>
                </div>
              </article>)}</div>
              <form className="pacEditorForm" data-draft-scope="settings-pac" onSubmit={e=>void savePac(e)}>
                <div className="pacEditorFields">
                  <FormField id="pac-name" label={t('pacName')}>{controlProps=><ClearableInput {...controlProps} fieldLabel={t('pacName')} required value={pacName} onValueChange={setPacName} placeholder={t('myLocalPac')}/>}</FormField>
                  <FormField id="pac-text" label={t('findproxyforurlScript')}>{controlProps=><textarea {...controlProps} required spellCheck={false} value={pacText} onChange={e=>setPacText(e.target.value)}
                    placeholder={'function FindProxyForURL(url, host) { return "DIRECT"; }'}/>}</FormField>
                </div>
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
          {ruleEditorOpen?<header className="ruleEditorHeader"><h2>{t(editingRuleId?'editRule':'addRule')}</h2></header>:
          <OptionsPageHeader title={t('websiteRules2')}
            description={t('routeByDomainThroughAProxyOrDirect')}
            badge={config.rules.length}
            actions={!ruleEditorOpen?<Button id="settings-rule-add" variant="primary" className="primary"
              disabled={busy} onClick={()=>editRule()}>{t('addRule')}</Button>:undefined}/>}
          {!ruleEditorOpen && config.selection.mode !== 'rules' && <div className="rulesModeHint">
            <span className="hint">{t('apRuleSaveNote')}</span>
            <Button type="button" variant="secondary" disabled={busy}
              onClick={()=>void act({type:'SELECT',selection:{...config.selection,mode:'rules'}})}>{t('apSwitchToRulesMode')}</Button>
          </div>}
          <div className="rulesGrid">
            {!ruleEditorOpen?<section className="rulesList" aria-label={t('websiteRules2')}>
              {ruleSaved&&<p className="r86Notice" role="status">{t('apRuleSavedNotice')}</p>}
              <p className="hint">{t('apRuleSaveNote')}</p>
              {presentation==='management' && config.rules.length>0 && <div className="managementRulesHeader" aria-hidden="true">
                <span/><span>{t('ruleWebsiteInput')}</span><span>{t('ruleWebsiteUse')}</span><span>{t('priority')}</span><span/>
              </div>}
              {config.rules.length === 0 ? <div className="sourceEmpty rulesEmpty">{t('rulesEmpty')}</div> :
                <div className="records">{config.rules.map(r=>{
              const routeName=r.action==='direct'?t('directConnection2'):endpoints.find(e=>e.id===r.endpointId)?.name || t('missingProxy2');
               const detail=routeName+' · '+t('priority')+' '+r.priority;
              return <article className="record ruleRecord" key={r.id} data-details-dismissed={dismissedRuleDetail===r.id||undefined}
                onFocusCapture={()=>setDismissedRuleDetail('')} onMouseEnter={()=>setDismissedRuleDetail('')}
                onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setDismissedRuleDetail(r.id);}}}>
            <span className={'ruleStateIcon '+(r.enabled?'isEnabled':'')} role="img" title={t(r.enabled?'apRuleEnabled':'apRuleDisabled')} aria-label={t(r.enabled?'apRuleEnabled':'apRuleDisabled')}><ProxyIcon name={r.enabled?'selected':'pause'}/></span>
            <div className="ruleRecordText"><strong title={r.domain+t(r.includeSubdomains?'apRuleSubdomainScope':'apRuleExactScope')}>{r.domain}{r.includeSubdomains?t('subdomains'):''}</strong>
            <small id={'settings-rule-detail-'+r.id} title={detail}>{presentation==='management'?t(r.includeSubdomains?'apRuleSubdomainScope':'apRuleExactScope'):detail}</small></div>
             {presentation==='management'&&<><span className="managementRuleTarget" title={routeName}>{routeName}</span>
               <span className="managementRulePriority" title={t('priority')+' '+r.priority}>{r.priority}</span></>}
            <div className="actions"><Button className="proxyIconButton" id={'settings-rule-'+r.id} aria-describedby={'settings-rule-detail-'+r.id} disabled={busy} title={t('editNamedRule',{domain:r.domain,scope:t(r.includeSubdomains?'apRuleSubdomainScope':'apRuleExactScope')})} aria-label={t('editNamedRule',{domain:r.domain,
              scope:t(r.includeSubdomains?'apRuleSubdomainScope':'apRuleExactScope')})} onClick={()=>editRule(r)}><ProxyIcon name="edit"/></Button>
              <Button className="proxyIconButton quietDanger" aria-describedby={'settings-rule-detail-'+r.id} disabled={busy} title={t('deleteNamedRule',{domain:r.domain,scope:t(r.includeSubdomains?'apRuleSubdomainScope':'apRuleExactScope')})} aria-label={t('deleteNamedRule',{domain:r.domain,
                scope:t(r.includeSubdomains?'apRuleSubdomainScope':'apRuleExactScope')})} onClick={()=>void removeRule(r)}><ProxyIcon name="trash"/></Button></div></article>;})}</div>}
            </section>:
            <section className="rulesEditor" aria-label={editingRuleId?t('editRule'):t('addRule')}
              onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();void requestCloseRuleEditor();}}}>
              <p className="siteRuleOrigin">{t(editingRuleId?'apExistingRuleSource':'apRulesListSource')}
                {editingRuleId&&<strong className="mono"> {config.rules.find(item=>item.id===editingRuleId)?.domain}</strong>}</p>
              <form data-draft-scope="settings-rule" className="ruleEditorForm" aria-busy={busy}
                aria-describedby={error?'settings-rule-error':undefined} onSubmit={saveRule}>
              <fieldset className="rulesEditorFields" disabled={busy}>
            <div className="ruleInputFields">
            <FormField id="rule-domain" label={t('ruleWebsiteInput')} hint={t('ruleWebsiteHelp')}
              error={ruleError ? t('ruleWebsiteInvalid') : undefined}>
              {controlProps => <ClearableInput {...controlProps} fieldLabel={t('ruleWebsiteInput')} required value={rule.domain}
                 onValueChange={value=>{
                   setRuleError(false);
                   clearErrorKey('apRuleAlreadyExists');
                   setRule({...rule,domain:value});
                 }}
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
            <label className="ruleCheckbox"><input id="rule-subdomains" type="checkbox" checked={rule.includeSubdomains}
              onChange={e=>{
                clearErrorKey('apRuleAlreadyExists');
                setRule({...rule,includeSubdomains:e.target.checked});
              }}/>{t('includeSubdomains')}</label>
            <fieldset className="ruleTargetChoices"><legend>{t('ruleWebsiteUse')}</legend>
              <label><input id="rule-target-endpoint" type="radio" name="settings-rule-target" value="endpoint"
                checked={rule.action==='endpoint'} onChange={()=>setRule({...rule,action:'endpoint'})}/>{t('specificProxy')}</label>
              <label><input id="rule-target-direct" type="radio" name="settings-rule-target" value="direct"
                checked={rule.action==='direct'} onChange={()=>setRule({...rule,action:'direct'})}/>{t('directConnection2')}</label>
            </fieldset>
            {rule.action==='endpoint' && <FormField id="rule-endpoint" label={t('specificProxy')}
              hint={!endpoints.length?t('ruleChooseProxyFirst'):undefined}>
              {controlProps=><select {...controlProps} required value={rule.endpointId} onChange={e=>setRule({...rule,endpointId:e.target.value})}>
                <option value="">{t('pleaseSelect')}</option>
                {endpoints.map(p=><option key={p.id} value={p.id}>{p.name} · {p.scheme.toUpperCase()}</option>)}
              </select>}
            </FormField>}
            {ruleDomain&&<div className="ruleMatchPreview" aria-label={t('apRulePreview')}>
              <span>{t('apRulePreview')}</span><strong>{ruleDomain}{rule.includeSubdomains?t('subdomains'):''}</strong>
              <span>{t('ruleWebsiteUse')} <strong>{rule.action==='direct'?t('directConnection2'):
                endpoints.find(ep=>ep.id===rule.endpointId)?.name||t('ruleChooseProxyFirst')}</strong></span>
            </div>}
            <details className="ruleAdvanced">
              <summary>{t('apRulePriorityOptions')}</summary>
              <div className="ruleAdvancedFields">
                <FormField id="rule-priority" label={t('priority')} hint={t('rulePriorityHelp')}>
                  {controlProps=><input {...controlProps} type="number" min="0" max="99999" required
                    value={rule.priority} onChange={e=>setRule({...rule,priority:e.target.value})}/>}
                </FormField>
              </div>
            </details>
            {error&&<p id="settings-rule-error" className="notice error" role="alert">{error}</p>}
            <p className="hint ruleSaveNote">{t('apRuleSaveNote')}</p>
            </div>
            <div className="actions">
              <Button variant="primary" className="primary" disabled={busy || rule.action==='endpoint'&&!rule.endpointId}
                type="submit">{t('saveRule')}</Button>
              <Button type="button" disabled={busy} onClick={requestCloseRuleEditor}>{t('cancel')}</Button>
            </div>
              </fieldset>
              </form>
            </section>}
          </div>
          {!ruleEditorOpen&&<section className="rulesDefault" data-draft-scope="settings-default">
            <h2>{t('whenNoRuleMatches')}</h2>
            <p className="hint">{t('directByDefaultTrafficUsesAProxyOnlyWhen')}</p>
          <div className="formGrid"><div><label htmlFor="default-action">{t('defaultRoute')}</label><select id="default-action" value={defaultAction}
            onChange={e=>setDefaultAction(e.target.value)}><option value="direct">DIRECT</option><option value="endpoint">{t('specificProxy')}</option></select></div>
            <div><label htmlFor="default-endpoint">{t('proxy')}</label><select id="default-endpoint" disabled={defaultAction==='direct'} value={defaultEndpointId}
              onChange={e=>setDefaultEndpointId(e.target.value)}><option value="">{t('pleaseSelect')}</option>{endpoints.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div></div>
          <div className="actions"><Button disabled={busy || (defaultAction==='endpoint' && !defaultEndpointId)} onClick={async()=>{const revision=getEnvironment().getDraftRevision('settings-default');if(await act({type:'SET_DEFAULT',draftScope:'settings-default',target:defaultAction==='direct'?
            {action:'direct'}:{action:'endpoint',endpointId:defaultEndpointId}}))getEnvironment().setDraftDirty(false,'settings-default',revision);}}>{t('saveDefaultRoute')}</Button>
            <small>{t('current')}{config.defaultTarget.action==='direct'?'DIRECT':endpoints.find(e=>e.id===config.defaultTarget.endpointId)?.name}</small></div>
          </section>}
        </div>}
        {tab==='subscriptions' && <SourcesPage config={config} configEtag={state.configEtag} runtime={state.runtime}
          busy={busy} act={act} setError={setError} setErrorKey={setErrorKey} navigate={navigate}
          route={parseSubscriptionRoute(locationHash)} navigateSubscription={navigateSubscription}
          quickEntry={parseSubscriptionRoute(locationHash).kind==='local'?'local':locationHash==='#/subscriptions/new'?'subscription':null}/>}
        {tab==='backup' && <div className="backupPage">
          <div className="backupGrid">
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
              {pendingBackup&&<div className="actions">
                <Button id="backup-replace-candidate" type="button" disabled={busy} onClick={()=>void acceptBackupCandidate()}>
                  {t('apConfirm')} · {t('backupChooseFile')}
                </Button>
                <Button type="button" disabled={busy} onClick={()=>stageBackup(null)}>{t('apKeepEditing')}</Button>
              </div>}
              <label htmlFor="import-data">{t('pasteJsonBackup')}</label>
              <textarea id="import-data" value={backup} disabled={busy} onChange={e=>{
                backupReadGeneration.current++;stageBackup(null);
                setBackup(e.target.value);
                setBackupImported(false);
                setError('');
              }} placeholder='{"schemaVersion":2,...}' spellCheck={false}/>
              <Button disabled={busy||!backup.trim()} onClick={()=>void importBackup()}>
                {t('validateAndImportStopManagingFirst')}
              </Button>
              {backupImported&&<p role="status" className="backupSuccess">{t('backupImportSucceeded')}</p>}
            </section>
            <section className="backupCard backupExport">
              
              <h2>{t('backupExportTitle')}</h2>
              <p className="hint">{t('shareBackupsContainNonSecretSettingsOnlyExcludingPac')}</p>
              <Button variant="primary" className="primary" onClick={()=>void exportConfig()}>{t('exportShareableBackupV2NoPasswords')}</Button>
              <p className="hint">{t('aShareableBackupCannotFullyRestoreLocalPacScripts')}</p>
            </section>
          </div>
        </div>}
        {tab==='diagnostic' && <DiagnosticsPage state={state} busy={busy}
          onRefresh={refresh} onProbe={() => act({type:'PROBE'})}
          onStop={() => act({type:'STOP'})} onProfiles={() => navigate('profiles')} />}
        {tab==='general' && <div className="generalPage">
          <div className="generalGrid">
            <HeaderActionsEditor store={headerActionsStore} disabled={busy||Boolean(state?.runtime?.outcomeUnknown)}/>
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
    {editorOpen && <ProxyEditor endpoint={editingEndpoint} openingEtag={proxyOpeningEtag} onClose={closeEditor}/>}
  </main>;
}

