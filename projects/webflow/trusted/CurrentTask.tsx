import * as React from 'react';
import {Button} from '../../../src/ui/react/components/ui/button.tsx';
import {autoParameterOptions} from '../src/authorization-policy.js';

// This fixed component receives only a compiled Host controller. The installed
// tool package and its iframe never receive this controller or its projection.
// One owner per mounted settings surface; standalone consumers keep polling.
export function useWebflowBridgeState(controller,enabled=true){
 const [snapshot,setSnapshot]=React.useState<any>({controller:null,view:null,error:'',busy:false,polling:false,revision:0});
 const lifecycle=React.useRef<any>(null);
 React.useEffect(()=>{
  if(!enabled)return;
  const life={active:true,sequence:0,pending:null,mutation:null,readPromise:null};lifecycle.current=life;
  setSnapshot({controller,view:null,error:'',busy:false,polling:false,revision:0});
  const invalidate=()=>{
   life.sequence++;life.pending?.();life.pending=null;life.mutation=null;
   if(life.active)setSnapshot(current=>({controller,view:null,error:'监听状态未确认，请重新检查',busy:false,polling:false,revision:current.revision+1}));
  };
  const unsubscribe=controller?.subscribeBridgeContext?.(invalidate);
  void read();
  const timer=controller?.readBridgeState?setInterval(()=>void read(true),1200):undefined;
  return ()=>{life.active=false;life.sequence++;life.pending?.();clearInterval(timer);unsubscribe?.();};
 },[controller,enabled]);
 const execute=async(operation,replace=false,control=null,background=false)=>{
  const life=lifecycle.current;
  // Only cancellation of the same original control request may supersede a
  // pending mutation. Refresh has no control identity and remains exclusive.
  const stopping=control?.action==='cancel'&&control.requestId&&
   life?.mutation?.kind==='control'&&life.mutation.action!=='cancel'&&
   life.mutation.identity===control.identity;
  if(!enabled||!life?.active||(life.pending&&(!replace||(life.mutation&&!stopping))))return;
  if(replace){life.sequence++;life.pending?.();}
  const ticket=++life.sequence;
  let timer;
  let cancel;
  const cancelled=new Promise(resolve=>{cancel=()=>resolve(null);});
  life.pending=cancel;life.mutation=replace?(control?{kind:'control',...control}:{kind:'refresh'}):null;
  const valid=()=>life.active&&life===lifecycle.current&&ticket===life.sequence;
  // Routine reads keep the last verified presentation. The pending ticket still
  // serializes reads; context changes, failures and timeouts invalidate it as usual.
  setSnapshot(current=>({...current,busy:!background,polling:background}));
  try{
   const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('读取超时，请重新检查；不会自动重试操作')),8000);});
   // Call synchronously so mutations retain the original native gesture.
   const next=await Promise.race([operation(),timeout,cancelled]);
   if(valid())setSnapshot(current=>({controller,view:next,error:'',busy:false,polling:false,revision:current.revision}));
   return valid()?next:null;
  }catch(ex){
   if(valid())setSnapshot(current=>({controller,view:current.view?.history?.length?{history:current.view.history,work:{state:'unknown',reason:'读取失败，请核对原请求记录'}}:null,error:String(ex?.message||ex),busy:false,polling:false,revision:current.revision+1}));
   return null;
  }finally{clearTimeout(timer);if(valid()){life.pending=null;life.mutation=null;}}
 };
 const read=(background=false)=>{
  if(!controller?.readBridgeState)return Promise.resolve(null);
  const life=lifecycle.current;
  if(life?.pending){
   // A manual check joins the current read and acknowledges the gesture. Do not
   // start a duplicate request or supersede a pending mutation.
   if(!background&&!life.mutation){
    setSnapshot(current=>({...current,busy:true,polling:false}));
    return life.readPromise??Promise.resolve(null);
   }
   return Promise.resolve(null);
  }
  const promise=execute(()=>controller.readBridgeState(),false,null,background);
  if(life)life.readPromise=promise;
  return promise;
 };
 return {view:snapshot.controller===controller?snapshot.view:null,
  error:snapshot.controller===controller?snapshot.error:'',busy:snapshot.controller===controller&&snapshot.busy,
  polling:snapshot.controller===controller&&snapshot.polling,
  revision:snapshot.revision,read,execute};
}

export function WebflowCurrentTask({controller,tasks=[],onSummary=null,onAuthorizationChange=null,bridge=null}){
 const ownBridge=useWebflowBridgeState(controller,!bridge);
 const state=bridge??ownBridge;
 const {view,error,read}=state;
 const [commandError,setCommandError]=React.useState('');
 const [working,setWorking]=React.useState(''),[draft,setDraft]=React.useState<any>(null);
 const [viewingRun,setViewingRun]=React.useState('');
 const commandSequence=React.useRef(0),lock=React.useRef(false);
 React.useEffect(()=>{
  commandSequence.current++;lock.current=false;setWorking('');setCommandError('');
  return ()=>{commandSequence.current++;};
 },[controller,state.revision]);
 React.useEffect(()=>{
  setDraft(current=>current?.identity===view?.source?.documentId+':'+view?.session?.requestId?current:
   view?.session?{...view.session.fields,identity:view.source?.documentId+':'+view.session.requestId}:null);
 },[view]);
 const command=async(action,event,fields?,parameterPolicy?)=>{
  if(event?.isTrusted!==true){setCommandError('请在侧栏亲自点击操作。');return;}
  if(!controller?.controlBridge||!view?.source||!view.session||lock.current&&action!=='cancel')return;
  const source=view.source,requestId=view.session.requestId;
  let ticket;
  try{
   const next=await state.execute(()=>{
    ticket=++commandSequence.current;lock.current=true;
    setWorking(action);setCommandError('');
    return controller.controlBridge({source,requestId,action,
     ...(action==='approve-range'?{pendingAuto:view.session.pendingAuto}:{}),
     ...(parameterPolicy?{parameterPolicy}:{}),...(fields?{fields}:{})},event);
   },true,{action,requestId,identity:JSON.stringify([source,requestId])});
   if(next&&ticket!==undefined&&ticket===commandSequence.current&&action==='approve-range')onAuthorizationChange?.();
  }finally{if(ticket!==undefined&&ticket===commandSequence.current){setWorking('');lock.current=false;}}
 };
 const showBackgroundRun=async(row,event)=>{
  if(event?.isTrusted!==true||!controller?.activateBackgroundRun||!view?.source||viewingRun)return;
  if(row?.receipt?.execution!=='running'||row.status!=='consumed'||!row.receipt.runId||
    row.source?.tabId!==view.source.tabId||row.source.documentId!==view.source.documentId||
    row.source.url!==view.source.url)return;
  setViewingRun(row.requestId);setCommandError('');
  try{await controller.activateBackgroundRun({source:view.source,requestId:row.requestId,
    runId:row.receipt.runId},event);}
  catch(error){setCommandError(error?.message||'原执行页切换结果未知；不会重试激活。');}
  finally{setViewingRun('');}
 };
 const session=view?.session,receipt=view?.receipt;
 const backgroundRun=view?.history?.find(row=>row.requestId===session?.requestId&&
  row?.receipt?.execution==='running'&&row.receipt?.runId&&row.status==='consumed'&&
  row.source?.tabId===view.source?.tabId&&row.source?.documentId===view.source?.documentId&&
  row.source?.url===view.source?.url);
 const waiting=view?.listener?.state==='ready'&&view?.work?.state==='idle'&&!error;
 const noSessionTitle=view?.work?.state==='running'?'任务执行中，请核对原请求':
  waiting?'等待 ChatGPT 新任务':'任务状态未确认';
 const v2Pending=session?.pendingAuto?.protocol==='webflow.task.intent.v2';
 const chatgptDraftPending=v2Pending&&session?.pendingAuto?.scope?.taskId==='chatgpt.conversation.create';
 const options=!v2Pending&&session?.pendingAuto&&autoParameterOptions(tasks.find(task=>task.taskId===session.pendingAuto.scope?.taskId));
 const executionLabel={validating:'核验中',starting:'正在启动',completed:'已完成',running:'执行中',failed:'执行失败',stopped:'已停止',unknown:'结果未知'};
 React.useEffect(()=>{
  onSummary?.(error?'任务状态未确认，请打开运行与授权查看':
   session?.status||(!view?'正在读取任务状态…':noSessionTitle));
 },[session?.status,session?.error,session?.requestId,Boolean(view),error,noSessionTitle,onSummary]);
 const labels={'prepare':'建立请求','approve-once':'批准本次自动执行','run':'执行本次任务',
  'cancel':'停止/取消原请求','adopt':'采用对话任务','view':'查看执行页面','preapprove':'预批准一次 · 5 分钟'};
 const action=name=><Button key={name} data-webflow-action={name} variant={name==='cancel'?'danger':name==='run'?'primary':'secondary'}
  disabled={!session?.actions?.[name]||working==='cancel'||Boolean(working)&&name!=='cancel'}
  onClick={event=>void command(name,event.nativeEvent)}>{labels[name]}</Button>;
 const edit=(key,value)=>setDraft(current=>({...current,[key]:value}));
 return <section className="od-stack" aria-label="Web Flow 当前任务" style={{gap:'var(--space-3)'}}>
  <div className="od-toolbar" style={{justifyContent:'space-between'}}>
   <strong className="od-field-label">任务状态</strong>
   <Button variant="quiet" onClick={()=>void read()}>{session?.requestId?'查询原请求':'刷新状态'}</Button></div>
  {(error||commandError)&&<p role="alert" className="od-field-error">{error||commandError}</p>}
  {view?.historyRead?.url&&view.historyRead.url===view.source?.url&&<div data-webflow-history-query className="od-note">
   <p>已查询原请求账本：{view.history?.length??0} 条。{!view.history?.length&&'未找到记录不代表旧任务未执行；不会重跑或补发。'}</p>
   <p style={{overflowWrap:'anywhere'}}>查询范围：{view.historyRead.url}</p>
  </div>}
  {view?.history?.length>0&&<details data-webflow-original-records className="od-disclosure od-disclosure--flat">
   <summary>后台原请求与对账（{view.history.length}）</summary>
   <p className="od-note">以下是原请求的持久记录。未知表示执行或回传尚未确认；刷新只查询，不会重跑或补发。原文档关闭或浏览器重启后不保证继续运行。</p>
   <p className="od-note">状态未知时可先关闭自动运行或撤销该任务批准，再核对原 Run / Result 与目标网站的实际结果；不要重复发送旧指令。</p>
   {view.history.map(row=><div key={row.requestId} className="od-stack">
    <p className="od-note">{row.scope.taskId} · {new Date(row.createdAt).toLocaleString()} ·
     {executionLabel[row.receipt.execution]||'结果未知，请核对原记录'} ·
     {row.receipt.delivery==='confirmed'?'原聊天交付已确认':row.receipt.delivery==='unknown'?'回传未知，禁止补发':'尚未确认交付'}</p>
    <pre className="od-result" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(row,null,2)}</pre>
   </div>)}
  </details>}
  {!session?<div className="od-surface od-surface--padded od-stack" role="status">
   <strong>{noSessionTitle}</strong>
   {waiting?<p className="od-note">先在“使用说明”完成一次 ChatGPT 能力接入，再核对任务批准并开启自动运行。之后在该项目正常发送需求；本条是否执行、进度和结果将在这里显示。</p>:<p className="od-note">请先核对独立的监听状态和原请求记录；监听不可用不代表任务未执行。未知结果不会自动重放或补发。</p>}
  </div>:<>
   <div className="od-surface od-surface--padded od-stack" style={{gap:'var(--space-3)'}}>
    <div className="od-form-field">
     <strong className="od-field-label">原对话</strong>
     <p className="od-note" style={{overflowWrap:'anywhere',margin:0}}>{session.url}</p>
    </div>
    <p data-webflow-current-status tabIndex={-1} role="status" className={session.error?'od-field-error':'od-body'}
     style={{whiteSpace:'pre-wrap',margin:0,lineHeight:1.65}}>{session.status}</p>
    {backgroundRun&&controller?.activateBackgroundRun&&<Button variant="secondary"
     data-webflow-action="activate-background-run" disabled={Boolean(viewingRun)}
     onClick={event=>void showBackgroundRun(backgroundRun,event.nativeEvent)}>
     {viewingRun===backgroundRun.requestId?'核对执行页…':'前台显示本次任务页面'}
    </Button>}
   </div>
   {session.selection&&<p className="od-body" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{session.selection}</p>}
   {session.pendingAuto&&<div className="od-surface od-surface--padded od-stack" aria-label="任务范围审核">
    <strong>待批准 · 尚未执行</strong>
    <p className="od-note">{v2Pending?
     'V2 每条候选必须在可信侧栏独立批准一次，绝不沿用 V1 任务授权，也不会保存长期通配许可。':
     options?'现有授权仅限固定输入或尚未批准此任务。可一次允许更换关键词，以后同范围自动执行。':
     '本任务的目标、参数或安装版本尚未获准。请审阅后执行。'}</p>
    <p className="od-body" style={{overflowWrap:'anywhere'}}>目标：{session.pendingAuto.scope.targetUrl}</p>
    {chatgptDraftPending&&<p className="od-note" role="note">当前仅能保留未发送草稿，send 默认 false。自动发送、模型及推理强度更改、持久会话链接核验尚未完成；空白草稿没有真实 /c/ 地址。</p>}
    {options&&<p className="od-note">{options.description}目标、任务版本或权限变化后仍需审核。</p>}
    <strong className="od-field-label">本次输入</strong>
    <pre className="od-result" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(session.pendingAuto.scope.args,null,2)}</pre>
    {options&&<Button variant="primary" disabled={Boolean(working)} onClick={event=>void command('approve-range',event.nativeEvent,undefined,
     {mode:'schema',variableKeys:options.variableKeys})}>允许更换关键词并执行</Button>}
    <details className="od-disclosure od-disclosure--flat"><summary>来源与安装身份</summary>
    <pre className="od-result" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify({
     candidate:session.pendingAuto.candidate,source:view.source,...session.pendingAuto.scope},null,2)}</pre>
    </details>
    {options?<details className="od-disclosure od-disclosure--flat"><summary>高级：仅允许此关键词</summary>
     <p className="od-note">仅保存这组固定输入，并替换旧授权；下次换关键词仍需批准。</p>
     <Button disabled={Boolean(working)} onClick={event=>void command('approve-range',event.nativeEvent)}>批准此精确范围并执行</Button>
    </details>:<Button variant="primary" disabled={Boolean(working)} onClick={event=>void command('approve-range',event.nativeEvent)}>{chatgptDraftPending?'批准创建未发送的 ChatGPT 草稿':v2Pending?'批准本条 V2 候选并执行一次':'批准此精确范围并执行'}</Button>}
   </div>}
   {(session.actions?.cancel||session.actions?.run||session.actions?.view)&&<div className="od-toolbar" style={{flexWrap:'wrap'}}>
    {session.actions?.cancel&&action('cancel')}{session.actions?.run&&action('run')}{session.actions?.view&&action('view')}</div>}
   {session.viewStatus&&<p role="status" className="od-note">{session.viewStatus}</p>}
   {receipt&&<div className="od-stack" aria-label="同次运行回执">
    <dl className="od-body" style={{display:'grid',gridTemplateColumns:'auto minmax(0,1fr)',gap:'var(--space-2)',margin:0,overflowWrap:'anywhere'}}>
     <dt>脚本执行</dt><dd>{executionLabel[receipt.execution]||'状态待核查'}</dd>
     <dt>持久结果</dt><dd>{receipt.persistence==='verified'?'已核实同一 Run / Result':'尚未核实'}</dd>
     <dt>资源释放</dt><dd>{receipt.release==='released'?'已释放':receipt.release==='unknown'?'未知，请查询原请求':'尚未确认'}</dd>
     <dt>原聊天交付</dt><dd>{receipt.delivery==='confirmed'?'已确认新增结果消息':receipt.delivery==='unknown'?'结果未知，请查询原请求':receipt.delivery==='submitted'?'已提交，等待原聊天确认':'尚未发送'}</dd>
     <dt>AI 续答</dt><dd>{receipt.aiReplyObserved===true?'已观察到新回复':receipt.aiReplyObserved===false?'尚未观察到新回复':'尚未确认'}</dd>
    </dl>
    {receipt.error&&<p role="alert" className="od-field-error">{receipt.error.code}：{receipt.error.message}</p>}
    {receipt.value&&<details className="od-disclosure od-disclosure--flat"><summary>查看完整结果（原始数据）</summary>
     <pre className="od-result" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:300,overflow:'auto'}}>{JSON.stringify(receipt.value,null,2)}</pre></details>}
   </div>}
   {session.requestId&&<details className="od-disclosure od-disclosure--flat"><summary>本次身份</summary>
    <pre className="od-result" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify({candidateId:session.candidateId,
     requestId:session.requestId,runId:session.runId,resultId:session.resultId},null,2)}</pre></details>}
   <details className="od-disclosure od-disclosure--flat"><summary>手动与一次批准</summary>
    <div className="od-stack">
     <p className="od-field-help">已批准的自动任务无需操作本区。建立请求只填入空草稿，仍需在 ChatGPT 亲自发送；未知结果仅查询或停止原请求。</p>
     {draft&&<>
      <label className="od-form-field">选择已安装脚本<select className="od-field" value={draft.task} disabled={session.fields.disabled||Boolean(working)}
       onChange={event=>edit('task',event.currentTarget.value)}>{session.tasks.map(task=><option key={task.value} value={task.value}>{task.label}</option>)}</select></label>
      <label className="od-form-field">关键词<input className="od-field" value={draft.query} maxLength={120} disabled={session.fields.disabled||Boolean(working)} onChange={event=>edit('query',event.currentTarget.value)}/></label>
      <label className="od-form-field">精确目标地址<input className="od-field" value={draft.target} maxLength={2048} disabled={session.fields.disabled||Boolean(working)} onChange={event=>edit('target',event.currentTarget.value)}/></label>
      <label className="od-form-field">参数 JSON<textarea className="od-field" value={draft.args} maxLength={2048} rows={4} disabled={session.fields.disabled||Boolean(working)} onChange={event=>edit('args',event.currentTarget.value)}/></label>
      <Button disabled={session.fields.disabled||Boolean(working)} onClick={event=>void command('fields',event.nativeEvent,
       {task:draft.task,query:draft.query,target:draft.target,args:draft.args})}>应用输入 / 读取所选脚本</Button>
     </>}
     <div className="od-toolbar" style={{flexWrap:'wrap'}}>{['prepare','adopt','approve-once','preapprove'].map(action)}</div>
    </div>
   </details>
  </>}
 </section>;
}
