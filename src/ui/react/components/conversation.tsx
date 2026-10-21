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
export function ConversationInput({id,value='',onChange,onKeyDown,placeholder='',rows=2,maxLength=4000,
 disabled=false,className='',inputRef,...props}){
 return <textarea id={id} ref={inputRef} rows={rows} maxLength={maxLength}
  className={className} placeholder={placeholder} value={value} disabled={disabled}
  onChange={onChange} onKeyDown={onKeyDown} {...props}/>;
}

// ToolHost owns the slot. Only an admitted trusted workspace may portal Chat here.
export const TrustedConversationHeaderSlot=React.forwardRef<HTMLSpanElement, Record<string, never>>(function TrustedConversationHeaderSlot(_,ref){
 return <span id="sidebar-tool-chat-slot" className="od-conversation-header-slot" ref={ref}/>;
});
const newRefs=()=>({folderId:null,bookmarkId:null,matches:[]});
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
 controller,renderBusiness,headerTarget=null,title='AI 对话',placeholder='描述要完成的操作'
}){
 const restored=React.useMemo(()=>controller?.readSession?.()||{},[controller]);
 const [open,setOpen]=React.useState(restored.open===true);
 const [draft,setDraft]=React.useState(typeof restored.draft==='string'?restored.draft:'');
 const [rows,setRows]=React.useState(Array.isArray(restored.rows)?restored.rows:[]);
 const [busy,setBusy]=React.useState(false);
 const [error,setError]=React.useState('');
 const [needsReview,setNeedsReview]=React.useState(restored.needsReview===true);
 const [height,setHeight]=React.useState(null);
 const [totalHeight,setTotalHeight]=React.useState(600);
 const shellRef=React.useRef(null),inputRef=React.useRef(null),logRef=React.useRef(null);
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
 React.useEffect(()=>{
  if(open)inputRef.current?.focus({preventScroll:true});
 },[open]);
 React.useLayoutEffect(()=>{
  if(open&&logRef.current)logRef.current.scrollTop=logRef.current.scrollHeight;
 },[open,rows,error]);
 React.useLayoutEffect(()=>{
  const input=inputRef.current;if(!open||!input)return;
  input.style.height='auto';
  input.style.height=clamp(input.scrollHeight,44,112)+'px';
  input.style.overflowY=input.scrollHeight>112?'auto':'hidden';
 },[draft,open]);
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
  const min=Math.min(error||needsReview?184:156,Math.max(112,Math.floor(totalHeight*.34)));
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
 const onStep=React.useCallback(step=>{
  if(!alive.current)return;
  if(step?.refs)refsRef.current=step.refs;
  if(step?.message)append('助手',step.message);
  else persist({refs:refsRef.current});
 },[append,persist]);
 function stop(){
  const signal=abortRef.current?.signal;
  if(!signal)return;
  abortRef.current.abort();
  void Promise.resolve(controller?.cancel?.({signal})).catch(()=>{});
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
  setBusy(true);setError('');
  draftRef.current='';setDraft('');append('你',request);
  // Do NOT defer invocation: existing HTTPS origin permission requests must
  // start inside the original trusted Send click/keyboard gesture.
  let pending;
  try{
   pending=action({request,refs:structuredClone(refsRef.current),signal:signal.signal,
    event:event.nativeEvent,onStep:step=>{if(current())onStep(step);},
    onPhase:phase=>{if(current())phaseRef.current=phase;}});
  }catch(ex){pending=Promise.reject(ex);}
  void Promise.resolve(pending).then(result=>{
   if(!current())return;
   if(result?.refs)refsRef.current=result.refs;
   if(result?.question)append('助手',result.question);
   else persist({refs:refsRef.current});
  }).catch(ex=>{
   if(!current())return;
   if(ex?.refs)refsRef.current=ex.refs;
   const unknown=ex?.code==='E_OUTCOME_UNKNOWN'||ex?.writeIssued===true;
   if(unknown)setNeedsReview(true);
   const partial=ex?.partial?.length?'已核实 '+ex.partial.length+' 步，其余未完成。 ':'';
   const message=ex?.code==='E_CANCELLED'?'已停止后续操作；此前已核实的写入不会撤销。':
    partial+errorText(ex);
   setError(message);append('系统',message);
   // Never silently repeat an issued or ambiguous write.
   if(!unknown&&!ex?.partial?.length&&ex?.code!=='E_CANCELLED'&&!draftRef.current){
    draftRef.current=request;setDraft(request);
   }
  }).finally(()=>{
   if(!current())return;
   runRef.current=null;
   inFlight.current=false;abortRef.current=null;phaseRef.current='idle';
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

 const trigger=headerTarget?createPortal(<button ref={triggerRef} type="button"
   className="sidebar-tool-icon-action od-icon-button od-conversation-frame-trigger"
   aria-label="AI 对话" title="打开或收起 AI 对话" aria-pressed={open} aria-expanded={open}
   aria-controls="opendesk-conversation-dock" onClick={toggle}>
   <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5c0 4.6-3.9 8.5-8.8 8.5a10 10 0 0 1-4.2-.9L3 21l1.5-4.5A8.1 8.1 0 0 1 3 11.5C3 7 7 3 12.2 3s8.8 4 8.8 8.5Z"/>
   </svg>
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
    <button type="button" className="od-conversation-close" aria-label="收起对话"
     title="收起对话" onClick={close}>
     <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
    </button>
   </div>
   <div ref={logRef} className="od-conversation-log" role="log" aria-live="polite"
    aria-label="对话及已核实操作结果">
    <ConversationTranscript rows={rows} entryClassName="od-conversation-entry" showSpeaker={false}/>
   </div>
   {(error||needsReview)&&<div className="od-conversation-feedback" tabIndex={0} aria-label="对话状态详情">
    {error&&<p className="od-conversation-error" role="alert">{error}</p>}
    {needsReview&&<p className="od-conversation-error" role="status">
     上次写入结果不确定。请先刷新并核对上方书签，再继续操作。
    </p>}
   </div>}
   <form className="od-conversation-composer" onSubmit={send}>
    <label className="od-conversation-sr" htmlFor="od-conversation-input">对话输入</label>
    <ConversationInput id="od-conversation-input" inputRef={inputRef} value={draft}
     className="od-conversation-input" rows={1} maxLength={4000} placeholder={placeholder}
     onChange={e=>setDraft(e.target.value)}
     onCompositionStart={()=>{composingRef.current=true;}}
     onCompositionEnd={()=>{composingRef.current=false;}}
     onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&
      !composingRef.current&&e.nativeEvent.keyCode!==229){e.preventDefault();send(e);}}}/>
    {busy?<OpenDeskIconButton className="od-conversation-action od-conversation-action--stop" type="button"
      title="停止后续操作" label="停止对话" onClick={stop}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
     </OpenDeskIconButton>:
     <OpenDeskIconButton className="od-conversation-action od-conversation-action--primary" type="submit"
      title="发送消息" label="发送" onClick={send}
      disabled={!draft.trim()||needsReview||!controller?.request}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-7 7 7-7 7 7"/></svg>
     </OpenDeskIconButton>}
   </form>
  </section>
 </div>;
}
