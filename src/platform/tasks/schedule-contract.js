import {invariant} from '../protocol.js';
import {scheduleSpecFromExpression,validateTrigger} from './schedule-time.js';
export const SCHEDULE_ALARM_PREFIX='opendesk.schedule.v1:';
export const SCHEDULE_DEFINITION_PREFIX='schedule:def:v1:';
export const SCHEDULE_FIRE_PREFIX='schedule:fire:v1:';
const ID=/^[a-zA-Z0-9_-]{1,48}$/;
const HASH=/^[a-f0-9]{64}$/;
const REVISION_STRING=/^[1-9][0-9]{0,15}$/;
export const scheduleKey=id=>{invariant(typeof id==='string'&&ID.test(id),'E_SCHEMA','Invalid schedule id');return SCHEDULE_DEFINITION_PREFIX+id;};
export const scheduleRef=id=>{scheduleKey(id);return id;};
export const scheduleIdFromRef=ref=>scheduleRef(ref);
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
  if(value?.profile==='app-service')return validateAppServiceScheduleInput(value);
  const allowed=['scheduleId','expectedGeneration','title','taskId','version','manifestHash','sourceHash',
    'installationId','taskGeneration','revision','params','targetUrl','openIfMissing','timezone','triggerKind',
    'triggerSpec','misfirePolicy','startDeadlineMs','paused','owner'];
  const required=allowed.slice(2);
  required.splice(required.indexOf('revision'),1);
  required.splice(required.indexOf('owner'),1);
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
  invariant([value.manifestHash,value.sourceHash].every(x=>typeof x==='string'&&HASH.test(x)),'E_SCHEMA');
  invariant(typeof value.installationId==='string'&&/^[a-f0-9-]{36}$/.test(value.installationId)&&
    Number.isSafeInteger(value.taskGeneration)&&value.taskGeneration>0,'E_SCHEMA','Invalid installation');
  invariant(value.revision===undefined||Number.isSafeInteger(value.revision)&&value.revision>0,'E_SCHEMA','Invalid task revision');
  if(value.owner!==undefined)validateScheduleOwner(value.owner);
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
export function validateScheduleOwner(owner){
  const allowed=['kind','toolId','toolVersion','packageHash','epoch','installEpoch'];
  invariant(owner&&typeof owner==='object'&&!Array.isArray(owner)&&
    Object.keys(owner).every(k=>allowed.includes(k))&&
    ['kind','toolId','toolVersion','packageHash','epoch'].every(k=>Object.hasOwn(owner,k)),
    'E_SCHEMA','Invalid schedule owner');
  invariant(owner.kind==='installed-tool-owned','E_OWNER','Unsupported schedule owner');
  invariant(typeof owner.toolId==='string'&&/^[a-z][a-z0-9-]{1,39}$/.test(owner.toolId)&&
    typeof owner.toolVersion==='string'&&/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(owner.toolVersion)&&
    typeof owner.packageHash==='string'&&HASH.test(owner.packageHash),'E_OWNER','Invalid tool owner identity');
  invariant(owner.epoch===null||typeof owner.epoch==='string'&&owner.epoch.length>=1&&owner.epoch.length<=128,
    'E_OWNER','Invalid tool install epoch');
  invariant(owner.installEpoch===undefined||typeof owner.installEpoch==='string'&&
    owner.installEpoch.length>=1&&owner.installEpoch.length<=128,'E_OWNER','Invalid tool install epoch');
  return structuredClone({...owner,installEpoch:owner.installEpoch??String(owner.epoch??'initial-install')});
}
export function validateInstalledToolScheduleRequest(request){
  if(request&&Object.hasOwn(request,'service')){
    invariant(typeof request==='object'&&!Array.isArray(request)&&
      request.service==='background'&&Object.keys(request).length===2&&
      Object.hasOwn(request,'schedule'),'E_SCHEMA','Invalid background scheduler request');
    const schedule=request.schedule;
    invariant(schedule&&typeof schedule==='object'&&!Array.isArray(schedule)&&
      Object.keys(schedule).length===2&&Object.hasOwn(schedule,'kind')&&Object.hasOwn(schedule,'expression')&&
      ['interval','once','daily','weekly'].includes(schedule.kind)&&
      typeof schedule.expression==='string'&&schedule.expression.length>=1&&schedule.expression.length<=256,
      'E_SCHEMA','Invalid scheduler spec');
    return {service:'background',schedule:{kind:schedule.kind,expression:schedule.expression}};
  }
  invariant(request&&typeof request==='object'&&!Array.isArray(request)&&
    Object.keys(request).every(k=>['taskId','revision','schedule'].includes(k))&&
    ['taskId','revision','schedule'].every(k=>Object.hasOwn(request,k)),
    'E_SCHEMA','Invalid scheduler create request');
  invariant(typeof request.taskId==='string'&&request.taskId.length>=1&&request.taskId.length<=128&&
    typeof request.revision==='string'&&REVISION_STRING.test(request.revision)&&
    Number(request.revision)>0,'E_SCHEMA','Invalid task revision request');
  const schedule=request.schedule;
  invariant(schedule&&typeof schedule==='object'&&!Array.isArray(schedule)&&
    Object.keys(schedule).every(k=>['kind','expression'].includes(k))&&
    ['kind','expression'].every(k=>Object.hasOwn(schedule,k))&&
    typeof schedule.kind==='string'&&schedule.kind.length>=1&&schedule.kind.length<=128&&
    typeof schedule.expression==='string'&&schedule.expression.length>=1&&schedule.expression.length<=256,
    'E_SCHEMA','Invalid scheduler spec');
  return structuredClone(request);
}
export function validateAppServiceBinding(binding){
  const fields=['appId','packageHash','codeHash','generation','sourceIdentity'];
  invariant(binding&&typeof binding==='object'&&!Array.isArray(binding)&&
    Object.keys(binding).length===fields.length&&fields.every(key=>Object.hasOwn(binding,key))&&
    typeof binding.appId==='string'&&/^[a-z][a-z0-9-]{1,39}$/.test(binding.appId)&&
    [binding.packageHash,binding.codeHash].every(value=>typeof value==='string'&&HASH.test(value))&&
    typeof binding.generation==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(binding.generation),
    'E_SCHEMA','Invalid app service installation binding');
  const source=binding.sourceIdentity;
  invariant(source&&typeof source==='object'&&!Array.isArray(source)&&
    (source.kind==='local-reviewed'&&Object.keys(source).length===1||
      source.kind==='market'&&Object.keys(source).length===4&&
      typeof source.marketId==='string'&&source.marketId.length>=1&&source.marketId.length<=256&&
      typeof source.sha256==='string'&&HASH.test(source.sha256)&&
      typeof source.version==='string'&&/^\d+\.\d+\.\d+$/.test(source.version)),
    'E_SCHEMA','Invalid app service source identity');
  return structuredClone(binding);
}
function validateAppServiceScheduleInput(value){
  const required=['profile','appId','appBinding','owner','title','params','targetUrl','openIfMissing',
    'timezone','triggerKind','triggerSpec','misfirePolicy','startDeadlineMs','paused'];
  invariant(Object.keys(value).every(key=>[...required,'scheduleId','expectedGeneration'].includes(key))&&
    required.every(key=>Object.hasOwn(value,key)),'E_SCHEMA','Invalid app service schedule fields');
  if(value.scheduleId!==undefined)scheduleKey(value.scheduleId);
  invariant(value.expectedGeneration===undefined||value.expectedGeneration===null||
    Number.isSafeInteger(value.expectedGeneration)&&value.expectedGeneration>=1,'E_SCHEMA');
  const binding=validateAppServiceBinding(value.appBinding),owner=validateScheduleOwner(value.owner);
  invariant(value.appId===binding.appId&&owner.toolId===binding.appId&&
    owner.packageHash===binding.packageHash&&owner.epoch===binding.generation,
    'E_OWNER','App service owner differs from installation binding');
  invariant(typeof value.title==='string'&&value.title.trim()===value.title&&
    value.title.length>=1&&value.title.length<=100&&value.targetUrl===null&&value.openIfMissing===false&&
    value.params&&typeof value.params==='object'&&!Array.isArray(value.params)&&Object.keys(value.params).length===0&&
    typeof value.paused==='boolean'&&['skip','latest-within-hour'].includes(value.misfirePolicy)&&
    Number.isSafeInteger(value.startDeadlineMs)&&value.startDeadlineMs>=60000&&value.startDeadlineMs<=3600000,
    'E_SCHEMA','Invalid app service schedule');
  validateTrigger(value.triggerKind,value.triggerSpec,value.timezone);
  return structuredClone({...value,owner,appBinding:binding});
}
export function validateTrustedAppServiceScheduleIntent(intent,request){
  invariant(intent&&typeof intent==='object'&&!Array.isArray(intent)&&
    Object.keys(intent).length===2&&Object.hasOwn(intent,'request')&&
    intent.kind==='trusted-app-service-schedule-intent-v1',
    'E_USER_GESTURE_REQUIRED','A trusted app service schedule approval intent is required');
  const normalized=validateInstalledToolScheduleRequest(request);
  invariant(normalized.service==='background'&&
    JSON.stringify(validateInstalledToolScheduleRequest(intent.request))===JSON.stringify(normalized),
    'E_USER_GESTURE_REQUIRED','App service schedule approval does not match request');
  return normalized;
}
export function validateTrustedScheduleIntent(intent,request){
  const allowed=['kind','request','task','schedule'];
  invariant(intent&&typeof intent==='object'&&!Array.isArray(intent)&&
    Object.keys(intent).every(k=>allowed.includes(k))&&allowed.every(k=>Object.hasOwn(intent,k))&&
    intent.kind==='trusted-scheduler-create-intent-v1',
    'E_USER_GESTURE_REQUIRED','A trusted scheduler approval intent is required');
  invariant(JSON.stringify(validateInstalledToolScheduleRequest(intent.request))===
    JSON.stringify(validateInstalledToolScheduleRequest(request)),
    'E_USER_GESTURE_REQUIRED','Scheduler approval intent does not match request');
  const task=intent.task,schedule=intent.schedule;
  invariant(task&&typeof task==='object'&&!Array.isArray(task)&&
    Object.keys(task).every(k=>['taskId','version','manifestHash','sourceHash','installationId',
      'generation','revision','targetUrl','params'].includes(k))&&
    ['taskId','version','manifestHash','sourceHash','installationId','generation',
      'revision','targetUrl','params'].every(k=>Object.hasOwn(task,k)),
    'E_SCHEMA','Invalid trusted task revision intent');
  invariant(schedule&&typeof schedule==='object'&&!Array.isArray(schedule)&&
    Object.keys(schedule).every(k=>['title','timezone','triggerKind','triggerSpec','misfirePolicy',
      'startDeadlineMs','openIfMissing','paused'].includes(k))&&
    ['title','timezone','triggerKind','triggerSpec','misfirePolicy','startDeadlineMs',
      'openIfMissing','paused'].every(k=>Object.hasOwn(schedule,k)),
    'E_SCHEMA','Invalid trusted scheduler intent');
  const taskRevision=typeof task.revision==='string'?Number(task.revision):task.revision;
  invariant(Number.isSafeInteger(taskRevision)&&taskRevision>0&&
    task.taskId===request.taskId&&String(taskRevision)===request.revision,
    'E_USER_GESTURE_REQUIRED','Scheduler approval intent is for another task revision');
  const derived=scheduleSpecFromExpression(request.schedule,schedule.timezone);
  invariant(derived.triggerKind===schedule.triggerKind&&
    JSON.stringify(derived.triggerSpec)===JSON.stringify(schedule.triggerSpec),
    'E_USER_GESTURE_REQUIRED','Scheduler approval intent does not match expression');
  return validateScheduleInput({title:schedule.title,taskId:task.taskId,version:task.version,
    manifestHash:task.manifestHash,sourceHash:task.sourceHash,installationId:task.installationId,
    taskGeneration:task.generation,revision:taskRevision,params:task.params,targetUrl:task.targetUrl,
    openIfMissing:schedule.openIfMissing,timezone:schedule.timezone,
    triggerKind:schedule.triggerKind,triggerSpec:schedule.triggerSpec,
    misfirePolicy:schedule.misfirePolicy,startDeadlineMs:schedule.startDeadlineMs,
    paused:schedule.paused});
}
