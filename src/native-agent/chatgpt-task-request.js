// ChatGPT DOM text is a candidate only. This parser has no capability to approve or run tasks.
export const CHATGPT_TASK_REQUEST_KIND='opendesk.task.request';
export const CHATGPT_TASK_REQUEST_PROTOCOL='opendesk.task.request.v1';
export const BAIDU_TASK_ID='baidu.search.top3';
const fail=(code,message)=>Object.assign(new Error(message),{code});
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const own=(obj,names)=>plain(obj)&&Object.keys(obj).every(k=>names.includes(k));
const token=/^[a-zA-Z0-9._:-]{8,128}$/u;
export function validateChatGPTTaskRequest(text){
  if(typeof text!=='string'||text.length>4096)throw fail('E_BRIDGE_LIMIT','任务请求超出长度限制');
  let candidate;
  try{candidate=JSON.parse(text);}catch{throw fail('E_BRIDGE_FORMAT','任务请求必须是完整 JSON');}
  if(!own(candidate,['protocol','kind','version','requestId','taskId','args'])||
    candidate.protocol!==CHATGPT_TASK_REQUEST_PROTOCOL||
    candidate.kind!==CHATGPT_TASK_REQUEST_KIND||candidate.version!==1||
    typeof candidate.requestId!=='string'||!token.test(candidate.requestId)||
    candidate.taskId!==BAIDU_TASK_ID||!own(candidate.args,['query','limit'])||
    Object.keys(candidate.args).length!==2||candidate.args.limit!==3||
    typeof candidate.args.query!=='string'||candidate.args.query.trim()!==candidate.args.query||
    !candidate.args.query||candidate.args.query.length>120||
    /[\u0000-\u001f\u007f]/u.test(candidate.args.query))
    throw fail('E_BRIDGE_SCHEMA','只接受固定百度搜索任务、有效关键词和 limit=3');
  return Object.freeze({protocol:candidate.protocol,kind:candidate.kind,version:1,
    requestId:candidate.requestId,taskId:BAIDU_TASK_ID,
    args:Object.freeze({query:candidate.args.query,limit:3})});
}
// No requestId-derived permissions or URL-derived grants. The caller must enforce the
// already-approved source tab/document/turn, installation pin and one-use admission.
export function baiduSearchTarget(request){
  if(request?.taskId!==BAIDU_TASK_ID||request.args?.limit!==3)
    throw fail('E_BRIDGE_SCHEMA','不是受限百度任务');
  const valid=validateChatGPTTaskRequest(JSON.stringify(request));
  return `https://www.baidu.com/s?wd=${encodeURIComponent(valid.args.query)}`;
}
