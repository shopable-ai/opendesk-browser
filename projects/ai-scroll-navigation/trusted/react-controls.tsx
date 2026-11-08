import * as React from 'react';
import {scrollNavigationText,scrollNavigationMessageText} from './host-localization.js';
import {Button,IconButton} from '../../../src/ui/react/components/ui/button.tsx';
import {Switch} from '../../../src/ui/react/components/ui/switch.tsx';
import {ScrollConfigurationChat} from './ai-controls.tsx';

// Fixed first-party UI. Page packages never execute in this trusted root.
const EMPTY_SCROLL_SITE=Object.freeze({
  origin:'',pathScope:'',mainSelector:'',scrollSelector:'',
  messageSelector:'',anchorSelector:'',enabled:true
});
const SCROLL_CSS_FIELDS=[
  ['mainSelector','mainSelector','main',true],
  ['scrollSelector','scrollSelector','scroller',true],
  ['messageSelector','messageSelector','messages',false],
  ['anchorSelector','anchorSelector','anchor',false]
];
const SCROLL_BUILTINS=[
  {name:'ChatGPT',origin:'https://chatgpt.com'},
  {name:'DeepSeek',origin:'https://chat.deepseek.com'},
  {name:'Gemini',origin:'https://gemini.google.com'}
];
const SCROLL_FLAGS=[
  ['regionTop','regionTop'],['regionBottom','regionBottom'],
  ['conversationTop','conversationTop'],['conversationBottom','conversationBottom'],
  ['floatingTop','floatingTop']
];
const SCROLL_FLAG_GROUPS=[
  ['longReply',SCROLL_FLAGS.slice(0,2)],
  ['conversation',SCROLL_FLAGS.slice(2,4)],
  ['floatingNavigation',SCROLL_FLAGS.slice(4)]
];
function scrollOrigin(value){
  try{
    const url=new URL(value.trim());
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||
      url.pathname!=='/'||url.search||url.hash)return null;
    return url.origin;
  }catch{return null;}
}
function scrollCssError(value,required){
  if(!value.trim())return required?'cssRequired':'';
  if(value.length>256||/[\u0000-\u001f\u007f{};]/.test(value))
    return 'cssInvalidCharacters';
  try{document.querySelector(value);}catch{return 'cssInvalidSyntax';}
  return '';
}
function validScrollPath(value){
  return value.length<=512&&value.startsWith('/')&&!value.startsWith('//')&&
    !/[?#\\*\u0000-\u001f\u007f]/.test(value)&&
    !value.includes('/../')&&!value.endsWith('/..')&&!value.includes('/./');
}
// State and async failures keep semantic copy, so locale changes never rerun work.
const message=(key,parameters={})=>({key,parameters});
const failure=key=>Object.assign(new Error(key),{scrollMessage:message(key)});
const errorDetail=error=>error?.scrollMessage||String(error?.message||error);
const readErrorDetail=error=>error?.scrollMessage||error?.code||errorDetail(error);
export function ScrollSiteManager({model,pageControl,title,detail,onNavigation,PageControl,Diagnostics}){
  const locale=model.locale||'zh-CN';
  const t=(key,params)=>scrollNavigationText(locale,key,params);
  const resumed=model.resumeDraft||null;
  const [snapshot,setSnapshot]=React.useState(null);
  const [loading,setLoading]=React.useState(true);
  const [view,setView]=React.useState(resumed?'editor':'home');
  const [managementFrom,setManagementFrom]=React.useState('settings');
  const [editorFrom,setEditorFrom]=React.useState(
    ['home','sites','builtins'].includes(resumed?.returnView)?resumed.returnView:'home');
  const [editingKey,setEditingKey]=React.useState(resumed?.editKey??null);
  const [draft,setDraft]=React.useState(resumed?Object.fromEntries(
    Object.keys(EMPTY_SCROLL_SITE).map(key=>[key,resumed[key]??EMPTY_SCROLL_SITE[key]])):null);
  const [touched,setTouched]=React.useState({});
  const [busy,setBusy]=React.useState(false);
  const [error,setError]=React.useState('');
  const [notice,setNotice]=React.useState('');
  const [confirmDelete,setConfirmDelete]=React.useState(false);
  const [expandedSite,setExpandedSite]=React.useState(null);
  const [needsReconcile,setNeedsReconcile]=React.useState(false);
  const [aiOpen,setAiOpen]=React.useState(false);
  const ref=React.useRef(model);ref.current=model;
  const originInput=React.useRef(null);
  const pathInput=React.useRef(null);
  const selectorInputs=React.useRef({});
  const contentRef=React.useRef(null);
  const pendingFocus=React.useRef(resumed?'scroll-origin':null);
  const returnFocus=React.useRef({});
  const navigate=next=>{
    returnFocus.current[view]=document.activeElement?.id;
    pendingFocus.current='scroll-page-title';setView(next);
  };
  const returnTo=next=>{
    pendingFocus.current=returnFocus.current[next]||'scroll-page-title';setView(next);
  };
  const openManagement=()=>{setManagementFrom(view==='home'?'home':'settings');navigate('management');};
  // A resumed permission-review draft has not been saved. Do not turn it into
  // the clean baseline merely because the Installer remounted this view.
  const seed=React.useRef(null);
  const inFlight=React.useRef(false);
  const navigationGesture=React.useRef(null);
  const captureNavigation=event=>{
    navigationGesture.current=event.nativeEvent?.isTrusted===true?event.nativeEvent:null;
  };
  const fillEpoch=React.useRef(0);
  React.useEffect(()=>{
    let live=true;setLoading(true);
    ref.current.onRead().then(value=>{
      if(!live)return;
      if(value?.value?.version!==1||!Array.isArray(value.value.sites)||
        typeof value.etag!=='string')throw failure('invalidConfigReadback');
      setSnapshot(value);setError('');setLoading(false);
    }).catch(e=>{if(live){setError(message('readFailed',{detail:readErrorDetail(e)}));setLoading(false);}});
    return ()=>{live=false;};
  },[model.identityKey]);
  const update=(key,value)=>{
    fillEpoch.current++;
    const next={...(draft||EMPTY_SCROLL_SITE),[key]:value};
    setDraft(next);ref.current.onDraftChange({...next,returnView:editorFrom},editingKey);
    setTouched(old=>({...old,[key]:true}));
    setError('');setNotice('');
  };
  const open=async(item=null,from=view)=>{
    const value=item?{...item}:{...EMPTY_SCROLL_SITE};
    const key=item?item.origin+'\n'+item.pathScope:null;
    const epoch=++fillEpoch.current;
    returnFocus.current[from]=document.activeElement?.id;
    pendingFocus.current='scroll-origin';
    setView('editor');setEditorFrom(from);setEditingKey(key);setDraft(value);
    seed.current={...(item||value)};
    setTouched({});
    setNotice('');setError('');setConfirmDelete(false);
    ref.current.onDraftChange({...value,returnView:from},key);
    if(!item){
      try{
        const page=await ref.current.onCurrentPageDetails();
        if(fillEpoch.current!==epoch)return;
        const origin=scrollOrigin(page?.origin||'');
        if(!origin)return;
        const next={...value,origin};
        seed.current={...next};setDraft(next);ref.current.onDraftChange({...next,returnView:from},null);
      }catch(e){if(fillEpoch.current===epoch)setNotice(message('autofillUnavailable'));}
    }
    queueMicrotask(()=>originInput.current?.focus({preventScroll:true}));
  };
  const dirty=Boolean(draft)&&JSON.stringify(draft)!==JSON.stringify(seed.current);
  const leaveEditor=()=>{
    fillEpoch.current++;
    returnTo(editorFrom);setDraft(null);setEditingKey(null);setConfirmDelete(false);
    setTouched({});setError('');ref.current.onDraftChange(null,null);
  };
  const closeEditor=()=>{
    if(busy)return;
    leaveEditor();
  };
  const goBack=()=>{
    if(view==='editor')closeEditor();
    else if(view==='management')returnTo(managementFrom);
    else {returnTo('home');setError('');}
  };
  const backRef=React.useRef(goBack);backRef.current=goBack;
  React.useLayoutEffect(()=>{
    onNavigation?.({identityKey:model.identityKey,busy:busy||Boolean(detail?.busy),view,
      actionsDisabled:busy||Boolean(detail?.busy)||loading||needsReconcile||dirty,
      canAdd:!busy&&!detail?.busy&&!loading&&!needsReconcile&&Boolean(snapshot)&&!model.disabledReason,
      title:({builtins:t('builtinsTitle'),sites:t('sitesTitle'),settings:t('settingsTitle'),
        management:t('managementTitle'),editor:editingKey?t('editSite'):t('addSite')})[view]||'',
      backLabel:view==='editor'?(editorFrom==='home'?t('backHome'):editorFrom==='builtins'?t('backBuiltins'):t('backSites')):
        view==='management'?(managementFrom==='home'?t('backHome'):t('backSettings')):t('backHome'),
      settingsLabel:t('settingsTitle'),addSiteLabel:t('addSite'),
      aiLabel:t('aiTitle'),aiOpen,toggleAI:()=>setAiOpen(value=>!value),
      openSettings:()=>navigate('settings'),
      addSite:()=>void open(null,'sites'),
      back:view==='home'?null:()=>backRef.current()});
  },[view,busy,detail?.busy,loading,needsReconcile,dirty,Boolean(snapshot),model.disabledReason,
    editingKey,editorFrom,managementFrom,model.identityKey,onNavigation,locale,aiOpen]);
  React.useLayoutEffect(()=>{
    if(busy)return;
    if(!pendingFocus.current)return;
    // Navigation updates the parent toolbar in its layout effect. Wait for that
    // commit so header openers exist before restoring focus to them.
    let live=true;
    queueMicrotask(()=>{
      if(!live||!pendingFocus.current)return;
      if(contentRef.current)contentRef.current.scrollTop=0;
      (document.getElementById(pendingFocus.current)||document.getElementById('scroll-page-title'))?.focus({preventScroll:true});
      pendingFocus.current=null;
    });
    return ()=>{live=false;};
  },[view,busy]);
  React.useEffect(()=>()=>onNavigation?.(null),[onNavigation]);
  const readAgain=async()=>{
    if(inFlight.current)return;inFlight.current=true;setBusy(true);
    try{
      const result=await ref.current.onRead();
      if(result?.value?.version!==1||!Array.isArray(result.value.sites)||
        typeof result.etag!=='string')throw failure('invalidReread');
      setSnapshot(result);setNeedsReconcile(false);setError('');
      const observed=draft&&result.value.sites.find(site=>
        Object.keys(EMPTY_SCROLL_SITE).every(key=>site[key]===
          (key==='origin'?scrollOrigin(draft[key]):
            key==='pathScope'?draft[key].trim()||'/':
            typeof draft[key]==='string'?draft[key].trim():draft[key])));
      if(observed){
        const key=observed.origin+'\n'+observed.pathScope;
        setEditingKey(key);seed.current={...draft};ref.current.onDraftChange({...draft,returnView:editorFrom},key);
      }
      setNotice(message(observed?'reconciledSame':'rereadComplete'));
    }catch(e){setError(message('rereadFailed',{detail:readErrorDetail(e)}));}
    finally{inFlight.current=false;setBusy(false);}
  };
  const origin=draft?scrollOrigin(draft.origin):null;
  const pathScope=draft?.pathScope.trim()||'/';
  const pathValid=validScrollPath(pathScope);
  const duplicateBuiltIn=Boolean(origin&&!editingKey&&SCROLL_BUILTINS.some(x=>x.origin===origin));
  const duplicateSaved=Boolean(draft&&snapshot?.value?.sites?.some(x=>
    x.origin===origin&&x.pathScope===pathScope&&
    x.origin+'\n'+x.pathScope!==editingKey));
  const approved=Boolean(draft&&origin&&pathValid&&ref.current.isApproved(origin,pathScope));
  const needPermission=Boolean(origin&&pathValid&&!approved&&!duplicateBuiltIn&&!duplicateSaved);
  const fieldErrors=Object.fromEntries(SCROLL_CSS_FIELDS.map(([key,, ,required])=>
    [key,draft?scrollCssError(draft[key],required):'']));
  const valid=Boolean(draft&&origin&&pathValid&&!duplicateBuiltIn&&!duplicateSaved&&
    !Object.values(fieldErrors).some(Boolean));
  const persist=async(event,rule,remove=false,editKey=editingKey,returnView=editorFrom)=>{
    if(inFlight.current||loading||!snapshot||needsReconcile)return false;
    inFlight.current=true;setBusy(true);setError('');setNotice('');
    try{
      const result=await ref.current.onSave(rule,snapshot.etag,editKey,event.nativeEvent);
      if(result?.review){
        setNotice(message('installerReview'));
        return false;
      }
      if(result?.value?.version!==1||!Array.isArray(result.value.sites)||
        typeof result.etag!=='string')throw failure('invalidPersistedReadback');
      setSnapshot(result);setDraft(null);setEditingKey(null);setConfirmDelete(false);
      seed.current=null;ref.current.onDraftChange(null,null);
      returnTo(remove?'sites':returnView);setExpandedSite(null);
      setNotice(message(remove?'ruleDeleted':'ruleSaved'));
      return true;
    }catch(e){
      if(['E_CONFIG_UNKNOWN','E_CONFIG_CONFLICT'].includes(e?.code))setNeedsReconcile(true);
      setError(message('saveFailed',{code:e?.code||'E_SITE_SAVE',detail:errorDetail(e)}));
      return false;
    }finally{inFlight.current=false;setBusy(false);}
  };
  const save=event=>{
    event.preventDefault();
    if(!valid||!approved||!dirty||busy||detail?.busy)return;
    const rule={...EMPTY_SCROLL_SITE,...Object.fromEntries(
      Object.keys(EMPTY_SCROLL_SITE).map(key=>[key,
        typeof draft[key]==='string'?draft[key].trim():Boolean(draft[key])])),
      origin,pathScope};
    void persist(event,rule);
  };
  const review=async event=>{
    if(!needPermission||inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');setNotice('');
    try{
      const ok=await ref.current.onReviewSite(
        {origin,pathScope},event.nativeEvent);
      if(!ok)throw failure('reviewNotStarted');
      setNotice(message('siteReviewStarted'));
    }catch(e){setError(message('operationFailed',{code:e?.code||'E_SITE_REVIEW',detail:errorDetail(e)}));}
    finally{inFlight.current=false;setBusy(false);}
  };
  const pick=async(field,key,event)=>{
    if(inFlight.current||!draft)return;
    inFlight.current=true;setBusy(true);setError('');setNotice(message('pickInstruction'));
    try{
      const result=await ref.current.onPick(field,draft.origin,draft.mainSelector,event.nativeEvent);
      if(result?.state==='selected'&&typeof result.selector==='string'){
        update(key,result.selector);
        setNotice(message('pickSelected'));
      }else if(result?.state==='cancelled'){
        setNotice(message('pickCancelled'));
      }else throw failure(result?.state==='timeout'?'pickTimeout':'pickInvalid');
    }catch(e){setError(message('operationFailed',{code:e?.code||'E_PICK',detail:errorDetail(e)}));setNotice('');}
    finally{
      pendingFocus.current='scroll-'+key;
      inFlight.current=false;setBusy(false);
    }
  };
  const toggleNavigation=async(key,value,event)=>{
    if(inFlight.current||loading||!snapshot||needsReconcile)return;
    const navigation=Object.fromEntries(SCROLL_FLAGS.map(([name])=>
      [name,name===key?value:snapshot.value.navigation?.[name]!==false]));
    inFlight.current=true;setBusy(true);setError('');setNotice('');
    try{
      const result=await ref.current.onSaveNavigation(navigation,snapshot.etag,event.nativeEvent||event);
      setSnapshot(result);setNotice(message('navigationSaved'));
    }catch(e){
      if(['E_CONFIG_UNKNOWN','E_CONFIG_CONFLICT'].includes(e?.code))setNeedsReconcile(true);
      setError(message('operationFailed',{code:e?.code||'E_CONFIG_UNKNOWN',detail:errorDetail(e)}));
    }finally{inFlight.current=false;setBusy(false);}
  };
  const toggleRule=(site,event)=>{
    const key=site.origin+'\n'+site.pathScope;
    void persist(event,{...site,enabled:!site.enabled},false,key,view);
  };
  const getBusinessState=()=>({snapshot,draft,editingKey,busy:busy||Boolean(detail?.busy),needsReconcile});
  const businessRef=React.useRef(null);businessRef.current=getBusinessState();
  const applyAI=async(action,captured)=>{
    const now=businessRef.current;
    captured.assertCurrent();
    if(inFlight.current||now.busy||now.needsReconcile||!now.snapshot||
      now.snapshot.etag!==captured.snapshot.etag||JSON.stringify(now.draft)!==JSON.stringify(captured.draft)||
      now.editingKey!==captured.editingKey)throw Object.assign(new Error('E_CONFIG_CONFLICT'),{code:'E_CONFIG_CONFLICT'});
    inFlight.current=true;setBusy(true);setError('');setNotice('');
    try{
      const result=action.type==='navigation'
        ?await ref.current.onSaveNavigation(action.navigation,captured.snapshot.etag,captured.event,captured.authorization)
        :await ref.current.onSave(action.rule,captured.snapshot.etag,action.editKey,captured.event,captured.authorization,captured.pageObservation);
      if(result?.review){
        if(action.type==='site'){setDraft(action.rule);setEditingKey(action.editKey);setView('editor');}
        setNotice(message('installerReview'));return result;
      }
      setSnapshot(result);
      if(action.type==='site'&&draft){
        // Keep unrequested editor changes local; only the validated patch was
        // persisted. They remain dirty against the saved readback baseline.
        const nextDraft={...captured.draft,...action.patch};
        setDraft(nextDraft);seed.current={...action.rule};
        setEditingKey(action.rule.origin+'\n'+action.rule.pathScope);
        ref.current.onDraftChange({...nextDraft,returnView:editorFrom},action.rule.origin+'\n'+action.rule.pathScope);
      }
      return result;
    }catch(e){
      if(['E_CONFIG_UNKNOWN','E_CONFIG_CONFLICT'].includes(e?.code))setNeedsReconcile(true);
      throw e;
    }finally{inFlight.current=false;setBusy(false);}
  };
  const writesDisabled=busy||Boolean(detail?.busy)||loading||needsReconcile||!snapshot||Boolean(model.disabledReason);
  const builtinList=(all=false)=><ul className="ec-scroll-builtins">
    {(all?SCROLL_BUILTINS:SCROLL_BUILTINS.slice(0,2)).map(x=><li key={x.origin}>
      <span className="ec-scroll-mark" aria-hidden="true">{x.name[0]}</span>
      <div className="ec-scroll-site-copy"><strong>{x.name}</strong><span>{x.origin.replace('https://','')}</span></div>
    </li>)}
  </ul>;
  const siteList=(all=false)=>!snapshot
    ?<p className="ec-scroll-empty" role="status">{t('sitesUnread')}</p>
    :snapshot.value.sites.length
    ?<ul className="ec-scroll-saved">{snapshot.value.sites.map((site,index)=>{
      const key=site.origin+'\n'+site.pathScope,host=site.origin.replace(/^https?:\/\//,'');
      const expanded=all&&expandedSite===key;
      return <li key={key}>
        <div className="ec-scroll-site-row">
          <span className="ec-scroll-mark" aria-hidden="true">{host[0].toUpperCase()}</span>
          <div className="ec-scroll-site-copy"><strong>{host}</strong>
            <span>{site.enabled?t('ruleEnabled'):t('ruleDisabled')}{site.pathScope!=='/'&&' · '+site.pathScope}</span></div>
          <div className="ec-scroll-row-actions">
            <Button id={'scroll-edit-'+index} variant="quiet" aria-label={t('editOrigin',{origin:site.origin})}
              disabled={writesDisabled} onClick={()=>void open(site,all?'sites':'home')}>{t('editAdaptation')}</Button>
            {all&&<IconButton id={'scroll-more-'+index} label={t('moreOrigin',{origin:site.origin})}
              aria-expanded={expanded} aria-controls={'scroll-rule-actions-'+index} disabled={busy}
              onClick={()=>{setExpandedSite(expanded?null:key);setConfirmDelete(false);}}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3.5"/></svg>
            </IconButton>}
          </div>
        </div>
        {expanded&&<div id={'scroll-rule-actions-'+index} className="ec-scroll-rule-actions">
          {!confirmDelete?<>
            <Button disabled={writesDisabled} onClick={event=>toggleRule(site,event)}>{site.enabled?t('disableRule'):t('restoreRule')}</Button>
            <Button variant="danger" disabled={writesDisabled} onClick={()=>setConfirmDelete(true)}>{t('deleteRule')}</Button>
          </>:<><p>{t('deleteConfirm',{host,path:site.pathScope})}</p>
            <Button variant="danger" disabled={writesDisabled}
              onClick={event=>void persist(event,null,true,key,'sites')}>{t('confirmDelete')}</Button>
            <Button disabled={busy} onClick={()=>setConfirmDelete(false)}>{t('cancelDelete')}</Button></>}
        </div>}
      </li>;
    })}</ul>
    :<p className="ec-scroll-empty">{t('noSites')}</p>;
  return <section className="ec-scroll-site-manager" data-view={view}
    aria-label={t('managerAria')} aria-busy={loading||busy}>
    <div className="ec-scroll-content" ref={contentRef}>
    {view==='home'&&<div className="ec-scroll-home">
      {pageControl?<PageControl locale={locale} description={t('autoRunDescription')} control={pageControl} title={title} heading={t('autoRun')} compact onDetails={openManagement}/>:
        <p role="status">{t('autoRunUnconfirmed')}</p>}
      <section className="ec-scroll-group" aria-labelledby="scroll-builtins-title">
        <div className="ec-scroll-title"><h3 id="scroll-builtins-title">{t('builtinsTitle')}</h3>
          <IconButton id="scroll-builtins" label={t('viewBuiltins')} title={t('viewBuiltinsCount',{count:SCROLL_BUILTINS.length})}
            onClick={()=>navigate('builtins')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>
          </IconButton></div>
        {builtinList()}
      </section>
      <section className="ec-scroll-group" aria-labelledby="scroll-custom-title">
        <div className="ec-scroll-title"><h3 id="scroll-custom-title">{t('sitesTitle')}</h3>
          <div className="ec-scroll-title-actions">
            <IconButton id="scroll-sites" label={t('manageSites')} onClick={()=>navigate('sites')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16 11-11 4 4-11 11H4zM13 7l4 4"/></svg>
            </IconButton>
            <IconButton id="scroll-add-home" label={t('addCustomSite')} disabled={writesDisabled}
              onClick={()=>void open(null,'home')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>
            </IconButton>
          </div></div>
        {loading?<p role="status" className="ec-scroll-empty">{t('readingSites')}</p>:siteList()}
      </section>
    </div>}
    {view==='builtins'&&<div className="ec-scroll-subview">
      <h3>{t('builtinsCount',{count:SCROLL_BUILTINS.length})}</h3>
      {builtinList(true)}
      <p className="ec-scroll-help">{t('builtinsHelp')}</p>
      <Button id="scroll-add-builtin" disabled={writesDisabled} onClick={()=>void open(null,'builtins')}>{t('addOtherSite')}</Button>
    </div>}
    {view==='sites'&&<div className="ec-scroll-subview">
      <p className="ec-scroll-help">{t('sitesHelp')}</p>
      {loading?<p role="status">{t('readingSites')}</p>:siteList(true)}
    </div>}
    {view==='settings'&&<div className="ec-scroll-subview">
      {!snapshot?<p role="status">{loading?t('readingNavigation'):t('navigationUnread')}</p>:
        <div className="ec-scroll-flags">{SCROLL_FLAG_GROUPS.map(([group,flags])=><div role="group" aria-label={t(group)} key={group}>
          <h3 className="ec-scroll-flag-group">{t(group)}</h3>
          {flags.map(([key,label])=><div key={key} className="ec-scroll-flag"
            onPointerDownCapture={captureNavigation} onPointerUpCapture={captureNavigation}
            onKeyDownCapture={captureNavigation} onKeyUpCapture={captureNavigation} onClickCapture={captureNavigation}
            onBlurCapture={()=>{navigationGesture.current=null;}}><span>{t(label)}</span><Switch
              isSelected={snapshot.value.navigation?.[key]!==false} isDisabled={writesDisabled}
              aria-label={t(label)} onChange={value=>{
                const event=navigationGesture.current;navigationGesture.current=null;
                if(event?.isTrusted===true)void toggleNavigation(key,value,event);
              }}/></div>)}
        </div>)}</div>}
      <p className="ec-scroll-help">{t('navigationHelp')}</p>
      <Button id="scroll-management" variant="quiet" onClick={openManagement}>{t('managementTitle')}</Button>
    </div>}
    {view==='management'&&detail&&<div className="ec-scroll-subview ec-scroll-management">
      {pageControl&&<section className="ec-scroll-group" aria-label={t('autoRunStatus')}>
        <p className="ec-page-state" data-state={pageControl.state} role="status">{pageControl.status}</p>
        {pageControl.note&&<p>{pageControl.note}</p>}
        <div className="ec-page-control-actions">
          {pageControl.canRestore&&<Button disabled={pageControl.busy}
            onClick={event=>pageControl.onRestore?.(event.nativeEvent)}>{t('restoreAutoRun')}</Button>}
          <Button id="scroll-refresh-state" disabled={pageControl.busy}
            onClick={event=>pageControl.onRefresh?.(event.nativeEvent)}>{t('recheck')}</Button>
        </div>
      </section>}
      <p>{t('installationRevision',{installation:detail.installationText,version:detail.version})}</p>
      {pageControl?.evidenceNote&&<p>{pageControl.evidenceNote}</p>}
      {detail.pageInfo&&<div className="ec-scroll-diagnostics"><Diagnostics info={detail.pageInfo} locale={locale}/></div>}
    </div>}
    {view==='editor'&&draft&&<>
      <form id="scroll-site-form" className="ec-scroll-editor" onSubmit={save} noValidate>
      <h4>{t('siteInfo')}</h4>
      <div className="ec-scroll-field">
        <label htmlFor="scroll-origin">{t('siteAddress')}<span className="ec-scroll-required" aria-hidden="true">*</span></label>
        <div className="ec-scroll-origin">
          <input id="scroll-origin" ref={originInput} type="url" value={draft.origin}
            maxLength={256} autoComplete="off" placeholder={t('originPlaceholder')}
            aria-required="true" aria-invalid={Boolean(touched.origin&&!origin)}
            aria-describedby="scroll-origin-help scroll-origin-error" disabled={busy}
            onChange={event=>update('origin',event.target.value)}/>
          {draft.origin&&<IconButton className="ec-scroll-clear" label={t('clearAddress')} disabled={busy}
            onClick={()=>{update('origin','');originInput.current?.focus({preventScroll:true});}}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </IconButton>}
        </div>
        <p id="scroll-origin-help" className="ec-scroll-help">{t('originHelp')}</p>
        <div id="scroll-origin-error">
          {touched.origin&&!origin&&<p className="ec-scroll-error" role="alert">{t('originInvalid')}</p>}
          {duplicateBuiltIn&&<p className="ec-scroll-notice">{t('duplicateBuiltin')}</p>}
          {duplicateSaved&&<p className="ec-scroll-error" role="alert">{t('duplicateSaved')}</p>}
        </div>
      </div>
      <div className="ec-scroll-field">
        <label htmlFor="scroll-path">{t('pathLabel')}</label>
        <div className="ec-scroll-origin">
          <input id="scroll-path" ref={pathInput} type="text" value={draft.pathScope} maxLength={512}
            autoComplete="off" spellCheck={false} disabled={busy}
            aria-describedby="scroll-path-help scroll-path-error" aria-invalid={Boolean((touched.pathScope&&!pathValid)||duplicateSaved)}
            onChange={event=>update('pathScope',event.target.value)}/>
          {draft.pathScope&&<IconButton className="ec-scroll-clear" label={t('clearPath')} disabled={busy}
            onClick={()=>{update('pathScope','');pathInput.current?.focus({preventScroll:true});}}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </IconButton>}
        </div>
        <p id="scroll-path-help" className="ec-scroll-help">{t('pathHelp')}</p>
        <div id="scroll-path-error">
          {touched.pathScope&&!pathValid&&<p className="ec-scroll-error" role="alert">{t('pathInvalid')}</p>}
        </div>
      </div>
      {needPermission&&<div className="ec-scroll-permission">
        <p>{t('permissionHelp')}</p>
        <Button disabled={busy||Boolean(model.disabledReason)} onClick={event=>void review(event)}>{t('reviewPermissions')}</Button>
      </div>}
      <h4>{t('siteAdaptation')}</h4>
      {SCROLL_CSS_FIELDS.map(([key,label,field,required])=><div className="ec-scroll-field ec-scroll-css-field" key={key}>
        <label htmlFor={'scroll-'+key}>{t(label)}{required&&<span className="ec-scroll-required" aria-hidden="true">*</span>}</label>
        <div className="ec-scroll-selector"><input type="text" id={'scroll-'+key}
          ref={node=>{selectorInputs.current[key]=node;}} value={draft[key]} maxLength={256}
          aria-required={required?'true':undefined} aria-describedby={'scroll-'+key+'-error'}
          aria-invalid={Boolean(fieldErrors[key]&&touched[key])} spellCheck={false}
          autoComplete="off" disabled={busy} placeholder={t('cssPlaceholder')}
          onChange={event=>update(key,event.target.value)} onBlur={()=>setTouched(old=>({...old,[key]:true}))}/>
          <IconButton label={t('pickField',{label:t(label)})} className="ec-scroll-picker"
            disabled={busy||needsReconcile||!approved||Boolean(model.disabledReason)} onClick={event=>void pick(field,key,event)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></svg>
          </IconButton>
        </div>
        <div id={'scroll-'+key+'-error'}>{fieldErrors[key]&&touched[key]&&<p className="ec-scroll-error" role="alert">{t(fieldErrors[key])}</p>}</div>
      </div>)}
      </form>
    </>}
    {(needsReconcile||(!snapshot&&!loading))&&<Button disabled={busy} onClick={()=>void readAgain()}>{t('reread')}</Button>}
    {model.disabledReason&&<p role="status">{model.disabledReason}</p>}
    {notice&&<p role="status" className="ec-scroll-notice">{scrollNavigationMessageText(locale,notice)}</p>}
    {error&&<p role="alert" className="ec-scroll-error">{scrollNavigationMessageText(locale,error)}</p>}
    </div>
    {view==='editor'&&draft&&<div className="ec-scroll-actionbar" aria-label={t('saveActions')}>
      <span role="status" aria-live="polite">{busy?t('processing'):needsReconcile?t('writeUnconfirmed'):
        loading?t('readingConfig'):!snapshot?t('configUnread'):!valid?t('completeRequired'):
        !approved?t('permissionRequired'):!dirty?t('noUnsavedChanges'):t('readyToSave')}</span>
      <Button type="submit" form="scroll-site-form" variant="primary" className="ec-scroll-save"
        disabled={writesDisabled||!dirty||!valid||!approved}>{busy?t('checking'):editingKey?t('saveChanges'):t('saveSite')}</Button>
    </div>}
    <ScrollConfigurationChat open={aiOpen} model={model}
      getBusinessState={()=>businessRef.current} onApply={applyAI}
      onClose={()=>{setAiOpen(false);queueMicrotask(()=>document.getElementById('scroll-ai-toggle')?.focus({preventScroll:true}));}}/>
  </section>;
}

