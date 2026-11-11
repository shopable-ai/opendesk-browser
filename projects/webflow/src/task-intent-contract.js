// Provider-neutral WebFlow candidate structure only; no DOM, Host, Authority, grants or dispatch.
// Legacy V1 protocol consumers reuse this parser; WebFlow V1/V2 keep original strict duplicate-key checks.
export const WEBFLOW_TASK_INTENT_PROTOCOL='webflow.task.intent.v1';
export const WEBFLOW_TASK_INTENT_V2_PROTOCOL='webflow.task.intent.v2';

const fail=(code,message)=>Object.assign(new Error(message),{code});
export const isPlainTaskRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const plain=isPlainTaskRecord;
export const hasOnlyTaskKeys=(obj,names)=>plain(obj)&&Object.keys(obj).every(k=>names.includes(k));
const own=hasOnlyTaskKeys;
export const TASK_ID_PATTERN=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}$/u;
const taskIdPattern=TASK_ID_PATTERN;

export function normalizeTaskArgs(value){
  if(!plain(value)||Object.keys(value).length>16||
    !Object.entries(value).every(([key,item])=>/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/u.test(key)&&
      (typeof item==='string'&&item.length<=4096||typeof item==='boolean'||
        typeof item==='number'&&Number.isFinite(item))))
    throw fail('E_BRIDGE_SCHEMA','任务参数必须是受限的基本类型对象');
  return Object.freeze(Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])));
}
const genericArgs=normalizeTaskArgs;
export function isValidTaskTarget(value){
  if(typeof value!=='string'||value.length>2048||value.trim()!==value||
    !/^https?:\/\//u.test(value)||value.includes('#')||/[\u0000-\u0020\u007f]/u.test(value))return false;
  try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&!url.hash;}catch{return false;}
}
const validTarget=isValidTaskTarget;
export const TASK_CANDIDATE_TOKEN_PATTERN=/^[a-zA-Z0-9._:-]{8,128}$/u;
const token=TASK_CANDIDATE_TOKEN_PATTERN;

export function validateTaskIntent(text,protocol){
  if(typeof text!=='string'||text.length>4096)throw fail('E_BRIDGE_LIMIT','任务意图超出长度限制');
  let value;try{value=JSON.parse(text);}catch{throw fail('E_BRIDGE_FORMAT','任务意图必须是完整 JSON');}
  if(protocol===WEBFLOW_TASK_INTENT_PROTOCOL||protocol===WEBFLOW_TASK_INTENT_V2_PROTOCOL){
    // JSON.parse loses duplicate keys. Scan complete JSON strings and container
    // boundaries first, keeping a distinct key set for every object (also args).
    const objects=[];
    for(const match of text.matchAll(/"(?:[^"\\]|\\.)*"|[{}[\]]/gu)){
      const item=match[0];
      if(item==='{')objects.push(new Set());
      else if(item==='[')objects.push(null);
      else if(item==='}'||item===']')objects.pop();
      else if(text.slice(match.index+item.length).trimStart().startsWith(':')){
        const keys=objects.at(-1),key=JSON.parse(item);
        if(keys.has(key))throw fail('E_BRIDGE_FORMAT','任务意图不能包含重复字段');
        keys.add(key);
      }
    }
  }
  // V2 is a structural intent, NOT an authorization. The trusted layer must
  // resolve an installed and reviewed target before any Task execution.
  const v2=protocol===WEBFLOW_TASK_INTENT_V2_PROTOCOL;
  const fields=v2?['protocol','candidateId','taskId','args']:['protocol','candidateId','taskId','targetUrl','args'];
  if(!own(value,fields)||Object.keys(value).length!==fields.length||
    value.protocol!==protocol||typeof value.candidateId!=='string'||!token.test(value.candidateId)||
    typeof value.taskId!=='string'||!taskIdPattern.test(value.taskId)||
    (!v2&&!validTarget(value.targetUrl)))
    throw fail('E_BRIDGE_SCHEMA','任务意图字段、候选身份或目标不合法');
  return Object.freeze({protocol:value.protocol,candidateId:value.candidateId,taskId:value.taskId,
    ...(!v2?{targetUrl:value.targetUrl}:{}),args:genericArgs(value.args)});
}
export function validateWebFlowTaskIntent(text){
  return validateTaskIntent(text,WEBFLOW_TASK_INTENT_PROTOCOL);
}

// Deliberately separate: V1 approvals never imply V2 approval.
export function validateWebFlowTaskIntentV2(text){
  return validateTaskIntent(text,WEBFLOW_TASK_INTENT_V2_PROTOCOL);
}
