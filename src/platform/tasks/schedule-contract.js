import {invariant} from '../protocol.js';
import {validateTrigger} from './schedule-time.js';
export const SCHEDULE_ALARM_PREFIX='opendesk.schedule.v1:';
export const SCHEDULE_DEFINITION_PREFIX='schedule:def:v1:';
export const SCHEDULE_FIRE_PREFIX='schedule:fire:v1:';
const ID=/^[a-zA-Z0-9_-]{1,48}$/;
export const scheduleKey=id=>{invariant(typeof id==='string'&&ID.test(id),'E_SCHEMA','Invalid schedule id');return SCHEDULE_DEFINITION_PREFIX+id;};
export const scheduleFireId=(id,generation,at)=>{
  scheduleKey(id);
  invariant(Number.isSafeInteger(generation)&&generation>0&&Number.isSafeInteger(at)&&at>=0,'E_SCHEMA');
  return `sched:${id}:${generation}:${at}`;
};
export const fireKey=fireId=>{
  invariant(typeof fireId==='string'&&/^sched:[a-zA-Z0-9_-]{1,48}:[1-9]\d*:\d{1,16}$/.test(fireId)&&
    fireId.length<100,'E_SCHEMA','Invalid fire id');
  return SCHEDULE_FIRE_PREFIX+fireId;
};
export function validateScheduleInput(value){
  const allowed=['scheduleId','expectedGeneration','title','taskId','version','manifestHash','sourceHash',
    'installationId','taskGeneration','params','targetUrl','openIfMissing','timezone','triggerKind',
    'triggerSpec','misfirePolicy','startDeadlineMs','paused'];
  const required=allowed.slice(2);
  invariant(value&&typeof value==='object'&&!Array.isArray(value)&&
    Object.keys(value).every(k=>allowed.includes(k))&&required.every(k=>Object.hasOwn(value,k)),
    'E_SCHEMA','Invalid schedule definition fields');
  if(value.scheduleId!==undefined)scheduleKey(value.scheduleId);
  invariant(value.expectedGeneration===undefined||value.expectedGeneration===null||
    Number.isSafeInteger(value.expectedGeneration)&&value.expectedGeneration>=1,'E_SCHEMA');
  invariant(typeof value.title==='string'&&value.title.trim()===value.title&&
    value.title.length>=1&&value.title.length<=100,'E_SCHEMA','Invalid schedule title');
  invariant(typeof value.taskId==='string'&&value.taskId.length>=1&&value.taskId.length<=60&&
    typeof value.version==='string'&&/^\d+\.\d+\.\d+$/.test(value.version)&&value.version.length<=24,'E_SCHEMA');
  invariant([value.manifestHash,value.sourceHash].every(x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)),'E_SCHEMA');
  invariant(typeof value.installationId==='string'&&/^[a-f0-9-]{36}$/.test(value.installationId)&&
    Number.isSafeInteger(value.taskGeneration)&&value.taskGeneration>0,'E_SCHEMA','Invalid installation');
  invariant(value.params&&typeof value.params==='object'&&!Array.isArray(value.params)&&
    JSON.stringify(value.params).length<=8192,'E_SCHEMA','Oversized parameters');
  let target;try{target=new URL(value.targetUrl);}catch{invariant(false,'E_TARGET','Invalid schedule URL');}
  invariant(['http:','https:'].includes(target.protocol)&&!target.username&&!target.password&&
    !target.hash&&target.href===value.targetUrl&&value.targetUrl.length<=2048,'E_TARGET','Exact HTTP(S) URL required');
  invariant(typeof value.openIfMissing==='boolean'&&typeof value.paused==='boolean'&&
    ['skip','latest-within-hour'].includes(value.misfirePolicy)&&
    Number.isSafeInteger(value.startDeadlineMs)&&value.startDeadlineMs>=60000&&
    value.startDeadlineMs<=3600000,'E_SCHEMA');
  validateTrigger(value.triggerKind,value.triggerSpec,value.timezone);
  return structuredClone(value);
}
