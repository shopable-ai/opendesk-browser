import * as React from 'react';
import {MyControl} from './my-controls.tsx';
import {MyTaskParams,MyTaskHistory} from './my-sections.tsx';
import {TaskGlyph} from './tasks.tsx';
import {Button,IconButton} from '../components/ui/button.tsx';

// One trusted parameter dialog shared by "我的" and Web Flow. TaskWorkbench owns execution.
export function TaskRunSheet({view}){
  React.useSyncExternalStore(view.subscribe,view.getSnapshot,view.getSnapshot);
  const sheet=view.data.taskSheetRequest;
  const tasks=view.data.taskRows||{},selectedId=tasks.selectedId;
  const selected=tasks.rows?.find(row=>row.taskId===selectedId);
  const isWebflow=sheet?.source==='webflow',stage=view.data.taskSheetStage||'editing';
  const editingDisabled=Boolean(isWebflow&&stage!=='editing');
  const hasParams=(view.data.taskParams||[]).length>0;
  const status=view.field('task-status').text||'';
  const fieldExplainsStatus=status&&(view.field('task-params-json').error===status||(view.data.taskParams||[]).some(({name})=>
    view.field('task-param-'+name).error?.endsWith(status)));
  const dialog=React.useRef(null),composing=React.useRef(false),focusInvalid=React.useRef(false);
  const open=Boolean(sheet&&tasks.identity&&sheet.identity.taskId===selectedId&&
    ['taskId','version','manifestHash','generation','installationId'].every(key=>tasks.identity[key]===sheet.identity[key]));
  const close=()=>{composing.current=false;view.actions.taskRunSheetClose?.();};
  React.useLayoutEffect(()=>{
    const node=dialog.current;
    if(open&&!node?.open){
      node.showModal();
      node.querySelector(view.data.taskParamsMode==='json'?'#task-params-json':'input,select,textarea')?.focus();
    }else if(!open&&node?.open)node.close();
  },[open,sheet?.requestId]);
  React.useEffect(()=>()=>{if(dialog.current?.open)dialog.current.close();},[]);
  React.useLayoutEffect(()=>{
    if(focusInvalid.current){
      focusInvalid.current=false;
      dialog.current?.querySelector('[aria-invalid="true"]')?.focus();
    }
  });
  const run=event=>{
    if(composing.current||event.nativeEvent.isComposing)return;
    const accepted=isWebflow
      ?view.actions.taskRunSheetConfirm?.(event.nativeEvent,sheet?.identity)
      :view.actions.taskRunClick?.(event.nativeEvent,sheet?.identity);
    if(accepted===true&&!isWebflow)close();
    else if(sheet)focusInvalid.current=true;
  };
  const prepare=event=>{
    if(composing.current||event.nativeEvent.isComposing)return;
    void view.actions.taskRunSheetPrepare?.(event.nativeEvent,sheet?.identity);
  };
  const cancelPrepared=event=>{
    if(composing.current||event.nativeEvent.isComposing)return;
    void view.actions.taskRunSheetCancel?.(event.nativeEvent,sheet?.identity);
  };
  const query=event=>{if(event.nativeEvent?.isTrusted)void view.actions.taskRunSheetQuery?.(event.nativeEvent,sheet?.identity);};
  const stop=event=>{if(event.nativeEvent?.isTrusted)void view.actions.taskRunSheetStop?.(event.nativeEvent,sheet?.identity);};
  const runButton=<MyControl view={view} as="button" id="task-run" type="button" className="od-button od-button--primary" onClick={run}>运行任务</MyControl>;
  return <>
{/* The native modal stays mounted: opening/closing never replaces form nodes,
    drafts or IME state. Chromium owns modal focus, inertness and focus return. */}
<dialog ref={dialog} id="task-parameters-sheet" className="task-params-sheet" aria-labelledby="task-parameters-title" aria-describedby="task-parameters-description"
  onClose={()=>{if(view.data.taskSheetRequest)close();}}
  onCancel={event=>{event.preventDefault();if(!composing.current)close();}}
  onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}}
  onKeyDownCapture={event=>{
    if((event.key==='Escape'||event.key==='Enter')&&(composing.current||event.nativeEvent.isComposing||event.repeat)){
      event.preventDefault();event.stopPropagation();
    }
  }}>
<header className="task-params-sheet-heading">
<span className="task-card-icon"><TaskGlyph/></span>
<div><p className="task-params-sheet-kicker">参数与运行</p><h2 id="task-parameters-title">{sheet?.title||selected?.title||'当前任务'}</h2></div>
<IconButton className="od-icon-button--quiet" label="关闭任务参数" onClick={close}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></IconButton>
</header>
<div className="task-params-sheet-content">
{hasParams&&<div className="task-params-toolbar">
<span className="task-params-section-label">任务参数 <span>{view.data.taskParams.length}</span></span>
<div className="task-params-mode od-segmented" role="group" aria-label="参数编辑方式">
{[['form','表单'],['json','JSON']].map(([mode,label])=><Button key={mode} variant="quiet"
  aria-pressed={(view.data.taskParamsMode||'form')===mode} disabled={editingDisabled} onClick={()=>view.actions.taskParamsModeChange?.(mode)}>{label}</Button>)}
</div>
</div>}
<p id="task-parameters-description" className="hint">{isWebflow?'先保存并核对参数；只有第二次明确点击“确认执行一次”才会启动任务。':hasParams?'关闭后保留草稿；点击“运行任务”才会执行。':'此任务无需填写参数，可直接运行。'}</p>
<MyControl view={view} as="form" id="task-params-form" onInput={event=>view.actions.taskParamsFormInput?.(event.nativeEvent)} onChange={event=>view.actions.taskParamsFormChange?.(event.nativeEvent)} onSubmit={event=>view.actions.taskParamsFormSubmit?.(event.nativeEvent)} autoComplete="off" aria-label="任务参数">
<fieldset className="task-params-editor-fields" disabled={editingDisabled}><div className="task-param-fields" hidden={view.data.taskParamsMode==='json'}>
<MyTaskParams view={view}/>
</div>
<div className="task-param-json" hidden={view.data.taskParamsMode!=='json'}>
<label htmlFor="task-params-json" className="od-field-label">参数 JSON</label>
<MyControl view={view} as="textarea" controlBase="aria" id="task-params-json" className="od-field" rows={8} spellCheck={false} maxLength={65536}
  aria-invalid={view.field('task-params-json').error?'true':undefined}
  aria-describedby={view.field('task-params-json').error?'task-params-json-error':undefined}
  onInput={()=>{
    const field=view.field('task-params-json'),status=view.field('task-status');
    if(field.error&&status.text===field.error)status.text='';
    field.error='';view.publish();
  }}/>
{view.field('task-params-json').error&&<p id="task-params-json-error" className="od-field-help task-param-error" role="alert">{view.field('task-params-json').error}</p>}
</div></fieldset>
</MyControl>
{sheet&&<p className="task-params-sheet-status hint" role="status">{view.data.taskRunBlockedReason||''}{isWebflow&&view.data.taskSheetMessage?' '+view.data.taskSheetMessage:''}{!fieldExplainsStatus&&status?' '+status:''}</p>}
{isWebflow&&['submitted','unknown','retired'].includes(stage)&&<details className="od-disclosure task-sheet-history"><summary>可信运行记录（含历史任务）</summary><MyTaskHistory rows={view.data.taskHistory||[]}/></details>}
</div>
<footer className="task-params-sheet-actions"><Button variant="quiet" onClick={close}>关闭</Button>{isWebflow&&stage==='ready'&&<Button variant="quiet" onClick={cancelPrepared}>取消未运行步骤</Button>}{isWebflow&&['submitted','unknown'].includes(stage)&&<Button variant="secondary" onClick={query}>查询原请求</Button>}{isWebflow&&['submitted','unknown'].includes(stage)&&<Button variant="quiet" onClick={stop}>停止原请求</Button>}{isWebflow&&stage==='editing'?<Button variant="primary" onClick={prepare} disabled={Boolean(view.data.taskRunBlockedReason)}>保存并核对</Button>:isWebflow&&stage==='ready'?<MyControl view={view} as="button" id="task-run" type="button" className="od-button od-button--primary" onClick={run}>确认执行一次</MyControl>:!isWebflow?runButton:null}</footer>
</dialog>
  </>;
}
