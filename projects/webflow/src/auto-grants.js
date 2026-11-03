// First-party trigger policy, statically consumed by the existing trusted Bridge.
// This data never grants Controller/site permissions and is not a sandbox API.
import {validateChatGPTTaskRequest,CHATGPT_TASK_REQUEST_PROTOCOL} from '../../../src/native-agent/chatgpt-task-request.js';

export const WEBFLOW_AUTO_GRANTS_KEY='opendesk.webflow.auto-trigger-grants.v1';
const fail=()=>Object.assign(new Error('持续自动批准缺失、关闭、已撤销或与当前安装及精确范围不符'),{code:'E_WEBFLOW_AUTO_DENIED'});
export const emptyAutoSettings=()=>({version:1,enabled:false,epoch:0,grants:{}});
export function normalizeAutoScope(value){
  const checked=validateChatGPTTaskRequest(JSON.stringify({protocol:CHATGPT_TASK_REQUEST_PROTOCOL,
    kind:'opendesk.task.request',version:1,requestId:'00000000-0000-4000-8000-000000000000',
    taskId:value?.taskId,args:value?.args,targetUrl:value?.targetUrl,installation:value?.installation}));
  if(!checked.installation)throw fail();
  return {taskId:checked.taskId,args:{...checked.args},targetUrl:checked.targetUrl,installation:{...checked.installation}};
}
export function validateAutoSettings(value){
  if(value===undefined)return emptyAutoSettings();
  if(!value||value.version!==1||typeof value.enabled!=='boolean'||
    !Number.isSafeInteger(value.epoch)||value.epoch<0||!value.grants||Array.isArray(value.grants)||
    Object.getPrototypeOf(value.grants)!==Object.prototype||Object.keys(value.grants).length>128)throw fail();
  for(const [taskId,row] of Object.entries(value.grants)){
    if(!row||row.scope?.taskId!==taskId||typeof row.grantId!=='string'||!row.grantId||
      !['active','revoked'].includes(row.state)||!Number.isSafeInteger(row.approvedAt)||row.approvedAt<0)throw fail();
    normalizeAutoScope(row.scope);
  }
  return structuredClone(value);
}
export function assertAutoGrant(settings,scope,{grantId,epoch}={}){
  const canonical=normalizeAutoScope(scope),grant=settings.grants[canonical.taskId];
  if(settings.enabled!==true||!grant||grant.state!=='active'||
    grantId!==undefined&&grant.grantId!==grantId||epoch!==undefined&&settings.epoch!==epoch||
    JSON.stringify(normalizeAutoScope(grant.scope))!==JSON.stringify(canonical))throw fail();
  return grant;
}
