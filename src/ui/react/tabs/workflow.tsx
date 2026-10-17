import * as React from 'react';

// R23.11: trusted chrome only. No Provider, Host, secrets, drafts or web-page
// content is copied into this view. Native user gestures go to WorkflowView.
export function WorkflowHeader({model,actions}) {
  const forward = (action,event) => {
    if(event.nativeEvent?.isTrusted) actions?.[action]?.(event.nativeEvent);
  };
  return <>
    <span id="workflow-saved-state" className="workflow-pill"
      hidden={!model.saved} title={model.savedTitle||''}>{model.savedText||''}</span>
    <button type="button" id="workflow-history-toggle"
      className="workflow-icon-button od-icon-button"
      aria-label="历史" title="历史"
      aria-expanded={Boolean(model.historyExpanded)} aria-controls="workflow-history-panel"
      onClick={event=>forward('onHistory',event)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
      </svg>
    </button>
    <button type="button" id="workflow-ai-new-session"
      className="workflow-icon-button od-icon-button" disabled={Boolean(model.busy)}
      aria-label="新对话，保留当前工作流" title={model.sessionHint||'新对话'}
      onClick={event=>forward('onNewSession',event)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-4 2v-5.5A7.5 7.5 0 1 1 20 11.5Z"/>
        <path d="M9 11.5h7m-3.5-3.5v7"/>
      </svg>
    </button>
    <button type="button" id="workflow-new"
      className="workflow-icon-button od-icon-button" disabled={Boolean(model.busy && !model.planning)}
      aria-label="新建工作流" title="新建工作流（检查未保存草稿）"
      onClick={event=>forward('onNewWorkflow',event)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 5v14M5 12h14"/>
      </svg>
    </button>
  </>;
}

/** The label is presentation-only; source IDs and the API credential stay in WorkflowView. */
export function WorkflowSourceName({value=''}) {
  return value ? <span id="workflow-source-name" className="workflow-source-name"
    title={`当前模型：${value}`} aria-label={`当前模型：${value}`}>{value}</span> : null;
}

/** The only history entries are real revision records or a resumable Codex session.
 * Restoring a saved workflow still goes through WorkflowView's hash verification. */
export function WorkflowHistory({model={open:false,rows:[],canResume:false},actions}) {
  const forward=(action,event,key)=>{
    if(event.nativeEvent?.isTrusted) actions?.[action]?.(key,event.nativeEvent);
  };
  const rows=model.rows||[];
  return <section id="workflow-history-panel" className="workflow-history-panel"
    role="region" aria-label="历史" tabIndex={-1} hidden={!model.open}>
    <div className="workflow-history-section">
      <h3>历史对话</h3>
      {model.canResume
        ? <button type="button" id="workflow-history-resume"
            className="workflow-history-row" onClick={event=>forward('onResumeHistory',event)}>
            <span className="workflow-history-row-title">上次 Codex 对话</span>
            <small>恢复模型对话，不重新执行网页操作</small>
          </button>
        : <p className="workflow-history-empty">暂无可恢复的历史对话</p>}
    </div>
    <div className="workflow-history-section">
      <h3>已保存工作流</h3>
      {rows.length ? <div className="workflow-history-list">
        {rows.map(row=><button key={row.key} type="button"
          className="workflow-history-row" disabled={Boolean(model.busy)}
          title={row.fullTitle}
          onClick={event=>forward('onOpenSavedHistory',event,row.key)}>
          <span className="workflow-history-row-title">{row.title}</span>
          <small>{row.savedText}</small>
        </button>)}
      </div> : <p className="workflow-history-empty">尚未保存工作流。完成任务后可以保存并在这里打开。</p>}
    </div>
  </section>;
}

function focusableElements(panel) {
  return [...panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter(item => !item.closest('[hidden],[inert]') && item.getClientRects().length > 0);
}


// Only trusted, already-minimized UI strings cross the adapter. Never mount
// provider HTML/markdown or give a page script access to this React tree.
export function WorkflowTranscript({rows=[]}) {
  return rows.map(row=><div key={row.id} className="workflow-chat-entry"
    data-speaker={row.speaker==='你'?'user':'assistant'}>
    <strong>{row.speaker}</strong><p>{row.message}</p>
  </div>);
}

// Only the trusted Durable Result presentation is React-owned; its value comes
// exclusively from WorkflowView after the existing RunHost receipt is read.
export function WorkflowResultText({value=''}) {return <>{String(value)}</>;}

// The legacy provider fields retain their actual DOM nodes and event listeners.
// React owns only the sheet, its modal semantics, lifecycle and focus trap.
export function WorkflowSettingsSheet({open=false,onClose,settings,doc}) {
  const container=React.useRef(null);
  const panel=React.useRef(null);
  React.useLayoutEffect(()=>{
    if(!container.current || !settings)return;
    const originalParent=settings.parentNode;
    const originalNext=settings.nextSibling;
    container.current.append(settings);
    return ()=>{
      if(originalParent?.isConnected)
        originalParent.insertBefore(settings,
          originalNext?.parentNode===originalParent ? originalNext : null);
    };
  },[settings]);
  React.useLayoutEffect(()=>{
    if(!open || !panel.current || !doc)return;
    const editor=doc.getElementById('workflow-editor');
    const previous=doc.activeElement;
    const composer=doc.getElementById('workflow-ai-request');
    const restoreFocus=previous?.id==='workflow-provider-toggle'?composer:previous;
    const wasInert=editor?.inert;
    if(editor)editor.inert=true;
    const currentPanel=panel.current;
    const onKeydown=event=>{
      if(event.key==='Escape'){
        event.preventDefault();event.stopPropagation();onClose?.();return;
      }
      if(event.key!=='Tab')return;
      const elements=focusableElements(currentPanel);
      if(!elements.length){event.preventDefault();currentPanel.focus({preventScroll:true});return;}
      const first=elements[0],last=elements[elements.length-1];
      if(!currentPanel.contains(doc.activeElement) || (event.shiftKey&&doc.activeElement===first)){
        event.preventDefault();(event.shiftKey?last:first).focus({preventScroll:true});
      }else if(!event.shiftKey&&doc.activeElement===last){
        event.preventDefault();first.focus({preventScroll:true});
      }
    };
    doc.addEventListener('keydown',onKeydown,true);
    (currentPanel.querySelector('#workflow-ai-provider')||currentPanel).focus({preventScroll:true});
    return ()=>{
      doc.removeEventListener('keydown',onKeydown,true);
      if(editor)editor.inert=wasInert;
      const focusTarget=restoreFocus?.isConnected && !currentPanel.contains(restoreFocus)
        ? restoreFocus:composer;
      if(doc.activeElement?.closest?.('.workflow-sheet-panel') || doc.activeElement===doc.body)
        focusTarget?.focus?.({preventScroll:true});
    };
  },[open,onClose,doc]);
  return <div className="workflow-sheet-overlay" hidden={!open}>
    <div className="workflow-sheet-backdrop" aria-hidden="true" onClick={()=>onClose?.()}/>
    <section className="workflow-sheet-panel" role="dialog" aria-modal="true"
      aria-labelledby="workflow-sheet-title" ref={panel} tabIndex={-1}>
      <div className="workflow-sheet-heading od-toolbar">
        <h3 id="workflow-sheet-title">AI 设置</h3>
        <button type="button" className="workflow-icon-button od-icon-button"
          aria-label="关闭 AI 设置" title="关闭" onClick={()=>onClose?.()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div className="workflow-sheet-content" ref={container}/>
    </section>
  </div>;
}
