import {canonical,invariant} from '../../platform/protocol.js';
import {normalizeDelegatedTask} from '../../platform/tasks/delegation-contract.js';

// Source metadata is covered by the original source/manifest/package hashes.
// It grants only a request for the original trusted approval UI, never a Run.
export const PAGE_TASK_ACTION='page-task';
export const PAGE_TASK_MARKER='@opendesk-task';
export function normalizePageTaskDelegations(value){
  invariant(Array.isArray(value)&&value.length>0&&value.length<=8,'E_PAGE_TASK_SCOPE');
  const rows=value.map(row=>{
    invariant(row&&Object.getPrototypeOf(row)===Object.prototype&&
      Object.keys(row).sort().join(',')==='contentHash,manifestHash,targetUrl,taskId,version','E_PAGE_TASK_SCOPE');
    const {targetUrl,...pin}=row;
    const task=normalizeDelegatedTask(pin);
    let url;try{url=new URL(targetUrl);}catch{}
    invariant(typeof targetUrl==='string'&&targetUrl.length<=2048&&url&&
      ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!url.hash&&
      url.href===targetUrl,'E_PAGE_TASK_SCOPE');
    return Object.freeze({...task,targetUrl});
  });
  invariant(new Set(rows.map(row=>row.taskId)).size===rows.length,'E_PAGE_TASK_SCOPE');
  return Object.freeze(rows);
}
export function readPageTaskDelegations(sourceUtf8){
  const lines=String(sourceUtf8).split('\n').filter(line=>/^\s*\/\/\s*@opendesk-task(?:\s|$)/u.test(line));
  if(!lines.length)return [];
  const rows=lines.map(line=>{
    let value;try{value=JSON.parse(line.replace(/^\s*\/\/\s*@opendesk-task\s*/u,''));}catch{}
    invariant(value,'E_PAGE_TASK_SCOPE');return value;
  });
  return normalizePageTaskDelegations(rows);
}
export const samePageTaskPin=(a,b)=>canonical(a)===canonical(b);
