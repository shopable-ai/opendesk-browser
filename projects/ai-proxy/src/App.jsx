import * as React from 'react';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@opendesk/ui';
import {LocaleProvider,useI18n} from './i18n/LocaleProvider';
import QuickPanel from './QuickPanel';
import Settings from './Settings';
import {getEnvironment} from './environment';
import {DEFAULT_HEADER_ACTIONS} from './domain/header-actions';

// The existing opaque sandbox forbids native form navigation. Keep the original
// React submit handlers and validation, without requesting allow-forms/network.
function submitLocally(event,button) {
 const form=button?.form;
 if(event.defaultPrevented||!form||button.disabled)return;
 event.preventDefault();
 if(form.reportValidity())form.dispatchEvent(new SubmitEvent('submit',{
  bubbles:true,cancelable:true,submitter:button
 }));
}

function Confirmation({title,text,accept,cancel,onDone,id='proxy-confirm'}) {
 const dialog=useRef(null),origin=useRef(document.activeElement);
 useEffect(()=>{dialog.current.showModal();return()=>queueMicrotask(()=>origin.current?.focus());},[]);
 return <dialog ref={dialog} className="proxy-confirm-dialog" aria-labelledby={id+'-title'} onCancel={event=>{event.preventDefault();onDone(false);}}>
  <h2 id={id+'-title'}>{title}</h2><p>{text}</p>
  <div className="actions"><Button id={id+'-cancel'} autoFocus onClick={()=>onDone(false)}>{cancel}</Button><Button id={id+'-accept'} variant="primary" onClick={()=>onDone(true)}>{accept}</Button></div>
 </dialog>;
}
function Workspace({surface}) {
 const env=getEnvironment(),{t}=useI18n();
 const [route,setRoute]=useState(()=>env.navigation.getRoute()),[dirty,setDirty]=useState(false);
 const [pendingRoute,setPendingRoute]=useState(null),[pageEpoch,setPageEpoch]=useState(0),[confirmation,setConfirmation]=useState(null);
 const [busy,setBusy]=useState(false);
 const [headerNavigation,setHeaderNavigation]=useState(false);
 const [headerActionIds,setHeaderActionIds]=useState([...DEFAULT_HEADER_ACTIONS]);
 const [navigationError,setNavigationError]=useState(null);
 const dirtyRef=useRef(false),busyRef=useRef(false),routeContent=useRef(null),focusAfterDiscard=useRef(false),lastRoute=useRef(route);
 const navigationEpoch=useRef(0);
 // Shared Service changes refresh Header preferences in this surface as well.
 useEffect(()=>{
  let alive=true;
  const accept=state=>{
   if(!alive||!state?.config)return;
   const actions=state.config.headerActions??DEFAULT_HEADER_ACTIONS;
   setHeaderActionIds(previous=>JSON.stringify(previous)===JSON.stringify(actions)?previous:[...actions]);
  };
  const off=env.service.subscribe(accept);
  void env.request({type:'GET_STATE'}).then(result=>{if(result?.ok)accept(result.state);}).catch(()=>{});
  return()=>{alive=false;off?.();};
 },[env]);
 function markDirty(value){dirtyRef.current=value;setDirty(value);}
 const settings=surface==='management'||route.startsWith('#/');
 const headerPage=useRef({route:null,revision:0,page:'home'});
 if(headerPage.current.route!==route)headerPage.current={route,revision:headerPage.current.revision+1,
  page:route?'settings-'+(headerPage.current.revision+1):'home'};
 useEffect(()=>{env.setConfirmHandler(text=>new Promise(resolve=>setConfirmation({text,resolve})));return()=>env.setConfirmHandler(null);},[env]);
 useEffect(()=>{const changed=event=>{busyRef.current=event.detail.busy===true;setBusy(busyRef.current);};env.events.addEventListener('ai-proxy-operation',changed);return()=>env.events.removeEventListener('ai-proxy-operation',changed);},[env]);
 useEffect(()=>{
  env.navigation.setGuard(next=>{if(busyRef.current)return false;if(dirtyRef.current){setPendingRoute(next);return false;}return true;});
  const change=()=>{navigationEpoch.current++;setRoute(env.navigation.getRoute());setNavigationError(null);};
  const unsubscribe=env.navigation.subscribe(change);
  change();markDirty(env.hasDrafts());
  const draft=event=>markDirty(event.detail===true);
  env.events.addEventListener('ai-proxy-draft',draft);
  return()=>{navigationEpoch.current++;env.navigation.setGuard(null);unsubscribe();env.events.removeEventListener('ai-proxy-draft',draft);};
 },[env]);
 useEffect(()=>{
  if(focusAfterDiscard.current||lastRoute.current!==route){
   focusAfterDiscard.current=false;
   // Keep the restored trigger's focus; otherwise focus the new route region.
   if(!routeContent.current?.contains(document.activeElement))routeContent.current?.focus();
  }
  lastRoute.current=route;
 },[route,pageEpoch]);
 useEffect(()=>{env.setState({dirty,busy:false});},[dirty,env]);
 // Publish only route metadata; Header actions enter existing editors, never apply.
 useEffect(()=>{
  if(surface==='management'||!env.toolNavigation)return;
  const page=headerPage.current.page;
  const catalog=[
   {id:'add-proxy',label:t('addProxy'),icon:'new',route:'#/profiles/add'},
   {id:'diagnostics',label:t('networkDiagnostics2'),icon:'diagnostics',route:'#/diagnostic',section:'diagnostic'},
   {id:'subscriptions',label:t('subscriptionSources'),icon:'subscriptions',route:'#/subscriptions',section:'subscriptions'},
   {id:'settings',label:t('apManageSettings'),icon:'settings',route:'#/profiles',section:'profiles'}
  ];
  // Public Header owns rendering; this saved whitelist only selects links.
  const actions=headerActionIds.map(id=>catalog.find(action=>action.id===id)).filter(Boolean);
  const base={page,title:t(settings?'apManageSettings':'apProxyPanel'),canBack:settings,primary:null};
  const disabled=dirty||busy||Boolean(confirmation)||pendingRoute!==null||env.toolNavigation.isLocked();
  const enhanced=env.toolNavigation.setNavigation(base,actions.map(({route:target,section,...action})=>({
   ...action,...(disabled?{disabledReason:t('apKeepEditing')}:{})
  })));
  setHeaderNavigation(enhanced);
  return env.toolNavigation.subscribe(async detail=>{
   if(busyRef.current||confirmation||pendingRoute!==null)return;
   if(detail?.action==='back'&&settings){env.navigation.navigate('');return;}
   if(!enhanced||detail?.action!=='header'||detail.page!==page||env.navigation.getRoute()!==route||
    dirtyRef.current||env.toolNavigation.isLocked())return;
   const action=actions.find(item=>item.id===detail.actionId);
   if(!action)return;
   setNavigationError(null);
   const openingEpoch=navigationEpoch.current;
   try{
    // Sandbox Header notifications are asynchronous CustomEvents, not native
    // clicks. Keep their internal routes; direct content buttons own PC opens.
    if(action.section&&env.surface==='sidebar'&&env.trusted===true){
     const opening=env.openOwnPage?.({view:'settings',section:action.section});
     if(opening!=null){await opening;return;}
    }
    env.navigation.navigate(action.route);
   }catch(error){
    // A failed/unknown opening is not permission to replay or navigate elsewhere.
    if(navigationEpoch.current!==openingEpoch||env.navigation.getRoute()!==route||headerPage.current.page!==page)return;
    setNavigationError(error?.code==='E_OUTCOME_UNKNOWN'?'apOwnPageOutcomeUnknown':'couldNotOpenTheSettingsTabOpenItFrom');
   }
  });
 },[env,surface,route,settings,dirty,busy,confirmation,pendingRoute,t,headerActionIds]);
 function leaveDraft(confirmed) {
  const next=pendingRoute;setPendingRoute(null);
  if(!confirmed||next===null)return;
  if(!env.navigation.navigate(next,{force:true}))return;
  env.clearDrafts();markDirty(false);focusAfterDiscard.current=true;setPageEpoch(value=>value+1);
  env.setState({dirty:false,busy:false});
 }
 return <div className={'proxy-app'+(surface==='management'?' proxy-management':'')} id="proxy-ready" data-ready="true" data-surface={surface}
 onFocusCapture={event=>env.captureDraftFrom(event.target)}
 onClick={event=>submitLocally(event,event.target.closest('button[type="submit"]'))}
 onKeyDown={event=>{
  const input=event.target;
  if(event.key==='Enter'&&!event.nativeEvent.isComposing&&!event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&
   input.tagName==='INPUT'&&['text','number','password','url','search','email','tel'].includes(input.type))
   submitLocally(event,input.form?.querySelector('button[type="submit"]:not(:disabled)'));
 }} onChange={event=>{
  // Bubble after the field's own controlled update. Capture can restore its old value.
  env.markDraftFrom(event.target);
 }}>
  <div id="proxy-workspace-panel" role="region" aria-label={t(settings?'apManageSettings':'apProxyPanel')} className="proxy-route" ref={routeContent} tabIndex={-1} key={(settings?'settings':'quick')+pageEpoch}>{settings?<Settings presentation={surface==='management'?'management':'sidebar'} onClose={()=>env.navigation.navigate('')} navigationBusy={busy} headerNavigation={headerNavigation}/>:<QuickPanel/>}</div>
  {navigationError&&<p className="notice error" role="alert">{t(navigationError)}</p>}
  {confirmation&&<Confirmation title={t('apConfirm')} text={confirmation.text} accept={t('apConfirm')} cancel={t('cancel')} onDone={ok=>{confirmation.resolve(ok);setConfirmation(null);}}/>}
  {pendingRoute!==null&&<Confirmation id="proxy-draft" title={t('apUnsaved')} text={t('apDiscardHelp')} cancel={t('apKeepEditing')} accept={t('apDiscardLeave')} onDone={leaveDraft}/>}
 </div>;
}
export default function App({surface='side-panel'}={}){return <LocaleProvider><Workspace surface={surface}/></LocaleProvider>;}
