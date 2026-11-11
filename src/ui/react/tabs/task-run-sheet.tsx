import * as React from 'react';
import {MyControl} from './my-controls.tsx';
import {MyTaskParams} from './my-sections.tsx';
import {TaskGlyph} from './tasks.tsx';
import {Button,IconButton} from '../components/ui/button.tsx';

// Trusted presentation only. TaskWorkbench/Host owns selection, drafts,
// captured installation identity, phase transitions and all execution authority.
// taskRunSheet: null | {identity,title,source:'my'|'tool',
//   phase:'editing'|'preparing'|'prepared'|'submitted'|'unknown'|'cancelled'|'settled',
//   preparationId?,status?,busy?,trigger?}
// trigger is a trusted host DOM focus target, never sandbox request data.
// taskSheetClose(); taskSheet{Prepare,Confirm}Click(event,identity);
// taskSheet{Query,Stop,Cancel}Click(event). The owner guards stale identities.
export function TaskRunSheet({view}){
  React.useSyncExternalStore(view.subscribe,view.getSnapshot,view.getSnapshot);
  const request=view.data.taskRunSheet;
  const dialog=React.useRef(null),composing=React.useRef(false),focusInvalid=React.useRef(false);
  const opening=React.useRef(null);
  const tool=request?.source==='tool',phase=request?.phase||'editing';
  const blocked=!request||request.busy||request.recoveryOnly||!(tool?['editing','prepared']:['editing']).includes(phase);
  const fieldsDisabled=Boolean(!request||request.busy||(tool&&phase!=='editing'));
  const action=tool?(phase==='editing'?view.actions.taskSheetPrepareClick:
    phase==='prepared'?view.actions.taskSheetConfirmClick:null):view.actions.taskRunClick;
  const result=request?.snapshot?.results?.find(result=>result.runId===request.snapshot.run?.runId&&result.resultId===request.snapshot.run?.resultId);
  const hasParams=(view.data.taskParams||[]).length>0;
  const status=tool?(request.status||''):(view.field('task-status').text||request?.status||'');
  const fieldExplainsStatus=status&&(view.field('task-params-json').error===status||(view.data.taskParams||[]).some(({name})=>
    view.field('task-param-'+name).error?.endsWith(status)));
  const close=()=>{
    if(!request)return;
    composing.current=false;focusInvalid.current=false;
    view.actions.taskSheetClose?.();
  };
  // Stay mounted outside every hidden Tab/ToolHost. Phase/status publications
  // do not replace the form, reset IME or move focus away from an active field.
  React.useLayoutEffect(()=>{
    const node=dialog.current;
    const key=request?JSON.stringify(request.identity):null;
    if(request){
      if(node.open&&opening.current!==key)node.close();
      if(!node.open){
        composing.current=false;
        request.trigger?.focus({preventScroll:true});
        node.showModal();
        node.querySelector(view.data.taskParamsMode==='json'?'#task-params-json':'input,select,textarea')?.focus();
      }
    }else if(node.open){node.close();composing.current=false;}
    opening.current=key;
    if(focusInvalid.current){
      focusInvalid.current=false;
      node.querySelector('[aria-invalid="true"]')?.focus();
    }
  });
  React.useEffect(()=>{
    const node=dialog.current;
    return ()=>{if(node?.open)node.close();};
  },[]);
  const run=event=>{
    if(blocked||composing.current||event.nativeEvent.isComposing)return;
    // Keep the synchronous trusted gesture chain. Async owners publish pending,
    // errors and the next phase themselves; a Promise is never execution success.
    if(action?.(event.nativeEvent,request.identity)===true&&!tool){
      if(view.data.taskRunSheet===request)close();
    }else focusInvalid.current=true;
  };
  // Chromium owns modal focus, inertness and focus return.
  return (<dialog ref={dialog} id="task-parameters-sheet" className="task-params-sheet" aria-labelledby="task-parameters-title" aria-describedby="task-parameters-description"
  onClose={event=>{if(!event.currentTarget.open)close();}}
  onCancel={event=>{event.preventDefault();event.stopPropagation();if(!composing.current)close();}}
  onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}}
  onKeyDownCapture={event=>{
    if((event.key==='Escape'||event.key==='Enter')&&(composing.current||event.nativeEvent.isComposing||event.repeat)){
      event.preventDefault();event.stopPropagation();
    }
  }}>
<header className="task-params-sheet-heading">
<span className="task-card-icon"><TaskGlyph/></span>
<div><p className="task-params-sheet-kicker">参数与运行</p><h2 id="task-parameters-title">{request?.title||'当前任务'}</h2></div>
<IconButton className="od-icon-button--quiet" label="关闭任务参数" onClick={close}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></IconButton>
</header>
<div className="task-params-sheet-content">
{request?.sites?.length>0&&<p className="hint">适用网站：{request.sites.join('、')}</p>}
{request?.target&&<p className="hint">已核对网页：{request.target.expectedUrl}</p>}
{hasParams&&!request?.recoveryOnly&&<div className="task-params-toolbar">
<span className="task-params-section-label">运行参数</span>
<div className="task-params-mode od-segmented" role="group" aria-label="参数编辑方式">
{[['form','表单'],['json','JSON']].map(([mode,label])=><Button key={mode} variant="quiet"
  aria-pressed={(view.data.taskParamsMode||'form')===mode} disabled={fieldsDisabled} onClick={()=>view.actions.taskParamsModeChange?.(mode)}>{label}</Button>)}
</div>
</div>}
<p id="task-parameters-description" className="hint">{phase==='settled'||phase==='cancelled'?'原请求已结束；请关闭后打开新配置。':request?.recoveryOnly?'原准备参数只读；可查询或取消原请求。':tool?'保存并核对后，需再次点击“确认执行一次”才会执行。':hasParams?'关闭后保留草稿；点击“运行任务”才会执行。':'此任务无需填写参数，可直接运行。'}</p>
{request?.recoveryOnly&&<pre aria-label="原准备参数" className="task-run-result">{JSON.stringify(request.originalParams,null,2)}</pre>}
<fieldset hidden={request?.recoveryOnly} disabled={fieldsDisabled} style={{border:0,margin:0,padding:0,minWidth:0}}>
<MyControl view={view} as="form" id="task-params-form" onInput={event=>view.actions.taskParamsFormInput?.(event.nativeEvent)} onChange={event=>view.actions.taskParamsFormChange?.(event.nativeEvent)} onSubmit={event=>view.actions.taskParamsFormSubmit?.(event.nativeEvent)} autoComplete="off" aria-label="任务参数">
<div className="task-param-fields" hidden={view.data.taskParamsMode==='json'}>
<MyTaskParams view={view} disabled={fieldsDisabled}/>
</div>
<div className="task-param-json" hidden={view.data.taskParamsMode!=='json'}>
<label htmlFor="task-params-json" className="od-field-label">参数 JSON</label>
<MyControl view={view} as="textarea" controlBase="aria" id="task-params-json" disabled={fieldsDisabled} className="od-field" rows={8} spellCheck={false} maxLength={65536}
  aria-invalid={view.field('task-params-json').error?'true':undefined}
  aria-describedby={view.field('task-params-json').error?'task-params-json-error':undefined}
  onInput={()=>{
    const field=view.field('task-params-json'),status=view.field('task-status');
    if(field.error&&status.text===field.error)status.text='';
    field.error='';view.publish();
  }}/>
{view.field('task-params-json').error&&<p id="task-params-json-error" className="od-field-help task-param-error" role="alert">{view.field('task-params-json').error}</p>}
</div>
</MyControl>
</fieldset>
{request&&<p className="task-params-sheet-status hint" role="status">{!tool&&view.data.taskRunBlockedReason||''}{!fieldExplainsStatus&&status?' '+status:''}</p>}
{request?.snapshot&&<section aria-label="原运行结果">
<p role="status">运行状态：{request.snapshot.run?.state||'待核对'} · {request.snapshot.run?.retirementState==='released'?'资源已释放':'资源释放未确认'}</p>
{request.resultText&&<pre className="task-run-result">{request.resultText}</pre>}
{result?.outcome?.error&&<p role="alert">{result.outcome.error.message||result.outcome.error.code}</p>}
</section>}
</div>
<footer className="task-params-sheet-actions"><Button variant="quiet" onClick={close}>{tool?'关闭':'取消'}</Button>{tool&&request?.preparationId&&view.actions.taskSheetQueryClick&&<Button variant="quiet" disabled={request.busy} onClick={event=>view.actions.taskSheetQueryClick(event.nativeEvent)}>查询状态</Button>}
{tool&&request?.preparationId&&['submitted','unknown'].includes(phase)&&view.actions.taskSheetStopClick&&<Button variant="danger" disabled={request.busy} onClick={event=>view.actions.taskSheetStopClick(event.nativeEvent)}>停止</Button>}
{tool&&request?.preparationId&&['editing','preparing','prepared','unknown'].includes(phase)&&view.actions.taskSheetCancelClick&&<Button variant="quiet" disabled={request.busy} onClick={event=>view.actions.taskSheetCancelClick(event.nativeEvent)}>取消准备</Button>}
{(!tool||(['editing','prepared'].includes(phase)&&!request?.recoveryOnly))&&<Button id="task-run" variant="primary" disabled={blocked||(!tool&&(view.field('task-run').disabled||view.field('task-run').hidden))||!action}
  onClick={run}>{tool?(phase==='editing'?'保存并核对':'确认执行一次'):'运行任务'}</Button>}</footer>
</dialog>);
}
