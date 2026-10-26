import * as React from 'react';
import {createPortal} from 'react-dom';
import {IconButton} from './ui/button.tsx';
import {Switch} from './ui/switch.tsx';
import {inferHttpsSource,isHttpsSource,httpsSourceConfigurationError} from '../../ai/provider-https-source.js';

function focusableElements(panel){
 return [...panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
  .filter(item=>item.tabIndex>=0&&item.getAttribute('aria-hidden')!=='true'&&
   !item.closest('[hidden],[inert]')&&item.getClientRects().length>0);
}
const EMPTY_SETTINGS=Object.freeze({source:'local_codex',endpoint:'',model:'',hasApiKey:false,generation:0});
const noSubscribe=()=>()=>{};

function NativeConnectionCard({nativeConnection,onOpenNativeSettings,doc}){
 const [status,setStatus]=React.useState(null);
 const [loading,setLoading]=React.useState(Boolean(nativeConnection?.readStatus));
 const [busy,setBusy]=React.useState(false);
 const [error,setError]=React.useState('');
 const generation=React.useRef(0);
 const polls=React.useRef(0);
 const refresh=React.useCallback(async()=>{
  if(!nativeConnection?.readStatus)return null;
  const ticket=++generation.current;
  try{
   const next=await nativeConnection.readStatus();
   if(ticket===generation.current){setStatus(next);setLoading(false);setError('');}
   return next;
  }catch(ex){
   if(ticket===generation.current){
    setStatus(null);setLoading(false);
    setError('连接状态读取失败：'+String(ex?.message||ex));
   }
   return null;
  }
 },[nativeConnection]);
 React.useEffect(()=>{
  polls.current=0;
  void refresh();
  const onReturn=()=>{if(doc?.hidden)return;polls.current=0;void refresh();};
  const view=doc?.defaultView;
  view?.addEventListener('focus',onReturn);
  doc?.addEventListener('visibilitychange',onReturn);
  return ()=>{
   generation.current++;
   view?.removeEventListener('focus',onReturn);
   doc?.removeEventListener('visibilitychange',onReturn);
  };
 },[doc,refresh]);
 React.useEffect(()=>{
  if(!status?.connecting||busy||polls.current>=6)return;
  const timer=setTimeout(()=>{polls.current++;void refresh();},650);
  return ()=>clearTimeout(timer);
 },[status,busy,refresh]);
 const change=async selected=>{
  if(busy||loading||!status||!nativeConnection?.setEnabled)return;
  generation.current++;setBusy(true);setError('');
  try{
   // This call starts Chrome's optional permission prompt in the Switch gesture.
   await nativeConnection.setEnabled(selected);
   polls.current=0;
   await refresh();
  }catch(ex){
   await refresh();
   setError('本机连接未完成：'+String(ex?.message||ex));
  }finally{setBusy(false);}
 };
 const lastSeen=Number.isSafeInteger(status?.lastConnectedAt)&&status.lastConnectedAt>0
  ?new Date(status.lastConnectedAt).toLocaleString('zh-CN',{dateStyle:'short',timeStyle:'short'}):null;
 const title=!nativeConnection?.readStatus?'状态不可用':loading?'正在检测':
  !status?'无法确认':!status.enabled?'未启用':status.nativeConnected?'已连接':
  status.requiresReload?'需要重载':status.connecting?'正在连接':'已启用 · 当前离线';
 const hint=!nativeConnection?.readStatus?'请打开本机设置检查连接。':
  !status?'无法读取真实连接状态；没有自动重新授权。':
  !status.enabled?(lastSeen?'上次成功连接：'+lastSeen+'。目前连接已关闭。':'启用时才会申请本机连接权限。'):
  status.nativeConnected?'OpenDesk 已在线；Codex 能力在发送时再次核验。':
  status.requiresReload?'浏览器需要重新加载扩展，开关已保持启用。':
  status.connecting?'正在等待 OpenDesk 握手，请勿重复设置。':
  (lastSeen?'上次成功连接：'+lastSeen+'。当前离线，':'已保存启用设置，但当前未连接，')+'请检查本机程序是否运行。';
 return <div className="od-shared-provider-local-card">
  <div className="od-shared-provider-local-main">
   <div className="od-shared-provider-native-state">
    <strong>OpenDesk 本机连接</strong>
    <small role="status" aria-live="polite" data-state={status?.nativeConnected?'connected':
      status?.enabled?'enabled':'off'}>{title}</small>
   </div>
   {nativeConnection?.setEnabled&&
    <Switch aria-label="启用 OpenDesk 本机连接" isSelected={Boolean(status?.enabled)}
     isDisabled={busy||loading||!status} onChange={value=>{void change(value);}}/>}
  </div>
  <p className="od-shared-provider-native-hint">{hint}</p>
  <div className="od-shared-provider-local-footer">
   {nativeConnection?.readStatus&&
    <button type="button" className="od-button od-button--secondary"
     disabled={busy} onClick={()=>{polls.current=0;setError('');void refresh();}}>
     重新检测
    </button>}
   {onOpenNativeSettings&&
    <button type="button" className="od-button od-button--secondary"
     onClick={event=>{
      if(!event.nativeEvent?.isTrusted)return;
      try{void Promise.resolve(onOpenNativeSettings()).catch(ex=>
       setError('无法打开高级设置：'+String(ex?.message||ex)));}
      catch(ex){setError('无法打开高级设置：'+String(ex?.message||ex));}
     }}>高级设置</button>}
  </div>
  {error&&<p className="od-conversation-error" role="alert">{error}</p>}
  <p className="od-shared-provider-native-note">连接开关即时生效；下方保存按钮只保存 AI 来源。</p>
 </div>;
}

// ToolShell owns the sole Runtime; this is a presentational settings client,
// rendered as a Portal of the existing trusted React root, never a second root.
export function SharedProviderSettingsSheet({
 open=false,onClose,doc=globalThis.document,providerSettings=null,
 onOpenNativeSettings=null,nativeConnection=null,children
}){
 const panel=React.useRef(null);
 const snapshot=React.useSyncExternalStore(providerSettings?.subscribeSettings??noSubscribe,
  providerSettings?.settingsSnapshot??(()=>EMPTY_SETTINGS),
  providerSettings?.settingsSnapshot??(()=>EMPTY_SETTINGS));
 const [mode,setMode]=React.useState(snapshot.source==='local_codex'?'local_codex':'https');
 const [protocolOverride,setProtocolOverride]=React.useState<{endpoint:string;source:string}|null>(null);
 const [endpoint,setEndpoint]=React.useState(snapshot.endpoint);
 const [model,setModel]=React.useState(snapshot.model);
 const [keyDraft,setKeyDraft]=React.useState('');
 const [keyVisible,setKeyVisible]=React.useState(false);
 const [clearKey,setClearKey]=React.useState(false);
 const [error,setError]=React.useState('');
 React.useEffect(()=>{
  if(open){
   setMode(snapshot.source==='local_codex'?'local_codex':'https');
   setEndpoint(snapshot.endpoint);setModel(snapshot.model);setProtocolOverride(null);
   setKeyDraft('');setKeyVisible(false);setClearKey(false);setError('');
  }else{
   setKeyDraft('');setKeyVisible(false);setClearKey(false);
  }
 },[open,snapshot.generation]);
 const external=mode==='https';
 const endpointValue=endpoint.trim();
 const inferredSource=inferHttpsSource(endpointValue);
 // Reuse the exact configured protocol for a legacy nonstandard endpoint.
 // A new unknown endpoint instead needs an explicit advanced choice.
 const retainedSource=isHttpsSource(snapshot.source)?snapshot.source:snapshot.httpsSource;
 const savedSource=isHttpsSource(retainedSource)&&
   endpointValue===String(snapshot.endpoint||'').trim()?retainedSource:null;
 const selectedHttpsSource=
   (protocolOverride?.endpoint===endpointValue?protocolOverride.source:null)||
   savedSource||inferredSource;
 const protocolError=httpsSourceConfigurationError(selectedHttpsSource||'custom_https',endpointValue);
 const save=event=>{
  event.preventDefault();
  if(!event.nativeEvent?.isTrusted||!providerSettings)return;
  try {
   if(external){
    if(protocolError)throw new Error(protocolError);
    if(!model.trim())throw new Error('请输入模型 ID');
    if(!selectedHttpsSource)
     throw new Error('接口路径无法识别协议，请在高级配置中选择 Chat Completions 或 Responses');
   }
   const providerSource=external?selectedHttpsSource:'local_codex';
   if(!providerSource)throw new Error('请选择 HTTPS 协议');
   const patch:{source:string;endpoint:string;model:string;apiKey?:string}={
    source:providerSource,endpoint:endpointValue,model:model.trim()};
   // Hidden HTTPS secret controls must never mutate the retained session key.
   if(external&&clearKey)patch.apiKey='';
   else if(external&&keyDraft)patch.apiKey=keyDraft;
   providerSettings.updateSettings(patch);
   setKeyDraft('');onClose?.();
  }catch(ex){setError(String(ex?.message||'设置未保存'));}
 };
 React.useLayoutEffect(()=>{
  if(!open||!panel.current||!doc)return;
  const current=panel.current,restore=doc.activeElement;
  const root=doc.getElementById('opendesk-react-app'),wasInert=root?.inert;
  if(root)root.inert=true;
  const onKeydown=event=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose?.();return;}
   if(event.key!=='Tab')return;
   const elements=focusableElements(current),first=elements[0],last=elements.at(-1);
   if(!first){event.preventDefault();current.focus();return;}
   if(!current.contains(doc.activeElement)||(event.shiftKey&&doc.activeElement===first)){
    event.preventDefault();(event.shiftKey?last:first).focus();
   }else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}
  };
  doc.addEventListener('keydown',onKeydown,true);
  // Native segmented radios retain arrow-key semantics and visible focus in the styled label.
  (current.querySelector('input[name="od-ai-provider-source"]:checked')||current).focus({preventScroll:true});
  return ()=>{
   doc.removeEventListener('keydown',onKeydown,true);
   if(root)root.inert=wasInert;
   if(restore?.isConnected&&(current.contains(doc.activeElement)||doc.activeElement===doc.body))
    restore.focus?.({preventScroll:true});
  };
 },[open,onClose,doc]);
 if(!open||!doc?.body)return null;
 return createPortal(<div className="workflow-sheet-overlay">
  <div className="workflow-sheet-backdrop" aria-hidden="true" onClick={()=>onClose?.()}/>
  <section className="workflow-sheet-panel od-shared-provider-sheet" role="dialog" aria-modal="true"
   aria-labelledby="workflow-sheet-title" ref={panel} tabIndex={-1}>
   <div className="workflow-sheet-heading od-toolbar">
    <h3 id="workflow-sheet-title">AI 设置</h3>
    <IconButton label="关闭 AI 设置" onClick={()=>onClose?.()}>
     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </IconButton>
   </div>
   <div className="workflow-sheet-content od-shared-provider-content">
    {!providerSettings?children:
     <form className="od-shared-provider-form" onSubmit={save} autoComplete="off" noValidate>
      <div className="od-shared-provider-scroll">
       <span id="od-ai-provider-source-label" className="od-conversation-sr">AI 来源</span>
       <div className="od-shared-provider-segments" role="radiogroup"
        aria-labelledby="od-ai-provider-source-label">
        <label className="od-shared-provider-segment">
         <input type="radio" name="od-ai-provider-source" value="local_codex"
          checked={mode==='local_codex'} onChange={()=>{setMode('local_codex');setKeyVisible(false);setError('');}}/>
         <span>本机 Codex</span>
        </label>
        <label className="od-shared-provider-segment">
         <input type="radio" name="od-ai-provider-source" value="https"
          checked={mode==='https'} onChange={()=>{setMode('https');setError('');}}/>
         <span>HTTPS 模型</span>
        </label>
       </div>
       {external?<div className="od-shared-provider-remote">
        <div className="od-shared-provider-field">
         <label htmlFor="od-ai-provider-endpoint">接口地址</label>
         <div className="od-shared-provider-input-action">
          <input className="od-field" id="od-ai-provider-endpoint" type="url"
           value={endpoint} maxLength={2048} placeholder="https://.../v1/chat/completions"
           onChange={event=>{setEndpoint(event.currentTarget.value);setProtocolOverride(null);setError('');}}
           autoComplete="off" spellCheck={false}/>
          {endpointValue&&<button type="button" aria-label="清空接口地址" title="清空接口地址"
           onClick={event=>{
            setEndpoint('');setProtocolOverride(null);setError('');
            doc?.getElementById('od-ai-provider-endpoint')?.focus();
           }}>
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>}
         </div>
        </div>
        {inferredSource&&!protocolError&&
         <p className="od-shared-provider-protocol-note" role="status">
          {savedSource&&savedSource!==inferredSource?'保留当前配置的协议：':'根据接口路径自动识别：'}
          {selectedHttpsSource==='cloud_responses'?'Responses':'Chat Completions'}
         </p>}
        {(!inferredSource||protocolError)&&<>
         <p className="od-shared-provider-protocol-note" role="status">
          {protocolError||'无法识别接口协议，请在高级配置中指定'}
         </p>
         <details className="od-shared-provider-protocol">
          <summary>高级配置 · HTTPS 协议</summary>
          <label htmlFor="od-ai-provider-protocol">接口协议</label>
          <select className="od-field" id="od-ai-provider-protocol"
           value={selectedHttpsSource||''}
           onChange={event=>{
            setProtocolOverride({endpoint:endpointValue,source:event.currentTarget.value});
            setError('');
           }}>
           <option value="">请选择协议</option>
           <option value="custom_https">Chat Completions</option>
           <option value="cloud_responses">Responses</option>
          </select>
         </details>
        </>}
        <div className="od-shared-provider-field">
         <label htmlFor="od-ai-provider-model">模型 ID</label>
         <input className="od-field" id="od-ai-provider-model" maxLength={120}
          value={model} onChange={event=>{setModel(event.currentTarget.value);setError('');}}
          autoComplete="off" spellCheck={false} placeholder="model-id"/>
        </div>
        <div className="od-shared-provider-field">
         <label htmlFor="od-ai-provider-key">API Key（仅当前会话）</label>
         <div className="od-shared-provider-input-action">
          <input className="od-field" id="od-ai-provider-key" type={keyVisible?'text':'password'}
           value={keyDraft} onChange={event=>{
            setKeyDraft(event.currentTarget.value);if(event.currentTarget.value)setClearKey(false);
            setError('');
           }}
           autoComplete="new-password" spellCheck={false}
           placeholder={snapshot.hasApiKey?'已配置，留空则保留':'请输入 API Key'}/>
          <button type="button" aria-label={keyVisible?'隐藏 API Key':'显示 API Key'}
           title={keyVisible?'隐藏 API Key':'显示 API Key'} aria-pressed={keyVisible}
           onClick={()=>setKeyVisible(value=>!value)}>
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/>
            <circle cx="12" cy="12" r="2.7"/>
            {keyVisible&&<path d="M3 3l18 18"/>}
           </svg>
          </button>
         </div>
        </div>
        {snapshot.hasApiKey&&<label className="od-shared-provider-clear-key">
         <input type="checkbox" checked={clearKey} onChange={event=>{
          setClearKey(event.currentTarget.checked);if(event.currentTarget.checked)setKeyDraft('');
         }}/>
         清除现有会话密钥
        </label>}
       </div>:<NativeConnectionCard nativeConnection={nativeConnection}
        onOpenNativeSettings={onOpenNativeSettings} doc={doc}/>}
       <p className="od-shared-provider-permission-note">
        网页摘要仍需按本轮授权；切换 AI 来源不会扩大 Chrome 或本机权限，也不会自动重放业务操作。
       </p>
       {error&&<p className="od-conversation-error" role="alert">{error}</p>}
      </div>
      <div className="od-shared-provider-actions">
       <button type="button" className="od-button od-button--secondary" onClick={()=>onClose?.()}>取消</button>
       <button type="submit" className="od-button od-button--primary">保存 AI 设置</button>
      </div>
     </form>}
   </div>
  </section>
 </div>,doc.body);
}
