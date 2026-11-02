import * as React from 'react';
import {Button} from '../../../src/ui/react/components/ui/button.tsx';

// This fixed component receives only a compiled Host controller. The installed
// tool package and its iframe never receive this controller or its projection.
export function WebflowCurrentTask({controller}){
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
 const labels={'prepare':'建立请求','approve-once':'批准本次自动执行','run':'执行本次任务',
  'cancel':'停止/取消原请求','adopt':'采用对话任务','view':'查看执行页面','preapprove':'预批准一次 · 5 分钟'};
 const action=name=><Button key={name} variant={name==='cancel'?'danger':name==='run'?'primary':'secondary'}
  disabled={!session?.actions?.[name]||Boolean(working)&&name!=='cancel'}
  onClick={event=>void command(name,event.nativeEvent)}>{labels[name]}</Button>;
 const edit=(key,value)=>setDraft(current=>({...current,[key]:value}));
 return <section className="od-stack" aria-label="Web Flow 当前任务">
  <div className="od-toolbar"><strong className="od-field-label">当前任务</strong>
   <Button variant="quiet" onClick={()=>void read()}>查询原请求</Button></div>
  {error&&<p role="alert" className="od-field-error">{error}</p>}
  {!session?<p role="status" className="od-note">请打开同一窗口中的 ChatGPT 对话。发送指令后，本区显示自动任务的进度与结果。</p>:<>
   <p className="od-note" style={{overflowWrap:'anywhere'}}>原对话：{session.url}</p>
   <p role="status" className={session.error?'od-field-error':'od-note'} style={{whiteSpace:'pre-wrap'}}>{session.status}</p>
   {session.selection&&<p className="od-body" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{session.selection}</p>}
   <div className="od-toolbar">{action('cancel')}{session.actions?.run&&action('run')}{session.actions?.view&&action('view')}</div>
   {session.viewStatus&&<p role="status" className="od-note">{session.viewStatus}</p>}
   {receipt&&<div className="od-stack" aria-label="同次运行回执">
    <dl className="od-body">
     <dt>脚本执行</dt><dd>{receipt.execution}</dd>
     <dt>持久结果</dt><dd>{receipt.persistence==='verified'?'已核实同一 Run / Result':'尚未核实'}</dd>
     <dt>资源释放</dt><dd>{receipt.release}</dd>
     <dt>原聊天交付</dt><dd>{receipt.delivery==='confirmed'?'已确认新增结果消息':receipt.delivery}</dd>
    </dl>
    {receipt.error&&<p role="alert" className="od-field-error">{receipt.error.code}：{receipt.error.message}</p>}
    {receipt.value&&<div className="od-form-field"><strong className="od-field-label">同次脚本结果（原始数据）</strong>
     <pre className="od-result" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:300,overflow:'auto'}}>{JSON.stringify(receipt.value,null,2)}</pre></div>}
   </div>}
   {!receipt&&session.resultPreview&&<pre className="od-result" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{session.resultPreview}</pre>}
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
