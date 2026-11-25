import * as React from 'react';
import {MyControl} from './my-controls.tsx';
import {Button,IconButton} from '../components/ui/button.tsx';
import {presentSchedulePlan,formatScheduleTime,scheduleFireLabel} from '../../schedule-plan-presentation.js';
import {scheduleStatusGuidance} from '../../scheduled-task-workbench.js';

export function MyTaskParams({view,disabled=false,clarifyExecutionTab=false,compact=false}){
  return (view.data.taskParams||[]).map(({name,rule,required})=>{
    const id='task-param-'+name;
    const executionTab=name==='showExecutionTab'&&rule.type==='boolean'&&!rule.enum&&rule.title==='显示执行标签页';
    const fixed=Array.isArray(rule.enum)&&rule.enum.length===1;
    const topThree=name==='limit'&&rule.type==='integer'&&rule.title==='结果数量'&&fixed&&rule.enum[0]===3&&rule.default===3;
    const checkbox=compact&&executionTab;
    const fullTitle=executionTab?(compact?rule.title:clarifyExecutionTab?'运行时切到执行标签页':'切到执行标签页'):topThree?'结果上限':rule.title||name;
    const help=rule.description||executionTab?id+'-help':undefined;
    const field=view.field(id),toggle=rule.type==='boolean'&&!rule.enum;
    const isFixedValue=fixed&&(required||Object.hasOwn(rule,'default'))&&!field.error&&!field.omitted&&
      field.value===String(rule.enum[0]);
    // The task description states the fixed top-three limit; the JSON editor
    // still exposes its actual schema value, and invalid values stay visible.
    if(compact&&topThree&&isFixedValue)return null;
    const optionalToggle=toggle&&!required&&!Object.hasOwn(rule,'default');
    // maxLength validates content; it must not silently change a plain text field to textarea.
    const showToggleState=toggle&&(!executionTab||optionalToggle);
    const error=field.error,describedBy=[help,showToggleState?id+'-state':null,error?id+'-error':null].filter(Boolean).join(' ')||undefined;
    const clearError=()=>{
      const field=view.field(id),status=view.field('task-status');
      field.omitted=false;
      if(field.error){
        // Clear only the summary belonging to this corrected field. Other
        // validation errors and permission/run receipts keep their owners.
        if(status.text&&field.error.endsWith(status.text))status.text='';
        field.error='';view.publish();
      }
    };
    return <div key={name} className={'od-form-field task-param-field'+(executionTab?' task-param-field--execution-tab':'')}>
      <div className={'od-input-group task-param-control'+(toggle?' task-param-control--check':'')}>
      {isFixedValue?<span className="od-field-label task-param-fixed-label">{fullTitle}</span>:
        <label className="od-field-label" htmlFor={id} title={fullTitle}>{fullTitle}{required&&<span className="task-param-required" aria-hidden="true"> *</span>}</label>}
      {isFixedValue?<span className="task-param-fixed-value">{field.value}</span>:rule.enum?<MyControl view={view} as="select" id={id} className="od-field" disabled={disabled}
        name={name} data-task-param={name} data-task-type={rule.type} aria-label={fullTitle} aria-required={required||undefined} aria-readonly={fixed||undefined} aria-describedby={describedBy} aria-invalid={error?'true':undefined}
        onChange={clearError}>
        {!required&&rule.default===undefined&&<option value="">（不填写）</option>}
        {rule.enum.map(value=><option key={String(value)} value={String(value)}>{String(value)}</option>)}
      </MyControl>:toggle?<span className="task-param-toggle">
        {showToggleState&&<span id={id+'-state'} className="task-param-toggle-state">{field.omitted?'未填写':field.checked?'是':'否'}</span>}
        <MyControl view={view} as="input" controlBase={checkbox?'native':'switch'} id={id} name={name} type="checkbox" disabled={disabled}
          className={checkbox?'task-param-execution-checkbox':undefined}
          data-task-param={name} data-task-type="boolean" aria-label={fullTitle}
          aria-required={required||undefined} aria-describedby={describedBy} aria-invalid={error?'true':undefined}
          onChange={()=>{clearError();if(!checkbox)view.actions.taskParamsFormChange?.();}}/>
        {optionalToggle&&!field.omitted&&<Button variant="quiet" disabled={disabled||field.disabled}
          className="task-param-clear" aria-label={'不填写'+(rule.title||name)} onClick={()=>{
            clearError();field.omitted=true;field.checked=false;view.publish();view.actions.taskParamsFormChange?.();
          }}>清除</Button>}
      </span>:<MyControl view={view} controlBase="aria" as="input" id={id} name={name} className="od-field" disabled={disabled}
        data-task-param={name} data-task-type={rule.type} aria-label={fullTitle} aria-required={rule.type!=='boolean'&&required||undefined} aria-describedby={describedBy} aria-invalid={error?'true':undefined} onInput={clearError} onChange={clearError}
        type={rule.type==='boolean'?'checkbox':['number','integer'].includes(rule.type)?'number':'text'}
        placeholder={compact&&name==='query'&&rule.title==='搜索关键词'?'输入要搜索的内容':undefined}
        onCompositionCommit={rule.type==='string'?event=>view.actions.taskParamsFormInput?.(event.nativeEvent):undefined}
        onPaste={event=>{
          if(rule.type!=='string')return;
          const text=event.clipboardData?.getData('text/plain');
          if(typeof text!=='string'||!/[\r\n]/u.test(text))return;
          event.preventDefault();
          view.actions.taskParamsMultilinePaste?.({name,text,start:event.currentTarget.selectionStart,end:event.currentTarget.selectionEnd});
        }}
        step={rule.type==='integer'?'1':'any'} minLength={rule.minLength} maxLength={rule.maxLength}
        min={rule.minimum} max={rule.maximum} required={required}/>}
      </div>
      {help&&<p id={help} className={executionTab&&!compact?'od-field-help':'visually-hidden'}>{executionTab&&(clarifyExecutionTab?'关闭仍会搜索，只是不主动切换标签页。':'关闭开关仍会运行。')}{rule.description&&<span className={executionTab&&!compact?'visually-hidden':undefined}>{rule.description}</span>}</p>}
      {error&&<p id={id+'-error'} className="od-field-help task-param-error" role="alert">{error}</p>}
    </div>;
  });
}

export function TaskResultRevealIcon({revealed}){
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/>
    <circle cx="12" cy="12" r="3"/>
    {revealed&&<path d="m3 3 18 18"/>}
  </svg>;
}

function TaskHistoryEntry({row}){
  // A reveal belongs to this result snapshot, never a refreshed row with the same runId.
  const [revealedRow,setRevealedRow]=React.useState(null);
  const revealed=revealedRow===row&&typeof row.fullText==='string';
  const resultId=React.useId(),label=revealed?'隐藏完整原值':'查看完整原值';
  return <article className="task-history-entry" data-tone={row.runState==='failed'?'error':row.runState==='paused_unknown'?'warning':undefined}>
    <div className="task-history-heading"><strong>{row.state}</strong><span>{row.time||'最近第 '+row.ordinal+' 次'}</span>
    {typeof row.fullText==='string'&&<IconButton className="task-result-reveal" label={label}
      title={revealed?label:label+'（可能包含敏感信息）'} aria-pressed={revealed} aria-controls={resultId}
      onClick={()=>setRevealedRow(value=>value===row?null:row)}><TaskResultRevealIcon revealed={revealed}/></IconButton>}
    </div>
    <pre id={resultId}>{revealed?row.fullText:row.text}</pre>
    <details className="task-history-tech od-disclosure od-disclosure--flat"><summary>技术信息</summary><pre>{row.technical}</pre></details>
  </article>;
}
export function MyTaskHistory({rows=[]}){
  return <div className="task-history-entries">{rows.map(row=><TaskHistoryEntry key={row.runId} row={row}/>)}</div>;
}

export function MyScheduleDetail({model}){
  const historySummary=React.useRef(null),paginationNode=React.useRef(null),recoveryNode=React.useRef(null);
  const paginationRef=React.useCallback(node=>{
    const previous=paginationNode.current;
    paginationNode.current=node;
    if(!node&&previous?.ownerDocument.activeElement===previous)
      queueMicrotask(()=>historySummary.current?.focus({preventScroll:true}));
  },[]);
  const recoveryRef=React.useCallback(node=>{
    const previous=recoveryNode.current;
    recoveryNode.current=node;
    if(!node&&previous?.ownerDocument.activeElement===previous){
      const document=previous.ownerDocument;
      queueMicrotask(()=>{
        const detail=document.getElementById('schedule-detail-view');
        if(detail&&!detail.hidden)document.getElementById('schedule-back')?.focus({preventScroll:true});
      });
    }
  },[]);
  if(!model)return null;
  const {plan,records=[],expandedRuns=new Set()}=model;
  const p=presentSchedulePlan(plan,records),last=records[0];
  const warning=plan.needsAttention?'当前任务安装身份或网站权限不足；请检查已安装任务，不会自动换绑新版。':
    last&&!['SUCCESS','STOPPED'].includes(last.status)?scheduleStatusGuidance[last.status]:'';
  const canToggle=plan.paused||plan.triggerKind!=='once'||Number.isFinite(plan.nextDueAt);
  const trusted=(event,callback)=>{if(event.nativeEvent?.isTrusted===true)void callback?.();};
  return <div className="schedule-detail-card od-stack" data-schedule-id={plan.scheduleId}>
    <section className="schedule-detail-summary od-surface od-surface--padded od-stack">
      <span className="schedule-state" data-tone={p.tone}>{p.badge}</span>
      <p className="schedule-next-time">{p.timingText}</p><p className="schedule-plan-meta hint">{model.taskTitle}</p>
      <p className="schedule-detail-url hint">目标网页：{plan.targetUrl}</p>
      {p.recentText&&<p className="schedule-recent-result" data-tone={p.recentTone}>{p.recentText}</p>}
    </section>
    {warning&&<p className="schedule-status-help">{warning}{plan.needsAttention&&
      <button ref={recoveryRef} type="button" className="od-button od-button--secondary" onClick={event=>trusted(event,model.onManage)}>检查已安装任务</button>}</p>}
    <div className="schedule-actions od-toolbar schedule-detail-actions">{canToggle&&<button type="button"
      className="od-button od-button--secondary" disabled={Boolean(plan.paused&&plan.needsAttention)}
      title={plan.paused&&plan.needsAttention?'请先处理固定任务与网站权限，再恢复计划':undefined}
      onClick={event=>trusted(event,model.onToggle)}>{plan.paused?'恢复计划':'暂停计划'}</button>}</div>
    <details className="schedule-history od-disclosure od-disclosure--flat" open={model.open}
      onToggle={event=>{if(event.currentTarget.open!==model.open)model.onHistoryToggle(event.currentTarget.open);}}>
      <summary ref={historySummary}>运行记录{last?' · 最近：'+scheduleFireLabel(last.status)+' · '+formatScheduleTime(last.scheduledAt,plan.timezone):' · 暂无'}</summary>
      <p className="schedule-history-status hint" role="status" aria-live="polite" hidden={!model.historyError}>{model.historyError}</p>
      <div className="od-stack">{records.map(fire=><div key={fire.fireId} className="schedule-history-row" data-fire-id={fire.fireId}>
        {formatScheduleTime(fire.scheduledAt,plan.timezone)} · {scheduleFireLabel(fire.status)}
        {scheduleStatusGuidance[fire.status]&&<small className="schedule-status-guidance">{scheduleStatusGuidance[fire.status]}</small>}
        {fire.runId&&<details className="schedule-run-details od-disclosure od-disclosure--flat" open={expandedRuns.has(fire.fireId)}
          onToggle={event=>model.onRunToggle(fire.fireId,event.currentTarget.open)}><summary>技术详情</summary>
          <small>RunId：{fire.runId} · ResultId：{fire.resultId??'未生成'} · 资源：{fire.retirementState==='released'?'已释放':'等待释放'}</small>
        </details>}
      </div>)}{model.hasMore&&<button ref={paginationRef} type="button" className="od-button od-button--secondary schedule-load-more"
        disabled={model.loading} onClick={event=>trusted(event,model.onLoadMore)}>
        {model.loading?'正在读取…':model.historyError?'重试加载记录':'加载更早记录'}</button>}</div>
    </details>
    <details className="schedule-more od-disclosure od-disclosure--flat" open={model.moreOpen}
      onToggle={event=>{if(event.currentTarget.open!==model.moreOpen)model.onMoreToggle(event.currentTarget.open);}}>
      <summary>固定版本与时区</summary><p className="hint">固定版本 v{plan.version} · IANA 时区 {plan.timezone} · 任务 {plan.taskId}</p>
    </details>
    {model.deleteReview&&<div className="schedule-delete-confirm od-surface" role="group" aria-label="确认删除当前计划">
      <strong>确认删除计划</strong><p>确定删除「{plan.title}」？计划将停止后续触发，已有 Run/Result 历史不会因删除计划自动清除。</p>
      <button type="button" className="od-button schedule-danger-button" onClick={event=>trusted(event,model.onDelete)}>确认删除</button>
      <button type="button" className="od-button od-button--secondary" onClick={event=>trusted(event,model.onCancelDelete)}>取消</button>
    </div>}
  </div>;
}

export function MyCopyConfirmation({view}){
  return <MyControl view={view} as="div" id="schedule-copy-confirm" className="od-surface" role="group" aria-label="确认覆盖开发草稿" aria-describedby="schedule-copy-label" data-opendesk-pending-review="">
    <MyControl view={view} as="p" id="schedule-copy-label"/>
    <div className="schedule-actions od-toolbar">
      <MyControl view={view} as="button" type="button" id="schedule-copy-yes" aria-describedby="schedule-copy-label" onClick={event=>view.actions.scheduleCopyYesClick?.(event.nativeEvent)} className="od-button">确认覆盖并复制</MyControl>
      <MyControl view={view} as="button" type="button" id="schedule-copy-no" aria-describedby="schedule-copy-label" onClick={event=>view.actions.scheduleCopyNoClick?.(event.nativeEvent)} className="od-button od-button--secondary">取消</MyControl>
    </div>
  </MyControl>;
}
