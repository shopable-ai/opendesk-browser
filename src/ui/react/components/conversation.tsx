import * as React from 'react';
import {createPortal} from 'react-dom';
import {IconButton as OpenDeskIconButton} from './ui/button.tsx';

// Shared, presentation-only primitives. Callers retain provider credentials,
// permission checks, task execution and the business result journal.
export function ConversationTranscript({rows=[],entryClassName='workflow-chat-entry',showSpeaker=true}){
 return rows.map(row=>{
  const speaker=row.speaker==='你'?'user':
   ['系统','本机权限','对话状态'].includes(row.speaker)?'system':'assistant';
  const accessibleName=speaker==='user'?'你的消息':speaker==='system'?'系统提示':
   row.speaker==='执行结果'?'运行反馈':'AI 回复';
  return <div key={row.id} className={entryClassName} data-speaker={speaker}
   role={showSpeaker?undefined:'group'} aria-label={showSpeaker?undefined:accessibleName}>
   {showSpeaker&&<strong>{row.speaker}</strong>}<p>{row.message}</p>
  </div>;
 });
}
export function ConversationAiGlyph(){
 return <span className="od-conversation-ai-glyph" aria-hidden="true">AI</span>;
}

export function ConversationInput({id,value='',onChange,onKeyDown,placeholder='',rows=2,maxLength=4000,
 disabled=false,className='',inputRef,...props}){
 return <textarea id={id} ref={inputRef} rows={rows} maxLength={maxLength}
  className={className} placeholder={placeholder} value={value} disabled={disabled}
  onChange={onChange} onKeyDown={onKeyDown} {...props}/>;
}


// A business-neutral trusted Chat Frame: no Provider, Chrome, Host, or business IDs.
export function SharedConversationFrame({
 open=true,rows=[],draft='',busy=false,blocked=false,inputDisabled=false,canSend=true,
 inputId,placeholder='描述要完成的操作',inputLabel='对话输入',
 onDraftChange=()=>{},onSend=()=>{},onStop=()=>{},
 intro=null,emptyPrompt=null,feedback=null,review=null,technical=null,inputRef=null,logRef=null,
 onLogScroll=null,logClassName='od-conversation-log',entryClassName='od-conversation-entry',
 // Workflow preserves its native scrolling and sticky-composer layout. The
 // transcript and form still belong to this same trusted React Frame/root.
 splitTargets=false,transcriptTarget=null,composerTarget=null,
 autoScroll=true,focusOnOpen=true,inputRows=1,sendId=null,stopId=null
}){
 const localInput=React.useRef(null),localLog=React.useRef(null),composing=React.useRef(false);
 const input=inputRef||localInput,log=logRef||localLog;
 React.useEffect(()=>{
  if(open&&focusOnOpen)input.current?.focus({preventScroll:true});
 },[open,input,focusOnOpen,composerTarget]);
 React.useLayoutEffect(()=>{
  if(open&&autoScroll&&log.current)log.current.scrollTop=log.current.scrollHeight;
 },[open,rows,log,autoScroll]);
 React.useLayoutEffect(()=>{
  const node=input.current;if(!open||!node)return;
  node.style.height='auto';
  node.style.height=Math.max(44,Math.min(112,node.scrollHeight))+'px';
 },[open,draft,input,composerTarget]);
 const submit=event=>{
  event.preventDefault();
  if(!open||busy||blocked||!canSend||!draft.trim()||
   composing.current||event.nativeEvent?.isComposing||event.nativeEvent?.keyCode===229)return;
  // Permission requests must start during this original trusted Send event.
  onSend(event);
 };
 const transcript=rows.length?<ConversationTranscript rows={rows} entryClassName={entryClassName} showSpeaker={false}/>:
  emptyPrompt?<p className="od-conversation-empty">{emptyPrompt}</p>:null;
 const composer=<form className="od-conversation-composer" onSubmit={submit}>
   <label className="od-conversation-sr" htmlFor={inputId}>{inputLabel}</label>
   <ConversationInput id={inputId} inputRef={input} value={draft}
    className="od-conversation-input" rows={inputRows} maxLength={4000}
    placeholder={placeholder} disabled={inputDisabled}
    onChange={event=>onDraftChange(event.currentTarget.value,event)}
    onCompositionStart={()=>{composing.current=true;}}
    onCompositionEnd={()=>{composing.current=false;}}
    onKeyDown={event=>{
     if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent?.isComposing&&
      !composing.current&&event.nativeEvent?.keyCode!==229){event.preventDefault();submit(event);}
    }}/>
   {busy?<OpenDeskIconButton id={stopId||undefined}
      className="od-conversation-action od-conversation-action--stop"
      type="button" label="停止对话" title="停止 AI 后续操作"
      onClick={event=>{event.preventDefault();onStop(event);}}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
     </OpenDeskIconButton>:
    <OpenDeskIconButton id={sendId||undefined}
      className="od-conversation-action od-conversation-action--primary"
      type="submit" title="发送消息" label="发送"
      disabled={blocked||!canSend||!draft.trim()}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-7 7 7-7 7 7"/></svg>
     </OpenDeskIconButton>}
  </form>;
 return <>
  {intro}
  {splitTargets
   ?transcriptTarget?createPortal(transcript,transcriptTarget):null
   :<div ref={log} className={logClassName} role="log" aria-live="polite"
      aria-label="对话及已核实操作结果" onScroll={onLogScroll||undefined}>{transcript}</div>}
  {feedback}
  {review}
  {technical}
  {splitTargets
   ?composerTarget?createPortal(composer,composerTarget):null
   :composer}
 </>;
}

// ToolHost owns the slot. Only an admitted trusted workspace may portal Chat here.
export const TrustedConversationHeaderSlot=React.forwardRef<HTMLSpanElement, Record<string, never>>(function TrustedConversationHeaderSlot(_,ref){
 return <span id="sidebar-tool-chat-slot" className="od-conversation-header-slot" ref={ref}/>;
});
const newRefs=()=>({});
const errorText=error=>String(error?.message||'操作失败，未将未核实的操作视为成功。').slice(0,1500);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

// This host owns exactly one Dock for its admitted tool instance. Installed
// arbitrary JS/React/Vue tools are NOT allowed to mount into this trusted tree.
// The tool supplies only an audited, business-specific request callback.
export function TrustedConversationWorkspace({controller,...props}){
 const owner=React.useRef({controller,revision:0});
 if(owner.current.controller!==controller)
  owner.current={controller,revision:owner.current.revision+1};
 return <ConversationWorkspace key={owner.current.revision} controller={controller} {...props}/>;
}
function ConversationWorkspace({
 controller,renderBusiness,headerTarget=null,title='AI 对话',placeholder='描述要完成的操作',
 emptyPrompt='想完成什么操作？',phaseLabels=null,onOpenSettings=null
}){
 const restored=React.useMemo(()=>controller?.readSession?.()||{},[controller]);
 const [open,setOpen]=React.useState(restored.open===true);
 const [draft,setDraft]=React.useState(typeof restored.draft==='string'?restored.draft:'');
 const [rows,setRows]=React.useState(Array.isArray(restored.rows)?restored.rows:[]);
 const [busy,setBusy]=React.useState(false);
 const [phase,setPhase]=React.useState('idle');
 const [error,setError]=React.useState('');
 const [needsReview,setNeedsReview]=React.useState(restored.needsReview===true);
 const [unverifiedEtag,setUnverifiedEtag]=React.useState(null);
 const [reconciling,setReconciling]=React.useState(false);
 const [height,setHeight]=React.useState(null);
 const [totalHeight,setTotalHeight]=React.useState(600);
 const shellRef=React.useRef(null),inputRef=React.useRef(null),logRef=React.useRef(null);
 const logScrollRef=React.useRef(null);
 const triggerRef=React.useRef(null),adapterRef=React.useRef(null),abortRef=React.useRef(null);
 const inFlight=React.useRef(false),alive=React.useRef(true),sequence=React.useRef(0);
 const runRef=React.useRef(null);
 const rowsRef=React.useRef(rows),refsRef=React.useRef(restored.refs||newRefs());
 const draftRef=React.useRef(draft),openRef=React.useRef(open);
 const phaseRef=React.useRef('idle'),resizeRef=React.useRef(null),composingRef=React.useRef(false);
 draftRef.current=draft;openRef.current=open;

 const persist=React.useCallback((next={})=>{
  controller?.saveSession?.({open:openRef.current,draft:draftRef.current,
   rows:rowsRef.current,refs:refsRef.current,needsReview:false,...next});
 },[controller]);
 React.useEffect(()=>{persist({open,draft,rows,needsReview});},[persist,open,draft,rows,needsReview]);
 React.useEffect(()=>{
  alive.current=true;
  return ()=>{
   alive.current=false;
   const signal=abortRef.current?.signal;
   abortRef.current?.abort();runRef.current=null;
   if(inFlight.current&&signal){
    void Promise.resolve(controller?.cancel?.({signal})).catch(()=>{});
    if(phaseRef.current==='writing'){
     const warning={id:'dock-interrupted-'+(++sequence.current),speaker:'系统',
      message:'当前扩展实例已关闭。已发出的写入可能仍在完成；请先刷新并核对结果，不要重放旧指令。'};
     persist({rows:[...rowsRef.current,warning].slice(-24),needsReview:true});
    }
   }
   adapterRef.current=null;
  };
 },[controller,persist]);
 React.useLayoutEffect(()=>{
  const node=shellRef.current;
  if(!node)return;
  // CSS zoom changes visual pixels but Dock height is assigned in layout CSS pixels.
  const measure=()=>setTotalHeight(node.clientHeight||node.getBoundingClientRect().height||600);
  measure();
  if(typeof ResizeObserver==='undefined')return;
  const observer=new ResizeObserver(measure);observer.observe(node);
  return()=>observer.disconnect();
 },[]);
 const limits=React.useMemo(()=>{
  // At 200% zoom an 800px physical viewport can yield only 400 CSS px.
  // Prefer a scrollable transcript over collapsing the original bookmark tree.
  // Reserve up to 260 CSS px for business toolbar, tree header and visible rows.
  // Keep the compact composer, phase and coarse-pointer controls inside the Dock.
  // Tool settings outside this workspace may leave less than the usual floor.
  // Keep the composer and resize limits inside that actual available space.
  const min=Math.min(totalHeight,error||needsReview?184:156,Math.max(144,Math.floor(totalHeight*.34)));
  const businessMin=Math.min(260,Math.floor(totalHeight*.65));
  return {min,max:Math.max(min,totalHeight-businessMin)};
 },[totalHeight,error,needsReview]);
 const dockHeight=height===null?clamp(Math.round(totalHeight*.38),limits.min,limits.max):
  clamp(height,limits.min,limits.max);
 React.useEffect(()=>{
  if(height!==null&&height!==dockHeight)setHeight(dockHeight);
 },[height,dockHeight]);

 const toggle=React.useCallback(()=>setOpen(value=>!value),[]);
 const reconcile=React.useCallback(()=>setNeedsReview(false),[]);
 const append=React.useCallback((speaker,message)=>{
  const row={id:'dock-'+Date.now()+'-'+(++sequence.current),speaker,
   message:String(message).slice(0,3500)};
  const next=[...rowsRef.current,row].slice(-24);
  rowsRef.current=next;
  if(alive.current)setRows(next);
  persist({rows:next});
 },[persist]);
 async function reconcileStorage(){
  if(reconciling||busy||!needsReview||typeof controller?.reconcile!=='function')return;
  setReconciling(true);setError('');
  try{
   const result=await controller.reconcile(unverifiedEtag?{acknowledgeEtag:unverifiedEtag}:{});
   if(result?.verified!==true){
    if(result?.status==='uncertain'&&/^[a-f0-9]{64}$/.test(result.currentEtag||''))
      setUnverifiedEtag(result.currentEtag);
    append('系统',result.message||'当前数据尚不能核实旧操作，请在原列表检查。');
    return;
   }
   setUnverifiedEtag(null);
   append('系统',result.message||'Host 真实存储已重新读取；旧操作没有自动重放。');
   refsRef.current=newRefs();setNeedsReview(false);
   persist({refs:refsRef.current,needsReview:false});
  }catch(error){
   const message=errorText(error);
   setError(message);append('系统',message);
  }finally{setReconciling(false);}
 }
 const onStep=React.useCallback(step=>{
  if(!alive.current)return;
  if(step?.refs)refsRef.current=step.refs;
  if(step?.message)append('助手',step.message);
  else persist({refs:refsRef.current});
 },[append,persist]);
 function stop(event){
  // Aborting can replace this button with Send before the click default runs.
  event.preventDefault();
  const signal=abortRef.current?.signal;
  const run=runRef.current;
  if(!signal||!run||run.cancelPromise)return;
  abortRef.current.abort();
  // The request abort can settle before Native confirms its terminal state.
  // Keep this round busy until that exact cleanup settles, and retain UNKNOWN.
  let cleanup;
  try{cleanup=controller?.cancel?.({signal});}catch(error){cleanup=Promise.reject(error);}
  run.cancelPromise=Promise.resolve(cleanup).catch(error=>{run.cancelError=error;});
 }
 function send(event){
  event.preventDefault();
  if(event.nativeEvent?.isComposing||composingRef.current||inFlight.current||needsReview)return;
  const request=draftRef.current.trim();
  if(!request)return;
  const action=adapterRef.current?.request;
  if(!action||!controller?.request){
   setError('当前扩展未连接可执行的可信 AI 业务能力。');return;
  }
  const signal=new AbortController();
  abortRef.current=signal;inFlight.current=true;phaseRef.current='thinking';
  const run={signal};runRef.current=run;
  const current=()=>alive.current&&runRef.current===run;
  setBusy(true);setPhase('thinking');setError('');
  draftRef.current='';setDraft('');append('你',request);
  // Do NOT defer invocation: existing HTTPS origin permission requests must
  // start inside the original trusted Send click/keyboard gesture.
  let pending;
  try{
   pending=action({request,refs:structuredClone(refsRef.current),signal:signal.signal,
    event:event.nativeEvent,onStep:step=>{if(current())onStep(step);},
    onPhase:next=>{if(current()){phaseRef.current=next;setPhase(next);}}});
  }catch(ex){pending=Promise.reject(ex);}
  void Promise.resolve(pending).then(async result=>{
   await run.cancelPromise;
   if(!current())return;
   if(run.cancelError)throw run.cancelError;
   if(signal.signal.aborted)throw Object.assign(new Error('已停止后续操作。'),{code:'E_CANCELLED'});
   if(result?.refs)refsRef.current=result.refs;
   if(result?.question)append('助手',result.question);
   else persist({refs:refsRef.current});
  }).catch(async ex=>{
   await run.cancelPromise;
   if(!current())return;
   if(ex?.refs)refsRef.current=ex.refs;
   const writeUnknown=ex?.code==='E_OUTCOME_UNKNOWN'||ex?.writeIssued===true;
   const cancelError=run.cancelError;
   const unknown=writeUnknown||ex?.code==='E_AI_OUTCOME_UNKNOWN'||cancelError?.code==='E_AI_OUTCOME_UNKNOWN';
   if(writeUnknown)setNeedsReview(true);
   const partial=ex?.partial?.length?'已核实 '+ex.partial.length+' 步，其余未完成。 ':'';
   const message=cancelError?errorText(cancelError)+(writeUnknown?' '+partial+errorText(ex):''):
    ex?.code==='E_CANCELLED'?'已停止后续操作；此前已核实的写入不会撤销。':partial+errorText(ex);
   setError(message);append('系统',message);
   // Never silently repeat an issued or ambiguous write.
   if(!unknown&&!ex?.partial?.length&&ex?.code!=='E_CANCELLED'&&!draftRef.current){
    draftRef.current=request;setDraft(request);
   }
  }).finally(()=>{
   if(!current())return;
   runRef.current=null;
   inFlight.current=false;abortRef.current=null;phaseRef.current='idle';setPhase('idle');
   if(alive.current)setBusy(false);
  });
 }
 function close(){
  setOpen(false);triggerRef.current?.focus({preventScroll:true});
 }
 function separatorDown(e){
  if(e.button!==0)return;
  const shell=shellRef.current;
  const scale=shell?.clientHeight?shell.getBoundingClientRect().height/shell.clientHeight:1;
  resizeRef.current={y:e.clientY,height:dockHeight,scale:scale||1};
  e.currentTarget.setPointerCapture?.(e.pointerId);
  e.preventDefault();
 }
 function separatorMove(e){
  if(!resizeRef.current)return;
  const next=resizeRef.current.height+(resizeRef.current.y-e.clientY)/resizeRef.current.scale;
  setHeight(clamp(Math.round(next),limits.min,limits.max));
 }
 function separatorKey(e){
  let next=null,step=e.shiftKey?40:16;
  if(e.key==='ArrowUp')next=dockHeight+step;
  if(e.key==='ArrowDown')next=dockHeight-step;
  if(e.key==='Home')next=limits.min;
  if(e.key==='End')next=limits.max;
  if(next!==null){e.preventDefault();setHeight(clamp(next,limits.min,limits.max));}
 }
 const bridge=React.useMemo(()=>({open,adapterRef,reconcile}),[open,reconcile]);
 // The live transcript already announces the latest system error once.
 const lastRow=rows.at(-1);
 const feedbackError=lastRow?.speaker==='系统'&&lastRow.message===error?'':error;

 const trigger=headerTarget?createPortal(<button ref={triggerRef} type="button"
   className="sidebar-tool-icon-action od-icon-button od-conversation-frame-trigger"
   aria-label="AI 对话" title="打开或收起 AI 对话" aria-pressed={open} aria-expanded={open}
   aria-controls="opendesk-conversation-dock" onClick={toggle}>
   <ConversationAiGlyph/>
  </button>,headerTarget):null;
 return <div ref={shellRef} className="od-conversation-workspace" data-chat-open={open?'true':'false'}>
  {trigger}
  <div className="od-conversation-business">{renderBusiness(bridge)}</div>
  <section id="opendesk-conversation-dock" className="od-conversation-dock" aria-label={title}
   hidden={!open} style={{height:dockHeight+'px'}}>
   <div className="od-conversation-dragbar">
    <div className="od-conversation-separator" role="separator" tabIndex={0}
     aria-label="调整对话与原扩展的高度" aria-orientation="horizontal"
     aria-valuemin={limits.min} aria-valuemax={limits.max} aria-valuenow={dockHeight}
     onPointerDown={separatorDown} onPointerMove={separatorMove}
     onPointerUp={e=>{resizeRef.current=null;e.currentTarget.releasePointerCapture?.(e.pointerId)}}
     onPointerCancel={()=>{resizeRef.current=null;}} onKeyDown={separatorKey}/>
    {onOpenSettings&&<button type="button" className="od-conversation-settings"
     aria-label="AI Provider 设置" title="AI 设置" onClick={onOpenSettings}>
     <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h9m6 0h1M4 17h1m6 0h9"/>
      <circle cx="16" cy="7" r="3"/><circle cx="8" cy="17" r="3"/>
     </svg>
    </button>}
    <button type="button" className="od-conversation-close" aria-label="收起对话"
     title="收起对话" onClick={close}>
     <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
    </button>
   </div>
   <SharedConversationFrame open={open} rows={rows} draft={draft} busy={busy}
    blocked={needsReview||busy} canSend={Boolean(controller?.request)}
    placeholder={placeholder} emptyPrompt={emptyPrompt} inputId="od-conversation-input"
    inputRef={inputRef} logRef={logRef}
    onDraftChange={setDraft} onSend={send} onStop={stop}
    onLogScroll={event=>{
     if(openRef.current&&event.currentTarget.clientHeight>0)
      logScrollRef.current=event.currentTarget.scrollTop;
    }}
    feedback={<>
     {busy&&<div className="od-conversation-phase" role="status" aria-live="polite">
      {phaseLabels?.[phase]||'正在执行任务…'}
     </div>}
     {(feedbackError||needsReview)&&<div className="od-conversation-feedback" tabIndex={0} aria-label="对话状态详情">
      {feedbackError&&<p className="od-conversation-error" role="alert">{feedbackError}</p>}
      {needsReview&&<>
       <p className="od-conversation-error" role="status">
        上次写入结果不确定，不能直接重放。请先刷新并核对真实 Host 中的列表。
       </p>
       {typeof controller?.reconcile==='function'&&<button type="button"
        className="od-conversation-reconcile" disabled={busy||reconciling}
        onClick={()=>void reconcileStorage()}>
        {reconciling?'正在核对真实存储…':unverifiedEtag?'我已检查当前列表，解除阻止':'读取 Host 真实存储并核对'}
       </button>}
      </>}
     </div>}
    </>}/>

  </section>
 </div>;
}
