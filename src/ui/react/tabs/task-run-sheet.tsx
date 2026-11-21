import * as React from 'react';
import {MyControl} from './my-controls.tsx';
import {MyTaskParams} from './my-sections.tsx';
import {TaskGlyph} from './tasks.tsx';
import {Button,IconButton} from '../components/ui/button.tsx';

// Trusted presentation only. TaskWorkbench/Host owns selection, drafts,
// captured installation identity, phase transitions and all execution authority.
// taskRunSheet: null | {identity,title,source:'my'|'tool'|'page',
//   phase:'editing'|'preparing'|'prepared'|'submitted'|'unknown'|'cancelled'|'settled',
//   preparationId?,status?,busy?,trigger?}
// trigger is a trusted host DOM focus target, never sandbox request data.
// taskSheetClose(); taskSheet{Prepare,Confirm}Click(event,identity);
// taskSheet{Query,Stop,Cancel}Click(event). The owner guards stale identities.
// Icons decorate the existing trusted actions; never replace their text or handlers.
function SheetActionIcon({kind}) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {kind==='close'?<path d="M18 6 6 18M6 6l12 12"/>:
      kind==='query'?<><path d="M20 11a8 8 0 1 0-2.4 5.7M20 4v7h-7"/></>:
      kind==='stop'?<rect x="6" y="6" width="12" height="12" rx="2"/>:
      kind==='cancel'?<><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6m0-6-6 6"/></>:
      kind==='prepare'?<><path d="M5 3h10l4 4v14H5zM14 3v5h5"/><path d="m8 15 2.5 2.5L16 12"/></>:
      kind==='confirm'?<><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>:
      <path d="m8 5 12 7-12 7Z"/>}
  </svg>;
}

export function TaskRunSheet({view}){
  React.useSyncExternalStore(view.subscribe,view.getSnapshot,view.getSnapshot);
  const request=view.data.taskRunSheet;
  const dialog=React.useRef(null),composing=React.useRef(false),focusInvalid=React.useRef(false);
  const escapeFromIme=React.useRef(false);
  const opening=React.useRef(null),backdropPress=React.useRef(false),returnFocus=React.useRef(null);
  const stopFocus=React.useRef(false),closeButton=React.useRef(null);
  const [targetExpanded,setTargetExpanded]=React.useState(false);
  const targetEditor=React.useRef(null),targetToggle=React.useRef(null),targetSelect=React.useRef(null);
  const tool=['tool','page'].includes(request?.source),phase=request?.phase||'editing';
  const my=request?.source==='my';
  const control=my?view.data.taskSheetRunControl:null;
  const review=my?view.data.taskSheetOutcomeReview:null;
  const reconcile=my?view.data.taskSheetReconcile:null;
  const stale=my&&phase==='stale';
  const recovery=view.data.taskRuntimeRecovery;
  const recoveryAction=my&&phase==='editing'&&recovery;
  const blocked=!request||request.busy||request.recoveryOnly||!(tool?['editing','prepared']:['editing']).includes(phase);
  const fieldsDisabled=Boolean(!request||request.busy||request.paramsLocked||stale||(tool&&phase!=='editing'));
  const targetDisabled=fieldsDisabled||view.data.taskTargetDisabled;
  const targetError=my&&view.data.taskTargetUrlError;
  const automatic=my&&Boolean(request.automaticTarget);
  const automaticState=automatic?view.data.baiduRunTargetState:null;
  const reason=view.data.taskRunBlockedReason;
  const runBlocker=my&&(control?.issue||recoveryAction&&request.recoveryStatus||
    (targetError&&reason===targetError?(automatic&&!targetExpanded?'请点击「更改」修正起始网址。':'请先修正起始网址。'):reason));
  const owned=request?.target?.mode==='owned';
  const currentOrigin=view.data.taskCurrentTargetOrigin;
  const targetHelp=!automatic&&owned&&!currentOrigin?'当前页不适用，运行时将新建标签页。':'';
  const destination=owned?(targetError?'新标签页：起始网址待修正':
    request.targetChoice==='auto'||request.target.url==='https://www.baidu.com/'?'将在新标签页打开百度。':'将在新标签页打开指定的百度网址。'):
    automaticState?.changed?'原百度标签页已变化。':'将在当前百度标签页搜索。';
  const action=tool?(phase==='editing'?view.actions.taskSheetPrepareClick:
    phase==='prepared'?view.actions.taskSheetConfirmClick:null):view.actions.taskRunClick;
  const result=request?.snapshot?.results?.find(result=>result.runId===request.snapshot.run?.runId&&result.resultId===request.snapshot.run?.resultId);
  const hasParams=(view.data.taskParams||[]).length>0;
  const description=phase==='settled'||phase==='cancelled'?'原请求已结束；请关闭后打开新配置。':
    request?.recoveryOnly?'原准备参数只读；可查询或取消原请求。':
    tool?'保存并核对后，需再次点击“确认执行一次”才会执行。':
    stale?'请重新打开「参数与运行」。':
    recoveryAction?(recovery==='update'?'请先审阅并确认更新安装。':recovery==='edit'?'请打开开发草稿，试运行后再更新安装。':'请在任务目录将此版本设为可用。'):
    hasParams?'关闭后保留草稿；点击“运行任务”才会执行。':'此任务无需填写参数，可直接运行。';
  const status=stale?'':tool?(request.status||''):(view.field('task-status').text||request?.status||'');
  const fieldExplainsStatus=status&&(view.field('task-params-json').error===status||(view.data.taskParams||[]).some(({name})=>
    view.field('task-param-'+name).error?.endsWith(status)));
  const close=()=>{
    if(!request)return;
    backdropPress.current=false;
    composing.current=false;escapeFromIme.current=false;focusInvalid.current=false;
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
        backdropPress.current=false;
        returnFocus.current=request.trigger||null;
        composing.current=false;
        escapeFromIme.current=false;
        setTargetExpanded(false);
        request.trigger?.focus({preventScroll:true});
        node.showModal();
        const editor=node.querySelector(view.data.taskParamsMode==='json'?'#task-params-json:not(:disabled)':
          '#task-params-form input[data-task-type="string"]:not(:disabled)');
        (editor||node.querySelector('#task-run-target-mode:not(:disabled)'))?.focus();
      }
    }else if(node.open){node.close();composing.current=false;}
    opening.current=key;
    if(stopFocus.current&&(!control||control.pending)){
      if(node.open)closeButton.current?.focus({preventScroll:true});
      stopFocus.current=false;
    }
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
    if(action?.(event.nativeEvent,request.identity)===true){
      if(my&&view.data.taskRunSheet===request)closeButton.current?.focus({preventScroll:true});
    }else focusInvalid.current=true;
  };
  const isBackdrop=event=>{
    if(event.target!==event.currentTarget)return false;
    const {left,right,top,bottom}=event.currentTarget.getBoundingClientRect();
    return event.clientX<left||event.clientX>right||event.clientY<top||event.clientY>bottom;
  };
  const restoreTrigger=()=>{
    const trigger=returnFocus.current;returnFocus.current=null;
    if(!trigger?.isConnected)return;
    // Focusing the row first reveals its hover/focus-only run button.
    trigger.closest('.task-card-group')?.querySelector('[data-task-id]')?.focus({preventScroll:true});
    trigger.focus({preventScroll:true});
  };
  const targetFields=my&&<div className="task-run-target">
    {automatic?<div className="task-run-target-field">
      <label className="visually-hidden" htmlFor="task-run-target-mode">执行标签页</label>
      <select ref={targetSelect} id="task-run-target-mode" className="od-field" disabled={targetDisabled} value={request.targetChoice}
        onChange={event=>view.actions.taskSheetTargetChange?.(event.nativeEvent,event.target.value,request.identity)}>
        <option value="auto">自动（默认）</option>
        <option value="current" disabled={!automaticState?.currentAvailable}>使用当前百度页</option>
        <option value="owned">新建标签页</option>
      </select>
      {request.targetChoice==='current'&&automaticState?.changed&&automaticState.currentAvailable&&
        <Button className="task-run-destination-action" variant="quiet" disabled={targetDisabled} onClick={event=>{
          targetSelect.current?.focus();
          view.actions.taskSheetTargetChange?.(event.nativeEvent,'current',request.identity);
        }}>改用当前百度页</Button>}
    </div>:
    <div className="task-run-target-field">
    <label className="task-params-section-label" htmlFor="task-run-target-mode">运行位置</label>
    <select id="task-run-target-mode" className="od-field" disabled={targetDisabled} value={owned?'owned':'current'}
      aria-describedby={targetHelp?'task-run-target-help':undefined}
      onChange={event=>view.actions.taskSheetTargetChange?.(event.nativeEvent,event.target.value,request.identity)}>
    <option value="current">当前标签页</option><option value="owned" disabled={!request.sites?.length}>新建标签页</option>
    </select>
    {targetHelp&&<p id="task-run-target-help" className="od-field-help">{targetHelp}</p>}
    </div>}
    {owned&&(!automatic||request.targetChoice==='owned')&&<div className="task-run-target-field">
    <label className="od-field-label" htmlFor="task-run-target-url">起始网址</label>
    <input id="task-run-target-url" className="od-field" type="url" disabled={targetDisabled} value={request.target.url}
      aria-invalid={targetError?'true':undefined} aria-describedby={targetError?'task-run-target-error task-run-target-sites':undefined}
      onInput={event=>view.actions.taskSheetTargetUrlInput?.(event.nativeEvent,event.target.value,request.identity)}/>
    {targetError&&<><p id="task-run-target-error" className="od-field-help task-param-error">{targetError}</p>
    <p id="task-run-target-sites" className="od-field-help">适用网站：{request.sites.join('、')}</p></>}
    </div>}
  </div>;
  // Chromium owns modal focus, inertness and focus return. Both pointer ends
  // must be outside: drags from fields and clicks on dialog padding stay open.
  return (<dialog ref={dialog} id="task-parameters-sheet" className="task-params-sheet" data-source={request?.source} aria-labelledby="task-parameters-title" aria-describedby="task-parameters-description"
  onClose={event=>{if(!event.currentTarget.open){close();restoreTrigger();}}}
  onCancel={event=>{
    event.preventDefault();event.stopPropagation();
    const ime=composing.current||escapeFromIme.current;
    escapeFromIme.current=false;
    if(!ime)close();
  }}
  onPointerDown={event=>{backdropPress.current=event.button===0&&isBackdrop(event);}}
  onPointerCancel={()=>{backdropPress.current=false;}}
  onClick={event=>{
    const dismiss=backdropPress.current&&isBackdrop(event);
    backdropPress.current=false;
    if(dismiss)close();
  }}
  onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}}
  onBlurCapture={()=>{composing.current=false;}}
  onKeyDownCapture={event=>{
    const escape=event.key==='Escape'||event.code==='Escape';
    const enter=event.key==='Enter'||event.code==='Enter'||event.code==='NumpadEnter';
    if(!escape&&!enter)return;
    const ime=composing.current||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229;
    // Native cancel can arrive after compositionend. Remember which Escape
    // belonged to the IME, while leaving the key's default action to the browser.
    if(!event.repeat)escapeFromIme.current=escape&&ime;
    if(ime){event.stopPropagation();return;}
    if(event.repeat){event.preventDefault();event.stopPropagation();return;}
    if(escape&&targetExpanded&&targetEditor.current?.contains(event.target)){
      event.preventDefault();event.stopPropagation();
      targetToggle.current?.focus();setTargetExpanded(false);
    }
  }}>
<header className="task-params-sheet-heading">
<span className="task-card-icon"><TaskGlyph/></span>
<div><p className="task-params-sheet-kicker">参数与运行</p><h2 id="task-parameters-title">{request?.title||'当前任务'}</h2></div>
<IconButton className="od-icon-button--quiet" label="关闭任务参数" onClick={close}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></IconButton>
</header>
<div className="task-params-sheet-content">
{!my&&request?.sites?.length>0&&<p className="hint">适用网站：{request.sites.join('、')}</p>}
{request?.pageBinding&&<p className="hint">来源网页：{request.pageBinding.url}<br/>网页程序：{request.pageBinding.programId} · 任务版本：{request.identity.version}</p>}
{!my&&request?.target&&<p className="hint">{owned?'将新建独立网页：':'已核对网页：'}{owned?request.target.url:request.target.expectedUrl}</p>}
{automatic?<div className="task-run-destination" ref={targetEditor}>
  <div className="task-run-destination-row">
    <p className="hint" role="status">{destination}</p>
    <Button ref={targetToggle} variant="quiet" className="task-run-destination-action" disabled={targetDisabled}
      aria-label={targetExpanded?'收起执行标签页选项':'更改执行标签页'} aria-expanded={targetExpanded} aria-controls="task-run-destination-editor"
      onClick={()=>setTargetExpanded(open=>!open)}>{targetExpanded?'收起':'更改'}</Button>
  </div>
  <div id="task-run-destination-editor" hidden={!targetExpanded}>{targetExpanded&&targetFields}</div>
</div>:targetFields}
<p id="task-parameters-description" className={my?'visually-hidden':'hint'}>{description}</p>
{request?.recoveryOnly&&<pre aria-label="原准备参数" className="task-run-result">{JSON.stringify(request.originalParams,null,2)}</pre>}
<fieldset className="task-params-editor-fields" hidden={request?.recoveryOnly||!hasParams} disabled={fieldsDisabled}>
<div className="task-params-toolbar">
<span className="task-params-section-label">运行参数</span>
<div className="task-params-mode od-segmented" role="group" aria-label="参数编辑方式">
{[['form','表单'],['json','JSON']].map(([mode,label])=><Button key={mode} variant="quiet"
  aria-pressed={(view.data.taskParamsMode||'form')===mode} disabled={fieldsDisabled} onClick={()=>view.actions.taskParamsModeChange?.(mode)}>{label}</Button>)}
</div>
</div>
<MyControl view={view} as="form" id="task-params-form" onInput={event=>view.actions.taskParamsFormInput?.(event.nativeEvent)} onChange={event=>view.actions.taskParamsFormChange?.(event.nativeEvent)} onSubmit={event=>view.actions.taskParamsFormSubmit?.(event.nativeEvent)} autoComplete="off" aria-label="任务参数">
<div className="task-param-fields" hidden={view.data.taskParamsMode==='json'}>
<MyTaskParams view={view} disabled={fieldsDisabled} clarifyExecutionTab={automatic}/>
</div>
<div className="task-param-json" hidden={view.data.taskParamsMode!=='json'}>
<label htmlFor="task-params-json" className="od-field-label">参数 JSON</label>
<MyControl view={view} as="textarea" controlBase="aria" id="task-params-json" disabled={fieldsDisabled} className="od-field" rows={8} spellCheck={false} maxLength={65536}
  aria-invalid={view.field('task-params-json').error?'true':undefined}
  aria-describedby={view.field('task-params-json').error?'task-params-json-error':undefined}
  onCompositionCommit={event=>view.actions.taskParamsFormInput?.(event.nativeEvent)}
  onInput={()=>{
    const field=view.field('task-params-json'),status=view.field('task-status');
    if(field.error&&status.text===field.error)status.text='';
    field.error='';view.publish();
  }}/>
{view.field('task-params-json').error&&<p id="task-params-json-error" className="od-field-help task-param-error" role="alert">{view.field('task-params-json').error}</p>}
</div>
</MyControl>
</fieldset>
{request&&<p className="task-params-sheet-status hint" role="status">{!fieldExplainsStatus&&status!==runBlocker?status:''}</p>}
{review&&<details className="hint"><summary>查看原运行记录</summary><pre className="task-run-result">{review.record}</pre></details>}
{my&&request.description&&<details><summary>任务说明</summary><p className="hint">{request.description}</p></details>}
{request?.snapshot&&<section aria-label="原运行结果">
<p role="status">运行状态：{request.snapshot.run?.state||'待核对'} · {request.snapshot.run?.retirementState==='released'?'资源已释放':'资源释放未确认'}</p>
{request.resultText&&<pre className="task-run-result">{request.resultText}</pre>}
{result?.outcome?.error&&<p role="alert">{result.outcome.error.message||result.outcome.error.code}</p>}
</section>}
</div>
<footer className="task-params-sheet-footer">
{my&&<p id="task-run-blocker" className={runBlocker?'task-run-blocker':'visually-hidden'} role="status">{runBlocker||''}</p>}
<div className="task-params-sheet-actions"><Button ref={closeButton} variant="quiet" onClick={close}><SheetActionIcon kind="close"/>{tool||stale||control||review||reconcile?'关闭':'取消'}</Button>{tool&&request?.preparationId&&view.actions.taskSheetQueryClick&&<Button variant="quiet" disabled={request.busy} onClick={event=>view.actions.taskSheetQueryClick(event.nativeEvent)}><SheetActionIcon kind="query"/>查询状态</Button>}
{reconcile&&<Button variant={reconcile.requestId?'danger':'quiet'} disabled={reconcile.pending} aria-describedby="task-run-blocker"
  onClick={event=>{closeButton.current?.focus({preventScroll:true});view.actions.taskSheetReconcileClick?.(event.nativeEvent,reconcile.sheet,reconcile.requestId);}}><SheetActionIcon kind={reconcile.requestId?'stop':'query'}/>{reconcile.requestId?(reconcile.pending?'正在取消…':'取消原启动'):'查询原运行'}</Button>}
{control&&<Button id="task-sheet-stop" variant="danger" disabled={control.pending} aria-describedby="task-run-blocker"
  aria-label={control.label+'：'+control.title} onClick={event=>{
    stopFocus.current=true;
    view.actions.taskSheetStopOwnedClick?.(event.nativeEvent,control.token,control.sheet);
  }}><SheetActionIcon kind="stop"/>{control.pending?'正在停止…':control.label}</Button>}
{review?.required&&!control&&!stale&&<Button id="task-sheet-review" variant="quiet" disabled={!review.canConfirm} aria-describedby="task-run-blocker"
  onClick={event=>{
    stopFocus.current=true;
    view.actions.taskSheetReviewOutcomeClick?.(event.nativeEvent,review.runId,review.sheet);
  }}>已核对网页和原记录</Button>}
{tool&&request?.preparationId&&['submitted','unknown'].includes(phase)&&view.actions.taskSheetStopClick&&<Button variant="danger" disabled={request.busy} onClick={event=>view.actions.taskSheetStopClick(event.nativeEvent)}><SheetActionIcon kind="stop"/>停止</Button>}
{tool&&request?.preparationId&&['editing','preparing','prepared','unknown'].includes(phase)&&view.actions.taskSheetCancelClick&&<Button variant="quiet" disabled={request.busy} onClick={event=>view.actions.taskSheetCancelClick(event.nativeEvent)}><SheetActionIcon kind="cancel"/>取消准备</Button>}
{tool&&request?.reprepareAllowed&&view.actions.taskSheetReprepareClick&&<Button variant="primary" disabled={request.busy} onClick={event=>view.actions.taskSheetReprepareClick(event.nativeEvent)}><SheetActionIcon kind="prepare"/>安全重新准备</Button>}
{recoveryAction&&<Button variant="primary" disabled={request.busy||view.data.taskRuntimeRecoveryDisabled}
  aria-describedby={runBlocker?'task-run-blocker':undefined}
  onClick={event=>view.actions.taskSheetRuntimeRecoveryClick?.(event.nativeEvent,request.identity,recovery)}>{recovery==='edit'?'打开开发草稿':recovery==='update'?'更新安装':'打开任务目录'}</Button>}
{!control&&!recoveryAction&&(!tool||(['editing','prepared'].includes(phase)&&!request?.recoveryOnly))&&<Button id="task-run" variant="primary" disabled={blocked||(!tool&&(view.field('task-run').disabled||view.field('task-run').hidden))||!action}
  aria-describedby={runBlocker?'task-run-blocker':undefined}
  onClick={run}><SheetActionIcon kind={tool?(phase==='editing'?'prepare':'confirm'):'run'}/>{tool?(phase==='editing'?'保存并核对':'确认执行一次'):'运行任务'}</Button>}</div></footer>
</dialog>);
}
