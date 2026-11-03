import * as React from 'react';
import {Button} from '../../../src/ui/react/components/ui/button.tsx';

// This fixed component receives only a compiled Host controller. The installed
// tool package and its iframe never receive this controller or its projection.
export function WebflowCurrentTask({controller,onSummary=null}){
 const [view,setView]=React.useState<any>(null),[error,setError]=React.useState('');
 const [working,setWorking]=React.useState(''),[draft,setDraft]=React.useState<any>(null);
 const sequence=React.useRef(0),mounted=React.useRef(true),lock=React.useRef(false),reading=React.useRef(false);
 const accept=React.useCallback(next=>{
  setView(next);setError('');
  setDraft(current=>current?.identity===next.source?.documentId+':'+next.session?.requestId?current:
   next.session?{...next.session.fields,identity:next.source.documentId+':'+next.session.requestId}:null);
 },[]);
 const read=React.useCallback(async()=>{
  if(reading.current)return;reading.current=true;
  const ticket=++sequence.current;
  try{const next=await controller.readBridgeState();if(mounted.current&&ticket===sequence.current)accept(next);}
  catch(ex){if(mounted.current&&ticket===sequence.current){setView(null);setError(String(ex?.message||ex));}}
  finally{reading.current=false;}
 },[controller,accept]);
 React.useEffect(()=>{
  mounted.current=true;void read();
  const timer=setInterval(()=>void read(),1200);
  return ()=>{mounted.current=false;sequence.current++;clearInterval(timer);};
 },[read]);
 const command=async(action,event,fields?)=>{
  if(event?.isTrusted!==true){setError('请在侧栏亲自点击操作。');return;}
  if(!view?.source||!view.session||lock.current&&action!=='cancel')return;
  if(action!=='cancel')lock.current=true;
  setWorking(action);setError('');
  try{
   const next=await controller.controlBridge({source:view.source,requestId:view.session.requestId,action,
    ...(fields?{fields}:{})},event);
   if(mounted.current){sequence.current++;accept(next);}
  }catch(ex){if(mounted.current)setError(String(ex?.message||ex)+'；请查询原请求，不会自动重试。');}
  finally{if(mounted.current)setWorking('');lock.current=false;}
 };
 const session=view?.session,receipt=view?.receipt;
 const executionLabel={validating:'核验中',starting:'正在启动',completed:'已完成',running:'执行中',failed:'执行失败',stopped:'已停止',unknown:'结果未知'};
 React.useEffect(()=>{
  onSummary?.(error?'任务状态未确认，请打开运行与授权查看':
   session?.status||(!view?'正在读取任务状态…':'等待 ChatGPT 新任务'));
 },[session?.status,session?.error,session?.requestId,Boolean(view),error,onSummary]);
 const labels={'prepare':'建立请求','approve-once':'批准本次自动执行','run':'执行本次任务',
  'cancel':'停止/取消原请求','adopt':'采用对话任务','view':'查看执行页面','preapprove':'预批准一次 · 5 分钟'};
 const action=name=><Button key={name} variant={name==='cancel'?'danger':name==='run'?'primary':'secondary'}
  disabled={!session?.actions?.[name]||Boolean(working)&&name!=='cancel'}
  onClick={event=>void command(name,event.nativeEvent)}>{labels[name]}</Button>;
 const edit=(key,value)=>setDraft(current=>({...current,[key]:value}));
 return <section className="od-stack" aria-label="Web Flow 当前任务">
  <div className="od-toolbar" style={{justifyContent:'flex-end'}}>
   <Button variant="quiet" onClick={()=>void read()}>{session?.requestId?'查询原请求':'刷新状态'}</Button></div>
  {error&&<p role="alert" className="od-field-error">{error}</p>}
  {!session?<div className="od-surface od-surface--padded od-stack" role="status">
   <strong>等待 ChatGPT 新任务</strong>
   <p className="od-note">先在“使用说明”完成一次 ChatGPT 能力接入，再核对任务批准并开启自动运行。之后在该项目正常发送需求；本条是否执行、进度和结果将在这里显示。</p>
  </div>:<>
   <p className="od-note" style={{overflowWrap:'anywhere'}}>原对话：{session.url}</p>
   <p role="status" className={session.error?'od-field-error':'od-note'} style={{whiteSpace:'pre-wrap'}}>{session.status}</p>
   {session.selection&&<p className="od-body" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{session.selection}</p>}
   {(session.actions?.cancel||session.actions?.run||session.actions?.view)&&<div className="od-toolbar">
    {session.actions?.cancel&&action('cancel')}{session.actions?.run&&action('run')}{session.actions?.view&&action('view')}</div>}
   {session.viewStatus&&<p role="status" className="od-note">{session.viewStatus}</p>}
   {receipt&&<div className="od-stack" aria-label="同次运行回执">
    <dl className="od-body" style={{display:'grid',gridTemplateColumns:'auto minmax(0,1fr)',gap:'var(--space-2)',margin:0,overflowWrap:'anywhere'}}>
     <dt>脚本执行</dt><dd>{executionLabel[receipt.execution]||'状态待核查'}</dd>
     <dt>持久结果</dt><dd>{receipt.persistence==='verified'?'已核实同一 Run / Result':'尚未核实'}</dd>
     <dt>资源释放</dt><dd>{receipt.release==='released'?'已释放':receipt.release==='unknown'?'未知，请查询原请求':'尚未确认'}</dd>
     <dt>原聊天交付</dt><dd>{receipt.delivery==='confirmed'?'已确认新增结果消息':receipt.delivery==='unknown'?'结果未知，请查询原请求':receipt.delivery==='submitted'?'已提交，等待原聊天确认':'尚未发送'}</dd>
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
     <div className="od-toolbar">{['prepare','adopt','approve-once','preapprove'].map(action)}</div>
    </div>
   </details>
  </>}
 </section>;
}
