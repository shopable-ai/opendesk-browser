import * as React from 'react';
import {useEffect, useRef, useState} from 'react';
import {Button} from '@opendesk/ui';
import {getEnvironment} from '../environment';
import {useI18n} from '../i18n/LocaleProvider';
import type {ProxyEndpoint, ProxyScheme} from '../domain/types';
import {isValidProxyPort, parseProxyAddressPaste} from '../domain/proxy-entry';
import {useProxy} from './useProxy';
import {FormField} from './FormField';
import {ClearableInput} from './ProxyEntry';
import {ProxyIcon} from './ProxyIcon';

export type ProxyEditorProps = {
  endpoint?: ProxyEndpoint;
  openingEtag: string;
  onClose: (saved: boolean) => void;
};
const emptyEndpoint = {name:'', scheme:'http' as ProxyScheme,host:'',port:''};

/** Mount only while open; unmount before opening another endpoint. Saving never selects or applies. */
export function ProxyEditor({endpoint, openingEtag, onClose}: ProxyEditorProps) {
  const {t, locale}=useI18n();
  const {state, busy, error, setError, setErrorKey, act}=useProxy();
  const [environment]=useState(getEnvironment);
  const [draftEtag]=useState(openingEtag);
  const editingId=endpoint?.id??'';
  const endpoints:ProxyEndpoint[]=state?.config.endpoints??[];
  const [proxy,setProxy]=useState(()=>endpoint?{
    name:endpoint.name,scheme:endpoint.scheme,host:endpoint.host,port:String(endpoint.port)
  }:emptyEndpoint);
  // Session credentials are never exposed from an existing endpoint.
  const [username,setUsername]=useState(''),[password,setPassword]=useState('');
  const [addressPasteError,setAddressPasteError]=useState(false);
  const editorDialog=useRef<HTMLDialogElement>(null);
  const editorGeneration=useRef(0),editorSuspended=useRef(false);
  const mounted=useRef(false),closed=useRef(false),saving=useRef(false);
  const draftId=useRef('');
  const [submitting,setSubmitting]=useState(false);
  const inputLocked=busy || submitting;
  const confirmationRequest=useRef<AbortController|null>(null);
  const latestEtag=useRef(state?.configEtag);
  latestEtag.current=state?.configEtag;
  const [returnFocus]=useState(()=>document.activeElement as HTMLElement|null);
  useEffect(()=>{
    mounted.current=true;
    const dialog=editorDialog.current;
    // The parent's endpoint and ETag are one snapshot. A later GET_STATE must
    // never rebase these existing inputs onto newer storage.
    if(draftEtag)environment.beginDraft('settings-proxy',draftEtag);
    if(dialog && !dialog.open){dialog.showModal();dialog.querySelector<HTMLInputElement>('#ep-name')?.focus();}
    return()=>{
      mounted.current=false;
      editorGeneration.current++;
      confirmationRequest.current?.abort();
      if(getEnvironment()===environment)environment.setDraftDirty(false,'settings-proxy');
      const focus=document.activeElement;
      dialog?.close();
      // Do not steal focus from another editor/confirmation opened by the caller.
      if(returnFocus?.isConnected && (!focus || focus===document.body || dialog?.contains(focus)))returnFocus.focus();
    };
  },[environment]);
  async function confirmIntent(text:string) {
    if(confirmationRequest.current||!mounted.current)return false;
    const controller=new AbortController();confirmationRequest.current=controller;
    const environment=getEnvironment(),draftVersion=environment.getDraftVersion?.();
    const etag=latestEtag.current,generation=editorGeneration.current;
    const dialog=editorDialog.current,focus=document.activeElement as HTMLElement|null;
    const suspended=Boolean(dialog?.open);
    if(suspended){editorSuspended.current=true;dialog!.close();}
    let approved=false;
    try {
      const accepted=await environment.confirm(text,{signal:controller.signal});
      approved=accepted===true&&mounted.current&&!controller.signal.aborted&&
        getEnvironment()===environment&&generation===editorGeneration.current&&etag===latestEtag.current&&draftVersion===environment.getDraftVersion?.();
      return approved;
    } catch { return false; }
    finally {
      if(confirmationRequest.current===controller)confirmationRequest.current=null;
      if(suspended&&mounted.current&&generation===editorGeneration.current){
        if(dialog?.isConnected&&!dialog.open){try{dialog.showModal();if(focus?.isConnected)focus.focus();}catch{/* Detached dialogs cannot be restored. */}}
        // Keep the flag through queued native close events; onClose also checks open.
        editorSuspended.current=false;
      }
    }
  }
  function closeEditor(saved=false) {
    if(closed.current || !mounted.current)return;
    closed.current=true;
    editorGeneration.current++;
    confirmationRequest.current?.abort();
    editorDialog.current?.close();
    onClose(saved);
  }
  async function requestCloseEditor() {
    if (busy || saving.current || closed.current || !mounted.current || getEnvironment()!==environment) return;
    const revision = environment.getDraftRevision('settings-proxy');
    const generation=editorGeneration.current;
    try {
      if (environment.isDraftDirty('settings-proxy') &&
        !await confirmIntent(t('apDiscardProxyDraft'))) return;
      if (!mounted.current || getEnvironment()!==environment || generation!==editorGeneration.current ||
        !environment.setDraftDirty(false,'settings-proxy',revision)) return;
      closeEditor(false);
    } catch (error) {
      if(mounted.current && generation===editorGeneration.current)setError(error instanceof Error?error.message:String(error));
    }
  }
  function handleProxyPaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData('text').trim();
    if (!text.includes(':')) return;
    const parsed = parseProxyAddressPaste(text);
    if (parsed) {
      event.preventDefault();
      getEnvironment().setDraftDirty(true,'settings-proxy');
      setProxy(previous => ({...previous,...parsed}));
      setAddressPasteError(false);
    } else if (text.includes('://') || /^\[/.test(text) || /:\d/.test(text)) {
      event.preventDefault();
      setAddressPasteError(true);
    }
  }
  async function saveProxy(event: React.FormEvent) {
    event.preventDefault();
    if (busy || saving.current || confirmationRequest.current || closed.current || !mounted.current || !state || getEnvironment()!==environment) return;
    const generation=editorGeneration.current;
    saving.current=true;
    setSubmitting(true);
    try {
      if(!draftEtag){setErrorKey('apConfigConflict');return;}
      const draftRevision=getEnvironment().getDraftRevision('settings-proxy');
      if ((username && !password) || (!username && password)) {
        setErrorKey('enterBothAUsernameAndPasswordTheProxyWas');
        return;
      }
      if ((proxy.scheme === 'socks4' || proxy.scheme === 'socks5') && (username || password)) {
        setErrorKey('chromeDoesNotSupportSocksUsernamePasswordAuthenticationHere');
        return;
      }
      const existing = endpoints.find(p => p.id === editingId);
      // SET_CREDENTIAL is not wired. Reject before any write rather than leave
      // a saved endpoint pointing at credentials that were never stored.
      if (username || password || endpoint?.credentialRef || existing?.credentialRef) {
        setError({
          'zh-CN': '代理认证尚未接入，代理未保存。全部输入已保留。',
          'zh-TW': '代理認證尚未接入，代理未儲存。全部輸入已保留。',
          en: 'Proxy authentication is not connected yet. The proxy was not saved. All inputs have been kept.'
        }[locale]);
        return;
      }
      if (!isValidProxyPort(proxy.port)) { setErrorKey('errInvalidPort'); return; }
      const displayName = proxy.name.trim() || (proxy.scheme.toUpperCase() + ' · ' + proxy.host.trim() + ':' + proxy.port);
      const id = editingId || (draftId.current ||= crypto.randomUUID());
      const result = await act({type:'SAVE_ENDPOINT', draftScope:'settings-proxy', createProfile:!existing, endpoint:{
        id,name:displayName,scheme:proxy.scheme,host:proxy.host,port:Number(proxy.port),
        sourceId:'manual'
      }});
      if (!result || !mounted.current || generation!==editorGeneration.current || getEnvironment()!==environment) return;
      if(!getEnvironment().setDraftDirty(false,'settings-proxy',draftRevision))return;
      closeEditor(true);
    } catch (error) {
      if(mounted.current && generation===editorGeneration.current)setError(error instanceof Error?error.message:String(error));
    } finally {
      saving.current=false;
      if(mounted.current && generation===editorGeneration.current)setSubmitting(false);
    }
  }
  // One form and reading order for PC and Side Panel; one business state.
  const proxyNameControl = (
    <FormField id="ep-name" className="proxyNameField" label={t('proxyConfigName')}>
          {controlProps=><ClearableInput {...controlProps} disabled={inputLocked} autoFocus fieldLabel={t('name')} maxLength={80} value={proxy.name}
             onValueChange={name=>setProxy({...proxy,name})} placeholder={t('eGMyLocalProxy')}/>}</FormField>
  );
  const proxySchemeControl = (
    <div className="proxySchemeField"><label htmlFor="ep-scheme">{t('protocol')}</label>
            <select id="ep-scheme" disabled={inputLocked} value={proxy.scheme}
              onChange={e=>{
                const scheme=e.target.value as ProxyScheme;
                setProxy({...proxy,scheme});
              }}>
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
              <option value="socks4">SOCKS4</option>
              <option value="socks5">SOCKS5</option>
            </select></div>
  );
  const proxyHostControl = (
    <div className="proxyHostField"><label htmlFor="ep-host">{t('proxyServerAddress')}</label>
            <ClearableInput id="ep-host" disabled={inputLocked} required fieldLabel={t('host')} value={proxy.host}
               aria-describedby={addressPasteError?'ep-host-error':undefined}
               onValueChange={host=>{setProxy({...proxy,host});setAddressPasteError(false);}}
               onPaste={handleProxyPaste} placeholder={t('127001OrProxyExampleCom')}/>
             {addressPasteError&&<small id="ep-host-error" className="proxyEntryError" role="alert">{t('proxyPasteUnsupported')}</small>}
           </div>
  );
  const proxyPortControl = (
    <div className="proxyPortField"><label htmlFor="ep-port">{t('port')}</label>
            <ClearableInput id="ep-port" disabled={inputLocked} type="number" min={1} max={65535} required fieldLabel={t('port')}
               aria-invalid={proxy.port!==''&&!isValidProxyPort(proxy.port)}
               aria-describedby={proxy.port!==''&&!isValidProxyPort(proxy.port)?'ep-port-error':undefined}
               value={proxy.port} onValueChange={port=>setProxy({...proxy,port})} placeholder="7890"/>
             {proxy.port!==''&&!isValidProxyPort(proxy.port)&&<small id="ep-port-error" className="proxyEntryError" role="alert">{t('errInvalidPort')}</small>}
           </div>
  );

  return (
    <dialog className="proxyEditorDialog" ref={editorDialog}
      aria-labelledby="proxy-editor-title"
      onKeyDown={event=>{
        if(event.key!=='Tab')return;
        const controls=[...event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'
        )].filter(control=>control.getClientRects().length>0);
        const first=controls[0],last=controls[controls.length-1];
        if(!first){event.preventDefault();return;}
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }}
      onCancel={e=>{e.preventDefault();void requestCloseEditor();}}
      onClose={event=>{
        // A queued close event from the previous opening must not dismiss a
        // dialog that the user has already reopened.
        if (event.currentTarget.open||editorSuspended.current) return;
        if(closed.current || !mounted.current)return;
        // A programmatic/native close must use the same draft guard as Escape.
        try { event.currentTarget.showModal(); } catch { return; }
        void requestCloseEditor();
      }}>
      <form onSubmit={e=>void saveProxy(e)} data-draft-scope="settings-proxy" className="proxyEditorForm">
        <header className="editorHead"><div><p className="eyebrow">{t('localProxyConfiguration')}</p>
          <h2 id="proxy-editor-title">{editingId?t('editProxy'):t('addProxy')}</h2></div>
          <Button type="button" className="proxyIconButton" disabled={inputLocked} onClick={()=>void requestCloseEditor()} title={t('closeProxyEditor')} aria-label={t('closeProxyEditor')}><ProxyIcon name="close"/></Button>
        </header>
        <div className="proxyEditorFields">
        {proxyNameControl}
        <div className="proxyPrimaryFields">
          {proxySchemeControl}{proxyHostControl}{proxyPortControl}
        </div>
        <div className="proxyAuthFields">
          <div><label htmlFor="ep-username">{t('proxyUsernameOptional')}</label>
            <ClearableInput id="ep-username" disabled={inputLocked} autoComplete="off" fieldLabel={t('proxyUsernameOptional')} value={username}
              onValueChange={setUsername}/></div>
          <div><label htmlFor="ep-password">{t('sessionPasswordNotBackedUp')}</label>
            <ClearableInput id="ep-password" disabled={inputLocked} type="password" revealPassword autoComplete="new-password" fieldLabel={t('sessionPasswordNotBackedUp')} value={password}
              onValueChange={setPassword}/></div>
        </div>
        {error&&<p className="notice error" role="alert">{error}</p>}
        </div>
        <footer className="editorActions">
          <p className="hint proxyAuthHelp">{t('proxyEditorAuthHelp')}</p>
          <Button type="button" disabled={inputLocked} onClick={()=>void requestCloseEditor()}>{t('cancel')}</Button>
          <Button variant="primary" className="primary" disabled={inputLocked || !state} type="submit">{t('proxyEditorSave')}</Button>
        </footer>
      </form>
    </dialog>
  );
}
