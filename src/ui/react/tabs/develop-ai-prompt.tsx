import * as React from 'react';
import {useDevelop,DevelopIcon} from './develop-controls.tsx';
import {createDeveloperAIPrompt} from '../../developer-ai-prompt.js';
import {translateUiText} from '../../../i18n/strings.js';

const PromptContext=React.createContext(null);

// Presentation only: capture an allowlist of non-sensitive mode facts. No source,
// project labels/paths, target URLs or execution actions enter the prompt.
export function DevelopPromptProvider({children,noticeView,locale,hidden}){
  const {model,snapshot}=useDevelop(),{fields}=snapshot;
  const local=fields['local-project-mode'].checked;
  const mode=local?'local':fields['page-component-react'].checked?'react':
    fields['page-component-vue'].checked?'vue':fields['script-javascript-world'].value==='page'?'page':'controller';
  const project=fields['local-project-select'];
  const context={mode,readOnly:!local&&fields['script-source'].readOnly,
    projectSelected:local&&project.data.promptProjectSelected===true,
    runtimeKind:local?project.data.promptRuntimeKind:'unknown',
    edition:typeof __OPENDESK_BROWSER_COMPILER_ENABLED__==='undefined'?'unknown':
      __OPENDESK_BROWSER_COMPILER_ENABLED__===false?'standard':'developer'};
  const identity=JSON.stringify([mode,context.readOnly,context.projectSelected,context.runtimeKind,
    project.value,locale,hidden,snapshot.section]);
  const [pending,setPending]=React.useState(false),[recovery,setRecovery]=React.useState(null);
  const [receipt,setReceipt]=React.useState('');
  const generation=React.useRef(0),live=React.useRef(false),textRef=React.useRef(null);
  const t=(key,params={})=>translateUiText('develop.prompt.'+key,params,locale);
  React.useLayoutEffect(()=>{
    live.current=true;generation.current++;setPending(false);setRecovery(null);setReceipt('');
    return ()=>{live.current=false;generation.current++;};
  },[model,identity]);
  React.useLayoutEffect(()=>{
    if(recovery){textRef.current?.focus();textRef.current?.select();}
  },[recovery]);
  const copy=async()=>{
    if(pending||hidden)return;
    const text=createDeveloperAIPrompt(context,{locale});
    const ticket=++generation.current;
    setPending(true);setRecovery(null);setReceipt('');
    const current=()=>live.current&&ticket===generation.current;
    try{
      if(!globalThis.navigator?.clipboard?.writeText)throw new Error('Clipboard unavailable');
      await globalThis.navigator.clipboard.writeText(text);
      if(!current())return;
      if(noticeView?.showToast)noticeView.showToast(t('copied'),{position:'bottom-center',type:'success'});
      else setReceipt(t('copied'));
    }catch(error){
      if(current())setRecovery({text,reason:t(error?.name==='NotAllowedError'?'denied':
        !globalThis.navigator?.clipboard?.writeText?'unavailable':'failed')});
    }finally{if(current())setPending(false);}
  };
  return <PromptContext.Provider value={{copy,pending,t,local}}>
    {children}
    {receipt&&<p className="od-field-help" role="status">{receipt}</p>}
    {recovery&&<details open className="developer-prompt-recovery od-disclosure od-disclosure--flat">
      <summary>{t('manual')}</summary>
      <p role="alert">{recovery.reason}</p>
      <label htmlFor="developer-ai-prompt-text" className="od-field-label">{t('text')}</label>
      <textarea ref={textRef} id="developer-ai-prompt-text" className="od-field" rows={9}
        readOnly value={recovery.text} aria-describedby="developer-ai-prompt-instruction"/>
      <p id="developer-ai-prompt-instruction" className="od-field-help">{t('instruction')}</p>
      <div className="od-toolbar">
        <button type="button" className="od-button od-button--secondary" onClick={()=>{textRef.current?.focus();textRef.current?.select();}}>{t('select')}</button>
        <button type="button" className="od-button od-button--secondary" onClick={()=>{
          const button=textRef.current?.ownerDocument.getElementById('developer-ai-prompt-copy');
          setRecovery(null);button?.focus();
        }}>{t('close')}</button>
      </div>
    </details>}
  </PromptContext.Provider>;
}

export function DevelopPromptButton({local=false}){
  const prompt=React.useContext(PromptContext);
  if(!prompt||prompt.local!==local)return null;
  const label=prompt.t(prompt.pending?'copying':'copy');
  return <button id="developer-ai-prompt-copy" type="button" className="od-icon-button od-icon-button--quiet"
    title={label} aria-label={label} disabled={prompt.pending} aria-busy={prompt.pending}
    onClick={prompt.copy}><DevelopIcon name="clipboard"/></button>;
}
