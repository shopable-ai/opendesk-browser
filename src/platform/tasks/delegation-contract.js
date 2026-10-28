import {canonical,invariant} from '../protocol.js';
const hash=/^[a-f0-9]{64}$/;
export const TASK_DELEGATION_OPERATIONS=Object.freeze(['tasks.start','tasks.read','tasks.stop']);
function fields(value,keys){
  invariant(value&&Object.getPrototypeOf(value)===Object.prototype&&
    Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k)),'E_SCHEMA');
}
export function normalizeDelegatedTask(value,installed=false){
  fields(value,['taskId','version','manifestHash','contentHash',...(installed?['installationId','generation']:[])]);
  invariant(['taskId','version','manifestHash','contentHash'].every(key=>typeof value[key]==='string')&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}$/.test(value.taskId)&&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value.version)&&
    hash.test(value.manifestHash)&&hash.test(value.contentHash),'E_SCHEMA');
  if(installed)invariant(typeof value.installationId==='string'&&/^[a-f0-9-]{36}$/.test(value.installationId)&&
    Number.isSafeInteger(value.generation)&&value.generation>0,'E_SCHEMA');
  return structuredClone(value);
}
export function normalizeTaskDelegations(value){
  invariant(Array.isArray(value)&&value.length>0&&value.length<=16,'E_SCHEMA');
  const rows=value.map(row=>normalizeDelegatedTask(row));
  invariant(new Set(rows.map(row=>row.taskId)).size===rows.length,'E_SCHEMA');
  return rows;
}
export function normalizeTaskDelegationRequest(operation,value){
  invariant(TASK_DELEGATION_OPERATIONS.includes(operation),'E_SCHEMA');
  if(operation==='tasks.read'&&Object.hasOwn(value||{},'taskId')){
    fields(value,['taskId']);
    invariant(typeof value.taskId==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}$/.test(value.taskId),'E_SCHEMA');
    return structuredClone(value);
  }
  fields(value,operation==='tasks.start'?['task','clientRequestId','params']:['clientRequestId']);
  invariant(typeof value.clientRequestId==='string'&&/^[A-Za-z0-9._:-]{1,80}$/.test(value.clientRequestId),'E_SCHEMA');
  if(operation==='tasks.start'){
    normalizeDelegatedTask(value.task,true);
    invariant(new TextEncoder().encode(canonical(value.params,{maxDepth:12})).byteLength<=8192,'E_BUDGET');
  }
  return structuredClone(value);
}
export function sameTaskPin(a,b){
  return ['taskId','version','manifestHash','contentHash'].every(key=>a?.[key]===b?.[key]);
}
