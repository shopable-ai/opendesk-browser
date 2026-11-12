// UI-only contract. Nothing in a Page USER_SCRIPT can grant Controller authority.
// The trusted transport must come from a reviewed extension capability, not a page global/event.
export const MAX_PROMPT=3000;
export const MAX_REPLY_BYTES=65536;
export const REQUEST_PROTOCOL='subagent.task.request.v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REF=/^[a-zA-Z0-9._:-]{8,128}$/;
// Keep the original WebFlow message-reference budget; these are not Run IDs.
const MESSAGE=/^[A-Za-z0-9:_-]{8,160}$/;
const CHAT_URL=/^https:\/\/chatgpt\.com\/c\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i;
const fail=(code,message)=>Object.assign(new Error(message),{code});
export function taskPrompt(value){
  if(typeof value!=='string'||!value.trim()||value.length>MAX_PROMPT)
    throw fail('E_SUBAGENT_PROMPT','请输入 1–3000 字符的任务。');
  return value;
}
export function taskRequestId(value){
  if(typeof value!=='string'||!UUID.test(value))throw fail('E_SUBAGENT_ID','请求身份无效');
  return value;
}
export function taskRequest({requestId,prompt}){
  return Object.freeze({protocol:REQUEST_PROTOCOL,requestId:taskRequestId(requestId),prompt:taskPrompt(prompt)});
}
// Validates a normalized HOST-VERIFIED result. It cannot authenticate arbitrary
// website data. Call this ONLY after the trusted transport verifies Run/Result.
export function verifiedResult(result,requestId){
  if(!result||typeof result!=='object'||Array.isArray(result)||
    result.trust!=='host-verified'||result.requestId!==requestId||
    result.outcome!=='completed'||result.send!==true||result.status!=='reply-complete'||
    typeof result.runId!=='string'||!REF.test(result.runId)||
    typeof result.resultId!=='string'||!REF.test(result.resultId)||
    typeof result.userMessageRef!=='string'||!MESSAGE.test(result.userMessageRef)||
    typeof result.assistantMessageRef!=='string'||!MESSAGE.test(result.assistantMessageRef)||
    result.userMessageRef===result.assistantMessageRef||
    typeof result.replyText!=='string'||!result.replyText.trim()||
    new TextEncoder().encode(result.replyText).byteLength>MAX_REPLY_BYTES||
    typeof result.conversationUrl!=='string'||!CHAT_URL.test(result.conversationUrl))
    throw fail('E_SUBAGENT_RESULT','缺少与原请求匹配的可信完整结果');
  return Object.freeze({requestId,runId:result.runId,resultId:result.resultId,
    answer:result.replyText,conversationUrl:result.conversationUrl});
}
