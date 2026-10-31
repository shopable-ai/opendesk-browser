import * as React from 'react';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@opendesk/ui';
import {LocaleProvider,useI18n} from './i18n/LocaleProvider';
import QuickPanel from './QuickPanel';
import Settings from './Settings';
import {getEnvironment} from './environment';

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
function Workspace() {
 const env=getEnvironment(),{t}=useI18n();
 const [route,setRoute]=useState(()=>env.navigation.getRoute()),[dirty,setDirty]=useState(false);
 const [pendingRoute,setPendingRoute]=useState(null),[pageEpoch,setPageEpoch]=useState(0),[confirmation,setConfirmation]=useState(null);
 const [busy,setBusy]=useState(false);
 const dirtyRef=useRef(false),routeContent=useRef(null),focusAfterDiscard=useRef(false),lastRoute=useRef(route);
 function markDirty(value){dirtyRef.current=value;setDirty(value);}
 const settings=route.startsWith('#/');
 function selectView(management){env.navigation.navigate(management?'#/profiles':'');}
 useEffect(()=>{env.setConfirmHandler(text=>new Promise(resolve=>setConfirmation({text,resolve})));return()=>env.setConfirmHandler(null);},[env]);
 useEffect(()=>{const changed=event=>setBusy(event.detail.busy===true);env.events.addEventListener('ai-proxy-operation',changed);return()=>env.events.removeEventListener('ai-proxy-operation',changed);},[env]);
 useEffect(()=>{
  env.navigation.setGuard(next=>{if(dirtyRef.current){setPendingRoute(next);return false;}return true;});
  const change=()=>setRoute(env.navigation.getRoute());
  const unsubscribe=env.navigation.subscribe(change);
  change();markDirty(env.hasDrafts());
  const draft=event=>markDirty(event.detail===true);
  env.events.addEventListener('ai-proxy-draft',draft);
  return()=>{env.navigation.setGuard(null);unsubscribe();env.events.removeEventListener('ai-proxy-draft',draft);};
 },[env]);
 useEffect(()=>{
  if(focusAfterDiscard.current||lastRoute.current!==route){
   focusAfterDiscard.current=false;
   // Settings tabs retain their own focus; a changed page tree restores focus
   // inside the new view instead of leaving it on the document body.
   if(!document.activeElement?.closest?.('.proxy-view-tabs')&&!routeContent.current?.contains(document.activeElement))routeContent.current?.focus();
  }
  lastRoute.current=route;
 },[route,pageEpoch]);
 useEffect(()=>{env.setState({dirty,busy:false});},[dirty,env]);
 function leaveDraft(confirmed) {
  const next=pendingRoute;setPendingRoute(null);
  if(!confirmed||next===null)return;
  if(!env.navigation.navigate(next,{force:true}))return;
  env.clearDrafts();markDirty(false);focusAfterDiscard.current=true;setPageEpoch(value=>value+1);
  env.setState({dirty:false,busy:false});
 }
 return <div className="proxy-app" id="proxy-ready" data-ready="true"
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
  <div className="proxy-view-tabs" role="tablist" aria-label={t('apWorkspaceViews')}
   onKeyDown={event=>{
    if(busy||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    const management=event.key==='Home'?false:event.key==='End'?true:!settings;
    event.currentTarget.querySelectorAll('[role="tab"]')[management?1:0]?.focus();selectView(management);
   }}>
   <Button id="proxy-view-panel" role="tab" disabled={busy} aria-selected={!settings} aria-controls="proxy-workspace-panel" tabIndex={settings?-1:0} onClick={()=>selectView(false)}>{t('apProxyPanel')}</Button>
   <Button id="proxy-view-settings" role="tab" disabled={busy} aria-selected={settings} aria-controls="proxy-workspace-panel" tabIndex={settings?0:-1} onClick={()=>selectView(true)}>{t('apManageSettings')}</Button>
  </div>
  <div id="proxy-workspace-panel" role="tabpanel" aria-labelledby={settings?'proxy-view-settings':'proxy-view-panel'} className="proxy-route" ref={routeContent} tabIndex={-1} key={(settings?'settings':'quick')+pageEpoch}>{settings?<Settings/>:<QuickPanel/>}</div>
  {confirmation&&<Confirmation title={t('apConfirm')} text={confirmation.text} accept={t('apConfirm')} cancel={t('cancel')} onDone={ok=>{confirmation.resolve(ok);setConfirmation(null);}}/>}
  {pendingRoute!==null&&<Confirmation id="proxy-draft" title={t('apUnsaved')} text={t('apDiscardHelp')} cancel={t('apKeepEditing')} accept={t('apDiscardLeave')} onDone={leaveDraft}/>}
 </div>;
}
export default function App(){return <LocaleProvider><Workspace/></LocaleProvider>;}
