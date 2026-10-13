import {invariant} from '../protocol.js';
const finite=value=>Number.isSafeInteger(value)&&value>=0&&value<=8640000000000000;
const formatters=new Map();
function civil(zone,at){
  let formatter=formatters.get(zone);
  if(!formatter){
    formatter=new Intl.DateTimeFormat('en-US-u-ca-gregory',{timeZone:zone,hourCycle:'h23',
      year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
    formatters.set(zone,formatter);
  }
  return Object.fromEntries(formatter.formatToParts(new Date(at))
    .filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));
}
const nominal=c=>Date.UTC(c.year,c.month-1,c.day,c.hour??0,c.minute??0);
function dayOffset(c,delta){
  const d=new Date(Date.UTC(c.year,c.month-1,c.day+delta));
  return {year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate()};
}
function exact(zone,c){
  const wanted=nominal(c), offsets=new Set();
  for(const hours of [-36,-12,0,12,36]){
    const probe=wanted+hours*3600000, seen=civil(zone,probe);
    offsets.add(nominal(seen)-Math.floor(probe/60000)*60000);
  }
  return [...offsets].map(o=>wanted-o).filter(at=>{
    if(!finite(at))return false;
    const found=civil(zone,at);
    return ['year','month','day','hour','minute'].every(k=>found[k]===c[k]);
  }).sort((a,b)=>a-b)[0]??null;
}
function wall(zone,day,hour,minute){
  const intended={...day,hour,minute};
  const value=exact(zone,intended);
  if(value!==null)return value; // Fold: first instant wins.
  for(let step=1;step<=180;step++){ // Gap: advance to first real local minute.
    const d=new Date(nominal(intended)+step*60000);
    const next={year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate(),
      hour:d.getUTCHours(),minute:d.getUTCMinutes()};
    const found=exact(zone,next);
    if(found!==null)return found;
  }
  invariant(false,'E_SCHEMA','Unsupported time zone transition');
}
export function validateTrigger(kind,rule,zone){
  invariant(typeof zone==='string'&&zone.length<=80&&(zone==='UTC'||zone.includes('/')),'E_SCHEMA','IANA time zone required');
  try{new Intl.DateTimeFormat('en-US',{timeZone:zone});}
  catch{invariant(false,'E_SCHEMA','Unknown time zone');}
  invariant(['once','daily','weekly','interval'].includes(kind),'E_SCHEMA','Unknown trigger kind');
  invariant(rule&&typeof rule==='object'&&!Array.isArray(rule),'E_SCHEMA');
  const keys=kind==='once'?['at']:kind==='interval'?['anchorAt','everyMinutes']:
    kind==='weekly'?['days','hour','minute']:['hour','minute'];
  invariant(Object.keys(rule).length===keys.length&&keys.every(k=>Object.hasOwn(rule,k)),'E_SCHEMA','Invalid trigger fields');
  if(kind==='once')invariant(finite(rule.at),'E_SCHEMA');
  else if(kind==='interval')invariant(finite(rule.anchorAt)&&Number.isSafeInteger(rule.everyMinutes)&&
    rule.everyMinutes>=1&&rule.everyMinutes<=10080,'E_SCHEMA');
  else{
    invariant(Number.isInteger(rule.hour)&&rule.hour>=0&&rule.hour<=23&&
      Number.isInteger(rule.minute)&&rule.minute>=0&&rule.minute<=59,'E_SCHEMA');
    if(kind==='weekly')invariant(Array.isArray(rule.days)&&rule.days.length>=1&&rule.days.length<=7&&
      new Set(rule.days).size===rule.days.length&&
      rule.days.every(d=>Number.isInteger(d)&&d>=0&&d<=6),'E_SCHEMA');
  }
  return true;
}
export function scheduleSpecFromExpression(schedule,timezone){
  invariant(schedule&&typeof schedule==='object'&&!Array.isArray(schedule)&&
    Object.keys(schedule).every(k=>['kind','expression'].includes(k))&&
    ['kind','expression'].every(k=>Object.hasOwn(schedule,k)),
    'E_SCHEMA','Invalid schedule expression');
  const kind=schedule.kind,expression=schedule.expression.trim();
  invariant(expression===schedule.expression&&expression.length>=1&&expression.length<=256,
    'E_SCHEMA','Invalid schedule expression');
  if(kind==='interval'){
    const match=expression.match(/^(\d+)(?:m|min|mins|minute|minutes)?$/);
    invariant(Boolean(match),'E_SCHEMA','Unsupported interval expression');
    const everyMinutes=Number(match[1]);
    const triggerSpec={anchorAt:0,everyMinutes};
    validateTrigger('interval',triggerSpec,timezone);
    return {triggerKind:'interval',triggerSpec};
  }
  if(kind==='once'){
    const at=Date.parse(expression);
    invariant(Number.isSafeInteger(at)&&new Date(at).toISOString()===expression,
      'E_SCHEMA','Once schedule requires an exact ISO timestamp');
    const triggerSpec={at};
    validateTrigger('once',triggerSpec,timezone);
    return {triggerKind:'once',triggerSpec};
  }
  if(kind==='daily'){
    const match=expression.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    invariant(Boolean(match),'E_SCHEMA','Daily schedule requires HH:mm');
    const triggerSpec={hour:Number(match[1]),minute:Number(match[2])};
    validateTrigger('daily',triggerSpec,timezone);
    return {triggerKind:'daily',triggerSpec};
  }
  if(kind==='weekly'){
    const match=expression.match(/^([0-6](?:,[0-6])*) ([01]\d|2[0-3]):([0-5]\d)$/);
    invariant(Boolean(match),'E_SCHEMA','Weekly schedule requires D[,D...] HH:mm with days 0-6');
    const days=match[1].split(',').map(Number);
    const triggerSpec={days,hour:Number(match[2]),minute:Number(match[3])};
    validateTrigger('weekly',triggerSpec,timezone);
    return {triggerKind:'weekly',triggerSpec};
  }
  invariant(false,'E_SCHEMA','Unsupported schedule kind');
}
export function nextScheduleAt(kind,rule,zone,after){
  validateTrigger(kind,rule,zone);
  invariant(finite(after),'E_SCHEMA','Invalid schedule clock');
  if(kind==='once')return rule.at>after?rule.at:null;
  if(kind==='interval'){
    const span=rule.everyMinutes*60000;
    const steps=after<rule.anchorAt?0:Math.floor((after-rule.anchorAt)/span)+1;
    const next=rule.anchorAt+steps*span;
    return finite(next)?next:null;
  }
  const local=civil(zone,after);
  for(let delta=0;delta<(kind==='weekly'?15:3);delta++){
    const day=dayOffset(local,delta);
    if(kind==='weekly'&&!rule.days.includes(new Date(Date.UTC(day.year,day.month-1,day.day)).getUTCDay()))continue;
    const next=wall(zone,day,rule.hour,rule.minute);
    if(next>after)return next;
  }
  invariant(false,'E_SCHEMA','No future time exists');
}
export function recentMissedAt(schedule,now){
  if(schedule.nextDueAt===null||schedule.nextDueAt>now)return null;
  let candidate=schedule.nextDueAt;
  if(candidate<now-3600000)
    candidate=nextScheduleAt(schedule.triggerKind,schedule.triggerSpec,schedule.timezone,now-3600001);
  if(candidate===null||candidate>now)return null;
  for(let n=0;n<100;n++){
    const next=nextScheduleAt(schedule.triggerKind,schedule.triggerSpec,schedule.timezone,candidate);
    if(next===null||next>now)return candidate;
    candidate=next;
  }
  invariant(false,'E_SCHEMA','Recovery window exceeded');
}

export function parseWallScheduleTime(zone,value){
  validateTrigger('daily',{hour:0,minute:0},zone);
  const match=typeof value==='string'&&value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  invariant(match,'E_SCHEMA','Invalid local date and time');
  const [year,month,day,hour,minute]=match.slice(1).map(Number);
  invariant(year>=1970&&year<=9999&&month>=1&&month<=12&&day>=1&&day<=31&&
    hour>=0&&hour<=23&&minute>=0&&minute<=59,'E_SCHEMA');
  const valid=new Date(Date.UTC(year,month-1,day));
  invariant(valid.getUTCFullYear()===year&&valid.getUTCMonth()+1===month&&
    valid.getUTCDate()===day,'E_SCHEMA','Invalid calendar day');
  return wall(zone,{year,month,day},hour,minute);
}
export function formatWallScheduleTime(zone,at){
  validateTrigger('daily',{hour:0,minute:0},zone);
  invariant(finite(at),'E_SCHEMA');
  const row=civil(zone,at),pad=n=>String(n).padStart(2,'0');
  return `${row.year}-${pad(row.month)}-${pad(row.day)}T${pad(row.hour)}:${pad(row.minute)}`;
}
