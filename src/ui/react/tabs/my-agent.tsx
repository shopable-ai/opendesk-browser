import * as React from 'react';
import {SharedConversationFrame} from '../components/conversation.tsx';
import {IconButton} from '../components/ui/button.tsx';

const empty={open:false,rows:[],draft:'',status:'idle',pending:null,step:'',busy:false};
const noSubscribe=()=>()=>{};
const readEmpty=()=>empty;
const examples=['查找当前网页可运行的任务','查看上一次任务失败原因',
  '查看已有定时计划','修改已有计划的执行时间'];

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

export function MyAgentPanel({agent,onOpenSettings=null}){
 const state=React.useSyncExternalStore(agent?.subscribe??noSubscribe,
  agent?.getSnapshot??readEmpty,agent?.getSnapshot??readEmpty);
 const input=React.useRef<HTMLTextAreaElement>(null);
 const close=()=>{
  agent?.toggle();
  const buttons=[...(globalThis.document?.querySelectorAll?.('[aria-controls="my-agent-panel"]')||[])];
  buttons.find(el=>el.offsetParent!==null)?.focus?.({preventScroll:true});
 };
 const send=event=>{
  if(!agent||state.busy||state.pending||!state.draft.trim())return;
  // Retain the trusted gesture for the existing MyTaskAgent permission gates.
  void agent.send(state.draft,event.nativeEvent);
  agent.setDraft('');
 };
 const review=state.pending?<div className="my-agent-review" role="group" aria-label="确认 AI 操作">
  <p><strong>执行前确认</strong></p>
  <p>{state.pending.summary}</p>
  <div className="my-agent-review-actions">
   <button type="button" className="od-button od-button--primary" disabled={state.busy}
    onClick={event=>void agent?.confirm(event.nativeEvent)}>确认执行</button>
   <button type="button" className="od-button od-button--secondary"
    onClick={()=>agent?.stop()}>取消</button>
  </div>
 </div>:null;
 return <section id="my-agent-panel" className="my-agent-panel od-surface"
  hidden={!state.open} aria-label="AI 任务与定时计划助手" data-status={state.status}>
  <header className="my-agent-heading od-toolbar">
   <strong>AI 任务助手</strong>
   <span className="my-agent-secondary">真实任务与计划</span>
   {onOpenSettings&&<IconButton type="button" label="AI Provider 设置" title="AI 设置"
    onClick={onOpenSettings}>
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
     strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
     <path d="M4 7h9m6 0h1M4 17h1m6 0h9"/>
     <circle cx="16" cy="7" r="3"/><circle cx="8" cy="17" r="3"/>
    </svg>
   </IconButton>}
   <IconButton type="button" label="收起 AI 对话" onClick={close}>
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
     strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
   </IconButton>
  </header>
  <SharedConversationFrame open={state.open} rows={state.rows} draft={state.draft}
   busy={state.busy} blocked={state.busy||Boolean(state.pending)}
   inputDisabled={state.busy||Boolean(state.pending)}
   canSend={Boolean(agent)&&!state.pending} inputId="my-agent-input"
   inputLabel="向 AI 任务助手发送消息" inputRef={input}
   placeholder="例如：每天上午 9 点运行这个任务…"
   onDraftChange={value=>agent?.setDraft(value)} onSend={send}
   onStop={()=>agent?.stop()}
   intro={!state.rows.length?<div className="my-agent-welcome">
    <p>可以帮你查找、运行任务或管理定时计划；真实修改前会请你确认。</p>
    <div className="my-agent-examples" aria-label="常用任务指令">
     {examples.map(sample=><button type="button" key={sample} className="od-button od-button--secondary"
      onClick={()=>{agent?.setDraft(sample);input.current?.focus({preventScroll:true});}}>{sample}</button>)}
    </div>
   </div>:null}
   feedback={state.step?<p role="status" className="my-agent-progress">{state.step}</p>:null}
   review={review}
   technical={state.technical?<details className="my-agent-technical">
    <summary>技术详情</summary><pre>{state.technical}</pre>
   </details>:null}/>
 </section>;
}
