import test from 'node:test';
import assert from 'node:assert/strict';
import {presentSchedulePlan,formatScheduleRule,formatScheduleTime}
  from '../../src/ui/schedule-plan-presentation.js';

const due=Date.parse('2026-10-18T00:00:00Z');
const base=(overrides={})=>({scheduleId:'test-plan',title:'每日任务',
  triggerKind:'daily',triggerSpec:{hour:9,minute:0},timezone:'Asia/Tokyo',
  paused:false,needsAttention:false,nextDueAt:due,...overrides});
const fire=(status,scheduledAt=due-86400000)=>({fireId:'fire-'+status,status,scheduledAt});

test('R33.3.14 recurring SUCCESS remains scheduled; only completed once may be complete',()=>{
  const repeat=presentSchedulePlan(base(),[fire('SUCCESS')]);
  assert.equal(repeat.planState,'已安排');
  assert.equal(repeat.badge,'已安排');
  assert.equal(repeat.frequencyText,'每天 09:00');
  assert.match(repeat.nextText,/下次/);
  assert.equal(repeat.timingText,repeat.frequencyText+' · '+repeat.nextText,
    'existing consumers keep their complete label while cards may separate fields');
  assert.match(repeat.recentText,/执行成功/);
  const pendingOnce=base({triggerKind:'once',nextDueAt:null,history:[fire('SETTLING')]});
  assert.equal(presentSchedulePlan(pendingOnce).badge,'正在结算');
  const completed=presentSchedulePlan({...pendingOnce,history:[fire('SUCCESS')]});
  assert.equal(completed.badge,'已完成');
  assert.equal(completed.tone,'positive');
  assert.equal(presentSchedulePlan(base({triggerKind:'once',nextDueAt:null})).badge,'暂无后续计划');
});

test('R33.3.14 Fire states do not silently pause or authorize a run',()=>{
  for(const status of ['FAILED','UNKNOWN','STOPPED','CANCELLED','MISSED']){
    const result=presentSchedulePlan(base(),[fire(status)]);
    assert.equal(result.planState,'已安排');
    assert.equal(result.badge,'已安排');
    assert.equal(result.lastFireStatus,status);
  }
  const unknown=presentSchedulePlan(base({nextDueAt:null}),[fire('UNKNOWN')]);
  assert.equal(unknown.badge,'结果待核对');
  assert.match(unknown.recentText,/禁止自动重试/);
  const failed=presentSchedulePlan(base(),[fire('FAILED')]);
  assert.equal(failed.recentTone,'negative');
  assert.equal(presentSchedulePlan(base({paused:true}),[fire('RUNNING')]).planState,'已暂停');
  assert.equal(presentSchedulePlan(base({needsAttention:true}),[fire('SUCCESS')]).badge,'需要处理');
  const running=presentSchedulePlan(base(),[fire('RUNNING')]);
  assert.equal(running.badge,'运行中');
  assert.equal(running.tone,'positive');
  assert.equal(running.recentTone,'positive');
  assert.equal(running.badgeSource,'fire');
  const admitted=presentSchedulePlan(base(),[fire('ADMITTED')]);
  assert.equal(admitted.badge,'已启动');
  assert.equal(admitted.tone,'info');
});

test('R33.3.14 display uses fixed time zone, no scheduler or Host access',()=>{
  assert.equal(formatScheduleRule(base()),'每天 09:00');
  assert.equal(formatScheduleRule(base({triggerKind:'weekly',triggerSpec:{days:[5,1],hour:18,minute:0}})),
    '每周一、五 18:00');
  assert.equal(formatScheduleRule(base({triggerKind:'interval',triggerSpec:{everyMinutes:15}})),
    '每隔 15 分钟');
  assert.match(formatScheduleTime(due,'Asia/Tokyo'),/09:00/);
  assert.equal(formatScheduleTime(null,'Asia/Tokyo'),'无后续触发');
  const original=base(),before=structuredClone(original);
  presentSchedulePlan(original,[fire('FAILED')]);
  assert.deepEqual(original,before);
});


test('R33.3.15-A ten presentation states separate plan, fire and host conditions',()=>{
  const once=overrides=>base({triggerKind:'once',nextDueAt:null,...overrides});
  const cases=[
    ['已安排',base(),[],                    '已安排','已安排',null],
    ['已暂停',base({paused:true}),[fire('SUCCESS')],'已暂停','已暂停','SUCCESS'],
    ['运行中',base(),[fire('RUNNING')],       '已安排','运行中','RUNNING'],
    ['已完成',once(),[fire('SUCCESS')],       '已完成','已完成','SUCCESS'],
    ['执行失败',once(),[fire('FAILED')],      '暂无后续计划','执行失败','FAILED'],
    ['需要处理',base({needsAttention:true}),[fire('NEEDS_ATTENTION')],
      '需要处理','需要处理','NEEDS_ATTENTION'],
    ['结果未知',once(),[fire('UNKNOWN')],     '暂无后续计划','结果待核对','UNKNOWN'],
    ['已错过',once(),[fire('MISSED')],        '暂无后续计划','已错过','MISSED'],
    ['等待运行条件',base(),[fire('WAITING_HOST')],
      '已安排','已安排','WAITING_HOST'],
    ['正在结算',once(),[fire('SETTLING')],    '暂无后续计划','正在结算','SETTLING']
  ];
  assert.equal(cases.length,10);
  for(const [name,plan,history,planState,badge,lastFireStatus] of cases){
    const result=presentSchedulePlan(plan,history);
    assert.equal(result.planState,planState,name+' plan lifecycle');
    assert.equal(result.badge,badge,name+' headline');
    assert.equal(result.lastFireStatus,lastFireStatus,name+' fire receipt');
  }
  const waiting=presentSchedulePlan(base(),[fire('WAITING_HOST')]);
  assert.match(waiting.recentText,/等待运行页/,'host waiting is visible separately from the plan');
  const unknown=presentSchedulePlan(once(),[fire('UNKNOWN')]);
  assert.match(unknown.recentText,/禁止自动重试/,'unknown effects need human review');
  const stopped=presentSchedulePlan(base(),[fire('STOPPED')]);
  assert.equal(stopped.planState,'已安排','stopping a single run must not pause the plan');
});
