import * as React from 'react';
import {presentSchedulePlan,schedulePlanIconPath,schedulePlanStatusLabel,
  schedulePlanNeedsNotice} from '../../schedule-plan-presentation.js';
import {IconButton} from '../components/ui/button.tsx';

// One trusted presentation for the Side Panel and its offline preview.
// Scheduler/RunHost alone own permissions, mutations, outcomes and execution.
export function SchedulePlanRows({plans=[],currentRunId='',canStop,onOpen,onToggle,onEdit,onStop}) {
  if(!plans.length)return <div className="schedule-empty od-stack" role="status">
    <span className="schedule-empty-icon" aria-hidden="true">◷</span>
    <h3 className="od-page-title">尚无定时计划</h3>
    <p className="schedule-empty-hint hint">点击右上角「＋ 新建」，安排第一个已验证任务。</p>
  </div>;
  const trusted=(event,callback)=>{
    if(event.nativeEvent?.isTrusted===true)callback?.();
  };
  return plans.map(plan=>{
    const id=plan.scheduleId||plan.id;
    const fires=Array.isArray(plan.history)?plan.history:[];
    const presentation=presentSchedulePlan(plan,fires);
    const activeFire=fires.find(fire=>['ADMITTED','RUNNING'].includes(fire.status)&&
      (typeof canStop==='function'||typeof fire.runId==='string'&&fire.runId));
    const stoppable=Boolean(activeFire && (typeof canStop==='function'
      ? canStop(plan,activeFire)
      : activeFire.runId===currentRunId));
    const canToggle=plan.paused||plan.triggerKind!=='once'||Number.isFinite(plan.nextDueAt);
    const label=schedulePlanStatusLabel(presentation);
    return <article key={id} className="schedule-card od-surface" data-schedule-id={id}
      onClick={event=>{
        if(!event.target.closest?.('button,a,summary,input,select'))
          trusted(event,()=>onOpen?.(id));
      }}>
      <div className="schedule-card-head od-toolbar">
        <div className="schedule-plan-title-row">
          <button type="button" className="od-button od-button--quiet schedule-plan-open"
            onClick={event=>trusted(event,()=>onOpen?.(id))}>{plan.title}</button>
          <span className="schedule-state schedule-state-icon" data-tone={presentation.tone}
            role="img" title={label} aria-label={label}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={schedulePlanIconPath(presentation)}/></svg>
          </span>
        </div>
        <div className="schedule-plan-actions od-toolbar" role="group" aria-label="计划快捷操作">
          {activeFire&&<IconButton className="schedule-plan-action schedule-action-stop"
            data-schedule-action="stop" data-run-id={activeFire.runId||undefined}
            label={'停止本次执行「'+plan.title+'」'}
            title={stoppable?'停止本次执行「'+plan.title+'」':'仅当前运行宿主可停止此执行；请到运行页核对'}
            disabled={!stoppable}
            onClick={event=>trusted(event,()=>onStop?.(plan,activeFire))}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
          </IconButton>}
          {canToggle&&<IconButton className="schedule-plan-action" data-schedule-action="toggle"
            label={(plan.paused?'恢复计划':'暂停计划')+'「'+plan.title+'」'}
            disabled={Boolean(plan.paused&&plan.needsAttention)}
            title={plan.paused&&plan.needsAttention?'请先处理固定任务与网站权限，再恢复计划':undefined}
            onClick={event=>trusted(event,()=>onToggle?.(plan))}>
            {plan.paused?<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 12 7-12 7Z"/></svg>
              :<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14M17 5v14"/></svg>}
          </IconButton>}
          <IconButton className="schedule-plan-action" data-schedule-action="edit"
            label={'编辑计划「'+plan.title+'」'}
            onClick={event=>trusted(event,()=>onEdit?.(plan))}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16 4l4 4-11 11H5v-4L16 4Z"/></svg>
          </IconButton>
        </div>
      </div>
      <p className="schedule-plan-meta schedule-timing-line">
        <span className="schedule-plan-frequency">{presentation.frequencyText}</span>
        <span className="schedule-timing-separator"> · </span>
        <span className="schedule-next-time">{presentation.nextText}</span>
      </p>
      {(plan.needsAttention||schedulePlanNeedsNotice(presentation))&&presentation.recentText&&
        <p className="schedule-recent-result" data-tone={presentation.recentTone}>
          最近：{presentation.recentText}</p>}
    </article>;
  });
}


// Manager cards are presentation only. Operations always return to the trusted
// TaskWorkbench/Scheduler adapter; no Registry or Chrome capability crosses in.
export function ScheduleManagerRows({rows=[],emptyText='',canCreatePlan=true,
  onToggle,onCopy,onCreatePlan,onUninstall}){
  if(!rows.length)return <p className="task-search-empty" role="status">{emptyText}</p>;
  const trusted=(event,callback)=>{
    if(event.nativeEvent?.isTrusted===true)callback?.(event.nativeEvent);
  };
  return rows.map(row=>{
    const title=row.title||row.taskId,enabled=Boolean(row.enabled);
    const version=row.version||'1.0.0';
    const sites=Array.isArray(row.siteOrigins)?row.siteOrigins:[];
    return <article key={row.taskId} className="schedule-manager-card od-surface"
      data-manager-task-id={row.taskId}>
      <div className="schedule-manager-card-head">
        <div className="schedule-manager-identity">
          <div className="schedule-manager-title-line">
            <strong>{title}</strong>
            <span className="schedule-manager-state schedule-state-icon"
              data-state={enabled?'enabled':'disabled'} role="img"
              title={enabled?'已启用':'已停用'} aria-label={enabled?'已启用':'已停用'}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={enabled?'M4 12l5 5L20 6':'M8 5v14M16 5v14'}/>
              </svg>
            </span>
          </div>
          <p className="hint">v{version} · {row.linked||0} 个关联计划</p>
        </div>
      </div>
      <div className="schedule-manager-actions od-toolbar" role="group"
        aria-label={'管理「'+title+'」'}>
        <IconButton className="schedule-manager-action schedule-manager-toggle"
          data-manager-action="toggle" label={(enabled?'停用':'启用')+'「'+title+'」'}
          onClick={event=>trusted(event,()=>onToggle?.(row))}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={enabled?'M7 5v14M17 5v14':'m8 5 12 7-12 7Z'}/>
          </svg>
        </IconButton>
        <IconButton className="schedule-manager-action schedule-manager-copy"
          data-manager-action="copy" label={'复制「'+title+'」到开发'}
          onClick={event=>trusted(event,()=>onCopy?.(row))}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 8h12v12H8zM16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>
          </svg>
        </IconButton>
        <details className="schedule-manager-menu">
          <summary className="od-icon-button schedule-manager-action schedule-manager-menu-trigger"
            data-manager-action="more" data-manager-more={row.taskId}
            title={'更多操作：'+title} aria-label={'更多操作：'+title}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/>
              <circle cx="19" cy="12" r="1.5"/>
            </svg>
          </summary>
          <div className="schedule-manager-menu-panel od-surface" role="group"
            aria-label={'其他操作：'+title}>
            {canCreatePlan&&<button type="button"
              className="od-button od-button--quiet schedule-manager-action schedule-manager-menu-item"
              onClick={event=>trusted(event,()=>{
                event.currentTarget.closest('details').open=false;
                onCreatePlan?.(row);
              })}>为此任务设置定时</button>}
            <button type="button" className="od-button od-button--quiet schedule-manager-uninstall schedule-manager-action schedule-manager-menu-item"
              data-manager-uninstall={row.taskId} aria-label={'卸载固定版本「'+title+'」'}
              onClick={event=>trusted(event,()=>{
                const trigger=event.currentTarget.closest('details')?.querySelector('summary');
                event.currentTarget.closest('details').open=false;
                onUninstall?.(row,trigger);
              })}>卸载固定版本</button>
            <details className="schedule-manager-more od-disclosure od-disclosure--flat">
              <summary>固定版本与网站范围</summary>
              {row.description&&<p className="hint">用途：{row.description}</p>}
              <p className="hint">任务 ID：{row.taskId}</p>
              <p className="hint">固定版本：v{version}</p>
              <p className="hint">适用网站：{sites.join('，')||'未指定'}</p>
            </details>
          </div>
        </details>
      </div>
    </article>;
  });
}
