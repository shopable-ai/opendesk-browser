import {validateTaskIntent,isPlainTaskRecord as plain,hasOnlyTaskKeys as own,
  TASK_ID_PATTERN as taskIdPattern,TASK_CANDIDATE_TOKEN_PATTERN as token,
  normalizeTaskArgs as genericArgs,isValidTaskTarget as validTarget}
  from '../../projects/webflow/src/task-intent-contract.js';
// ChatGPT DOM text is a candidate only. This parser has no capability to approve or run tasks.
export const CHATGPT_TASK_REQUEST_KIND='opendesk.task.request';
export const CHATGPT_TASK_REQUEST_PROTOCOL='opendesk.task.request.v1';
export const BAIDU_TASK_ID='baidu.search.top3';
export const FIXED_PAGE_TASK_ID='page.read.fixed';
export const FIXED_PAGE_URL='https://httpbingo.org/html';
const fail=(code,message)=>Object.assign(new Error(message),{code});
const versionPattern=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const hashPattern=/^[a-f0-9]{64}$/u;
const installationKeys=['version','manifestHash','scriptId','revision','contentHash','installationId','generation'];
// Structural normalization only; the Host checks the installed manifest and params schema.
export function normalizeChatGPTTaskInstallation(value,taskId){
  if(!own(value,installationKeys)||Object.keys(value).length!==installationKeys.length||
    typeof value.version!=='string'||value.version.length>24||!versionPattern.test(value.version)||
    value.scriptId!==`task:${taskId}:${value.version}`||
    typeof value.manifestHash!=='string'||!hashPattern.test(value.manifestHash)||
    typeof value.contentHash!=='string'||!hashPattern.test(value.contentHash)||
    !Number.isSafeInteger(value.revision)||value.revision<1||
    !Number.isSafeInteger(value.generation)||value.generation<1||
    typeof value.installationId!=='string'||!value.installationId||value.installationId.length>128||
    value.installationId.trim()!==value.installationId||/[\u0000-\u001f\u007f]/u.test(value.installationId))
    throw fail('E_BRIDGE_SCHEMA','任务安装快照不合法');
  return Object.freeze(Object.fromEntries(installationKeys.map(key=>[key,value[key]])));
}
export function validateChatGPTTaskRequest(text){
  if(typeof text!=='string'||text.length>4096)throw fail('E_BRIDGE_LIMIT','任务请求超出长度限制');
  let candidate;
  try{candidate=JSON.parse(text);}catch{throw fail('E_BRIDGE_FORMAT','任务请求必须是完整 JSON');}
  if(!own(candidate,['protocol','kind','version','requestId','taskId','args','targetUrl','installation'])||
    candidate.protocol!==CHATGPT_TASK_REQUEST_PROTOCOL||
    candidate.kind!==CHATGPT_TASK_REQUEST_KIND||candidate.version!==1||
    typeof candidate.requestId!=='string'||!token.test(candidate.requestId))
    throw fail('E_BRIDGE_SCHEMA','任务协议、请求身份或字段不合法');
  if(typeof candidate.taskId!=='string'||!taskIdPattern.test(candidate.taskId))
    throw fail('E_BRIDGE_SCHEMA','任务 ID 不合法');
  const installed=Object.hasOwn(candidate,'targetUrl')||Object.hasOwn(candidate,'installation');
  if(installed){
    if(!validTarget(candidate.targetUrl))throw fail('E_BRIDGE_SCHEMA','任务目标地址不合法');
    const installation=normalizeChatGPTTaskInstallation(candidate.installation,candidate.taskId);
    return Object.freeze({protocol:candidate.protocol,kind:candidate.kind,version:1,
      requestId:candidate.requestId,taskId:candidate.taskId,args:genericArgs(candidate.args),
      targetUrl:candidate.targetUrl,installation});
  }
  const baidu=candidate.taskId===BAIDU_TASK_ID;
  if(baidu?(!own(candidate.args,['query','limit'])||Object.keys(candidate.args).length!==2||
    candidate.args.limit!==3||typeof candidate.args.query!=='string'||
    candidate.args.query.trim()!==candidate.args.query||!candidate.args.query||
    candidate.args.query.length>120||/[\u0000-\u001f\u007f]/u.test(candidate.args.query)):
    !(candidate.taskId===FIXED_PAGE_TASK_ID&&own(candidate.args,[])&&Object.keys(candidate.args).length===0))
    throw fail('E_BRIDGE_SCHEMA','任务 ID 或受限参数不符合已支持的固定任务');
  return Object.freeze({protocol:candidate.protocol,kind:candidate.kind,version:1,
    requestId:candidate.requestId,taskId:candidate.taskId,
    args:Object.freeze(baidu?{query:candidate.args.query,limit:3}:{})});
}
// No requestId-derived permissions or URL-derived grants. The caller must enforce the
// already-approved source tab/document/turn, installation pin and one-use admission.
export function baiduSearchTarget(request){
  if(request?.taskId!==BAIDU_TASK_ID||request.args?.limit!==3)
    throw fail('E_BRIDGE_SCHEMA','不是受限百度任务');
  const valid=validateChatGPTTaskRequest(JSON.stringify(request));
  return 'https://www.baidu.com/s?wd='+encodeURIComponent(valid.args.query);
}
export function fixedPageReadTarget(request){
  if(validateChatGPTTaskRequest(JSON.stringify(request)).taskId!==FIXED_PAGE_TASK_ID)
    throw fail('E_BRIDGE_SCHEMA','不是固定网页读取任务');
  return FIXED_PAGE_URL;
}

// Historical ChatGPT request / installation checks remain local. Intent parsing has one implementation.
export const CHATGPT_TASK_INTENT_PROTOCOL='opendesk.task.intent.v1';
export {WEBFLOW_TASK_INTENT_PROTOCOL,WEBFLOW_TASK_INTENT_V2_PROTOCOL,
  validateWebFlowTaskIntent,validateWebFlowTaskIntentV2}
  from '../../projects/webflow/src/task-intent-contract.js';
export function validateChatGPTTaskIntent(text){
  return validateTaskIntent(text,CHATGPT_TASK_INTENT_PROTOCOL);
}
