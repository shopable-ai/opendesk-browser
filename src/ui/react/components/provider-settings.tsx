import * as React from 'react';
import {createPortal} from 'react-dom';
import {IconButton} from './ui/button.tsx';
import {inferHttpsSource,isHttpsSource} from '../../ai/provider-https-source.js';

function focusableElements(panel){
 return [...panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
  .filter(item=>item.tabIndex>=0&&item.getAttribute('aria-hidden')!=='true'&&
   !item.closest('[hidden],[inert]')&&item.getClientRects().length>0);
}
const EMPTY_SETTINGS=Object.freeze({source:'local_codex',endpoint:'',model:'',hasApiKey:false,generation:0});
const noSubscribe=()=>()=>{};

// ToolShell owns the sole Runtime; this is a presentational settings client,
// rendered as a Portal of the existing trusted React root, never a second root.
export function SharedProviderSettingsSheet({
 open=false,onClose,doc=globalThis.document,providerSettings=null,
 onOpenNativeSettings=null,children
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
 const [clearKey,setClearKey]=React.useState(false);
 const [error,setError]=React.useState('');
 React.useEffect(()=>{
  if(open){
   setMode(snapshot.source==='local_codex'?'local_codex':'https');
   setEndpoint(snapshot.endpoint);setModel(snapshot.model);setProtocolOverride(null);
   setKeyDraft('');setClearKey(false);setError('');
  }else{
   setKeyDraft('');setClearKey(false);
  }
 },[open,snapshot.generation]);
 const external=mode==='https';
 const endpointValue=endpoint.trim();
 const inferredSource=inferHttpsSource(endpointValue);
 // Reuse the exact configured protocol for a legacy nonstandard endpoint.
 // A new unknown endpoint instead needs an explicit advanced choice.
 const savedSource=isHttpsSource(snapshot.source)&&
   endpointValue===String(snapshot.endpoint||'').trim()?snapshot.source:null;
 const selectedHttpsSource=inferredSource||
   (protocolOverride?.endpoint===endpointValue?protocolOverride.source:null)||
   savedSource;
 const save=event=>{
  event.preventDefault();
  if(!event.nativeEvent?.isTrusted||!providerSettings)return;
  try {
   if(external){
    const url=new URL(endpoint.trim());
    if(url.protocol!=='https:'||!url.hostname||url.username||url.password)
     throw new Error('AI 接口必须是有效的 HTTPS 地址，不能包含账号密码');
    if(!model.trim())throw new Error('请输入模型 ID');
    if(!selectedHttpsSource)
     throw new Error('接口路径无法识别协议，请在高级配置中选择 Chat Completions 或 Responses');
   }
   const providerSource=external?selectedHttpsSource:'local_codex';
   if(!providerSource)throw new Error('请选择 HTTPS 协议');
   const patch:{source:string;endpoint:string;model:string;apiKey?:string}={
    source:providerSource,endpoint:endpointValue,model:model.trim()};
   if(clearKey)patch.apiKey='';
   else if(keyDraft)patch.apiKey=keyDraft;
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
  (current.querySelector('[aria-pressed="true"]')||current).focus({preventScroll:true});
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
  <section className="workflow-sheet-panel" role="dialog" aria-modal="true"
   aria-labelledby="workflow-sheet-title" ref={panel} tabIndex={-1}>
   <div className="workflow-sheet-heading od-toolbar"><h3 id="workflow-sheet-title">AI 设置</h3>
    <IconButton label="关闭 AI 设置" onClick={()=>onClose?.()}>
     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </IconButton>
   </div>
   <div className="workflow-sheet-content">
    {!providerSettings?children:
     <form className="od-shared-provider-form" onSubmit={save} autoComplete="off">
      <fieldset>
       <legend>AI 来源</legend>
       <label><input type="radio" name="od-ai-provider-source" value="local_codex"
        checked={mode==='local_codex'} onChange={()=>setMode('local_codex')}/> 本机 Codex</label>
       <label><input type="radio" name="od-ai-provider-source" value="https"
        checked={mode==='https'} onChange={()=>setMode('https')}/> HTTPS 模型</label>
      </fieldset>
      {external?<div className="od-shared-provider-fields">
       <label htmlFor="od-ai-provider-endpoint">HTTPS 接口</label>
       <input className="od-field" id="od-ai-provider-endpoint" type="url" required
        value={endpoint} onChange={event=>setEndpoint(event.currentTarget.value)}
        autoComplete="off" spellCheck={false}/>
       {inferredSource?
        <p className="workflow-minor-note">根据接口路径识别：{inferredSource==='cloud_responses'?'Responses':'Chat Completions'}</p>:
        <>
         <p className="workflow-minor-note">无法根据接口路径识别协议，请在高级配置中明确选择。</p>
         <details className="od-disclosure od-disclosure--flat od-shared-provider-protocol">
          <summary>高级配置 · HTTPS 协议</summary>
          <label htmlFor="od-ai-provider-protocol">接口协议</label>
          <select className="od-field" id="od-ai-provider-protocol"
           value={selectedHttpsSource||''}
           onChange={event=>setProtocolOverride({endpoint:endpointValue,source:event.currentTarget.value})}>
           <option value="">请选择协议</option>
           <option value="custom_https">Chat Completions</option>
           <option value="cloud_responses">Responses</option>
          </select>
         </details>
        </>}
       <label htmlFor="od-ai-provider-model">模型 ID</label>
       <input className="od-field" id="od-ai-provider-model" required
        value={model} onChange={event=>setModel(event.currentTarget.value)}
        autoComplete="off" spellCheck={false}/>
       <label htmlFor="od-ai-provider-key">API Key（仅当前会话，不保存）</label>
       <input className="od-field" id="od-ai-provider-key" type="password"
        value={keyDraft} onChange={event=>setKeyDraft(event.currentTarget.value)}
        autoComplete="new-password" spellCheck={false}
        placeholder={snapshot.hasApiKey?'已配置，留空则保留':'请输入 API Key'}/>
       {snapshot.hasApiKey&&<label className="od-shared-provider-clear-key">
        <input type="checkbox" checked={clearKey} onChange={event=>setClearKey(event.currentTarget.checked)}/>
        清除现有会话密钥
       </label>}
      </div>:<div className="od-shared-provider-fields">
       <p className="workflow-minor-note">使用本机 Codex 连接及当前授权；网页摘要授权仍由原业务机制处理。</p>
       {onOpenNativeSettings&&<button type="button" className="od-button od-button--secondary"
         onClick={event=>{
          if(!event.nativeEvent?.isTrusted)return;
          try {
           void Promise.resolve(onOpenNativeSettings()).catch(ex=>setError(
            '无法打开本机连接设置：'+String(ex?.message||ex)));
          }catch(ex){setError('无法打开本机连接设置：'+String(ex?.message||ex));}
         }}>本机连接设置 ↗</button>}
      </div>}
      <p className="workflow-minor-note">Provider 配置对各 AI 入口共享；切换后已有推理会安全失效，不自动重放业务操作。原 Chrome/Native 权限不因此扩大。</p>
      {error&&<p className="od-conversation-error" role="alert">{error}</p>}
      <div className="od-shared-provider-actions">
       <button type="button" className="od-button od-button--secondary" onClick={()=>onClose?.()}>取消</button>
       <button type="submit" className="od-button od-button--primary">保存 AI 设置</button>
      </div>
     </form>}
   </div>
  </section>
 </div>,doc.body);
}
