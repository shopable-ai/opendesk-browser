import * as React from 'react';
import {getEnvironment} from './environment';
import {Button} from '@opendesk/ui';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useI18n } from './i18n/LocaleProvider';
import { freshConfig, normalizeRuleSiteInput, priorityForSiteQuickRule } from './domain/config';
import type { Profile, RouteMode, RouteSelection, SiteRule } from './domain/types';
import { useProxy } from './ui/useProxy';
import { ConnectionButton, ConnectionSyncStatus } from './ui/ConnectionSync';
import { activeStopLabel, confirmedRouteMode, connectionAction, connectionActionLabel, needsProxyRelease, routeSwitchBlocked, Status } from './ui/Status';
import { ClearableInput } from './ui/ProxyEntry';
import { isValidProxyPort } from './domain/proxy-entry';
import { ProxyEditor } from './ui/ProxyEditor';
import { DiagnosticsPage } from './ui/DiagnosticsPage';
import { optionsUrl } from './ui/optionsRoute';
import { RotationEntry } from './ui/RotationPlan';
import {useStatusDisplay} from './ui/PcPreferences';
import { ProxyIcon as SideIcon } from './ui/ProxyIcon';


type AddKind = 'local';
type RouteTarget = 'endpoint' | 'direct';
const emptyLocal = { name:'', scheme:'http' as 'http' | 'socks5', port:'' };

export default function App(_props:{headerNavigation?:boolean;settingsFallback?:boolean;savedProxy?:boolean}={}) {
  const { t } = useI18n();
  const statusDisplay=useStatusDisplay();
  const { state, error, busy, operationBusy, syncing, slowSync, routeFeedback, routeTarget, act, refresh, setError, setErrorKey } = useProxy();
  const modes: {mode:RouteMode;name:string;description:string}[] = [
    {mode:'profile',name:t('sideModeProfile'),description:t('yourOwnProxyOrLocalPac')},
    {mode:'rules',name:t('sideModeRules'),description:t('routeAutomaticallyByDomain')},
    {mode:'direct',name:t('sideModeDirect'),description:t('connectDirectlyWithoutAProxy')},
    {mode:'system',name:t('popupModeSystem'),description:t('useTheBrowserSSystemProxySettings')}
  ];
  const [siteInfo,setSiteInfo] = useState({status:'loading',host:'',source:''});
  const site=siteInfo.host;
  const siteGeneration=useRef(0);
  const [siteLoading,setSiteLoading]=useState(false);
  const [siteRefreshRevision,setSiteRefreshRevision]=useState(0);
  const [editingSiteRule,setEditingSiteRule]=useState<SiteRule|null>(null);
  const [ruleSource,setRuleSource]=useState('');
  const [includeSubdomains,setIncludeSubdomains]=useState(true);
  const mainScroll=useRef<HTMLDivElement>(null);
  const savedScroll=useRef(0);
  const ruleReturn=useRef(false);
  const [siteInput,setSiteInput] = useState('');
  const [siteError,setSiteError] = useState(false);
  const [siteEditorOpen,setSiteEditorOpen] = useState(false);
  const [addKind,setAddKind] = useState<AddKind | null>(null);
  const [proxyEditorOpen,setProxyEditorOpen] = useState(false);
  const [proxyEditorEtag,setProxyEditorEtag] = useState('');
  const proxyEditorOrigin=useRef<HTMLElement|null>(null);
  const [local,setLocal] = useState(emptyLocal);
  const [savedHint,setSavedHint] = useState(_props.savedProxy===true);
  const [recentProfileId,setRecentProfileId] = useState('');
  const [ruleHint,setRuleHint] = useState(false);
  const [ruleTarget,setRuleTarget] = useState<RouteTarget>('endpoint');
  const [ruleEndpoint,setRuleEndpoint] = useState('');
  const [addedAnother,setAddedAnother] = useState(false);
  const [saving,setSaving] = useState(false);
  const savingRef = useRef(false);
  const [entryFocusRequest,setEntryFocusRequest] = useState(0);
  const [nameExpanded,setNameExpanded] = useState({local:false});
  const entryBusy = busy || saving;
  const addButton = useRef<HTMLButtonElement>(null);
  const fallbackAddButton = useRef<HTMLButtonElement>(null);
  const siteEditorButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const entryOrigin = useRef<'header'|'primary'|'local'>('header');
  const returnTarget = useRef<'header'|'primary'|'local'|'after-save'>('header');
  const primaryActionButton = useRef<HTMLButtonElement>(null);
  const modeGroup = useRef<HTMLDivElement>(null);
  const [restoreActionFocus,setRestoreActionFocus] = useState<HTMLButtonElement | null>(null);
  const localEntryButton = useRef<HTMLButtonElement>(null);
  const firstProfileButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (busy || !restoreActionFocus) return;
    setRestoreActionFocus(null);
    if (document.activeElement !== document.body) return;
    const button = primaryActionButton.current;
    (restoreActionFocus.isConnected && !restoreActionFocus.disabled ? restoreActionFocus
      : button?.getClientRects().length ? button
      : modeGroup.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]'))?.focus();
  },[busy,restoreActionFocus]);
  useEffect(() => {
    if (!addKind && returnFocus.current) {
      const target = returnTarget.current === 'after-save' || returnTarget.current === 'primary'
        ? returnTarget.current==='after-save' ? document.getElementById('quick-use-'+recentProfileId) : primaryActionButton.current
          : returnTarget.current === 'local' ? localEntryButton.current
            : fallbackAddButton.current ?? addButton.current;
      (target ?? addButton.current)?.focus();
      returnFocus.current = false;
    }
  },[addKind,recentProfileId]);
  useEffect(() => {
    if (addKind) document.getElementById('quick-port')?.focus();
  },[addKind,entryFocusRequest]);
  function beginAdd(kind:'server'|'local', origin:'header'|'primary'|'local'='header') {
    if(kind==='server'){
      if(!state)return;
      setProxyEditorEtag(state.configEtag);
      proxyEditorOrigin.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
      setSavedHint(false);setError('');setProxyEditorOpen(true);return;
    }
    getEnvironment().beginDraft('quick-'+kind,state?.configEtag);
    entryOrigin.current = origin;
    setAddedAnother(false);
    setSavedHint(false);
    setError('');
    setAddKind(kind);
  }
  function closeAdd(saved=false) {
    // Dismissal retains both kinds for reopening; saveProxy owns saved-draft resets.
    returnTarget.current = saved ? 'after-save' : entryOrigin.current;
    returnFocus.current = true;
    setAddKind(null);
    setError('');
  }

  async function readSite(){
    const generation=++siteGeneration.current;setSiteLoading(true);
    try{const next=await getEnvironment().currentSite();if(generation===siteGeneration.current)setSiteInfo(next);}
    catch{/* A closed instance never receives page information. */}
    finally{if(generation===siteGeneration.current)setSiteLoading(false);}
  }
  useEffect(()=>{const env=getEnvironment();void readSite();
    const changed=()=>void readSite();env.events.addEventListener('ai-proxy-page-changed',changed);
    return()=>{siteGeneration.current++;env.events.removeEventListener('ai-proxy-page-changed',changed);};
  },[]);
  useEffect(()=>{
    if(!state||siteEditorOpen||addKind)return;
    const view=getEnvironment().takeQuickView?.();
    if(view){mainScroll.current?.scrollTo({top:view.top});document.getElementById(view.focusId)?.focus({preventScroll:true});}
    if(ruleReturn.current){mainScroll.current?.scrollTo({top:savedScroll.current});siteEditorButton.current?.focus({preventScroll:true});ruleReturn.current=false;}
  },[Boolean(state),siteEditorOpen,addKind]);
  function rememberView(focusId:string){getEnvironment().rememberQuickView?.({top:mainScroll.current?.scrollTop??0,focusId});}


  const config = state?.config ?? freshConfig();
  const endpoints = config.endpoints;
  const profiles = config.profiles;
  const selected = profiles.find(p=>p.id===config.selection.profileId);
  const selectedEndpoint = selected?.kind==='endpoint'
    ? endpoints.find(e=>e.id===selected.endpointId) : undefined;
  const suggestedEndpoint = selectedEndpoint?.id ?? endpoints[0]?.id ?? '';
  const quickEndpoint = siteEditorOpen
    ? endpoints.some(e=>e.id===ruleEndpoint) ? ruleEndpoint : ''
    : suggestedEndpoint;
  const currentRule = useMemo(() => [...config.rules].filter(r=>r.enabled && site &&
    (r.domain===site || (r.includeSubdomains && site.endsWith('.'+r.domain))))
    .sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id))[0] ?? null,[config.rules,site]);
  const expectedRoute = config.selection.mode==='system' ? t('determinedBySystemNetworkSettings')
    : config.selection.mode==='direct' ? t('directConnection2')
    : config.selection.mode==='profile'
      ? selected?.kind==='pac-inline' ? t('determinedByYourPacScript')
        : selectedEndpoint?.name ?? t('noProfileSelected')
      : currentRule?.action==='endpoint'
        ? endpoints.find(e=>e.id===currentRule.endpointId)?.name ?? t('missingProxy2')
        : currentRule?.action==='direct' ? t('directConnection2')
        : config.defaultTarget.action==='endpoint'
          ? endpoints.find(e=>e.id===config.defaultTarget.endpointId)?.name ?? t('missingProxy2')
          : t('directConnection2');
  // Keep the visible list stable when switching between its rows.
  const pinned = new Set([recentProfileId,config.selection.profileId,state?.runtime.activeSelection?.profileId]);
  const pinnedOutside = profiles.slice(4).filter(profile=>pinned.has(profile.id));
  const visibleProfiles = [...profiles.slice(0,4-pinnedOutside.length),...pinnedOutside];

  async function saveProxy(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draftRevision=getEnvironment().getDraftRevision('quick-'+addKind);
    if (!addKind || entryBusy || savingRef.current) return;
    setAddedAnother(false);
    if (!isValidProxyPort(local.port)) {
      setErrorKey('errInvalidPort');
      return;
    }
    // One UI operation spans several messages; keep the draft locked throughout.
    savingRef.current = true;
    setSaving(true);
    try {
      const keepAdding = (event.nativeEvent as SubmitEvent).submitter
        ?.getAttribute('data-add-another')==='true';
      const id = crypto.randomUUID();
      let name = '';
      name = local.name.trim() || (local.scheme==='http'?t('localHttp'):t('localSocks5'));
      if (!await act({type:'SAVE_LOCAL_CLIENT',draftScope:'quick-'+addKind,client:{
        id,name,scheme:local.scheme,port:Number(local.port)
      }})) return;
      if (!keepAdding) {
        if(!getEnvironment().setDraftDirty(false,'quick-'+addKind,draftRevision))return;
        setLocal(emptyLocal);
        setNameExpanded(previous=>({...previous,[addKind]:false}));
        closeAdd(true);
        setRecentProfileId('profile-'+id);
        setSavedHint(true);
      } else {
        if(!getEnvironment().setDraftDirty(false,'quick-'+addKind,draftRevision))return;
        setLocal(emptyLocal);
        setNameExpanded(previous=>({...previous,[addKind]:false}));
        setAddedAnother(true);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
      setEntryFocusRequest(previous=>previous+1);
    }
  }
  async function saveSiteRule(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draftRevision=getEnvironment().getDraftRevision('quick-rule');
    let domain:string;
    try {domain=normalizeRuleSiteInput(siteInput);}
    catch {setSiteError(true);return;}
    if (ruleTarget==='endpoint' && !quickEndpoint) {
      setErrorKey('ruleChooseProxyFirst');return;
    }
    const duplicate=config.rules.find(r=>r.domain===domain&&r.includeSubdomains===includeSubdomains&&r.id!==editingSiteRule?.id);
    if(duplicate){setErrorKey('apRuleAlreadyExists');return;}
    const existing=editingSiteRule;
    let priority:number;
    try { priority=priorityForSiteQuickRule(domain,config.rules,existing?.id,existing?.priority); }
    catch {setErrorKey('siteRulePriorityConflict');return;}
    const rule:SiteRule={
      id:existing?.id ?? crypto.randomUUID(),domain,
      includeSubdomains,enabled:existing?.enabled??true,priority,
      action:ruleTarget,
      ...(ruleTarget==='endpoint'?{endpointId:quickEndpoint}:{})
    };
    if (await act({type:'SAVE_RULE',draftScope:'quick-rule',rule})) {
      if(!getEnvironment().setDraftDirty(false,'quick-rule',draftRevision))return;
      setSiteInput(domain);setSiteError(false);ruleReturn.current=true;setSiteEditorOpen(false);
      // Save and Apply are separate user actions, even while Rules mode is running.
      // Keep Chrome's previous confirmed PAC until the user explicitly applies.
      setRuleHint(true);
    }
  }
  async function apply(selection: RouteSelection, profile?: Profile) {
    const ifMatch=state.configEtag;
    if (profile?.kind==='pac-inline'
      && !await getEnvironment().confirm(t('chromeWillRunTheLocalPacScriptYouProvided'))) return;
    if (await act({type:'SWITCH_ROUTE',selection,ifMatch,
      ...(selection.mode==='system'?{ifRoute:state.runtime.routeVersion}:{}),approvedPac:profile?.kind==='pac-inline'})) {
      setSavedHint(false);
      setRuleHint(false);
    }
  }
  function focusProxyChoice() {
    // Focus scrolls the first visible saved proxy into view.
    firstProfileButton.current?.focus();
  }
  async function selectRoute(selection: RouteSelection) {
    await act({type:'SELECT',selection,ifMatch:state.configEtag});
  }
  async function useMode(mode: RouteMode, event: React.MouseEvent<HTMLButtonElement>) {
    if (mode==='rules' && rulesNeedSetup) {
      await openOptions('rules');
      return;
    }
    if (mode!==config.selection.mode) {
      await performRouteAction(event,()=>selectRoute({...config.selection,mode}));
    }
    if (mode==='profile' && profiles.length) focusProxyChoice();
  }
  async function performRouteAction(event: React.MouseEvent<HTMLButtonElement>, action: () => Promise<unknown>) {
    const button=event.currentTarget;
    const keepFocus=event.detail===0 || document.activeElement===button;
    await action();
    if (keepFocus) setRestoreActionFocus(button);
  }
  async function openOptions(section:'profiles'|'rules'|'subscriptions'|'official'|'diagnostic', rotation = false, action?: 'add' | 'new' | 'local') {
    try {
      rememberView(section==='profiles'?'quick-manage-profiles':section==='rules'?'quick-manage-rules':'quick-settings');
      const env=getEnvironment();
      // Only a plain settings section is handed to the existing full tool tab.
      // Add/edit/rotation keep their original in-app route and draft guards.
      if(!rotation&&!action&&env.surface==='sidebar'){
        const opened=env.openOwnPage({view:'settings',section});
        if(opened!==null){await opened;return;}
      }
      env.navigate('#/'+section+(rotation?'/rotation':action?'/'+action:''));
    } catch (error:any) {
      setError(error?.message||t('couldNotOpenTheSettingsTabOpenItFrom'));
    }
  }

  if (!state) return <main className="popup sidepanel">
    <div className="sideLoading"><p className="hint">{t('readingBrowserProxyState')}</p>
      {error&&<p className="notice error" role="alert">{error}</p>}
      <Button onClick={()=>void refresh()}>{t('retry')}</Button></div>
  </main>;

  function beginSiteRule(){
    getEnvironment().beginDraft('quick-rule',state.configEtag);
    savedScroll.current=mainScroll.current?.scrollTop??0;
    setRuleSource(site);setEditingSiteRule(currentRule);setSiteInput(currentRule?.domain||site);
    setIncludeSubdomains(currentRule?.includeSubdomains??true);
    setRuleTarget(currentRule?.action??'endpoint');setRuleEndpoint(currentRule?.endpointId??quickEndpoint);
    setSiteError(false);setError('');setRuleHint(false);setSiteEditorOpen(true);
  }
  async function closeSiteRule(){
    const env=getEnvironment(),revision=env.getDraftRevision('quick-rule');
    if(env.isDraftDirty('quick-rule')&&!await env.confirm(t('apDiscardHelp')))return;
    if(!env.setDraftDirty(false,'quick-rule',revision))return;
    ruleReturn.current=true;setSiteEditorOpen(false);setError('');
  }
  let ruleDomain='';
  try{ruleDomain=normalizeRuleSiteInput(siteInput);}catch{/* Invalid input has no matching preview. */}
  if(siteEditorOpen)return <main className="popup sidepanel r86Panel siteRulePage" aria-label={t(editingSiteRule?'editRule':'addRule')}
    onKeyDown={event=>{if(event.key==='Escape'&&!busy){event.preventDefault();void closeSiteRule();}}}>
    <header className="r86Header sideAddHeader ruleEditorHeader">
      <h2>{t(editingSiteRule?'editRule':'addRule')}</h2>
      <Button className="ruleClose" variant="quiet" disabled={busy} aria-label={t('apCloseRuleEditor')} title={t('apCloseRuleEditor')} onClick={()=>void closeSiteRule()}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></Button>
    </header>
    <div className="quickSetupBody">
      <p className="siteRuleOrigin">{t(editingSiteRule?'apExistingRuleSource':ruleSource?'apSiteRuleSource':'apManualRuleSource')}
        {(editingSiteRule||ruleSource)&&<strong className="mono"> {editingSiteRule?.domain||ruleSource}</strong>}</p>
      <form id="r86-site-editor" className="r86Editor" aria-label={t(editingSiteRule?'editRule':'addRule')} aria-busy={busy} data-draft-scope="quick-rule" onSubmit={e=>void saveSiteRule(e)}>
        <div><label htmlFor="side-rule-domain">{t('ruleWebsiteInput')}</label>
          <ClearableInput autoFocus id="side-rule-domain" required disabled={busy} fieldLabel={t('ruleWebsiteInput')}
            value={siteInput} aria-invalid={siteError} aria-describedby={siteError?'side-rule-error':'side-rule-help'}
            placeholder={t('ruleWebsitePlaceholder')} onValueChange={value=>{setSiteInput(value);setSiteError(false);setError('');}}/>
          <p id="side-rule-help" className="hint">{t('ruleWebsiteHelp')}</p>
          {siteError&&<p id="side-rule-error" role="alert" className="notice error">{t('ruleWebsiteInvalid')}</p>}
        </div>
        <label className="ruleCheckbox"><input type="checkbox" checked={includeSubdomains} disabled={busy}
          onChange={e=>setIncludeSubdomains(e.target.checked)}/>{t('includeSubdomains')}</label>
        <fieldset className="ruleTargetChoices"><legend>{t('ruleWebsiteUse')}</legend>
          <label><input type="radio" name="quick-rule-target" value="endpoint" checked={ruleTarget==='endpoint'} disabled={busy} onChange={()=>setRuleTarget('endpoint')}/>{t('specificProxy')}</label>
          <label><input type="radio" name="quick-rule-target" value="direct" checked={ruleTarget==='direct'} disabled={busy} onChange={()=>setRuleTarget('direct')}/>{t('directConnection2')}</label>
        </fieldset>
        {ruleTarget==='endpoint'&&<div><label htmlFor="side-rule-proxy">{t('specificProxy')}</label>
          <select id="side-rule-proxy" required value={quickEndpoint} disabled={busy} onChange={e=>setRuleEndpoint(e.target.value)}>
            {!quickEndpoint&&<option value="">{t('selectAProxyOrPac')}</option>}
            {endpoints.map(ep=><option key={ep.id} value={ep.id}>{ep.name}</option>)}
          </select>
          {!endpoints.length&&<p className="hint">{t('ruleChooseProxyFirst')}</p>}
        </div>}
        {ruleDomain&&<div className="ruleMatchPreview" aria-label={t('apRulePreview')}>
          <span>{t('apRulePreview')}</span><strong>{ruleDomain}{includeSubdomains?t('subdomains'):''}</strong>
          <span>{t('ruleWebsiteUse')} <strong>{ruleTarget==='direct'?t('directConnection2'):endpoints.find(ep=>ep.id===quickEndpoint)?.name||t('ruleChooseProxyFirst')}</strong></span>
        </div>}
        {error&&<p className="notice error" role="alert">{error}</p>}
        <p className="hint ruleSaveNote">{t('apRuleSaveNote')}</p>
        <div className="actions">
          <Button variant="primary" type="submit" className="primary" disabled={busy||(ruleTarget==='endpoint'&&!quickEndpoint)}>{t('saveRule')}</Button>
          <Button type="button" disabled={busy} onClick={()=>void closeSiteRule()}>{t('cancel')}</Button>
        </div>
      </form>
    </div>
  </main>;

  if (addKind) return <main className="popup sidepanel r86Panel popupQuickSetup" aria-label={t('sideAddProxyTitle')}
    onKeyDown={event=>{if(event.key==='Escape'&&!entryBusy){event.preventDefault();closeAdd();}}}>
    <header className="r86Header sideAddHeader">
      <h2>{t('sideAddProxyTitle')}</h2>
      <Button className="ruleClose" variant="quiet" disabled={entryBusy} aria-label={t('closeProxyEditor')} title={t('closeProxyEditor')} onClick={()=>closeAdd()}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></Button>
    </header>
    <section className="quickSetupBody">
      <form data-draft-scope={'quick-'+addKind} className="quickSetupForm sideAddForm" aria-busy={entryBusy} onSubmit={e=>void saveProxy(e)}>
          <p className="sideAddFixedHost">{t('fixedAddress')} <strong className="mono">127.0.0.1</strong></p>
          <div className="sideAddTwo">
            <div><label htmlFor="quick-protocol">{t('proxyType')}</label>
              <select id="quick-protocol" value={local.scheme} disabled={entryBusy}
                onChange={e=>setLocal({...local,scheme:e.target.value as 'http'|'socks5'})}>
                <option value="http">HTTP</option><option value="socks5">SOCKS5</option>
              </select></div>
            <div><label htmlFor="quick-port">{t('clientListeningPort')}</label>
              <ClearableInput id="quick-port" required disabled={entryBusy} type="number" inputMode="numeric"
                min={1} max={65535} fieldLabel={t('clientListeningPort')} placeholder="7890" value={local.port}
                onValueChange={port=>setLocal({...local,port})}
                aria-invalid={local.port!==''&&!isValidProxyPort(local.port)}
                aria-describedby={local.port!==''&&!isValidProxyPort(local.port)?'quick-port-error':'quick-local-hint'}/>
              {local.port!==''&&!isValidProxyPort(local.port)&&
                <small id="quick-port-error" role="alert" className="proxyEntryError">{t('errInvalidPort')}</small>}
            </div>
          </div>
          <p id="quick-local-hint" className="hint">{t('sideLocalPortHint')}</p>
        <details className="sideAddOptional" key={addKind} open={nameExpanded[addKind]}
          onToggle={event=>{const open=event.currentTarget.open;setNameExpanded(previous=>previous[addKind]===open?previous:{...previous,[addKind]:open});}}>
          <summary>{t('nameOptional')}
            {local.name&&
              <span className="sideAddOptionalValue">{local.name}</span>}
          </summary>
          <div className="sideAddOptionalBody">
            <label htmlFor="quick-name" className="sideAddVisuallyHidden">{t('nameOptional')}</label>
            <ClearableInput id="quick-name" disabled={entryBusy} maxLength={80} fieldLabel={t('name')}
              value={local.name}
              onValueChange={name=>setLocal({...local,name})}
              placeholder={t('eGMihomo')}/>
          </div>
        </details>
        {addedAnother&&<p role="status" className="popupSavedHint">{t('sideProxySavedAddAnother')}</p>}
        {error&&<p className="notice error" role="alert">{error}</p>}
        <div className="sideAddActions">
          <Button variant="primary" className="primary" type="submit" disabled={entryBusy}>{t('saveAndSelect')}</Button>
          <Button type="submit" data-add-another="true" disabled={entryBusy}>{t('proxySaveAndAddAnother')}</Button>
        </div>
        <p className="hint sideAddSaveHint">{t('sideAddSaveHint')}</p>
        <details className="sideAddHelp">
          <summary>{t('sideAddHelpLabel')}</summary>
          <p className="hint">{t('sideLocalProtocolHelp')}</p>
          <Button type="button" className="textAction" disabled={entryBusy} onClick={()=>void openOptions('profiles',false,'add')}>
            {t('sideAdvancedProxyEditor')}</Button>
        </details>
      </form>
    </section>
  </main>;

  const managing = state.runtime.managedIntent || state.runtime.control === 'controlled_by_this_extension';
  const needsRelease = needsProxyRelease(state.runtime);
  const blocked = routeSwitchBlocked(state.runtime);
  const activeMode = confirmedRouteMode(state.runtime);
  const rulesNeedSetup = activeMode !== 'rules' && !config.rules.some(rule=>rule.enabled);
  const needsProxySelection = config.selection.mode === 'profile' && !selected;
  const needsNewProxy = needsProxySelection && profiles.length === 0;
  const primaryAction = connectionAction(state.runtime, Boolean(selected));
  const stopLabel = (primaryAction === 'apply' || primaryAction === 'choose') && activeStopLabel(state.runtime);
  const primaryLabel = primaryAction === 'choose'
    ? needsNewProxy ? 'sideAddProxyTitle' : 'sideProxyChooseAction'
    : primaryAction && connectionActionLabel[primaryAction];
  const idleStatusLabel = !managing && needsNewProxy ? 'sideProxyNotConfigured' : undefined;
  const appliedSelection = state.runtime.activeSelection;
  async function handlePrimaryAction(event: React.MouseEvent<HTMLButtonElement>) {
    if (primaryAction === 'choose') {
      if (needsNewProxy) beginAdd('server','primary');
      else focusProxyChoice();
      return;
    }
    if (primaryAction === 'refresh') await refresh();
    else if (primaryAction) {
      await performRouteAction(event,()=>primaryAction==='apply'||primaryAction==='enable'
        ? apply(config.selection,config.selection.mode==='profile'?selected:undefined)
        : act({type:'STOP'}));
    }
  }
  const browserRoutes: Record<string, string> = {
    system: t('sideRouteSystem'), direct: t('sideRouteDirect'),
    profile:t('popupModeProfile'),rules:t('popupModeRules'),
    fixed_servers: t('specificProxy'), pac_script: t('sideRoutePac'),
    auto_detect: t('sideRouteAutoDetect')
  };
  const browserRoute = browserRoutes[state.runtime.browserMode ?? ''] ?? t('unableToVerify');
  const compactBrowserRoute = modes.find(m=>m.mode===state.runtime.browserMode)?.name||browserRoute;
  const knownControl=state.runtime.control==='controlled_by_this_extension'||state.runtime.control==='controllable_by_this_extension';
  const strandedControl=!state.runtime.managedIntent&&state.runtime.control==='controlled_by_this_extension';
  const RuntimeContainer=!statusDisplay.show&&knownControl&&!strandedControl&&!state.runtime.credentialRequired&&state.runtime.permission!==false&&!operationBusy&&!blocked&&!error&&!routeFeedback&&!state.runtime.pendingChanges&&!state.runtime.outcomeUnknown&&!state.runtime.statusErrorCode&&!state.runtime.proxyError&&!state.runtime.stopFinalizationPending&&!needsProxySelection?'details':'section';
  return <main className="popup sidepanel r86Panel" data-ui-version="R18">
    <div className="r86Scroll" ref={mainScroll}>
      <section className="r86Section" data-r86-section="modes">
        <div className="r86Head">
          <h2>{t('sideChooseRoute')}</h2>
          <div className="quickFallbackActions">
            <Button ref={fallbackAddButton} className="quickManagementIcon" disabled={busy} title={t('sideAddProxyTitle')} aria-label={t('sideAddProxyTitle')}
              onClick={()=>beginAdd('server','header')}><SideIcon name="plus"/></Button>
            <Button id="quick-settings" className="quickManagementIcon" disabled={busy||needsRelease} title={t('apManageSettings')} aria-label={t('openSettings')}
              onClick={()=>void openOptions('profiles')}><SideIcon name="settings"/></Button>
          </div>
        </div>
        <div className="r86Modes modeGrid" role="group" aria-label={t('proxyMode')} ref={modeGroup}>
          {modes.map(m=>{
            const actionOnly=m.mode==='rules'&&rulesNeedSetup;
            const selectedMode=config.selection.mode===m.mode;
            return <ConnectionButton syncing={syncing} type="button" key={m.mode} variant={selectedMode?'primary':'secondary'} disabled={operationBusy||(blocked&&!actionOnly)}
            className={'modeButton '+(selectedMode?'selected':'')}
            aria-label={m.name} aria-pressed={actionOnly?undefined:selectedMode}
            aria-describedby={m.mode==='direct'?'quick-direct-scope':undefined}
            title={actionOnly?t('connectionSetUpRules'):m.description} onClick={event=>void useMode(m.mode,event)}>
            <SideIcon name={m.mode}/><span className="sideModeLabel">{!actionOnly&&routeTarget?.mode===m.mode?t('connectionSwitchingShort'):m.name}</span>
          </ConnectionButton>;})}
        </div>
        <ConnectionSyncStatus show={slowSync}/>
        <p id="quick-direct-scope" className="r86Help" data-testid="side-direct-hint">
          {t(activeMode==='direct'?'sideDirectAppliedHint':'apDirectScope')}
        </p>
      </section>
      <RuntimeContainer className="r86Section r86Runtime" data-r86-section="status" aria-label={t('browserStatus')}>
        {RuntimeContainer==='details'&&<summary>{t('browserStatus')}</summary>}
        <div className={'connectionControls'+(primaryLabel&&stopLabel?' connectionControlsTwoActions':'')}>
          <Status status={state.runtime} compact quiet profiles={profiles} labelOverride={idleStatusLabel} operationErrorShown={Boolean(error)}/>
          {primaryLabel && <ConnectionButton syncing={syncing} type="button" variant={primaryAction === 'apply' || primaryAction === 'enable' || primaryAction === 'choose' ? 'primary' : 'secondary'}
            ref={primaryActionButton} data-testid="side-proxy-toggle"
            className={'connectionButton'+(primaryAction === 'apply' || primaryAction === 'enable' || primaryAction === 'choose' ? ' primary' : '')}
            disabled={operationBusy} onClick={handlePrimaryAction}>{t(primaryLabel)}</ConnectionButton>}
          {stopLabel && <ConnectionButton syncing={syncing} type="button" className="connectionButton" disabled={operationBusy}
            onClick={event=>void performRouteAction(event,()=>act({type:'STOP'}))}>{t(stopLabel)}</ConnectionButton>}
        </div>
        {routeFeedback && <p className="r86Help" role="status">{t(routeFeedback)}</p>}
        {error&&<p className="notice error" role="alert">{error}</p>}
      </RuntimeContainer>
      {savedHint&&<p className="r86Notice" role="status">{t('apProxySavedNotice')}</p>}
      <section className="r86Section" data-r86-section="proxies" aria-label={t('quickProxySelection')}>
        <div className="r86Head">
          <h2>{t(profiles.length ? 'sideSavedProxies' : 'sideProxySources')}{profiles.length>0&&<span className="countTag">{profiles.length}</span>}</h2>
          {profiles.length>0&&<Button id="quick-manage-profiles" className="quickManagementIcon" title={t('sideManageAll')} aria-label={t('sideManageAll')} disabled={busy}
            onClick={()=>void openOptions('profiles')}><SideIcon name="profile"/></Button>}
        </div>
        {profiles.length===0?<div className="r86Empty r91Start">
           <div className="r86Actions r91StartActions">
             <Button className="r91StartSecondary" onClick={()=>void openOptions('subscriptions',false,'new')}>
               <SideIcon name="link"/><strong>{t('popupSourceSubscriptions')}</strong>
             </Button>
             <Button ref={localEntryButton} className="r91StartSecondary" onClick={()=>beginAdd('local','local')}>
               <SideIcon name="system"/><strong>{t('sideAddLocalGateway')}</strong>
               <small>Clash / sing-box</small>
             </Button>
           </div>
         </div>:<div className="r86ProxyList quickProfileList">
          {visibleProfiles.map((profile,index)=>{
            const ep=profile.kind==='endpoint'?endpoints.find(e=>e.id===profile.endpointId):undefined;
            const chosen=config.selection.mode==='profile'&&config.selection.profileId===profile.id;
            const applied=state.runtime.applied &&
              state.runtime.control==='controlled_by_this_extension' &&
              appliedSelection?.mode==='profile' && appliedSelection.profileId===profile.id;
            const switching=routeTarget?.mode==='profile'&&routeTarget.profileId===profile.id;
            return <ConnectionButton syncing={syncing} type="button" key={profile.id} id={'quick-use-'+profile.id} ref={index===0?firstProfileButton:undefined} disabled={operationBusy||blocked}
              aria-busy={switching||undefined}
              title={profile.name} aria-pressed={chosen}
              aria-label={t(state.runtime.applied?'connectionUseNamed':'connectionSelectNamed',{name:profile.name})}
              className={'r86Profile '+(applied?'active applied':chosen?'selectedPending':'')}
              onClick={event=>{
                const selection:RouteSelection={mode:'profile',profileId:profile.id};
                if (state.runtime.applied && !applied) return performRouteAction(event,()=>apply(selection,profile));
                if (!chosen) return performRouteAction(event,()=>selectRoute(selection));
              }}>
              <span className="sideProfileBadge" aria-hidden="true">
                {ep?(ep.scheme.startsWith('socks')?'S':'H'):'P'}
              </span>
              <span className="sideProfileInfo"><strong>{profile.name}</strong>
                <small>{ep?ep.scheme.toUpperCase()+' · '+ep.host+':'+ep.port:'PAC'}</small></span>
              <span className={'quickChoice'+(applied?' current':'')}>{applied?<><SideIcon name="check"/>{t('sideUsing')}</>:
                t(switching?'connectionSwitchingShort':chosen?'selected':state.runtime.applied?'connectionUse':'sideProxyChooseAction')}</span>
            </ConnectionButton>;
          })}
        </div>}
        {profiles.length>visibleProfiles.length&&
          <p className="r86Help">{t('r86More',{count:profiles.length-visibleProfiles.length})}</p>}
        {profiles.length>0&&<Button ref={addButton} className="quickAddProxy r86IconFirst" onClick={()=>beginAdd('server','header')}>
          <SideIcon name="plus"/>{t('sideAddProxyTitle')}</Button>}
      </section>
      <section className="r86Section" data-r86-section="site" aria-label={t('currentWebsite')}>
        <div className="r86Head">
          <h2>{t('currentWebsite')}</h2>
          <Button id="quick-manage-rules" className="quickManagementIcon" title={t('sideManageRules')} aria-label={t('sideManageRules')} disabled={busy}
            onClick={()=>void openOptions('rules')}><SideIcon name="rules"/></Button>
        </div>
        <div className="siteContext">
          <strong className="r86SiteDomain"><SideIcon name="globe"/>{site||t(siteInfo.status==='loading'?'apSiteLoading':'apSiteUnavailable')}</strong>
          <span className="siteSource">{t(siteInfo.source==='preview'?'apSimulatedSite':site?'apCurrentPageSource':'apSiteManualHint')}</span>
        </div>
        <dl className="siteRouteSummary">
          <div><dt>{t('apBrowserSetting')}</dt><dd title={browserRoute}>{compactBrowserRoute}</dd></div>
          <div><dt title={t('expectedRouteNotTested')}>{t('sideExpectedRoute')}</dt><dd data-testid="side-selected-route" title={t('expectedRouteNotTested')}>{site?expectedRoute:t('apSiteRouteUnknown')}</dd></div>
        </dl>
        {site&&config.selection.mode==='rules'&&currentRule&&<p className="r86Help">{t('apMatchedSavedRule',{domain:currentRule.domain})}</p>}
        <div className="r86Actions">
          <Button ref={siteEditorButton} id="quick-site-rule" type="button" onClick={beginSiteRule}>
            <SideIcon name={currentRule?'edit':'plus'}/>{t(currentRule?'apEditMatchedRule':'sideAddSiteRule')}
          </Button>
          <Button type="button" disabled={siteLoading} onClick={()=>{void readSite();setSiteRefreshRevision(value=>value+1);}}>
            <SideIcon name="refresh"/>{t(siteLoading?'apSiteLoading':'apRefreshSite')}
          </Button>
        </div>
        {ruleHint&&<p role="status" className="r86Notice">{t('r86Saved')}</p>}
        <DiagnosticsPage state={state} busy={entryBusy} onRefresh={refresh}
          onStop={refresh} onProfiles={()=>void openOptions('profiles')} presentation="quick" currentSiteRevision={siteRefreshRevision}/>
      </section>
      <details className="quickAdvanced"><summary>{t('apAdvancedProxy')}</summary>
        <div className="r86CollectorMount" data-r86-section="collector"><RotationEntry/></div><p className="hint">{t('apAdvancedHelp')}</p><Button className="textAction" disabled={busy} onClick={()=>void openOptions('profiles')}>{t('apManageAdvanced')} <SideIcon name="open"/></Button></details>
      <p className="r86Legal" title={t('managesBrowserProxySettingsOnlyNotADeviceWide')}>{t('sideLegal')}</p>
    </div>
    {proxyEditorOpen&&<div className="options proxyQuickEditor"><ProxyEditor openingEtag={proxyEditorEtag} onClose={saved=>{
      setProxyEditorOpen(false);if(saved)setSavedHint(true);
      requestAnimationFrame(()=>proxyEditorOrigin.current?.isConnected&&proxyEditorOrigin.current.focus({preventScroll:true}));
    }}/></div>}
  </main>;
}
