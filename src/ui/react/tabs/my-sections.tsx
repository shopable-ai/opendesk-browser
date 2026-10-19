import * as React from 'react';
import {MyControl} from './my-controls.tsx';
import {presentSchedulePlan,formatScheduleTime,scheduleFireLabel} from '../../schedule-plan-presentation.js';
import {scheduleStatusGuidance} from '../../scheduled-task-workbench.js';

export function MyTaskParams({view}){
  return (view.data.taskParams||[]).map(({name,rule,required})=>{
    const id='task-param-'+name,help=rule.description?id+'-help':undefined;
    return <React.Fragment key={name}>
      <label htmlFor={id}>{rule.title||name}{required?' *':''}</label>
      {rule.enum?<MyControl view={view} as="select" id={id} className="od-field"
        data-task-param={name} data-task-type={rule.type} aria-describedby={help}>
        {!required&&rule.default===undefined&&<option value="">（不填写）</option>}
        {rule.enum.map(value=><option key={String(value)} value={String(value)}>{String(value)}</option>)}
      </MyControl>:<MyControl view={view} as="input" id={id} className="od-field"
        data-task-param={name} data-task-type={rule.type} aria-describedby={help}
        type={rule.type==='boolean'?'checkbox':['number','integer'].includes(rule.type)?'number':'text'}
        step={rule.type==='integer'?'1':'any'} minLength={rule.minLength} maxLength={rule.maxLength}
        min={rule.minimum} max={rule.maximum} required={rule.type==='boolean'?undefined:required}/>}
      {help&&<p id={help} className="hint">{rule.description}</p>}
    </React.Fragment>;
  });
}

function TaskHistoryEntry({row}){
  const [revealed,setRevealed]=React.useState(false);
  return <details className="task-history-entry od-disclosure od-disclosure--flat">
    <summary>{row.state} · 最近第 {row.ordinal} 次</summary>
    <pre>{revealed?row.fullText:row.text}</pre>
    {typeof row.fullText==='string'&&<button type="button" className="task-result-reveal od-button od-button--secondary"
      title="完整原值可能包含访问令牌等敏感信息" onClick={()=>setRevealed(value=>!value)}>
      {revealed?'隐藏完整原值':'显示完整原值'}</button>}
    <details className="task-history-tech od-disclosure od-disclosure--flat"><summary>技术信息</summary><pre>{row.technical}</pre></details>
  </details>;
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
  return <MyControl view={view} as="div" id="schedule-copy-confirm" className="od-surface" role="group" aria-label="确认覆盖开发草稿">
    <MyControl view={view} as="p" id="schedule-copy-label"/>
    <div className="schedule-actions od-toolbar">
      <MyControl view={view} as="button" type="button" id="schedule-copy-yes" onClick={event=>view.actions.scheduleCopyYesClick?.(event.nativeEvent)} className="od-button">确认覆盖并复制</MyControl>
      <MyControl view={view} as="button" type="button" id="schedule-copy-no" onClick={event=>view.actions.scheduleCopyNoClick?.(event.nativeEvent)} className="od-button od-button--secondary">取消</MyControl>
    </div>
  </MyControl>;
}
