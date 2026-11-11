// OD-AI-WORKFLOW-BRIDGE: data-only validation for immutable 0.3.0 results.
// No page-provided status constitutes approval, Controller identity or delivery.
const fail=(detail)=>{throw Object.assign(new Error(detail),{code:'E_CHAT_CREATE_RESULT'});};
const ROOT='https://chatgpt.com/';
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const MESSAGE=/^[A-Za-z0-9:_-]{8,160}$/u;
const DATE=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u;
const BASE=['kind','version','phase','status','send','messageConfirmed','conversationId',
  'conversationUrl','sourceUrl','promptChars','readbackConfirmed','observedAt'];
const REPLY=[...BASE,'userMessageRef','assistantMessageRef','replyText',
  'prepareRunId','prepareRequestId'];
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  Object.getPrototypeOf(v)===Object.prototype;
const token=v=>typeof v==='string'&&/^[A-Za-z0-9._:-]{8,128}$/u.test(v);
const shape=(v,names)=>{
  if(!plain(v)||Reflect.ownKeys(v).length!==names.length||
    names.some(k=>!Object.hasOwn(v,k)))fail('Unexpected result fields');
};
export function validateChatGPTCreateResultV3(value,args){
  if(!plain(args)||typeof args.prompt!=='string'||!args.prompt.trim()||
    args.prompt.length>3000||!['prepare','submit'].includes(args.phase)||
    Reflect.ownKeys(args).some(k=>!['prompt','phase','prepareRunId','prepareRequestId',
      'model','effort','thinking'].includes(k))||
    ['model','effort','thinking'].some(k=>Object.hasOwn(args,k))||
    (args.phase==='prepare'&&(Object.hasOwn(args,'prepareRunId')||
      Object.hasOwn(args,'prepareRequestId')))|| 
    (args.phase==='submit'&&(!token(args.prepareRunId)||!token(args.prepareRequestId))))
    fail('Task arguments were not approved for this phase');
  shape(value,args.phase==='prepare'?BASE:REPLY);
  if(value.kind!=='chatgpt.conversation.create.result'||value.version!==3||
    value.phase!==args.phase||value.sourceUrl!==ROOT||
    value.promptChars!==args.prompt.length||value.readbackConfirmed!==true||
    typeof value.observedAt!=='string'||!DATE.test(value.observedAt)||
    !Number.isFinite(Date.parse(value.observedAt))||
    new Date(value.observedAt).toISOString()!==value.observedAt)
    fail('Result does not match the reviewed Task inputs');
  if(args.phase==='prepare'){
    if(value.status!=='draft-prepared'||value.send!==false||
      value.messageConfirmed!==false||value.conversationId!==null||
      value.conversationUrl!==null)fail('Unsent B cannot claim a persistent conversation');
  }else{
    if(value.status!=='reply-complete'||value.send!==true||
      value.messageConfirmed!==true||typeof value.conversationId!=='string'||
      !UUID.test(value.conversationId)||value.conversationUrl!==ROOT+'c/'+value.conversationId||
      typeof value.userMessageRef!=='string'||!MESSAGE.test(value.userMessageRef)||
      typeof value.assistantMessageRef!=='string'||!MESSAGE.test(value.assistantMessageRef)||
      value.userMessageRef===value.assistantMessageRef||
      typeof value.replyText!=='string'||!value.replyText.trim()||
      new TextEncoder().encode(value.replyText).byteLength>65536||
      value.prepareRunId!==args.prepareRunId||
      value.prepareRequestId!==args.prepareRequestId)
      fail('Submitted B and full reply identity are not confirmed');
  }
  return Object.freeze({...value});
}
