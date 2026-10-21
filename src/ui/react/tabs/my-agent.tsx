import * as React from 'react';
import {ConversationInput,ConversationTranscript} from '../components/conversation.tsx';
import {IconButton} from '../components/ui/button.tsx';

const empty={open:false,rows:[],draft:'',status:'idle',pending:null,step:'',busy:false};
const noSubscribe=()=>()=>{};
const readEmpty=()=>empty;
const examples=['查找当前网页可运行的任务','查看上一次任务失败原因','查看已有定时计划'];

export function MyAgentToggle({agent,id='my-agent-toggle'}){
  const state=React.useSyncExternalStore(agent?.subscribe??noSubscribe,
    agent?.getSnapshot??readEmpty,agent?.getSnapshot??readEmpty);
  return <IconButton type="button" id={id}
    className="my-agent-toggle" label="AI 任务助手"
    title="打开或收起任务与计划 AI 对话" aria-controls="my-agent-panel"
    aria-expanded={state.open} aria-pressed={state.open}
    disabled={!agent} onClick={()=>agent?.toggle()}>
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5c0 4.6-3.9 8.5-8.8 8.5a10 10 0 0 1-4.2-.9L3 21l1.5-4.5A8.1 8.1 0 0 1 3 11.5C3 7 7 3 12.2 3s8.8 4 8.8 8.5Z"/>
      <path d="m12 7 .9 2.3L15 10l-2.1.7L12 13l-.9-2.3L9 10l2.1-.7Z"/>
    </svg>
  </IconButton>;
}

export function MyAgentPanel({agent}){
  const state=React.useSyncExternalStore(agent?.subscribe??noSubscribe,
    agent?.getSnapshot??readEmpty,agent?.getSnapshot??readEmpty);
  const input=React.useRef<HTMLTextAreaElement>(null);
  const log=React.useRef<HTMLDivElement>(null);
  const composing=React.useRef(false);
  const close=()=>{
    agent?.toggle();
    const buttons=[...(globalThis.document?.querySelectorAll?.('[aria-controls="my-agent-panel"]')||[])];
    buttons.find(el=>el.offsetParent!==null)?.focus?.({preventScroll:true});
  };
  const send=React.useCallback((event)=>{
    event.preventDefault();
    if(!agent||state.busy||state.pending||!state.draft.trim()||composing.current)return;
    // Do not await/queue before calling Provider: HTTPS permission requests
    // are bound to the trusted Send gesture.
    void agent.send(state.draft,event.nativeEvent);
    agent.setDraft('');
  },[agent,state.busy,state.pending,state.draft]);
  React.useEffect(()=>{if(state.open)input.current?.focus({preventScroll:true});},[state.open]);
  React.useLayoutEffect(()=>{if(state.open&&log.current)log.current.scrollTop=log.current.scrollHeight;},
    [state.open,state.rows.length,state.step]);
  return <section id="my-agent-panel" className="my-agent-panel od-surface"
    hidden={!state.open} aria-label="AI 任务与定时计划助手" data-status={state.status}>
    <header className="my-agent-heading od-toolbar">
      <strong>AI 任务助手</strong>
      <span className="my-agent-secondary">真实任务与计划</span>
      <IconButton type="button" label="收起 AI 对话" onClick={close}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </IconButton>
    </header>
    {!state.rows.length&&<div className="my-agent-welcome">
      <p>可以帮你查找、运行任务或管理定时计划；真实修改前会请你确认。</p>
      <div className="my-agent-examples" aria-label="常用任务指令">
        {examples.map(sample=><button type="button" key={sample} className="od-button od-button--secondary"
          onClick={()=>{agent?.setDraft(sample);input.current?.focus({preventScroll:true});}}>{sample}</button>)}
      </div>
    </div>}
    <div ref={log} className="my-agent-transcript" role="log" aria-live="polite"
      aria-label="对话与真实操作结果">
      <ConversationTranscript rows={state.rows} showSpeaker={false} entryClassName="my-agent-message"/>
    </div>
    {state.step&&<p role="status" className="my-agent-progress">{state.step}</p>}
    {state.technical&&<details className="my-agent-technical">
      <summary>技术详情</summary>
      <pre>{state.technical}</pre>
    </details>}
    {state.pending&&<div className="my-agent-review" role="group" aria-label="确认 AI 操作">
      <p><strong>执行前确认</strong></p>
      <p>{state.pending.summary}</p>
      <div className="my-agent-review-actions">
        <button type="button" className="od-button od-button--primary" disabled={state.busy}
          onClick={event=>void agent?.confirm(event.nativeEvent)}>确认执行</button>
        <button type="button" className="od-button od-button--secondary"
          onClick={()=>agent?.stop()}>取消</button>
      </div>
    </div>}
    <form className="my-agent-composer" onSubmit={send}>
      <label className="visually-hidden" htmlFor="my-agent-input">向 AI 任务助手发送消息</label>
      <ConversationInput id="my-agent-input" inputRef={input} rows={2}
        className="od-field my-agent-input" value={state.draft} maxLength={4000}
        placeholder="例如：每天上午 9 点运行这个任务…"
        disabled={state.busy||Boolean(state.pending)}
        onChange={event=>agent?.setDraft(event.target.value)}
        onCompositionStart={()=>{composing.current=true;}}
        onCompositionEnd={()=>{composing.current=false;}}
        onKeyDown={event=>{
          if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing&&
            !composing.current&&event.nativeEvent.keyCode!==229){
            event.preventDefault();send(event);
          }
        }}/>
      {state.busy?<IconButton type="button" label="仅停止 AI 后续操作"
        title="停止 AI（不会停止正在运行的任务）" onClick={()=>agent?.stop()}>
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
          aria-hidden="true"><rect x="5.5" y="5.5" width="13" height="13" rx="2"/></svg>
      </IconButton>:<IconButton type="submit" label="发送消息"
        disabled={!state.draft.trim()||Boolean(state.pending)||!agent}>
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none"
          stroke="currentColor" aria-hidden="true"><path d="M12 19V5m-7 7 7-7 7 7"/></svg>
      </IconButton>}
    </form>
  </section>;
}
