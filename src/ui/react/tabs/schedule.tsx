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
