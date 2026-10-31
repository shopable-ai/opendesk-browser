import {getEnvironment} from './environment';
import {Button} from '@opendesk/ui';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useI18n } from './i18n/LocaleProvider';
import { freshConfig, normalizeRuleSiteInput, priorityForSiteQuickRule } from './domain/config';
import type { Profile, ProxyScheme, RouteMode, SiteRule } from './domain/types';
import { useProxy } from './ui/useProxy';
import { Status } from './ui/Status';
import { ClearableInput } from './ui/ProxyEntry';
import { isValidProxyPort, parseProxyAddressPaste } from './domain/proxy-entry';
import { optionsUrl } from './ui/optionsRoute';
import { RotationEntry } from './ui/RotationPlan';

type SideIconName = 'profile' | 'rules' | 'direct' | 'system' | 'play' | 'pause' | 'settings' | 'plus' | 'link';
function SideIcon({name}:{name:SideIconName}) {
  return <svg className="sideUiIcon" width="16" height="16" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    focusable="false" aria-hidden="true">
    {name==='profile'&&<><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/></>}
    {name==='rules'&&<><path d="M4 6h16M4 12h10M4 18h16"/><circle cx="18" cy="12" r="2"/></>}
    {name==='direct'&&<path d="M4 12h15m-5-5 5 5-5 5"/>}
    {name==='system'&&<><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8m-4-3v3"/></>}
    {name==='play'&&<path d="m8 5 11 7-11 7z"/>}
    {name==='pause'&&<><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></>}
    {name==='settings'&&<><path d="M9.8 3.2h4.4l.6 2.1 1.5.9 2.1-.6 2.2 3.8-1.5 1.5v2.2l1.5 1.5-2.2 3.8-2.1-.6-1.5.9-.6 2.1H9.8l-.6-2.1-1.5-.9-2.2-3.8 1.5-1.5v-2.2L3.4 9.4l2.2-3.8 2.1.6 1.5-.9z"/><circle cx="12" cy="12" r="3"/></>}
    {name==='plus'&&<path d="M12 5v14M5 12h14"/>}
    {name==='link'&&<><path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7"/></>}
  </svg>;
}

type AddKind = 'server' | 'local';
type RouteTarget = 'endpoint' | 'direct';
const emptyServer = { name:'', scheme:'http' as ProxyScheme, host:'', port:'' };
const emptyLocal = { name:'', scheme:'http' as 'http' | 'socks5', port:'' };

function defaultServerName(scheme:ProxyScheme,host:string,port:string) {
  const prefix=scheme.toUpperCase()+' · ';
  const suffix=':'+port;
  const hostBudget=80-prefix.length-suffix.length;
  const shortHost=host.length>hostBudget?host.slice(0,hostBudget-1)+'…':host;
  return prefix+shortHost+suffix;
}

export default function App() {
  const { t } = useI18n();
  const { state, error, busy, act, refresh, setError, setErrorKey } = useProxy();
  const modes: {mode:RouteMode;name:string;description:string}[] = [
    {mode:'profile',name:t('popupModeProfile'),description:t('yourOwnProxyOrLocalPac')},
    {mode:'rules',name:t('popupModeRules'),description:t('routeAutomaticallyByDomain')},
    {mode:'direct',name:t('popupModeDirect'),description:t('connectDirectlyWithoutAProxy')},
    {mode:'system',name:t('popupModeSystem'),description:t('useTheBrowserSSystemProxySettings')}
  ];
  const [siteInfo,setSiteInfo] = useState({status:'loading',host:'',source:''});
  const site=siteInfo.host;
  const siteGeneration=useRef(0);
  const [siteLoading,setSiteLoading]=useState(false);
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
  const [server,setServer] = useState(emptyServer);
  const [addressPasteError,setAddressPasteError] = useState(false);
  const [local,setLocal] = useState(emptyLocal);
  const [savedHint,setSavedHint] = useState(false);
  const [ruleHint,setRuleHint] = useState(false);
  const [ruleTarget,setRuleTarget] = useState<RouteTarget>('endpoint');
  const [ruleEndpoint,setRuleEndpoint] = useState('');
  const [switchingProfile,setSwitchingProfile] = useState<string | null>(null);
  const [addedAnother,setAddedAnother] = useState(false);
  const [saving,setSaving] = useState(false);
  const savingRef = useRef(false);
  const [entryFocusRequest,setEntryFocusRequest] = useState(0);
  const [nameExpanded,setNameExpanded] = useState({server:false,local:false});
  const entryBusy = busy || saving;
  const addButton = useRef<HTMLButtonElement>(null);
  const siteEditorButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const entryOrigin = useRef<'header'|'primary'|'local'>('header');
  const returnTarget = useRef<'header'|'primary'|'local'|'after-save'>('header');
  const primaryActionButton = useRef<HTMLButtonElement>(null);
  const applyPendingButton = useRef<HTMLButtonElement>(null);
  const localEntryButton = useRef<HTMLButtonElement>(null);
  const firstProfileButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!addKind && returnFocus.current) {
      const target = returnTarget.current === 'after-save'
        ? applyPendingButton.current ?? primaryActionButton.current
        : returnTarget.current === 'primary' ? primaryActionButton.current
          : returnTarget.current === 'local' ? localEntryButton.current
            : addButton.current;
      (target ?? addButton.current)?.focus();
      returnFocus.current = false;
    }
  },[addKind]);
  useEffect(() => {
    if (addKind) document.getElementById(addKind==='server'?'quick-host':'quick-port')?.focus();
  },[addKind,entryFocusRequest]);
  function beginAdd(kind:AddKind, origin:'header'|'primary'|'local'='header') {
    entryOrigin.current = origin;
    setAddedAnother(false);
    setSavedHint(false);
    setAddressPasteError(false);
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
  const orderedProfiles = [...profiles].sort((a,b)=>{
    const selectedId = config.selection.profileId;
    if (a.id===selectedId) return -1;
    if (b.id===selectedId) return 1;
    return profiles.indexOf(b)-profiles.indexOf(a);
  });
  const visibleProfiles = orderedProfiles.slice(0,4);

  function handleProxyPaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData('text').trim();
    if (!text.includes(':')) return;
    const parsed = parseProxyAddressPaste(text);
    if (parsed) {
      event.preventDefault();
      getEnvironment().setDraftDirty(true,'quick-server');
      setServer(previous => ({...previous,...parsed}));
      setAddressPasteError(false);
    } else if (text.includes('://') || /^\[/.test(text) || /:\d/.test(text)) {
      event.preventDefault();
      setAddressPasteError(true);
    }
  }
  async function saveProxy(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draftRevision=getEnvironment().getDraftRevision('quick-'+addKind);
    if (!addKind || entryBusy || savingRef.current) return;
    setAddedAnother(false);
    if (!isValidProxyPort(addKind === 'server' ? server.port : local.port)) {
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
      if (addKind==='server') {
        name = server.name.trim() || defaultServerName(server.scheme,server.host.trim(),server.port);
        if (!await act({type:'SAVE_ENDPOINT',endpoint:{
          id,name,scheme:server.scheme,host:server.host.trim(),
          port:Number(server.port),sourceId:'manual'
        }})) return;
        if (!await act({type:'SAVE_PROFILE',profile:{
          id:'profile-'+id,name,kind:'endpoint',endpointId:id,sourceId:'manual'
        }})) return;
      } else {
        name = local.name.trim() || (local.scheme==='http'?t('localHttp'):t('localSocks5'));
        if (!await act({type:'SAVE_LOCAL_CLIENT',client:{
          id,name,scheme:local.scheme,port:Number(local.port)
        }})) return;
      }
      if (!keepAdding) {
        if (!await act({type:'SELECT',selection:{mode:'profile',profileId:'profile-'+id}})) return;
        if(!getEnvironment().setDraftDirty(false,'quick-'+addKind,draftRevision))return;
        if (addKind==='server') setServer(emptyServer);
        else setLocal(emptyLocal);
        setNameExpanded(previous=>({...previous,[addKind]:false}));
        closeAdd(true);
        setSavedHint(true);
      } else {
        if(!getEnvironment().setDraftDirty(false,'quick-'+addKind,draftRevision))return;
        if (addKind==='server') {setServer(emptyServer);setAddressPasteError(false);}
        else setLocal(emptyLocal);
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
    if (await act({type:'SAVE_RULE',rule})) {
      if(!getEnvironment().setDraftDirty(false,'quick-rule',draftRevision))return;
      setSiteInput(domain);setSiteError(false);ruleReturn.current=true;setSiteEditorOpen(false);
      // Save and Apply are separate user actions, even while Rules mode is running.
      // Keep Chrome's previous confirmed PAC until the user explicitly applies.
      setRuleHint(true);
    }
  }
  async function apply() {
    if (config.selection.mode==='profile' && selected?.kind==='pac-inline'
      && !await getEnvironment().confirm(t('chromeWillRunTheLocalPacScriptYouProvided'))) return;
    if (await act({type:'APPLY',approvedPac:selected?.kind==='pac-inline'})) {
      setSavedHint(false);
      setRuleHint(false);
    }
  }
  function focusProxyChoice() {
    // Focus scrolls the first visible saved proxy into view.
    firstProfileButton.current?.focus();
  }
  function showControlReason() {
    if (typeof document === 'undefined') return;
    const details = document.querySelector<HTMLDetailsElement>('.r86StatusDetails');
    if (!details) return;
    details.open = true;
    details.querySelector('summary')?.focus();
  }
  async function useProfile(profile: Profile) {
    setSavedHint(false);
    // Selecting a proxy while paused must NEVER reacquire Chrome proxy control.
    const live=Boolean(state?.runtime.managedIntent ||
      state?.runtime.control==='controlled_by_this_extension');
    if (!live) {
      await act({type:'SELECT',selection:{mode:'profile',profileId:profile.id}});
      return;
    }
    setSwitchingProfile(profile.id);
    try {
      if (await act({type:'SELECT',selection:{mode:'profile',profileId:profile.id}})) {
        setSavedHint(false);
        setRuleHint(false);
      }
    } finally { setSwitchingProfile(null); }
  }
  async function useMode(mode: RouteMode) {
    const selection={...config.selection,mode};
    const live=Boolean(state?.runtime.managedIntent ||
      state?.runtime.control==='controlled_by_this_extension');
    if (!live || (mode==='profile' && !selected)) {
      if (await act({type:'SELECT',selection})) {
        setSavedHint(false);
        setRuleHint(false);
      }
      return;
    }
    if (mode===config.selection.mode && state?.runtime.applied && !state.runtime.pendingChanges &&
        state.runtime.activeSelection?.mode===mode) return;
    if (await act({type:'SELECT',selection})) {
      setSavedHint(false);
      setRuleHint(false);
    }
  }
  async function openOptions(section:'profiles'|'rules'|'subscriptions'|'official'|'diagnostic', rotation = false, action?: 'add' | 'new' | 'local') {
    try {
      rememberView(section==='profiles'?'quick-manage-profiles':section==='rules'?'quick-manage-rules':'quick-settings');
      getEnvironment().navigate('#/'+section+(rotation?'/rotation':action?'/'+action:''));
    } catch {setErrorKey('couldNotOpenTheSettingsTabOpenItFrom');}
  }

  if (!state) return <main className="popup sidepanel">
    <div className="sideLoading"><p className="hint">{t('readingBrowserProxyState')}</p>
      {error&&<p className="notice error" role="alert">{error}</p>}
      <Button onClick={()=>void refresh()}>{t('retry')}</Button></div>
  </main>;

  function beginSiteRule(){
    savedScroll.current=mainScroll.current?.scrollTop??0;
    setRuleSource(site);setEditingSiteRule(currentRule);setSiteInput(currentRule?.domain||site);
    setIncludeSubdomains(currentRule?.includeSubdomains??true);
    setRuleTarget(currentRule?.action??'endpoint');setRuleEndpoint(currentRule?.endpointId??quickEndpoint);
    setSiteError(false);setError('');setRuleHint(false);setSiteEditorOpen(true);
  }
  async function closeSiteRule(discard=false){
    const env=getEnvironment(),revision=env.getDraftRevision('quick-rule');
    if(!discard&&env.isDraftDirty('quick-rule')&&!await env.confirm(t('apDiscardHelp')))return;
    if(!env.setDraftDirty(false,'quick-rule',revision))return;
    ruleReturn.current=true;setSiteEditorOpen(false);setError('');
  }
  let ruleDomain='';
  try{ruleDomain=normalizeRuleSiteInput(siteInput);}catch{/* Invalid input has no matching preview. */}
  if(siteEditorOpen)return <main className="popup sidepanel r86Panel siteRulePage" aria-label={t(editingSiteRule?'editRule':'addRule')}
    onKeyDown={event=>{if(event.key==='Escape'&&!busy){event.preventDefault();void closeSiteRule();}}}>
    <header className="r86Header sideAddHeader">
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
          <Button type="button" disabled={busy} onClick={()=>void closeSiteRule(true)}>{t('cancel')}</Button>
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
      <div className="sideAddKind" role="group" aria-label={t('sideAddProxyKind')}>
        <Button type="button" aria-pressed={addKind==='server'}
          className={addKind==='server'?'active':''} disabled={entryBusy}
          onClick={()=>{setAddedAnother(false);setError('');setAddKind('server');}}>{t('sideAddProxyServer')}</Button>
        <Button type="button" aria-pressed={addKind==='local'}
          className={addKind==='local'?'active':''} disabled={entryBusy}
          onClick={()=>{setAddedAnother(false);setError('');setAddKind('local');}}>{t('sideAddLocalGateway')}</Button>
      </div>
      <form data-draft-scope={'quick-'+addKind} className="quickSetupForm sideAddForm" aria-busy={entryBusy} onSubmit={e=>void saveProxy(e)}>
        {addKind==='server'?<>
          <div><label htmlFor="quick-host">{t('host')}</label>
            <ClearableInput required disabled={entryBusy} id="quick-host" fieldLabel={t('host')}
              value={server.host} placeholder={t('127001OrProxyExampleCom')} autoComplete="off" spellCheck={false}
              aria-invalid={addressPasteError} aria-describedby={addressPasteError?'quick-host-error':'quick-host-hint'}
              onValueChange={host=>{setServer({...server,host});setAddressPasteError(false);}} onPaste={handleProxyPaste}/>
            {addressPasteError
              ? <small id="quick-host-error" className="proxyEntryError" role="alert">{t('proxyPasteUnsupported')}</small>
              : <small id="quick-host-hint" className="sideAddFieldHint">{t('sideProxyPasteHint')}</small>}
          </div>
          <div className="sideAddTwo">
            <div><label htmlFor="quick-protocol">{t('protocol')}</label>
              <select id="quick-protocol" value={server.scheme} disabled={entryBusy}
                onChange={e=>setServer({...server,scheme:e.target.value as ProxyScheme})}>
                <option value="http">HTTP</option><option value="https">HTTPS</option>
                <option value="socks4">SOCKS4</option><option value="socks5">SOCKS5</option>
              </select></div>
            <div><label htmlFor="quick-port">{t('port')}</label>
              <ClearableInput id="quick-port" required disabled={entryBusy} type="number" inputMode="numeric"
                min={1} max={65535} fieldLabel={t('port')} placeholder="8080"
                value={server.port} onValueChange={port=>setServer({...server,port})}
                aria-invalid={server.port!==''&&!isValidProxyPort(server.port)}
                aria-describedby={server.port!==''&&!isValidProxyPort(server.port)?'quick-port-error':undefined}/>
              {server.port!==''&&!isValidProxyPort(server.port)&&
                <small id="quick-port-error" role="alert" className="proxyEntryError">{t('errInvalidPort')}</small>}
            </div>
          </div>
        </>:<>
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
        </>}
        <details className="sideAddOptional" key={addKind} open={nameExpanded[addKind]}
          onToggle={event=>{const open=event.currentTarget.open;setNameExpanded(previous=>previous[addKind]===open?previous:{...previous,[addKind]:open});}}>
          <summary>{t('nameOptional')}
            {(addKind==='server'?server.name:local.name)&&
              <span className="sideAddOptionalValue">{addKind==='server'?server.name:local.name}</span>}
          </summary>
          <div className="sideAddOptionalBody">
            <label htmlFor="quick-name" className="sideAddVisuallyHidden">{t('nameOptional')}</label>
            <ClearableInput id="quick-name" disabled={entryBusy} maxLength={80} fieldLabel={t('name')}
              value={addKind==='server'?server.name:local.name}
              onValueChange={name=>addKind==='server'?setServer({...server,name}):setLocal({...local,name})}
              placeholder={addKind==='server'?t('eGMyLocalProxy'):t('eGMihomo')}/>
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
          <p className="hint">{addKind==='server'?t('sideProxyProtocolLimit'):t('sideLocalProtocolHelp')}</p>
          <Button type="button" className="textAction" disabled={entryBusy} onClick={()=>void openOptions('profiles',false,'add')}>
            {t('sideAdvancedProxyEditor')}</Button>
        </details>
      </form>
    </section>
  </main>;

  const managing = state.runtime.managedIntent || state.runtime.control === 'controlled_by_this_extension';
  const blocked = state.runtime.control === 'controlled_by_other_extensions' ||
    state.runtime.control === 'not_controllable';
  const needsProxySelection = config.selection.mode === 'profile' && !selected;
  const needsNewProxy = needsProxySelection && profiles.length === 0;
  const cannotEnable = needsProxySelection || blocked;
  // Keep the primary action actionable, even on a fresh installation.
  const primaryAction = state.runtime.stopFinalizationPending ? 'finalize' : managing && state.runtime.canStop ? 'pause' : blocked ? 'details'
    : needsProxySelection ? (needsNewProxy ? 'add' : 'choose')
    : state.runtime.proxyError ? 'retry' : 'enable';
  const primaryLabels = {
    finalize:'apFinishStop', pause: 'r83Pause', details: 'sideProxyViewReason',
    add: 'sideAddProxyTitle', choose: 'sideProxyChooseAction',
    retry: state.runtime.statusErrorCode || state.runtime.outcomeUnknown ? 'apRefreshStatus' : 'retry', enable: 'r83Enable'
  } as const;
  const idleStatusLabel = !managing && !blocked && !state.runtime.proxyError &&
    config.selection.mode === 'profile'
    ? needsNewProxy ? 'sideProxyNotConfigured'
      : needsProxySelection ? 'sideProxyNeedsSelection' : 'sideProxyReady'
    : undefined;
  const appliedSelection = state.runtime.activeSelection;
  function handlePrimaryAction() {
    if (primaryAction === 'pause'||primaryAction === 'finalize') { void act({type:'STOP'}); return; }
    if (primaryAction === 'add') { beginAdd('server','primary'); return; }
    if (primaryAction === 'choose') { focusProxyChoice(); return; }
    if (primaryAction === 'details') { showControlReason(); return; }
    if (primaryAction === 'retry' && (state.runtime.statusErrorCode || state.runtime.outcomeUnknown)) { void refresh(); return; }
    void apply(); // Only a configured route can reach Apply.
  }
  const browserRoutes: Record<string, string> = {
    system: t('sideRouteSystem'), direct: t('sideRouteDirect'),
    profile:t('popupModeProfile'),rules:t('popupModeRules'),
    fixed_servers: t('specificProxy'), pac_script: t('sideRoutePac'),
    auto_detect: t('sideRouteAutoDetect')
  };
  const browserRoute = browserRoutes[state.runtime.browserMode ?? ''] ?? t('unableToVerify');
  return <main className="popup sidepanel r86Panel" data-ui-version="R8.6">
    <div className="r86Scroll" ref={mainScroll}>
      <section className="r86Section" data-r86-section="modes">
        <div className="r86Head">
          <h2>{t('sideChooseRoute')}</h2>
          <div className="proxy-route-actions">
      <Button ref={addButton} className="r86Icon r86IconFirst" title={t('sideAddProxyTitle')}
        aria-label={t('sideAddProxyTitle')} onClick={()=>beginAdd('server','header')}>
        <SideIcon name="plus"/>
      </Button>
      <Button className="r86Icon" title={t('openSettings')} aria-label={t('openSettings')}
        id="quick-settings" onClick={()=>{rememberView('quick-settings');void getEnvironment().openSettings();}}><SideIcon name="settings"/></Button>
          </div>

          
        </div>
        <div className="r86Modes modeGrid" role="group" aria-label={t('proxyMode')}>
          {modes.map(m=><Button type="button" key={m.mode} variant={config.selection.mode===m.mode?'primary':'secondary'} disabled={busy||blocked}
            className={'modeButton '+(config.selection.mode===m.mode?'selected':'')}
            aria-label={m.name} aria-pressed={config.selection.mode===m.mode}
            title={m.description} onClick={()=>void useMode(m.mode)}>
            <SideIcon name={m.mode}/><span className="sideModeLabel">{m.name}</span>
          </Button>)}
        </div>
        
      </section>
      <section className="r86Section r86Runtime" data-r86-section="status" aria-label={t('browserStatus')}>
        <div className="r86StatusCard">
          <Status status={state.runtime} compact quiet labelOverride={idleStatusLabel}/>
          <Button type="button" ref={primaryActionButton} data-testid="side-proxy-toggle"
            className={'r86Toggle sideProxyToggle '+(managing?'isRunning':'isPaused')}
            title={t(primaryLabels[primaryAction])}
            aria-label={t(primaryLabels[primaryAction])}
            disabled={busy}
            onClick={handlePrimaryAction}>
            <SideIcon name={primaryAction==='pause'?'pause':primaryAction==='add'?'plus':
              primaryAction==='choose'?'profile':primaryAction==='details'?'settings':'play'}/>
            <span>{t(primaryLabels[primaryAction])}</span>
          </Button>
        </div>
        {config.selection.mode==='direct'&&!blocked&&!state.runtime.proxyError&&
          <p className="r86Help" data-testid="side-direct-hint">
          {t(state.runtime.applied && !state.runtime.pendingChanges && appliedSelection?.mode==='direct' ? 'sideDirectAppliedHint'
            : managing ? 'sideDirectPendingHint' : 'sideDirectPausedHint')}
        </p>}
        {managing&&(!state.runtime.applied||state.runtime.pendingChanges)&&!cannotEnable&&<Button type="button"
          ref={applyPendingButton} className="r86ApplyPending" disabled={busy} onClick={()=>void apply()}>
          {t('applySelection')}
        </Button>}
        {error&&<p className="notice error" role="alert">{error}</p>}
      </section>
      {savedHint&&<p className="r86Notice" role="status">{t('sideProxySavedNotApplied')}</p>}
      <section className="r86Section" data-r86-section="proxies" aria-label={t('quickProxySelection')}>
        <div className="r86Head">
          <h2>{t(profiles.length ? 'sideSavedProxies' : 'sideProxyOtherMethods')}{profiles.length>0&&<span className="countTag">{profiles.length}</span>}</h2>
          {profiles.length>0&&<Button id="quick-manage-profiles" className="textAction" onClick={()=>void openOptions('profiles')}>
            {t('sideManageAll')}
          </Button>}
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
            return <Button type="button" key={profile.id} ref={index===0?firstProfileButton:undefined} disabled={busy||blocked}
              title={profile.name} aria-pressed={chosen}
              className={'r86Profile '+(applied?'active applied':chosen?'selectedPending':'')}
              onClick={()=>void useProfile(profile)}>
              <span className="sideProfileBadge" aria-hidden="true">
                {ep?(ep.scheme.startsWith('socks')?'S':'H'):'P'}
              </span>
              <span className="sideProfileInfo"><strong>{profile.name}</strong>
                <small>{ep?ep.scheme.toUpperCase()+' · '+ep.host+':'+ep.port:'PAC'}</small></span>
              <span className="quickChoice">{switchingProfile===profile.id
                ?t('r83QuickApplying'):applied?t('r83QuickApplied'):
                chosen?t('r86Chosen'):t('r83QuickUse')}</span>
            </Button>;
          })}
        </div>}
        {profiles.length>visibleProfiles.length&&
          <p className="r86Help">{t('r86More',{count:profiles.length-visibleProfiles.length})}</p>}
      </section>
      <section className="r86Section" data-r86-section="site" aria-label={t('currentWebsite')}>
        <div className="r86Head">
          <h2>{t('currentWebsite')}</h2>
          <Button id="quick-manage-rules" className="textAction" onClick={()=>void openOptions('rules')}>{t('sideManageRules')}</Button>
        </div>
        <div className="siteContext">
          <strong className="r86SiteDomain">{site||t(siteInfo.status==='loading'?'apSiteLoading':'apSiteUnavailable')}</strong>
          <span className="siteSource">{t(siteInfo.source==='preview'?'apSimulatedSite':site?'apCurrentPageSource':'apSiteManualHint')}</span>
        </div>
        <dl className="siteRouteSummary">
          <div><dt>{t('apBrowserSetting')}</dt><dd data-testid="side-current-route">{browserRoute}</dd></div>
          <div><dt>{t(state.runtime.applied&&!state.runtime.pendingChanges?'apSavedSelection':'apPendingSelection')}</dt><dd data-testid="side-selected-route">{site?expectedRoute:t('apSiteRouteUnknown')}</dd></div>
        </dl>
        {site&&config.selection.mode==='rules'&&currentRule&&<p className="r86Help">{t('apMatchedSavedRule',{domain:currentRule.domain})}</p>}
        <p className="r86Help">{t('apSiteRouteHelp')}</p>
        <div className="r86Actions">
          <Button ref={siteEditorButton} id="quick-site-rule" type="button" onClick={beginSiteRule}>
            {t(currentRule?'apEditMatchedRule':'addRule')}
          </Button>
          <Button type="button" disabled={siteLoading} onClick={()=>void readSite()}>{t(siteLoading?'apSiteLoading':'apRefreshSite')}</Button>
        </div>
        {ruleHint&&<p role="status" className="r86Notice">{t('r86Saved')}</p>}
      </section>
      <div className="r86CollectorMount" data-r86-section="collector">
        <RotationEntry/>
      </div>
      <p className="r86Legal">{t('managesBrowserProxySettingsOnlyNotADeviceWide')}</p>
    </div>
    <nav className="r86Bottom" aria-label={t('openSettings')}>
      <Button type="button" onClick={()=>void openOptions('subscriptions')}>
        {t('popupSourceSubscriptions')}</Button>
      <Button type="button" onClick={()=>void openOptions('diagnostic')}>
        {t('popupFooterDiagnostics')}</Button>
    </nav>
  </main>;
}
