// First-party trigger policy, statically consumed by the existing trusted Bridge.
// This data never grants Controller/site permissions and is not a sandbox API.
import {validateChatGPTTaskRequest,CHATGPT_TASK_REQUEST_PROTOCOL} from '../../../src/native-agent/chatgpt-task-request.js';
import {validateTaskParams} from '../../../src/platform/tasks/contract.js';
import {autoParameterOptions} from './authorization-policy.js';

export const WEBFLOW_AUTO_GRANTS_KEY='opendesk.webflow.auto-trigger-grants.v1';
// Missing source in historical v1 data means the original ChatGPT-only grant.
// It never means the current website, a wildcard, or all registered profiles.
export const LEGACY_AUTO_SOURCE_ORIGIN='https://chatgpt.com';
const fail=()=>Object.assign(new Error('持续自动批准缺失、关闭、已撤销或与当前安装及精确范围不符'),{code:'E_WEBFLOW_AUTO_DENIED'});
function sourceOriginOf(value){
  if(typeof value!=='string'||value.length>2048)throw fail();
  try{
    const url=new URL(value);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.hostname.includes('*'))throw fail();
    return url.origin;
  }catch{throw fail();}
}
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?
  Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
export function normalizeAutoParameterPolicy(value,scope){
 if(value===undefined)return undefined; // Historical grants remain exact.
 if(!value||value.mode!=='schema'||Object.keys(value).some(key=>!['mode','variableKeys','paramsSchema'].includes(key))||
  !Array.isArray(value.variableKeys)||!value.variableKeys.length||new Set(value.variableKeys).size!==value.variableKeys.length)
  throw fail();
 const options=autoParameterOptions({taskId:scope.taskId,paramsSchema:value.paramsSchema});
 if(!options||value.variableKeys.some(key=>!options.variableKeys.includes(key)||!Object.hasOwn(scope.args,key)))throw fail();
 try{
  const checked=validateTaskParams(value.paramsSchema,scope.args);
  if(canonical(checked)!==canonical(scope.args))throw fail();
 }catch{throw fail();}
 return {mode:'schema',variableKeys:[...value.variableKeys].sort(),paramsSchema:structuredClone(value.paramsSchema)};
}
// Called with the resolved immutable installation, never an AI supplied schema.
export function prepareAutoParameterPolicy(value,scope,paramsSchema){
 if(value===undefined)return undefined;
 if(!value||value.paramsSchema!==undefined&&canonical(value.paramsSchema)!==canonical(paramsSchema))throw fail();
 return normalizeAutoParameterPolicy({...value,paramsSchema},scope);
}
export const emptyAutoSettings=()=>({version:1,enabled:false,epoch:0,grants:{}});
export function normalizeAutoScope(value){
  const sourceOrigin=Object.hasOwn(value??{},'sourceOrigin')?value.sourceOrigin:LEGACY_AUTO_SOURCE_ORIGIN;
  if(sourceOriginOf(sourceOrigin)!==sourceOrigin)throw fail();
  const checked=validateChatGPTTaskRequest(JSON.stringify({protocol:CHATGPT_TASK_REQUEST_PROTOCOL,
    kind:'opendesk.task.request',version:1,requestId:'00000000-0000-4000-8000-000000000000',
    taskId:value?.taskId,args:value?.args,targetUrl:value?.targetUrl,installation:value?.installation}));
  if(!checked.installation)throw fail();
  return {taskId:checked.taskId,args:{...checked.args},targetUrl:checked.targetUrl,installation:{...checked.installation},sourceOrigin};
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
    normalizeAutoParameterPolicy(row.parameterPolicy,row.scope);
  }
  return structuredClone(value);
}
export function assertAutoGrant(settings,scope,{grantId,epoch,sourceUrl}={}){
  const canonical=normalizeAutoScope(scope),grant=settings.grants[canonical.taskId];
  if(sourceOriginOf(sourceUrl)!==canonical.sourceOrigin||settings.enabled!==true||!grant||grant.state!=='active'||
    grantId!==undefined&&grant.grantId!==grantId||epoch!==undefined&&settings.epoch!==epoch||
    !matchesAutoScope(grant,canonical))throw fail();
  return grant;
}
function matchesAutoScope(grant,scope){
 const approved=normalizeAutoScope(grant.scope),policy=normalizeAutoParameterPolicy(grant.parameterPolicy,approved);
 if(canonical({...approved,args:{}})!==canonical({...scope,args:{}}))return false;
 if(!policy)return canonical(approved.args)===canonical(scope.args);
 try{
  if(canonical(validateTaskParams(policy.paramsSchema,scope.args))!==canonical(scope.args))return false;
 }catch{return false;}
 const fixed=args=>Object.fromEntries(Object.entries(args).filter(([key])=>!policy.variableKeys.includes(key)));
 return policy.variableKeys.every(key=>Object.hasOwn(scope.args,key))&&canonical(fixed(approved.args))===canonical(fixed(scope.args));
}
