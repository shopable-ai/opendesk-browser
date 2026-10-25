// ChatGPT DOM text is a candidate only. This parser has no capability to approve or run tasks.
export const CHATGPT_TASK_REQUEST_KIND='opendesk.task.request';
export const CHATGPT_TASK_REQUEST_PROTOCOL='opendesk.task.request.v1';
export const BAIDU_TASK_ID='baidu.search.top3';
export const FIXED_PAGE_TASK_ID='page.read.fixed';
export const FIXED_PAGE_URL='https://httpbingo.org/html';
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
    typeof candidate.requestId!=='string'||!token.test(candidate.requestId))
    throw fail('E_BRIDGE_SCHEMA','任务协议、请求身份或字段不合法');
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
