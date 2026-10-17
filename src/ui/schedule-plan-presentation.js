// Presentation only: no scheduler mutation, Host status, time recalculation or RPC.
export const scheduleFireLabels=Object.freeze({
  READY:'待执行',WAITING_HOST:'等待运行页',WAITING_TARGET:'等待目标页',
  WAITING_SLOT:'等待执行槽',ADMITTED:'已启动',RUNNING:'运行中',
  SUCCESS:'执行成功',SETTLING:'正在结算',FAILED:'执行失败',STOPPED:'已停止',
  UNKNOWN:'结果待核对',MISSED:'已错过',CANCELLED:'已取消',
  NEEDS_ATTENTION:'需要处理'
});
export const scheduleFireLabel=status=>scheduleFireLabels[status]||status||'未知结果';
const pad2=value=>String(value).padStart(2,'0');
export function formatScheduleRule(plan){
  const kind=plan?.triggerKind,rule=plan?.triggerSpec||{};
  const time=Number.isInteger(rule.hour)&&Number.isInteger(rule.minute)?
    pad2(rule.hour)+':'+pad2(rule.minute):'时间待设置';
  if(kind==='once')return '执行一次';
  if(kind==='daily')return '每天 '+time;
  if(kind==='weekly'){
    const weekdays=['日','一','二','三','四','五','六'];
    const days=Array.isArray(rule.days)?rule.days:[];
    return '每周'+days.slice().sort((a,b)=>((a+6)%7)-((b+6)%7))
      .filter(day=>Number.isInteger(day)&&day>=0&&day<=6)
      .map(day=>weekdays[day]).join('、')+' '+time;
  }
  if(kind==='interval')return '每隔 '+rule.everyMinutes+' 分钟';
  return kind||'执行规则待设置';
}
export function formatScheduleTime(at,zone){
  if(!Number.isFinite(at))return '无后续触发';
  try{return new Intl.DateTimeFormat('zh-CN',{timeZone:zone,year:'numeric',month:'2-digit',
    day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(at));}
  catch{return new Date(at).toISOString();}
}
const resultTones=Object.freeze({SUCCESS:'positive',FAILED:'negative',UNKNOWN:'warning',
  NEEDS_ATTENTION:'warning',MISSED:'warning',SETTLING:'warning',
  RUNNING:'info',ADMITTED:'info',WAITING_HOST:'muted',WAITING_TARGET:'muted',
  WAITING_SLOT:'muted',STOPPED:'muted',CANCELLED:'muted'});
export function presentSchedulePlan(plan,history=plan?.history||[]){
  if(!plan||typeof plan!=='object')throw new TypeError('Expected schedule plan');
  const nextKnown=Number.isFinite(plan.nextDueAt);
  const recent=(Array.isArray(history)?history:[])
    .filter(fire=>fire&&typeof fire.status==='string'&&Number.isFinite(fire.scheduledAt))
    .slice().sort((a,b)=>b.scheduledAt-a.scheduledAt)[0]||null;
  const completedOnce=plan.triggerKind==='once'&&!nextKnown&&recent?.status==='SUCCESS';
  const planState=plan.paused?'已暂停':plan.needsAttention?'需要处理':
    completedOnce?'已完成':nextKnown?'已安排':'暂无后续计划';
  let badge=planState,tone=plan.paused?'muted':plan.needsAttention?'warning':
    completedOnce?'positive':'neutral',badgeSource='plan';
  if(!plan.paused&&!plan.needsAttention&&!completedOnce){
    if(recent?.status==='RUNNING'||recent?.status==='ADMITTED'){
      badge=recent.status==='RUNNING'?'运行中':'已启动';tone='info';badgeSource='fire';
    }else if(recent?.status==='SETTLING'){
      badge='正在结算';tone='warning';badgeSource='fire';
    }else if(!nextKnown&&['UNKNOWN','FAILED','MISSED','STOPPED','CANCELLED'].includes(recent?.status)){
      badge=scheduleFireLabel(recent.status);tone=resultTones[recent.status]||'muted';badgeSource='fire';
    }
  }
  const nextText=plan.paused?'暂停期间不触发':plan.needsAttention?'检查任务与网站权限':
    nextKnown?'下次 '+formatScheduleTime(plan.nextDueAt,plan.timezone):
      completedOnce?'无后续计划':'暂无后续触发';
  const recentText=recent?scheduleFireLabel(recent.status)+' · '+
    formatScheduleTime(recent.scheduledAt,plan.timezone)+
    (recent.status==='UNKNOWN'?' · 请人工核对，禁止自动重试'):'';
  return Object.freeze({planState,badge,badgeSource,tone,
    timingText:formatScheduleRule(plan)+' · '+nextText,
    recentText,recentTone:recent?resultTones[recent.status]||'muted':'neutral',
    lastFireStatus:recent?.status||null});
}
